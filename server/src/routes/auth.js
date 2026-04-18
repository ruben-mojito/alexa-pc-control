'use strict';

const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const express = require('express');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const API_KEY = process.env.API_KEY || 'dev-api-key';
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '1h';

/**
 * POST /api/auth/token
 * Body: { apiKey: string, deviceId?: string }
 * Returns a signed JWT for use in Authorization: Bearer headers.
 */
router.post('/token', (req, res) => {
  const { apiKey, deviceId } = req.body || {};

  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const id = deviceId || uuidv4();
  const token = jwt.sign({ sub: id, type: 'device' }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });

  return res.json({ token, deviceId: id, expiresIn: TOKEN_EXPIRY });
});

module.exports = router;
