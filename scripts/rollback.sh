#!/usr/bin/env bash
# rollback.sh — Restore CosmosVote contract IDs from a pre-deployment backup.
#
# Usage:
#   ./rollback.sh                        # list available backups
#   ./rollback.sh <backup_file>          # restore from specific backup
#   ./rollback.sh --latest               # restore from most recent backup
#   ./rollback.sh --latest --non-interactive  # CI mode (see below)
#
# Flags:
#   --latest            Restore from the most recent backup file.
#   --non-interactive   CI mode: never prompt, never skip verification
#                       silently, and emit machine-readable status lines.
#                       Exit codes are stable for workflow detection:
#                         0 = rollback succeeded (and verified if possible)
#                         1 = rollback failed (bad backup, restore, or verify)
#                         2 = rollback applied but could not be verified
#                             (e.g. STELLAR_SECRET_KEY missing)
#
# What this script does:
#   1. Reads TOKEN_CONTRACT_ID and GOVERNANCE_CONTRACT_ID from the backup file.
#   2. Updates .env (or prints export commands if .env is absent).
#   3. Verifies the restored contracts still respond on-chain.
=======
#
# NOTE: Soroban contract deployments are irreversible on-chain. This script
# restores the *references* (contract IDs) in your environment so your
# application points back to the previously known-good contracts. It does NOT
# undeploy or modify any on-chain state.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$ROOT_DIR/logs/backups"
LOG_DIR="$ROOT_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/rollback_$(date +%Y%m%d_%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

log() {
  local level="$1"; shift
  echo "[$(date +%Y-%m-%dT%H:%M:%S)] [$level] $*"
}

trap 'log ERROR "Rollback failed at line $LINENO. Check $LOG_FILE for details."' ERR

# ─── Load environment ────────────────────────────────────────────────────────
if [[ -f "$ROOT_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
fi

STELLAR_SECRET_KEY="${STELLAR_SECRET_KEY:-}"
NETWORK="${NETWORK:-local}"

# ─── CI / non-interactive mode ───────────────────────────────────────────────
# Set via --non-interactive flag or ROLLBACK_NON_INTERACTIVE=1 env var.
NON_INTERACTIVE="${ROLLBACK_NON_INTERACTIVE:-0}"

# Emit a stable, greppable status line for CI log parsing.
status() {
  local state="$1"; shift
  echo "ROLLBACK_STATUS=${state} $*"
}

# ─── List backups helper ─────────────────────────────────────────────────────
list_backups() {
  if [[ ! -d "$BACKUP_DIR" ]] || [[ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]]; then
    log WARN "No backups found in $BACKUP_DIR"
    exit 0
  fi
  log INFO "Available backups:"
  ls -1t "$BACKUP_DIR"/*.env | while read -r f; do
    echo "  $f"
  done
}

# ─── Argument handling ───────────────────────────────────────────────────────
ARG=""
for arg in "$@"; do
  case "$arg" in
    --non-interactive) NON_INTERACTIVE=1 ;;
    --latest)          ARG="--latest" ;;
    -*)                log ERROR "Unknown flag: $arg"; exit 1 ;;
    *)                 ARG="$arg" ;;
  esac
done

if [[ -z "$ARG" ]]; then
  list_backups
  exit 0
fi

if [[ "$ARG" == "--latest" ]]; then
  BACKUP_FILE=$(ls -1t "$BACKUP_DIR"/*.env 2>/dev/null | head -1) \
    || { log ERROR "No backup files found in $BACKUP_DIR"; status FAILED reason=no_backups; exit 1; }
  log INFO "Using latest backup: $BACKUP_FILE"
else
  BACKUP_FILE="$ARG"
fi

[[ -f "$BACKUP_FILE" ]] || { log ERROR "Backup file not found: $BACKUP_FILE"; status FAILED reason=backup_not_found; exit 1; }
log INFO "Non-interactive mode: $NON_INTERACTIVE"

# ─── Parse backup ────────────────────────────────────────────────────────────
log INFO "Reading backup: $BACKUP_FILE"
cat "$BACKUP_FILE"

# shellcheck disable=SC1090
source "$BACKUP_FILE"

[[ -n "${TOKEN_CONTRACT_ID:-}" ]]      || { log ERROR "TOKEN_CONTRACT_ID missing in backup"; status FAILED reason=missing_token_id; exit 1; }
[[ -n "${GOVERNANCE_CONTRACT_ID:-}" ]] || { log ERROR "GOVERNANCE_CONTRACT_ID missing in backup"; status FAILED reason=missing_governance_id; exit 1; }

log INFO "Restoring:"
log INFO "  TOKEN_CONTRACT_ID=$TOKEN_CONTRACT_ID"
log INFO "  GOVERNANCE_CONTRACT_ID=$GOVERNANCE_CONTRACT_ID"

# ─── Update .env ─────────────────────────────────────────────────────────────
ENV_FILE="$ROOT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  # Update existing entries in-place; append if absent.
  for var in TOKEN_CONTRACT_ID GOVERNANCE_CONTRACT_ID; do
    val="${!var}"
    if grep -q "^${var}=" "$ENV_FILE"; then
      sed -i "s|^${var}=.*|${var}=${val}|" "$ENV_FILE"
    else
      echo "${var}=${val}" >> "$ENV_FILE"
    fi
  done
  log INFO ".env updated."
else
  log WARN ".env not found. Export these variables manually:"
  echo "  export TOKEN_CONTRACT_ID=$TOKEN_CONTRACT_ID"
  echo "  export GOVERNANCE_CONTRACT_ID=$GOVERNANCE_CONTRACT_ID"
fi

# ─── Verify restored contracts ───────────────────────────────────────────────
if [[ -z "$STELLAR_SECRET_KEY" ]]; then
  log WARN "STELLAR_SECRET_KEY not set; skipping on-chain verification."
  if [[ "$NON_INTERACTIVE" == "1" ]]; then
    # In CI we must not report success without verification; signal distinctly.
    log ERROR "Non-interactive mode requires STELLAR_SECRET_KEY for verification."
    status UNVERIFIED reason=missing_secret_key
    exit 2
  fi
  log INFO "Rollback complete (unverified). Set STELLAR_SECRET_KEY and re-run to verify."
  status UNVERIFIED reason=missing_secret_key
  exit 0
fi

case "$NETWORK" in
  local)
    RPC_URL="${STELLAR_RPC_URL:-http://localhost:8000}"
    PASSPHRASE="${STELLAR_NETWORK_PASSPHRASE:-Standalone Network ; February 2021}"
    ;;
  testnet)
    RPC_URL="https://soroban-testnet.stellar.org"
    PASSPHRASE="Test SDF Network ; September 2015"
    ;;
  mainnet)
    RPC_URL="https://soroban-mainnet.stellar.org"
    PASSPHRASE="Public Global Stellar Network ; September 2015"
    ;;
  *)
    log WARN "Unknown network '$NETWORK'; skipping on-chain verification."
    if [[ "$NON_INTERACTIVE" == "1" ]]; then
      log ERROR "Non-interactive mode requires a known NETWORK (local|testnet|mainnet)."
      status UNVERIFIED reason=unknown_network
      exit 2
    fi
    status UNVERIFIED reason=unknown_network
    exit 0
    ;;
esac

log INFO "Verifying token contract ($TOKEN_CONTRACT_ID)..."
stellar contract invoke \
  --id "$TOKEN_CONTRACT_ID" \
  --source "$STELLAR_SECRET_KEY" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$PASSPHRASE" \
  -- total_supply >/dev/null \
  || { log ERROR "Token contract ($TOKEN_CONTRACT_ID) did not respond. Verify the contract ID is correct for network '$NETWORK'."; status FAILED reason=token_verify_failed; exit 1; }

log INFO "Verifying governance contract ($GOVERNANCE_CONTRACT_ID)..."
stellar contract invoke \
  --id "$GOVERNANCE_CONTRACT_ID" \
  --source "$STELLAR_SECRET_KEY" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$PASSPHRASE" \
  -- get_proposal_count >/dev/null \
  || { log ERROR "Governance contract ($GOVERNANCE_CONTRACT_ID) did not respond. Verify the contract ID is correct for network '$NETWORK'."; status FAILED reason=governance_verify_failed; exit 1; }

log INFO "=== Rollback complete and verified ==="
log INFO "Full log saved to: $LOG_FILE"
status SUCCESS backup="$BACKUP_FILE"
exit 0
