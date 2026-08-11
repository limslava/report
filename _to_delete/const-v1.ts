/**
 * Модель доступа модуля подбора.
 *
 * Важно про роли `head_hr` и `hr_specialist`: это **кадровая служба** (кадровое
 * администрирование, графики работы), а не подбор персонала. Они работают в
 * продакшене со своими функциями и к подбору отношения не имеют — доступа к
 * кандидатам и их персональным данным у них нет. Подбор ведёт `hr_recruiter`.
 * Коды ролей сознательно не переименовывались: они используются в 14 файлах и
 * в работающем функционале, переименование дало бы только косметику.
 *
 * Права заданы через именованные capability, а не разрозненными списками ролей,
 * потому что «подать заявку на подбор» может почти любой руководитель, и
 * перечислять их в каждом месте нельзя.
 */

/** Кто ведёт подбор: полный доступ к модулю, кандидатам и их ПДн. */
export const HH_RECRUITING_ROLES = ['admin', 'hr_recruiter'] as const;

/**
 * Кто подаёт заявки на подбор и рассматривает присланных кандидатов —
 * руководители подразделений и директора. Доступа к общей базе кандидатов и к
 * персональным данным у них нет: они видят только обезличенные профили тех
 * кандидатов, которых рекрутер прислал по их собственной заявке.
 */
export const HH_REQUESTER_ROLES = [
  'general_director',
  'director',
  'head_sales',
  'head_ktk_vvo',
  'head_ktk_mow',
  'head_hr',
  'garage_head',
  'garage_head_vvo',
  'warehouse_manager',
  'warehouse_manager_vvo',
  'security',
  'chief_accountant',
] as const;

/**
 * Именованные права модуля. Список ролей меняется здесь и только здесь.
 */
export const HH_CAPABILITY_ROLES = {
  /** Вести подбор: кандидаты, вакансии, воронка, интервью, импорт. */
  'hr.recruiting': HH_RECRUITING_ROLES,
  /** Видеть персональные данные кандидата (ФИО, контакты, фото, тексты резюме). */
  'hr.pii.view': HH_RECRUITING_ROLES,
  /** Управлять вакансиями и кандидатами. */
  'hr.vacancy.manage': HH_RECRUITING_ROLES,
  /** Отчётность по подбору. Директорам подключим отдельно и без ПДн. */
  'hr.reports.view': HH_RECRUITING_ROLES,
  /** Настройки интеграции с площадками. */
  'hr.integration.manage': ['admin'],
  /** Подать заявку на подбор. */
  'hr.request.create': HH_REQUESTER_ROLES,
  /** Рассматривать кандидатов, присланных по своей заявке. */
  'hr.request.review': HH_REQUESTER_ROLES,
} as const satisfies Record<string, readonly string[]>;

export type HhCapability = keyof typeof HH_CAPABILITY_ROLES;

/** Роли, которым модуль доступен хоть в каком-то виде (для меню и маршрутов). */
export const HH_MODULE_ROLES = [
  ...new Set<string>([...HH_RECRUITING_ROLES, ...HH_REQUESTER_ROLES]),
] as const;

// Совместимость с существующими вызовами authorizeRole(...).
export const HH_HR_ROLES = HH_RECRUITING_ROLES;
export const HH_VACANCY_MANAGEMENT_ROLES = HH_CAPABILITY_ROLES['hr.vacancy.manage'];
export const HH_INTEGRATION_MANAGEMENT_ROLES = HH_CAPABILITY_ROLES['hr.integration.manage'];
export const HH_REPORT_ROLES = HH_CAPABILITY_ROLES['hr.reports.view'];
export const HH_PII_ROLES = HH_CAPABILITY_ROLES['hr.pii.view'];

export const HH_CONNECTION_STATUSES = ['active', 'needs_reauth', 'captcha_required', 'disconnected'] as const;
export type HhConnectionStatus = typeof HH_CONNECTION_STATUSES[number];

export const HH_WEBHOOK_EVENT_STATUSES = ['received', 'processed', 'failed', 'dead'] as const;
export type HhWebhookEventStatus = typeof HH_WEBHOOK_EVENT_STATUSES[number];

export const HH_SYNC_RUN_STATUSES = ['running', 'success', 'failed', 'skipped'] as const;
export type HhSyncRunStatus = typeof HH_SYNC_RUN_STATUSES[number];

export const HH_DEFAULT_API_BASE_URL = 'https://api.hh.ru';
export const HH_DEFAULT_PII_RETENTION_DAYS = 180;
export const HH_DEFAULT_RATE_LIMIT_RPS = 5;

export const HH_VACANCY_STATUSES = ['draft', 'open', 'paused', 'closed', 'archived'] as const;
export type HhVacancyStatus = typeof HH_VACANCY_STATUSES[number];

export const HH_CANDIDATE_STAGES = [
  'new',
  'screening',
  'phone_interview',
  'submitted_to_manager',
  'manager_interview',
  'offer',
  'hired',
  'rejected',
] as const;
export type HhCandidateStage = typeof HH_CANDIDATE_STAGES[number];

export const HH_CANDIDATE_STATUSES = ['active', 'reserve', 'hired', 'rejected'] as const;
export type HhCandidateStatus = typeof HH_CANDIDATE_STATUSES[number];

export const HH_SOURCES = ['manual', 'hh', 'farpost'] as const;
export type HhSource = typeof HH_SOURCES[number];

export const HH_CANDIDATE_EVENT_TYPES = [
  'created',
  'stage_changed',
  'status_changed',
  'comment',
  'interview_scheduled',
  'email_sent',
  'imported',
] as const;
export type HhCandidateEventType = typeof HH_CANDIDATE_EVENT_TYPES[number];

export const HH_HIRING_REQUEST_STATUSES = ['new', 'in_progress', 'closed', 'cancelled'] as const;
export type HhHiringRequestStatus = typeof HH_HIRING_REQUEST_STATUSES[number];

export const HH_SUBMISSION_DECISIONS = ['pending', 'approved', 'rejected'] as const;
export type HhSubmissionDecision = typeof HH_SUBMISSION_DECISIONS[number];
