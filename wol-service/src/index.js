'use strict';

require('dotenv').config();

const express = require('express');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const wol = require('wol');

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

const app = express();
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

/**
 * Middleware: validate Bearer JWT
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * GET /health
 */
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

/**
 * POST /wake
 * Body: { mac: "AA:BB:CC:DD:EE:FF", address?: "255.255.255.255", port?: 9 }
 * Sends a Magic Packet (Wake-on-LAN) to the target MAC address.
 */
app.post('/wake', verifyToken, async (req, res) => {
  const { mac, address, port } = req.body || {};

  if (!mac) {
    return res.status(400).json({ error: 'mac is required' });
  }

  // Basic MAC address format validation
  if (!/^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/.test(mac)) {
    return res.status(400).json({ error: 'Invalid MAC address format' });
  }

  try {
    const opts = {};
    if (address) opts.address = address;
    if (port) opts.port = port;

    await new Promise((resolve, reject) => {
      wol.wake(mac, opts, (err) => (err ? reject(err) : resolve()));
    });
    console.log(`[wol] Magic packet sent to ${mac} (${address || 'broadcast'})`);
    return res.json({ ok: true, mac });
  } catch (err) {
    console.error(`[wol] Error sending magic packet: ${err.message}`);
    return res.status(500).json({ error: 'Failed to send magic packet' });
  }
});

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`[wol-service] Listening on port ${PORT}`);
});

module.exports = { app, server };
