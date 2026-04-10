import type { CalendarNote } from './calendarNotes';

type UserContext = {
  id?: string;
  role?: string;
} | null | undefined;

export const resolveAuthorId = (note: CalendarNote): string | undefined =>
  note.authorId ?? note.createdById;

export const isOwnNote = (note: CalendarNote, user: UserContext): boolean => {
  if (!user?.id) return false;
  const authorId = resolveAuthorId(note);
  if (!authorId) return false;
  return authorId === user.id;
};

export const isRecipient = (note: CalendarNote, user: UserContext): boolean => {
  if (!user?.id) return false;
  if (note.visibility === 'broadcast') return true;
  if ((note.recipientUserIds ?? []).includes(user.id)) return true;
  if (note.recipientRoleIds && user.role && note.recipientRoleIds.includes(user.role)) return true;
  return note.authorId === user.id;
};

export const canShowAuthor = (note: CalendarNote, user: UserContext): boolean => {
  if (!note.authorName) return false;
  if (isOwnNote(note, user)) return false;
  return isRecipient(note, user);
};

export const isUnreadNote = (note: CalendarNote, user: UserContext): boolean =>
  !note.isRead && !isOwnNote(note, user);

export const isAdminExternalNote = (note: CalendarNote, user: UserContext): boolean =>
  user?.role !== 'admin' && note.authorRole === 'admin';

export const canDeleteNote = (note: CalendarNote, user: UserContext): boolean => {
  if (!user?.id) return false;
  if (user.role === 'admin') return true;
  const authorId = resolveAuthorId(note);
  if (!authorId) return true;
  return authorId === user.id;
};

export const canEditNote = (note: CalendarNote, user: UserContext): boolean =>
  canDeleteNote(note, user);
