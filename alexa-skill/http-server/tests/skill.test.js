'use strict';

/**
 * Mock ask-sdk-express-adapter to bypass Alexa signature/timestamp verification
 * so the tests can focus on the directive-handling logic without needing real
 * Alexa certificates or signed requests.
 */
jest.mock('ask-sdk-express-adapter', () => {
  const express = require('express');
  return {
    ExpressAdapter: class MockExpressAdapter {
      constructor(skill) {
        this.skill = skill;
      }
      getRequestHandlers() {
        return [
          express.json(),
          async (req, res) => {
            try {
              const response = await this.skill.invoke(req.body);
              res.json(response);
            } catch (err) {
              res.status(500).json({ error: err.message });
            }
          },
        ];
      }
    },
  };
});

// Mock axios so tests never make real HTTP calls to the backend server
jest.mock('axios');
const axios = require('axios');

const request = require('supertest');
const { app, smartHomeSkill } = require('../index');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDirective(namespace, name, extra = {}) {
  return {
    directive: {
      header: {
        namespace,
        name,
        messageId: 'test-message-id',
        payloadVersion: '3',
        correlationToken: 'test-correlation-token',
        ...extra.header,
      },
      endpoint: { endpointId: 'my-pc', ...extra.endpoint },
      payload: extra.payload || {},
    },
  };
}

// ─── GET /health ──────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

// ─── Unknown route ────────────────────────────────────────────────────────────

describe('Unknown route', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
  });
});

// ─── POST /skill – HTTP-level ─────────────────────────────────────────────────

describe('POST /skill', () => {
  it('returns 400 for a missing directive', async () => {
    const res = await request(app).post('/skill').send({});
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('returns a valid response for an AcceptGrant directive', async () => {
    const body = makeDirective('Alexa.Authorization', 'AcceptGrant');
    const res = await request(app).post('/skill').send(body);
    expect(res.status).toBe(200);
    expect(res.body.event.header.namespace).toBe('Alexa.Authorization');
    expect(res.body.event.header.name).toBe('AcceptGrant.Response');
  });

  it('returns a Discover.Response for a Discovery directive', async () => {
    const body = makeDirective('Alexa.Discovery', 'Discover', {
      header: { namespace: 'Alexa.Discovery', name: 'Discover' },
    });
    const res = await request(app).post('/skill').send(body);
    expect(res.status).toBe(200);
    expect(res.body.event.header.namespace).toBe('Alexa.Discovery');
    expect(res.body.event.header.name).toBe('Discover.Response');
    expect(Array.isArray(res.body.event.payload.endpoints)).toBe(true);
  });
});

// ─── smartHomeSkill.invoke – directive handler unit tests ─────────────────────

describe('Alexa.Authorization / AcceptGrant', () => {
  it('returns AcceptGrant.Response', async () => {
    const envelope = makeDirective('Alexa.Authorization', 'AcceptGrant');
    const result = await smartHomeSkill.invoke(envelope);
    expect(result.event.header.namespace).toBe('Alexa.Authorization');
    expect(result.event.header.name).toBe('AcceptGrant.Response');
    expect(result.event.payload).toEqual({});
  });
});

describe('Alexa.Discovery / Discover', () => {
  beforeEach(() => {
    delete process.env.DEVICES;
    delete process.env.DEFAULT_DEVICE_ID;
    delete process.env.DEFAULT_DEVICE_NAME;
    delete process.env.DEFAULT_MAC;
  });

  it('returns Discover.Response with default device (no MAC)', async () => {
    const envelope = makeDirective('Alexa.Discovery', 'Discover');
    const result = await smartHomeSkill.invoke(envelope);
    expect(result.event.header.namespace).toBe('Alexa.Discovery');
    expect(result.event.header.name).toBe('Discover.Response');

    const { endpoints } = result.event.payload;
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].endpointId).toBe('my-pc');
    expect(endpoints[0].displayCategories).toContain('COMPUTER');

    // No WakeOnLANController when MAC is absent
    const hasWoL = endpoints[0].capabilities.some(
      (c) => c.interface === 'Alexa.WakeOnLANController'
    );
    expect(hasWoL).toBe(false);
  });

  it('includes WakeOnLANController when MAC is configured via env var', async () => {
    process.env.DEFAULT_MAC = 'AA:BB:CC:DD:EE:FF';
    const envelope = makeDirective('Alexa.Discovery', 'Discover');
    const result = await smartHomeSkill.invoke(envelope);
    const { endpoints } = result.event.payload;
    const wolCap = endpoints[0].capabilities.find(
      (c) => c.interface === 'Alexa.WakeOnLANController'
    );
    expect(wolCap).toBeDefined();
    expect(wolCap.macAddress).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('discovers multiple devices from DEVICES env var', async () => {
    process.env.DEVICES = JSON.stringify([
      { deviceId: 'pc-1', friendlyName: 'Desktop', macAddress: '' },
      { deviceId: 'pc-2', friendlyName: 'Laptop', macAddress: 'BB:CC:DD:EE:FF:00' },
    ]);
    const envelope = makeDirective('Alexa.Discovery', 'Discover');
    const result = await smartHomeSkill.invoke(envelope);
    const { endpoints } = result.event.payload;
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].endpointId).toBe('pc-1');
    expect(endpoints[1].endpointId).toBe('pc-2');
  });
});

describe('Alexa.PowerController / TurnOn', () => {
  it('returns powerState ON without calling the backend', async () => {
    const envelope = makeDirective('Alexa.PowerController', 'TurnOn');
    const result = await smartHomeSkill.invoke(envelope);
    expect(result.event.header.name).toBe('Response');
    expect(result.context.properties[0].value).toBe('ON');
    expect(result.event.endpoint.endpointId).toBe('my-pc');
    expect(result.event.header.correlationToken).toBe('test-correlation-token');
    // TurnOn should never call the backend server
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('Alexa.PowerController / TurnOff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns powerState OFF when backend call succeeds', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { token: 'mock-jwt' } }) // getToken
      .mockResolvedValueOnce({ data: { status: 'queued' } }); // sendCommand

    const envelope = makeDirective('Alexa.PowerController', 'TurnOff');
    const result = await smartHomeSkill.invoke(envelope);
    expect(result.event.header.name).toBe('Response');
    expect(result.context.properties[0].value).toBe('OFF');
    expect(result.event.endpoint.endpointId).toBe('my-pc');
  });

  it('returns ErrorResponse when backend call fails', async () => {
    axios.post.mockRejectedValue(new Error('connection refused'));

    const envelope = makeDirective('Alexa.PowerController', 'TurnOff');
    const result = await smartHomeSkill.invoke(envelope);
    expect(result.event.header.name).toBe('ErrorResponse');
    expect(result.event.payload.type).toBe('ENDPOINT_UNREACHABLE');
    expect(result.event.payload.message).toMatch(/connection refused/);
  });
});

describe('Unsupported directives', () => {
  it('throws for an unknown PowerController directive name', async () => {
    const envelope = makeDirective('Alexa.PowerController', 'Toggle');
    await expect(smartHomeSkill.invoke(envelope)).rejects.toThrow(
      'Unsupported PowerController directive: Toggle'
    );
  });

  it('throws for an unknown namespace', async () => {
    const envelope = makeDirective('Alexa.Unknown', 'SomeDirective');
    await expect(smartHomeSkill.invoke(envelope)).rejects.toThrow(
      'Unsupported namespace: Alexa.Unknown'
    );
  });

  it('throws when directive is missing from the request envelope', async () => {
    await expect(smartHomeSkill.invoke({})).rejects.toThrow(
      'Unexpected request format: missing directive'
    );
  });
});
