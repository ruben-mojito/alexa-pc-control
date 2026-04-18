'use strict';

const request = require('supertest');
const { app, server } = require('../src/index');

afterAll(() => {
  server.close();
});

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('POST /api/auth/token', () => {
  const API_KEY = process.env.API_KEY || 'dev-api-key';

  it('returns a JWT for a valid API key', async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({ apiKey: API_KEY });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('deviceId');
  });

  it('returns 401 for an invalid API key', async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({ apiKey: 'wrong-key' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('accepts a custom deviceId', async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({ apiKey: API_KEY, deviceId: 'my-pc' });

    expect(res.status).toBe(200);
    expect(res.body.deviceId).toBe('my-pc');
  });
});

describe('Protected routes require a valid token', () => {
  it('GET /api/devices returns 401 without token', async () => {
    const res = await request(app).get('/api/devices');
    expect(res.status).toBe(401);
  });

  it('POST /api/commands/:deviceId returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/commands/my-pc')
      .send({ command: 'ping' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/devices (authenticated)', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({ apiKey: process.env.API_KEY || 'dev-api-key' });
    token = res.body.token;
  });

  it('returns an array of devices', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/commands/:deviceId (authenticated)', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({ apiKey: process.env.API_KEY || 'dev-api-key' });
    token = res.body.token;
  });

  it('returns 400 for an invalid command', async () => {
    const res = await request(app)
      .post('/api/commands/my-pc')
      .set('Authorization', `Bearer ${token}`)
      .send({ command: 'rm-rf' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown device', async () => {
    const res = await request(app)
      .post('/api/commands/nonexistent-device')
      .set('Authorization', `Bearer ${token}`)
      .send({ command: 'ping' });
    expect(res.status).toBe(404);
  });
});

describe('Unknown route', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
  });
});
