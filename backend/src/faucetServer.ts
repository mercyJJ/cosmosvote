import { FaucetClaimStore, createFaucetServer, readFaucetConfig } from './faucet';
import { isOriginAllowed } from './cors';

const config = readFaucetConfig(process.env);
if (!config) throw new Error('Set FAUCET_ENABLED=true to start the faucet service.');

const port = Number(process.env.FAUCET_PORT ?? '3001');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('FAUCET_PORT must be a valid TCP port.');
}

const store = new FaucetClaimStore(config.databasePath);
const server = createFaucetServer(config, store);
server.listen(port, '0.0.0.0', () => {
  console.info(`Testnet token faucet listening on port ${port}`);
});

function shutdown(): void {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);