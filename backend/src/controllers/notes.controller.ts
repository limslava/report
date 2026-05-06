import { Request, Response, NextFunction } from 'express';
import { In, Not } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Note, NoteVisibility } from '../models/note.model';
import { NoteRecipient } from '../models/note-recipient.model';
import { NoteRead } from '../models/note-read.model';
import { ROLE_VALUES } from '../constants/role-definitions';
import { planWebSocketService } from '../services/websocket.service';

const noteRepository = AppDataSource.getRepository(Note);
const noteReadRepository = AppDataSource.getRepository(NoteRead);
const ROLE_SET = new Set(ROLE_VALUES);

const validateRoleRecipients = (roleRecipients: string[]) => {
  const invalid = roleRecipients.filter(roleId => !ROLE_SET.has(roleId as any));
  if (invalid.length) {
    const error: any = new Error('Invalid role recipients');
    error.statusCode = 400;
    throw error;
  }
};

const getVisibility = (
  visibility: NoteVisibility | undefined,
  recipientUserIds: string[],
  recipientRoleIds: string[]
): NoteVisibility => {
  if (visibility) return visibility;
  if (recipientUserIds.length || recipientRoleIds.length) return 'targeted';
  return 'private';
};

const ensureAccess = (note: Note, userId: string, role: string) => {
  if (role === 'admin') return true;
  if (note.authorId === userId) return true;
  if (note.visibility === 'broadcast') return true;
  const recipients = note.recipients ?? [];
  return recipients.some(recipient => recipient.userId === userId || recipient.roleId === role);
};

const toRecipientsPayload = (note: Note) => {
  const recipients = note.recipients ?? [];
  const recipientUserIds = recipients
    .map(recipient => recipient.userId)
    .filter((id): id is string => Boolean(id));
  const recipientRoleIds = recipients
    .map(recipient => recipient.roleId)
    .filter((id): id is string => Boolean(id));

  return { recipientUserIds, recipientRoleIds };
};

export const listNotes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const from = req.query.from ? new Date(String(req.query.from)) : new Date('1970-01-01T00:00:00.000Z');
    const to = req.query.to ? new Date(String(req.query.to)) : new Date('2100-01-01T00:00:00.000Z');
    const includeClosed = String(req.query.includeClosed || 'false').toLowerCase() === 'true';

    const qb = noteRepository
      .createQueryBuilder('note')
      .leftJoinAndSelect('note.recipients', 'recipient')
      .where('note.startAt < :to AND note.endAt > :from', { from, to })
      .orderBy('note.startAt', 'ASC')
      .addOrderBy('note.createdAt', 'ASC');

    if (!includeClosed) {
      qb.andWhere("note.status != 'closed'");
    }

    if (user.role !== 'admin') {
      qb.andWhere(
        '(note.authorId = :userId OR note.visibility = :broadcast OR recipient.userId = :userId OR recipient.roleId = :role)',
        {
          userId: user.id,
          role: user.role,
          broadcast: 'broadcast',
        }
      );
    }

    qb.distinct(true);

    const notes = await qb.getMany();
    const noteIds = notes.map(note => note.id);

    const reads = noteIds.length
      ? await noteReadRepository.find({ where: { noteId: In(noteIds), userId: user.id } })
      : [];
    const readSet = new Set(reads.map(read => read.noteId));

    const response = notes.map(note => {
      const { recipientUserIds, recipientRoleIds } = toRecipientsPayload(note);
      return {
        id: note.id,
        title: note.title,
        startAt: note.startAt,
        endAt: note.endAt,
        authorId: note.authorId,
        authorName: note.authorName,
        visibility: note.visibility,
        source: note.source,
        status: note.status,
        linkedContractId: note.linkedContractId,
        linkedStepId: note.linkedStepId,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        recipientUserIds,
        recipientRoleIds,
        isRead: readSet.has(note.id),
      };
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const getUnreadCount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const qb = noteRepository
      .createQueryBuilder('note')
      .leftJoin('note.recipients', 'recipient')
      .leftJoin('note.reads', 'read', 'read.userId = :userId', { userId: user.id })
      .where('read.id IS NULL')
      .andWhere('note.authorId != :userId', { userId: user.id });

    if (user.role !== 'admin') {
      qb.andWhere(
        '(note.visibility = :broadcast OR recipient.userId = :userId OR recipient.roleId = :role)',
        {
          userId: user.id,
          role: user.role,
          broadcast: 'broadcast',
        }
      );
    }

    const count = await qb.getCount();
    res.json({ count });
  } catch (error) {
    next(error);
  }
};

export const createNote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { title, startAt, endAt, visibility, recipientUserIds, recipientRoleIds } = req.body;

    const userRecipients = Array.isArray(recipientUserIds) ? recipientUserIds : [];
    const roleRecipients = Array.isArray(recipientRoleIds) ? recipientRoleIds : [];
    validateRoleRecipients(roleRecipients);
    const resolvedVisibility = getVisibility(visibility, userRecipients, roleRecipients);

    if (resolvedVisibility === 'targeted' && !userRecipients.length && !roleRecipients.length) {
      const error: any = new Error('Targeted notes require recipients');
      error.statusCode = 400;
      throw error;
    }

    const saved = await AppDataSource.transaction(async (manager) => {
      const txNoteRepository = manager.getRepository(Note);
      const txRecipientRepository = manager.getRepository(NoteRecipient);
      const note = txNoteRepository.create({
        title,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        authorId: user.id,
        authorName: user.fullName,
        visibility: resolvedVisibility,
        source: 'manual',
        status: 'active',
        linkedContractId: null,
        linkedStepId: null,
      });
      const persisted = await txNoteRepository.save(note);

      if (resolvedVisibility === 'targeted') {
        const recipients = [
          ...userRecipients.map((userId: string) => ({ noteId: persisted.id, userId, roleId: null })),
          ...roleRecipients.map((roleId: string) => ({ noteId: persisted.id, userId: null, roleId })),
        ];
        if (recipients.length) {
          await txRecipientRepository.save(recipients);
        }
      }

      return persisted;
    });

    const response = {
      id: saved.id,
      title: saved.title,
      startAt: saved.startAt,
      endAt: saved.endAt,
      authorId: saved.authorId,
      authorName: saved.authorName,
      visibility: saved.visibility,
      source: saved.source,
      status: saved.status,
      linkedContractId: saved.linkedContractId,
      linkedStepId: saved.linkedStepId,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      recipientUserIds: userRecipients,
      recipientRoleIds: roleRecipients,
    };

    planWebSocketService.notifyNotesUnreadRefresh();
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const updateNote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { title, startAt, endAt } = req.body;

    const note = await noteRepository.findOne({ where: { id }, relations: ['recipients'] });
    if (!note) {
      const error: any = new Error('Note not found');
      error.statusCode = 404;
      throw error;
    }

    if (note.authorId !== user.id && user.role !== 'admin') {
      const error: any = new Error('Only the author can update this note');
      error.statusCode = 403;
      throw error;
    }
    if (note.source === 'system') {
      const error: any = new Error('Системные события БП нельзя редактировать вручную');
      error.statusCode = 400;
      throw error;
    }

    if (typeof title === 'string') note.title = title;
    if (startAt) note.startAt = new Date(startAt);
    if (endAt) note.endAt = new Date(endAt);

    const saved = await noteRepository.save(note);
    const { recipientUserIds, recipientRoleIds } = toRecipientsPayload(note);

    const didChange = typeof title === 'string' || Boolean(startAt) || Boolean(endAt);
    if (didChange) {
      await noteReadRepository.delete({ noteId: saved.id, userId: Not(user.id) });
    }

    const response = {
      id: saved.id,
      title: saved.title,
      startAt: saved.startAt,
      endAt: saved.endAt,
      authorId: saved.authorId,
      authorName: saved.authorName,
      visibility: saved.visibility,
      source: saved.source,
      status: saved.status,
      linkedContractId: saved.linkedContractId,
      linkedStepId: saved.linkedStepId,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      recipientUserIds,
      recipientRoleIds,
    };

    planWebSocketService.notifyNotesUnreadRefresh();
    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const updateNoteRecipients = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { visibility, recipientUserIds, recipientRoleIds } = req.body;

    const note = await noteRepository.findOne({ where: { id }, relations: ['recipients'] });
    if (!note) {
      const error: any = new Error('Note not found');
      error.statusCode = 404;
      throw error;
    }

    if (note.authorId !== user.id && user.role !== 'admin') {
      const error: any = new Error('Only the author can update this note');
      error.statusCode = 403;
      throw error;
    }
    if (note.source === 'system') {
      const error: any = new Error('Системные события БП нельзя изменять вручную');
      error.statusCode = 400;
      throw error;
    }

    const hasRecipientUserIds = Array.isArray(recipientUserIds);
    const hasRecipientRoleIds = Array.isArray(recipientRoleIds);
    const userRecipients = hasRecipientUserIds ? recipientUserIds : [];
    const roleRecipients = hasRecipientRoleIds ? recipientRoleIds : [];
    validateRoleRecipients(roleRecipients);

    const resolvedVisibility = getVisibility(visibility, userRecipients, roleRecipients);
    if (resolvedVisibility === 'targeted' && !userRecipients.length && !roleRecipients.length) {
      const error: any = new Error('Targeted notes require recipients');
      error.statusCode = 400;
      throw error;
    }

    const saved = await AppDataSource.transaction(async (manager) => {
      const txNoteRepository = manager.getRepository(Note);
      const txRecipientRepository = manager.getRepository(NoteRecipient);
      const txNoteReadRepository = manager.getRepository(NoteRead);

      note.visibility = resolvedVisibility;
      const persisted = await txNoteRepository.save(note);

      await txRecipientRepository.delete({ noteId: persisted.id });
      if (resolvedVisibility === 'targeted') {
        const recipients = [
          ...userRecipients.map((userId: string) => ({ noteId: persisted.id, userId, roleId: null })),
          ...roleRecipients.map((roleId: string) => ({ noteId: persisted.id, userId: null, roleId })),
        ];
        if (recipients.length) {
          await txRecipientRepository.save(recipients);
        }
      }

      await txNoteReadRepository.delete({ noteId: persisted.id, userId: Not(user.id) });
      return persisted;
    });

    res.json({
      id: saved.id,
      title: saved.title,
      startAt: saved.startAt,
      endAt: saved.endAt,
      authorId: saved.authorId,
      authorName: saved.authorName,
      visibility: saved.visibility,
      source: saved.source,
      status: saved.status,
      linkedContractId: saved.linkedContractId,
      linkedStepId: saved.linkedStepId,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      recipientUserIds: userRecipients,
      recipientRoleIds: roleRecipients,
    });
    planWebSocketService.notifyNotesUnreadRefresh();
  } catch (error) {
    next(error);
  }
};

export const deleteNote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const note = await noteRepository.findOne({ where: { id } });
    if (!note) {
      const error: any = new Error('Note not found');
      error.statusCode = 404;
      throw error;
    }

    if (note.authorId !== user.id && user.role !== 'admin') {
      const error: any = new Error('Only the author can delete this note');
      error.statusCode = 403;
      throw error;
    }
    if (note.source === 'system') {
      const error: any = new Error('Системные события БП нельзя удалять вручную');
      error.statusCode = 400;
      throw error;
    }

    await noteRepository.delete({ id });
    planWebSocketService.notifyNotesUnreadRefresh();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const markNoteRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const note = await noteRepository.findOne({ where: { id }, relations: ['recipients'] });
    if (!note) {
      const error: any = new Error('Note not found');
      error.statusCode = 404;
      throw error;
    }

    if (!ensureAccess(note, user.id, user.role)) {
      const error: any = new Error('Access denied');
      error.statusCode = 403;
      throw error;
    }

    const existing = await noteReadRepository.findOne({ where: { noteId: id, userId: user.id } });
    if (existing) {
      res.status(204).send();
      return;
    }

    const read = noteReadRepository.create({ noteId: id, userId: user.id });
    await noteReadRepository.save(read);
    planWebSocketService.notifyNotesUnreadRefresh();
    res.status(201).json({ noteId: id, userId: user.id, readAt: read.readAt });
  } catch (error) {
    next(error);
  }
};

export const getNoteById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const note = await noteRepository.findOne({ where: { id }, relations: ['recipients'] });
    if (!note) {
      const error: any = new Error('Note not found');
      error.statusCode = 404;
      throw error;
    }

    if (!ensureAccess(note, user.id, user.role)) {
      const error: any = new Error('Access denied');
      error.statusCode = 403;
      throw error;
    }

    const { recipientUserIds, recipientRoleIds } = toRecipientsPayload(note);

    res.json({
      id: note.id,
      title: note.title,
      startAt: note.startAt,
      endAt: note.endAt,
      authorId: note.authorId,
      authorName: note.authorName,
      visibility: note.visibility,
      source: note.source,
      status: note.status,
      linkedContractId: note.linkedContractId,
      linkedStepId: note.linkedStepId,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      recipientUserIds,
      recipientRoleIds,
    });
  } catch (error) {
    next(error);
  }
};
