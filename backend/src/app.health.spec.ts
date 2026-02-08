import request from 'supertest';

jest.mock('./config/data-source', () => ({
  AppDataSource: {
    isInitialized: true,
    query: jest.fn(),
    getRepository: jest.fn(() => ({})),
  },
}));

import { AppDataSource } from './config/data-source';
import { createApp } from './app';

describe('Health endpoints', () => {
  beforeEach(() => {
    (AppDataSource.query as jest.Mock).mockReset();
  });

  it('returns 503 when datasource is not initialized', async () => {
    AppDataSource.isInitialized = false;
    const app = createApp();

    const res = await request(app).get('/health/db');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('DOWN');
  });

  it('returns 200 when db query succeeds', async () => {
    AppDataSource.isInitialized = true;
    (AppDataSource.query as jest.Mock).mockResolvedValueOnce([{ '?column?': 1 }]);
    const app = createApp();

    const res = await request(app).get('/health/db');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  it('returns 503 when db query fails', async () => {
    AppDataSource.isInitialized = true;
    (AppDataSource.query as jest.Mock).mockRejectedValueOnce(new Error('DB down'));
    const app = createApp();

    const res = await request(app).get('/health/db');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('DOWN');
  });
});
