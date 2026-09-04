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
  summary: string;
  createdBy: string;
  createdAt: string;
};

export const getPrintFormsMeta = (location: FleetLocation) =>
  api.get<PrintFormsMeta>('/print-forms/meta', { params: { location } });

export const generatePrintForm = (location: FleetLocation, templateKey: string, params: Record<string, unknown>) =>
  api.post('/print-forms/generate', { location, templateKey, params }, { responseType: 'blob' });

export const getPrintFormsJournal = (location: FleetLocation) =>
  api.get<PrintJournalRow[]>('/print-forms/journal', { params: { location } });

export const downloadPrintFormAgain = (id: string) =>
  api.post(`/print-forms/journal/${id}/download`, {}, { responseType: 'blob' });
