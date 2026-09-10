import api from './api';

export interface UchetTsComparisonDay {
  date: string;
  manual: Record<string, number | null>;
  uchet: Record<string, number | null>;
  hasUchetData: boolean;
  uchetSource: 'api' | 'mock' | null;
}

export interface UchetTsComparisonResponse {
  year: number;
  month: number;
  metrics: string[];
  days: UchetTsComparisonDay[];
  configured: boolean;
  syncIntervalMinutes: number;
}

export const getUchetTsComparison = (year: number, month: number) =>
  api.get<UchetTsComparisonResponse>('/uchet-ts/comparison', { params: { year, month } });

export const runUchetTsImport = () => api.post<{ daysReceived: number; daysSaved: number }>('/uchet-ts/import');

export const seedUchetTsMock = (year: number, month: number) =>
  api.post<{ daysSaved: number }>('/uchet-ts/mock', { year, month });
