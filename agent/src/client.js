'use strict';

require('dotenv').config();

const WebSocket = require('ws');

const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:3000/ws';
const API_KEY = process.env.API_KEY || 'dev-api-key';
const DEVICE_ID = process.env.DEVICE_ID || require('os').hostname();
const DEVICE_NAME = process.env.DEVICE_NAME || DEVICE_ID;
const SERVER_HTTP_URL = process.env.SERVER_HTTP_URL || 'http://localhost:3000';

const RECONNECT_DELAY_MS = parseInt(process.env.RECONNECT_DELAY_MS || '5000', 10);

const { shutdown } = require('./commands/shutdown');
const { reboot } = require('./commands/reboot');

let ws = null;
let reconnectTimer = null;

async function getToken() {
  // Use built-in fetch (Node 18+) to avoid extra dependencies
  const res = await fetch(`${SERVER_HTTP_URL}/api/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: API_KEY, deviceId: DEVICE_ID }),
  });
  if (!res.ok) {
    throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.token;
}

async function connect() {
  let token;
  try {
    token = await getToken();
  } catch (err) {
    console.error(`[agent] Could not obtain token: ${err.message}`);
    scheduleReconnect();
    return;
  }

  ws = new WebSocket(SERVER_URL);

  ws.on('open', () => {
    console.log(`[agent] Connected to ${SERVER_URL}`);
    ws.send(JSON.stringify({ type: 'auth', token, name: DEVICE_NAME }));
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.warn('[agent] Received non-JSON message');
      return;
    }

    switch (msg.type) {
      case 'auth_ok':
        console.log(`[agent] Authenticated as ${msg.deviceId}`);
        break;

      case 'command':
        handleCommand(msg);
        break;

      case 'error':
        console.error(`[agent] Server error: ${msg.message}`);
        break;

      default:
        console.log(`[agent] Unknown message type: ${msg.type}`);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[agent] Connection closed (${code} ${reason}). Reconnecting...`);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error(`[agent] WebSocket error: ${err.message}`);
  });
}

function handleCommand(msg) {
  const { command, delaySeconds = 0 } = msg;
  console.log(`[agent] Received command: ${command} (delay: ${delaySeconds}s)`);

  switch (command) {
    case 'shutdown':
      shutdown(delaySeconds);
      break;
    case 'reboot':
      reboot(delaySeconds);
      break;
    case 'ping':
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
      break;
    default:
      console.warn(`[agent] Unknown command: ${command}`);
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY_MS);
}

module.exports = { connect, handleCommand };

// Start when run directly
if (require.main === module) {
  connect();
}
