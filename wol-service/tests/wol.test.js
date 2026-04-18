'use strict';

jest.mock('wol', () => ({
  wake: jest.fn((_mac, _opts, cb) => cb(null)),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app, server } = require('../src/index');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

function makeToken(payload = {}) {
  return jwt.sign({ sub: 'test-device', type: 'device', ...payload }, JWT_SECRET, {
    expiresIn: '1h',
  });
}

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

describe('POST /wake', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/wake').send({ mac: 'AA:BB:CC:DD:EE:FF' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when mac is missing', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/wake')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for an invalid MAC address', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/wake')
      .set('Authorization', `Bearer ${token}`)
      .send({ mac: 'not-a-mac' });
    expect(res.status).toBe(400);
  });

  it('sends a magic packet for a valid MAC address', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/wake')
      .set('Authorization', `Bearer ${token}`)
      .send({ mac: 'AA:BB:CC:DD:EE:FF' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, mac: 'AA:BB:CC:DD:EE:FF' });
  });

  it('accepts colon-separated MAC addresses', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/wake')
      .set('Authorization', `Bearer ${token}`)
      .send({ mac: 'aa:bb:cc:dd:ee:ff' });
    expect(res.status).toBe(200);
  });

  it('accepts hyphen-separated MAC addresses', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/wake')
      .set('Authorization', `Bearer ${token}`)
      .send({ mac: 'AA-BB-CC-DD-EE-FF' });
    expect(res.status).toBe(200);
  });
});

describe('Unknown route', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
  });
});
