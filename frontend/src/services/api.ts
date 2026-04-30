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
export const getUsersDirectory = () => api.get('/users/directory');
export const getContracts = () => api.get('/contracts');
export const getMasterContracts = () => api.get('/contracts/masters');
export const getContractReferences = () => api.get('/contracts/reference');
export const getContractDuplicates = (params: { inn: string; contractType: 'expense' | 'income' }) =>
  api.get('/contracts/duplicates', { params });
export const resolveCounterpartyByInn = (inn: string) => api.get('/counterparties/resolve', { params: { inn } });
export const createContract = (data: {
  contractNumber: string;
  contractType: 'expense' | 'income';
  incomeSubtype?: 'standard' | 'with_psr' | null;
  counterpartyName: string;
  counterpartyShortName?: string | null;
  ownershipForm?: string | null;
  counterpartyForm?: 'ooo' | 'ao' | 'pao' | 'zao' | 'ip' | null;
  counterpartyInn: string;
  templateKind?: 'typical' | 'non_typical';
  subject?: string | null;
  contractDate?: string | null;
  psrFlag?: boolean;
  signingMethod?: 'edo' | 'post';
}) => api.post('/contracts', data);
export const getContractApprovalSheet = (id: string) => api.get(`/contracts/${id}/approval-sheet`);
export const startContractApproval = (id: string) => api.post(`/contracts/${id}/start-approval`);
export const decideContractApprovalStep = (
  contractId: string,
  stepId: string,
  data: {
    decision: 'approve' | 'rework' | 'reject';
    comment?: string | null;
    acceptedAt?: string | null;
    signedAt?: string | null;
  }
) => api.post(`/contracts/${contractId}/steps/${stepId}/decision`, data);
export const inviteUser = (data: any) => api.post('/admin/users/invite', data);
export const updateUser = (id: string, data: any) => api.put(`/admin/users/${id}`, data);
export const resetUserPasswordByAdmin = (id: string) => api.post(`/admin/users/${id}/reset-password`);
export const reassignAndDeleteUserByAdmin = (id: string, targetUserId: string) =>
  api.post(`/admin/users/${id}/reassign-delete`, { targetUserId });
export const deleteUser = (id: string) => api.delete(`/admin/users/${id}`);
export const getSystemStats = () => api.get('/admin/stats');
export const getAuditLog = (params?: any) => api.get('/admin/audit', { params });
export const getAppSettings = () => api.get('/admin/app-settings');
export const updateAppSettings = (data: { appTitle: string }) => api.put('/admin/app-settings', data);

export const getEmailSchedules = () => api.get('/email-schedules');
export const getEmailSchedule = (id: string) => api.get(`/email-schedules/${id}`);
export const createEmailSchedule = (data: any) => api.post('/email-schedules', data);
export const updateEmailSchedule = (id: string, data: any) => api.put(`/email-schedules/${id}`, data);
export const deleteEmailSchedule = (id: string) => api.delete(`/email-schedules/${id}`);
export const triggerTestEmail = (id: string) => api.post(`/email-schedules/${id}/test`);

export const getSmtpConfig = () => api.get('/smtp-config');
export const saveSmtpConfig = (data: any) => api.post('/smtp-config', data);
export const testSmtpConfig = () => api.post('/smtp-config/test');

export const getOperationsPreviewState = (params?: { section?: 'containers' | 'auto' | 'dispatchers' | 'couriers' | 'efficiency' }) =>
  api.get('/operations-preview/state', { params });
export const saveOperationsPreviewState = (state: Record<string, unknown>, updatedAt?: string | null) =>
  api.put('/operations-preview/state', updatedAt ? { ...state, updatedAt } : state);
export const downloadOperationsPreviewExcel = async (params: {
  section: 'containers' | 'auto' | 'dispatchers' | 'couriers' | 'efficiency';
  year: number;
  month: number;
  mode: 'plan' | 'fact';
  sortField?: 'manual' | 'name' | 'plate';
  sortDirection?: 'asc' | 'desc';
}) =>
  api.get('/operations-preview/export', {
    params,
    responseType: 'blob',
  });

export default api;
