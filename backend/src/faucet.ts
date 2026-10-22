import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { corsHeaders, isOriginAllowed } from './cors';
import {
  Contract,
  Keypair,
  Networks,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  rpc as SorobanRpc,
} from '@stellar/stellar-sdk';
import Database from 'better-sqlite3';

const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 2048;
const TESTNET_EXPLORER = 'https://stellar.expert/explorer/testnet/tx/';

export class FaucetClaimStore {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS faucet_claims (
        wallet_address TEXT PRIMARY KEY,
        claimed_at_ms INTEGER NOT NULL
      )
    `);
  }

  reserve(address: string, now = Date.now()): number | null {
    const cutoff = now - CLAIM_COOLDOWN_MS;
    const reserve = this.db.transaction(() => {
      this.db.prepare('DELETE FROM faucet_claims WHERE claimed_at_ms <= ?').run(cutoff);
      const result = this.db.prepare(
        'INSERT OR IGNORE INTO faucet_claims (wallet_address, claimed_at_ms) VALUES (?, ?)'
      ).run(address, now);
      return result.changes === 1;
    });

    if (reserve()) return null;
    const claim = this.db.prepare(
      'SELECT claimed_at_ms FROM faucet_claims WHERE wallet_address = ?'
    ).get(address) as { claimed_at_ms: number } | undefined;
    return claim ? claim.claimed_at_ms + CLAIM_COOLDOWN_MS : null;
  }

  release(address: string, claimedAt: number): void {
    this.db.prepare(
      'DELETE FROM faucet_claims WHERE wallet_address = ? AND claimed_at_ms = ?'
    ).run(address, claimedAt);
  }

  close(): void {
    this.db.close();
  }
}

export interface FaucetConfig {
  allowedOrigin: string;
  databasePath: string;
  tokenContractId: string;
  adminSecretKey: string;
  rpcUrl: string;
  amount: bigint;
  tokenDecimals: number;
}

export class FaucetMintError extends Error {
  constructor(message: string, readonly claimConsumed: boolean) {
    super(message);
    this.name = 'FaucetMintError';
  }
}

function tokenAmountDisplay(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = (amount % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

async function mintTestTokens(config: FaucetConfig, recipient: string): Promise<string> {
  const keypair = Keypair.fromSecret(config.adminSecretKey);
  const server = new SorobanRpc.Server(config.rpcUrl);
  let transactionSubmitted = false;

  try {
    const account = await server.getAccount(keypair.publicKey());
    const transaction = new TransactionBuilder(account, {
      fee: '100000',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(new Contract(config.tokenContractId).call(
        'mint',
        nativeToScVal(keypair.publicKey(), { type: 'address' }),
        nativeToScVal(recipient, { type: 'address' }),
        nativeToScVal(config.amount, { type: 'i128' }),
      ))
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(transaction);
    prepared.sign(keypair);
    const sent = await server.sendTransaction(prepared);
    if (sent.status === 'ERROR') {
      throw new FaucetMintError('The faucet transaction was rejected by Stellar RPC.', false);
    }
    transactionSubmitted = true;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const result = await server.getTransaction(sent.hash);
      if (result.status === 'SUCCESS') return sent.hash;
      if (result.status === 'FAILED') {
        throw new FaucetMintError('The faucet mint transaction failed on testnet.', false);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new FaucetMintError('The faucet transaction is still pending; check Stellar Expert before retrying.', true);
  } catch (error) {
    if (error instanceof FaucetMintError) throw error;
    throw new FaucetMintError(
      error instanceof Error ? error.message : 'Unable to mint test tokens.',
      transactionSubmitted,
    );
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new Error('Request body is too large.');
  }
  return JSON.parse(body);
}

export function createFaucetServer(
  config: FaucetConfig,
  store = new FaucetClaimStore(config.databasePath),
  mint: (config: FaucetConfig, recipient: string) => Promise<string> = mintTestTokens,
): Server {
  // Seed the runtime allowlist with the faucet's own origin so the single-origin
  // FAUCET_ALLOWED_ORIGIN path still works alongside the ALLOWED_ORIGINS list.
  const faucetOrigin = new URL(config.allowedOrigin).origin.toLowerCase();

  function originAllowed(origin: string | undefined): origin is string {
    if (!origin) return false;
    const normalised = origin.toLowerCase().replace(/\/+$/, '');
    return normalised === faucetOrigin || isOriginAllowed(origin);
  }

  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && !originAllowed(origin)) {
      sendJson(response, 403, { error: 'Origin not allowed.' });
      return;
    }
    if (origin) {
      corsHeaders(origin).forEach(([k, v]) => response.setHeader(k, v));
    } else {
      response.setHeader('Vary', 'Origin');
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method !== 'POST' || request.url !== '/api/faucet/claim') {
      sendJson(response, 404, { error: 'Not found.' });
      return;
    }
    if (!request.headers['content-type']?.includes('application/json')) {
      sendJson(response, 415, { error: 'Content-Type must be application/json.' });
      return;
    }

    let address: unknown;
    try {
      const body = await readJson(request);
      address = typeof body === 'object' && body !== null ? (body as { address?: unknown }).address : undefined;
    } catch {
      sendJson(response, 400, { error: 'Request body must be valid JSON under 2 KB.' });
      return;
    }
    if (typeof address !== 'string' || !StrKey.isValidEd25519PublicKey(address)) {
      sendJson(response, 400, { error: 'A valid Stellar public wallet address is required.' });
      return;
    }

    const now = Date.now();
    const retryAt = store.reserve(address, now);
    if (retryAt !== null) {
      response.setHeader('Retry-After', Math.max(1, Math.ceil((retryAt - now) / 1000)));
      sendJson(response, 429, { error: 'This wallet has already claimed test tokens in the last 24 hours.', retryAt });
      return;
    }

    try {
      const transactionHash = await mint(config, address);
      sendJson(response, 200, {
        amount: tokenAmountDisplay(config.amount, config.tokenDecimals),
        symbol: 'VOTE',
        transactionHash,
        explorerUrl: `${TESTNET_EXPLORER}${transactionHash}`,
      });
    } catch (error) {
      if (!(error instanceof FaucetMintError) || !error.claimConsumed) {
        store.release(address, now);
      }
      sendJson(response, 502, {
        error: error instanceof Error ? error.message : 'Faucet mint failed.',
      });
    }
  });
}

export function readFaucetConfig(env: NodeJS.ProcessEnv): FaucetConfig | null {
  if (env.FAUCET_ENABLED !== 'true') return null;
  const required = [
    'FAUCET_ALLOWED_ORIGIN',
    'FAUCET_TOKEN_CONTRACT_ID',
    'FAUCET_ADMIN_SECRET_KEY',
  ] as const;
  const missing = required.filter(key => !env[key]);
  if (missing.length) throw new Error(`Faucet is enabled but missing: ${missing.join(', ')}`);

  const amount = BigInt(env.FAUCET_AMOUNT ?? '1000000000');
  if (amount <= 0n || amount > (1n << 127n) - 1n) {
    throw new Error('FAUCET_AMOUNT must be a positive i128 integer in base units.');
  }
  const tokenDecimals = Number(env.FAUCET_TOKEN_DECIMALS ?? '7');
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 18) {
    throw new Error('FAUCET_TOKEN_DECIMALS must be an integer between 0 and 18.');
  }
  const allowedOrigin = new URL(env.FAUCET_ALLOWED_ORIGIN!).origin;
  if (new URL(env.FAUCET_ALLOWED_ORIGIN!).protocol !== 'https:' && env.NODE_ENV === 'production') {
    throw new Error('FAUCET_ALLOWED_ORIGIN must use HTTPS in production.');
  }
  const adminSecretKey = env.FAUCET_ADMIN_SECRET_KEY!;
  if (Keypair.fromSecret(adminSecretKey).publicKey().length !== 56) {
    throw new Error('FAUCET_ADMIN_SECRET_KEY is invalid.');
  }
  const tokenContractId = env.FAUCET_TOKEN_CONTRACT_ID!;
  if (!StrKey.isValidContract(tokenContractId)) throw new Error('FAUCET_TOKEN_CONTRACT_ID is invalid.');
  const rpcUrl = new URL(env.FAUCET_RPC_URL ?? 'https://soroban-testnet.stellar.org');
  if (!['https:', ...(env.NODE_ENV === 'production' ? [] : ['http:'])].includes(rpcUrl.protocol)) {
    throw new Error('FAUCET_RPC_URL must use HTTPS in production.');
  }

  return {
    allowedOrigin,
    databasePath: env.FAUCET_DB_PATH ?? '/data/faucet.sqlite',
    tokenContractId,
    adminSecretKey,
    rpcUrl: rpcUrl.toString(),
    amount,
    tokenDecimals,
  };
}