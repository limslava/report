import { AppDataSource } from '../config/data-source';
import { CalendarWorkday } from '../models/calendar-workday.model';

const calendarRepo = AppDataSource.getRepository(CalendarWorkday);

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fromYmd(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export async function ensureCalendarYear(year: number): Promise<void> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const existing = await calendarRepo
    .createQueryBuilder('c')
    .where('c.date >= :from AND c.date <= :to', { from, to })
    .getMany();
  const existingSet = new Set(existing.map((d) => d.date));

  const inserts: CalendarWorkday[] = [];
  let cursor = fromYmd(from);
  const end = fromYmd(to);
  while (cursor <= end) {
    const ymd = toYmd(cursor);
    if (!existingSet.has(ymd)) {
      inserts.push(calendarRepo.create({
        date: ymd,
        isWorkday: !isWeekend(cursor),
        comment: isWeekend(cursor) ? 'Выходной (авто)' : 'Рабочий (авто)',
      }));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (inserts.length) {
    await calendarRepo.save(inserts);
  }
}

export async function getWorkdayMap(from: Date, to: Date): Promise<Map<string, boolean>> {
  const fromYmdValue = toYmd(from);
  const toYmdValue = toYmd(to);
  const rows = await calendarRepo
    .createQueryBuilder('c')
    .where('c.date >= :from AND c.date <= :to', { from: fromYmdValue, to: toYmdValue })
    .getMany();
  const map = new Map<string, boolean>();
  rows.forEach((row) => map.set(row.date, row.isWorkday));
  return map;
}

export async function isWorkday(date: Date): Promise<boolean> {
  await ensureCalendarYear(date.getUTCFullYear());
  const ymd = toYmd(date);
  const row = await calendarRepo.findOne({ where: { date: ymd } });
  if (!row) return !isWeekend(date);
  return row.isWorkday;
}

export async function isWorkdayByYmd(ymd: string): Promise<boolean> {
  const year = Number(ymd.slice(0, 4));
  await ensureCalendarYear(year);
  const row = await calendarRepo.findOne({ where: { date: ymd } });
  if (row) return row.isWorkday;
  const date = new Date(`${ymd}T00:00:00.000Z`);
  return !isWeekend(date);
}

export async function addWorkingDays(start: Date, workdaysToAdd: number): Promise<Date> {
  await ensureCalendarYear(start.getUTCFullYear());
  let cursor = new Date(start);
  let counted = 0;
  while (counted < Math.max(0, workdaysToAdd)) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getUTCFullYear() !== start.getUTCFullYear()) {
      await ensureCalendarYear(cursor.getUTCFullYear());
    }
    if (await isWorkday(cursor)) counted += 1;
  }
  return cursor;
}

export async function countWorkingDaysBetween(fromInclusive: Date, toInclusive: Date): Promise<number> {
  if (toInclusive < fromInclusive) return 0;
  await ensureCalendarYear(fromInclusive.getUTCFullYear());
  await ensureCalendarYear(toInclusive.getUTCFullYear());
  let cursor = new Date(fromInclusive);
  let count = 0;
  while (cursor <= toInclusive) {
    if (await isWorkday(cursor)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export async function listCalendarByYear(year: number): Promise<CalendarWorkday[]> {
  await ensureCalendarYear(year);
  return calendarRepo
    .createQueryBuilder('c')
    .where("c.date >= :from AND c.date <= :to", { from: `${year}-01-01`, to: `${year}-12-31` })
    .orderBy('c.date', 'ASC')
    .getMany();
}

export async function upsertCalendarDay(date: string, isWorkdayValue: boolean, comment: string | null): Promise<void> {
  await ensureCalendarYear(Number(date.slice(0, 4)));
  await calendarRepo.save(calendarRepo.create({ date, isWorkday: isWorkdayValue, comment }));
}

export async function syncCalendarBySource(year: number, source: 'weekend-default' | 'isdayoff' = 'isdayoff'): Promise<void> {
  await ensureCalendarYear(year);
  if (source === 'weekend-default') return;

  const response = await fetch(`https://isdayoff.ru/api/getdata?year=${year}`);
  if (!response.ok) {
    throw new Error(`Не удалось загрузить календарь из isdayoff: HTTP ${response.status}`);
  }
  const payload = (await response.text()).trim();
  const isLeapYear = (year % 400 === 0) || (year % 4 === 0 && year % 100 !== 0);
  const expectedLength = isLeapYear ? 366 : 365;
  if (payload.length !== expectedLength) {
    throw new Error('Некорректный ответ isdayoff для выбранного года');
  }

  const updates: CalendarWorkday[] = [];
  let cursor = new Date(Date.UTC(year, 0, 1));
  for (let i = 0; i < payload.length; i += 1) {
    const flag = payload[i];
    const ymd = toYmd(cursor);
    updates.push(
      calendarRepo.create({
        date: ymd,
        isWorkday: flag === '0',
        comment: flag === '0' ? 'Рабочий день (isdayoff)' : 'Нерабочий день (isdayoff)',
      })
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  await calendarRepo.save(updates);
}
