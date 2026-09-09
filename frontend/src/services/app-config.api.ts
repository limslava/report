import api from './api';

export interface AppConfig {
  disabledModules: string[];
}

export const getAppConfig = () => api.get<AppConfig>('/app-config');
