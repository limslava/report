import api from './api';
import { PlanningSegment, PlanningSegmentReport, PlanningSummaryItem, PlanningYearTotalsRow } from '../types/planning-v2.types';

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
};
