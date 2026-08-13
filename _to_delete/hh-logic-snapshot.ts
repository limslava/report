import { Brackets } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import {
  HH_CANDIDATE_EVENT_TYPES,
  HH_CANDIDATE_STAGES,
  HH_CANDIDATE_STATUSES,
  HH_SOURCES,
  HH_VACANCY_STATUSES,
  HhCandidateEventType,
  HhCandidateStage,
  HhCandidateStatus,
  HhSource,
  HhVacancyStatus,
} from '../constants/hh';
import { HhCandidate } from '../models/hh-candidate.model';
import { HhCandidateEvent } from '../models/hh-candidate-event.model';
import { HhVacancy } from '../models/hh-vacancy.model';
import { User } from '../models/user.model';
import { canViewHrCandidatePiiBackend } from './hh-access.service';

export const HH_LIST_DEFAULT_PER_PAGE = 50;
export const HH_LIST_MAX_PER_PAGE = 200;

type ListPaging = { page?: unknown; perPage?: unknown };

export type HhPaged<T> = { items: T[]; total: number; page: number; perPage: number };

function paging(params: ListPaging): { page: number; perPage: number; skip: number } {
  const rawPerPage = Number(params.perPage ?? HH_LIST_DEFAULT_PER_PAGE);
  const perPage = Number.isInteger(rawPerPage) && rawPerPage > 0
    ? Math.min(rawPerPage, HH_LIST_MAX_PER_PAGE)
    : HH_LIST_DEFAULT_PER_PAGE;
  const rawPage = Number(params.page ?? 0);
  const page = Number.isInteger(rawPage) && rawPage >= 0 ? rawPage : 0;
  return { page, perPage, skip: page * perPage };
}

type VacancyPayload = {
  title?: unknown;
  department?: unknown;
  managerUserId?: unknown;
  city?: unknown;
  salaryFrom?: unknown;
  salaryTo?: unknown;
  currency?: unknown;
  requirements?: unknown;
  responsibilities?: unknown;
  benefits?: unknown;
  openedAt?: unknown;
  targetCloseAt?: unknown;
  status?: unknown;
  source?: unknown;
};

type CandidatePayload = {
  hhResumeId?: unknown;
  fullName?: unknown;
  age?: unknown;
  phone?: unknown;
  email?: unknown;
  messenger?: unknown;
  city?: unknown;
  desiredSalary?: unknown;
  position?: unknown;
  experienceText?: unknown;
  skillsText?: unknown;
  educationText?: unknown;
  currentStage?: unknown;
  status?: unknown;
  vacancyId?: unknown;
  assignedRecruiterId?: unknown;
  source?: unknown;
};

type FarpostImportPayload = {
  rawText?: unknown;
  sourceUrl?: unknown;
  vacancyId?: unknown;
};

type CandidateEventPayload = {
  type?: unknown;
  title?: unknown;
  comment?: unknown;
  toStage?: unknown;
  dueAt?: unknown;
};

const vacancyRepo = () => AppDataSource.getRepository(HhVacancy);
const candidateRepo = () => AppDataSource.getRepository(HhCandidate);
const eventRepo = () => AppDataSource.getRepository(HhCandidateEvent);

const FARPOST_SECTION_LABELS = [
  'Опыт работы',
  'Образование',
  'Навыки',
  'Ключевые навыки',
  'О себе',
  'Желаемая должность',
  'Желаемая зарплата',
  'Город',
  'Контакты',
  'Телефон',
  'Email',
  'E-mail',
];

const FARPOST_FIELD_LABELS = [
  'Желаемая должность',
  'Уровень дохода',
  'Желаемая зарплата',
  'Зарплата',
  'Занятость',
  'Год рождения',
  'Пол и семейное положение',
  'Образование',
  'Желаемый город работы',
  'Город',
  'Наличие автомобиля',
  'Категория прав',
  'Опыт работы',
  'Навыки',
  'Ключевые навыки',
  'О себе',
  'Контакты',
  'Телефон',
  'Email',
  'E-mail',
  'Резюме обновлялось',
];

function text(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function requiredText(value: unknown, field: string): string {
  const normalized = text(value);
  if (!normalized) {
    const error: any = new Error(`${field} is required`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function intOrNull(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    const error: any = new Error('Numeric fields must be non-negative integers');
    error.statusCode = 400;
    throw error;
  }
  return number;
}

function dateText(value: unknown): string | null | undefined {
  const normalized = text(value);
  if (normalized === undefined || normalized === null) return normalized;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const error: any = new Error('Date fields must use YYYY-MM-DD');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function dateOrNull(value: unknown): Date | null | undefined {
  const normalized = text(value);
  if (normalized === undefined || normalized === null) return normalized;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    const error: any = new Error('Invalid date');
    error.statusCode = 400;
    throw error;
  }
  return date;
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    const error: any = new Error(`${field} has unsupported value`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function userId(user?: User): string | null {
  return user?.id ?? null;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function htmlToReadableText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function readableLines(value: string): string[] {
  return htmlToReadableText(value)
    .split(/\r?\n/)
    .map(collapseWhitespace)
    .filter(Boolean);
}

function firstMatch(textValue: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = textValue.match(pattern);
    if (match?.[1]) return collapseWhitespace(match[1]);
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fieldAfterLabel(compact: string, label: string, stopLabels = FARPOST_FIELD_LABELS): string | null {
  const stops = stopLabels
    .filter((stopLabel) => stopLabel !== label)
    .map(escapeRegExp)
    .join('|');
  const pattern = new RegExp(`${escapeRegExp(label)}\\s+(.+?)(?=\\s+(?:${stops})(?:\\s|$)|$)`, 'i');
  const value = firstMatch(compact, [pattern]);
  if (!value) return null;
  return value.replace(/[.,;:]+$/g, '').trim() || null;
}

function normalizeFarpostCity(value: string | null): string | null {
  if (!value) return null;
  const city = value
    .replace(/\b(да|нет)\b.*$/i, '')
    .replace(/[.,;:]+$/g, '')
    .trim();
  return city || null;
}

function inferFarpostFullName(compact: string, lines: string[]): string {
  const isNameHidden = /Имя соискателя будет доступно/i.test(compact);
  if (!isNameHidden) {
    const visibleName = lines.find((line) => (
      /^[А-ЯЁA-Z][А-ЯЁA-Zа-яёa-z-]+(?:\s+[А-ЯЁA-Z][А-ЯЁA-Zа-яёa-z-]+){1,2}$/.test(line)
      && !FARPOST_FIELD_LABELS.some((label) => label.toLowerCase() === line.toLowerCase())
      && !/^(Фарпост|Работа|Резюме|Предложения)$/i.test(line)
    ));
    if (visibleName) return visibleName;
  }

  const resumeId = firstMatch(compact, [/№\s*(\d{6,})/i]);
  return resumeId ? `Соискатель FarPost №${resumeId}` : 'Соискатель FarPost';
}

// Группа захвата обязательна: firstMatch() читает match[1].
const FARPOST_PHONE_PATTERN = /(\+?\d[\d\s()\-.]{8,18}\d)/;

/**
 * Приводит найденную последовательность к +7XXXXXXXXXX и отбраковывает всё,
 * что не является телефоном: номера резюме, годы, суммы, идентификаторы.
 */
function normalizeFarpostPhone(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10 && digits.startsWith('9')) {
    return `+7${digits}`;
  }
  if (trimmed.startsWith('+') && digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

/**
 * Сначала пробуем телефон рядом с меткой («Телефон», «Контакты»), и только
 * потом — перебор всех похожих последовательностей на странице. Прежняя версия
 * брала первое совпадение по всему тексту и регулярно подхватывала телефон
 * поддержки FarPost или номер объявления.
 */
function extractFarpostPhone(lines: string[], compact: string): string | null {
  const labelled = [
    lineAfterLabel(lines, 'Телефон'),
    fieldAfterLabel(compact, 'Телефон'),
    lineAfterLabel(lines, 'Контакты'),
    fieldAfterLabel(compact, 'Контакты'),
  ].filter(Boolean) as string[];

  for (const chunk of labelled) {
    const normalized = normalizeFarpostPhone(firstMatch(chunk, [FARPOST_PHONE_PATTERN]));
    if (normalized) return normalized;
  }

  const matches = compact.match(new RegExp(FARPOST_PHONE_PATTERN.source, 'g')) ?? [];
  for (const raw of matches) {
    const normalized = normalizeFarpostPhone(raw);
    if (normalized) return normalized;
  }
  return null;
}

const FARPOST_SALARY_MIN = 3000;
const FARPOST_SALARY_MAX = 3000000;

function normalizeFarpostSalary(value: string | null): number | null {
  if (!value) return null;
  const amount = Number(value.replace(/\D/g, ''));
  if (!Number.isFinite(amount) || amount < FARPOST_SALARY_MIN || amount > FARPOST_SALARY_MAX) {
    return null;
  }
  return amount;
}

function farpostResumeKey(value: string | null): string | null {
  if (!value) return null;
  const resumeId = firstMatch(value, [/№\s*(\d{6,})/i, /-(\d{6,})\.html(?:\?|$)/i, /\/(\d{6,})(?:\.html)?(?:\?|$)/i]);
  return resumeId ? `farpost:${resumeId}` : null;
}

function sectionText(lines: string[], labels: string[]): string | null {
  const startIndex = lines.findIndex((line) => labels.some((label) => line.toLowerCase() === label.toLowerCase()));
  if (startIndex === -1) return null;
  const endIndex = lines.findIndex((line, index) => (
    index > startIndex
    && FARPOST_SECTION_LABELS.some((label) => line.toLowerCase() === label.toLowerCase())
  ));
  const content = lines.slice(startIndex + 1, endIndex === -1 ? startIndex + 8 : endIndex).join('\n').trim();
  return content || null;
}

function compactSectionText(compact: string, labels: string[], stopLabels = FARPOST_FIELD_LABELS): string | null {
  for (const label of labels) {
    const value = fieldAfterLabel(compact, label, stopLabels);
    if (value) return value.slice(0, 3000);
  }
  return null;
}

function lineAfterLabel(lines: string[], label: string): string | null {
  const index = lines.findIndex((line) => line.toLowerCase() === label.toLowerCase());
  if (index === -1) return null;
  const value = lines.slice(index + 1).find((line) => (
    !FARPOST_FIELD_LABELS.some((fieldLabel) => fieldLabel.toLowerCase() === line.toLowerCase())
  ));
  return value || null;
}

function lineSection(lines: string[], startLabels: string[], endLabels: string[]): string[] {
  const startIndex = lines.findIndex((line) => startLabels.some((label) => line.toLowerCase().startsWith(label.toLowerCase())));
  if (startIndex === -1) return [];
  const endIndex = lines.findIndex((line, index) => (
    index > startIndex
    && endLabels.some((label) => line.toLowerCase().startsWith(label.toLowerCase()))
  ));
  return lines.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

function isFarpostPeriodStart(line: string): boolean {
  return /^С\s+[а-яё]+\s+\d{4}$/i.test(line);
}

function isFarpostDuration(line: string): boolean {
  return /\d+\s*(?:год|года|лет|месяц|месяца|месяцев)/i.test(line);
}

function formatFarpostExperience(lines: string[]): string | null {
  const section = lineSection(lines, ['Опыт работы'], [
    'Учебные заведения',
    'Образование',
    'Дополнительные курсы',
    'Иностранные языки',
    'Дополнительные навыки',
    'Распечатать',
    'Доступ к контактам',
  ]);
  if (!section.length) return null;

  const header = section[0];
  const blocks: string[] = [];
  let index = 1;

  while (index < section.length) {
    if (!isFarpostPeriodStart(section[index])) {
      index += 1;
      continue;
    }

    const from = section[index++];
    const to = section[index]?.toLowerCase().startsWith('по ') ? section[index++] : null;
    const duration = section[index] && isFarpostDuration(section[index]) ? section[index++] : null;
    const company = section[index] && !section[index].startsWith('•') ? section[index++] : null;
    const position = section[index] && !section[index].startsWith('•') ? section[index++] : null;
    const duties: string[] = [];

    while (index < section.length && !isFarpostPeriodStart(section[index])) {
      duties.push(section[index++]);
    }

    const title = [company, position].filter(Boolean).join(' — ');
    const period = [from, to, duration].filter(Boolean).join(', ');
    blocks.push([
      title || 'Место работы',
      period ? `Период: ${period}` : null,
      duties.join('\n'),
    ].filter(Boolean).join('\n'));
  }

  return [header, ...blocks].filter(Boolean).join('\n\n') || null;
}

function formatFarpostEducation(lines: string[], compact: string): string | null {
  const educationLevel = lineAfterLabel(lines, 'Образование') || fieldAfterLabel(compact, 'Образование');
  const educationDetails = lineSection(lines, ['Учебные заведения и курсы'], [
    'Иностранные языки',
    'Дополнительные навыки',
    'Распечатать',
    'Доступ к контактам',
  ]);
  const details = educationDetails.length ? educationDetails.join('\n') : null;
  return [educationLevel, details].filter(Boolean).join('\n\n') || null;
}

function formatFarpostSkills(lines: string[]): string | null {
  const skills = lineSection(lines, ['Дополнительные навыки'], [
    'Распечатать',
    'Доступ к контактам',
    'Добавить в избранное',
    'Пожаловаться',
    '© Фарпост',
  ]);
  const languages = lineSection(lines, ['Иностранные языки'], ['Дополнительные навыки', 'Распечатать', 'Доступ к контактам']);
  return [
    languages.length ? languages.join('\n') : null,
    skills.length ? skills.join('\n') : null,
  ].filter(Boolean).join('\n\n') || null;
}

export function parseFarpostResume(raw: string) {
  const lines = readableLines(raw);
  const compact = collapseWhitespace(lines.join(' '));
  const email = firstMatch(compact, [/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i]);
  const phone = extractFarpostPhone(lines, compact);
  const birthYearText = lineAfterLabel(lines, 'Год рождения') || fieldAfterLabel(compact, 'Год рождения');
  const birthYear = birthYearText ? Number(firstMatch(birthYearText, [/(\d{4})/])) : null;
  const ageText = firstMatch(compact, [/(\d{2})\s*(?:год|года|лет)\b/i]);
  const salaryText = firstMatch(compact, [
    /Уровень дохода[^\d]{0,30}([\d\s]{4,})\s*(?:₽|руб|р\.|RUB)/i,
    /(?:зарплата|доход|желаемая зарплата)[^\d]{0,30}([\d\s]{4,})\s*(?:₽|руб|р\.|RUB)/i,
    /([\d\s]{4,})\s*(?:₽|руб|р\.|RUB)/i,
  ]);
  const city = normalizeFarpostCity(lineAfterLabel(lines, 'Желаемый город работы') || fieldAfterLabel(compact, 'Желаемый город работы') || firstMatch(compact, [
    /(?:город|проживает|место жительства)[:\s]+([А-ЯЁA-Z][А-ЯЁA-Zа-яёa-z\-\s]{2,40}?)(?:\s+Наличие автомобиля|\s+Категория прав|\s+Опыт работы|$)/i,
    /(?:^|\s)(Владивосток|Артем|Уссурийск|Находка|Хабаровск|Южно-Сахалинск|Москва|Санкт-Петербург)(?:\s|$)/i,
  ]));
  const sourceUrl = firstMatch(compact, [/(https?:\/\/(?:www\.)?farpost\.ru\/[^\s]+)/i]);
  const resumeKey = farpostResumeKey(sourceUrl) || farpostResumeKey(compact);
  const fullName = inferFarpostFullName(compact, lines);
  const position = lineAfterLabel(lines, 'Желаемая должность') || fieldAfterLabel(compact, 'Желаемая должность') || firstMatch(compact, [
    /Резюме\s+(.+?)\s+№\s*\d{6,}/i,
  ]);
  const age = birthYear && birthYear > 1900
    ? Math.max(0, new Date().getFullYear() - birthYear)
    : (ageText ? Number(ageText) : null);

  return {
    fullName,
    phone,
    email,
    city,
    desiredSalary: normalizeFarpostSalary(salaryText),
    age,
    position,
    experienceText: formatFarpostExperience(lines)
      ?? sectionText(lines, ['Опыт работы', 'О себе'])
      ?? compactSectionText(compact, ['Опыт работы', 'О себе'])
      ?? compact.slice(0, 1200),
    skillsText: formatFarpostSkills(lines)
      ?? sectionText(lines, ['Навыки', 'Ключевые навыки'])
      ?? compactSectionText(compact, ['Навыки', 'Ключевые навыки']),
    educationText: formatFarpostEducation(lines, compact)
      ?? sectionText(lines, ['Образование'])
      ?? compactSectionText(compact, ['Образование']),
    sourceUrl,
    resumeKey,
    rawPreview: compact.slice(0, 2000),
  };
}

function stageLabel(stage: HhCandidateStage | null): string {
  const labels: Record<HhCandidateStage, string> = {
    new: 'Новый отклик',
    screening: 'Скрининг',
    phone_interview: 'Телефонное интервью',
    submitted_to_manager: 'У руководителя',
    manager_interview: 'Интервью с заказчиком',
    offer: 'Оффер',
    hired: 'Принят',
    rejected: 'Отказ',
  };
  return stage ? labels[stage] : 'Без этапа';
}

/**
 * Роли `director`, `general_director`, `financer` допущены к отчётности по найму,
 * но не к персональным данным кандидатов. По умолчанию (viewer не передан)
 * считаем, что доступа нет — безопасное поведение.
 */
function canSeePii(viewer?: User): boolean {
  return canViewHrCandidatePiiBackend(viewer);
}

function anonymousCandidateLabel(candidateId: string): string {
  return `Кандидат #${candidateId.slice(0, 8)}`;
}

export function serializeVacancy(vacancy: HhVacancy, counts?: { total: number; active: number }) {
  const candidates = vacancy.candidates ?? [];
  return {
    id: vacancy.id,
    hhVacancyId: vacancy.hhVacancyId,
    source: vacancy.source,
    title: vacancy.title,
    department: vacancy.department,
    managerUserId: vacancy.managerUserId,
    managerName: vacancy.managerUser?.fullName ?? null,
    city: vacancy.city,
    salaryFrom: vacancy.salaryFrom,
    salaryTo: vacancy.salaryTo,
    currency: vacancy.currency,
    requirements: vacancy.requirements,
    responsibilities: vacancy.responsibilities,
    benefits: vacancy.benefits,
    openedAt: vacancy.openedAt,
    targetCloseAt: vacancy.targetCloseAt,
    closedAt: vacancy.closedAt,
    status: vacancy.status,
    candidatesCount: counts ? counts.total : candidates.length,
    activeCandidatesCount: counts
      ? counts.active
      : candidates.filter((candidate) => candidate.status === 'active').length,
    createdAt: vacancy.createdAt,
    updatedAt: vacancy.updatedAt,
  };
}

export function serializeCandidate(candidate: HhCandidate, viewer?: User) {
  const withPii = canSeePii(viewer);
  return {
    id: candidate.id,
    // hhResumeId содержит идентификатор резюме на внешней площадке — это тоже
    // косвенный идентификатор соискателя, поэтому скрываем вместе с ПДн.
    hhResumeId: withPii ? candidate.hhResumeId : null,
    source: candidate.source,
    fullName: withPii ? candidate.fullName : anonymousCandidateLabel(candidate.id),
    photoUrl: withPii ? candidate.photoUrl : null,
    age: withPii ? candidate.age : null,
    phone: withPii ? candidate.phone : null,
    email: withPii ? candidate.email : null,
    messenger: withPii ? candidate.messenger : null,
    city: candidate.city,
    desiredSalary: candidate.desiredSalary,
    position: candidate.position,
    // Свободные тексты резюме регулярно содержат контакты и ФИО, поэтому для
    // ролей без доступа к ПДн не отдаются вообще.
    experienceText: withPii ? candidate.experienceText : null,
    skillsText: withPii ? candidate.skillsText : null,
    educationText: withPii ? candidate.educationText : null,
    currentStage: candidate.currentStage,
    status: candidate.status,
    vacancyId: candidate.vacancyId,
    vacancyTitle: candidate.vacancy?.title ?? null,
    assignedRecruiterId: candidate.assignedRecruiterId,
    assignedRecruiterName: candidate.assignedRecruiter?.fullName ?? null,
    lastContactAt: candidate.lastContactAt,
    piiHidden: !withPii,
    events: (candidate.events ?? []).map((event) => serializeCandidateEvent(event, viewer)),
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}

export function serializeCandidateEvent(event: HhCandidateEvent, viewer?: User) {
  const withPii = canSeePii(viewer);
  return {
    id: event.id,
    candidateId: event.candidateId,
    vacancyId: event.vacancyId,
    type: event.type,
    // Заголовок события пишется системой и содержит только этапы/статусы,
    // а комментарий вводит рекрутер — там могут быть ПДн и оценки.
    title: event.title,
    comment: withPii ? event.comment : null,
    fromStage: event.fromStage,
    toStage: event.toStage,
    dueAt: event.dueAt,
    createdByUserId: event.createdByUserId,
    createdByName: event.createdByUser?.fullName ?? null,
    createdAt: event.createdAt,
  };
}

export async function listHhVacancies(
  params: { q?: string; status?: string } & ListPaging,
): Promise<HhPaged<ReturnType<typeof serializeVacancy>>> {
  const { page, perPage, skip } = paging(params);
  const query = vacancyRepo()
    .createQueryBuilder('vacancy')
    .leftJoinAndSelect('vacancy.managerUser', 'managerUser')
    .orderBy('vacancy.createdAt', 'DESC')
    .skip(skip)
    .take(perPage);

  if (params.status) {
    query.andWhere('vacancy.status = :status', { status: params.status });
  }
  if (params.q) {
    query.andWhere(new Brackets((qb) => {
      qb.where('LOWER(vacancy.title) LIKE :q')
        .orWhere('LOWER(vacancy.department) LIKE :q')
        .orWhere('LOWER(vacancy.city) LIKE :q');
    }), { q: `%${params.q.toLowerCase()}%` });
  }

  const [vacancies, total] = await query.getManyAndCount();
  // Счётчики кандидатов считаем в БД по странице вакансий, а не через
  // leftJoinAndSelect всех кандидатов ко всем вакансиям.
  const counts = await loadVacancyCandidateCounts(vacancies.map((vacancy) => vacancy.id));
  return {
    items: vacancies.map((vacancy) => serializeVacancy(vacancy, counts.get(vacancy.id))),
    total,
    page,
    perPage,
  };
}

async function loadVacancyCandidateCounts(vacancyIds: string[]) {
  const result = new Map<string, { total: number; active: number }>();
  if (!vacancyIds.length) return result;
  const rows = await candidateRepo()
    .createQueryBuilder('candidate')
    .select('candidate.vacancyId', 'vacancyId')
    .addSelect('COUNT(*)', 'total')
    .addSelect(`COUNT(*) FILTER (WHERE candidate.status = 'active')`, 'active')
    .where('candidate.vacancyId IN (:...vacancyIds)', { vacancyIds })
    .groupBy('candidate.vacancyId')
    .getRawMany();
  for (const row of rows) {
    result.set(row.vacancyId, { total: Number(row.total), active: Number(row.active) });
  }
  return result;
}

export async function createHhVacancy(payload: VacancyPayload, currentUser?: User) {
  const vacancy = vacancyRepo().create({
    title: requiredText(payload.title, 'title'),
    source: oneOf(payload.source, HH_SOURCES, 'source') as HhSource | undefined ?? 'manual',
    status: oneOf(payload.status, HH_VACANCY_STATUSES, 'status') as HhVacancyStatus | undefined ?? 'draft',
    createdByUserId: userId(currentUser),
  });
  applyVacancyPayload(vacancy, payload);
  return serializeVacancy(await vacancyRepo().save(vacancy));
}

export async function updateHhVacancy(id: string, payload: VacancyPayload) {
  const vacancy = await vacancyRepo().findOne({ where: { id }, relations: { managerUser: true, candidates: true } });
  if (!vacancy) {
    const error: any = new Error('Vacancy not found');
    error.statusCode = 404;
    throw error;
  }
  applyVacancyPayload(vacancy, payload);
  return serializeVacancy(await vacancyRepo().save(vacancy));
}

function applyVacancyPayload(vacancy: HhVacancy, payload: VacancyPayload) {
  const title = text(payload.title);
  if (title !== undefined) vacancy.title = title || vacancy.title;
  const source = oneOf(payload.source, HH_SOURCES, 'source') as HhSource | undefined;
  if (source) vacancy.source = source;
  const status = oneOf(payload.status, HH_VACANCY_STATUSES, 'status') as HhVacancyStatus | undefined;
  if (status) {
    vacancy.status = status;
    if ((status === 'closed' || status === 'archived') && !vacancy.closedAt) {
      vacancy.closedAt = new Date().toISOString().slice(0, 10);
    }
  }
  const fields: Array<[keyof HhVacancy, unknown]> = [
    ['department', payload.department],
    ['managerUserId', payload.managerUserId],
    ['city', payload.city],
    ['currency', payload.currency],
    ['requirements', payload.requirements],
    ['responsibilities', payload.responsibilities],
    ['benefits', payload.benefits],
  ];
  for (const [field, value] of fields) {
    const normalized = text(value);
    if (normalized !== undefined) {
      (vacancy as any)[field] = normalized;
    }
  }
  const salaryFrom = intOrNull(payload.salaryFrom);
  if (salaryFrom !== undefined) vacancy.salaryFrom = salaryFrom;
  const salaryTo = intOrNull(payload.salaryTo);
  if (salaryTo !== undefined) vacancy.salaryTo = salaryTo;
  const openedAt = dateText(payload.openedAt);
  if (openedAt !== undefined) vacancy.openedAt = openedAt;
  const targetCloseAt = dateText(payload.targetCloseAt);
  if (targetCloseAt !== undefined) vacancy.targetCloseAt = targetCloseAt;
}

export async function listHhCandidates(
  params: { q?: string; stage?: string; status?: string; vacancyId?: string } & ListPaging,
  viewer?: User,
): Promise<HhPaged<ReturnType<typeof serializeCandidate>>> {
  const { page, perPage, skip } = paging(params);
  const query = candidateRepo()
    .createQueryBuilder('candidate')
    .leftJoinAndSelect('candidate.vacancy', 'vacancy')
    .leftJoinAndSelect('candidate.assignedRecruiter', 'assignedRecruiter')
    .orderBy('candidate.updatedAt', 'DESC')
    .skip(skip)
    .take(perPage);

  if (params.stage) query.andWhere('candidate.currentStage = :stage', { stage: params.stage });
  if (params.status) query.andWhere('candidate.status = :status', { status: params.status });
  if (params.vacancyId) query.andWhere('candidate.vacancyId = :vacancyId', { vacancyId: params.vacancyId });
  if (params.q) {
    query.andWhere(new Brackets((qb) => {
      qb.where('LOWER(candidate.fullName) LIKE :q')
        .orWhere('LOWER(candidate.position) LIKE :q')
        .orWhere('LOWER(candidate.city) LIKE :q')
        .orWhere('LOWER(candidate.skillsText) LIKE :q');
    }), { q: `%${params.q.toLowerCase()}%` });
  }

  const [candidates, total] = await query.getManyAndCount();
  return {
    items: candidates.map((candidate) => serializeCandidate(candidate, viewer)),
    total,
    page,
    perPage,
  };
}

export async function createHhCandidate(payload: CandidatePayload, currentUser?: User) {
  const candidate = candidateRepo().create({
    fullName: requiredText(payload.fullName, 'fullName'),
    source: oneOf(payload.source, HH_SOURCES, 'source') as HhSource | undefined ?? 'manual',
    currentStage: oneOf(payload.currentStage, HH_CANDIDATE_STAGES, 'currentStage') as HhCandidateStage | undefined ?? 'new',
    status: oneOf(payload.status, HH_CANDIDATE_STATUSES, 'status') as HhCandidateStatus | undefined ?? 'active',
    createdByUserId: userId(currentUser),
  });
  applyCandidatePayload(candidate, payload);
  const saved = await candidateRepo().save(candidate);
  await eventRepo().save(eventRepo().create({
    candidateId: saved.id,
    vacancyId: saved.vacancyId,
    type: 'created',
    title: 'Кандидат создан',
    toStage: saved.currentStage,
    createdByUserId: userId(currentUser),
  }));
  return getHhCandidate(saved.id, currentUser);
}

export async function importFarpostCandidate(payload: FarpostImportPayload, currentUser?: User) {
  const rawText = requiredText(payload.rawText, 'rawText');
  if (rawText.length > 60000) {
    const error: any = new Error('FarPost resume text is too large');
    error.statusCode = 400;
    throw error;
  }
  const parsed = parseFarpostResume(rawText);
  const sourceUrl = text(payload.sourceUrl) ?? parsed.sourceUrl;
  const resumeKey = farpostResumeKey(sourceUrl) || parsed.resumeKey;
  const vacancyId = text(payload.vacancyId) ?? null;
  const existingCandidate = resumeKey
    ? await candidateRepo().findOne({ where: { hhResumeId: resumeKey }, relations: { vacancy: true, assignedRecruiter: true } })
    : null;
  const duplicateQuery = candidateRepo()
    .createQueryBuilder('candidate')
    .leftJoinAndSelect('candidate.vacancy', 'vacancy')
    .leftJoinAndSelect('candidate.assignedRecruiter', 'assignedRecruiter')
    .where('1 = 0');
  if (resumeKey) duplicateQuery.orWhere('candidate.hhResumeId = :resumeKey', { resumeKey });
  if (parsed.email) duplicateQuery.orWhere('LOWER(candidate.email) = :email', { email: parsed.email.toLowerCase() });
  if (parsed.phone) duplicateQuery.orWhere('candidate.phone = :phone', { phone: parsed.phone });
  if (!parsed.email && !parsed.phone) {
    duplicateQuery.orWhere('LOWER(candidate.fullName) = :fullName', { fullName: parsed.fullName.toLowerCase() });
  }
  const duplicates = await duplicateQuery.take(5).getMany();
  const candidatePayload: CandidatePayload = {
    hhResumeId: resumeKey,
    fullName: parsed.fullName,
    age: parsed.age,
    phone: parsed.phone,
    email: parsed.email,
    city: parsed.city,
    desiredSalary: parsed.desiredSalary,
    position: parsed.position,
    experienceText: parsed.experienceText,
    skillsText: parsed.skillsText,
    educationText: parsed.educationText,
    vacancyId,
    source: 'farpost',
  };
  const candidate = existingCandidate
    ? await (async () => {
      // merge: парсер часто не распознаёт часть полей и возвращает null.
      // При повторном импорте это не должно затирать уже собранные контакты.
      applyCandidatePayload(existingCandidate, candidatePayload, { merge: true });
      const saved = await candidateRepo().save(existingCandidate);
      return getHhCandidate(saved.id, currentUser);
    })()
    : await createHhCandidate({
      ...candidatePayload,
      currentStage: 'new',
      status: 'active',
    }, currentUser);
  await eventRepo().save(eventRepo().create({
    candidateId: candidate.id,
    vacancyId,
    type: 'imported',
    title: existingCandidate ? 'Обновлено из FarPost' : 'Импортировано из FarPost',
    comment: [
      sourceUrl ? `Источник: ${sourceUrl}` : null,
      `Распознано: ${parsed.fullName}${parsed.position ? `, ${parsed.position}` : ''}`,
      parsed.rawPreview,
    ].filter(Boolean).join('\n\n'),
    toStage: 'new',
    createdByUserId: userId(currentUser),
  }));
  return {
    candidate: await getHhCandidate(candidate.id, currentUser),
    parsed,
    duplicates: duplicates
      .filter((duplicate) => duplicate.id !== candidate.id)
      .map((duplicate) => serializeCandidate(duplicate, currentUser)),
  };
}

export async function updateHhCandidate(id: string, payload: CandidatePayload, currentUser?: User) {
  const candidate = await candidateRepo().findOne({ where: { id } });
  if (!candidate) {
    const error: any = new Error('Candidate not found');
    error.statusCode = 404;
    throw error;
  }
  const previousStage = candidate.currentStage;
  const previousStatus = candidate.status;
  applyCandidatePayload(candidate, payload);
  const saved = await candidateRepo().save(candidate);
  if (previousStage !== saved.currentStage) {
    await eventRepo().save(eventRepo().create({
      candidateId: saved.id,
      vacancyId: saved.vacancyId,
      type: 'stage_changed',
      title: `Этап изменен: ${stageLabel(previousStage)} -> ${stageLabel(saved.currentStage)}`,
      fromStage: previousStage,
      toStage: saved.currentStage,
      createdByUserId: userId(currentUser),
    }));
  }
  if (previousStatus !== saved.status) {
    await eventRepo().save(eventRepo().create({
      candidateId: saved.id,
      vacancyId: saved.vacancyId,
      type: 'status_changed',
      title: `Статус изменен: ${previousStatus} -> ${saved.status}`,
      comment: saved.status === 'reserve' ? 'Кандидат помещен в кадровый резерв' : null,
      createdByUserId: userId(currentUser),
    }));
  }
  return getHhCandidate(saved.id, currentUser);
}

function applyCandidatePayload(
  candidate: HhCandidate,
  payload: CandidatePayload,
  options: { merge?: boolean } = {},
) {
  const merge = options.merge === true;
  const fields: Array<[keyof HhCandidate, unknown]> = [
    ['phone', payload.phone],
    ['email', payload.email],
    ['messenger', payload.messenger],
    ['city', payload.city],
    ['position', payload.position],
    ['experienceText', payload.experienceText],
    ['skillsText', payload.skillsText],
    ['educationText', payload.educationText],
    ['vacancyId', payload.vacancyId],
    ['assignedRecruiterId', payload.assignedRecruiterId],
  ];
  const fullName = text(payload.fullName);
  if (fullName !== undefined) candidate.fullName = fullName || candidate.fullName;
  const hhResumeId = text(payload.hhResumeId);
  if (hhResumeId !== undefined) candidate.hhResumeId = hhResumeId;
  for (const [field, value] of fields) {
    const normalized = text(value);
    if (normalized === undefined) continue;
    // В режиме merge пустое распознанное значение не перетирает существующее.
    if (merge && normalized === null) continue;
    (candidate as any)[field] = normalized;
  }
  const source = oneOf(payload.source, HH_SOURCES, 'source') as HhSource | undefined;
  if (source) candidate.source = source;
  const currentStage = oneOf(payload.currentStage, HH_CANDIDATE_STAGES, 'currentStage') as HhCandidateStage | undefined;
  if (currentStage) candidate.currentStage = currentStage;
  const status = oneOf(payload.status, HH_CANDIDATE_STATUSES, 'status') as HhCandidateStatus | undefined;
  if (status) {
    candidate.status = status;
    if (status === 'hired') candidate.currentStage = 'hired';
    if (status === 'rejected') candidate.currentStage = 'rejected';
  }
  const age = intOrNull(payload.age);
  if (age !== undefined && !(merge && age === null)) candidate.age = age;
  const desiredSalary = intOrNull(payload.desiredSalary);
  if (desiredSalary !== undefined && !(merge && desiredSalary === null)) {
    candidate.desiredSalary = desiredSalary;
  }
}

export async function getHhCandidate(id: string, viewer?: User) {
  const candidate = await candidateRepo().findOne({
    where: { id },
    relations: { vacancy: true, assignedRecruiter: true, events: { createdByUser: true } },
    order: { events: { createdAt: 'DESC' } },
  });
  if (!candidate) {
    const error: any = new Error('Candidate not found');
    error.statusCode = 404;
    throw error;
  }
  return serializeCandidate(candidate, viewer);
}

export async function addHhCandidateEvent(candidateId: string, payload: CandidateEventPayload, currentUser?: User) {
  const candidate = await candidateRepo().findOne({ where: { id: candidateId } });
  if (!candidate) {
    const error: any = new Error('Candidate not found');
    error.statusCode = 404;
    throw error;
  }
  const type = oneOf(payload.type, HH_CANDIDATE_EVENT_TYPES, 'type') as HhCandidateEventType | undefined ?? 'comment';
  const toStage = oneOf(payload.toStage, HH_CANDIDATE_STAGES, 'toStage') as HhCandidateStage | undefined;
  const fromStage = toStage && toStage !== candidate.currentStage ? candidate.currentStage : null;
  if (toStage) {
    candidate.currentStage = toStage;
    await candidateRepo().save(candidate);
  }
  const event = await eventRepo().save(eventRepo().create({
    candidateId,
    vacancyId: candidate.vacancyId,
    type: toStage ? 'stage_changed' : type,
    title: text(payload.title) || (toStage ? `Этап изменен: ${stageLabel(fromStage)} -> ${stageLabel(toStage)}` : 'Комментарий'),
    comment: text(payload.comment) ?? null,
    fromStage,
    toStage: toStage ?? null,
    dueAt: dateOrNull(payload.dueAt) ?? null,
    createdByUserId: userId(currentUser),
  }));
  return serializeCandidateEvent(event, currentUser);
}

export async function getHhDashboard(viewer?: User) {
  const [openVacancies, responses, activeCandidates, weeklyInterviews, stageRows, recentCandidates] = await Promise.all([
    vacancyRepo().count({ where: { status: 'open' } }),
    candidateRepo().count({ where: { currentStage: 'new' } }),
    candidateRepo().count({ where: { status: 'active' } }),
    eventRepo()
      .createQueryBuilder('event')
      .where('event.type = :type', { type: 'interview_scheduled' })
      .andWhere('event.dueAt >= NOW()')
      .andWhere(`event.dueAt < NOW() + INTERVAL '7 days'`)
      .getCount(),
    candidateRepo()
      .createQueryBuilder('candidate')
      .select('candidate.currentStage', 'stage')
      .addSelect('COUNT(*)', 'count')
      .groupBy('candidate.currentStage')
      .getRawMany(),
    candidateRepo().find({
      relations: { vacancy: true, assignedRecruiter: true },
      order: { updatedAt: 'DESC' },
      take: 6,
    }),
  ]);

  return {
    metrics: {
      openVacancies,
      responses,
      activeCandidates,
      weeklyInterviews,
    },
    stages: stageRows.map((row) => ({
      stage: row.stage as HhCandidateStage,
      label: stageLabel(row.stage as HhCandidateStage),
      count: Number(row.count),
    })),
    recentCandidates: recentCandidates.map((candidate) => serializeCandidate(candidate, viewer)),
  };
}
