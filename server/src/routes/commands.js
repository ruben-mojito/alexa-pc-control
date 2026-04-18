'use strict';

const express = require('express');
const { sendCommand } = require('../websocket/hub');
const { getDevice } = require('../models/device');

const router = express.Router();

const VALID_COMMANDS = ['shutdown', 'reboot', 'ping'];

/**
 * POST /api/commands/:deviceId
 * Body: { command: 'shutdown' | 'reboot' | 'ping', delaySeconds?: number }
 * Dispatches a command to the connected device via WebSocket.
 */
router.post('/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const { command, delaySeconds } = req.body || {};

  if (!command || !VALID_COMMANDS.includes(command)) {
    return res.status(400).json({
      error: `Invalid command. Allowed: ${VALID_COMMANDS.join(', ')}`,
    });
  }

  const device = getDevice(deviceId);
  if (!device) {
    return res.status(404).json({ error: 'Device not found or offline' });
  }

  const payload = { command, delaySeconds: delaySeconds ?? 0 };
  const sent = sendCommand(deviceId, payload);

  if (!sent) {
    return res
      .status(503)
      .json({ error: 'Device is not connected or unavailable' });
  }

  return res.json({ ok: true, deviceId, command });
});

module.exports = router;
