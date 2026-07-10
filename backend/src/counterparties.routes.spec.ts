import request from 'supertest';

jest.mock('./config/data-source', () => ({
  AppDataSource: {
    isInitialized: true,
    query: jest.fn(),
    getRepository: jest.fn(() => ({})),
  },
}));

const resolveCounterpartyByInn = jest.fn((_req, res) => res.json({ data: null }));

jest.mock('./controllers/counterparties.controller', () => ({
  resolveCounterpartyByInn,
  resolveCounterpartyByName: jest.fn((_req, res) => res.json({ data: null })),
}));

jest.mock('./middleware/authenticate', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'test-user',
      email: 'manager@example.com',
      fullName: 'Manager',
      role: 'manager_sales',
      isActive: true,
      passwordHash: 'hash',
    };
    next();
  },
}));

import { createApp } from './app';

describe('Counterparties routes permissions', () => {
  beforeEach(() => {
    resolveCounterpartyByInn.mockClear();
  });

  it('allows contract initiators to resolve counterparties by INN', async () => {
    const app = createApp();
    const res = await request(app).get('/api/counterparties/resolve?inn=7700000000');

    expect(res.status).toBe(200);
    expect(resolveCounterpartyByInn).toHaveBeenCalled();
  });
});
