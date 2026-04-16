import api from './api';

export type ApiNote = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  authorId: string;
  authorName: string;
  visibility: 'private' | 'targeted' | 'broadcast';
  createdAt: string;
  updatedAt: string;
  recipientUserIds: string[];
  recipientRoleIds: string[];
  isRead?: boolean;
};

export const listNotes = (params: { from: string; to: string }) =>
  api.get<ApiNote[]>('/notes', { params });

export const createNote = (data: {
  title: string;
  startAt: string;
  endAt: string;
  visibility?: 'private' | 'targeted' | 'broadcast';
  recipientUserIds?: string[];
  recipientRoleIds?: string[];
}) => api.post<ApiNote>('/notes', data);

export const updateNote = (id: string, data: {
  title?: string;
  startAt?: string;
  endAt?: string;
}) => api.patch<ApiNote>(`/notes/${id}`, data);

export const updateNoteRecipients = (id: string, data: {
  visibility?: 'private' | 'targeted' | 'broadcast';
  recipientUserIds?: string[];
  recipientRoleIds?: string[];
}) => api.patch<ApiNote>(`/notes/${id}/recipients`, data);

export const deleteNote = (id: string) => api.delete(`/notes/${id}`);

export const markNoteRead = (id: string) => api.post(`/notes/${id}/read`);

export const getNotesUnreadCount = () => api.get<{ count: number }>('/notes/unread-count');
