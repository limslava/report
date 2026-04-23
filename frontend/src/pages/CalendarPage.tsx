import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '../store/auth-store';
import {
  addMonths,
  buildMonthGrid,
  CalendarNote,
  formatDateKey,
  NotesByDate,
  sameDay,
} from '../utils/calendarNotes';
import {
  canDeleteNote as canDeleteNoteWithUser,
  canEditNote as canEditNoteWithUser,
  canShowAuthor as canShowAuthorWithUser,
  isAdminExternalNote as isAdminExternalNoteWithUser,
  isOwnNote as isOwnNoteWithUser,
  isUnreadNote as isUnreadNoteWithUser,
} from '../utils/notesPermissions';
import { getUsersDirectory } from '../services/api';
import {
  ApiNote,
  createNote as createNoteApi,
  deleteNote as deleteNoteApi,
  listNotes as listNotesApi,
  markNoteRead as markNoteReadApi,
  updateNote as updateNoteApi,
  updateNoteRecipients as updateNoteRecipientsApi,
} from '../services/notes.api';
import '../styles/calendar.css';

function monthLabel(date: Date): string {
  return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function formatMeta(date: Date): string {
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDateParts(date: Date): { day: string; month: string; year: string } {
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    year: String(date.getFullYear()),
  };
}

function parseDateParts(parts: { day: string; month: string; year: string }): Date | null {
  const day = Number(parts.day);
  const month = Number(parts.month);
  let year = Number(parts.year);
  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null;
  if (year < 100) year += 2000;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
    return null;
  }
  return date;
}

function addDays(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

function startOfWeek(date: Date): Date {
  const day = (date.getDay() + 6) % 7; // Monday=0
  return addDays(date, -day);
}

function endOfWeek(date: Date): Date {
  return addDays(startOfWeek(date), 6);
}

function formatDayTitle(date: Date): string {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatWeekTitle(date: Date): string {
  const start = startOfWeek(date);
  const end = endOfWeek(date);
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return (
      String(start.getDate()) +
      '–' +
      String(end.getDate()) +
      ' ' +
      start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    );
  }
  return (
    String(start.getDate()) +
    ' ' +
    start.toLocaleDateString('ru-RU', { month: 'short' }) +
    ' – ' +
    String(end.getDate()) +
    ' ' +
    end.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })
  );
}

function buildYearMonths(anchor: Date): Array<{ label: string; days: Date[] }>{
  const year = anchor.getFullYear();
  const months: Array<{ label: string; days: Date[] }> = [];
  for (let m = 0; m < 12; m += 1) {
    const date = new Date(year, m, 1);
    months.push({
      label: date.toLocaleDateString('ru-RU', { month: 'long' }),
      days: buildMonthGrid(date),
    });
  }
  return months;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}


function getStartTime(note: CalendarNote): string {
  return note.startTime ?? '09:00';
}

function getEndTime(note: CalendarNote): string {
  return note.endTime ?? '10:00';
}



function getWeekIndex(date: Date): number {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

function getEventPreviewTop(rect: DOMRect, container: DOMRect, gutter: number): number {
  return Math.max(gutter, rect.top - container.top - gutter);
}


function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const nextHour = (h + 1) % 24;
  return `${String(nextHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseTimeToMinutes(value: string | undefined): number {
  if (!value) return 9 * 60;
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 9 * 60;
  return h * 60 + m;
}

function formatHourRange(startMinutes: number): { start: string; end: string } {
  const startHour = Math.floor(startMinutes / 60);
  const start = `${String(startHour).padStart(2, '0')}:00`;
  const end = addHour(start);
  return { start, end };
}

function buildDateTime(date: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const next = new Date(date);
  next.setHours(Number.isNaN(h) ? 0 : h, Number.isNaN(m) ? 0 : m, 0, 0);
  return next;
}

function formatTimeValue(date: Date): string {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  director: 'Директор',
  financer: 'Финансовая дирекция',
  manager_sales: 'Отдел продаж',
  manager_ktk_vvo: 'Диспетчерский отдел Влд',
  head_ktk_vvo: 'Руководитель КТК Влд',
  manager_ktk_mow: 'Диспетчерский отдел Мск',
  manager_auto: 'Отдел перевозок автомобилей',
  manager_rail: 'Отдел Железнодорожных перевозок',
  manager_extra: 'Экспедирование',
  manager_to: 'Тех.обслуживание',
};

export default function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notesByDate, setNotesByDate] = useState<NotesByDate>({});
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickDate, setQuickDate] = useState(new Date());
  const [quickDateParts, setQuickDateParts] = useState(() => formatDateParts(new Date()));
  const [quickDraft, setQuickDraft] = useState('');
  const [quickStartTime, setQuickStartTime] = useState('09:00');
  const [quickEndTime, setQuickEndTime] = useState('10:00');
  const [quickEndManual, setQuickEndManual] = useState(false);
  const [showQuickTime, setShowQuickTime] = useState(false);
  const [quickVisibility, setQuickVisibility] = useState<'private' | 'broadcast' | 'roles' | 'users'>('private');
  const [quickUserQuery, setQuickUserQuery] = useState('');
  const [quickRecipientUserIds, setQuickRecipientUserIds] = useState<string[]>([]);
  const [quickRecipientRoleIds, setQuickRecipientRoleIds] = useState<string[]>([]);
  const [quickRecipientError, setQuickRecipientError] = useState('');
  const [selectedNote, setSelectedNote] = useState<CalendarNote | null>(null);
  const [showEventPreview, setShowEventPreview] = useState(false);
  const [eventDraft, setEventDraft] = useState('');
  const [eventTitleEditing, setEventTitleEditing] = useState(false);
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [eventDateParts, setEventDateParts] = useState(() => formatDateParts(new Date()));
  const [eventStartTime, setEventStartTime] = useState('09:00');
  const [eventEndTime, setEventEndTime] = useState('10:00');
  const [eventEndManual, setEventEndManual] = useState(false);
  const [eventVisibility, setEventVisibility] = useState<'private' | 'broadcast' | 'roles' | 'users'>('private');
  const [eventRecipientUserIds, setEventRecipientUserIds] = useState<string[]>([]);
  const [eventRecipientRoleIds, setEventRecipientRoleIds] = useState<string[]>([]);
  const [eventUserQuery, setEventUserQuery] = useState('');
  const [showEventTimeEdit, setShowEventTimeEdit] = useState(false);
  const [showEventRecipients, setShowEventRecipients] = useState(false);
  const [eventPos, setEventPos] = useState<{ top: number; left: number } | null>(null);
  const [eventBasePos, setEventBasePos] = useState<{ top: number; left: number } | null>(null);
  const [eventPreviewSide, setEventPreviewSide] = useState<'left' | 'right'>('right');
  const [eventTailOffset, setEventTailOffset] = useState(14);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    note: CalendarNote;
    dateKey: string;
  } | null>(null);
  const [usersDirectory, setUsersDirectory] = useState<Array<{ id: string; fullName: string; role: string }>>([]);
  const quickInputRef = useRef<HTMLTextAreaElement | null>(null);
  const quickAddRef = useRef<HTMLDivElement | null>(null);
  const eventTitleRef = useRef<HTMLTextAreaElement | null>(null);
  const eventPreviewRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const calendarMainRef = useRef<HTMLDivElement | null>(null);
  const { user } = useAuthStore();

  const authorRoleMap = useMemo(() => {
    const map = new Map<string, string>();
    usersDirectory.forEach((entry) => map.set(entry.id, entry.role));
    return map;
  }, [usersDirectory]);

  const monthDays = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const selectedKey = formatDateKey(selectedDate);
  const notes = notesByDate[selectedKey] ?? [];
  const yearMonths = useMemo(() => buildYearMonths(cursor), [cursor]);
  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate);
    return Array.from({ length: 7 }).map((_, idx) => addDays(start, idx));
  }, [selectedDate]);
  const roleOptions = useMemo(
    () => Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
    []
  );
  const filteredRoleOptions = useMemo(
    () => (user?.role ? roleOptions.filter((role) => role.value !== user.role) : roleOptions),
    [roleOptions, user?.role]
  );
  const filteredUsersDirectory = useMemo(
    () => {
      const trimmed = quickUserQuery.trim().toLowerCase();
      const base = user?.id ? usersDirectory.filter((entry) => entry.id !== user.id) : usersDirectory;
      if (!trimmed) return base;
      return base.filter((entry) => entry.fullName.toLowerCase().includes(trimmed));
    },
    [usersDirectory, user?.id, quickUserQuery]
  );
  const eventFilteredUsersDirectory = useMemo(
    () => {
      const trimmed = eventUserQuery.trim().toLowerCase();
      const base = user?.id ? usersDirectory.filter((entry) => entry.id !== user.id) : usersDirectory;
      if (!trimmed) return base;
      return base.filter((entry) => entry.fullName.toLowerCase().includes(trimmed));
    },
    [usersDirectory, user?.id, eventUserQuery]
  );
  const userNameMap = useMemo(
    () => new Map(usersDirectory.map((entry) => [entry.id, entry.fullName])),
    [usersDirectory]
  );
  const isAdminExternalNote = (note: CalendarNote) => isAdminExternalNoteWithUser(note, user);
  const isOwnNote = (note: CalendarNote) => isOwnNoteWithUser(note, user);
  const canShowAuthor = (note: CalendarNote) => canShowAuthorWithUser(note, user);
  const isUnreadNote = (note: CalendarNote) => isUnreadNoteWithUser(note, user);
  const deriveNoteVisibility = (note: CalendarNote) => {
    if (note.visibility === 'broadcast') return 'broadcast';
    if (note.visibility === 'private') return 'private';
    if (note.recipientUserIds?.length) return 'users';
    return 'roles';
  };
  useEffect(() => {
    if (!user?.role) return;
    setQuickRecipientRoleIds((prev) => prev.filter((id) => id !== user.role));
  }, [user?.role]);
  useEffect(() => {
    if (!user?.id) return;
    setQuickRecipientUserIds((prev) => prev.filter((id) => id !== user.id));
  }, [user?.id]);
  useEffect(() => {
    if (!selectedNote) return;
    setEventVisibility(deriveNoteVisibility(selectedNote));
    setEventRecipientUserIds(selectedNote.recipientUserIds ?? []);
    setEventRecipientRoleIds(selectedNote.recipientRoleIds ?? []);
    setEventUserQuery('');
  }, [selectedNote?.id]);

  const weekRowHeight = 44;
  const dayRowHeight = 32;
  const formatRecipients = (note: CalendarNote) => {
    if (note.visibility === "broadcast") return "Всем";
    if (note.visibility === "private") return "Личное";
    const roles = (note.recipientRoleIds ?? []).map((id) => ROLE_LABELS[id] ?? id);
    const users = (note.recipientUserIds ?? []).map((id) => userNameMap.get(id) ?? id);
    const targets = [...roles, ...users].filter(Boolean);
    if (targets.length === 0) return "Адресаты не указаны";
    return targets.join(", ");
  };
  const canDeleteNote = (note: CalendarNote) => canDeleteNoteWithUser(note, user);
  const canEditNote = (note: CalendarNote) => canEditNoteWithUser(note, user);

  const mapApiNote = useCallback((note: ApiNote): CalendarNote => {
    const start = new Date(note.startAt);
    const end = new Date(note.endAt);
    const resolvedRole =
      authorRoleMap.get(note.authorId) ?? (note.authorId === user?.id ? user?.role : undefined);
    return {
      id: note.id,
      text: note.title,
      createdAt: typeof note.createdAt === 'string' ? note.createdAt : new Date(note.createdAt).toISOString(),
      authorId: note.authorId,
      authorName: note.authorName,
      authorRole: resolvedRole,
      visibility: note.visibility,
      recipientUserIds: note.recipientUserIds,
      recipientRoleIds: note.recipientRoleIds,
      startAt: note.startAt,
      endAt: note.endAt,
      startTime: formatTimeValue(start),
      endTime: formatTimeValue(end),
      isRead: note.isRead ?? false,
    };
  }, [authorRoleMap, user?.id, user?.role]);

  const groupNotesByDate = useCallback((items: CalendarNote[]): NotesByDate => {
    const grouped = items.reduce<NotesByDate>((acc, note) => {
      const key = formatDateKey(new Date(note.startAt ?? note.createdAt));
      acc[key] = acc[key] ? [...acc[key], note] : [note];
      return acc;
    }, {});
    Object.keys(grouped).forEach((key) => {
      grouped[key] = grouped[key].sort(
        (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
      );
    });
    return grouped;
  }, []);

  useEffect(() => {
    if (!user) return;
    const loadDirectory = async () => {
      try {
        const response = await getUsersDirectory();
        const data = Array.isArray(response.data) ? response.data : [];
        setUsersDirectory(data);
      } catch {
        setUsersDirectory([]);
      }
    };
    loadDirectory();
  }, [user]);

  const getRangeForView = useCallback(() => {
    if (viewMode === 'day') {
      const from = new Date(selectedDate);
      from.setHours(0, 0, 0, 0);
      const to = addDays(from, 1);
      return { from, to };
    }
    if (viewMode === 'week') {
      const from = startOfWeek(selectedDate);
      from.setHours(0, 0, 0, 0);
      const to = addDays(endOfWeek(selectedDate), 1);
      to.setHours(0, 0, 0, 0);
      return { from, to };
    }
    if (viewMode === 'year') {
      const from = new Date(cursor.getFullYear(), 0, 1);
      const to = new Date(cursor.getFullYear() + 1, 0, 1);
      return { from, to };
    }
    const from = new Date(monthDays[0]);
    from.setHours(0, 0, 0, 0);
    const to = addDays(monthDays[monthDays.length - 1], 1);
    to.setHours(0, 0, 0, 0);
    return { from, to };
  }, [cursor, monthDays, selectedDate, viewMode]);

  const loadNotesForView = useCallback(async () => {
    try {
      const range = getRangeForView();
      const response = await listNotesApi({ from: range.from.toISOString(), to: range.to.toISOString() });
      const notes = Array.isArray(response.data) ? response.data : [];
      const mapped = notes.map(mapApiNote);
      setNotesByDate(groupNotesByDate(mapped));
    } catch {
      setNotesByDate({});
    }
  }, [getRangeForView, groupNotesByDate, mapApiNote]);

  useEffect(() => {
    if (!user) return;
    loadNotesForView();
  }, [user, loadNotesForView]);

  useEffect(() => {
    if (authorRoleMap.size === 0) return;
    setNotesByDate((prev) => {
      const next: NotesByDate = {};
      Object.entries(prev).forEach(([key, list]) => {
        next[key] = list.map((note) => ({
          ...note,
          authorRole: note.authorId ? authorRoleMap.get(note.authorId) : note.authorRole,
        }));
      });
      return next;
    });
  }, [authorRoleMap]);

  const addQuickNote = async (override?: { date?: Date; startTime?: string; endTime?: string }) => {
    const text = quickDraft.trim();
    if (!text) return;
    const baseDate = override?.date ?? quickDate;
    const startTime = override?.startTime ?? (quickStartTime || '09:00');
    const endTime = override?.endTime ?? (quickEndTime || '10:00');
    const startAt = buildDateTime(baseDate, startTime);
    const endAt = buildDateTime(baseDate, endTime);
    const visibility =
      quickVisibility === 'private'
        ? 'private'
        : quickVisibility === 'broadcast'
          ? 'broadcast'
          : 'targeted';
    if (visibility === 'targeted' && quickRecipientRoleIds.length === 0 && quickRecipientUserIds.length === 0) {
      setQuickRecipientError(
        quickVisibility === 'roles'
          ? 'Выберите хотя бы одну роль.'
          : quickVisibility === 'users'
            ? 'Выберите хотя бы одного сотрудника.'
            : 'Выберите хотя бы одного получателя.'
      );
      return;
    }
    setQuickRecipientError('');
    try {
      const response = await createNoteApi({
        title: text,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        visibility,
        recipientRoleIds: visibility === 'targeted' ? quickRecipientRoleIds : [],
        recipientUserIds: visibility === 'targeted' ? quickRecipientUserIds : [],
      });
      const created = mapApiNote(response.data);
      setNotesByDate((prev) => {
        const next = { ...prev };
        const key = formatDateKey(new Date(created.startAt ?? created.createdAt));
        next[key] = [...(next[key] ?? []), created];
        return next;
      });
      window.dispatchEvent(new CustomEvent('notes:unread-refresh'));
    } catch {
      // ignore for now
    }
    setQuickDraft('');
    setQuickEndManual(false);
    setShowQuickTime(false);
    setShowQuickAdd(false);
  };

  const handleQuickDateTimeSubmit = () => {
    const parsed = parseDateParts(quickDateParts);
    const targetDate = parsed ?? quickDate;
    if (parsed) {
      setQuickDate(parsed);
      setSelectedDate(parsed);
      setCursor(parsed);
      setQuickDateParts(formatDateParts(parsed));
    }
    addQuickNote({ date: targetDate, startTime: quickStartTime, endTime: quickEndTime });
  };

  const upsertNoteInState = (note: CalendarNote) => {
    setNotesByDate((prev) => {
      const next: NotesByDate = {};
      const targetKey = formatDateKey(new Date(note.startAt ?? note.createdAt));
      Object.entries(prev).forEach(([key, list]) => {
        next[key] = list.filter((item) => item.id !== note.id);
      });
      next[targetKey] = [...(next[targetKey] ?? []), note];
      return next;
    });
  };

  const updateNoteLocal = (id: string, text: string) => {
    setNotesByDate((prev) => {
      const next: NotesByDate = {};
      Object.entries(prev).forEach(([key, list]) => {
        next[key] = list.map((note) => (
          note.id === id ? { ...note, text } : note
        ));
      });
      return next;
    });
  };

  const commitNoteText = async (note: CalendarNote, text: string) => {
    if (!canEditNote(note)) return;
    const nextText = text.trim() || note.text;
    try {
      const response = await updateNoteApi(note.id, {
        title: nextText,
      });
      const updated = mapApiNote(response.data);
      upsertNoteInState(updated);
      if (selectedNote?.id === note.id) {
        setSelectedNote(updated);
        setEventDraft(updated.text);
      }
    } catch {
      updateNoteLocal(note.id, note.text);
    }
  };

  const removeNote = async (id: string) => {
    const target = notesByDate[selectedKey]?.find((note) => note.id === id);
    if (!target) return;
    if (!canDeleteNote(target)) return;
    try {
      await deleteNoteApi(id);
      setNotesByDate((prev) => ({
        ...prev,
        [selectedKey]: (prev[selectedKey] ?? []).filter((note) => note.id !== id),
      }));
      if (selectedNote?.id === id) {
        setShowEventPreview(false);
        setSelectedNote(null);
      }
      window.dispatchEvent(new CustomEvent('notes:unread-refresh'));
    } catch {
      // ignore
    }
  };

  const removeNoteByKey = async (key: string, id: string) => {
    const target = (notesByDate[key] ?? []).find((note) => note.id === id);
    if (!target || !canDeleteNote(target)) return;
    try {
      await deleteNoteApi(id);
      setNotesByDate((prev) => ({
        ...prev,
        [key]: (prev[key] ?? []).filter((note) => note.id !== id),
      }));
      if (selectedNote?.id === id) {
        setShowEventPreview(false);
        setSelectedNote(null);
      }
      window.dispatchEvent(new CustomEvent('notes:unread-refresh'));
    } catch {
      // ignore
    }
  };

  const openQuickForDate = (date: Date) => {
    setSelectedDate(date);
    setCursor(date);
    setQuickDate(date);
    setQuickDateParts(formatDateParts(date));
    setQuickDraft('');
    setQuickStartTime('09:00');
    setQuickEndTime('10:00');
    setQuickEndManual(false);
    setShowQuickTime(false);
    setQuickVisibility('private');
    setQuickRecipientRoleIds([]);
    setQuickRecipientUserIds([]);
    setShowEventPreview(false);
    setShowQuickAdd(true);
    setTimeout(() => quickInputRef.current?.focus(), 0);
  };

  const openQuickForDateTime = (date: Date, startMinutes: number) => {
    const range = formatHourRange(startMinutes);
    setSelectedDate(date);
    setCursor(date);
    setQuickDate(date);
    setQuickDateParts(formatDateParts(date));
    setQuickDraft('');
    setQuickStartTime(range.start);
    setQuickEndTime(range.end);
    setQuickEndManual(false);
    setShowQuickTime(false);
    setQuickVisibility('private');
    setQuickRecipientRoleIds([]);
    setQuickRecipientUserIds([]);
    setShowEventPreview(false);
    setShowQuickAdd(true);
    setTimeout(() => quickInputRef.current?.focus(), 0);
  };

  const openEventPreview = (note: CalendarNote, date: Date) => {
    setSelectedDate(date);
    setSelectedNote(note);
    setEventDraft(note.text);
    setEventTitleEditing(false);
    setEventDate(date);
    setEventDateParts(formatDateParts(date));
    setEventStartTime(getStartTime(note));
    setEventEndTime(getEndTime(note));
    setEventEndManual(false);
    setShowEventTimeEdit(false);
    setShowEventRecipients(false);
    setShowQuickAdd(false);
    setShowQuickTime(false);
    setShowEventPreview(true);
    if (user && note.authorId && note.authorId !== user.id && !note.isRead) {
      markNoteReadApi(note.id).then(() => {
        setNotesByDate((prev) => {
          const next: NotesByDate = {};
          Object.entries(prev).forEach(([key, list]) => {
            next[key] = list.map((item) => (
              item.id === note.id ? { ...item, isRead: true } : item
            ));
          });
          return next;
        });
        window.dispatchEvent(new CustomEvent('notes:unread-refresh'));
      }).catch(() => {});
    }
  };

  const commitEventTitle = async (closeAfter = false) => {
    if (!selectedNote) return;
    if (!canEditNote(selectedNote)) {
      setEventTitleEditing(false);
      setEventDraft(selectedNote.text);
      if (closeAfter) {
        setShowEventPreview(false);
      }
      return;
    }
    const nextText = eventDraft.trim() || selectedNote.text;
    try {
      const response = await updateNoteApi(selectedNote.id, {
        title: nextText,
      });
      const updated = mapApiNote(response.data);
      upsertNoteInState(updated);
      setSelectedNote(updated);
      setEventDraft(updated.text);
    } catch {
      updateNoteLocal(selectedNote.id, nextText);
      setSelectedNote({ ...selectedNote, text: nextText });
      setEventDraft(nextText);
    }
    setEventTitleEditing(false);
    if (closeAfter) {
      setShowEventPreview(false);
    }
  };

  const applyEventDateTime = async (nextDate: Date, nextStart: string, nextEnd: string) => {
    if (!selectedNote) return;
    if (!canEditNote(selectedNote)) {
      setShowEventTimeEdit(false);
      return;
    }
    const startAt = buildDateTime(nextDate, nextStart);
    const endAt = buildDateTime(nextDate, nextEnd);
    try {
      const response = await updateNoteApi(selectedNote.id, {
        title: eventDraft.trim() || selectedNote.text,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      });
      const updated = mapApiNote(response.data);
      upsertNoteInState(updated);
      setSelectedNote(updated);
      setEventDate(new Date(updated.startAt ?? startAt));
      setSelectedDate(new Date(updated.startAt ?? startAt));
      setCursor(new Date(updated.startAt ?? startAt));
    } catch {
      // ignore
    }
  };

  const handleEventDateTimeSubmit = (closeAfter = true) => {
    const parsed = parseDateParts(eventDateParts);
    const targetDate = parsed ?? eventDate ?? selectedDate;
    if (!targetDate) return;
    if (parsed) {
      setEventDateParts(formatDateParts(parsed));
    }
    applyEventDateTime(targetDate, eventStartTime, eventEndTime);
    setShowEventTimeEdit(false);
    if (closeAfter) {
      setShowEventRecipients(false);
      setShowEventPreview(false);
    }
  };

  const resetEventTimeDraft = () => {
    if (!selectedNote || !eventDate) return;
    setEventDateParts(formatDateParts(eventDate));
    setEventStartTime(getStartTime(selectedNote));
    setEventEndTime(getEndTime(selectedNote));
    setEventEndManual(false);
  };

  const resetEventRecipientsDraft = () => {
    if (!selectedNote) return;
    const baseVisibility = deriveNoteVisibility(selectedNote);
    setEventVisibility(baseVisibility);
    setEventRecipientUserIds(selectedNote.recipientUserIds ?? []);
    setEventRecipientRoleIds(selectedNote.recipientRoleIds ?? []);
    setEventUserQuery('');
  };

  const commitEventRecipientsIfValid = () => {
    if (!selectedNote) return false;
    if (!canEditNote(selectedNote)) return false;
    if (eventVisibility === 'roles' && eventRecipientRoleIds.length === 0) return false;
    if (eventVisibility === 'users' && eventRecipientUserIds.length === 0) return false;
    commitEventRecipients(eventVisibility, eventRecipientUserIds, eventRecipientRoleIds);
    return true;
  };

  const commitEventRecipients = async (nextVisibility = eventVisibility, nextUserIds = eventRecipientUserIds, nextRoleIds = eventRecipientRoleIds) => {
    if (!selectedNote) return;
    if (!canEditNote(selectedNote)) return;
    const visibility =
      nextVisibility === 'private'
        ? 'private'
        : nextVisibility === 'broadcast'
          ? 'broadcast'
          : 'targeted';
    const userIds = visibility === 'targeted' ? nextUserIds : [];
    const roleIds = visibility === 'targeted' ? nextRoleIds : [];
    if (visibility === 'targeted' && userIds.length === 0 && roleIds.length === 0) {
      return;
    }
    try {
      const response = await updateNoteRecipientsApi(selectedNote.id, {
        visibility,
        recipientUserIds: userIds,
        recipientRoleIds: roleIds,
      });
      const updated = mapApiNote(response.data);
      upsertNoteInState(updated);
      setSelectedNote(updated);
    } catch {
      // ignore
    }
  };


  const shiftView = (delta: number) => {
    if (viewMode === 'day') {
      setSelectedDate((prev) => addDays(prev, delta));
      setCursor((prev) => addDays(prev, delta));
      setShowEventPreview(false);
      setShowEventTimeEdit(false);
      setContextMenu(null);
      return;
    }
    if (viewMode === 'week') {
      setSelectedDate((prev) => addDays(prev, delta * 7));
      setCursor((prev) => addDays(prev, delta * 7));
      setShowEventPreview(false);
      setShowEventTimeEdit(false);
      setContextMenu(null);
      return;
    }
    if (viewMode === 'year') {
      const next = new Date(cursor);
      next.setFullYear(next.getFullYear() + delta);
      setCursor(next);
      setShowEventPreview(false);
      setShowEventTimeEdit(false);
      setContextMenu(null);
      return;
    }
    setCursor(addMonths(cursor, delta));
    setShowEventPreview(false);
    setShowEventTimeEdit(false);
    setContextMenu(null);
  };

  const handleSwipeStart = (x: number, y: number) => {
    swipeStart.current = { x, y };
  };

  const handleSwipeEnd = (x: number, y: number) => {
    if (!swipeStart.current) return;
    const dx = x - swipeStart.current.x;
    const dy = y - swipeStart.current.y;
    swipeStart.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      shiftView(dx < 0 ? 1 : -1);
    }
  };

  useEffect(() => {
    if (!showEventPreview) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showEventTimeEdit) {
          resetEventTimeDraft();
          setShowEventTimeEdit(false);
        }
        if (showEventRecipients) {
          resetEventRecipientsDraft();
          setShowEventRecipients(false);
        }
        setShowEventPreview(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showEventPreview, showEventRecipients, showEventTimeEdit]);

  useEffect(() => {
    if (!showEventPreview) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (eventPreviewRef.current?.contains(target)) {
        return;
      }
      if (contextMenuRef.current?.contains(target)) {
        return;
      }
      if (quickAddRef.current?.contains(target)) {
        return;
      }
      if (eventTitleEditing) {
        commitEventTitle(true);
        return;
      }
      if (showEventTimeEdit) {
        handleEventDateTimeSubmit(true);
        return;
      }
      if (showEventRecipients) {
        const committed = commitEventRecipientsIfValid();
        if (committed) {
          setShowEventRecipients(false);
          setShowEventPreview(false);
        } else {
          resetEventRecipientsDraft();
          setShowEventRecipients(false);
          setShowEventPreview(false);
        }
        return;
      }
      setShowEventPreview(false);
      setShowEventTimeEdit(false);
    };
    window.addEventListener('mousedown', handleClick, true);
    return () => window.removeEventListener('mousedown', handleClick, true);
  }, [showEventPreview, eventTitleEditing, showEventRecipients, showEventTimeEdit]);

  useEffect(() => {
    if (!showEventPreview || !eventPreviewRef.current || !eventBasePos || !eventDate) return;
    const weekIndex = getWeekIndex(eventDate);
    const gutter = 12;
    const tailBase = 14;
    const height = eventPreviewRef.current.getBoundingClientRect().height;
    let shift = 0;
    let nextTail = tailBase;
    if (weekIndex === 3) {
      shift = Math.max(0, height / 2 - tailBase);
      nextTail = tailBase + shift;
    } else if (weekIndex >= 4 && (showEventRecipients || showEventTimeEdit)) {
      shift = Math.max(0, height - 2 * tailBase);
      nextTail = Math.max(tailBase, height - tailBase);
    }
    const nextTop = Math.max(gutter, eventBasePos.top - shift);
    setEventTailOffset(nextTail);
    setEventPos((prev) => {
      if (!prev || prev.left !== eventBasePos.left || Math.abs(prev.top - nextTop) > 1) {
        return { left: eventBasePos.left, top: nextTop };
      }
      return prev;
    });
  }, [showEventPreview, eventBasePos, eventDate, showEventRecipients, eventVisibility, showEventTimeEdit]);

  useEffect(() => {
    if (!eventTitleEditing) return;
    const handleClick = (event: MouseEvent) => {
      if (!eventPreviewRef.current) return;
      if (!eventPreviewRef.current.contains(event.target as Node)) {
        commitEventTitle();
      }
    };
    window.addEventListener('mousedown', handleClick, true);
    return () => window.removeEventListener('mousedown', handleClick, true);
  }, [eventTitleEditing]);

  useEffect(() => {
    if (!showQuickAdd) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowQuickAdd(false);
        setShowQuickTime(false);
      }
    };
    const handleClick = (event: MouseEvent) => {
      if (!quickAddRef.current) return;
      if (!quickAddRef.current.contains(event.target as Node)) {
        if (quickDraft.trim()) {
          addQuickNote();
        } else {
          setShowQuickAdd(false);
          setShowQuickTime(false);
        }
      }
    };
    window.addEventListener('keydown', handleKey, true);
    window.addEventListener('mousedown', handleClick, true);
    return () => {
      window.removeEventListener('keydown', handleKey, true);
      window.removeEventListener('mousedown', handleClick, true);
    };
  }, [showQuickAdd, quickDraft]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };
    const handleClick = (event: MouseEvent) => {
      if (contextMenuRef.current && contextMenuRef.current.contains(event.target as Node)) {
        return;
      }
      setContextMenu(null);
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [contextMenu]);

  useEffect(() => {
    setShowEventPreview(false);
    setShowEventTimeEdit(false);
    setContextMenu(null);
  }, [viewMode]);

  const title = viewMode === 'day'
    ? formatDayTitle(selectedDate)
    : viewMode === 'week'
      ? formatWeekTitle(selectedDate)
      : viewMode === 'year'
        ? String(cursor.getFullYear())
        : monthLabel(cursor);

  return (
    <div className="calendar">
      <div className="cal-shell page">
        <div className="calendar-card fade-in cal-sidebar">
          <div className="fade-in notes-card">
            <div className="calendar-header">
              <div>
                <h3>Заметки на {formatMeta(selectedDate)}</h3>
              </div>
            </div>

            <div className="note-list" style={{ marginTop: 12 }}>
              {notes.length === 0 && <div className="cal-muted">Заметок на этот день пока нет.</div>}
              {notes.map((note) => (
                <div key={note.id} className={cx('note-item', isUnreadNote(note) && 'unread', isOwnNote(note) && 'own', isAdminExternalNote(note) && 'admin-external')}>
                  <div className="note-meta">
                    <div className="note-meta-main">
                      <div className="note-time-row">
                        <span>{getStartTime(note)} — {getEndTime(note)}</span>
                        
                      </div>
                      {canShowAuthor(note) && (
                        <span className="note-author">от {note.authorName}</span>
                      )}
                      {isOwnNote(note) && (
                        <span className="note-recipient">Кому: {formatRecipients(note)}</span>
                      )}
                    </div>
                    {canDeleteNote(note) && (
                      <button onClick={() => removeNote(note.id)}>Удалить</button>
                    )}
                  </div>
                  <textarea
                    rows={2}
                    value={note.text}
                    readOnly={!canEditNote(note)}
                    onChange={(event) => updateNoteLocal(note.id, event.target.value)}
                    onBlur={(event) => commitNoteText(note, event.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="cal-main">
          <div
            className="calendar-card fade-in calendar-main"
            ref={calendarMainRef}
            onTouchStart={(event) => handleSwipeStart(event.touches[0].clientX, event.touches[0].clientY)}
            onTouchEnd={(event) => handleSwipeEnd(event.changedTouches[0].clientX, event.changedTouches[0].clientY)}
            onMouseDown={(event) => handleSwipeStart(event.clientX, event.clientY)}
            onMouseUp={(event) => handleSwipeEnd(event.clientX, event.clientY)}
          >
            <div className="cal-toolbar toolbar-row">
              <div className={cx('toolbar-title', (viewMode === 'day' || viewMode === 'week') && 'compact')}>{title}</div>
              <div className="segmented">
                <button className={viewMode === 'day' ? 'active' : ''} onClick={() => setViewMode('day')}>День</button>
                <button className={viewMode === 'week' ? 'active' : ''} onClick={() => setViewMode('week')}>Неделя</button>
                <button className={viewMode === 'month' ? 'active' : ''} onClick={() => setViewMode('month')}>Месяц</button>
                <button className={viewMode === 'year' ? 'active' : ''} onClick={() => setViewMode('year')}>Год</button>
              </div>
              <div className="month-nav">
                <button className="pill" onClick={() => shiftView(-1)}>←</button>
                <button
                  className="pill"
                  onClick={() => {
                    const now = new Date();
                    setSelectedDate(now);
                    setCursor(now);
                  }}
                >
                  Сегодня
                </button>
                <button className="pill" onClick={() => shiftView(1)}>→</button>
              </div>
            </div>

            {showQuickAdd && (
              <div className="quick-add floating" ref={quickAddRef}>
                <div className="cal-muted">Быстрая заметка на {formatMeta(quickDate)}</div>
                <textarea
                  rows={2}
                  placeholder="Новая заметка…"
                  value={quickDraft}
                  onChange={(event) => setQuickDraft(event.target.value)}
                  ref={quickInputRef}
                  onFocus={() => setShowQuickTime(false)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      addQuickNote();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setShowQuickAdd(false);
                      setShowQuickTime(false);
                    }
                  }}
                />
                {showQuickTime ? (
                  <div
                    className="time-panel"
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape') return;
                      event.preventDefault();
                      setShowQuickAdd(false);
                      setShowQuickTime(false);
                    }}
                  >
                    <label className="date-label">
                      Дата
                      <div className="date-segments">
                        <input
                          className="date-segment"
                          inputMode="numeric"
                          value={quickDateParts.day}
                          maxLength={2}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) => {
                            const next = event.target.value.replace(/\D/g, '').slice(0, 2);
                            setQuickDateParts((prev) => ({ ...prev, day: next }));
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleQuickDateTimeSubmit();
                            }
                          }}
                          onBlur={() => {
                            const parsed = parseDateParts(quickDateParts);
                            if (parsed) {
                              setQuickDate(parsed);
                              setSelectedDate(parsed);
                              setCursor(parsed);
                              setQuickDateParts(formatDateParts(parsed));
                            } else {
                              setQuickDateParts(formatDateParts(quickDate));
                            }
                          }}
                        />
                        <span className="date-sep">.</span>
                        <input
                          className="date-segment"
                          inputMode="numeric"
                          value={quickDateParts.month}
                          maxLength={2}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) => {
                            const next = event.target.value.replace(/\D/g, '').slice(0, 2);
                            setQuickDateParts((prev) => ({ ...prev, month: next }));
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleQuickDateTimeSubmit();
                            }
                          }}
                          onBlur={() => {
                            const parsed = parseDateParts(quickDateParts);
                            if (parsed) {
                              setQuickDate(parsed);
                              setSelectedDate(parsed);
                              setCursor(parsed);
                              setQuickDateParts(formatDateParts(parsed));
                            } else {
                              setQuickDateParts(formatDateParts(quickDate));
                            }
                          }}
                        />
                        <span className="date-sep">.</span>
                        <input
                          className="date-segment year"
                          inputMode="numeric"
                          value={quickDateParts.year}
                          maxLength={4}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) => {
                            const next = event.target.value.replace(/\D/g, '').slice(0, 4);
                            setQuickDateParts((prev) => ({ ...prev, year: next }));
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleQuickDateTimeSubmit();
                            }
                          }}
                          onBlur={() => {
                            const parsed = parseDateParts(quickDateParts);
                            if (parsed) {
                              setQuickDate(parsed);
                              setSelectedDate(parsed);
                              setCursor(parsed);
                              setQuickDateParts(formatDateParts(parsed));
                            } else {
                              setQuickDateParts(formatDateParts(quickDate));
                            }
                          }}
                        />
                      </div>
                    </label>
                    <label>
                      Начало
                      <input
                        type="time"
                        value={quickStartTime}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => {
                          const next = event.target.value;
                          setQuickStartTime(next);
                          if (!quickEndManual) {
                            setQuickEndTime(addHour(next));
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleQuickDateTimeSubmit();
                          }
                        }}
                      />
                    </label>
                    <label>
                      Конец
                      <input
                        type="time"
                        value={quickEndTime}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => {
                          setQuickEndTime(event.target.value);
                          setQuickEndManual(true);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleQuickDateTimeSubmit();
                          }
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <button
                    className="quick-time-row"
                    onClick={() => setShowQuickTime((prev) => !prev)}
                    type="button"
                  >
                    {formatMeta(quickDate)} {quickStartTime} — {quickEndTime}
                  </button>
                )}
                <div
                  className="quick-recipients"
                  onMouseDown={() => setShowQuickTime(false)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setShowQuickAdd(false);
                      setShowQuickTime(false);
                      return;
                    }
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    addQuickNote();
                  }}
                >
                  <div className="quick-recipient-header">Кому</div>
                  <div className="quick-targets">
                    <button
                      type="button"
                      className="quick-target"
                      data-active={quickVisibility === 'private'}
                      onClick={() => {
                        setQuickVisibility('private');
                        setQuickRecipientRoleIds([]);
                        setQuickRecipientUserIds([]);
                        setQuickRecipientError('');
                      }}
                    >
                      Лично
                    </button>
                    <button
                      type="button"
                      className="quick-target"
                      data-active={quickVisibility === 'broadcast'}
                      onClick={() => {
                        setQuickVisibility('broadcast');
                        setQuickRecipientRoleIds([]);
                        setQuickRecipientUserIds([]);
                        setQuickRecipientError('');
                      }}
                    >
                      Всем
                    </button>
                    <button
                      type="button"
                      className="quick-target"
                      data-active={quickVisibility === 'roles'}
                      onClick={() => {
                        setQuickVisibility('roles');
                        setQuickRecipientUserIds([]);
                        setQuickRecipientError('');
                      }}
                    >
                      Роли
                    </button>
                    <button
                      type="button"
                      className="quick-target"
                      data-active={quickVisibility === 'users'}
                      onClick={() => {
                        setQuickVisibility('users');
                        setQuickRecipientRoleIds([]);
                        setQuickRecipientError('');
                      }}
                    >
                      Люди
                    </button>
                  </div>
                  {quickRecipientError && (
                    <div className="recipient-error">{quickRecipientError}</div>
                  )}
                  {!showQuickTime && quickVisibility === 'roles' && (
                    <div className="recipient-list">
                      {filteredRoleOptions.map((role) => (
                        <label key={role.value} className="recipient-item">
                          <input
                            type="checkbox"
                            checked={quickRecipientRoleIds.includes(role.value)}
                            onChange={(event) => {
                              setQuickRecipientRoleIds((prev) => (
                                event.target.checked
                                  ? [...prev, role.value]
                                  : prev.filter((id) => id !== role.value)
                              ));
                              setQuickRecipientError('');
                            }}
                          />
                          <span>{role.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {!showQuickTime && quickVisibility === 'users' && (
                    <>
                      <div className="recipient-search">
                        <input
                          type="text"
                          placeholder="Поиск по людям"
                          value={quickUserQuery}
                          onChange={(event) => setQuickUserQuery(event.target.value)}
                        />
                      </div>
                      <div className="recipient-list scroll">
                        {filteredUsersDirectory.map((entry) => (
                        <label key={entry.id} className="recipient-item">
                          <input
                            type="checkbox"
                            checked={quickRecipientUserIds.includes(entry.id)}
                            onChange={(event) => {
                              setQuickRecipientUserIds((prev) => (
                                event.target.checked
                                  ? [...prev, entry.id]
                                  : prev.filter((id) => id !== entry.id)
                              ));
                              setQuickRecipientError('');
                            }}
                          />
                          <span>{entry.fullName}</span>
                        </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {showEventPreview && selectedNote && (
              <div
                className={`event-preview floating ${eventPreviewSide}`}
                style={eventPos ? { ...eventPos, ['--tail-top' as any]: `${eventTailOffset}px` } : undefined}
                ref={eventPreviewRef}
              >
                <div className="event-preview-content">
                  {eventTitleEditing ? (
                    <textarea
                      ref={eventTitleRef}
                      className="event-preview-title-input"
                      rows={2}
                      value={eventDraft}
                      onFocus={() => {
                        setShowEventTimeEdit(false);
                        setShowEventRecipients(false);
                      }}
                      onChange={(event) => setEventDraft(event.target.value)}
                      onBlur={() => commitEventTitle()}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setEventDraft(selectedNote.text);
                          setEventTitleEditing(false);
                          setShowEventPreview(false);
                        }
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          commitEventTitle(true);
                        }
                      }}
                    />
                  ) : (
                    <div
                      className="event-preview-title"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (!canEditNote(selectedNote)) {
                          return;
                        }
                        setShowEventTimeEdit(false);
                        setShowEventRecipients(false);
                        setEventTitleEditing(true);
                        setTimeout(() => eventTitleRef.current?.focus(), 0);
                      }}
                    >
                      {selectedNote.text || 'Событие'}
                    </div>
                  )}
                  {showEventTimeEdit ? (
                    <div
                      className="time-panel event-time-panel"
                      onKeyDown={(event) => {
                        if (event.key !== 'Escape') return;
                        event.preventDefault();
                        resetEventTimeDraft();
                        setShowEventTimeEdit(false);
                        setShowEventPreview(false);
                      }}
                    >
                      <label className="date-label">
                        Дата
                        <div className="date-segments">
                          <input
                            className="date-segment"
                            inputMode="numeric"
                            value={eventDateParts.day}
                            maxLength={2}
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) => {
                              const next = event.target.value.replace(/\D/g, '').slice(0, 2);
                              setEventDateParts((prev) => ({ ...prev, day: next }));
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                handleEventDateTimeSubmit();
                              }
                            }}
                            onBlur={() => {
                              const parsed = parseDateParts(eventDateParts);
                              if (parsed) {
                                setEventDateParts(formatDateParts(parsed));
                                setEventDate(parsed);
                              } else if (eventDate) {
                                setEventDateParts(formatDateParts(eventDate));
                              }
                            }}
                          />
                          <span className="date-sep">.</span>
                          <input
                            className="date-segment"
                            inputMode="numeric"
                            value={eventDateParts.month}
                            maxLength={2}
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) => {
                              const next = event.target.value.replace(/\D/g, '').slice(0, 2);
                              setEventDateParts((prev) => ({ ...prev, month: next }));
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                handleEventDateTimeSubmit();
                              }
                            }}
                            onBlur={() => {
                              const parsed = parseDateParts(eventDateParts);
                              if (parsed) {
                                setEventDateParts(formatDateParts(parsed));
                                setEventDate(parsed);
                              } else if (eventDate) {
                                setEventDateParts(formatDateParts(eventDate));
                              }
                            }}
                          />
                          <span className="date-sep">.</span>
                          <input
                            className="date-segment year"
                            inputMode="numeric"
                            value={eventDateParts.year}
                            maxLength={4}
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) => {
                              const next = event.target.value.replace(/\D/g, '').slice(0, 4);
                              setEventDateParts((prev) => ({ ...prev, year: next }));
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                handleEventDateTimeSubmit();
                              }
                            }}
                            onBlur={() => {
                              const parsed = parseDateParts(eventDateParts);
                              if (parsed) {
                                setEventDateParts(formatDateParts(parsed));
                                setEventDate(parsed);
                              } else if (eventDate) {
                                setEventDateParts(formatDateParts(eventDate));
                              }
                            }}
                          />
                        </div>
                      </label>
                      <label>
                        Начало
                        <input
                          type="time"
                          value={eventStartTime}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) => {
                            const next = event.target.value;
                            setEventStartTime(next);
                            const nextEnd = eventEndManual ? eventEndTime : addHour(next);
                            if (!eventEndManual) {
                              setEventEndTime(nextEnd);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleEventDateTimeSubmit();
                            }
                          }}
                        />
                      </label>
                      <label>
                        Конец
                        <input
                          type="time"
                          value={eventEndTime}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) => {
                            const next = event.target.value;
                            setEventEndManual(true);
                            setEventEndTime(next);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleEventDateTimeSubmit();
                            }
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="event-preview-time"
                      onClick={() => {
                        if (!canEditNote(selectedNote)) {
                          return;
                        }
                        if (showEventRecipients) {
                          const committed = commitEventRecipientsIfValid();
                          if (!committed) {
                            resetEventRecipientsDraft();
                            setShowEventRecipients(false);
                          } else {
                            setShowEventRecipients(false);
                          }
                        }
                        setShowEventTimeEdit((prev) => !prev);
                      }}
                      disabled={!canEditNote(selectedNote)}
                    >
                      {formatMeta(eventDate ?? selectedDate)} {eventStartTime} — {eventEndTime}
                    </button>
                  )}
                  <div className="event-preview-meta">
                    {canShowAuthor(selectedNote) && (
                      <span className="event-preview-author">от {selectedNote.authorName}</span>
                    )}
                    {isOwnNote(selectedNote) && !showEventRecipients && (
                      <span
                        className="event-preview-recipient"
                        role={canEditNote(selectedNote) ? 'button' : undefined}
                        tabIndex={canEditNote(selectedNote) ? 0 : undefined}
                        onClick={() => {
                          if (!canEditNote(selectedNote)) {
                            return;
                          }
                          if (showEventTimeEdit) {
                            handleEventDateTimeSubmit(false);
                          } else {
                            setShowEventTimeEdit(false);
                          }
                          setShowEventRecipients(true);
                        }}
                        onKeyDown={(event) => {
                          if (!canEditNote(selectedNote)) {
                            return;
                          }
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            if (showEventTimeEdit) {
                              handleEventDateTimeSubmit(false);
                            } else {
                              setShowEventTimeEdit(false);
                            }
                            setShowEventRecipients(true);
                          }
                        }}
                      >
                        Кому: {formatRecipients(selectedNote)}
                      </span>
                    )}
                  </div>
                  {canEditNote(selectedNote) && showEventRecipients && (
                    <div
                      className="event-recipients"
                      onMouseDown={() => {
                        setShowEventTimeEdit(false);
                      }}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          resetEventRecipientsDraft();
                          setShowEventRecipients(false);
                          setShowEventPreview(false);
                          return;
                        }
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        if (eventVisibility === 'private') {
                          commitEventRecipients('private', [], []);
                          setShowEventRecipients(false);
                          setShowEventPreview(false);
                          return;
                        }
                        if (eventVisibility === 'broadcast') {
                          commitEventRecipients('broadcast', [], []);
                          setShowEventRecipients(false);
                          setShowEventPreview(false);
                          return;
                        }
                        if (eventVisibility === 'roles') {
                          if (eventRecipientRoleIds.length === 0) {
                            resetEventRecipientsDraft();
                            setShowEventRecipients(false);
                            setShowEventPreview(false);
                            return;
                          }
                          commitEventRecipients('roles', [], eventRecipientRoleIds);
                          setShowEventRecipients(false);
                          setShowEventPreview(false);
                          return;
                        }
                        if (eventVisibility === 'users') {
                          if (eventRecipientUserIds.length === 0) {
                            resetEventRecipientsDraft();
                            setShowEventRecipients(false);
                            setShowEventPreview(false);
                            return;
                          }
                          commitEventRecipients('users', eventRecipientUserIds, []);
                          setShowEventRecipients(false);
                          setShowEventPreview(false);
                        }
                      }}
                    >
                      <div className="event-recipient-header">Кому</div>
                      <div className="quick-targets event-targets">
                        <button
                          type="button"
                          className="quick-target"
                          data-active={eventVisibility === 'private'}
                          onClick={() => {
                            setEventVisibility('private');
                            setEventRecipientRoleIds([]);
                            setEventRecipientUserIds([]);
                          }}
                        >
                          Лично
                        </button>
                        <button
                          type="button"
                          className="quick-target"
                          data-active={eventVisibility === 'broadcast'}
                          onClick={() => {
                            setEventVisibility('broadcast');
                            setEventRecipientRoleIds([]);
                            setEventRecipientUserIds([]);
                          }}
                        >
                          Всем
                        </button>
                        <button
                          type="button"
                          className="quick-target"
                          data-active={eventVisibility === 'roles'}
                          onClick={() => {
                            setEventVisibility('roles');
                            setEventRecipientUserIds([]);
                          }}
                        >
                          Роли
                        </button>
                        <button
                          type="button"
                          className="quick-target"
                          data-active={eventVisibility === 'users'}
                          onClick={() => {
                            setEventVisibility('users');
                            setEventRecipientRoleIds([]);
                          }}
                        >
                          Люди
                        </button>
                      </div>
                      {eventVisibility === 'roles' && (
                        <div className="recipient-list">
                          {filteredRoleOptions.map((role) => (
                            <label key={role.value} className="recipient-item">
                              <input
                                type="checkbox"
                                checked={eventRecipientRoleIds.includes(role.value)}
                                onChange={(event) => {
                                  const next = event.target.checked
                                    ? [...eventRecipientRoleIds, role.value]
                                    : eventRecipientRoleIds.filter((id) => id !== role.value);
                                  setEventRecipientRoleIds(next);
                                }}
                              />
                              <span>{role.label}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      {eventVisibility === 'users' && (
                        <>
                          <div className="recipient-search">
                            <input
                              type="text"
                              placeholder="Поиск по людям"
                              value={eventUserQuery}
                              onChange={(event) => setEventUserQuery(event.target.value)}
                            />
                          </div>
                          <div className="recipient-list scroll">
                            {eventFilteredUsersDirectory.map((entry) => (
                              <label key={entry.id} className="recipient-item">
                                <input
                                  type="checkbox"
                                  checked={eventRecipientUserIds.includes(entry.id)}
                                onChange={(event) => {
                                  const next = event.target.checked
                                    ? [...eventRecipientUserIds, entry.id]
                                    : eventRecipientUserIds.filter((id) => id !== entry.id);
                                  setEventRecipientUserIds(next);
                                }}
                              />
                                <span>{entry.fullName}</span>
                              </label>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {contextMenu && (
              <div
                className="event-context-menu"
                style={{ top: contextMenu.y, left: contextMenu.x }}
                ref={contextMenuRef}
              >
                <button
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={() => {
                    removeNoteByKey(contextMenu.dateKey, contextMenu.note.id);
                    setContextMenu(null);
                    setShowEventPreview(false);
                  }}
                >
                  Удалить
                </button>
              </div>
            )}

            {viewMode === 'month' && (
              <div className="month-grid">
                {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map((day) => (
                  <div key={day} className="weekday">{day}</div>
                ))}
                {monthDays.map((day) => {
                  const key = formatDateKey(day);
                  const dayNotes = notesByDate[key] ?? [];
                  const maxMonthEvents = 3;
                  const isSelected = sameDay(day, selectedDate);
                  const isOutside = day.getMonth() !== cursor.getMonth();
                  const isToday = sameDay(day, new Date());

                  return (
                    <div
                      key={key}
                      className={cx('month-cell', isOutside && 'outside', isSelected && 'selected', isToday && 'today')}
                      onClick={() => {
                        if (eventTitleEditing) {
                          commitEventTitle();
                        }
                        setSelectedDate(day);
                        setCursor(day);
                        setShowEventPreview(false);
                      }}
                      onDoubleClick={() => openQuickForDate(day)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="day-num">{day.getDate()}</div>
                      <div className="event-list">
                        {dayNotes.slice(0, maxMonthEvents).map((note) => (
                          <div
                            key={note.id}
                            className={cx(
                              'event-line',
                              selectedNote?.id === note.id && 'active',
                              isUnreadNote(note) && 'unread',
                              isOwnNote(note) && 'own',
                              isAdminExternalNote(note) && 'admin-external'
                            )}
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              const container = calendarMainRef.current?.getBoundingClientRect();
                              const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                              if (container) {
                                const isWeekend = day.getDay() === 0 || day.getDay() === 6 || day.getDay() === 5;
                                const popoverWidth = 300;
                                const gutter = 12;
                                const rawLeft = isWeekend
                                  ? rect.left - container.left - popoverWidth - gutter
                                  : rect.right - container.left + gutter;
                                const left = Math.min(
                                  Math.max(gutter, rawLeft),
                                  container.width - popoverWidth - gutter
                                );
                                const top = getEventPreviewTop(rect, container, gutter);
                                setEventBasePos({ left, top });
                                setEventPos({ left, top });
                                setEventPreviewSide(isWeekend ? 'left' : 'right');
                              }
                              openEventPreview(note, day);
                            }}
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              const container = calendarMainRef.current?.getBoundingClientRect();
                              const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                              if (container) {
                                const isWeekend = day.getDay() === 0 || day.getDay() === 6 || day.getDay() === 5;
                                const popoverWidth = 300;
                                const gutter = 12;
                                const rawLeft = isWeekend
                                  ? rect.left - container.left - popoverWidth - gutter
                                  : rect.right - container.left + gutter;
                                const left = Math.min(
                                  Math.max(gutter, rawLeft),
                                  container.width - popoverWidth - gutter
                                );
                                const top = getEventPreviewTop(rect, container, gutter);
                                setEventBasePos({ left, top });
                                setEventPos({ left, top });
                                setEventPreviewSide(isWeekend ? 'left' : 'right');
                              }
                              openEventPreview(note, day);
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (!canDeleteNote(note)) {
                                return;
                              }
                              const container = calendarMainRef.current?.getBoundingClientRect();
                              if (container) {
                                const x = Math.min(
                                  event.clientX - container.left + 8,
                                  container.width - 200
                                );
                                const y = Math.min(
                                  event.clientY - container.top + 8,
                                  container.height - 120
                                );
                                setContextMenu({ x, y, note, dateKey: key });
                              }
                            }}
                          >
                            <span className={cx('event-dot', isUnreadNote(note) && 'unread', isAdminExternalNote(note) && 'admin-external')} />
                            <span className="event-title">
                              {note.text}
                              
                              {canShowAuthor(note) && (
                                <span className="event-author"> · {note.authorName}</span>
                              )}
                            </span>
                            <span className="event-time">{getStartTime(note)}</span>
                          </div>
                        ))}
                        {dayNotes.length > maxMonthEvents && (
                          <div className="event-more">+ ещё {dayNotes.length - maxMonthEvents}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {viewMode === 'day' && (
              <div className="day-view">
                <div className="day-view-header">
                  <div
                    className={cx(
                      'day-weekday',
                      (selectedDate.getDay() === 0 || selectedDate.getDay() === 6 || selectedDate.getDay() === 5) && 'weekend'
                    )}
                  >
                    {selectedDate.toLocaleDateString('ru-RU', { weekday: 'long' })}
                  </div>
                </div>
                <div className="day-all-day">
                  <div className="time-label">весь день</div>
                  <div className="all-day-slot" />
                </div>
                <div className="day-time-grid">
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <div key={hour} className="time-row">
                      <div className="time-label">{String(hour).padStart(2, '0')}:00</div>
                      <div
                        className="time-slot"
                        onClick={() => {
                          setSelectedDate(selectedDate);
                          setCursor(selectedDate);
                        }}
                        onDoubleClick={() => openQuickForDateTime(selectedDate, hour * 60)}
                      />
                    </div>
                  ))}
                  <div className="day-events">
                    {(() => {
                      const dayNotes = notesByDate[selectedKey] ?? [];
                      const sorted = [...dayNotes].sort(
                        (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
                      );
                      const lanes: Array<{ end: number }> = [];
                      let maxConcurrent = 1;
                      const positioned = sorted.map((note) => {
                        const startMin = parseTimeToMinutes(note.startTime ?? '09:00');
                        const endMin = parseTimeToMinutes(note.endTime ?? addHour(note.startTime ?? '09:00'));
                        let laneIndex = lanes.findIndex((lane) => lane.end <= startMin);
                        if (laneIndex === -1) {
                          laneIndex = lanes.length;
                          lanes.push({ end: endMin });
                        } else {
                          lanes[laneIndex].end = endMin;
                        }
                        maxConcurrent = Math.max(maxConcurrent, lanes.length);
                        return { note, startMin, endMin, laneIndex };
                      });
                      return positioned.map(({ note, startMin, endMin, laneIndex }) => {
                        const duration = Math.max(30, endMin - startMin);
                        const top = (startMin / 60) * dayRowHeight;
                        const height = (duration / 60) * dayRowHeight;
                        const widthPercent = 100 / maxConcurrent;
                        const leftPercent = laneIndex * widthPercent;
                        return (
                          <div
                            key={note.id}
                            className={cx('day-event', isUnreadNote(note) && 'unread', isOwnNote(note) && 'own', isAdminExternalNote(note) && 'admin-external')}
                            style={{
                              top,
                              height,
                              width: `calc(${widthPercent}% - 8px)`,
                              left: `calc(${leftPercent}% + 4px)`,
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              const container = calendarMainRef.current?.getBoundingClientRect();
                              const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                              if (container) {
                                const isWeekend = selectedDate.getDay() === 0 || selectedDate.getDay() === 6 || selectedDate.getDay() === 5;
                                const popoverWidth = 300;
                                const gutter = 12;
                                const rawLeft = isWeekend
                                  ? rect.left - container.left - popoverWidth - gutter
                                  : rect.right - container.left + gutter;
                                const left = Math.min(
                                  Math.max(gutter, rawLeft),
                                  container.width - popoverWidth - gutter
                                );
                                const topPos = getEventPreviewTop(rect, container, gutter);
                                setEventBasePos({ left, top: topPos });
                                setEventPos({ left, top: topPos });
                                setEventPreviewSide(isWeekend ? 'left' : 'right');
                              }
                              openEventPreview(note, selectedDate);
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (!canDeleteNote(note)) {
                                return;
                              }
                              const container = calendarMainRef.current?.getBoundingClientRect();
                              if (container) {
                                const x = Math.min(
                                  event.clientX - container.left + 8,
                                  container.width - 200
                                );
                                const y = Math.min(
                                  event.clientY - container.top + 8,
                                  container.height - 120
                                );
                                setContextMenu({ x, y, note, dateKey: selectedKey });
                              }
                            }}
                          >
                            <div className="event-title">{note.text}</div>
                            {canShowAuthor(note) && (
                              <div className="event-author">от {note.authorName}</div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'week' && (
              <div className="week-view" onDoubleClick={() => openQuickForDate(selectedDate)}>
                <div className="week-header">
                  <div className="week-spacer" />
                  {weekDays.map((day) => (
                    <div
                      key={formatDateKey(day)}
                      className={cx('week-day', (day.getDay() === 0 || day.getDay() === 6 || day.getDay() === 5) && 'weekend')}
                    >
                      <div className="cal-muted">{day.toLocaleDateString('ru-RU', { weekday: 'short' })}</div>
                      <div className={cx('week-day-num', sameDay(day, selectedDate) && 'active')}>{day.getDate()}</div>
                    </div>
                  ))}
                </div>
                <div className="week-all-day">
                  <div className="time-label">весь день</div>
                  {weekDays.map((day) => (
                    <div
                      key={formatDateKey(day)}
                      className={cx('all-day-slot', sameDay(day, selectedDate) && 'active')}
                    />
                  ))}
                </div>
                <div className="week-grid">
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <div key={hour} className="week-row">
                      <div className="time-label">{String(hour).padStart(2, '0')}:00</div>
                      {weekDays.map((day) => (
                        <div
                          key={formatDateKey(day)}
                          className={cx('week-cell', sameDay(day, selectedDate) && 'active')}
                          onClick={() => {
                            setSelectedDate(day);
                            setCursor(day);
                          }}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            openQuickForDateTime(day, hour * 60);
                          }}
                        />
                      ))}
                    </div>
                  ))}
                  <div className="week-events">
                    {weekDays.map((day) => {
                      const dayKey = formatDateKey(day);
                      const dayNotes = notesByDate[dayKey] ?? [];
                      const sortedNotes = [...dayNotes].sort(
                        (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
                      );
                      const positioned: Array<{
                        note: CalendarNote;
                        startMin: number;
                        endMin: number;
                        laneIndex: number;
                        groupMax: number;
                      }> = [];
                      let groupNotes: Array<{
                        note: CalendarNote;
                        startMin: number;
                        endMin: number;
                        laneIndex: number;
                      }> = [];
                      let groupEnd = -1;
                      let groupMax = 1;
                      let groupLanes: Array<{ end: number }> = [];

                      const finalizeGroup = () => {
                        if (groupNotes.length === 0) return;
                        groupNotes.forEach((item) => positioned.push({ ...item, groupMax }));
                        groupNotes = [];
                        groupEnd = -1;
                        groupMax = 1;
                        groupLanes = [];
                      };

                      sortedNotes.forEach((note) => {
                        const startMin = parseTimeToMinutes(note.startTime ?? '09:00');
                        const endMin = parseTimeToMinutes(note.endTime ?? addHour(note.startTime ?? '09:00'));
                        if (groupNotes.length > 0 && startMin >= groupEnd) {
                          finalizeGroup();
                        }
                        let laneIndex = groupLanes.findIndex((lane) => lane.end <= startMin);
                        if (laneIndex === -1) {
                          laneIndex = groupLanes.length;
                          groupLanes.push({ end: endMin });
                        } else {
                          groupLanes[laneIndex].end = endMin;
                        }
                        groupMax = Math.max(groupMax, groupLanes.length);
                        groupEnd = Math.max(groupEnd, endMin);
                        groupNotes.push({ note, startMin, endMin, laneIndex });
                      });
                      finalizeGroup();
                      return (
                        <div key={dayKey} className="week-events-day">
                      {positioned.map(({ note, startMin, endMin, laneIndex, groupMax }) => {
                        const duration = Math.max(30, endMin - startMin);
                        const top = (startMin / 60) * weekRowHeight;
                        const height = (duration / 60) * weekRowHeight;
                        const widthPercent = 100 / groupMax;
                        const leftPercent = laneIndex * widthPercent;
                        return (
                          <div
                            key={note.id}
                            className={cx('week-event', isUnreadNote(note) && 'unread', isOwnNote(note) && 'own', isAdminExternalNote(note) && 'admin-external')}
                            style={{
                              top,
                              height,
                              width: `calc(${widthPercent}% - 8px)`,
                              left: `calc(${leftPercent}% + 4px)`,
                            }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const container = calendarMainRef.current?.getBoundingClientRect();
                                  const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                                  if (container) {
                                    const isWeekend = day.getDay() === 0 || day.getDay() === 6 || day.getDay() === 5;
                                    const popoverWidth = 300;
                                    const gutter = 12;
                                    const rawLeft = isWeekend
                                      ? rect.left - container.left - popoverWidth - gutter
                                      : rect.right - container.left + gutter;
                                    const left = Math.min(
                                      Math.max(gutter, rawLeft),
                                      container.width - popoverWidth - gutter
                                    );
                                    const topPos = getEventPreviewTop(rect, container, gutter);
                                    setEventBasePos({ left, top: topPos });
                                    setEventPos({ left, top: topPos });
                                    setEventPreviewSide(isWeekend ? 'left' : 'right');
                                  }
                                  openEventPreview(note, day);
                                }}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  if (!canDeleteNote(note)) {
                                    return;
                                  }
                                  const container = calendarMainRef.current?.getBoundingClientRect();
                                  if (container) {
                                    const x = Math.min(
                                      event.clientX - container.left + 8,
                                      container.width - 200
                                    );
                                    const y = Math.min(
                                      event.clientY - container.top + 8,
                                      container.height - 120
                                    );
                                    setContextMenu({ x, y, note, dateKey: dayKey });
                                  }
                                }}
                              >
                                <div className="event-title">{note.text}</div>
                                {canShowAuthor(note) && (
                                  <div className="event-author">от {note.authorName}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'year' && (
              <div className="year-view">
                <div className="year-grid">
                  {yearMonths.map((month, idx) => (
                    <div key={idx} className="year-month">
                      <div className="year-title">{month.label}</div>
                      <div className="mini-calendar">
                        {['П', 'В', 'С', 'Ч', 'П', 'С', 'В'].map((day, index) => (
                          <div
                            key={day + '-' + index}
                            className={cx('cal-muted', 'year-weekday', index >= 5 && 'weekend')}
                            style={{ textAlign: 'center' }}
                          >
                            {day}
                          </div>
                        ))}
                        {month.days.slice(0, 42).map((day) => {
                          const isActive = sameDay(day, selectedDate);
                          const isToday = sameDay(day, new Date());
                          return (
                            <div
                              key={formatDateKey(day) + idx}
                              className={cx('mini-day', isActive && 'active', isToday && 'today')}
                              onClick={() => {
                                setSelectedDate(day);
                                setCursor(day);
                              }}
                              onDoubleClick={() => {
                                setSelectedDate(day);
                                setCursor(day);
                                setViewMode('month');
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              {day.getDate()}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
