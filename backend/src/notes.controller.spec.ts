const noteRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  create: jest.fn(),
};

const recipientRepository = {
  delete: jest.fn(),
  save: jest.fn(),
};

const noteReadRepository = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

jest.mock('./config/data-source', () => ({
  AppDataSource: {
    getRepository: jest.fn((entity: any) => {
      if (!entity || !entity.name) return {};
      if (entity.name === 'Note') return noteRepository;
      if (entity.name === 'NoteRecipient') return recipientRepository;
      if (entity.name === 'NoteRead') return noteReadRepository;
      return {};
    }),
  },
}));

const {
  createNote,
  updateNote,
  deleteNote,
  markNoteRead,
  getNoteById,
} = require('./controllers/notes.controller');

describe('Notes controller access rules', () => {
  const makeRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnThis();
    res.json = jest.fn();
    res.send = jest.fn();
    return res;
  };

  const makeNext = () => jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies update for non-author non-admin', async () => {
    noteRepository.findOne.mockResolvedValue({
      id: 'note-1',
      authorId: 'author-1',
      recipients: [],
    });

    const req: any = {
      user: { id: 'user-2', role: 'sales' },
      params: { id: 'note-1' },
      body: { title: 'updated' },
    };
    const res = makeRes();
    const next = makeNext();

    await updateNote(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  it('allows admin to update чужую заметку', async () => {
    noteRepository.findOne.mockResolvedValue({
      id: 'note-1',
      authorId: 'author-1',
      recipients: [],
    });
    noteRepository.save.mockResolvedValue({ id: 'note-1', title: 'updated' });

    const req: any = {
      user: { id: 'admin-1', role: 'admin' },
      params: { id: 'note-1' },
      body: { title: 'updated' },
    };
    const res = makeRes();
    const next = makeNext();

    await updateNote(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'note-1' }));
  });

  it('allows author to update свою заметку', async () => {
    noteRepository.findOne.mockResolvedValue({
      id: 'note-1',
      authorId: 'author-1',
      recipients: [],
    });
    noteRepository.save.mockResolvedValue({ id: 'note-1', title: 'updated' });

    const req: any = {
      user: { id: 'author-1', role: 'sales' },
      params: { id: 'note-1' },
      body: { title: 'updated' },
    };
    const res = makeRes();
    const next = makeNext();

    await updateNote(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'note-1' }));
  });

  it('denies delete for non-author non-admin', async () => {
    noteRepository.findOne.mockResolvedValue({
      id: 'note-1',
      authorId: 'author-1',
    });

    const req: any = {
      user: { id: 'user-2', role: 'sales' },
      params: { id: 'note-1' },
    };
    const res = makeRes();
    const next = makeNext();

    await deleteNote(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  it('allows admin to delete чужую заметку', async () => {
    noteRepository.findOne.mockResolvedValue({
      id: 'note-1',
      authorId: 'author-1',
    });
    noteRepository.delete.mockResolvedValue({});

    const req: any = {
      user: { id: 'admin-1', role: 'admin' },
      params: { id: 'note-1' },
    };
    const res = makeRes();
    const next = makeNext();

    await deleteNote(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('allows author to delete свою заметку', async () => {
    noteRepository.findOne.mockResolvedValue({
      id: 'note-1',
      authorId: 'author-1',
    });
    noteRepository.delete.mockResolvedValue({});

    const req: any = {
      user: { id: 'author-1', role: 'sales' },
      params: { id: 'note-1' },
    };
    const res = makeRes();
    const next = makeNext();

    await deleteNote(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('denies mark read when user has no access', async () => {
    noteRepository.findOne.mockResolvedValue({
      id: 'note-1',
      authorId: 'author-1',
      visibility: 'private',
      recipients: [],
    });

    const req: any = {
      user: { id: 'user-2', role: 'sales' },
      params: { id: 'note-1' },
    };
    const res = makeRes();
    const next = makeNext();

    await markNoteRead(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  it('creates read record when access is allowed', async () => {
    const readAt = new Date('2026-04-01T00:00:00.000Z');
    noteRepository.findOne.mockResolvedValue({
      id: 'note-1',
      authorId: 'author-1',
      visibility: 'broadcast',
      recipients: [],
    });
    noteReadRepository.findOne.mockResolvedValue(null);
    noteReadRepository.create.mockReturnValue({ noteId: 'note-1', userId: 'user-2', readAt });
    noteReadRepository.save.mockResolvedValue({ noteId: 'note-1', userId: 'user-2', readAt });

    const req: any = {
      user: { id: 'user-2', role: 'sales' },
      params: { id: 'note-1' },
    };
    const res = makeRes();
    const next = makeNext();

    await markNoteRead(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ noteId: 'note-1', userId: 'user-2', readAt });
  });

  it('returns recipients for accessible note', async () => {
    noteRepository.findOne.mockResolvedValue({
      id: 'note-1',
      authorId: 'author-1',
      authorName: 'Author',
      visibility: 'targeted',
      startAt: new Date('2026-04-01T09:00:00.000Z'),
      endAt: new Date('2026-04-01T10:00:00.000Z'),
      createdAt: new Date('2026-04-01T08:00:00.000Z'),
      updatedAt: new Date('2026-04-01T08:30:00.000Z'),
      recipients: [
        { userId: 'user-2', roleId: null },
        { userId: null, roleId: 'sales' },
      ],
    });

    const req: any = {
      user: { id: 'user-2', role: 'sales' },
      params: { id: 'note-1' },
    };
    const res = makeRes();
    const next = makeNext();

    await getNoteById(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      id: 'note-1',
      recipientUserIds: ['user-2'],
      recipientRoleIds: ['sales'],
    }));
  });
  it('rejects create with invalid role recipients', async () => {
    const req: any = {
      user: { id: 'user-1', role: 'admin', fullName: 'Admin' },
      body: {
        title: 'note',
        startAt: '2026-04-01T09:00:00.000Z',
        endAt: '2026-04-01T10:00:00.000Z',
        recipientRoleIds: ['not-a-role'],
      },
    };
    const res = makeRes();
    const next = makeNext();

    await createNote(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(400);
  });

  it('rejects update with invalid role recipients', async () => {
    noteRepository.findOne.mockResolvedValue({
      id: 'note-1',
      authorId: 'author-1',
      recipients: [],
    });

    const req: any = {
      user: { id: 'admin-1', role: 'admin' },
      params: { id: 'note-1' },
      body: { recipientRoleIds: ['invalid-role'] },
    };
    const res = makeRes();
    const next = makeNext();

    await updateNote(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(400);
  });
});
