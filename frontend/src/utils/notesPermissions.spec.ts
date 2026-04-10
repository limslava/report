import { describe, expect, it } from 'vitest';
import type { CalendarNote } from './calendarNotes';
import {
  canDeleteNote,
  canEditNote,
  canShowAuthor,
  isAdminExternalNote,
  isOwnNote,
  isUnreadNote,
  isRecipient,
} from './notesPermissions';

const baseNote: CalendarNote = {
  id: 'note-1',
  text: 'Note',
  createdAt: new Date().toISOString(),
  authorId: 'author-1',
  authorName: 'Author',
  visibility: 'private',
  recipientUserIds: [],
  recipientRoleIds: [],
};

describe('notes permissions', () => {
  it('allows admin to edit/delete чужие заметки', () => {
    const admin = { id: 'admin-1', role: 'admin' };
    expect(canDeleteNote(baseNote, admin)).toBe(true);
    expect(canEditNote(baseNote, admin)).toBe(true);
  });

  it('denies non-author edit/delete чужих заметок', () => {
    const user = { id: 'user-1', role: 'sales' };
    expect(canDeleteNote(baseNote, user)).toBe(false);
    expect(canEditNote(baseNote, user)).toBe(false);
  });

  it('allows author to edit/delete own note', () => {
    const user = { id: 'author-1', role: 'sales' };
    expect(canDeleteNote(baseNote, user)).toBe(true);
    expect(canEditNote(baseNote, user)).toBe(true);
  });

  it('marks unread only for чужие заметки', () => {
    const otherUser = { id: 'user-2', role: 'sales' };
    const ownUser = { id: 'author-1', role: 'sales' };
    expect(isUnreadNote({ ...baseNote, isRead: false }, otherUser)).toBe(true);
    expect(isUnreadNote({ ...baseNote, isRead: false }, ownUser)).toBe(false);
  });

  it('shows author only for recipients, not for own note', () => {
    const recipientUser = { id: 'user-2', role: 'sales' };
    const noteForUser: CalendarNote = { ...baseNote, visibility: 'targeted', recipientUserIds: ['user-2'] };
    expect(canShowAuthor(noteForUser, recipientUser)).toBe(true);
    expect(canShowAuthor(noteForUser, { id: 'author-1', role: 'sales' })).toBe(false);
  });

  it('detects recipient by role or broadcast', () => {
    const user = { id: 'user-2', role: 'sales' };
    expect(isRecipient({ ...baseNote, visibility: 'broadcast' }, user)).toBe(true);
    expect(isRecipient({ ...baseNote, visibility: 'targeted', recipientRoleIds: ['sales'] }, user)).toBe(true);
  });

  it('flags admin notes for non-admin viewers', () => {
    const note = { ...baseNote, authorRole: 'admin' };
    expect(isAdminExternalNote(note, { id: 'user-1', role: 'sales' })).toBe(true);
    expect(isAdminExternalNote(note, { id: 'admin-1', role: 'admin' })).toBe(false);
  });

  it('recognizes own note', () => {
    expect(isOwnNote(baseNote, { id: 'author-1', role: 'sales' })).toBe(true);
    expect(isOwnNote(baseNote, { id: 'user-2', role: 'sales' })).toBe(false);
  });
});
