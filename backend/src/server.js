import http from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db.js';

const app = createApp();
const server = http.createServer(app);

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

const shutdown = async (signal) => {
  console.log(`${signal} received, shutting down gracefully`);
  io.close();
  server.close(async () => {
    await db.end();
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
