import api from './api';
import { PlanningSegment, PlanningSegmentReport, PlanningSummaryItem, PlanningYearTotalsRow } from '../types/planning-v2.types';

type ExcelDownload = {
  blob: Blob;
  filename: string | null;
};

function extractFilename(disposition?: string): string | null {
  if (!disposition) return null;
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }
  const asciiMatch = /filename="([^"]+)"/i.exec(disposition);
  if (asciiMatch?.[1]) {
    return asciiMatch[1];
  }
  return null;
}

export const planningV2Api = {
  bootstrap: async (): Promise<{ message: string }> => {
    const response = await api.post('/v2/planning/bootstrap');
    return response.data;
  },

  getSegments: async (): Promise<PlanningSegment[]> => {
    const response = await api.get('/v2/planning/segments');
    return response.data;
  },

  getSegmentReport: async (params: {
    segmentCode: PlanningSegment['code'];
    year: number;
    month: number;
    asOfDate?: string;
  }): Promise<PlanningSegmentReport> => {
    const response = await api.get('/v2/planning/reports/segment', { params });
    return response.data;
  },

  getSummaryReport: async (params: { year: number; month: number; asOfDate?: string; detailed?: boolean }): Promise<PlanningSummaryItem[]> => {
    const response = await api.get('/v2/planning/reports/summary', { params });
    return response.data;
  },

  getYearTotals: async (year: number): Promise<{ year: number; rows: PlanningYearTotalsRow[] }> => {
    const response = await api.get('/v2/planning/totals/year', { params: { year } });
    return response.data;
  },

  updateBasePlan: async (payload: {
    year: number;
    month: number;
    segmentCode: PlanningSegment['code'];
    planMetricCode: string;
    basePlan: number;
  }): Promise<{ message: string }> => {
    const response = await api.put('/v2/planning/totals/base-plan', payload);
    return response.data;
  },

  batchSaveValues: async (payload: {
    segmentCode: PlanningSegment['code'];
    year: number;
    month: number;
    updates: Array<{ date: string; metricCode: string; value: number | null }>;
  }): Promise<{ message: string; updated: number }> => {
    const response = await api.put('/v2/planning/values/batch', payload);
    return response.data;
  },

  downloadDailyExcel: async (params: {
    segmentCode: PlanningSegment['code'];
    year: number;
    month: number;
    asOfDate: string;
  }): Promise<ExcelDownload> => {
    const response = await api.get('/v2/planning/exports/daily', {
      params,
      responseType: 'blob',
    });
    return {
      blob: response.data as Blob,
      filename: extractFilename(response.headers['content-disposition']),
    };
  },

  downloadTotalsExcel: async (params: { year: number }): Promise<ExcelDownload> => {
    const response = await api.get('/v2/planning/exports/totals', {
      params,
      responseType: 'blob',
    });
    return {
      blob: response.data as Blob,
      filename: extractFilename(response.headers['content-disposition']),
    };
  },
};
