import request from 'supertest';

jest.mock('./config/data-source', () => ({
  AppDataSource: {
    isInitialized: true,
    query: jest.fn(),
    getRepository: jest.fn(() => ({})),
  },
}));

jest.mock('./controllers/auth.controller', () => ({
  login: jest.fn((req, res) => res.json({ ok: true })),
  register: jest.fn((req, res) => res.json({ ok: true })),
  forgotPassword: jest.fn((req, res) => res.json({ ok: true })),
  resetPassword: jest.fn((req, res) => res.json({ ok: true })),
  changePassword: jest.fn((req, res) => res.json({ ok: true })),
  getAppSettings: jest.fn((req, res) => res.json({})),
}));

import { createApp } from './app';

describe('Auth register invite-only', () => {
  const originalInviteOnly = process.env.INVITE_ONLY;

  afterEach(() => {
    process.env.INVITE_ONLY = originalInviteOnly;
  });

  it('returns 403 when INVITE_ONLY=true', async () => {
    process.env.INVITE_ONLY = 'true';
    const app = createApp();
    const res = await request(app).post('/api/auth/register').send({
      email: 'user@example.com',
      password: 'password123',
      fullName: 'User Name',
      role: 'admin',
    });

    expect(res.status).toBe(403);
    expect(res.body?.message).toBe('Регистрация доступна только по приглашению администратора.');
  });

  it('passes through when INVITE_ONLY=false', async () => {
    process.env.INVITE_ONLY = 'false';
    const app = createApp();
    const res = await request(app).post('/api/auth/register').send({
      email: 'user@example.com',
      password: 'password123',
      fullName: 'User Name',
      role: 'admin',
    });

    expect(res.status).toBe(200);
  });
});
