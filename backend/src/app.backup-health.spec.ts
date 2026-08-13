import request from 'supertest';

const repoMock = {
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn((data: any) => data),
};

jest.mock('./config/data-source', () => ({
  AppDataSource: {
    isInitialized: true,
    query: jest.fn(),
    getRepository: jest.fn(() => repoMock),
  },
}));

import { createApp } from './app';

describe('Мониторинг свежести бэкапов (/health/backup)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
    delete process.env.BACKUP_PING_TOKEN;
    delete process.env.BACKUP_MAX_AGE_HOURS;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('POST /health/backup-ping', () => {
    it('503 DISABLED, пока BACKUP_PING_TOKEN не настроен на сервере', async () => {
      const res = await request(createApp())
        .post('/health/backup-ping')
        .set('X-Backup-Token', 'anything');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('DISABLED');
    });

    it('403 при неверном токене, отметка не пишется', async () => {
      process.env.BACKUP_PING_TOKEN = 'secret';
      const res = await request(createApp())
        .post('/health/backup-ping')
        .set('X-Backup-Token', 'wrong');
      expect(res.status).toBe(403);
      expect(repoMock.save).not.toHaveBeenCalled();
    });

    it('200 при верном токене: создаёт отметку, если её ещё не было', async () => {
      process.env.BACKUP_PING_TOKEN = 'secret';
      repoMock.findOne.mockResolvedValueOnce(null);
      const res = await request(createApp())
        .post('/health/backup-ping')
        .set('X-Backup-Token', 'secret');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('OK');
      expect(repoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'backup_last_ping' })
      );
    });

    it('200 при верном токене: обновляет существующую отметку', async () => {
      process.env.BACKUP_PING_TOKEN = 'secret';
      const existing = { key: 'backup_last_ping', value: '2020-01-01T00:00:00.000Z' };
      repoMock.findOne.mockResolvedValueOnce(existing);
      const res = await request(createApp())
        .post('/health/backup-ping')
        .set('X-Backup-Token', 'secret');
      expect(res.status).toBe(200);
      expect(repoMock.save).toHaveBeenCalledWith(existing);
      expect(new Date(existing.value).getTime()).toBeGreaterThan(Date.parse('2025-01-01'));
    });
  });

  describe('GET /health/backup', () => {
    const isoHoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

    it('503 NO_DATA, пока бэкап ни разу не отчитался', async () => {
      repoMock.findOne.mockResolvedValueOnce(null);
      const res = await request(createApp()).get('/health/backup');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('NO_DATA');
    });

    it('200 OK при свежем бэкапе (младше 26 часов)', async () => {
      repoMock.findOne.mockResolvedValueOnce({ key: 'backup_last_ping', value: isoHoursAgo(5) });
      const res = await request(createApp()).get('/health/backup');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('OK');
      expect(res.body.ageHours).toBeCloseTo(5, 0);
    });

    it('503 STALE, если бэкап старше 26 часов', async () => {
      repoMock.findOne.mockResolvedValueOnce({ key: 'backup_last_ping', value: isoHoursAgo(27) });
      const res = await request(createApp()).get('/health/backup');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('STALE');
      expect(res.body.ageHours).toBe(27);
    });

    it('порог настраивается через BACKUP_MAX_AGE_HOURS', async () => {
      process.env.BACKUP_MAX_AGE_HOURS = '48';
      repoMock.findOne.mockResolvedValueOnce({ key: 'backup_last_ping', value: isoHoursAgo(30) });
      const res = await request(createApp()).get('/health/backup');
      expect(res.status).toBe(200);
    });

    it('503 STALE при нечитаемой дате отметки', async () => {
      repoMock.findOne.mockResolvedValueOnce({ key: 'backup_last_ping', value: 'мусор' });
      const res = await request(createApp()).get('/health/backup');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('STALE');
    });

    it('503 DOWN при ошибке базы', async () => {
      repoMock.findOne.mockRejectedValueOnce(new Error('db down'));
      const res = await request(createApp()).get('/health/backup');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('DOWN');
    });
  });
});
