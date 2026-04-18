'use strict';

const express = require('express');
const { listDevices, getDevice } = require('../models/device');

const router = express.Router();

/**
 * GET /api/devices
 * Returns all registered (connected) devices.
 */
router.get('/', (_req, res) => {
  res.json(listDevices());
});

/**
 * GET /api/devices/:deviceId
 * Returns details for a specific device.
 */
router.get('/:deviceId', (req, res) => {
  const device = getDevice(req.params.deviceId);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }
  return res.json(device);
});

module.exports = router;
