import api from './api';
import { FinancialPlanResponse, FinancialVatRate } from '../types/financial-plan.types';

type ExcelDownload = {
  blob: Blob;
  filename: string | null;
};

type VatRatesResponse = {
  year: number;
  rates: FinancialVatRate[];
  warning: boolean;
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

export const financialPlanApi = {
  getReport: async (year: number): Promise<FinancialPlanResponse> => {
    const response = await api.get('/v2/financial-plan', { params: { year } });
    return response.data;
  },

  batchSaveValues: async (payload: {
    year: number;
    updates: Array<{ groupCode: string; directionCode: string; metricCode: string; month: number; value: number | null }>;
  }): Promise<{ updated: number }> => {
    const response = await api.put('/v2/financial-plan/values/batch', payload);
    return response.data;
  },

  addVatRate: async (payload: { effectiveFrom: string; rate: number }): Promise<{ id: string }> => {
    const response = await api.post('/v2/financial-plan/vat-rates', payload);
    return response.data;
  },

  getVatRates: async (year: number): Promise<VatRatesResponse> => {
    const response = await api.get('/v2/financial-plan/vat-rates', { params: { year } });
    return response.data;
  },

  downloadExcel: async (params: { year: number }): Promise<ExcelDownload> => {
    const response = await api.get('/v2/financial-plan/export', {
      params,
      responseType: 'blob',
    });
    return {
      blob: response.data as Blob,
      filename: extractFilename(response.headers['content-disposition']),
    };
  },
};
