'use strict';

require('dotenv').config();

const http = require('http');
const express = require('express');

const { initHub } = require('./websocket/hub');
const authRouter = require('./routes/auth');
const devicesRouter = require('./routes/devices');
const commandsRouter = require('./routes/commands');
const { apiLimiter } = require('./middleware/rateLimiter');
const { verifyToken } = require('./middleware/auth');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

// Apply rate limiter to all API routes
app.use('/api', apiLimiter);

// Public routes
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRouter);

// Protected routes
app.use('/api/devices', verifyToken, devicesRouter);
app.use('/api/commands', verifyToken, commandsRouter);

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
initHub(server);

server.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});

module.exports = { app, server };
