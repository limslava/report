export type CalendarNote = {
  id: string;
  text: string;
  createdAt: string;
  createdById?: string;
  createdByRole?: string;
  authorId?: string;
  authorName?: string;
  authorRole?: string;
  visibility?: 'private' | 'targeted' | 'broadcast';
  source?: 'manual' | 'system';
  status?: 'active' | 'closed';
  linkedContractId?: string | null;
  linkedStepId?: string | null;
  recipientUserIds?: string[];
  recipientRoleIds?: string[];
  startAt?: string;
  endAt?: string;
  startTime?: string;
  endTime?: string;
  isRead?: boolean;
};

export type NotesByDate = Record<string, CalendarNote[]>;

const STORAGE_KEY = 'calendar_notes_v1';

export function loadNotes(): NotesByDate {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as NotesByDate;
  } catch {
    return {};
  }
}

export function saveNotes(notes: NotesByDate): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // ignore storage errors (private mode, quota)
  }
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function buildMonthGrid(anchor: Date): Date[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const mondayIndex = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(year, month, 1 - mondayIndex);
  return Array.from({ length: 42 }, (_, idx) => {
    const next = new Date(start);
    next.setDate(start.getDate() + idx);
    return next;
  });
}

export function addMonths(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + delta);
  return next;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
