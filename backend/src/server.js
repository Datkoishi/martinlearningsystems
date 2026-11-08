import http from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { closeCatalogStorage } from './catalog/index.js';
import { createMetricsServer, metricsRegistry } from './operations/metrics.js';

let shuttingDown = false;
const app = createApp({ readinessCheck: () => !shuttingDown });
const server = http.createServer(app);
const metricsServer = config.metrics.enabled
  ? createMetricsServer({ registry: metricsRegistry, bearerToken: config.metrics.bearerToken })
  : null;

const io = new Server(server, {
  cors: {
    origin: config.clientOrigin,
    credentials: true
  }
});

io.on('connection', (socket) => {
  socket.emit('server:ready', {
    message: 'Socket.IO connected',
    connectedAt: new Date().toISOString()
  });

  socket.on('client:ping', () => {
    socket.emit('server:pong', { timestamp: Date.now() });
  });
});

server.listen(config.port, () => {
  console.log(`Backend listening on port ${config.port}`);
});
metricsServer?.listen(config.metrics.port, config.metrics.bindAddress, () => {
  console.log(`Backend metrics listening on ${config.metrics.bindAddress}:${config.metrics.port}`);
});

let shutdownPromise;
const closeRealtime = () => new Promise((resolve) => io.close(resolve));
const closeHttp = () => new Promise((resolve, reject) => {
  if (!server.listening) return resolve();
  return server.close((error) => error ? reject(error) : resolve());
});
const closeMetrics = () => new Promise((resolve, reject) => {
  if (!metricsServer?.listening) return resolve();
  return metricsServer.close((error) => error ? reject(error) : resolve());
});

const shutdown = (signal) => {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully`);
  const deadline = setTimeout(() => {
    console.error(`Graceful shutdown exceeded ${config.shutdownGraceMs}ms`);
    server.closeAllConnections?.();
    process.exit(1);
  }, config.shutdownGraceMs);
  deadline.unref();

  shutdownPromise = (async () => {
    await closeRealtime();
    await closeHttp();
    await closeMetrics();
    closeCatalogStorage();
    await db.end();
    clearTimeout(deadline);
    process.exitCode = 0;
  })().catch((error) => {
    clearTimeout(deadline);
    console.error('Graceful shutdown failed', error);
    process.exitCode = 1;
  });
  return shutdownPromise;
};

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
