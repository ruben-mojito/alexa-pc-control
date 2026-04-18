'use strict';

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const {
  registerDevice,
  unregisterDevice,
  getDeviceWithWs,
} = require('../models/device');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

let wss = null;

/**
 * Initialise the WebSocket server attached to an existing HTTP server.
 * Clients must authenticate by sending a JSON message of type "auth" first.
 *
 * { type: "auth", token: "<JWT>", name?: "<friendly name>" }
 */
function initHub(httpServer) {
  wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    console.log(`[hub] New WebSocket connection from ${req.socket.remoteAddress}`);
    ws._authenticated = false;
    ws._deviceId = null;

    // Authentication timeout – close unauthenticated connections after 10 s
    const authTimeout = setTimeout(() => {
      if (!ws._authenticated) {
        ws.close(1008, 'Authentication timeout');
      }
    }, 10_000);

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      if (!ws._authenticated) {
        handleAuth(ws, msg, authTimeout);
        return;
      }

      handleMessage(ws, msg);
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (ws._deviceId) {
        console.log(`[hub] Device disconnected: ${ws._deviceId}`);
        unregisterDevice(ws._deviceId);
      }
    });

    ws.on('error', (err) => {
      console.error(`[hub] WebSocket error for device ${ws._deviceId}: ${err.message}`);
    });
  });

  console.log('[hub] WebSocket server initialised at /ws');
  return wss;
}

function handleAuth(ws, msg, authTimeout) {
  if (msg.type !== 'auth' || !msg.token) {
    ws.send(JSON.stringify({ type: 'error', message: 'Send { type:"auth", token:"<JWT>" } first' }));
    return;
  }

  let payload;
  try {
    payload = jwt.verify(msg.token, JWT_SECRET);
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
    ws.close(1008, 'Unauthorized');
    return;
  }

  clearTimeout(authTimeout);
  ws._authenticated = true;
  ws._deviceId = payload.sub;

  registerDevice(payload.sub, msg.name || payload.sub, ws);
  ws.send(JSON.stringify({ type: 'auth_ok', deviceId: payload.sub }));
  console.log(`[hub] Device authenticated: ${payload.sub}`);
}

function handleMessage(ws, msg) {
  // Clients can send a "pong" reply to server-initiated pings or status updates
  if (msg.type === 'pong') {
    console.log(`[hub] Pong from device ${ws._deviceId}`);
  }
}

/**
 * Send a command payload to a specific device.
 * Returns true if the message was queued, false if the device is offline.
 */
function sendCommand(deviceId, payload) {
  const device = getDeviceWithWs(deviceId);
  if (!device || !device.ws || device.ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  device.ws.send(JSON.stringify({ type: 'command', ...payload }));
  console.log(`[hub] Command sent to ${deviceId}: ${payload.command}`);
  return true;
}

module.exports = { initHub, sendCommand };
