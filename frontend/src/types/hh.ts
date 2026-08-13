export type HhConnectionStatus = 'active' | 'needs_reauth' | 'captcha_required' | 'disconnected';
export type HhVacancyStatus = 'draft' | 'open' | 'paused' | 'closed' | 'archived';
export type HhCandidateStage =
  | 'new'
  | 'screening'
  | 'phone_interview'
  | 'submitted_to_manager'
  | 'manager_interview'
  | 'offer'
  | 'hired'
  | 'rejected';
export type HhCandidateStatus = 'active' | 'reserve' | 'hired' | 'rejected';

/** Серверный ответ списков модуля: страница + общее количество. */
export type HhPaged<T> = {
  items: T[];
  total: number;
  page: number;
  perPage: number;
};
export type HhSource = 'manual' | 'hh' | 'farpost';

export type HhConnectionDto = {
  configured: boolean;
  status: HhConnectionStatus;
  clientId: string | null;
  clientSecretMask: string | null;
  redirectUri: string | null;
  userAgent: string | null;
  employer: { id: string; name: string | null } | null;
  manager: { id: string; name: string | null; accountId: string | null; authType: string | null } | null;
  accessTokenExpiresAt: string | null;
  webhookSecretMask: string | null;
  lastCheckedAt: string | null;
};

export type HhSettingsPayload = {
  clientId?: string | null;
  clientSecret?: string | null;
  redirectUri?: string | null;
  userAgent?: string | null;
};

export type HhHealthDto = {
  status: 'OK' | 'NOT_CONNECTED';
  connection: HhConnectionDto;
  webhooks: {
    pending: number;
    failed: number;
  };
  lastSyncRun: {
    jobType: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    itemsProcessed: number;
    itemsFailed: number;
    error: string | null;
  } | null;
};

export type HhVacancyDto = {
  id: string;
  hhVacancyId: string | null;
  source: HhSource;
  title: string;
  department: string | null;
  managerUserId: string | null;
  managerName: string | null;
  city: string | null;
  salaryFrom: number | null;
  salaryTo: number | null;
  currency: string;
  requirements: string | null;
  responsibilities: string | null;
  benefits: string | null;
  openedAt: string | null;
  targetCloseAt: string | null;
  closedAt: string | null;
  status: HhVacancyStatus;
  candidatesCount: number;
  activeCandidatesCount: number;
  createdAt: string;
  updatedAt: string;
};

export type HhVacancyPayload = {
  title: string;
  department?: string | null;
  city?: string | null;
  salaryFrom?: number | null;
  salaryTo?: number | null;
  requirements?: string | null;
  responsibilities?: string | null;
  benefits?: string | null;
  openedAt?: string | null;
  targetCloseAt?: string | null;
  status?: HhVacancyStatus;
  source?: HhSource;
};

export type HhCandidateEventDto = {
  id: string;
  candidateId: string;
  vacancyId: string | null;
  type: 'created' | 'stage_changed' | 'status_changed' | 'comment' | 'interview_scheduled' | 'email_sent' | 'imported';
  title: string;
  comment: string | null;
  fromStage: HhCandidateStage | null;
  toStage: HhCandidateStage | null;
  dueAt: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type HhCandidateDto = {
  /** true, если роль не допущена к ПДн: ФИО обезличено, контакты и тексты не приходят. */
  piiHidden?: boolean;
  id: string;
  hhResumeId: string | null;
  source: HhSource;
  fullName: string;
  photoUrl: string | null;
  age: number | null;
  phone: string | null;
  email: string | null;
  messenger: string | null;
  city: string | null;
  desiredSalary: number | null;
  position: string | null;
  experienceText: string | null;
  skillsText: string | null;
  educationText: string | null;
  currentStage: HhCandidateStage;
  status: HhCandidateStatus;
  vacancyId: string | null;
  vacancyTitle: string | null;
  assignedRecruiterId: string | null;
  assignedRecruiterName: string | null;
  lastContactAt: string | null;
  /** До какой даты действует согласие кандидата на кадровый резерв. */
  rejectionReasonCode: string | null;
  rejectionReasonLabel: string | null;
  reserveConsentUntil: string | null;
  /** Когда данные будут обезличены автоматически (ретенция по 152-ФЗ). */
  retentionUntil: string | null;
  anonymizedAt: string | null;
  isAnonymized: boolean;
  events?: HhCandidateEventDto[];
  createdAt: string;
  updatedAt: string;
};

export type HhCandidatePayload = {
  reserveConsentUntil?: string | null;
  rejectionReasonCode?: string | null;
  rejectionComment?: string | null;
  fullName: string;
  age?: number | null;
  phone?: string | null;
  email?: string | null;
  messenger?: string | null;
  city?: string | null;
  desiredSalary?: number | null;
  position?: string | null;
  experienceText?: string | null;
  skillsText?: string | null;
  educationText?: string | null;
  currentStage?: HhCandidateStage;
  status?: HhCandidateStatus;
  vacancyId?: string | null;
  source?: HhSource;
};

export type HhFarpostImportPayload = {
  rawText: string;
  sourceUrl?: string | null;
  vacancyId?: string | null;
};

export type HhFarpostImportResult = {
  candidate: HhCandidateDto;
  parsed: {
    fullName: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    desiredSalary: number | null;
    age: number | null;
    position: string | null;
    experienceText: string | null;
    skillsText: string | null;
    educationText: string | null;
    sourceUrl: string | null;
    rawPreview: string;
  };
  duplicates: HhCandidateDto[];
};

export type HhDashboardTasks = {
  newRequests: {
    total: number;
    items: Array<{ id: string; position: string; createdByName: string | null; createdAt: string }>;
  };
  pendingDecisions: {
    total: number;
    items: Array<{ requestId: string; position: string; pending: number }>;
  };
  interviewsToday: Array<{ candidateId: string; candidateName: string; vacancyTitle: string | null; dueAt: string }>;
};

/** Счётчики для бейджей в левом меню. */
export type HhBadgesDto = {
  role: 'recruiter' | 'requester';
  newRequests: number;
  pendingDecisions: number;
  interviewsToday: number;
  total: number;
};

export type HhDashboardDto = {
  metrics: {
    openVacancies: number;
    responses: number;
    activeCandidates: number;
    weeklyInterviews: number;
  };
  stages: Array<{ stage: HhCandidateStage; label: string; count: number }>;
  recentCandidates: HhCandidateDto[];
  /** Матрица «вакансия x этап» по активным вакансиям; нет на старом бэкенде. */
  pipeline?: Array<{
    vacancyId: string;
    vacancyTitle: string;
    stages: Partial<Record<HhCandidateStage, number>>;
    total: number;
  }>;
  vacancySummary?: Array<{ status: HhVacancyStatus; count: number }>;
  /** Задачи рекрутера; null для ролей без права подбора. */
  tasks: HhDashboardTasks | null;
};

export type HhInterviewDto = {
  eventId: string;
  candidateId: string;
  candidateName: string;
  candidatePosition: string | null;
  candidateStage: HhCandidateStage;
  candidateStatus: HhCandidateStatus;
  vacancyId: string | null;
  vacancyTitle: string | null;
  dueAt: string | null;
  comment: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type HhHiringRequestStatus = 'new' | 'in_progress' | 'closed' | 'cancelled';
export type HhSubmissionDecision = 'pending' | 'approved' | 'rejected';

/** Профиль кандидата, который видит автор заявки: без контактов. */
export type HhSubmittedCandidate = {
  candidateId: string;
  label: string;
  fullName: string | null;
  photoUrl: string | null;
  age: number | null;
  anonymous: boolean;
  position: string | null;
  city: string | null;
  desiredSalary: number | null;
  experienceText: string | null;
  skillsText: string | null;
  educationText: string | null;
  source: HhSource;
};

export type HhSubmissionDto = {
  id: string;
  requestId: string;
  decision: HhSubmissionDecision;
  decisionReasonCode: string | null;
  decisionReasonLabel: string | null;
  decisionComment: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  recruiterNote: string | null;
  submittedByName: string | null;
  createdAt: string;
  candidateName: string | null;
  candidate: HhSubmittedCandidate | null;
};

export type HhHiringRequestDto = {
  id: string;
  position: string;
  department: string | null;
  city: string | null;
  headcount: number;
  reason: string | null;
  requirements: string | null;
  responsibilities: string | null;
  salaryFrom: number | null;
  salaryTo: number | null;
  neededBy: string | null;
  status: HhHiringRequestStatus;
  recruiterComment: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  assignedRecruiterId: string | null;
  assignedRecruiterName: string | null;
  vacancyId: string | null;
  vacancyTitle: string | null;
  submissionsTotal: number;
  submissionsPending: number;
  submissionsApproved: number;
  /** Самая ранняя отправка без решения — для SLA «ждёт N дней». */
  pendingSince?: string | null;
  submissions?: HhSubmissionDto[];
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HhHiringRequestPayload = {
  position: string;
  department?: string | null;
  city?: string | null;
  headcount?: number | null;
  reason?: string | null;
  requirements?: string | null;
  responsibilities?: string | null;
  salaryFrom?: number | null;
  salaryTo?: number | null;
  neededBy?: string | null;
};
