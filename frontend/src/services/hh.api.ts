import api from './api';
import type {
  HhCandidateDto,
  HhFarpostImportPayload,
  HhFarpostImportResult,
  HhCandidatePayload,
  HhCandidateStage,
  HhCandidateStatus,
  HhConnectionDto,
  HhBadgesDto,
  HhDashboardDto,
  HhHealthDto,
  HhSettingsPayload,
  HhVacancyDto,
  HhVacancyPayload,
  HhVacancyStatus,
  HhPaged,
  HhInterviewDto,
  HhHiringRequestDto,
  HhHiringRequestPayload,
  HhHiringRequestStatus,
  HhSubmissionDecision,
} from '../types/hh';

export const getHhConnectionStatus = () => api.get<HhConnectionDto>('/hh/connection/status');
export const getHhSettings = () => api.get<HhConnectionDto>('/hh/settings');
export const updateHhSettings = (data: HhSettingsPayload) => api.put<HhConnectionDto>('/hh/settings', data);
// /health/hh закрыт JWT и ролью admin — запрос идёт через общий инстанс с токеном.
export const getHhHealth = () => api.get<HhHealthDto>('/health/hh', { baseURL: '/' });
export const getHhDashboard = () => api.get<HhDashboardDto>('/hh/dashboard');
export const getHhBadges = () => api.get<HhBadgesDto>('/hh/badges');
export const getHhVacancies = (params?: {
  q?: string;
  status?: HhVacancyStatus | '';
  page?: number;
  perPage?: number;
}) => api.get<HhPaged<HhVacancyDto>>('/hh/vacancies', { params });
export const createHhVacancy = (data: HhVacancyPayload) => api.post<HhVacancyDto>('/hh/vacancies', data);
export const updateHhVacancy = (id: string, data: Partial<HhVacancyPayload>) =>
  api.put<HhVacancyDto>(`/hh/vacancies/${id}`, data);
export const getHhCandidates = (params?: {
  q?: string;
  stage?: HhCandidateStage | '';
  status?: HhCandidateStatus | '';
  vacancyId?: string;
  page?: number;
  perPage?: number;
}) => api.get<HhPaged<HhCandidateDto>>('/hh/candidates', { params });
export const getHhCandidate = (id: string) => api.get<HhCandidateDto>(`/hh/candidates/${id}`);
export const createHhCandidate = (data: HhCandidatePayload) => api.post<HhCandidateDto>('/hh/candidates', data);
export const importFarpostResume = (data: HhFarpostImportPayload) =>
  api.post<HhFarpostImportResult>('/hh/import/farpost/resume', data);
export const updateHhCandidate = (id: string, data: Partial<HhCandidatePayload>) =>
  api.put<HhCandidateDto>(`/hh/candidates/${id}`, data);
export const addHhCandidateEvent = (id: string, data: {
  type?: 'comment' | 'interview_scheduled';
  title?: string | null;
  comment?: string | null;
  toStage?: HhCandidateStage | null;
  dueAt?: string | null;
}) => api.post(`/hh/candidates/${id}/events`, data);

export const getHhInterviews = (params?: {
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
}) => api.get<HhPaged<HhInterviewDto>>('/hh/interviews', { params });

// --- Заявки на подбор ---
export const getHiringRequests = (params?: { status?: HhHiringRequestStatus | '' }) =>
  api.get<HhHiringRequestDto[]>('/hh/hiring-requests', { params });
export const getHiringRequest = (id: string) =>
  api.get<HhHiringRequestDto>(`/hh/hiring-requests/${id}`);
export const createHiringRequest = (data: HhHiringRequestPayload) =>
  api.post<HhHiringRequestDto>('/hh/hiring-requests', data);
export const updateHiringRequest = (id: string, data: Partial<HhHiringRequestPayload> & {
  status?: HhHiringRequestStatus;
  recruiterComment?: string | null;
  vacancyId?: string | null;
}) => api.put<HhHiringRequestDto>(`/hh/hiring-requests/${id}`, data);
export const submitCandidatesToRequest = (id: string, data: {
  candidateIds: string[];
  recruiterNote?: string | null;
}) => api.post<{ submitted: number; skipped: number; request: HhHiringRequestDto }>(
  `/hh/hiring-requests/${id}/submissions`, data,
);
export const convertRequestToVacancy = (id: string) =>
  api.post<HhHiringRequestDto>(`/hh/hiring-requests/${id}/vacancy`);
export const anonymizeHhCandidate = (id: string) =>
  api.post<HhCandidateDto>(`/hh/candidates/${id}/anonymize`);
export const issueImportToken = () =>
  api.post<{ token: string; expiresAt: string; ttlDays: number }>('/hh/import-token');
export const decideOnSubmission = (submissionId: string, data: {
  decision: HhSubmissionDecision;
  reasonCode?: string | null;
  comment?: string | null;
}) => api.post<HhHiringRequestDto>(`/hh/submissions/${submissionId}/decision`, data);
