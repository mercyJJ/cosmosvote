.PHONY: all build test fmt fmt-check lint clean doc check

# Default target
all: build

## Build WASM binaries for all contracts
build:
	cargo build --release --target wasm32-unknown-unknown

## Run all unit and property-based tests
test:
	cargo test --all --features testutils

## Run tests with output
test-verbose:
	cargo test --all --features testutils -- --nocapture

## Run tests for governance contract only
test-governance:
	cargo test -p cosmosvote-governance --features testutils

## Run tests for token contract only
test-token:
	cargo test -p cosmosvote-token --features testutils

## Run property-based tests only
test-prop:
	cargo test prop_ --all --features testutils

## Run integration tests only
test-integration:
	cargo test -p cosmosvote-governance --test delegation_vote_weight_tests --features testutils

## Format code
fmt:
	cargo fmt --all

## Check formatting without modifying files
fmt-check:
	cargo fmt --all -- --check

## Run Clippy linter
lint:
	cargo clippy --all-targets --all-features -- -D warnings

## Check compilation without building
check:
	cargo check --all-targets

## Generate documentation
doc:
	cargo doc --no-deps --open

## Remove build artifacts
clean:
	cargo clean

## Run coverage and generate HTML + XML reports (requires cargo-tarpaulin)
coverage:
	cargo tarpaulin --out Html Xml --output-dir coverage/ --features testutils --exclude-files "*/test*"

## Run coverage and fail if below 60% threshold
coverage-check:
	cargo tarpaulin --out Xml --output-dir coverage/ --features testutils --exclude-files "*/test*" --fail-under 60

## Build with debug logs enabled
build-debug:
	cargo build --release --target wasm32-unknown-unknown --features testutils

## Show WASM binary sizes
wasm-size: build
	@echo "=== WASM binary sizes ==="
	@find target/wasm32-unknown-unknown/release -name "*.wasm" | xargs ls -lh 2>/dev/null || echo "No WASM files found"

## Run mutation tests against governance contract (requires cargo-mutants)
mutants:
	cargo mutants -p cosmosvote-governance --features testutils

## Run all checks (CI equivalent)
ci: fmt-check lint test build

## Run mutation testing (requires cargo-mutants)
mutants:
	cargo mutants --package cosmosvote-governance --features testutils --output mutants-out -- --features testutils
