import api from './api';
import type { FleetLocation } from './directories.api';

export type PrintTemplateMeta = { key: string; label: string; kind: 'docx' | 'xlsx' };

export type PrintFormsMeta = {
  templates: PrintTemplateMeta[];
  counterparties: Array<{ label: string; details?: string }>;
  org: { shortName: string; generalDirector: string };
  /** следующий сквозной номер доверенности по региону и текущему году */
  nextNumber: number;
};

export type PrintJournalRow = {
  id: string;
  templateKey: string;
  formNumber: number | null;
  issueDate: string;
  validUntil?: string;
  summary: string;
  createdBy: string;
  createdAt: string;
};

export const getPrintFormsMeta = (location: FleetLocation) =>
  api.get<PrintFormsMeta>('/print-forms/meta', { params: { location } });

export const generatePrintForm = (
  location: FleetLocation,
  templateKey: string,
  params: Record<string, unknown>,
  format?: 'pdf'
) => api.post('/print-forms/generate', { location, templateKey, params, format }, { responseType: 'blob' });

/** Сохранение формы в журнал без выгрузки файла — печать/скачивание из «Действий». */
export const savePrintForm = (location: FleetLocation, templateKey: string, params: Record<string, unknown>) =>
  api.post<{ ok: boolean; id: string; formNumber: number | null; summary: string }>(
    '/print-forms/generate',
    { location, templateKey, params, saveOnly: true }
  );

export const getPrintFormsJournal = (location: FleetLocation) =>
  api.get<PrintJournalRow[]>('/print-forms/journal', { params: { location } });

export const downloadPrintFormAgain = (id: string, format?: 'pdf') =>
  api.post(`/print-forms/journal/${id}/download`, {}, { responseType: 'blob', params: { format } });
