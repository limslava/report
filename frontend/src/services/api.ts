import axios from 'axios';
import { useAuthStore } from '../store/auth-store';

const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

const MAX_GET_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 300;

api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    window.dispatchEvent(new CustomEvent('app:service-ok'));
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    const config = error.config as (typeof error.config & { __retryCount?: number }) | undefined;
    const status = error.response?.status;
    const isGet = config?.method?.toLowerCase() === 'get';
    const shouldRetry =
      isGet &&
      config &&
      (status === 503 || !status) &&
      (config.__retryCount ?? 0) < MAX_GET_RETRIES;

    if (shouldRetry) {
      config.__retryCount = (config.__retryCount ?? 0) + 1;
      const delay = BASE_RETRY_DELAY_MS * 2 ** (config.__retryCount - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return api.request(config);
    }

    if (error.response?.status === 503) {
      const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        'Сервис временно недоступен. Повторите попытку позже.';
      const wrapped = new Error(message);
      window.dispatchEvent(new CustomEvent('app:service-unavailable', { detail: { message } }));
      return Promise.reject(wrapped);
    }

    return Promise.reject(error);
  }
);

export const login = (credentials: { email: string; password: string }) =>
  api.post('/auth/login', credentials);

export const register = (data: any) =>
  api.post('/auth/register', data);

export const forgotPassword = (email: string) =>
  api.post('/auth/forgot-password', { email });

export const resetPassword = (data: any) =>
  api.post('/auth/reset-password', data);

export const changePassword = (data: { currentPassword: string; newPassword: string }) =>
  api.post('/auth/change-password', data);
export const getRuntimeAppSettings = () => api.get('/auth/app-settings');

export const getUsers = (params?: any) => api.get('/admin/users', { params });
export type ContractTemplateType = 'income_standard' | 'income_with_psr' | 'expense' | 'addendum';
export type ContractTemplateVersion = {
  id: string;
  templateType: ContractTemplateType;
  templateLabel: string;
  version: number;
  originalName: string;
  sizeBytes: number;
  contentSha256: string;
  placeholders: string[];
  isActive: boolean;
  uploadedByUserId: string | null;
  createdAt: string;
};
export const getContractTemplateVersions = () => api.get<ContractTemplateVersion[]>('/admin/contract-templates');
export const uploadContractTemplateVersion = (data: {
  templateType: ContractTemplateType;
  originalName: string;
  contentBase64: string;
}) => api.post<ContractTemplateVersion>('/admin/contract-templates', data);
export const activateContractTemplateVersion = (id: string) =>
  api.post<ContractTemplateVersion>(`/admin/contract-templates/${id}/activate`);
export const getUsersDirectory = () => api.get('/users/directory');

export type CandidateCheckStatus = 'pending_security' | 'approved' | 'approved_with_remarks' | 'rejected';

export type CandidateCheckAttachment = {
  id: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string | null;
  createdAt: string;
  uploadedByUserId: string | null;
};

export type CandidateCheck = {
  id: string;
  candidateFullName: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  hrComment: string | null;
  status: CandidateCheckStatus;
  securityComment: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  decidedByUserId: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: CandidateCheckAttachment[];
};

export const getCandidateChecks = (params?: { q?: string; status?: CandidateCheckStatus }) =>
  api.get<CandidateCheck[]>('/candidate-checks', { params });

export const createCandidateCheck = (data: {
  candidateFullName: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  hrComment?: string | null;
  files: ContractFilePayload[];
}) => api.post<CandidateCheck>('/candidate-checks', data);

export const decideCandidateCheck = (
  id: string,
  data: { decision: Exclude<CandidateCheckStatus, 'pending_security'>; securityComment?: string | null },
) => api.post<CandidateCheck>(`/candidate-checks/${id}/decision`, data);
export const downloadCandidateCheckAttachment = (attachmentId: string) =>
  api.get(`/candidate-checks/attachments/${attachmentId}/download`, { responseType: 'blob' });

export const getContracts = () => api.get('/contracts');
export const getMasterContracts = () => api.get('/contracts/masters');
export const getContractReferences = () => api.get('/contracts/reference');
export const getContractSlaRules = () => api.get('/contracts/sla-rules');
export const updateContractSlaRules = (rules: Array<{
  contractType: 'expense' | 'income';
  incomeSubtype?: 'standard' | 'with_psr' | null;
  roleCode: string;
  slaWorkdays: number;
  isActive?: boolean;
}>) => api.put('/contracts/sla-rules', { rules });
export const getWorkCalendar = (year: number) => api.get('/contracts/work-calendar', { params: { year } });
export const syncWorkCalendar = (year: number, source: 'isdayoff' | 'weekend-default' = 'isdayoff') =>
  api.post('/contracts/work-calendar/sync', null, { params: { year, source } });
export const upsertWorkCalendarDay = (date: string, payload: { isWorkday: boolean; comment?: string | null }) =>
  api.put(`/contracts/work-calendar/${date}`, payload);
export const getContractDuplicates = (params: { inn: string; contractType: 'expense' | 'income' }) =>
  api.get('/contracts/duplicates', { params });
export const resolveCounterpartyByInn = (inn: string) => api.get('/counterparties/resolve', { params: { inn } });
export const resolveCounterpartyByName = (name: string) => api.get('/counterparties/resolve-by-name', { params: { name } });
export const lookupSinokorBl = (blNo: string, debug = false) =>
  api.get(`/carriers/sinokor/bl/${encodeURIComponent(blNo)}`, { params: debug ? { debug: '1' } : undefined });
export type ContractFilePayload = {
  name: string;
  mimeType?: string | null;
  size?: number;
  contentBase64: string;
};

export const createContract = (data: {
  contractNumber?: string | null;
  documentKind?: 'master' | 'addendum';
  parentContractId?: string | null;
  contractType: 'expense' | 'income';
  incomeSubtype?: 'standard' | 'with_psr' | null;
  counterpartyName: string;
  counterpartyShortName?: string | null;
  ownershipForm?: string | null;
  counterpartyForm?: 'ooo' | 'ao' | 'pao' | 'zao' | 'ip' | null;
  counterpartyInn: string;
  counterpartyOgrn?: string | null;
  counterpartyKpp?: string | null;
  counterpartyLegalAddress?: string | null;
  counterpartyPostalAddress?: string | null;
  counterpartyPhone?: string | null;
  counterpartyEmail?: string | null;
  counterpartySignerPosition?: string | null;
  counterpartySignerName?: string | null;
  counterpartySignerNameGenitive?: string | null;
  counterpartySignerAuthority?: string | null;
  counterpartyBankName?: string | null;
  counterpartyBankBik?: string | null;
  counterpartyBankAccount?: string | null;
  counterpartyCorrespondentAccount?: string | null;
  subject?: string | null;
  contractDate?: string | null;
  psrFlag?: boolean;
  signingMethod?: 'edo' | 'post';
  allowDuplicate?: boolean;
  clientRequestId?: string | null;
}) => api.post('/contracts', data);
export const importSignedContract = (
  data: Parameters<typeof createContract>[0] & { contractNumber: string; contractDate: string; files: ContractFilePayload[] }
) => api.post('/contracts/import-signed', data);
export const updateDraftContract = (
  contractId: string,
  data: Parameters<typeof createContract>[0]
) => api.put(`/contracts/${contractId}/draft`, data);
export const deleteDraftContract = (contractId: string) => api.delete(`/contracts/${contractId}/draft`);
export const prepareContractRevision = (contractId: string) => api.post(`/contracts/${contractId}/new-revision`);
export const uploadContractAttachments = (
  contractId: string,
  files: ContractFilePayload[]
) => api.post(`/contracts/${contractId}/attachments`, { files });
export const uploadContractStepAttachments = (
  contractId: string,
  stepId: string,
  files: Array<{ name: string; mimeType?: string | null; size?: number; contentBase64: string }>
) => api.post(`/contracts/${contractId}/steps/${stepId}/attachments`, { files });
export const getContractAttachments = (contractId: string) => api.get(`/contracts/${contractId}/attachments`);
export const downloadContractAttachment = (attachmentId: string) =>
  api.get(`/contracts/attachments/${attachmentId}/download`, { responseType: 'blob' });
export const previewContractAttachment = (attachmentId: string) =>
  api.get(`/contracts/attachments/${attachmentId}/preview`, { responseType: 'blob' });
export const deleteContractAttachment = (attachmentId: string) =>
  api.delete(`/contracts/attachments/${attachmentId}`);
export const getContractDiscussion = (contractId: string) =>
  api.get(`/contracts/${contractId}/discussion`);
export const getContractDiscussionUnreadCount = (contractId: string) =>
  api.get<{ count: number }>(`/contracts/${contractId}/discussion/unread-count`);
export const markContractDiscussionRead = (contractId: string) =>
  api.post(`/contracts/${contractId}/discussion/read`);
export const createContractDiscussionMessage = (
  contractId: string,
  data: { body?: string | null; files?: ContractFilePayload[]; mentionedUserIds?: string[] }
) => api.post(`/contracts/${contractId}/discussion`, data);
export const downloadContractDiscussionAttachment = (attachmentId: string) =>
  api.get(`/contracts/discussion-attachments/${attachmentId}/download`, { responseType: 'blob' });
export const getSecurityContractInbox = (view: 'active' | 'processed' | 'completed_month' | 'all' = 'active') =>
  api.get('/contracts/security/inbox', { params: { view } });
export const decideSecurityContractVisa = (
  contractId: string,
  data: {
    visa: 'approved' | 'rejected' | 'approved_with_remarks';
    comment?: string | null;
  }
) => api.post(`/contracts/security/inbox/${contractId}/visa`, data);
export const getMyContractApprovalInbox = (view: 'active' | 'processed' | 'completed_month' | 'all' = 'active') =>
  api.get('/contracts/approval-inbox/my', { params: { view } });
export const getMyApprovalDashboard = () => api.get('/contracts/approval-dashboard/my');
export const getContractApprovalSheet = (id: string) => api.get(`/contracts/${id}/approval-sheet`);
export const getContractDecisionHistory = (id: string) => api.get(`/contracts/${id}/decision-history`);
export const downloadContractPrintPackage = (id: string) =>
  api.get(`/contracts/${id}/print-package`, { responseType: 'blob' });
export const startContractApproval = (id: string) => api.post(`/contracts/${id}/start-approval`);
export const decideContractApprovalStep = (
  contractId: string,
  stepId: string,
  data: {
    decision: 'approve' | 'rework' | 'reject';
    comment?: string | null;
  }
) => api.post(`/contracts/${contractId}/steps/${stepId}/decision`, data);
export const inviteUser = (data: any) => api.post<{
  message: string;
  userId: string;
  emailSent: boolean;
  temporaryPassword?: string;
}>('/admin/users/invite', data);
export const updateUser = (id: string, data: any) => api.put(`/admin/users/${id}`, data);
export const resetUserPasswordByAdmin = (id: string) => api.post(`/admin/users/${id}/reset-password`);
export const reassignAndDeleteUserByAdmin = (id: string, targetUserId: string) =>
  api.post(`/admin/users/${id}/reassign-delete`, { targetUserId });
export const deleteUser = (id: string) => api.delete(`/admin/users/${id}`);
export const getSystemStats = () => api.get('/admin/stats');
export const getAuditLog = (params?: any) => api.get('/admin/audit', { params });
export const getAppSettings = () => api.get('/admin/app-settings');
export const updateAppSettings = (data: { appTitle: string }) => api.put('/admin/app-settings', data);
export const getContractWorkSchedules = () => api.get('/admin/contract-work-schedules');
export const upsertContractWorkSchedules = (items: Array<{
  scope: 'global' | 'role' | 'user';
  roleCode?: string | null;
  userId?: string | null;
  timezone: string;
  workdayStart: string;
  workdayEnd: string;
  workdays: number[];
  isActive?: boolean;
}>) => api.put('/admin/contract-work-schedules', { items });

export const getEmailSchedules = () => api.get('/email-schedules');
export const getEmailSchedule = (id: string) => api.get(`/email-schedules/${id}`);
export const createEmailSchedule = (data: any) => api.post('/email-schedules', data);
export const updateEmailSchedule = (id: string, data: any) => api.put(`/email-schedules/${id}`, data);
export const deleteEmailSchedule = (id: string) => api.delete(`/email-schedules/${id}`);
export const triggerTestEmail = (id: string) => api.post(`/email-schedules/${id}/test`);

export const getSmtpConfig = () => api.get('/smtp-config');
export const saveSmtpConfig = (data: any) => api.post('/smtp-config', data);
export const testSmtpConfig = () => api.post('/smtp-config/test');

export type OperationsPreviewLocation = 'ktk_vvo' | 'ktk_mow' | 'garage_vvo' | 'garage_mow' | 'security_vvo';
export type OperationsPreviewSection = 'containers' | 'auto' | 'dispatchers' | 'couriers' | 'mechanics' | 'warehouse_staff' | 'guards' | 'efficiency';

export const getOperationsPreviewState = (params?: { location?: OperationsPreviewLocation; section?: OperationsPreviewSection }) =>
  api.get('/operations-preview/state', { params });
export const saveOperationsPreviewState = (
  state: Record<string, unknown>,
  updatedAt?: string | null,
  params?: { location?: OperationsPreviewLocation; section?: OperationsPreviewSection }
) =>
  api.put('/operations-preview/state', updatedAt ? { ...state, updatedAt } : state, { params });
export const downloadOperationsPreviewExcel = async (params: {
  location?: OperationsPreviewLocation;
  section: OperationsPreviewSection;
  year: number;
  month: number;
  mode: 'plan' | 'fact';
  sortField?: 'manual' | 'name' | 'plate';
  sortDirection?: 'asc' | 'desc';
  manualOrder?: string;
}) =>
  api.get('/operations-preview/export', {
    params,
    responseType: 'blob',
  });
export const downloadOperationsPreviewReport = async (params: {
  year: number;
  month: number;
  city?: 'vvo' | 'mow';
  locations?: OperationsPreviewLocation[];
  sections?: Exclude<OperationsPreviewSection, 'efficiency'>[];
  modes?: Array<'plan' | 'fact'>;
}) =>
  api.get('/operations-preview/report', {
    params: {
      ...params,
      locations: params.locations?.join(','),
      sections: params.sections?.join(','),
      modes: params.modes?.join(','),
    },
    responseType: 'blob',
  });

export default api;
