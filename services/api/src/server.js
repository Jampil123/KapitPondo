const app = require('./app');
const env = require('./config/env');

// 0.0.0.0 so Railway's proxy (and other devices on the LAN in dev) can reach it.
const server = app.listen(env.port, '0.0.0.0', () => {
  console.log(`KapitPondo API running on port ${env.port}`);
});

// Railway sends SIGTERM on redeploy; finish in-flight requests before exiting.
function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
