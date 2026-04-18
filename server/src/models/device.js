'use strict';

/**
 * In-memory device registry.
 * Maps deviceId → { deviceId, name, connectedAt, ws }
 * The `ws` property holds the live WebSocket connection.
 */
const devices = new Map();

function registerDevice(deviceId, name, ws) {
  devices.set(deviceId, {
    deviceId,
    name: name || deviceId,
    connectedAt: new Date().toISOString(),
    ws,
  });
}

function unregisterDevice(deviceId) {
  devices.delete(deviceId);
}

function getDevice(deviceId) {
  const d = devices.get(deviceId);
  if (!d) return null;
  // Return a plain object without the ws reference
  return { deviceId: d.deviceId, name: d.name, connectedAt: d.connectedAt };
}

function getDeviceWithWs(deviceId) {
  return devices.get(deviceId) || null;
}

function listDevices() {
  return Array.from(devices.values()).map(({ deviceId, name, connectedAt }) => ({
    deviceId,
    name,
    connectedAt,
  }));
}

module.exports = {
  registerDevice,
  unregisterDevice,
  getDevice,
  getDeviceWithWs,
  listDevices,
};
