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
export const inviteUser = (data: any) => api.post('/admin/users/invite', data);
export const updateUser = (id: string, data: any) => api.put(`/admin/users/${id}`, data);
export const resetUserPasswordByAdmin = (id: string) => api.post(`/admin/users/${id}/reset-password`);
export const reassignAndDeleteUserByAdmin = (id: string, targetUserId: string) =>
  api.post(`/admin/users/${id}/reassign-delete`, { targetUserId });
export const deleteUser = (id: string) => api.delete(`/admin/users/${id}`);
export const getSystemStats = () => api.get('/admin/stats');
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

export default api;
