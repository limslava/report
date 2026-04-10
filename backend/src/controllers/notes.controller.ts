import { Request, Response, NextFunction } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Note, NoteVisibility } from '../models/note.model';
import { NoteRecipient } from '../models/note-recipient.model';
import { NoteRead } from '../models/note-read.model';
import { ROLE_VALUES } from '../constants/role-definitions';

const noteRepository = AppDataSource.getRepository(Note);
const recipientRepository = AppDataSource.getRepository(NoteRecipient);
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

    const qb = noteRepository
      .createQueryBuilder('note')
      .leftJoinAndSelect('note.recipients', 'recipient')
      .where('note.startAt < :to AND note.endAt > :from', { from, to })
      .orderBy('note.startAt', 'ASC')
      .addOrderBy('note.createdAt', 'ASC');

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

    const note = noteRepository.create({
      title,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      authorId: user.id,
      authorName: user.fullName,
      visibility: resolvedVisibility,
    });

    const saved = await noteRepository.save(note);

    if (resolvedVisibility === 'targeted') {
      const recipients = [
        ...userRecipients.map((userId: string) => ({ noteId: saved.id, userId, roleId: null })),
        ...roleRecipients.map((roleId: string) => ({ noteId: saved.id, userId: null, roleId })),
      ];
      if (recipients.length) {
        await recipientRepository.save(recipients);
      }
    }

    const response = {
      id: saved.id,
      title: saved.title,
      startAt: saved.startAt,
      endAt: saved.endAt,
      authorId: saved.authorId,
      authorName: saved.authorName,
      visibility: saved.visibility,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      recipientUserIds: userRecipients,
      recipientRoleIds: roleRecipients,
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const updateNote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { title, startAt, endAt, visibility, recipientUserIds, recipientRoleIds } = req.body;

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

    if (typeof title === 'string') note.title = title;
    if (startAt) note.startAt = new Date(startAt);
    if (endAt) note.endAt = new Date(endAt);

    const userRecipients = Array.isArray(recipientUserIds) ? recipientUserIds : [];
    const roleRecipients = Array.isArray(recipientRoleIds) ? recipientRoleIds : [];
    validateRoleRecipients(roleRecipients);
    const resolvedVisibility = getVisibility(visibility, userRecipients, roleRecipients);

    if (resolvedVisibility === 'targeted' && !userRecipients.length && !roleRecipients.length) {
      const error: any = new Error('Targeted notes require recipients');
      error.statusCode = 400;
      throw error;
    }

    note.visibility = resolvedVisibility;
    const saved = await noteRepository.save(note);

    await recipientRepository.delete({ noteId: saved.id });
    if (resolvedVisibility === 'targeted') {
      const recipients = [
        ...userRecipients.map((userId: string) => ({ noteId: saved.id, userId, roleId: null })),
        ...roleRecipients.map((roleId: string) => ({ noteId: saved.id, userId: null, roleId })),
      ];
      if (recipients.length) {
        await recipientRepository.save(recipients);
      }
    }

    const response = {
      id: saved.id,
      title: saved.title,
      startAt: saved.startAt,
      endAt: saved.endAt,
      authorId: saved.authorId,
      authorName: saved.authorName,
      visibility: saved.visibility,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      recipientUserIds: userRecipients,
      recipientRoleIds: roleRecipients,
    };

    res.json(response);
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

    await noteRepository.delete({ id });
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
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      recipientUserIds,
      recipientRoleIds,
    });
  } catch (error) {
    next(error);
  }
};
