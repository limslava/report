import { AppDataSource } from '../config/data-source';
import { ContractWorkSchedule } from '../models/contract-work-schedule.model';
import { User } from '../models/user.model';
import { isWorkdayByYmd } from './workday-calendar.service';
import { IsNull } from 'typeorm';

const scheduleRepo = AppDataSource.getRepository(ContractWorkSchedule);
const userRepo = AppDataSource.getRepository(User);

export type EffectiveWorkSchedule = {
  timezone: string;
  workdayStart: string; // HH:mm
  workdayEnd: string; // HH:mm
  workdays: number[]; // 0..6
};

const DEFAULT_SCHEDULE: EffectiveWorkSchedule = {
  timezone: 'Asia/Vladivostok',
  workdayStart: '10:00',
  workdayEnd: '19:00',
  workdays: [1, 2, 3, 4, 5],
};

function parseWorkdays(value: string | null | undefined): number[] {
  if (!value) return [...DEFAULT_SCHEDULE.workdays];
  const parsed = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return parsed.length ? Array.from(new Set(parsed)).sort((a, b) => a - b) : [...DEFAULT_SCHEDULE.workdays];
}

function validHm(value: string | null | undefined): string | null {
  const text = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : null;
}

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function formatYmdInTz(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function getWeekdayFromYmd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseTzParts(date: Date, timezone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  };
}

function tzOffsetMs(date: Date, timezone: string): number {
  const p = parseTzParts(date, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

function localTzDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i += 1) {
    const offset = tzOffsetMs(new Date(utc), timezone);
    utc = Date.UTC(year, month - 1, day, hour, minute, 0) - offset;
  }
  return new Date(utc);
}

function mergeSchedule(base: EffectiveWorkSchedule, row: Partial<ContractWorkSchedule> | null | undefined): EffectiveWorkSchedule {
  if (!row) return base;
  const timezone = row.timezone?.trim() || base.timezone;
  const workdayStart = validHm(row.workdayStart || '') || base.workdayStart;
  const workdayEnd = validHm(row.workdayEnd || '') || base.workdayEnd;
  const workdays = parseWorkdays(row.workdays || base.workdays.join(','));
  return { timezone, workdayStart, workdayEnd, workdays };
}

export async function listWorkSchedules(): Promise<ContractWorkSchedule[]> {
  return scheduleRepo.find({
    where: { isActive: true },
    order: { scope: 'ASC', roleCode: 'ASC', userId: 'ASC' },
  });
}

export async function upsertWorkSchedule(input: {
  scope: 'global' | 'role' | 'user';
  roleCode?: string | null;
  userId?: string | null;
  timezone: string;
  workdayStart: string;
  workdayEnd: string;
  workdays: number[];
  isActive?: boolean;
}): Promise<ContractWorkSchedule> {
  const roleCode = input.scope === 'role' ? (input.roleCode || null) : null;
  const userId = input.scope === 'user' ? (input.userId || null) : null;
  const existing = await scheduleRepo.findOne({
    where: {
      scope: input.scope,
      roleCode: roleCode === null ? IsNull() : roleCode,
      userId: userId === null ? IsNull() : userId,
    },
  });
  const payload = {
    scope: input.scope,
    roleCode,
    userId,
    timezone: input.timezone.trim() || DEFAULT_SCHEDULE.timezone,
    workdayStart: validHm(input.workdayStart) || DEFAULT_SCHEDULE.workdayStart,
    workdayEnd: validHm(input.workdayEnd) || DEFAULT_SCHEDULE.workdayEnd,
    workdays: (input.workdays || DEFAULT_SCHEDULE.workdays).join(','),
    isActive: input.isActive ?? true,
  };
  if (existing) {
    Object.assign(existing, payload);
    return scheduleRepo.save(existing);
  }
  return scheduleRepo.save(scheduleRepo.create(payload));
}

export async function resolveEffectiveWorkSchedule(roleCode: string, approverUserId: string): Promise<EffectiveWorkSchedule> {
  const user = await userRepo.findOne({ where: { id: approverUserId } });
  const globalRow = await scheduleRepo.findOne({
    where: { scope: 'global', roleCode: IsNull(), userId: IsNull(), isActive: true },
  });
  const roleRow = await scheduleRepo.findOne({
    where: { scope: 'role', roleCode, userId: IsNull(), isActive: true },
  });
  const userRow = await scheduleRepo.findOne({ where: { scope: 'user', userId: approverUserId, isActive: true } });

  let effective = mergeSchedule(DEFAULT_SCHEDULE, globalRow);
  effective = mergeSchedule(effective, roleRow);
  effective = mergeSchedule(effective, userRow);

  if (user) {
    effective = mergeSchedule(effective, {
      timezone: (user as any).timezone ?? null,
      workdayStart: (user as any).workdayStart ?? null,
      workdayEnd: (user as any).workdayEnd ?? null,
      workdays: (user as any).workdays ?? null,
    } as Partial<ContractWorkSchedule>);
  }

  if (hmToMinutes(effective.workdayEnd) <= hmToMinutes(effective.workdayStart)) {
    effective.workdayStart = DEFAULT_SCHEDULE.workdayStart;
    effective.workdayEnd = DEFAULT_SCHEDULE.workdayEnd;
  }
  return effective;
}

export async function calculateDeadlineBySchedule(
  assignedAt: Date,
  slaWorkdays: number,
  schedule: EffectiveWorkSchedule
): Promise<Date> {
  const daysToAdd = Math.max(1, slaWorkdays);
  const tz = schedule.timezone || DEFAULT_SCHEDULE.timezone;
  let cursorYmd = formatYmdInTz(assignedAt, tz);
  let added = 0;

  while (added < daysToAdd) {
    cursorYmd = addDaysYmd(cursorYmd, 1);
    const weekday = getWeekdayFromYmd(cursorYmd);
    if (!schedule.workdays.includes(weekday)) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const isWorkday = await isWorkdayByYmd(cursorYmd);
    if (!isWorkday) {
      continue;
    }
    added += 1;
  }

  const [year, month, day] = cursorYmd.split('-').map(Number);
  const [endHour, endMinute] = schedule.workdayEnd.split(':').map(Number);
  return localTzDateTimeToUtc(year, month, day, endHour, endMinute, tz);
}
