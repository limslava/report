import { Request, Response, NextFunction } from 'express';
import { EntityManager, In, IsNull } from 'typeorm';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import { AppDataSource } from '../config/data-source';
import {
  Contract,
  ContractDocumentKind,
  ContractIncomeSubtype,
  ContractSigningMethod,
  ContractStatus,
  ContractTemplateKind,
  ContractType,
} from '../models/contract.model';
import { ContractApprovalDecision, ContractApprovalStep } from '../models/contract-approval-step.model';
import { ContractApprovalDecisionEvent } from '../models/contract-approval-decision-event.model';
import { ContractAttachment } from '../models/contract-attachment.model';
import { User } from '../models/user.model';
import { COUNTERPARTY_FORMS, COUNTERPARTY_FORM_MAP } from '../constants/counterparty-forms';
import {
  listSlaRules,
  resolveSlaWorkdays,
  upsertSlaRules,
} from '../services/contract-approval-sla.service';
import { calculateDeadlineBySchedule, resolveEffectiveWorkSchedule } from '../services/contract-work-schedule.service';
import { listCalendarByYear, syncCalendarBySource, upsertCalendarDay } from '../services/workday-calendar.service';
import { notifyDecisionChanged, notifyStepAssigned } from '../services/contract-approval-notification.service';
import { planWebSocketService } from '../services/websocket.service';
import { logger } from '../utils/logger';
import { buildContentDisposition } from '../utils/content-disposition';
import {
  CONTRACT_APPROVAL_DASHBOARD_ROLES,
  CONTRACT_PARALLEL_APPROVAL_ROLES,
  contractApprovalRoleLabel,
} from '../constants/contract-approval';
import {
  buildContractFlowMeta,
  canCreateFinalPrintPackage,
  getCurrentApprovalSteps,
  getLatestApprovalRevision,
  getNextRevisionForDocuments,
  hasPreSecretaryApprovalRemarks,
  isParallelSecretaryRoute,
  isPreSecretaryApprovalRole,
} from '../services/contract-approval-route.service';
import { assertContractDetailAccess, hasContractDetailAccess } from '../services/contract-approval-access.service';
import {
  applyApprovalDecision,
  assignApprovalStep,
  buildApprovalStepPayloads,
  findSecretaryStepReadyForAssignment,
  getDecidedPreSecretaryPeers,
} from '../services/contract-approval-workflow.service';

const contractRepository = AppDataSource.getRepository(Contract);
const stepRepository = AppDataSource.getRepository(ContractApprovalStep);
const decisionEventRepository = AppDataSource.getRepository(ContractApprovalDecisionEvent);
const attachmentRepository = AppDataSource.getRepository(ContractAttachment);
const userRepository = AppDataSource.getRepository(User);
const execFileAsync = promisify(execFile);

const MAX_CONTRACT_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_CONTRACT_FILE_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg']);

function notifyContractApprovalUpdated(contractId: string, userId?: string) {
  planWebSocketService.notifyContractApprovalUpdated({ contractId, userId });
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return value.toISOString();
}

function toYmdOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    // Postgres DATE often comes as YYYY-MM-DD string in JS driver.
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function buildAttachmentDisposition(filename: string, disposition: 'attachment' | 'inline' = 'attachment'): string {
  return buildContentDisposition(filename, disposition, 'attachment');
}

function normalizeFilename(name: string): string {
  return name.replace(/[^\w.\-()\u0400-\u04FF ]/g, '_').slice(0, 180) || 'document';
}

function getContractsUploadRoot(contractId: string): string {
  const configuredRoot = process.env.UPLOAD_PATH
    ? path.resolve(process.env.UPLOAD_PATH)
    : path.resolve(process.cwd(), 'uploads');
  return path.join(configuredRoot, 'contracts', contractId);
}

function serializeAttachment(item: ContractAttachment) {
  return {
    id: item.id,
    originalName: item.originalName,
    sizeBytes: item.sizeBytes,
    mimeType: item.mimeType,
    createdAt: item.createdAt,
    uploadedByUserId: item.uploadedByUserId,
    context: item.context,
    revisionNo: item.revisionNo || 1,
  };
}

function contractRevisionKey(contractId: string, revisionNo: number): string {
  return `${contractId}:${revisionNo}`;
}

async function loadContractFilesByStepRevision(steps: ContractApprovalStep[]): Promise<Map<string, ContractAttachment[]>> {
  const contractIds = [...new Set(steps.map((step) => step.contractId))];
  if (!contractIds.length) {
    return new Map();
  }

  const revisionKeys = new Set(steps.map((step) => contractRevisionKey(step.contractId, step.revisionNo || 1)));
  const files = await attachmentRepository.find({
    where: { contractId: In(contractIds), approvalStepId: IsNull() },
    order: { createdAt: 'ASC' },
  });
  const filesByRevision = new Map<string, ContractAttachment[]>();

  for (const file of files) {
    const key = contractRevisionKey(file.contractId, file.revisionNo || 1);
    if (!revisionKeys.has(key)) {
      continue;
    }
    const current = filesByRevision.get(key) ?? [];
    current.push(file);
    filesByRevision.set(key, current);
  }

  return filesByRevision;
}

function assertAllowedContractFile(file: any, originalName: string, buffer: Buffer): void {
  const extension = path.extname(originalName).toLowerCase();
  if (!ALLOWED_CONTRACT_FILE_EXTENSIONS.has(extension)) {
    const error: any = new Error('Разрешены файлы PDF, DOC, DOCX, PNG и JPG');
    error.statusCode = 400;
    throw error;
  }
  if (buffer.length === 0 || buffer.length > MAX_CONTRACT_FILE_BYTES) {
    const error: any = new Error('Размер одного файла должен быть от 1 байта до 20 МБ');
    error.statusCode = 400;
    throw error;
  }
  const declaredSize = Number(file?.size);
  if (Number.isFinite(declaredSize) && declaredSize > 0 && declaredSize !== buffer.length) {
    const error: any = new Error('Размер загруженного файла не совпадает с переданными данными');
    error.statusCode = 400;
    throw error;
  }
}

async function hasIdenticalAttachment(
  contractId: string,
  approvalStepId: string | null,
  context: 'contract' | 'approval_step',
  originalName: string,
  revisionNo: number,
  buffer: Buffer,
): Promise<boolean> {
  const candidates = await attachmentRepository.find({
    where: {
      contractId,
      approvalStepId: approvalStepId ?? IsNull(),
      context,
      originalName,
      sizeBytes: buffer.length,
      revisionNo,
    },
  });
  const incomingHash = crypto.createHash('sha256').update(buffer).digest('hex');
  for (const candidate of candidates) {
    // Avoid dropping a corrected file solely because its name and byte count match.
    const readablePath = await resolveAttachmentPath(candidate);
    if (!readablePath) continue;
    const existingBuffer = await fs.readFile(readablePath);
    const existingHash = crypto.createHash('sha256').update(existingBuffer).digest('hex');
    if (existingHash === incomingHash) return true;
  }
  return false;
}

async function persistContractAttachments(params: {
  contractId: string;
  files: any[];
  approvalStepId?: string | null;
  uploadedByUserId?: string | null;
  context?: 'contract' | 'approval_step';
  revisionNo?: number;
}): Promise<number> {
  const {
    contractId,
    files,
    approvalStepId = null,
    uploadedByUserId = null,
    context = 'contract',
    revisionNo = 1,
  } = params;
  const uploadsRoot = getContractsUploadRoot(contractId);
  await fs.mkdir(uploadsRoot, { recursive: true });

  let uploaded = 0;
  for (const file of files) {
    const originalName = normalizeFilename(String(file?.name || 'document'));
    const contentBase64 = String(file?.contentBase64 || '');
    if (!contentBase64) continue;

    const buffer = Buffer.from(contentBase64, 'base64');
    assertAllowedContractFile(file, originalName, buffer);
    if (await hasIdenticalAttachment(contractId, approvalStepId, context, originalName, revisionNo, buffer)) continue;

    const ext = path.extname(originalName);
    const storedName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    const fullPath = path.join(uploadsRoot, storedName);
    await fs.writeFile(fullPath, buffer);

    const attachment = attachmentRepository.create({
      contractId,
      approvalStepId,
      uploadedByUserId,
      context,
      revisionNo,
      originalName,
      mimeType: file?.mimeType ? String(file.mimeType) : null,
      sizeBytes: buffer.length,
      storagePath: fullPath,
    });
    await attachmentRepository.save(attachment);
    uploaded += 1;
  }

  return uploaded;
}

async function resolveAttachmentPath(item: ContractAttachment): Promise<string | null> {
  const candidates = new Set<string>();
  if (item.storagePath) {
    candidates.add(item.storagePath);
    candidates.add(path.resolve(process.cwd(), item.storagePath));
  }
  const basename = path.basename(item.storagePath || '');
  if (basename) {
    candidates.add(path.join(getContractsUploadRoot(item.contractId), basename));
    candidates.add(path.resolve(process.cwd(), 'uploads', 'contracts', item.contractId, basename));
  }
  if (item.originalName) {
    candidates.add(path.resolve(process.cwd(), 'uploads', 'contracts', item.contractId, item.originalName));
  }

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return candidate;
      }
      if (stat.isDirectory()) {
        // Legacy fallback: if DB path points to directory, try to find the exact file inside.
        const entries = await fs.readdir(candidate);
        const preferred = entries.find((name) => name === item.originalName) ?? entries[0];
        if (preferred) {
          const nested = path.join(candidate, preferred);
          const nestedStat = await fs.stat(nested);
          if (nestedStat.isFile()) {
            return nested;
          }
        }
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

function isDocxAttachment(item: ContractAttachment): boolean {
  return path.extname(item.originalName).toLowerCase() === '.docx'
    || item.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

async function resolveAttachmentForUser(attachmentId: string, userId?: string, role?: string) {
  const item = await attachmentRepository.findOne({ where: { id: attachmentId }, relations: ['contract'] as any });
  if (!item) {
    const error: any = new Error('Файл не найден');
    error.statusCode = 404;
    throw error;
  }

  const contract = item.contract ?? await contractRepository.findOne({ where: { id: item.contractId } });
  if (!contract) {
    const error: any = new Error('Договор для вложения не найден');
    error.statusCode = 404;
    throw error;
  }

  const routeSteps = await stepRepository.find({ where: { contractId: contract.id } });
  if (!hasContractDetailAccess(contract, routeSteps, userId, role)) {
    const error: any = new Error('Нет доступа к файлу договора');
    error.statusCode = 403;
    throw error;
  }

  const readablePath = await resolveAttachmentPath(item);
  if (!readablePath) {
    const error: any = new Error('Файл вложения не найден в хранилище');
    error.statusCode = 404;
    throw error;
  }

  return { item, readablePath };
}

async function getDocxPdfPreviewPath(readablePath: string): Promise<string> {
  const cachedPreviewPath = `${readablePath}.preview.pdf`;
  try {
    await fs.access(cachedPreviewPath);
    return cachedPreviewPath;
  } catch {
    // PDF will be generated below and reused for later views.
  }

  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'contract-docx-preview-'));
  const libreOfficeBins = [
    process.env.LIBREOFFICE_BIN,
    'libreoffice',
    'soffice',
  ].filter(Boolean) as string[];
  let converterNotFound = false;
  try {
    for (const libreOfficeBin of libreOfficeBins) {
      try {
        await execFileAsync(
          libreOfficeBin,
          ['--headless', '--convert-to', 'pdf', '--outdir', outputDirectory, readablePath],
          { timeout: 60_000, maxBuffer: 1024 * 1024 },
        );
        converterNotFound = false;
        break;
      } catch (error: any) {
        if (error?.code === 'ENOENT') {
          converterNotFound = true;
          continue;
        }
        throw error;
      }
    }
    if (converterNotFound) {
      const unavailable: any = new Error('Предпросмотр DOCX временно недоступен: на сервере не установлен конвертер документов');
      unavailable.statusCode = 503;
      throw unavailable;
    }
    const generatedFiles = await fs.readdir(outputDirectory);
    const generatedPdf = generatedFiles.find((fileName) => fileName.toLowerCase().endsWith('.pdf'));
    if (!generatedPdf) {
      const error: any = new Error('Не удалось сформировать PDF-просмотр документа DOCX');
      error.statusCode = 500;
      throw error;
    }
    await fs.copyFile(path.join(outputDirectory, generatedPdf), cachedPreviewPath);
    return cachedPreviewPath;
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
}

async function resolveApproverUserId(roleCode: string, contract: Contract): Promise<string> {
  if (roleCode === 'initiator') {
    return contract.initiatorId;
  }

  if (roleCode === 'general_director') {
    if (contract.assignedGeneralDirectorId) {
      return contract.assignedGeneralDirectorId;
    }
    const gd = await userRepository.findOne({ where: { role: 'general_director' as any, isActive: true }, order: { createdAt: 'ASC' } });
    if (!gd) {
      const error: any = new Error('Не найден активный пользователь с ролью Генеральный директор');
      error.statusCode = 400;
      throw error;
    }
    return gd.id;
  }

  const approver = await userRepository.findOne({
    where: { role: roleCode as any, isActive: true },
    order: { createdAt: 'ASC' },
  });

  if (!approver) {
    const error: any = new Error(`Не найден активный пользователь для роли: ${contractApprovalRoleLabel(roleCode)}`);
    error.statusCode = 400;
    throw error;
  }

  return approver.id;
}

async function saveDecisionEvent(
  manager: EntityManager | null,
  params: {
    contractId: string;
    step: ContractApprovalStep;
    actorUserId: string;
    previousDecision: ContractApprovalDecision | null;
    previousComment: string | null;
  },
): Promise<void> {
  const repository = manager ? manager.getRepository(ContractApprovalDecisionEvent) : decisionEventRepository;
  const event = repository.create({
    contractId: params.contractId,
    approvalStepId: params.step.id,
    actorUserId: params.actorUserId,
    roleCode: params.step.roleCode,
    revisionNo: params.step.revisionNo || 1,
    previousDecision: params.previousDecision,
    newDecision: params.step.decision as ContractApprovalDecision,
    previousComment: params.previousComment,
    newComment: params.step.comment,
  });
  await repository.save(event);
}

const PDF_A4: [number, number] = [595.28, 841.89];
const PDF_MARGIN = 24;

type PdfTextStyle = {
  size?: number;
  bold?: boolean;
  color?: ReturnType<typeof rgb>;
};

type PdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
};

function safePdfText(value: unknown): string {
  return String(value ?? '—').trim() || '—';
}

function formatPdfDate(value: Date | string | null | undefined): string {
  const ymd = toYmdOrNull(value);
  if (!ymd) return '—';
  const [year, month, day] = ymd.split('-');
  return [day, month, year].filter(Boolean).join('.');
}

function formatPdfDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Vladivostok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatPdfContractType(contract: Contract): string {
  if (contract.contractType === ContractType.EXPENSE) return 'Расходный';
  return contract.incomeSubtype === ContractIncomeSubtype.WITH_PSR ? 'Доходный (с ПСР)' : 'Доходный (без ПСР)';
}

function formatPdfTemplateKind(contract: Contract): string {
  return contract.templateKind === ContractTemplateKind.TYPICAL ? 'типовой' : 'не типовой';
}

function formatPdfSigningMethod(contract: Contract): string {
  return contract.signingMethod === ContractSigningMethod.EDO ? 'ЭДО' : 'почта';
}

function formatPdfStepDecision(step: ContractApprovalStep): string {
  if (!step.decision) return step.assignedAt ? 'Ожидает' : '—';
  if (step.decision === ContractApprovalDecision.REJECT) return 'Не согласован';
  if (step.decision === ContractApprovalDecision.REWORK) return 'На доработку';
  return step.comment?.trim() ? 'Согласован с замечаниями' : 'Согласован';
}

function buildContractPdfPackageFileName(contract: Contract): string {
  const counterparty = safePdfText(contract.counterpartyName)
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'Контрагент';
  return `${counterparty}_${formatPdfDate(contract.contractDate)}.pdf`;
}

async function loadPdfFonts(pdf: PDFDocument): Promise<PdfFonts> {
  pdf.registerFontkit(fontkit);
  const candidates = [
    process.env.PDF_FONT_PATH,
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/Library/Fonts/Arial Unicode.ttf',
  ].filter(Boolean) as string[];

  let regularBytes: Uint8Array | null = null;
  let boldBytes: Uint8Array | null = null;
  for (const candidate of candidates) {
    try {
      const data = await fs.readFile(candidate);
      if (candidate.toLowerCase().includes('bold')) {
        boldBytes = data;
      } else {
        regularBytes = regularBytes ?? data;
      }
    } catch {
      // try next font
    }
  }
  boldBytes = boldBytes ?? regularBytes;
  if (!regularBytes || !boldBytes) {
    const error: any = new Error('Не найден шрифт для формирования PDF-пакета');
    error.statusCode = 500;
    throw error;
  }

  return {
    regular: await pdf.embedFont(regularBytes, { subset: true }),
    bold: await pdf.embedFont(boldBytes, { subset: true }),
  };
}

function wrapPdfText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safePdfText(text).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      line = word;
      continue;
    }
    let chunk = '';
    for (const char of word) {
      const nextChunk = `${chunk}${char}`;
      if (font.widthOfTextAtSize(nextChunk, size) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk = nextChunk;
      }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines.length ? lines : ['—'];
}

function drawPdfText(
  page: PDFPage,
  fonts: PdfFonts,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  style: PdfTextStyle = {},
): number {
  const size = style.size ?? 9;
  const font = style.bold ? fonts.bold : fonts.regular;
  const lines = wrapPdfText(text, font, size, maxWidth);
  let cursorY = y;
  for (const line of lines) {
    page.drawText(line, {
      x,
      y: cursorY,
      size,
      font,
      color: style.color ?? rgb(0.13, 0.16, 0.22),
    });
    cursorY -= size + 2;
  }
  return cursorY;
}

function drawPdfCell(
  page: PDFPage,
  fonts: PdfFonts,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  style: PdfTextStyle = {},
): void {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.25, 0.25, 0.25),
    borderWidth: 0.7,
  });
  drawPdfText(page, fonts, text, x + 6, y + height - 14, width - 12, style);
}

function ensurePdfPage(pdf: PDFDocument, y: number, requiredHeight = 0): { page: PDFPage; y: number } {
  const pages = pdf.getPages();
  if (!pages.length || y - requiredHeight < 80) {
    return { page: pdf.addPage(PDF_A4), y: PDF_A4[1] - PDF_MARGIN };
  }
  return { page: pages[pages.length - 1], y };
}

function getApprovalStartDate(steps: ContractApprovalStep[], contract: Contract): Date | string | null {
  return steps.find((step) => step.assignedAt)?.assignedAt ?? contract.createdAt ?? null;
}

async function appendApprovalSheetPdf(
  pdf: PDFDocument,
  contract: Contract,
  steps: ContractApprovalStep[],
  filesByStep: Map<string, ContractAttachment[]>,
): Promise<void> {
  const fonts = await loadPdfFonts(pdf);
  const contentWidth = PDF_A4[0] - PDF_MARGIN * 2;
  let page = pdf.addPage(PDF_A4);
  let y = PDF_A4[1] - PDF_MARGIN;

  const title = 'Лист согласования ООО «Симпл Вэй»';
  const titleWidth = fonts.bold.widthOfTextAtSize(title, 12);
  page.drawText(title, {
    x: (PDF_A4[0] - titleWidth) / 2,
    y,
    size: 12,
    font: fonts.bold,
  });
  y -= 26;

  const labelWidth = 190;
  const valueWidth = contentWidth - labelWidth;
  const infoRows = [
    ['Контрагент:', contract.counterpartyName],
    ['Тип договора (типовой/не типовой):', formatPdfTemplateKind(contract)],
    ['Предмет/номера договора:', contract.subject || contract.contractNumber],
    ['ПСР (Протокол разногласий):', contract.psrFlag ? 'ПСР' : '—'],
    ['Статья бюджета (доходный/расходный):', formatPdfContractType(contract)],
    ['Способ подписания (ЭДО/почта):', formatPdfSigningMethod(contract)],
  ] as const;
  for (const [label, value] of infoRows) {
    const rowHeight = 34;
    drawPdfCell(page, fonts, label, PDF_MARGIN, y - rowHeight, labelWidth, rowHeight, { bold: true, size: 8.5 });
    drawPdfCell(page, fonts, value, PDF_MARGIN + labelWidth, y - rowHeight, valueWidth, rowHeight, { size: 8.5 });
    y -= rowHeight;
  }

  y -= 24;
  const section = 'Согласование сторон';
  const sectionWidth = fonts.bold.widthOfTextAtSize(section, 10);
  page.drawText(section, { x: (PDF_A4[0] - sectionWidth) / 2, y, size: 10, font: fonts.bold });
  y -= 18;

  const headers = ['Сторона', 'ФИО', 'Статус', 'Дата принятия', 'Дата визирования', 'Комментарий'];
  const widths = [112, 108, 90, 72, 76, contentWidth - 112 - 108 - 90 - 72 - 76];
  const headerHeight = 34;
  let x = PDF_MARGIN;
  headers.forEach((header, index) => {
    drawPdfCell(page, fonts, header, x, y - headerHeight, widths[index], headerHeight, { bold: true, size: 8 });
    x += widths[index];
  });
  y -= headerHeight;

  void filesByStep;
  const rows: string[][] = [];
  const startDate = getApprovalStartDate(steps, contract);
  rows.push([
    'Инициатор (ответственный менеджер)',
    contract.initiator?.fullName ?? contract.initiator?.email ?? '—',
    'Согласован',
    formatPdfDateTime(startDate),
    formatPdfDateTime(startDate),
    '—',
  ]);
  for (const step of steps.filter((item) => item.roleCode !== 'secretary')) {
    rows.push([
      contractApprovalRoleLabel(step.roleCode),
      step.approverUser?.fullName ?? step.approverUser?.email ?? '—',
      formatPdfStepDecision(step),
      formatPdfDateTime(step.acceptedAt),
      formatPdfDateTime(step.signedAt),
      step.comment?.trim() || '—',
    ]);
  }
  rows.push([
    'Генеральный директор',
    'Васильковский М.О.',
    '',
    '',
    '',
    '',
  ]);

  for (const row of rows) {
    const cellLineCounts = row.map((text, index) => {
      const font = index === 0 ? fonts.bold : fonts.regular;
      return wrapPdfText(text, font, 7.2, widths[index] - 10).length;
    });
    const rowHeight = Math.max(28, Math.max(...cellLineCounts) * 9.5 + 12);
    const next = ensurePdfPage(pdf, y, rowHeight);
    page = next.page;
    y = next.y;
    x = PDF_MARGIN;
    row.forEach((text, index) => {
      drawPdfCell(page, fonts, text, x, y - rowHeight, widths[index], rowHeight, {
        bold: index === 0,
        size: 7.2,
      });
      x += widths[index];
    });
    y -= rowHeight;
  }

}

async function appendTextNoticePage(pdf: PDFDocument, title: string, message: string): Promise<void> {
  const fonts = await loadPdfFonts(pdf);
  const page = pdf.addPage(PDF_A4);
  let y = PDF_A4[1] - PDF_MARGIN;
  y = drawPdfText(page, fonts, title, PDF_MARGIN, y, PDF_A4[0] - PDF_MARGIN * 2, { bold: true, size: 13 });
  drawPdfText(page, fonts, message, PDF_MARGIN, y - 12, PDF_A4[0] - PDF_MARGIN * 2, { size: 9 });
}

async function appendAttachmentToPdf(pdf: PDFDocument, attachment: ContractAttachment): Promise<void> {
  const readablePath = await resolveAttachmentPath(attachment);
  if (!readablePath) {
    await appendTextNoticePage(pdf, 'Файл не найден', attachment.originalName);
    return;
  }

  const ext = path.extname(attachment.originalName).toLowerCase();
  try {
    if (ext === '.pdf' || attachment.mimeType === 'application/pdf' || isDocxAttachment(attachment)) {
      const sourcePath = isDocxAttachment(attachment) ? await getDocxPdfPreviewPath(readablePath) : readablePath;
      const sourcePdf = await PDFDocument.load(await fs.readFile(sourcePath), { ignoreEncryption: true });
      const copiedPages = await pdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
      copiedPages.forEach((copiedPage) => pdf.addPage(copiedPage));
      return;
    }

    if (['.png', '.jpg', '.jpeg'].includes(ext) || ['image/png', 'image/jpeg'].includes(attachment.mimeType || '')) {
      const imageBytes = await fs.readFile(readablePath);
      const image = ext === '.png' || attachment.mimeType === 'image/png'
        ? await pdf.embedPng(imageBytes)
        : await pdf.embedJpg(imageBytes);
      const page = pdf.addPage(PDF_A4);
      const maxWidth = PDF_A4[0] - PDF_MARGIN * 2;
      const maxHeight = PDF_A4[1] - PDF_MARGIN * 2;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, {
        x: (PDF_A4[0] - width) / 2,
        y: (PDF_A4[1] - height) / 2,
        width,
        height,
      });
      return;
    }

    await appendTextNoticePage(
      pdf,
      'Файл не включен в PDF-пакет',
      `${attachment.originalName}\nФормат можно скачать отдельно из карточки договора.`,
    );
  } catch (error) {
    logger.warn('Failed to append contract attachment to PDF package', {
      attachmentId: attachment.id,
      originalName: attachment.originalName,
      error: error instanceof Error ? error.message : String(error),
    });
    await appendTextNoticePage(
      pdf,
      'Файл не удалось включить в PDF-пакет',
      `${attachment.originalName}\nФайл можно скачать отдельно из карточки договора.`,
    );
  }
}

function requireStartFields(contract: Contract): void {
  if (!contract.contractNumber?.trim()) {
    const error: any = new Error('Не заполнено поле № договора');
    error.statusCode = 400;
    throw error;
  }

  if (!contract.counterpartyName?.trim()) {
    const error: any = new Error('Не заполнено поле контрагент');
    error.statusCode = 400;
    throw error;
  }

  if (!contract.subject?.trim()) {
    const error: any = new Error('Не заполнено поле предмет договора');
    error.statusCode = 400;
    throw error;
  }

  if (!contract.contractDate) {
    const error: any = new Error('Не заполнена дата договора');
    error.statusCode = 400;
    throw error;
  }

  if (contract.contractType === ContractType.INCOME && !contract.incomeSubtype) {
    const error: any = new Error('Для доходного договора обязателен подтип');
    error.statusCode = 400;
    throw error;
  }

  if (contract.contractType === ContractType.INCOME && contract.incomeSubtype === ContractIncomeSubtype.WITH_PSR && !contract.psrFlag) {
    const error: any = new Error('Для доходного договора с ПСР признак ПСР должен быть включен');
    error.statusCode = 400;
    throw error;
  }
}

function validateInnByCounterpartyForm(inn: string, counterpartyForm: string | null): void {
  if (!counterpartyForm) {
    return;
  }
  const form = COUNTERPARTY_FORM_MAP.get(counterpartyForm as any);
  if (!form) {
    const error: any = new Error('Неизвестная форма собственности контрагента');
    error.statusCode = 400;
    throw error;
  }
  if (inn.length !== form.innLength) {
    const error: any = new Error(`Для формы ${form.label} ИНН должен содержать ${form.innLength} цифр`);
    error.statusCode = 400;
    throw error;
  }
}

export const getContractReferences = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      counterpartyForms: COUNTERPARTY_FORMS,
    });
  } catch (error) {
    next(error);
  }
};

export const getContractSlaRules = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rules = await listSlaRules();
    res.json(rules);
  } catch (error) {
    next(error);
  }
};

export const updateContractSlaRules = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = Array.isArray(req.body?.rules) ? req.body.rules : [];
    await upsertSlaRules(payload);
    const rules = await listSlaRules();
    res.json(rules);
  } catch (error) {
    next(error);
  }
};

export const getWorkCalendar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const year = Number(req.query.year || new Date().getUTCFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      const error: any = new Error('Некорректный год');
      error.statusCode = 400;
      throw error;
    }
    const rows = await listCalendarByYear(year);
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const upsertWorkCalendarDay = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const date = String(req.params.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const error: any = new Error('Некорректный формат даты. Используйте YYYY-MM-DD');
      error.statusCode = 400;
      throw error;
    }
    const { isWorkday, comment } = req.body as { isWorkday: boolean; comment?: string | null };
    await upsertCalendarDay(date, Boolean(isWorkday), comment?.trim() || null);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const syncWorkCalendar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const year = Number(req.query.year || new Date().getUTCFullYear());
    const source = String(req.query.source || 'isdayoff') as 'isdayoff' | 'weekend-default';
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      const error: any = new Error('Некорректный год');
      error.statusCode = 400;
      throw error;
    }
    if (!['isdayoff', 'weekend-default'].includes(source)) {
      const error: any = new Error('Некорректный источник календаря');
      error.statusCode = 400;
      throw error;
    }
    await syncCalendarBySource(year, source);
    res.json({ ok: true, year, source });
  } catch (error) {
    next(error);
  }
};

export const findContractDuplicates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inn = String(req.query.inn ?? '').trim();
    const contractType = String(req.query.contractType ?? '').trim() as ContractType;
    if (!inn || (contractType !== ContractType.EXPENSE && contractType !== ContractType.INCOME)) {
      const error: any = new Error('Не переданы параметры поиска дублей');
      error.statusCode = 400;
      throw error;
    }

    const duplicates = await contractRepository.find({
      where: {
        counterpartyInn: inn,
        contractType,
      },
      relations: ['initiator'],
      order: { createdAt: 'DESC' },
      take: 20,
    });

    res.json(duplicates.map((contract) => ({
      id: contract.id,
      contractNumber: contract.contractNumber,
      contractDate: toYmdOrNull(contract.contractDate),
      subject: contract.subject,
      counterpartyName: contract.counterpartyName,
      status: contract.status,
      initiatorName: contract.initiator?.fullName ?? null,
      createdAt: contract.createdAt,
    })));
  } catch (error) {
    next(error);
  }
};

export const listContracts = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const contracts = await contractRepository.find({
      relations: ['initiator', 'parentContract', 'assignedGeneralDirector'],
      order: { createdAt: 'DESC' },
      take: 200,
    });

    const contractIds = contracts.map((c) => c.id);
    const steps = contractIds.length
      ? await stepRepository.find({
        where: { contractId: In(contractIds) },
        order: { contractId: 'ASC', orderNo: 'ASC' },
      })
      : [];
    const stepsByContract = new Map<string, ContractApprovalStep[]>();
    for (const step of steps) {
      const list = stepsByContract.get(step.contractId) ?? [];
      list.push(step);
      stepsByContract.set(step.contractId, list);
    }
    const secretaryStepIds = steps
      .filter((step) => step.roleCode === 'secretary')
      .map((step) => step.id);
    const secretaryAttachments = secretaryStepIds.length
      ? await attachmentRepository.find({
        where: { approvalStepId: In(secretaryStepIds) },
        select: ['approvalStepId'],
      })
      : [];
    const secretaryStepsWithFiles = new Set(
      secretaryAttachments
        .map((attachment) => attachment.approvalStepId)
        .filter((stepId): stepId is string => Boolean(stepId)),
    );

    res.json(contracts.map((contract) => {
      const contractSteps = stepsByContract.get(contract.id) ?? [];
      const secretaryStep = getCurrentApprovalSteps(contractSteps).find((step) => step.roleCode === 'secretary') ?? null;
      return {
        ...buildContractFlowMeta({
          contract,
          steps: contractSteps,
          roleLabel: contractApprovalRoleLabel,
          secretaryHasSignedFile: secretaryStep ? secretaryStepsWithFiles.has(secretaryStep.id) : false,
        }),
        id: contract.id,
        contractNumber: contract.contractNumber,
        contractType: contract.contractType,
        incomeSubtype: contract.incomeSubtype,
        counterpartyName: contract.counterpartyName,
        counterpartyShortName: contract.counterpartyShortName,
        ownershipForm: contract.ownershipForm,
        counterpartyForm: contract.counterpartyForm,
        counterpartyInn: contract.counterpartyInn,
        templateKind: contract.templateKind,
        subject: contract.subject,
        contractDate: toYmdOrNull(contract.contractDate),
        psrFlag: contract.psrFlag,
        signingMethod: contract.signingMethod,
        status: contract.status,
        documentKind: contract.documentKind,
        parentContractId: contract.parentContractId,
        parentContractNumber: contract.parentContract?.contractNumber ?? null,
        assignedGeneralDirectorId: contract.assignedGeneralDirectorId,
        assignedGeneralDirector: null,
        initiator: contract.initiator
          ? { id: contract.initiator.id, fullName: contract.initiator.fullName, role: contract.initiator.role }
          : null,
        createdAt: contract.createdAt,
        updatedAt: contract.updatedAt,
      };
    }));
  } catch (error) {
    next(error);
  }
};

export const listSecurityInbox = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      const error: any = new Error('Пользователь не авторизован');
      error.statusCode = 401;
      throw error;
    }

    const view = String(req.query.view || 'active').trim();
    if (!['active', 'processed', 'completed_month', 'all'].includes(view)) {
      const error: any = new Error('Некорректный фильтр');
      error.statusCode = 400;
      throw error;
    }
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const steps = await stepRepository.find({
      where: {
        roleCode: 'security',
      },
      relations: ['contract', 'contract.initiator'],
      order: { createdAt: 'DESC' },
    });

    const latestStepsByContract = new Map<string, ContractApprovalStep>();
    for (const step of steps) {
      const existing = latestStepsByContract.get(step.contractId);
      if (!existing || (step.revisionNo || 1) > (existing.revisionNo || 1)) {
        latestStepsByContract.set(step.contractId, step);
      }
    }
    const filteredSteps = Array.from(latestStepsByContract.values())
      .filter((step) => {
        if (!step.contract) return false;
        const isActive = !step.decision && step.contract.status === ContractStatus.IN_APPROVAL;
        const isProcessed = Boolean(step.decision);
        if (view === 'active') return isActive;
        if (view === 'processed') return isProcessed;
        if (view === 'completed_month') {
          return isProcessed
            && step.approverUserId === currentUserId
            && Boolean(step.signedAt)
            && new Date(step.signedAt as Date) >= startOfMonth;
        }
        return isActive || isProcessed;
      });

    // Avoid duplicate contracts in inbox: keep only most recent security step per contract.
    const uniqueByContract = new Map<string, ContractApprovalStep>();
    for (const step of filteredSteps) {
      const existing = uniqueByContract.get(step.contractId);
      if (!existing) {
        uniqueByContract.set(step.contractId, step);
        continue;
      }
      const existingTs = new Date(existing.createdAt).getTime();
      const currentTs = new Date(step.createdAt).getTime();
      if (currentTs > existingTs) {
        uniqueByContract.set(step.contractId, step);
      }
    }

    const uniqueSteps = Array.from(uniqueByContract.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const filesByRevision = await loadContractFilesByStepRevision(uniqueSteps);

    const data = uniqueSteps.map((step) => {
        const files = filesByRevision.get(contractRevisionKey(step.contractId, step.revisionNo || 1)) ?? [];
        return {
          contractId: step.contract.id,
          stepId: step.id,
          contractNumber: step.contract.contractNumber,
          counterpartyShortName: step.contract.counterpartyShortName,
          counterpartyForm: step.contract.counterpartyForm,
          counterpartyInn: step.contract.counterpartyInn,
          contractType: step.contract.contractType,
          incomeSubtype: step.contract.incomeSubtype,
          counterpartyName: step.contract.counterpartyName,
          subject: step.contract.subject,
          contractDate: toYmdOrNull(step.contract.contractDate),
          initiatorName: step.contract.initiator?.fullName ?? '—',
          assignedAt: toIsoOrNull(step.assignedAt),
          deadlineAt: toIsoOrNull(step.deadlineAt),
          securityDecision: step.decision,
          securitySignedAt: toIsoOrNull(step.signedAt),
          securityComment: step.comment,
          attachments: files.map(serializeAttachment),
        };
      });

    res.json(data);
  } catch (error) {
    next(error);
  }
};

export const listMyApprovalInbox = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUserRole = req.user?.role;
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      const error: any = new Error('Пользователь не авторизован');
      error.statusCode = 401;
      throw error;
    }
    if (!currentUserRole || !CONTRACT_PARALLEL_APPROVAL_ROLES.includes(currentUserRole as typeof CONTRACT_PARALLEL_APPROVAL_ROLES[number])
      && currentUserRole !== 'secretary') {
      const error: any = new Error('Для роли недоступна очередь согласования');
      error.statusCode = 403;
      throw error;
    }

    const view = String(req.query.view || 'active').trim();
    if (!['active', 'processed', 'completed_month', 'all'].includes(view)) {
      const error: any = new Error('Некорректный фильтр');
      error.statusCode = 400;
      throw error;
    }
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const steps = await stepRepository.find({
      where: { roleCode: currentUserRole, approverUserId: currentUserId },
      relations: ['contract', 'contract.initiator'],
      order: { createdAt: 'DESC' },
    });

    const latestStepsByContract = new Map<string, ContractApprovalStep>();
    for (const step of steps) {
      const existing = latestStepsByContract.get(step.contractId);
      if (!existing || (step.revisionNo || 1) > (existing.revisionNo || 1)) {
        latestStepsByContract.set(step.contractId, step);
      }
    }
    const filteredSteps = Array.from(latestStepsByContract.values()).filter((step) => {
      if (!step.contract || !step.assignedAt) return false;
      const isActive = !step.decision && step.contract.status === ContractStatus.IN_APPROVAL;
      const isProcessed = Boolean(step.decision);
      if (view === 'active') return isActive;
      if (view === 'processed') return isProcessed;
      if (view === 'completed_month') {
        return isProcessed && Boolean(step.signedAt) && new Date(step.signedAt as Date) >= startOfMonth;
      }
      return isActive || isProcessed;
    });

    const uniqueByContract = new Map<string, ContractApprovalStep>();
    for (const step of filteredSteps) {
      const existing = uniqueByContract.get(step.contractId);
      if (!existing || new Date(step.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        uniqueByContract.set(step.contractId, step);
      }
    }

    const uniqueSteps = Array.from(uniqueByContract.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const filesByRevision = await loadContractFilesByStepRevision(uniqueSteps);

    const data = uniqueSteps.map((step) => {
      const files = filesByRevision.get(contractRevisionKey(step.contractId, step.revisionNo || 1)) ?? [];
      return {
        contractId: step.contract.id,
        stepId: step.id,
        contractNumber: step.contract.contractNumber,
        counterpartyShortName: step.contract.counterpartyShortName,
        counterpartyInn: step.contract.counterpartyInn,
        contractType: step.contract.contractType,
        incomeSubtype: step.contract.incomeSubtype,
        counterpartyName: step.contract.counterpartyName,
        subject: step.contract.subject,
        contractDate: toYmdOrNull(step.contract.contractDate),
        signingMethod: step.contract.signingMethod,
        initiatorName: step.contract.initiator?.fullName ?? '—',
        assignedAt: toIsoOrNull(step.assignedAt),
        deadlineAt: toIsoOrNull(step.deadlineAt),
        stepDecision: step.decision,
        stepSignedAt: toIsoOrNull(step.signedAt),
        stepComment: step.comment,
        roleCode: step.roleCode,
        roleLabel: contractApprovalRoleLabel(step.roleCode),
        attachments: files.map(serializeAttachment),
      };
    });

    res.json(data);
  } catch (error) {
    next(error);
  }
};

export const getMyApprovalDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUserId = req.user?.id;
    const currentUserRole = req.user?.role;
    if (!currentUserId) {
      const error: any = new Error('Пользователь не авторизован');
      error.statusCode = 401;
      throw error;
    }
    if (!currentUserRole || !CONTRACT_APPROVAL_DASHBOARD_ROLES.has(currentUserRole)) {
      const error: any = new Error('Дашборд согласования доступен только участникам маршрута согласования');
      error.statusCode = 403;
      throw error;
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    const roleSteps = await stepRepository.find({
      where: currentUserRole ? { roleCode: currentUserRole } : { approverUserId: currentUserId },
      relations: ['contract'],
      order: { assignedAt: 'DESC', createdAt: 'DESC' },
      take: 5000,
    });
    const currentRoleSteps = Array.from(roleSteps.reduce((latestByContract, step) => {
      const existing = latestByContract.get(step.contractId);
      if (!existing || (step.revisionNo || 1) > (existing.revisionNo || 1)) {
        latestByContract.set(step.contractId, step);
      }
      return latestByContract;
    }, new Map<string, ContractApprovalStep>()).values());

    // Workload is role-based (new employee sees the role queue).
    const activeRoleSteps = currentRoleSteps.filter((step) => (
      !step.decision && Boolean(step.assignedAt) && step.contract?.status === ContractStatus.IN_APPROVAL
    ));
    // Personal productivity is user-based.
    const processedMySteps = currentRoleSteps.filter(
      (step) => step.approverUserId === currentUserId && Boolean(step.decision) && step.signedAt,
    );

    const newRequests = activeRoleSteps.filter((step) => {
      if (!step.assignedAt) return false;
      const assignedAt = new Date(step.assignedAt);
      return assignedAt >= startOfToday && assignedAt <= endOfToday;
    }).length;

    const overdue = activeRoleSteps.filter((step) => step.deadlineAt && new Date(step.deadlineAt) < now).length;
    const dueToday = activeRoleSteps.filter((step) => {
      if (!step.deadlineAt) return false;
      const deadline = new Date(step.deadlineAt);
      return deadline >= startOfToday && deadline <= endOfToday;
    }).length;
    const inWork = Math.max(activeRoleSteps.length - overdue, 0);

    const completedMonthSteps = processedMySteps.filter((step) => {
      if (!step.signedAt) return false;
      return new Date(step.signedAt) >= startOfMonth;
    });
    const completedMonth = completedMonthSteps.length;

    const avgHours = completedMonthSteps.length
      ? completedMonthSteps.reduce((sum, step) => {
        if (!step.assignedAt || !step.signedAt) return sum;
        const assignedAt = new Date(step.assignedAt).getTime();
        const signedAt = new Date(step.signedAt).getTime();
        if (signedAt <= assignedAt) return sum;
        return sum + ((signedAt - assignedAt) / (1000 * 60 * 60));
      }, 0) / completedMonthSteps.length
      : 0;

    res.json({
      inWork,
      dueToday,
      overdue,
      newRequests,
      completedMonth,
      avgProcessingHours: Number(avgHours.toFixed(1)),
    });
  } catch (error) {
    next(error);
  }
};

export const listMasterContracts = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const masters = await contractRepository.find({
      where: {
        documentKind: ContractDocumentKind.MASTER,
        parentContractId: IsNull(),
      },
      order: { createdAt: 'DESC' },
      take: 500,
    });

    res.json(masters.map((contract) => ({
      id: contract.id,
      contractNumber: contract.contractNumber,
      counterpartyName: contract.counterpartyName,
      contractType: contract.contractType,
      subject: contract.subject,
    })));
  } catch (error) {
    next(error);
  }
};

export const createContract = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      contractNumber,
      contractType,
      incomeSubtype,
      counterpartyName,
      counterpartyShortName,
      ownershipForm,
      counterpartyForm,
      counterpartyInn,
      subject,
      contractDate,
      psrFlag,
      signingMethod,
      allowDuplicate,
      documentKind,
      parentContractId,
      clientRequestId,
    } = req.body as {
      contractNumber: string;
      contractType: ContractType;
      incomeSubtype?: ContractIncomeSubtype | null;
      counterpartyName: string;
      counterpartyShortName?: string | null;
      ownershipForm?: string | null;
      counterpartyForm?: string | null;
      counterpartyInn: string;
      subject?: string | null;
      contractDate?: string | null;
      psrFlag?: boolean;
      signingMethod?: ContractSigningMethod;
      allowDuplicate?: boolean;
      documentKind?: ContractDocumentKind;
      parentContractId?: string | null;
      clientRequestId?: string | null;
    };

    const normalizedDocumentKind = documentKind ?? ContractDocumentKind.MASTER;

    if (normalizedDocumentKind === ContractDocumentKind.ADDENDUM && !parentContractId) {
      const error: any = new Error('Для допсоглашения нужно выбрать базовый договор');
      error.statusCode = 400;
      throw error;
    }

    if (parentContractId) {
      const parentExists = await contractRepository.exist({ where: { id: parentContractId } });
      if (!parentExists) {
        const error: any = new Error('Базовый договор не найден');
        error.statusCode = 400;
        throw error;
      }
    }

    if (!req.user?.id) {
      const error: any = new Error('Authentication required');
      error.statusCode = 401;
      throw error;
    }

    const normalizedClientRequestId = String(clientRequestId || '').trim() || null;
    if (normalizedClientRequestId) {
      const existingByRequest = await contractRepository.findOne({
        where: {
          initiatorId: req.user.id,
          clientRequestId: normalizedClientRequestId,
        },
      });
      if (existingByRequest) {
        res.status(200).json({ id: existingByRequest.id, reused: true });
        return;
      }
    }

    const parsedContractDate = contractDate ? new Date(contractDate) : null;
    if (parsedContractDate && Number.isNaN(parsedContractDate.getTime())) {
      const error: any = new Error('Некорректная дата договора');
      error.statusCode = 400;
      throw error;
    }

    const normalizedIncomeSubtype = contractType === ContractType.INCOME ? (incomeSubtype ?? ContractIncomeSubtype.STANDARD) : null;
    const normalizedPsrFlag = contractType === ContractType.INCOME && normalizedIncomeSubtype === ContractIncomeSubtype.WITH_PSR
      ? true
      : Boolean(psrFlag);

    validateInnByCounterpartyForm(counterpartyInn.trim(), counterpartyForm ?? null);

    if (!allowDuplicate) {
      const duplicates = await contractRepository.find({
        where: {
          counterpartyInn: counterpartyInn.trim(),
          contractType,
        },
        order: { createdAt: 'DESC' },
        take: 20,
      });
      if (duplicates.length > 0) {
        res.status(409).json({
          error: 'DUPLICATE_CONTRACTS_FOUND',
          message: 'Найден(ы) договор(ы) с таким ИНН и типом договора',
          duplicates: duplicates.map((item) => ({
            id: item.id,
            contractNumber: item.contractNumber,
            contractDate: toYmdOrNull(item.contractDate),
            subject: item.subject,
            status: item.status,
          })),
        });
        return;
      }
    }

    const contract = contractRepository.create({
      contractNumber: contractNumber.trim(),
      contractType,
      incomeSubtype: normalizedIncomeSubtype,
      counterpartyName: counterpartyName.trim(),
      counterpartyShortName: counterpartyShortName?.trim() || null,
      ownershipForm: ownershipForm?.trim() || null,
      counterpartyForm: counterpartyForm || null,
      counterpartyInn: counterpartyInn.trim(),
      templateKind: ContractTemplateKind.TYPICAL,
      subject: subject?.trim() || null,
      contractDate: parsedContractDate,
      psrFlag: normalizedPsrFlag,
      signingMethod: signingMethod ?? ContractSigningMethod.POST,
      status: ContractStatus.DRAFT,
      assignedGeneralDirectorId: null,
      documentKind: normalizedDocumentKind,
      parentContractId: parentContractId || null,
      initiatorId: req.user.id,
      clientRequestId: normalizedClientRequestId,
    });

    const saved = await contractRepository.save(contract);

    notifyContractApprovalUpdated(saved.id, req.user.id);
    res.status(201).json({ id: saved.id, reused: false });
  } catch (error) {
    next(error);
  }
};

export const updateDraftContract = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const contract = await contractRepository.findOne({ where: { id } });
    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }
    if (![ContractStatus.DRAFT, ContractStatus.REWORK].includes(contract.status)) {
      const error: any = new Error('Редактировать можно только черновик или новую редакцию договора');
      error.statusCode = 400;
      throw error;
    }
    if (req.user?.role !== 'admin' && contract.initiatorId !== req.user?.id) {
      const error: any = new Error('Редактировать договор может только его инициатор');
      error.statusCode = 403;
      throw error;
    }

    const {
      contractNumber,
      contractType,
      incomeSubtype,
      counterpartyName,
      counterpartyShortName,
      counterpartyForm,
      counterpartyInn,
      subject,
      contractDate,
      psrFlag,
      signingMethod,
    } = req.body as {
      contractNumber: string;
      contractType: ContractType;
      incomeSubtype?: ContractIncomeSubtype | null;
      counterpartyName: string;
      counterpartyShortName?: string | null;
      counterpartyForm?: string | null;
      counterpartyInn: string;
      subject?: string | null;
      contractDate?: string | null;
      psrFlag?: boolean;
      signingMethod?: ContractSigningMethod;
    };

    const parsedContractDate = contractDate ? new Date(contractDate) : null;
    if (parsedContractDate && Number.isNaN(parsedContractDate.getTime())) {
      const error: any = new Error('Некорректная дата договора');
      error.statusCode = 400;
      throw error;
    }
    validateInnByCounterpartyForm(counterpartyInn.trim(), counterpartyForm ?? null);

    const normalizedIncomeSubtype = contractType === ContractType.INCOME
      ? (incomeSubtype ?? ContractIncomeSubtype.STANDARD)
      : null;
    contract.contractNumber = contractNumber.trim();
    contract.contractType = contractType;
    contract.incomeSubtype = normalizedIncomeSubtype;
    contract.counterpartyName = counterpartyName.trim();
    contract.counterpartyShortName = counterpartyShortName?.trim() || null;
    contract.counterpartyForm = counterpartyForm || null;
    contract.counterpartyInn = counterpartyInn.trim();
    contract.subject = subject?.trim() || null;
    contract.contractDate = parsedContractDate;
    contract.psrFlag = contractType === ContractType.INCOME && normalizedIncomeSubtype === ContractIncomeSubtype.WITH_PSR
      ? true
      : Boolean(psrFlag);
    contract.signingMethod = signingMethod ?? ContractSigningMethod.POST;

    await contractRepository.save(contract);
    notifyContractApprovalUpdated(contract.id, req.user?.id);
    res.json({ id: contract.id });
  } catch (error) {
    next(error);
  }
};

export const deleteDraftContract = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const contract = await contractRepository.findOne({ where: { id } });
    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }
    if (contract.status !== ContractStatus.DRAFT) {
      const error: any = new Error('Удалить можно только черновик договора');
      error.statusCode = 400;
      throw error;
    }
    if (req.user?.role !== 'admin' && contract.initiatorId !== req.user?.id) {
      const error: any = new Error('Удалить черновик может только его инициатор');
      error.statusCode = 403;
      throw error;
    }

    await contractRepository.remove(contract);
    const configuredUploads = getContractsUploadRoot(id);
    await fs.rm(configuredUploads, { recursive: true, force: true });
    const legacyUploads = path.resolve(process.cwd(), 'uploads', 'contracts', id);
    if (legacyUploads !== configuredUploads) {
      await fs.rm(legacyUploads, { recursive: true, force: true });
    }
    notifyContractApprovalUpdated(id, req.user?.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const prepareContractRevision = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const contract = await contractRepository.findOne({ where: { id } });
    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }
    if (contract.status !== ContractStatus.IN_APPROVAL) {
      const error: any = new Error('Новую редакцию можно подготовить только для договора на согласовании');
      error.statusCode = 400;
      throw error;
    }
    if (req.user?.role !== 'admin' && contract.initiatorId !== req.user?.id) {
      const error: any = new Error('Новую редакцию может подготовить только инициатор договора или администратор');
      error.statusCode = 403;
      throw error;
    }

    contract.status = ContractStatus.REWORK;
    await contractRepository.save(contract);
    notifyContractApprovalUpdated(contract.id, req.user?.id);
    res.json({ message: 'Текущий круг сохранен в истории. Загрузите новую редакцию и отправьте ее на согласование' });
  } catch (error) {
    next(error);
  }
};

export const uploadContractAttachments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const files = Array.isArray(req.body?.files) ? req.body.files : [];

    const contract = await contractRepository.findOne({ where: { id } });
    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }

    const currentUserId = req.user?.id;
    const canUploadContractFiles = Boolean(
      currentUserId
      && (req.user?.role === 'admin' || contract.initiatorId === currentUserId),
    );
    if (!canUploadContractFiles) {
      const error: any = new Error('Файлы договора может прикрепить только инициатор или администратор');
      error.statusCode = 403;
      throw error;
    }
    if (![ContractStatus.DRAFT, ContractStatus.REWORK].includes(contract.status)) {
      const error: any = new Error('Файлы договора можно менять только в черновике или на доработке');
      error.statusCode = 400;
      throw error;
    }

    if (!files.length) {
      res.json({ uploaded: 0 });
      return;
    }

    const routeSteps = await stepRepository.find({ where: { contractId: id } });
    const revisionNo = getNextRevisionForDocuments(contract.status, routeSteps);
    const uploaded = await persistContractAttachments({
      contractId: id,
      files,
      uploadedByUserId: currentUserId ?? null,
      context: 'contract',
      revisionNo,
    });

    if (uploaded > 0) {
      notifyContractApprovalUpdated(id, currentUserId);
    }
    res.json({ uploaded });
  } catch (error) {
    next(error);
  }
};

export const listContractAttachments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const contract = await contractRepository.findOne({ where: { id } });
    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }
    const steps = await stepRepository.find({ where: { contractId: id } });
    assertContractDetailAccess(contract, steps, req.user?.id, req.user?.role);

    const rows = await attachmentRepository.find({ where: { contractId: id }, order: { createdAt: 'ASC' } });
    res.json(rows.map(serializeAttachment));
  } catch (error) {
    next(error);
  }
};

export const uploadContractStepAttachments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, stepId } = req.params;
    const files = Array.isArray(req.body?.files) ? req.body.files : [];

    const contract = await contractRepository.findOne({ where: { id } });
    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }

    const step = await stepRepository.findOne({ where: { id: stepId, contractId: id } });
    if (!step) {
      const error: any = new Error('Шаг согласования не найден');
      error.statusCode = 404;
      throw error;
    }

    const currentUserId = req.user?.id;
    const isSigningStep = step.roleCode === 'secretary';
    const isAssignedRoleParticipant = Boolean(
      currentUserId
      && step.approverUserId === currentUserId
      && req.user?.role === step.roleCode,
    );
    const canCompleteSigning = Boolean(
      isSigningStep
      && currentUserId
      && (req.user?.role === 'admin' || contract.initiatorId === currentUserId || step.approverUserId === currentUserId),
    );
    const canAttach = Boolean(currentUserId && (isAssignedRoleParticipant || canCompleteSigning));
    if (!canAttach) {
      const error: any = new Error('Файл может прикрепить только назначенный участник или инициатор на этапе подписания');
      error.statusCode = 403;
      throw error;
    }
    if (contract.status !== ContractStatus.IN_APPROVAL || !step.assignedAt) {
      const error: any = new Error('Файлы можно прикреплять только к назначенному шагу активного согласования');
      error.statusCode = 400;
      throw error;
    }
    const routeSteps = await stepRepository.find({ where: { contractId: id } });
    if ((step.revisionNo || 1) !== getLatestApprovalRevision(routeSteps)) {
      const error: any = new Error('Файлы нельзя добавлять к завершенной редакции договора');
      error.statusCode = 400;
      throw error;
    }

    if (!files.length) {
      res.json({ uploaded: 0 });
      return;
    }

    const uploaded = await persistContractAttachments({
      contractId: id,
      files,
      approvalStepId: stepId,
      uploadedByUserId: currentUserId ?? null,
      context: 'approval_step',
      revisionNo: step.revisionNo || 1,
    });

    if (uploaded > 0) {
      notifyContractApprovalUpdated(id, currentUserId);
    }
    res.json({ uploaded });
  } catch (error) {
    next(error);
  }
};

export const downloadContractAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attachmentId } = req.params;
    const { item, readablePath } = await resolveAttachmentForUser(attachmentId, req.user?.id, req.user?.role);
    const data = await fs.readFile(readablePath);
    res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', buildAttachmentDisposition(item.originalName));
    res.send(data);
  } catch (error) {
    next(error);
  }
};

export const previewContractAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attachmentId } = req.params;
    const { item, readablePath } = await resolveAttachmentForUser(attachmentId, req.user?.id, req.user?.role);
    if (isDocxAttachment(item)) {
      const previewPath = await getDocxPdfPreviewPath(readablePath);
      const previewName = `${path.basename(item.originalName, path.extname(item.originalName))}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', buildAttachmentDisposition(previewName, 'inline'));
      res.send(await fs.readFile(previewPath));
      return;
    }

    res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', buildAttachmentDisposition(item.originalName, 'inline'));
    res.send(await fs.readFile(readablePath));
  } catch (error) {
    next(error);
  }
};

export const deleteContractAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attachmentId } = req.params;
    const item = await attachmentRepository.findOne({ where: { id: attachmentId }, relations: ['contract'] as any });
    if (!item) {
      const error: any = new Error('Файл не найден');
      error.statusCode = 404;
      throw error;
    }

    const isAdmin = req.user?.role === 'admin';
    const contract = item.contract ?? await contractRepository.findOne({ where: { id: item.contractId } });
    if (!contract) {
      const error: any = new Error('Договор для вложения не найден');
      error.statusCode = 404;
      throw error;
    }

    if (!isAdmin) {
      const error: any = new Error('Удалить файл может только администратор');
      error.statusCode = 403;
      throw error;
    }

    const readablePath = await resolveAttachmentPath(item);
    if (readablePath) {
      await fs.unlink(readablePath);
      await fs.rm(`${readablePath}.preview.pdf`, { force: true });
    }
    await attachmentRepository.remove(item);
    notifyContractApprovalUpdated(item.contractId, req.user?.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const securityVisaDecision = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contractId } = req.params;
    const { visa, comment } = req.body as {
      visa: 'approved' | 'rejected' | 'approved_with_remarks';
      comment?: string | null;
    };
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      const error: any = new Error('Пользователь не авторизован');
      error.statusCode = 401;
      throw error;
    }

    const contract = await contractRepository.findOne({ where: { id: contractId } });
    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }
    if (contract.status !== ContractStatus.IN_APPROVAL) {
      const error: any = new Error('Изменить визу руководителя СБ можно только пока договор находится на согласовании');
      error.statusCode = 400;
      throw error;
    }
    const allSteps = await stepRepository.find({ where: { contractId }, order: { orderNo: 'ASC' } });
    const steps = getCurrentApprovalSteps(allSteps);
    const securityStep = steps.find((s) => s.roleCode === 'security') ?? null;
    if (!securityStep || (!securityStep.decision && !securityStep.assignedAt)) {
      const error: any = new Error('Сейчас нет активного шага руководителя СБ');
      error.statusCode = 400;
      throw error;
    }
    if (req.user?.role !== 'security' && req.user?.role !== 'admin') {
      const error: any = new Error('Нет прав на визирование этого шага');
      error.statusCode = 403;
      throw error;
    }

    const normalizedComment = comment?.trim() || null;
    if (visa === 'approved_with_remarks' && !normalizedComment) {
      const error: any = new Error('Для визы "Согласован с замечаниями" обязателен комментарий');
      error.statusCode = 400;
      throw error;
    }

    const priorDecision = securityStep.decision;
    const priorComment = securityStep.comment?.trim() || null;
    const decision = visa === 'rejected' ? ContractApprovalDecision.REJECT : ContractApprovalDecision.APPROVE;
    applyApprovalDecision({
      step: securityStep,
      decision,
      comment: normalizedComment,
      decidedAt: new Date(),
    });

    const hasParallelRoute = isParallelSecretaryRoute(steps);
    const secretaryStep = hasParallelRoute ? findSecretaryStepReadyForAssignment(steps) : null;
    const stepsToNotify: ContractApprovalStep[] = [];

    await AppDataSource.transaction(async (manager) => {
      if (securityStep.approverUserId !== currentUserId && req.user?.role === 'security') {
        securityStep.approverUserId = currentUserId;
      }
      await manager.save(securityStep);
      await saveDecisionEvent(manager, {
        contractId,
        step: securityStep,
        actorUserId: currentUserId,
        previousDecision: priorDecision,
        previousComment: priorComment,
      });
      if (decision === ContractApprovalDecision.REJECT) {
        contract.status = ContractStatus.REJECTED;
        await manager.save(contract);
        return;
      }
      if (secretaryStep) {
        await assignApprovalStep(secretaryStep, new Date(), {
          resolveEffectiveWorkSchedule,
          calculateDeadlineBySchedule,
        });
        await manager.save(secretaryStep);
        stepsToNotify.push(secretaryStep);
      }
      contract.status = steps.some((s) => !s.decision && s.id !== securityStep.id)
        ? ContractStatus.IN_APPROVAL
        : ContractStatus.APPROVED;
      await manager.save(contract);
    });

    for (const nextStep of stepsToNotify) {
      void notifyStepAssigned(contract, nextStep).catch((error) => {
        logger.error('Failed to send step-assigned notification (securityVisaDecision):', error);
      });
    }
    const securityDecisionChanged = Boolean(priorDecision)
      && (priorDecision !== decision || priorComment !== normalizedComment);
    if (securityDecisionChanged) {
      const affectedSteps = getDecidedPreSecretaryPeers(steps, securityStep);
      if (affectedSteps.length) {
        void notifyDecisionChanged(contract, securityStep, priorDecision, priorComment, affectedSteps).catch((error) => {
          logger.error('Failed to send changed Security visa notification:', error);
        });
      }
    }

    notifyContractApprovalUpdated(contractId, currentUserId);
    res.json({ ok: true, status: contract.status });
  } catch (error) {
    next(error);
  }
};

export const getContractApprovalSheet = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const contract = await contractRepository.findOne({
      where: { id },
      relations: ['initiator', 'assignedGeneralDirector', 'parentContract'],
    });

    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }

    const allSteps = await stepRepository.find({
      where: { contractId: id },
      relations: ['approverUser'],
      order: { orderNo: 'ASC' },
    });
    assertContractDetailAccess(contract, allSteps, req.user?.id, req.user?.role);

    const allContractFiles = await attachmentRepository.find({
      where: { contractId: id, approvalStepId: IsNull() },
      order: { createdAt: 'ASC' },
    });
    const stepFiles = await attachmentRepository.find({
      where: { contractId: id },
      order: { createdAt: 'ASC' },
    });
    const currentRevisionNo = contract.status === ContractStatus.REWORK
      ? getLatestApprovalRevision(allSteps) + 1
      : Math.max(
        getLatestApprovalRevision(allSteps),
        ...allContractFiles.map((file) => file.revisionNo || 1),
      );
    const steps = allSteps.filter((step) => (step.revisionNo || 1) === currentRevisionNo);
    const contractFiles = allContractFiles.filter((file) => (file.revisionNo || 1) === currentRevisionNo);
    const filesByStep = new Map<string, ContractAttachment[]>();
    stepFiles
      .filter((file) => Boolean(file.approvalStepId))
      .forEach((file) => {
        const current = filesByStep.get(file.approvalStepId as string) ?? [];
        current.push(file);
        filesByStep.set(file.approvalStepId as string, current);
      });

    const currentStep = steps.find((step) => !step.decision) ?? null;
    const serializeStep = (step: ContractApprovalStep) => ({
      id: step.id,
      roleCode: step.roleCode,
      roleLabel: contractApprovalRoleLabel(step.roleCode),
      approverUserId: step.approverUserId,
      approverName: step.approverUser?.fullName ?? '—',
      orderNo: step.orderNo,
      revisionNo: step.revisionNo || 1,
      acceptedAt: toIsoOrNull(step.acceptedAt),
      signedAt: toIsoOrNull(step.signedAt),
      decision: step.decision,
      comment: step.comment,
      slaWorkdays: step.slaWorkdays,
      assignedAt: toIsoOrNull(step.assignedAt),
      deadlineAt: toIsoOrNull(step.deadlineAt),
      attachments: (filesByStep.get(step.id) ?? []).map(serializeAttachment),
    });
    const previousRevisionNumbers = [...new Set(allSteps
      .map((step) => step.revisionNo || 1)
      .filter((revisionNo) => revisionNo < currentRevisionNo))]
      .sort((a, b) => b - a);

    res.json({
      contract: {
        id: contract.id,
        contractNumber: contract.contractNumber,
        contractType: contract.contractType,
        incomeSubtype: contract.incomeSubtype,
        templateKind: contract.templateKind,
        counterpartyName: contract.counterpartyName,
        counterpartyShortName: contract.counterpartyShortName,
        ownershipForm: contract.ownershipForm,
        counterpartyInn: contract.counterpartyInn,
        subject: contract.subject,
        contractDate: toYmdOrNull(contract.contractDate),
        psrFlag: contract.psrFlag,
        signingMethod: contract.signingMethod,
        status: contract.status,
        attachments: contractFiles.map(serializeAttachment),
        revisionNo: currentRevisionNo,
        initiator: contract.initiator ? { id: contract.initiator.id, fullName: contract.initiator.fullName } : null,
        assignedGeneralDirector: contract.assignedGeneralDirector
          ? { id: contract.assignedGeneralDirector.id, fullName: contract.assignedGeneralDirector.fullName }
          : null,
      },
      currentStepId: currentStep?.id ?? null,
      steps: steps.map(serializeStep),
      previousRevisions: previousRevisionNumbers.map((revisionNo) => ({
        revisionNo,
        attachments: allContractFiles
          .filter((file) => (file.revisionNo || 1) === revisionNo)
          .map(serializeAttachment),
        steps: allSteps
          .filter((step) => (step.revisionNo || 1) === revisionNo)
          .map(serializeStep),
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getContractDecisionHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const contractExists = await contractRepository.exist({ where: { id } });
    if (!contractExists) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }
    const events = await decisionEventRepository.find({
      where: { contractId: id },
      relations: ['actorUser'],
      order: { createdAt: 'DESC' },
    });
    res.json(events.map((event) => ({
      id: event.id,
      roleCode: event.roleCode,
      roleLabel: contractApprovalRoleLabel(event.roleCode),
      revisionNo: event.revisionNo,
      actorName: event.actorUser?.fullName ?? '—',
      previousDecision: event.previousDecision,
      newDecision: event.newDecision,
      previousComment: event.previousComment,
      newComment: event.newComment,
      createdAt: event.createdAt,
    })));
  } catch (error) {
    next(error);
  }
};

export const downloadContractPrintPackage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const contract = await contractRepository.findOne({
      where: { id },
      relations: ['initiator', 'assignedGeneralDirector', 'parentContract'],
    });

    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }

    const allSteps = await stepRepository.find({
      where: { contractId: id },
      relations: ['approverUser'],
      order: { orderNo: 'ASC' },
    });
    assertContractDetailAccess(contract, allSteps, req.user?.id, req.user?.role);
    if (!canCreateFinalPrintPackage(allSteps)) {
      const error: any = new Error('Распечатать финальный пакет можно только после получения всех обязательных виз');
      error.statusCode = 400;
      throw error;
    }

    const allContractFiles = await attachmentRepository.find({
      where: { contractId: id, approvalStepId: IsNull() },
      order: { createdAt: 'ASC' },
    });
    const allStepFiles = await attachmentRepository.find({
      where: { contractId: id },
      order: { createdAt: 'ASC' },
    });
    const currentRevisionNo = contract.status === ContractStatus.REWORK
      ? getLatestApprovalRevision(allSteps) + 1
      : Math.max(
        getLatestApprovalRevision(allSteps),
        ...allContractFiles.map((file) => file.revisionNo || 1),
      );
    const steps = allSteps.filter((step) => (step.revisionNo || 1) === currentRevisionNo);
    const contractFiles = allContractFiles.filter((file) => (file.revisionNo || 1) === currentRevisionNo);
    const filesByStep = new Map<string, ContractAttachment[]>();
    allStepFiles
      .filter((file) => Boolean(file.approvalStepId) && (file.revisionNo || 1) === currentRevisionNo)
      .forEach((file) => {
        const current = filesByStep.get(file.approvalStepId as string) ?? [];
        current.push(file);
        filesByStep.set(file.approvalStepId as string, current);
      });

    const pdf = await PDFDocument.create();
    await appendApprovalSheetPdf(pdf, contract, steps, filesByStep);

    const approvalAttachments = steps
      .filter((step) => step.roleCode !== 'secretary')
      .flatMap((step) => filesByStep.get(step.id) ?? []);

    for (const attachment of approvalAttachments) {
      await appendAttachmentToPdf(pdf, attachment);
    }
    for (const attachment of contractFiles) {
      await appendAttachmentToPdf(pdf, attachment);
    }

    const fileName = buildContractPdfPackageFileName(contract);
    const bytes = await pdf.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', buildAttachmentDisposition(fileName, 'attachment'));
    res.send(Buffer.from(bytes));
  } catch (error) {
    next(error);
  }
};

export const startContractApproval = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.id;
    const contract = await contractRepository.findOne({ where: { id } });

    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }

    if (!currentUserId) {
      const error: any = new Error('Authentication required');
      error.statusCode = 401;
      throw error;
    }
    if (req.user?.role !== 'admin' && contract.initiatorId !== currentUserId) {
      const error: any = new Error('Запустить согласование может только инициатор договора или администратор');
      error.statusCode = 403;
      throw error;
    }

    requireStartFields(contract);

    if (contract.status === ContractStatus.IN_APPROVAL) {
      const existingSteps = await stepRepository.find({
        where: { contractId: contract.id },
        order: { orderNo: 'ASC' },
      });
      if (existingSteps.some((step) => !step.decision)) {
        res.json({ message: 'Маршрут уже запущен' });
        return;
      }
      const error: any = new Error('Маршрут уже был завершен. Перезапуск без возврата на доработку недоступен');
      error.statusCode = 400;
      throw error;
    }

    if (![ContractStatus.DRAFT, ContractStatus.REWORK].includes(contract.status)) {
      const error: any = new Error('Запустить согласование можно только из черновика или статуса "На доработке"');
      error.statusCode = 400;
      throw error;
    }

    const existingRouteSteps = await stepRepository.find({ where: { contractId: contract.id } });
    if (contract.status === ContractStatus.DRAFT && existingRouteSteps.length > 0) {
      const error: any = new Error('У черновика уже есть история согласования. Создайте новую редакцию вместо перезаписи истории');
      error.statusCode = 400;
      throw error;
    }
    const revisionNo = contract.status === ContractStatus.REWORK
      ? getLatestApprovalRevision(existingRouteSteps) + 1
      : 1;
    if (contract.status === ContractStatus.REWORK) {
      const revisedFilesCount = await attachmentRepository.count({
        where: { contractId: contract.id, approvalStepId: IsNull(), revisionNo },
      });
      if (!revisedFilesCount) {
        const error: any = new Error('Перед повторным согласованием приложите файл новой редакции договора');
        error.statusCode = 400;
        throw error;
      }
    }

    const now = new Date();
    const stepsPayload = await buildApprovalStepPayloads({
      contract,
      revisionNo,
      assignedAt: now,
      dependencies: {
        resolveApproverUserId,
        resolveSlaWorkdays,
        resolveEffectiveWorkSchedule,
        calculateDeadlineBySchedule,
      },
    });

    let createdSteps: ContractApprovalStep[] = [];
    await AppDataSource.transaction(async (manager) => {
      const created = manager.create(ContractApprovalStep, stepsPayload);
      createdSteps = await manager.save(created);

      contract.status = ContractStatus.IN_APPROVAL;
      await manager.save(contract);
    });

    createdSteps
      .filter((step) => Boolean(step.assignedAt))
      .forEach((step) => {
        void notifyStepAssigned(contract, step).catch((error) => {
          logger.error('Failed to send step-assigned notification (startContractApproval):', error);
        });
      });

    notifyContractApprovalUpdated(contract.id, currentUserId);
    res.json({ message: 'Маршрут согласования запущен' });
  } catch (error) {
    next(error);
  }
};

export const decideContractApprovalStep = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, stepId } = req.params;
    const respondWithUpdate = (payload: { message: string }) => {
      notifyContractApprovalUpdated(id, req.user?.id);
      res.json(payload);
    };
    const { decision, comment } = req.body as {
      decision: ContractApprovalDecision;
      comment?: string | null;
    };

    const contract = await contractRepository.findOne({ where: { id } });
    if (!contract) {
      const error: any = new Error('Договор не найден');
      error.statusCode = 404;
      throw error;
    }

    if (contract.status !== ContractStatus.IN_APPROVAL) {
      const error: any = new Error('Действия согласования доступны только в статусе "На согласовании"');
      error.statusCode = 400;
      throw error;
    }

    const allSteps = await stepRepository.find({
      where: { contractId: id },
      order: { orderNo: 'ASC' },
    });
    const steps = getCurrentApprovalSteps(allSteps);

    const step = steps.find((item) => item.id === stepId);
    if (!step) {
      const error: any = new Error('Шаг согласования не найден');
      error.statusCode = 404;
      throw error;
    }

    const wasProcessedStep = Boolean(step.decision);
    const priorDecision = step.decision;
    const priorComment = step.comment?.trim() || null;
    const hasParallelRoute = isParallelSecretaryRoute(steps);
    const currentStep = steps.find((item) => !item.decision);
    const canProcessAssignedParallelStep = hasParallelRoute
      && isPreSecretaryApprovalRole(step.roleCode)
      && Boolean(step.assignedAt);
    if (!wasProcessedStep && !canProcessAssignedParallelStep && (!currentStep || currentStep.id !== step.id)) {
      const error: any = new Error('Этот шаг согласования еще не назначен');
      error.statusCode = 400;
      throw error;
    }

    if (!req.user?.id) {
      const error: any = new Error('Authentication required');
      error.statusCode = 401;
      throw error;
    }
    const initiatorMayConfirmSignature = step.roleCode === 'secretary' && contract.initiatorId === req.user.id;
    if (req.user.role !== 'admin' && step.approverUserId !== req.user.id && !initiatorMayConfirmSignature) {
      const error: any = new Error('Действие доступно только текущему согласующему');
      error.statusCode = 403;
      throw error;
    }

    const normalizedComment = comment?.trim() ?? '';
    if (decision === ContractApprovalDecision.REWORK && !normalizedComment) {
      const error: any = new Error('Комментарий обязателен для возврата на доработку');
      error.statusCode = 400;
      throw error;
    }

    const decisionDate = new Date();

    if (step.roleCode === 'secretary' && decision === ContractApprovalDecision.APPROVE) {
      const signedFilesCount = await attachmentRepository.count({
        where: { contractId: id, approvalStepId: step.id },
      });
      if (signedFilesCount === 0) {
        const error: any = new Error('Перед подтверждением подписи приложите подписанный экземпляр договора');
        error.statusCode = 400;
        throw error;
      }
    }

    applyApprovalDecision({
      step,
      decision,
      comment: normalizedComment,
      decidedAt: decisionDate,
    });
    await AppDataSource.transaction(async (manager) => {
      await manager.save(step);
      await saveDecisionEvent(manager, {
        contractId: id,
        step,
        actorUserId: req.user!.id,
        previousDecision: priorDecision,
        previousComment: priorComment,
      });
    });

    const isParallelApprovalStep = hasParallelRoute && isPreSecretaryApprovalRole(step.roleCode);
    if (isParallelApprovalStep) {
      const decisionChanged = wasProcessedStep
        && (priorDecision !== decision || priorComment !== (normalizedComment || null));
      if (decisionChanged) {
        const affectedSteps = getDecidedPreSecretaryPeers(steps, step);
        if (affectedSteps.length) {
          void notifyDecisionChanged(contract, step, priorDecision, priorComment, affectedSteps).catch((error) => {
            logger.error('Failed to send changed parallel visa notification:', error);
          });
        }
      }
      const hasRemarks = hasPreSecretaryApprovalRemarks(steps);
      const secretaryStep = findSecretaryStepReadyForAssignment(steps);
      contract.status = ContractStatus.IN_APPROVAL;
      await contractRepository.save(contract);

      if (secretaryStep) {
        await assignApprovalStep(secretaryStep, new Date(), {
          resolveEffectiveWorkSchedule,
          calculateDeadlineBySchedule,
        });
        await stepRepository.save(secretaryStep);
        void notifyStepAssigned(contract, secretaryStep).catch((error) => {
          logger.error('Failed to send secretary notification (decideContractApprovalStep):', error);
        });
        respondWithUpdate({
          message: hasRemarks
            ? 'Все визы получены, есть замечания. Договор направлен офис-менеджеру на подпись'
            : 'Все визы получены. Договор направлен офис-менеджеру на подпись',
        });
        return;
      }

      respondWithUpdate({ message: wasProcessedStep ? 'Виза согласования обновлена' : 'Решение сохранено' });
      return;
    }

    if (wasProcessedStep) {
      if (decision === ContractApprovalDecision.REWORK) {
        contract.status = ContractStatus.REWORK;
      } else if (decision === ContractApprovalDecision.REJECT) {
        contract.status = ContractStatus.REJECTED;
      } else {
        contract.status = steps.some((item) => !item.decision && item.id !== step.id)
          ? ContractStatus.IN_APPROVAL
          : ContractStatus.APPROVED;
      }
      await contractRepository.save(contract);
      respondWithUpdate({ message: 'Виза согласования обновлена' });
      return;
    }

    if (decision === ContractApprovalDecision.REWORK) {
      contract.status = ContractStatus.REWORK;
      await contractRepository.save(contract);
      respondWithUpdate({ message: 'Договор возвращен на доработку' });
      return;
    }

    if (decision === ContractApprovalDecision.REJECT) {
      contract.status = ContractStatus.REJECTED;
      await contractRepository.save(contract);
      respondWithUpdate({ message: 'Договор отклонен' });
      return;
    }

    if (hasParallelRoute) {
      if (step.roleCode === 'secretary') {
        contract.status = ContractStatus.APPROVED;
        await contractRepository.save(contract);
        respondWithUpdate({ message: 'Подписание договора подтверждено' });
        return;
      }

      respondWithUpdate({ message: 'Решение сохранено' });
      return;
    }

    const nextPending = steps
      .filter((item) => !item.decision && item.id !== step.id)
      .sort((a, b) => a.orderNo - b.orderNo)[0];
    const hasPending = Boolean(nextPending);
    contract.status = hasPending ? ContractStatus.IN_APPROVAL : ContractStatus.APPROVED;
    await contractRepository.save(contract);

    if (nextPending) {
      const assignedAt = new Date();
      nextPending.assignedAt = assignedAt;
      const nextSchedule = await resolveEffectiveWorkSchedule(nextPending.roleCode, nextPending.approverUserId);
      nextPending.deadlineAt = await calculateDeadlineBySchedule(
        assignedAt,
        Math.max(1, nextPending.slaWorkdays || 1),
        nextSchedule
      );
      nextPending.reminderBeforeSentAt = null;
      nextPending.reminderDeadlineSentAt = null;
      nextPending.reminderOverdueSentAt = null;
      nextPending.escalationSentAt = null;
      await stepRepository.save(nextPending);
      void notifyStepAssigned(contract, nextPending).catch((error) => {
        logger.error('Failed to send step-assigned notification (decideContractApprovalStep):', error);
      });
    }

    respondWithUpdate({ message: contract.status === ContractStatus.APPROVED ? 'Договор согласован' : 'Шаг согласования подтвержден' });
  } catch (error) {
    next(error);
  }
};
