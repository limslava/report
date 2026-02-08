import request from 'supertest';

jest.mock('./config/data-source', () => ({
  AppDataSource: {
    isInitialized: true,
    query: jest.fn(),
    getRepository: jest.fn(() => ({})),
  },
}));

const updateUser = jest.fn((req, res) => res.json({ ok: true }));

jest.mock('./controllers/admin.controller', () => ({
  getUsers: jest.fn((req, res) => res.json([])),
  inviteUser: jest.fn((req, res) => res.json({ ok: true })),
  updateUser: (...args: any[]) => updateUser(...args),
  reassignAndDeleteUser: jest.fn((req, res) => res.json({ ok: true })),
  resetUserPassword: jest.fn((req, res) => res.json({ ok: true })),
  deleteUser: jest.fn((req, res) => res.json({ ok: true })),
  getAuditLog: jest.fn((req, res) => res.json([])),
  getSystemStats: jest.fn((req, res) => res.json({})),
  getAppSettings: jest.fn((req, res) => res.json({})),
  updateAppSettings: jest.fn((req, res) => res.json({ ok: true })),
}));

jest.mock('./middleware/authenticate', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'test-user',
      email: 'admin@example.com',
      fullName: 'Admin',
      role: 'admin',
      isActive: true,
      passwordHash: 'hash',
    };
    next();
  },
}));

import { createApp } from './app';

describe('Admin routes validation', () => {
  beforeEach(() => {
    updateUser.mockClear();
  });

  it('rejects invalid role on update user', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/admin/users/00000000-0000-0000-0000-000000000000')
      .send({ role: 'invalid_role' });

    expect(res.status).toBe(400);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('accepts valid role on update user', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/admin/users/00000000-0000-0000-0000-000000000000')
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(updateUser).toHaveBeenCalled();
  });
});
