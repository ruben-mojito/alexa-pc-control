'use strict';

require('dotenv').config();

const express = require('express');
const { ExpressAdapter } = require('ask-sdk-express-adapter');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// ─── Configuration ────────────────────────────────────────────────────────────
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'change-me-in-production';
const PORT = process.env.PORT || 3001;

/**
 * Device list: configured via the DEVICES environment variable as a JSON array.
 *
 * Each entry must have:
 *   - deviceId    {string}  unique id used to address the agent on the backend
 *   - friendlyName {string} displayed name in the Alexa app
 *   - macAddress  {string}  MAC address in "XX:XX:XX:XX:XX:XX" format (for WoL)
 *   - description {string}  optional description
 *
 * Example:
 *   DEVICES='[{"deviceId":"my-pc","friendlyName":"My PC","macAddress":"AA:BB:CC:DD:EE:FF"}]'
 *
 * If DEVICES is not set, a single device is built from the individual env vars:
 *   DEFAULT_DEVICE_ID, DEFAULT_DEVICE_NAME, DEFAULT_MAC.
 */
function loadDevices() {
  if (process.env.DEVICES) {
    try {
      return JSON.parse(process.env.DEVICES);
    } catch (err) {
      console.error('[skill-http] Failed to parse DEVICES env var:', err.message);
    }
  }
  return [
    {
      deviceId: process.env.DEFAULT_DEVICE_ID || 'my-pc',
      friendlyName: process.env.DEFAULT_DEVICE_NAME || 'My PC',
      macAddress: process.env.DEFAULT_MAC || '',
      description: 'PC controlled via Alexa PC Control',
    },
  ];
}

// ─── Helper: obtain a short-lived JWT ────────────────────────────────────────
async function getToken(deviceId) {
  const res = await axios.post(`${SERVER_URL}/api/auth/token`, {
    apiKey: API_KEY,
    deviceId,
  });
  return res.data.token;
}

// ─── Helper: send a command to the PC agent via the backend ──────────────────
async function sendCommand(deviceId, command, delaySeconds = 0) {
  const token = await getToken(deviceId);
  const res = await axios.post(
    `${SERVER_URL}/api/commands/${deviceId}`,
    { command, delaySeconds },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

// ─── Response builders ────────────────────────────────────────────────────────

function buildHeader(namespace, name, correlationToken) {
  const header = {
    namespace,
    name,
    messageId: uuidv4(),
    payloadVersion: '3',
  };
  if (correlationToken) {
    header.correlationToken = correlationToken;
  }
  return header;
}

function buildPowerResponse(endpointId, correlationToken, powerState) {
  return {
    context: {
      properties: [
        {
          namespace: 'Alexa.PowerController',
          name: 'powerState',
          value: powerState,
          timeOfSample: new Date().toISOString(),
          uncertaintyInMilliseconds: 0,
        },
      ],
    },
    event: {
      header: buildHeader('Alexa', 'Response', correlationToken),
      endpoint: { endpointId },
      payload: {},
    },
  };
}

function buildErrorResponse(endpointId, correlationToken, type, message) {
  return {
    event: {
      header: buildHeader('Alexa', 'ErrorResponse', correlationToken),
      endpoint: { endpointId },
      payload: { type, message },
    },
  };
}

// ─── Directive handlers ───────────────────────────────────────────────────────

/**
 * Alexa.Authorization/AcceptGrant
 * Acknowledges the account-linking grant token. For a self-hosted setup this
 * is a no-op; the grant code can be stored here if you implement full OAuth.
 */
function handleAcceptGrant(directive) {
  console.log('[skill-http] AcceptGrant received');
  return {
    event: {
      header: buildHeader('Alexa.Authorization', 'AcceptGrant.Response'),
      payload: {},
    },
  };
}

/**
 * Alexa.Discovery/Discover
 * Returns the list of controllable endpoints. Each endpoint declares:
 *   - Alexa.PowerController  (TurnOn / TurnOff)
 *   - Alexa.WakeOnLANController  (macAddress — used by the Echo to send the
 *     WoL magic packet automatically when TurnOn is invoked)
 */
function handleDiscovery(directive) {
  const devices = loadDevices();
  const endpoints = devices.map((device) => {
    const capabilities = [
      // Required base capability
      {
        type: 'AlexaInterface',
        interface: 'Alexa',
        version: '3',
      },
      // Power on / off
      {
        type: 'AlexaInterface',
        interface: 'Alexa.PowerController',
        version: '3',
        properties: {
          supported: [{ name: 'powerState' }],
          proactivelyReported: false,
          retrievable: false,
        },
      },
    ];

    // Only advertise WakeOnLANController when a MAC address is configured.
    // The Echo device uses this MAC to send the UDP magic packet on TurnOn.
    if (device.macAddress) {
      capabilities.push({
        type: 'AlexaInterface',
        interface: 'Alexa.WakeOnLANController',
        version: '3',
        macAddress: device.macAddress,
      });
    }

    return {
      endpointId: device.deviceId,
      manufacturerName: 'Alexa PC Control',
      friendlyName: device.friendlyName,
      description: device.description || `PC controlled via Alexa PC Control`,
      displayCategories: ['COMPUTER'],
      capabilities,
    };
  });

  console.log(`[skill-http] Discovered ${endpoints.length} endpoint(s)`);
  return {
    event: {
      header: buildHeader('Alexa.Discovery', 'Discover.Response'),
      payload: { endpoints },
    },
  };
}

/**
 * Alexa.PowerController/TurnOn
 * When the endpoint has Alexa.WakeOnLANController, the Echo device on the LAN
 * automatically sends the WoL magic packet to the registered MAC address.
 * The skill only needs to return a success response.
 */
async function handleTurnOn(directive) {
  const { endpointId } = directive.endpoint;
  const { correlationToken } = directive.header;
  console.log(`[skill-http] TurnOn: ${endpointId} (WoL handled by Echo device)`);
  return buildPowerResponse(endpointId, correlationToken, 'ON');
}

/**
 * Alexa.PowerController/TurnOff
 * Sends a shutdown command to the PC agent via the backend WebSocket.
 */
async function handleTurnOff(directive) {
  const { endpointId } = directive.endpoint;
  const { correlationToken } = directive.header;
  console.log(`[skill-http] TurnOff: ${endpointId} – sending shutdown`);
  try {
    await sendCommand(endpointId, 'shutdown');
    return buildPowerResponse(endpointId, correlationToken, 'OFF');
  } catch (err) {
    console.error(`[skill-http] TurnOff error for ${endpointId}:`, err.message);
    return buildErrorResponse(
      endpointId,
      correlationToken,
      'ENDPOINT_UNREACHABLE',
      `Could not shut down ${endpointId}: ${err.message}`
    );
  }
}

// ─── Skill object ─────────────────────────────────────────────────────────────
// A minimal object that implements the SkillInterface required by ExpressAdapter.
// ExpressAdapter handles Alexa signature/certificate/timestamp verification
// before calling invoke(), so only verified requests reach this handler.
const smartHomeSkill = {
  // Required by ExpressAdapter to annotate the SDK user-agent string.
  appendAdditionalUserAgent() {},

  async invoke(requestEnvelope) {
    const { directive } = requestEnvelope;
    if (!directive) {
      throw new Error('Unexpected request format: missing directive');
    }

    const { namespace, name } = directive.header;
    console.log(`[skill-http] Directive: ${namespace}/${name}`);

    switch (namespace) {
      case 'Alexa.Authorization':
        return handleAcceptGrant(directive);

      case 'Alexa.Discovery':
        return handleDiscovery(directive);

      case 'Alexa.PowerController':
        if (name === 'TurnOn') return handleTurnOn(directive);
        if (name === 'TurnOff') return handleTurnOff(directive);
        throw new Error(`Unsupported PowerController directive: ${name}`);

      default:
        throw new Error(`Unsupported namespace: ${namespace}`);
    }
  },
};

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();

// Health check (no auth required)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Alexa Smart Home endpoint.
// ExpressAdapter verifies the Alexa request signature, certificate chain and
// timestamp before dispatching to smartHomeSkill.invoke().
const adapter = new ExpressAdapter(smartHomeSkill, true, true);
app.post('/skill', adapter.getRequestHandlers());

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[skill-http] Unhandled error:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[skill-http] Listening on port ${PORT}`);
});

module.exports = { app };
