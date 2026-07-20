import request from 'supertest';

jest.mock('./config/data-source', () => ({
  AppDataSource: {
    isInitialized: true,
    query: jest.fn(),
    getRepository: jest.fn(() => ({})),
  },
}));

const createContract = jest.fn((_req, res) => res.status(201).json({ id: 'created' }));
const importSignedContract = jest.fn((_req, res) => res.status(201).json({ id: 'imported' }));
const updateDraftContract = jest.fn((_req, res) => res.json({ id: 'updated' }));

jest.mock('./controllers/contracts.controller', () => ({
  createContract,
  createContractDiscussionMessage: jest.fn((_req, res) => res.status(201).json({ id: 'message' })),
  importSignedContract,
  updateDraftContract,
  decideContractApprovalStep: jest.fn((_req, res) => res.json({ ok: true })),
  deleteContractAttachment: jest.fn((_req, res) => res.json({ ok: true })),
  deleteDraftContract: jest.fn((_req, res) => res.json({ ok: true })),
  downloadContractAttachment: jest.fn((_req, res) => res.end()),
  downloadContractDiscussionAttachment: jest.fn((_req, res) => res.end()),
  downloadContractPrintPackage: jest.fn((_req, res) => res.end()),
  findContractDuplicates: jest.fn((_req, res) => res.json([])),
  getContractReferences: jest.fn((_req, res) => res.json({})),
  getContractDecisionHistory: jest.fn((_req, res) => res.json([])),
  getContractDiscussionUnreadCount: jest.fn((_req, res) => res.json({ count: 0 })),
  getContractSlaRules: jest.fn((_req, res) => res.json([])),
  getContractApprovalSheet: jest.fn((_req, res) => res.json({})),
  getMyApprovalDashboard: jest.fn((_req, res) => res.json({})),
  getWorkCalendar: jest.fn((_req, res) => res.json([])),
  listContractAttachments: jest.fn((_req, res) => res.json([])),
  listContractDiscussion: jest.fn((_req, res) => res.json([])),
  listContracts: jest.fn((_req, res) => res.json([])),
  listMyApprovalInbox: jest.fn((_req, res) => res.json([])),
  listSecurityInbox: jest.fn((_req, res) => res.json([])),
  listMasterContracts: jest.fn((_req, res) => res.json([])),
  markContractDiscussionRead: jest.fn((_req, res) => res.json({ ok: true })),
  prepareContractRevision: jest.fn((_req, res) => res.json({ ok: true })),
  previewContractAttachment: jest.fn((_req, res) => res.end()),
  securityVisaDecision: jest.fn((_req, res) => res.json({ ok: true })),
  syncWorkCalendar: jest.fn((_req, res) => res.json({ ok: true })),
  startContractApproval: jest.fn((_req, res) => res.json({ ok: true })),
  uploadContractStepAttachments: jest.fn((_req, res) => res.json({ ok: true })),
  uploadContractAttachments: jest.fn((_req, res) => res.json({ ok: true })),
  updateContractSlaRules: jest.fn((_req, res) => res.json({ ok: true })),
  upsertWorkCalendarDay: jest.fn((_req, res) => res.json({ ok: true })),
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

const incomeContractPayload = {
  contractNumber: null,
  contractType: 'income',
  incomeSubtype: 'with_psr',
  counterpartyName: 'ООО Тест',
  counterpartyInn: '7700000000',
  subject: 'Тестовый договор',
  contractDate: '2026-07-08',
  psrFlag: true,
  signingMethod: 'post',
};

describe('Contracts routes validation', () => {
  beforeEach(() => {
    createContract.mockClear();
    importSignedContract.mockClear();
    updateDraftContract.mockClear();
  });

  it('allows income contract creation without a manual number', async () => {
    const app = createApp();
    const res = await request(app).post('/api/contracts').send(incomeContractPayload);

    expect(res.status).toBe(201);
    expect(createContract).toHaveBeenCalled();
  });

  it('allows addendum creation when a parent contract is selected', async () => {
    const app = createApp();
    const res = await request(app).post('/api/contracts').send({
      ...incomeContractPayload,
      documentKind: 'addendum',
      parentContractId: '11111111-1111-4111-8111-111111111111',
    });

    expect(res.status).toBe(201);
    expect(createContract).toHaveBeenCalled();
  });

  it('rejects addendum creation without a parent contract', async () => {
    const app = createApp();
    const res = await request(app).post('/api/contracts').send({
      ...incomeContractPayload,
      documentKind: 'addendum',
    });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'parentContractId' })]),
    );
    expect(createContract).not.toHaveBeenCalled();
  });

  it('allows draft update without a manual number', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/contracts/00000000-0000-0000-0000-000000000000/draft')
      .send(incomeContractPayload);

    expect(res.status).toBe(200);
    expect(updateDraftContract).toHaveBeenCalled();
  });

  it('returns the real invalid field name on validation errors', async () => {
    const app = createApp();
    const res = await request(app).post('/api/contracts').send({
      ...incomeContractPayload,
      counterpartyInn: '123',
    });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'counterpartyInn' })]),
    );
    expect(createContract).not.toHaveBeenCalled();
  });

  it('imports a signed contract with an attached file', async () => {
    const app = createApp();
    const res = await request(app).post('/api/contracts/import-signed').send({
      ...incomeContractPayload,
      contractNumber: 'ARCH-2026-001',
      files: [{
        name: 'signed.pdf',
        mimeType: 'application/pdf',
        size: 4,
        contentBase64: Buffer.from('%PDF').toString('base64'),
      }],
    });

    expect(res.status).toBe(201);
    expect(importSignedContract).toHaveBeenCalled();
  });

  it('imports a signed addendum with a parent contract and attached file', async () => {
    const app = createApp();
    const res = await request(app).post('/api/contracts/import-signed').send({
      ...incomeContractPayload,
      documentKind: 'addendum',
      parentContractId: '11111111-1111-4111-8111-111111111111',
      contractNumber: 'ARCH-2026-001/DS-1',
      files: [{
        name: 'signed-addendum.pdf',
        mimeType: 'application/pdf',
        size: 4,
        contentBase64: Buffer.from('%PDF').toString('base64'),
      }],
    });

    expect(res.status).toBe(201);
    expect(importSignedContract).toHaveBeenCalled();
  });

  it('rejects signed contract import without files', async () => {
    const app = createApp();
    const res = await request(app).post('/api/contracts/import-signed').send({
      ...incomeContractPayload,
      contractNumber: 'ARCH-2026-002',
    });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'files' })]),
    );
    expect(importSignedContract).not.toHaveBeenCalled();
  });
});
