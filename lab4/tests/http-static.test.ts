import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app.js';

describe('HTTP Static Assets & API Endpoints', () => {
  const app = createApp();

  it('serves index.html at root route /', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('CyberTanks');
  });

  it('serves static CSS and JS client files', async () => {
    const cssRes = await request(app).get('/css/style.css');
    expect(cssRes.status).toBe(200);
    expect(cssRes.headers['content-type']).toMatch(/css/);

    const jsRes = await request(app).get('/js/main.js');
    expect(jsRes.status).toBe(200);
    expect(jsRes.headers['content-type']).toMatch(/javascript/);
  });

  it('serves /api/health with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toContain('CyberTanks');
  });
});
