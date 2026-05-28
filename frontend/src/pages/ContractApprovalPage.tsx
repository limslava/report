import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useLocation } from 'react-router-dom';
import {
  createContract,
  decideContractApprovalStep,
  deleteContractAttachment,
  deleteDraftContract,
  downloadContractAttachment,
  downloadContractPrintPackage,
  getSecurityContractInbox,
  getMyContractApprovalInbox,
  getContractApprovalSheet,
  getContractDecisionHistory,
  getContractDuplicates,
  getContracts,
  prepareContractRevision,
  previewContractAttachment,
  resolveCounterpartyByInn,
  startContractApproval,
  submitSecurityVisa,
  updateDraftContract,
  uploadContractStepAttachments,
  uploadContractAttachments,
} from '../services/api';
import { subscribePlansRealtime } from '../services/plans-realtime';
import { useAuthStore } from '../store/auth-store';
import { downloadBlob } from '../utils/download';
import '../styles/contract-approval.css';

type CounterpartyFormRef = {
  code: 'ooo' | 'ao' | 'pao' | 'zao' | 'ip';
  label: string;
  innLength: 10 | 12;
  isIndividual: boolean;
};

type ContractRecord = {
  id: string;
  contractNumber: string;
  contractType: 'expense' | 'income';
  incomeSubtype: 'standard' | 'with_psr' | null;
  counterpartyName: string;
  counterpartyShortName: string | null;
  counterpartyForm: CounterpartyFormRef['code'] | null;
  counterpartyInn: string;
  subject: string | null;
  contractDate: string | null;
  psrFlag: boolean;
  signingMethod: 'edo' | 'post';
  status: 'draft' | 'in_approval' | 'rework' | 'approved' | 'rejected';
  currentStageRole?: string | null;
  currentStageLabel?: string | null;
  statusDetail?: string | null;
  needsSignedAttachment?: boolean;
  initiator?: { id: string; fullName: string; role: string } | null;
};

type DuplicateContract = {
  id: string;
  contractNumber: string;
  contractDate: string | null;
  subject: string | null;
  status: ContractRecord['status'];
};

type SecurityVisaValue = '' | 'approved' | 'rejected' | 'approved_with_remarks';
type ApprovalDecisionValue = '' | 'approved' | 'rejected' | 'approved_with_remarks';
type InboxView = 'active' | 'processed' | 'all' | 'new' | 'due_today' | 'overdue' | 'completed_month';
type ContractSection = 'inbox' | 'mine' | 'registry';

type SheetStep = {
  id: string;
  roleCode: string;
  roleLabel: string;
  approverUserId: string;
  approverName: string;
  orderNo: number;
  revisionNo?: number;
  acceptedAt: string | null;
  signedAt: string | null;
  assignedAt?: string | null;
  deadlineAt?: string | null;
  decision: 'approve' | 'rework' | 'reject' | null;
  comment: string | null;
  attachments: ContractAttachmentRef[];
};

type ContractAttachmentRef = {
  id: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string | null;
  createdAt?: string;
  uploadedByUserId?: string | null;
  context?: 'contract' | 'approval_step';
  revisionNo?: number;
};

type ApprovalRevision = {
  revisionNo: number;
  attachments: ContractAttachmentRef[];
  steps: SheetStep[];
};

type ApprovalSheet = {
  contract: {
    id: string;
    contractNumber: string;
    contractType: 'expense' | 'income';
    incomeSubtype: 'standard' | 'with_psr' | null;
    counterpartyName: string;
    counterpartyShortName: string | null;
    counterpartyInn: string;
    subject: string | null;
    contractDate: string | null;
    psrFlag: boolean;
    signingMethod: 'edo' | 'post';
    status: 'draft' | 'in_approval' | 'rework' | 'approved' | 'rejected';
    revisionNo?: number;
    attachments: ContractAttachmentRef[];
    initiator: { id: string; fullName: string } | null;
    assignedGeneralDirector: { id: string; fullName: string } | null;
  };
  currentStepId: string | null;
  steps: SheetStep[];
  previousRevisions?: ApprovalRevision[];
};

type DecisionHistoryEvent = {
  id: string;
  roleCode: string;
  roleLabel: string;
  revisionNo: number;
  actorName: string;
  previousDecision: 'approve' | 'rework' | 'reject' | null;
  newDecision: 'approve' | 'rework' | 'reject';
  previousComment: string | null;
  newComment: string | null;
  createdAt: string;
};

type SecurityInboxItem = {
  contractId: string;
  stepId: string;
  contractNumber: string;
  counterpartyShortName: string | null;
  counterpartyForm: CounterpartyFormRef['code'] | null;
  counterpartyInn: string;
  contractType: 'expense' | 'income';
  incomeSubtype: 'standard' | 'with_psr' | null;
  counterpartyName: string;
  subject: string | null;
  contractDate: string | null;
  initiatorName: string;
  assignedAt: string | null;
  deadlineAt: string | null;
  securityDecision: 'approve' | 'rework' | 'reject' | null;
  securitySignedAt: string | null;
  securityComment?: string | null;
  attachments: ContractAttachmentRef[];
};

type ApprovalInboxItem = {
  contractId: string;
  stepId: string;
  contractNumber: string;
  counterpartyShortName: string | null;
  counterpartyInn: string;
  contractType: 'expense' | 'income';
  incomeSubtype: 'standard' | 'with_psr' | null;
  counterpartyName: string;
  subject: string | null;
  contractDate: string | null;
  signingMethod: 'edo' | 'post';
  initiatorName: string;
  assignedAt: string | null;
  deadlineAt: string | null;
  stepDecision: 'approve' | 'rework' | 'reject' | null;
  stepSignedAt: string | null;
  stepComment: string | null;
  roleCode: string;
  roleLabel: string;
  attachments: ContractAttachmentRef[];
};

const STATUS_LABELS: Record<ContractRecord['status'], string> = {
  draft: 'Черновик',
  in_approval: 'На согласовании',
  rework: 'На доработке',
  approved: 'Подписан',
  rejected: 'Отклонен',
};

function formatDecisionLabel(decision: DecisionHistoryEvent['newDecision'] | null, comment?: string | null): string {
  if (!decision) return 'Не выбрано';
  if (decision === 'reject') return 'Не согласован';
  if (decision === 'rework') return 'Возвращен на доработку';
  return comment?.trim() ? 'Согласован с замечаниями' : 'Согласован';
}

function normalizeCounterpartyName(fullName: string): string {
  const trimmed = fullName.trim();
  const quoteMatch = trimmed.match(/["«](.+?)["»]/);
  if (quoteMatch?.[1]) {
    return quoteMatch[1].trim();
  }
  return trimmed
    .replace(/^ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ\s+/i, '')
    .replace(/^ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО\s+/i, '')
    .replace(/^АКЦИОНЕРНОЕ ОБЩЕСТВО\s+/i, '')
    .replace(/^ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ\s+/i, '')
    .trim();
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDateOnly(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatContractTypeLabel(
  contractType: 'expense' | 'income',
  incomeSubtype: 'standard' | 'with_psr' | null,
): string {
  if (contractType === 'expense') return 'Расходный';
  return `Доходный${incomeSubtype === 'with_psr' ? ' (с ПСР)' : ' (без ПСР)'}`;
}

function getSecurityVisaLabel(item: Pick<SecurityInboxItem, 'securityDecision' | 'securityComment'>): string {
  if (!item.securityDecision) return 'Не обработан';
  if (item.securityDecision === 'reject') return 'Не согласован';
  if (item.securityComment?.trim()) return 'Согласован с замечаниями';
  return 'Согласован';
}

function getSecurityVisaColor(item: Pick<SecurityInboxItem, 'securityDecision' | 'securityComment'>): 'default' | 'success' | 'warning' | 'error' {
  if (!item.securityDecision) return 'default';
  if (item.securityDecision === 'reject') return 'error';
  if (item.securityComment?.trim()) return 'warning';
  return 'success';
}

function getStepDecisionLabel(step: Pick<SheetStep, 'decision' | 'comment' | 'roleCode' | 'assignedAt'>): string {
  if (step.roleCode === 'secretary' && step.decision === 'approve') return 'Подписан';
  if (step.roleCode === 'secretary' && step.assignedAt && !step.decision) return 'На подписи';
  if (!step.decision) return 'Ожидает';
  if (step.decision === 'reject') return 'Не согласован';
  if (step.decision === 'rework') return 'На доработку';
  if (step.comment?.trim()) return 'Согласован с замечаниями';
  return 'Согласован';
}

function getApprovalStartDate(sheet: ApprovalSheet): string | null {
  return sheet.steps.find((step) => step.assignedAt)?.assignedAt
    ?? sheet.steps.find((step) => step.acceptedAt)?.acceptedAt
    ?? null;
}

function buildPrintFileName(sheet: ApprovalSheet): string {
  const counterparty = normalizeCounterpartyName(sheet.contract.counterpartyName)
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'Контрагент';
  const date = sheet.contract.contractDate || new Date().toISOString().slice(0, 10);
  return `${counterparty}_${date}`;
}

function getStepDecisionTone(step: Pick<SheetStep, 'decision' | 'comment' | 'roleCode'>): 'default' | 'success' | 'warning' | 'error' {
  if (!step.decision) return 'default';
  if (step.decision === 'reject' || step.decision === 'rework') return 'error';
  if (step.comment?.trim()) return 'warning';
  return 'success';
}

function getApprovalInboxDecisionLabel(item: Pick<ApprovalInboxItem, 'stepDecision' | 'stepComment' | 'roleCode' | 'assignedAt'>): string {
  return getStepDecisionLabel({
    decision: item.stepDecision,
    comment: item.stepComment,
    roleCode: item.roleCode,
    assignedAt: item.assignedAt,
  });
}

function getApprovalInboxDecisionTone(item: Pick<ApprovalInboxItem, 'stepDecision' | 'stepComment' | 'roleCode'>): 'default' | 'success' | 'warning' | 'error' {
  return getStepDecisionTone({
    decision: item.stepDecision,
    comment: item.stepComment,
    roleCode: item.roleCode,
  });
}

async function fileToUploadPayload(file: File) {
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      resolve(raw.split(',')[1] || '');
    };
    reader.onerror = () => reject(new Error(`Не удалось прочитать файл: ${file.name}`));
    reader.readAsDataURL(file);
  });
  return {
    name: file.name,
    mimeType: file.type || null,
    size: file.size,
    contentBase64,
  };
}

const REGISTRY_COLUMNS = [
  { key: 'idx', label: '№', width: 36 },
  { key: 'number', label: '№ договора', width: 80 },
  { key: 'date', label: 'Дата договора', width: 96 },
  { key: 'type', label: 'Тип', width: 86 },
  { key: 'subject', label: 'Предмет договора', width: 160 },
  { key: 'counterparty', label: 'Контрагент', width: 173 },
  { key: 'inn', label: 'ИНН', width: 110 },
  { key: 'status', label: 'Статус', width: 104 },
  { key: 'stage', label: 'Ход согласования', width: 190 },
] as const;

const SB_COLUMNS = [
  { key: 'idx', label: '№', width: 48 },
  { key: 'number', label: '№ договора', width: 96 },
  { key: 'date', label: 'Дата', width: 100 },
  { key: 'type', label: 'Тип', width: 132 },
  { key: 'subject', label: 'Предмет договора', width: 180 },
  { key: 'counterparty', label: 'Контрагент', width: 200 },
  { key: 'inn', label: 'ИНН', width: 96 },
  { key: 'initiator', label: 'Инициатор', width: 190 },
  { key: 'deadline', label: 'Дедлайн', width: 104 },
  { key: 'visa', label: 'Виза СБ', width: 160 },
] as const;

const APPROVAL_INBOX_COLUMNS = [
  { key: 'idx', label: '№', width: 48 },
  { key: 'number', label: '№ договора', width: 96 },
  { key: 'date', label: 'Дата', width: 100 },
  { key: 'type', label: 'Тип', width: 132 },
  { key: 'subject', label: 'Предмет договора', width: 180 },
  { key: 'counterparty', label: 'Контрагент', width: 200 },
  { key: 'inn', label: 'ИНН', width: 96 },
  { key: 'initiator', label: 'Инициатор', width: 190 },
  { key: 'deadline', label: 'Дедлайн', width: 104 },
  { key: 'decision', label: 'Мое решение', width: 170 },
] as const;

const ACCOUNTANT_SIGNING_COLUMN = { key: 'signing', label: 'Способ подписания', width: 134 } as const;

export default function ContractApprovalPage() {
  const location = useLocation();
  const currentUser = useAuthStore((state) => state.user);
  const isSecurity = currentUser?.role === 'security';
  const isApprovalWorkRole = ['lawyer', 'chief_accountant', 'financer', 'secretary'].includes(currentUser?.role ?? '');
  const isChiefAccountant = currentUser?.role === 'chief_accountant';
  const isAdmin = currentUser?.role === 'admin';
  const isReadOnlyRegistry = currentUser?.role === 'general_director';
  const canUseMyContracts = !isReadOnlyRegistry && currentUser?.role !== 'lawyer';
  const canUseInbox = isSecurity || isApprovalWorkRole;
  const initialSection: ContractSection = canUseInbox ? 'inbox' : (isAdmin || isReadOnlyRegistry || !canUseMyContracts) ? 'registry' : 'mine';
  const [tab, setTab] = useState(0);
  const [contractSection, setContractSection] = useState<ContractSection>(initialSection);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [registrySearch, setRegistrySearch] = useState('');
  const [selectedContractId, setSelectedContractId] = useState('');
  const [sheet, setSheet] = useState<ApprovalSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardChecking, setWizardChecking] = useState(false);
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  const [wizardInnResolving, setWizardInnResolving] = useState(false);
  const [wizardResolvedInn, setWizardResolvedInn] = useState('');
  const [wizardDuplicates, setWizardDuplicates] = useState<DuplicateContract[]>([]);
  const [wizardFiles, setWizardFiles] = useState<File[]>([]);
  const [wizardExistingFiles, setWizardExistingFiles] = useState<ContractAttachmentRef[]>([]);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftDeleteTarget, setDraftDeleteTarget] = useState<ContractRecord | null>(null);
  const [draftDeleting, setDraftDeleting] = useState(false);
  const [revisionTarget, setRevisionTarget] = useState<ContractRecord | null>(null);
  const [revisionPreparing, setRevisionPreparing] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState<{
    resolvedInn?: string;
    counterpartyName?: string;
    counterpartyShortName?: string;
    counterpartyForm?: CounterpartyFormRef['code'];
  } | null>(null);
  const [wizard, setWizard] = useState({
    clientRequestId: crypto.randomUUID(),
    counterpartyInn: '',
    contractType: 'expense' as 'expense' | 'income',
    psrMode: 'without_psr' as 'with_psr' | 'without_psr',
    contractNumber: '',
    subject: '',
    contractDate: '',
    signingMethod: 'post' as 'edo' | 'post',
  });
  const wizardInnInput = wizard.counterpartyInn.trim();
  const isWizardInnValidLength = /^(\d{10}|\d{12})$/.test(wizardInnInput);
  const isWizardInnInvalidLength = wizardInnInput.length > 0 && !isWizardInnValidLength;

  const [securityInbox, setSecurityInbox] = useState<SecurityInboxItem[]>([]);
  const [securityInboxView, setSecurityInboxView] = useState<InboxView>('active');
  const [securitySearch, setSecuritySearch] = useState('');
  const [securityVisa, setSecurityVisa] = useState<Record<string, { visa: SecurityVisaValue; comment: string }>>({});
  const [approvalInbox, setApprovalInbox] = useState<ApprovalInboxItem[]>([]);
  const [approvalInboxView, setApprovalInboxView] = useState<InboxView>('active');
  const [approvalSearch, setApprovalSearch] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMimeType, setPreviewMimeType] = useState<string | null>(null);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);
  const [sheetModalOpen, setSheetModalOpen] = useState(false);
  const [sheetModalLoading, setSheetModalLoading] = useState(false);
  const [resumeWizardAfterSheet, setResumeWizardAfterSheet] = useState(false);
  const [securityCardOpen, setSecurityCardOpen] = useState(false);
  const [securityCardLoading, setSecurityCardLoading] = useState(false);
  const [securityCardContractId, setSecurityCardContractId] = useState<string | null>(null);
  const [securityUploadBusy, setSecurityUploadBusy] = useState(false);
  const [approvalDecision, setApprovalDecision] = useState<ApprovalDecisionValue>('');
  const [approvalComment, setApprovalComment] = useState('');
  const [approvalDecisionBusy, setApprovalDecisionBusy] = useState(false);
  const [printPackageBusy, setPrintPackageBusy] = useState(false);
  const [attachmentDeleteTarget, setAttachmentDeleteTarget] = useState<{
    file: ContractAttachmentRef;
    contractId: string;
  } | null>(null);
  const [attachmentDeleting, setAttachmentDeleting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [decisionHistory, setDecisionHistory] = useState<DecisionHistoryEvent[]>([]);
  const approvalInboxColumns = isChiefAccountant
    ? [...APPROVAL_INBOX_COLUMNS.slice(0, 4), ACCOUNTANT_SIGNING_COLUMN, ...APPROVAL_INBOX_COLUMNS.slice(4)]
    : APPROVAL_INBOX_COLUMNS;

  const loadRegistryData = async (): Promise<ContractRecord[]> => {
    const contractsRes = await getContracts();
    const data = Array.isArray(contractsRes.data) ? contractsRes.data : [];
    setContracts(data);
    if (!selectedContractId && data.length > 0) {
      setSelectedContractId(data[0].id);
    }
    return data;
  };

  const loadRegistry = async () => {
    setError(null);
    try {
      await loadRegistryData();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить договоры');
    }
  };

  const refreshRegistryUntilContains = async (contractId: string, attempts = 4) => {
    for (let i = 0; i < attempts; i += 1) {
      const data = await loadRegistryData();
      if (data.some((c) => c.id === contractId)) return true;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    return false;
  };

  const loadSecurityInbox = async () => {
    if (!isSecurity) return;
    try {
      const apiView = securityInboxView === 'new' || securityInboxView === 'due_today' || securityInboxView === 'overdue' || securityInboxView === 'completed_month'
          ? 'active'
          : securityInboxView;
      const safeApiView = securityInboxView === 'completed_month' ? 'processed' : apiView;
      const response = await getSecurityContractInbox(safeApiView);
      setSecurityInbox(Array.isArray(response.data) ? response.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить входящие СБ');
    }
  };

  const loadApprovalInbox = async () => {
    if (!isApprovalWorkRole) return;
    try {
      const apiView = approvalInboxView === 'new' || approvalInboxView === 'due_today' || approvalInboxView === 'overdue' || approvalInboxView === 'completed_month'
          ? 'active'
          : approvalInboxView;
      const safeApiView = approvalInboxView === 'completed_month' ? 'processed' : apiView;
      const response = await getMyContractApprovalInbox(safeApiView);
      setApprovalInbox(Array.isArray(response.data) ? response.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить договоры на согласование');
    }
  };

  const loadSheet = async (contractId: string) => {
    if (!contractId) {
      setSheet(null);
      return;
    }
    setError(null);
    try {
      const response = await getContractApprovalSheet(contractId);
      setSheet(response.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить лист согласования');
    }
  };

  const openDecisionHistory = async () => {
    if (!sheet?.contract.id || !isAdmin) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    setError(null);
    try {
      const response = await getContractDecisionHistory(sheet.contract.id);
      setDecisionHistory(Array.isArray(response.data) ? response.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить историю решений');
    } finally {
      setHistoryLoading(false);
    }
  };

  const resetWizard = () => {
    setWizardStep(0);
    setWizardDuplicates([]);
    setWizardPrefill(null);
    setWizardChecking(false);
    setWizardSubmitting(false);
    setWizardInnResolving(false);
    setWizardResolvedInn('');
    setWizardFiles([]);
    setWizardExistingFiles([]);
    setEditingDraftId(null);
    setWizard({
      clientRequestId: crypto.randomUUID(),
      counterpartyInn: '',
      contractType: 'expense',
      psrMode: 'without_psr',
      contractNumber: '',
      subject: '',
      contractDate: '',
      signingMethod: 'post',
    });
  };

  const openWizard = () => {
    resetWizard();
    setWizardOpen(true);
  };

  const continueDraft = async (draft: ContractRecord, startNewRevision = false) => {
    resetWizard();
    let existingFiles: ContractAttachmentRef[] = [];
    try {
      if (startNewRevision) {
        existingFiles = [];
      } else if (sheet?.contract.id === draft.id) {
        existingFiles = sheet.contract.attachments;
      } else {
        const response = await getContractApprovalSheet(draft.id);
        existingFiles = response.data?.contract?.attachments ?? [];
        setSheet(response.data);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить вложения черновика');
      return;
    }
    setEditingDraftId(draft.id);
    setWizardExistingFiles(existingFiles);
    setWizardPrefill({
      resolvedInn: draft.counterpartyInn,
      counterpartyName: draft.counterpartyName,
      counterpartyShortName: draft.counterpartyShortName || undefined,
      counterpartyForm: draft.counterpartyForm || undefined,
    });
    setWizardResolvedInn(draft.counterpartyInn);
    setWizard({
      clientRequestId: crypto.randomUUID(),
      counterpartyInn: draft.counterpartyInn,
      contractType: draft.contractType,
      psrMode: draft.incomeSubtype === 'with_psr' || draft.psrFlag ? 'with_psr' : 'without_psr',
      contractNumber: draft.contractNumber,
      subject: draft.subject || '',
      contractDate: draft.contractDate || '',
      signingMethod: draft.signingMethod,
    });
    setWizardStep(5);
    setWizardOpen(true);
  };

  const beginNewRevision = async () => {
    if (!revisionTarget || revisionPreparing) return;
    setError(null);
    setSuccess(null);
    try {
      setRevisionPreparing(true);
      const response = await prepareContractRevision(revisionTarget.id);
      const contractToEdit: ContractRecord = { ...revisionTarget, status: 'rework' };
      setRevisionTarget(null);
      closeSheetModal();
      await loadRegistry();
      await continueDraft(contractToEdit, true);
      setSuccess(response.data?.message || 'Подготовлена новая редакция договора');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось начать новую редакцию');
    } finally {
      setRevisionPreparing(false);
    }
  };

  const removeDraft = async () => {
    if (!draftDeleteTarget || draftDeleting) return;
    setError(null);
    setSuccess(null);
    try {
      setDraftDeleting(true);
      await deleteDraftContract(draftDeleteTarget.id);
      if (selectedContractId === draftDeleteTarget.id) {
        setSelectedContractId('');
        setSheet(null);
      }
      setDraftDeleteTarget(null);
      await loadRegistry();
      setSuccess('Черновик удален');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось удалить черновик');
    } finally {
      setDraftDeleting(false);
    }
  };

  const prevWizardStep = () => {
    if (wizardStep === 4) {
      setWizardStep(0);
      return;
    }
    setWizardStep((prev) => prev - 1);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    resetWizard();
  };

  // Вложения временно разрешены для всех типов, пока шаблон доходного договора не формируется автоматически.
  const requiresAttachmentStep = () => true;

  const appendWizardFiles = (files: File[]) => {
    if (!files.length) return;
    const known = new Set([
      ...wizardExistingFiles.map((file) => `${file.originalName}:${file.sizeBytes}`),
      ...wizardFiles.map((file) => `${file.name}:${file.size}`),
    ]);
    const uniqueFiles = files.filter((file) => {
      const key = `${file.name}:${file.size}`;
      if (known.has(key)) return false;
      known.add(key);
      return true;
    });

    const skipped = files.length - uniqueFiles.length;
    if (uniqueFiles.length) {
      setWizardFiles([...wizardFiles, ...uniqueFiles]);
    }
    if (skipped > 0) {
      setError('Часть файлов уже приложена к черновику и не будет добавлена повторно');
    }
  };

  const removeWizardFile = (indexToRemove: number) => {
    setWizardFiles((files) => files.filter((_, index) => index !== indexToRemove));
  };

  const runWizardChecks = async () => {
    try {
      setWizardChecking(true);
      const typedId = wizard.counterpartyInn.trim();
      const [dupRes, resolveRes] = await Promise.allSettled([
        /^(\d{10}|\d{12})$/.test(typedId)
          ? getContractDuplicates({ inn: typedId, contractType: wizard.contractType })
          : Promise.resolve({ data: [] as any[] }),
        resolveCounterpartyByInn(typedId),
      ]);

      const foundDuplicates = dupRes.status === 'fulfilled' && Array.isArray(dupRes.value.data) ? dupRes.value.data : [];
      setWizardDuplicates(foundDuplicates);

      if (resolveRes.status === 'fulfilled') {
        const data = resolveRes.value.data?.data;
        if (data) {
          setWizardPrefill({
            resolvedInn: data.inn,
            counterpartyName: data.nameFull,
            counterpartyShortName: data.nameShort,
            counterpartyForm: data.counterpartyForm,
          });
          setWizard((prev) => ({
            ...prev,
            counterpartyInn: data.inn || prev.counterpartyInn,
          }));
        }
      }
    } finally {
      setWizardChecking(false);
    }
  };

  const proceedFromWizard = async () => {
    if (wizardSubmitting) return;
    setError(null);
    setSuccess(null);
    let createdId: string | undefined;
    let startedApproval = false;
    try {
      setWizardSubmitting(true);
      const typedId = wizard.counterpartyInn.trim();
      if (!/^(\d{10}|\d{12})$/.test(typedId)) {
        setError('Некорректный ИНН: допустимо 10 или 12 цифр');
        return;
      }

      let resolved = wizardPrefill;
      if (!resolved?.counterpartyName) {
        const resolveRes = await resolveCounterpartyByInn(typedId);
        const data = resolveRes.data?.data;
        if (data) {
          resolved = {
            resolvedInn: data.inn,
            counterpartyName: data.nameFull,
            counterpartyShortName: data.nameShort,
            counterpartyForm: data.counterpartyForm,
          };
          setWizardPrefill(resolved);
        }
      }

      if (!resolved?.counterpartyName) {
        setError('Не удалось определить наименование контрагента по ИНН');
        return;
      }
      const inn = String(resolved?.resolvedInn || typedId).trim();
      if (!/^(\d{10}|\d{12})$/.test(inn)) {
        setError('Не удалось определить корректный ИНН контрагента');
        return;
      }

      const contractPayload: Parameters<typeof createContract>[0] = {
        clientRequestId: wizard.clientRequestId,
        contractNumber: wizard.contractNumber.trim(),
        contractType: wizard.contractType,
        incomeSubtype: wizard.contractType === 'income'
          ? (wizard.psrMode === 'with_psr' ? 'with_psr' : 'standard')
          : null,
        counterpartyName: resolved.counterpartyName,
        counterpartyShortName: resolved.counterpartyShortName || null,
        counterpartyForm: resolved.counterpartyForm || null,
        counterpartyInn: inn,
        subject: wizard.subject.trim(),
        contractDate: wizard.contractDate,
        psrFlag: wizard.psrMode === 'with_psr',
        signingMethod: wizard.signingMethod,
        allowDuplicate: true,
      };
      const saveRes = editingDraftId
        ? await updateDraftContract(editingDraftId, contractPayload)
        : await createContract(contractPayload);

      createdId = saveRes.data?.id as string | undefined;
      if (createdId && wizardFiles.length) {
        const filesPayload = await Promise.all(wizardFiles.map(fileToUploadPayload));
        await uploadContractAttachments(createdId, filesPayload);
      }

      if (createdId) {
        await startContractApproval(createdId);
        startedApproval = true;
      }
      try {
        if (createdId) {
          await refreshRegistryUntilContains(createdId);
          setSelectedContractId(createdId);
        } else {
          await loadRegistry();
        }
      } catch {
        // Отправка уже выполнена — ошибки рефреша UI не должны блокировать завершение мастера.
      }
      setSuccess(createdId ? 'Договор отправлен на согласование' : 'Договор создан');
      closeWizard();
    } catch (e: any) {
      if (startedApproval && createdId) {
        // Договор реально ушел на согласование, но UI-обновление могло упасть.
        setSuccess('Договор отправлен на согласование');
        closeWizard();
        void loadRegistry();
        setSelectedContractId(createdId);
        return;
      }
      const message = e?.response?.data?.message || e?.message || 'Не удалось создать договор';
      setError(message);
    } finally {
      setWizardSubmitting(false);
    }
  };

  const resolveWizardInn = async () => {
    const typedId = wizard.counterpartyInn.trim();
    if (!/^(\d{10}|\d{12})$/.test(typedId)) return;
    if (wizardInnResolving || wizardResolvedInn === typedId) return;
    try {
      setWizardInnResolving(true);
      const response = await resolveCounterpartyByInn(typedId);
      const data = response.data?.data;
      if (!data) return;
      setWizard((prev) => ({
        ...prev,
        counterpartyInn: data.inn || prev.counterpartyInn,
      }));
      setWizardPrefill({
        resolvedInn: data.inn,
        counterpartyName: data.nameFull,
        counterpartyShortName: data.nameShort,
        counterpartyForm: data.counterpartyForm,
      });
      setWizardResolvedInn(typedId);
    } catch {
      setWizardPrefill(null);
      setError('Контрагент не найден по указанному ИНН');
    } finally {
      setWizardInnResolving(false);
    }
  };

  const onWizardInnBlur = async () => {
    await resolveWizardInn();
  };

  useEffect(() => {
    const typedId = wizard.counterpartyInn.trim();
    if (!/^(\d{10}|\d{12})$/.test(typedId)) {
      setWizardResolvedInn('');
      setWizardPrefill(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void resolveWizardInn();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [wizard.counterpartyInn]);

  useEffect(() => {
    loadRegistry();
  }, []);

  useEffect(() => {
    loadSecurityInbox();
  }, [isSecurity, securityInboxView]);

  useEffect(() => {
    loadApprovalInbox();
  }, [isApprovalWorkRole, approvalInboxView]);

  useEffect(() => {
    const refreshVisibleData = () => {
      if (document.visibilityState !== 'visible') return;
      void loadRegistry();
      if (isSecurity) {
        void loadSecurityInbox();
      } else if (isApprovalWorkRole) {
        void loadApprovalInbox();
      }
    };
    const unsubscribe = subscribePlansRealtime((payload) => {
      const event = payload as { type?: string; contractId?: string };
      if (event.type !== 'contract-approval:updated') return;

      refreshVisibleData();
      if (event.contractId && sheetModalOpen && selectedContractId === event.contractId) {
        void loadSheet(event.contractId);
      }
      if (event.contractId && securityCardOpen && securityCardContractId === event.contractId) {
        void loadSheet(event.contractId);
      }
    });
    window.addEventListener('focus', refreshVisibleData);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', refreshVisibleData);
    };
  }, [
    isSecurity,
    isApprovalWorkRole,
    securityInboxView,
    approvalInboxView,
    sheetModalOpen,
    selectedContractId,
    securityCardOpen,
    securityCardContractId,
  ]);

  useEffect(() => {
    loadSheet(selectedContractId);
  }, [selectedContractId]);

  useEffect(() => {
    setContractSection(canUseInbox ? 'inbox' : (isAdmin || isReadOnlyRegistry || !canUseMyContracts) ? 'registry' : 'mine');
    if (isSecurity) {
      setTab(2);
    } else if (isApprovalWorkRole) {
      setTab(3);
    } else {
      setTab(0);
    }
  }, [canUseInbox, currentUser?.role, isSecurity, isApprovalWorkRole, isAdmin, isReadOnlyRegistry, canUseMyContracts]);

  useEffect(() => {
    if (!isSecurity) return;
    const params = new URLSearchParams(location.search);
    const kpi = (params.get('kpi') || '').toLowerCase();
    if (kpi === 'new') {
      setContractSection('inbox');
      setSecurityInboxView('new');
      setSecuritySearch('');
      setTab(2);
      return;
    }
    if (kpi === 'in_work') {
      setContractSection('inbox');
      setSecurityInboxView('active');
      setSecuritySearch('');
      setTab(2);
      return;
    }
    if (kpi === 'due_today') {
      setContractSection('inbox');
      setSecurityInboxView('due_today');
      setSecuritySearch('');
      setTab(2);
      return;
    }
    if (kpi === 'overdue') {
      setContractSection('inbox');
      setSecurityInboxView('overdue');
      setSecuritySearch('');
      setTab(2);
      return;
    }
    if (kpi === 'completed_month') {
      setContractSection('inbox');
      setSecurityInboxView('completed_month');
      setSecuritySearch('');
      setTab(2);
    }
  }, [isSecurity, location.search]);

  useEffect(() => {
    if (!isApprovalWorkRole) return;
    const params = new URLSearchParams(location.search);
    const kpi = (params.get('kpi') || '').toLowerCase();
    if (kpi === 'new') {
      setContractSection('inbox');
      setApprovalInboxView('new');
      setApprovalSearch('');
    } else if (kpi === 'in_work') {
      setContractSection('inbox');
      setApprovalInboxView('active');
      setApprovalSearch('');
    } else if (kpi === 'due_today') {
      setContractSection('inbox');
      setApprovalInboxView('due_today');
      setApprovalSearch('');
    } else if (kpi === 'overdue') {
      setContractSection('inbox');
      setApprovalInboxView('overdue');
      setApprovalSearch('');
    } else if (kpi === 'completed_month') {
      setContractSection('inbox');
      setApprovalInboxView('completed_month');
      setApprovalSearch('');
    }
    setTab(3);
  }, [isApprovalWorkRole, location.search]);

  const onSecurityVisa = async (item: SecurityInboxItem) => {
    const form = securityVisa[item.contractId] ?? { visa: '' as const, comment: '' };
    if (!form.visa) {
      setError('Выберите решение СБ');
      return;
    }
    if (form.visa === 'approved_with_remarks' && !form.comment.trim()) {
      setError('Для решения "Согласован с замечаниями" заполните обязательный комментарий');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await submitSecurityVisa(item.contractId, {
        visa: form.visa,
        comment: form.comment.trim() || null,
      });
      setSuccess('Виза СБ сохранена');
      await Promise.all([loadSecurityInbox(), loadRegistry(), loadSheet(selectedContractId)]);
      if (securityInboxView !== 'processed' && securityInboxView !== 'all') {
        closeSecurityCard();
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось сохранить визу СБ');
    }
  };

  const availableApprovalSteps = sheet?.steps.filter((step) => (
    step.roleCode !== 'security'
    && Boolean(step.assignedAt)
    && (
      step.approverUserId === currentUser?.id
      && currentUser?.role === step.roleCode
      || (
        step.roleCode === 'secretary'
        && (sheet.contract.initiator?.id === currentUser?.id || currentUser?.role === 'admin')
      )
    )
    && (
      !step.decision
      || ((isApprovalWorkRole || currentUser?.role === 'admin') && sheet?.contract.status === 'in_approval')
    )
  )) ?? [];
  const activeMyApprovalStep = availableApprovalSteps.find((step) => step.roleCode === 'secretary' && !step.decision)
    ?? availableApprovalSteps.find((step) => !step.decision)
    ?? availableApprovalSteps[0]
    ?? null;

  useEffect(() => {
    if (!activeMyApprovalStep || activeMyApprovalStep.roleCode === 'secretary') {
      setApprovalDecision('');
      setApprovalComment('');
      return;
    }
    setApprovalDecision(
      activeMyApprovalStep.decision === 'reject'
        ? 'rejected'
        : activeMyApprovalStep.decision === 'approve' && activeMyApprovalStep.comment?.trim()
          ? 'approved_with_remarks'
          : activeMyApprovalStep.decision === 'approve'
            ? 'approved'
            : ''
    );
    setApprovalComment(activeMyApprovalStep.comment ?? '');
  }, [activeMyApprovalStep?.id, activeMyApprovalStep?.decision, activeMyApprovalStep?.comment]);

  const submitMyApprovalDecision = async () => {
    if (!sheet || !activeMyApprovalStep || approvalDecisionBusy) return;
    const isSecretaryTask = activeMyApprovalStep.roleCode === 'secretary';
    if (!isSecretaryTask && !approvalDecision) {
      setError('Выберите решение');
      return;
    }
    if (approvalDecision === 'approved_with_remarks' && !approvalComment.trim()) {
      setError('Для решения "Согласован с замечаниями" заполните обязательный комментарий');
      return;
    }
    const decision = isSecretaryTask
      ? 'approve'
      : approvalDecision === 'rejected' ? 'reject' : 'approve';
    setError(null);
    setSuccess(null);
    try {
      setApprovalDecisionBusy(true);
      const response = await decideContractApprovalStep(sheet.contract.id, activeMyApprovalStep.id, {
        decision,
        comment: approvalComment.trim() || null,
      });
      setSuccess(response.data?.message || 'Решение сохранено');
      await Promise.all([loadRegistry(), loadApprovalInbox(), loadSheet(sheet.contract.id)]);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось сохранить решение');
    } finally {
      setApprovalDecisionBusy(false);
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewLoading(false);
    setPreviewError(null);
    setPreviewFileName('');
    setPreviewAttachmentId(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewMimeType(null);
  };

  const printApprovalSheet = () => {
    if (!sheet) return;
    const previousTitle = document.title;
    document.title = buildPrintFileName(sheet);
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);
    window.print();
    window.setTimeout(restoreTitle, 1500);
  };

  const printDocumentPackage = async () => {
    if (!sheet) return;
    setError(null);
    setSuccess(null);
    const previousTitle = document.title;
    const packageTitle = buildPrintFileName(sheet);
    try {
      setPrintPackageBusy(true);
      const response = await downloadContractPrintPackage(sheet.contract.id);
      const blob = new Blob([response.data as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = url;
      const cleanup = () => {
        window.setTimeout(() => {
          iframe.remove();
          URL.revokeObjectURL(url);
          document.title = previousTitle;
        }, 1000);
      };
      iframe.onload = () => {
        document.title = packageTitle;
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        cleanup();
      };
      document.body.appendChild(iframe);
      setSuccess('PDF-пакет отправлен на печать');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось сформировать PDF-пакет');
      document.title = previousTitle;
    } finally {
      setPrintPackageBusy(false);
    }
  };

  const closeSheetModal = () => {
    setSheetModalOpen(false);
    setSheetModalLoading(false);
    if (resumeWizardAfterSheet) {
      setResumeWizardAfterSheet(false);
      setWizardOpen(true);
    }
  };

  const closeSecurityCard = () => {
    setSecurityCardOpen(false);
    setSecurityCardLoading(false);
    setSecurityCardContractId(null);
  };

  const openSheetModal = async (contractId: string) => {
    if (!contractId) return;
    setSheetModalOpen(true);
    setSheetModalLoading(true);
    setError(null);
    try {
      await loadSheet(contractId);
      setSelectedContractId(contractId);
    } finally {
      setSheetModalLoading(false);
    }
  };

  const openSecurityCard = async (item: SecurityInboxItem) => {
    setSecurityCardContractId(item.contractId);
    setSecurityCardOpen(true);
    setSecurityCardLoading(true);
    setError(null);
    setSecurityVisa((prev) => ({
      ...prev,
      [item.contractId]: prev[item.contractId] ?? {
        visa: mapDecisionToVisa(item.securityDecision, item.securityComment),
        comment: item.securityComment ?? '',
      },
    }));
    try {
      await loadSheet(item.contractId);
      setSelectedContractId(item.contractId);
    } finally {
      setSecurityCardLoading(false);
    }
  };

  const canFinalizeSignature = (step: SheetStep) => Boolean(
    step.roleCode === 'secretary'
    && currentUser
    && (step.approverUserId === currentUser.id || sheet?.contract.initiator?.id === currentUser.id || currentUser.role === 'admin')
  );

  const canAttachToStep = (step: SheetStep) => Boolean(
    currentUser
    && (
      (currentUser.id === step.approverUserId && currentUser.role === step.roleCode)
      || canFinalizeSignature(step)
    )
    && Boolean(step.assignedAt)
    && sheet?.contract.status === 'in_approval'
    && (step.revisionNo ?? 1) === (sheet?.contract.revisionNo ?? 1)
  );

  const onAttachStepFiles = async (contractId: string, stepId: string, files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length || securityUploadBusy) return;
    setError(null);
    setSuccess(null);
    try {
      setSecurityUploadBusy(true);
      const filesPayload = await Promise.all(selectedFiles.map(fileToUploadPayload));
      await uploadContractStepAttachments(contractId, stepId, filesPayload);
      setSuccess('Файлы прикреплены к шагу согласования');
      await loadSheet(contractId);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось прикрепить файлы');
    } finally {
      setSecurityUploadBusy(false);
    }
  };

  const canDeleteAttachment = (file: ContractAttachmentRef) => Boolean(
    file.id && currentUser?.role === 'admin'
  );

  const removeAttachment = async () => {
    if (!attachmentDeleteTarget || attachmentDeleting) return;
    setError(null);
    setSuccess(null);
    try {
      setAttachmentDeleting(true);
      await deleteContractAttachment(attachmentDeleteTarget.file.id);
      await loadSheet(attachmentDeleteTarget.contractId);
      await loadSecurityInbox();
      setAttachmentDeleteTarget(null);
      setSuccess('Файл удален из истории согласования');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось удалить файл');
    } finally {
      setAttachmentDeleting(false);
    }
  };

  const onOpenAttachmentPreview = async (attachmentId: string, fallbackName: string) => {
    setError(null);
    setPreviewError(null);
    setPreviewFileName(fallbackName);
    setPreviewAttachmentId(attachmentId);
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const response = await previewContractAttachment(attachmentId);
      const disposition = String(response.headers?.['content-disposition'] || '');
      const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
      const quotedMatch = /filename=\"([^\"]+)\"/i.exec(disposition);
      const previewFilename = utfMatch?.[1]
        ? decodeURIComponent(utfMatch[1]).replace(/\+/g, ' ')
        : (quotedMatch?.[1] || fallbackName || 'contract-file');
      const blob = response.data as Blob;
      const url = URL.createObjectURL(blob);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(url);
      setPreviewFileName(fallbackName || previewFilename);
      setPreviewMimeType(blob.type || null);
    } catch (e: any) {
      const message = e?.response?.data?.message || e?.message || 'Не удалось открыть вложение';
      setPreviewError(message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const isSameDate = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();

  const getRegistrySearchText = (contract: ContractRecord, index: number) => [
    index + 1,
    contract.contractNumber,
    contract.contractDate,
    formatContractTypeLabel(contract.contractType, contract.incomeSubtype),
    contract.subject,
    contract.counterpartyShortName,
    contract.counterpartyName,
    contract.counterpartyInn,
    STATUS_LABELS[contract.status],
    contract.statusDetail,
    contract.currentStageLabel,
    contract.initiator?.fullName,
    contract.signingMethod === 'edo' ? 'ЭДО' : 'Почта',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const registryBaseContracts = contractSection === 'mine' && canUseMyContracts
    ? contracts.filter((contract) => contract.initiator?.id === currentUser?.id)
    : contracts;
  const registrySearchQuery = registrySearch.trim().toLowerCase();
  const filteredRegistryContracts = registryBaseContracts.filter((contract, index) => (
    !registrySearchQuery || getRegistrySearchText(contract, index).includes(registrySearchQuery)
  ));

  const filteredSecurityInbox = securityInbox.filter((item) => {
    const now = new Date();
    const assigned = item.assignedAt ? new Date(item.assignedAt) : null;
    const deadline = item.deadlineAt ? new Date(item.deadlineAt) : null;
    const hasAssigned = assigned && !Number.isNaN(assigned.getTime());
    const hasDeadline = deadline && !Number.isNaN(deadline.getTime());

    if (securityInboxView === 'new' && (!hasAssigned || !isSameDate(assigned, now))) {
      return false;
    }
    if (securityInboxView === 'due_today' && (!hasDeadline || !isSameDate(deadline, now))) {
      return false;
    }
    if (securityInboxView === 'overdue') {
      if (!hasDeadline) return false;
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      if (deadline > endOfToday) return false;
    }
    if (securityInboxView === 'completed_month') {
      const signedAt = item.securitySignedAt ? new Date(item.securitySignedAt) : null;
      if (!signedAt || Number.isNaN(signedAt.getTime()) || signedAt.getFullYear() !== now.getFullYear() || signedAt.getMonth() !== now.getMonth()) {
        return false;
      }
    }

    const q = securitySearch.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      item.contractNumber,
      item.contractDate,
      item.contractType === 'expense' ? 'расходный' : 'доходный',
      item.incomeSubtype === 'with_psr' ? 'с пср' : item.incomeSubtype === 'standard' ? 'без пср' : '',
      item.subject,
      item.counterpartyShortName,
      item.counterpartyName,
      item.counterpartyInn,
      item.initiatorName,
      formatDateOnly(item.deadlineAt),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  const filteredApprovalInbox = approvalInbox.filter((item) => {
    const now = new Date();
    const assigned = item.assignedAt ? new Date(item.assignedAt) : null;
    const deadline = item.deadlineAt ? new Date(item.deadlineAt) : null;
    const hasAssigned = assigned && !Number.isNaN(assigned.getTime());
    const hasDeadline = deadline && !Number.isNaN(deadline.getTime());

    if (approvalInboxView === 'new' && (!hasAssigned || !isSameDate(assigned, now))) {
      return false;
    }
    if (approvalInboxView === 'due_today' && (!hasDeadline || !isSameDate(deadline, now))) {
      return false;
    }
    if (approvalInboxView === 'overdue') {
      if (!hasDeadline) return false;
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      if (deadline > endOfToday) return false;
    }
    if (approvalInboxView === 'completed_month') {
      const signedAt = item.stepSignedAt ? new Date(item.stepSignedAt) : null;
      if (!signedAt || Number.isNaN(signedAt.getTime()) || signedAt.getFullYear() !== now.getFullYear() || signedAt.getMonth() !== now.getMonth()) {
        return false;
      }
    }

    const q = approvalSearch.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      item.contractNumber,
      item.contractDate,
      item.contractType === 'expense' ? 'расходный' : 'доходный',
      item.incomeSubtype === 'with_psr' ? 'с пср' : item.incomeSubtype === 'standard' ? 'без пср' : '',
      item.subject,
      item.counterpartyShortName,
      item.counterpartyName,
      item.counterpartyInn,
      item.initiatorName,
      formatDateOnly(item.deadlineAt),
      getApprovalInboxDecisionLabel(item),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  const mapDecisionToVisa = (
    decision: SecurityInboxItem['securityDecision'],
    comment?: string | null
  ): SecurityVisaValue => {
    if (!decision) return '';
    if (decision === 'reject') return 'rejected';
    if (decision === 'approve' && comment?.trim()) return 'approved_with_remarks';
    return 'approved';
  };

  const securityCardItem = securityCardContractId
    ? securityInbox.find((item) => item.contractId === securityCardContractId) ?? null
    : null;
  const securityCardForm = securityCardItem
    ? securityVisa[securityCardItem.contractId] ?? {
      visa: mapDecisionToVisa(securityCardItem.securityDecision, securityCardItem.securityComment),
      comment: securityCardItem.securityComment ?? '',
    }
    : null;
  const securityCardSheet = sheet?.contract.id === securityCardItem?.contractId ? sheet : null;
  const securityApprovalStep = securityCardSheet?.steps.find((step) => step.roleCode === 'security') ?? null;
  const mainApprovalSteps = securityCardSheet?.steps.filter((step) => (
    step.roleCode !== 'security' && step.roleCode !== 'secretary'
  )) ?? [];
  const secretaryApprovalStep = securityCardSheet?.steps.find((step) => step.roleCode === 'secretary') ?? null;
  const completedMainApprovalSteps = mainApprovalSteps.filter((step) => Boolean(step.decision)).length;
  const approvalCardItem = sheet
    ? approvalInbox.find((item) => item.contractId === sheet.contract.id) ?? null
    : null;
  const approvalCardSecurityStep = sheet?.steps.find((step) => step.roleCode === 'security') ?? null;
  const approvalCardMainSteps = sheet?.steps.filter((step) => (
    step.roleCode !== 'security' && step.roleCode !== 'secretary'
  )) ?? [];
  const approvalCardSecretaryStep = sheet?.steps.find((step) => step.roleCode === 'secretary') ?? null;
  const approvalCardCompletedCount = approvalCardMainSteps.filter((step) => Boolean(step.decision)).length;
  const selectedRegistryContract = sheet
    ? contracts.find((contract) => contract.id === sheet.contract.id) ?? null
    : null;
  const canManageOpenDraft = Boolean(
    selectedRegistryContract
    && (selectedRegistryContract.status === 'draft' || selectedRegistryContract.status === 'rework')
    && (currentUser?.role === 'admin' || selectedRegistryContract.initiator?.id === currentUser?.id),
  );
  const canPrepareNewRevision = Boolean(
    selectedRegistryContract
    && selectedRegistryContract.status === 'in_approval'
    && (currentUser?.role === 'admin' || selectedRegistryContract.initiator?.id === currentUser?.id),
  );
  const renderStepFiles = (step: SheetStep, contractId: string, allowUpload = true) => (
    <Stack spacing={0.25} alignItems="flex-start">
      {step.attachments?.length ? (
        <Box className="contract-file-list contract-file-list--compact">
          {step.attachments.map((file) => (
            <Box key={file.id} className="contract-file-item">
              <Button
                size="small"
                variant="text"
                className="contract-file-button"
                onClick={() => onOpenAttachmentPreview(file.id, file.originalName)}
              >
                {file.originalName}
              </Button>
              {canDeleteAttachment(file) && (
                <Button
                  size="small"
                  variant="text"
                  color="error"
                  className="contract-file-remove"
                  onClick={() => setAttachmentDeleteTarget({ file, contractId })}
                >
                  Удалить
                </Button>
              )}
            </Box>
          ))}
        </Box>
      ) : !allowUpload || !canAttachToStep(step) ? (
        <Typography variant="caption" color="text.secondary">—</Typography>
      ) : null}
      {allowUpload && canAttachToStep(step) && (
        <Button size="small" variant="text" component="label" disabled={securityUploadBusy} className="contract-file-button">
          {securityUploadBusy ? 'Загрузка...' : 'Прикрепить файл'}
          <input
            hidden
            multiple
            type="file"
            onChange={(event) => {
              void onAttachStepFiles(contractId, step.id, event.target.files);
              event.target.value = '';
            }}
          />
        </Button>
      )}
    </Stack>
  );
  const renderProcessStep = (step: SheetStep, contractId: string, expanded = false, allowUpload = true) => {
    const hasDetails = Boolean(step.comment?.trim() || step.attachments?.length || (allowUpload && canAttachToStep(step)));
    return (
      <Box key={step.id} className={`contract-process-step${expanded ? ' contract-process-step--expanded' : ''}`}>
        <Box className="contract-process-step-summary">
          <Typography variant="body2" className="contract-process-role">{step.roleLabel}</Typography>
          <Typography
            variant="body2"
            className={`contract-step-status contract-step-status--${getStepDecisionTone(step)}`}
          >
            {getStepDecisionLabel(step)}
          </Typography>
          <Typography variant="caption" className="contract-process-date">
            {formatDateTime(step.signedAt)}
          </Typography>
        </Box>
        {hasDetails && (
          <Box className="contract-process-step-details">
            {step.comment?.trim() && (
              <Typography variant="body2" className="contract-process-comment">
                <span>Комментарий:</span> {step.comment}
              </Typography>
            )}
            <Box className="contract-process-files">
              <Typography variant="caption">Файлы:</Typography>
              {renderStepFiles(step, contractId, allowUpload)}
            </Box>
          </Box>
        )}
      </Box>
    );
  };
  const renderMyApprovalAction = () => {
    if (!activeMyApprovalStep) return null;
    const isSecretaryTask = activeMyApprovalStep.roleCode === 'secretary';
    if (!isSecretaryTask) {
      const priorLabel = activeMyApprovalStep.decision
        ? getStepDecisionLabel(activeMyApprovalStep)
        : null;
      const commentRequired = approvalDecision === 'approved_with_remarks';
      return (
        <Box className="contract-card-section contract-visa-editor">
          <Box className="contract-visa-header">
            <Typography variant="body2" className="contract-card-section-title">
              Ваша задача: {activeMyApprovalStep.roleCode === 'lawyer' ? 'Виза юриста' : activeMyApprovalStep.roleLabel}
            </Typography>
            {priorLabel && (
              <Typography
                variant="caption"
                className={`contract-visa-previous contract-visa-text--${getStepDecisionTone(activeMyApprovalStep)}`}
              >
                Ранее: {priorLabel}
              </Typography>
            )}
          </Box>
          <Box className="contract-visa-fields">
            <FormControl size="small">
              <InputLabel shrink>Решение</InputLabel>
              <Select
                label="Решение"
                value={approvalDecision}
                displayEmpty
                onChange={(event) => setApprovalDecision(event.target.value as ApprovalDecisionValue)}
                renderValue={(value) => value
                  ? ({
                    approved: 'Согласован',
                    approved_with_remarks: 'Согласован с замечаниями',
                    rejected: 'Не согласован',
                  }[value] ?? value)
                  : <Typography component="span" color="text.secondary">Выберите решение</Typography>}
              >
                <MenuItem value="" disabled>Выберите решение</MenuItem>
                <MenuItem value="approved">Согласован</MenuItem>
                <MenuItem value="approved_with_remarks">Согласован с замечаниями</MenuItem>
                <MenuItem value="rejected">Не согласован</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              label={commentRequired ? 'Комментарий *' : 'Комментарий'}
              required={commentRequired}
              error={commentRequired && !approvalComment.trim()}
              value={approvalComment}
              onChange={(event) => setApprovalComment(event.target.value)}
              placeholder={commentRequired ? 'Укажите замечания к договору' : 'Добавьте комментарий при необходимости'}
            />
          </Box>
          <Box className="contract-visa-footer">
            <Typography
              variant="caption"
              className={commentRequired ? 'contract-visa-hint contract-visa-hint--required' : 'contract-visa-hint'}
            >
              {approvalDecision === 'approved_with_remarks'
                ? 'Для этого решения комментарий обязателен.'
                : 'Комментарий можно добавить при необходимости.'}
            </Typography>
            <Button
              variant="contained"
              size="small"
              disabled={approvalDecisionBusy || !approvalDecision || (commentRequired && !approvalComment.trim())}
              onClick={() => { void submitMyApprovalDecision(); }}
            >
              {approvalDecisionBusy ? 'Сохранение...' : 'Сохранить решение'}
            </Button>
          </Box>
        </Box>
      );
    }
    const hasSignedContractFile = Boolean(activeMyApprovalStep.attachments?.length);
    const isSecretaryOwner = currentUser?.role === 'secretary' || activeMyApprovalStep.approverUserId === currentUser?.id;
    const isSigningFallback = !isSecretaryOwner && sheet?.contract.initiator?.id === currentUser?.id;
    return (
      <Box className={`contract-card-section contract-secretary-task${isSigningFallback ? ' contract-secretary-task--compact' : ''}`}>
        <Box className="contract-secretary-task-header">
          <Box>
            <Typography variant="body2" className="contract-card-section-title">
              {isSigningFallback ? 'Подписанный экземпляр' : 'Передача на подпись'}
            </Typography>
            <Typography variant="caption" className="contract-secretary-task-subtitle">
              {isSigningFallback
                ? 'Приложите скан подписанного договора, если он уже у вас.'
                : 'Задача офис-менеджера: подготовить пакет, получить подпись и приложить скан.'}
            </Typography>
          </Box>
          <Typography
            variant="caption"
            className={hasSignedContractFile ? 'contract-secretary-task-status contract-secretary-task-status--ready' : 'contract-secretary-task-status'}
          >
            {hasSignedContractFile ? 'Файл приложен' : 'Нужен подписанный файл'}
          </Typography>
        </Box>
        <Box className="contract-secretary-task-body">
          {!isSigningFallback && (
            <Box className="contract-secretary-task-instruction">
              <Typography variant="caption">Что сделать</Typography>
              <Typography variant="body2">
                Распечатайте договор и лист согласования, передайте на подпись. После возврата подписи приложите скан подписанного экземпляра.
              </Typography>
              <Stack direction="row" spacing={1} className="contract-secretary-task-print-actions">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => { void printDocumentPackage(); }}
                  disabled={!sheet || printPackageBusy}
                >
                  {printPackageBusy ? 'Формирование...' : 'Распечатать договор'}
                </Button>
              </Stack>
            </Box>
          )}
          <Box className="contract-secretary-task-files">
            <Typography variant="caption">Подписанный экземпляр</Typography>
            {sheet && renderStepFiles(activeMyApprovalStep, sheet.contract.id)}
          </Box>
          <Button
            className="contract-secretary-task-button"
            variant="contained"
            size="small"
            disabled={approvalDecisionBusy || !hasSignedContractFile}
            onClick={() => { void submitMyApprovalDecision(); }}
          >
            {approvalDecisionBusy ? 'Сохранение...' : 'Завершить подписание'}
          </Button>
        </Box>
      </Box>
    );
  };

  const renderPreviousRevisions = () => {
    if (!sheet?.previousRevisions?.length) return null;
    return (
      <Box className="contract-card-section contract-process">
        <Typography variant="body2" className="contract-card-section-title">Предыдущие редакции</Typography>
        {sheet.previousRevisions.map((revision) => (
          <Box key={revision.revisionNo} className="contract-process-group">
            <Box className="contract-process-group-heading">
              <Typography variant="body2">Редакция {revision.revisionNo}</Typography>
              <Typography variant="caption" className="contract-process-note">Сохранена в истории</Typography>
            </Box>
            {!!revision.attachments.length && (
              <Box className="contract-process-files">
                <Typography variant="caption">Документы:</Typography>
                <Box className="contract-file-list contract-file-list--compact">
                  {revision.attachments.map((file) => (
                    <Button
                      key={file.id}
                      size="small"
                      variant="text"
                      className="contract-file-button"
                      onClick={() => onOpenAttachmentPreview(file.id, file.originalName)}
                    >
                      {file.originalName}
                    </Button>
                  ))}
                </Box>
              </Box>
            )}
            {revision.steps
              .filter((step) => step.roleCode !== 'secretary')
              .map((step) => renderProcessStep(step, sheet.contract.id))}
          </Box>
        ))}
      </Box>
    );
  };

  const switchContractSection = (section: ContractSection, nextTab: number) => {
    if (contractSection !== section) {
      setSecuritySearch('');
      setApprovalSearch('');
      setRegistrySearch('');
    }
    setContractSection(section);
    setTab(nextTab);
  };


  return (
    <Box sx={{ px: { xs: 0.125, sm: 0.25 }, py: { xs: 0.25, sm: 0.375 }, display: 'grid', gap: 0.5 }}>
      <Paper sx={{ px: 0.25, py: 1 }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} alignItems={{ xs: 'stretch', lg: 'center' }} justifyContent="space-between" sx={{ px: 1, gap: 1 }}>
          <Stack direction="row" alignItems="center" sx={{ gap: 0.5, flexWrap: 'nowrap', overflowX: 'auto', minWidth: 0 }}>
            {canUseInbox && (
              <Button
                size="small"
                variant={contractSection === 'inbox' ? 'contained' : 'text'}
                sx={{ minWidth: 0, whiteSpace: 'nowrap', px: 1.5 }}
                onClick={() => {
                  switchContractSection('inbox', isSecurity ? 2 : 3);
                }}
              >
                Согласование договоров
              </Button>
            )}
            {canUseMyContracts && (
              <Button
                size="small"
                variant={contractSection === 'mine' ? 'contained' : 'text'}
                sx={{ minWidth: 0, whiteSpace: 'nowrap', px: 1.5 }}
                onClick={() => {
                  switchContractSection('mine', 0);
                }}
              >
                Мои договоры
              </Button>
            )}
            <Button
              size="small"
              variant={contractSection === 'registry' ? 'contained' : 'text'}
              sx={{ minWidth: 0, whiteSpace: 'nowrap', px: 1.5 }}
              onClick={() => {
                switchContractSection('registry', 0);
              }}
            >
              Реестр договоров
            </Button>
          </Stack>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '210px 230px' },
              alignItems: 'center',
              justifyContent: 'end',
              gap: 0.75,
              width: { xs: '100%', lg: 'auto' },
              '& .MuiInputBase-root': {
                height: 36,
                fontSize: 13,
              },
              '& .MuiInputLabel-root': {
                fontSize: 12,
                lineHeight: 1.1,
              },
              '& .MuiButton-root': {
                height: 34,
                fontSize: 13,
                lineHeight: 1,
              },
            }}
          >
            <Box sx={{ width: '100%', visibility: contractSection === 'registry' ? 'hidden' : 'visible' }}>
              {contractSection === 'inbox' && isSecurity ? (
                <FormControl size="small" fullWidth>
                  <InputLabel id="sb-view-label">Фильтр</InputLabel>
                  <Select
                    labelId="sb-view-label"
                    label="Фильтр"
                    value={securityInboxView}
                    onChange={(e) => setSecurityInboxView(e.target.value as InboxView)}
                    MenuProps={{
                      PaperProps: {
                        sx: {
                          '& .MuiMenuItem-root': { minHeight: 32, fontSize: 13 },
                        },
                      },
                    }}
                  >
                    <MenuItem value="active">В работе</MenuItem>
                    <MenuItem value="new">Новые</MenuItem>
                    <MenuItem value="due_today">Дедлайн сегодня</MenuItem>
                    <MenuItem value="overdue">Просрочено</MenuItem>
                    <MenuItem value="completed_month">Завершено за месяц</MenuItem>
                    <MenuItem value="processed">Обработанные</MenuItem>
                    <MenuItem value="all">Все</MenuItem>
                  </Select>
                </FormControl>
              ) : contractSection === 'inbox' ? (
                <FormControl size="small" fullWidth>
                  <InputLabel id="approval-view-label">Фильтр</InputLabel>
                  <Select
                    labelId="approval-view-label"
                    label="Фильтр"
                    value={approvalInboxView}
                    onChange={(e) => setApprovalInboxView(e.target.value as InboxView)}
                    MenuProps={{
                      PaperProps: {
                        sx: {
                          '& .MuiMenuItem-root': { minHeight: 32, fontSize: 13 },
                        },
                      },
                    }}
                  >
                    <MenuItem value="active">В работе</MenuItem>
                    <MenuItem value="new">Новые</MenuItem>
                    <MenuItem value="due_today">Дедлайн сегодня</MenuItem>
                    <MenuItem value="overdue">Просрочено</MenuItem>
                    <MenuItem value="completed_month">Завершено за месяц</MenuItem>
                    <MenuItem value="processed">Обработанные</MenuItem>
                    <MenuItem value="all">Все</MenuItem>
                  </Select>
                </FormControl>
              ) : !isReadOnlyRegistry ? (
                <Button variant="contained" fullWidth onClick={openWizard}>
                  Добавить договор
                </Button>
              ) : (
                <Box />
              )}
            </Box>
            <TextField
              size="small"
              label="Поиск"
              placeholder={contractSection === 'inbox' ? 'Поиск по любой колонке' : 'Поиск по всем колонкам'}
              value={contractSection === 'inbox' ? (isSecurity ? securitySearch : approvalSearch) : registrySearch}
              onChange={(e) => {
                if (contractSection === 'inbox' && isSecurity) {
                  setSecuritySearch(e.target.value);
                  return;
                }
                if (contractSection === 'inbox') {
                  setApprovalSearch(e.target.value);
                  return;
                }
                setRegistrySearch(e.target.value);
              }}
              fullWidth
              sx={{
                width: { xs: '100%', sm: 230 },
                justifySelf: 'end',
                '& .MuiInputBase-input': {
                  py: 0.75,
                  fontSize: 13,
                },
              }}
            />
          </Box>
        </Stack>
      </Paper>

      {contractSection !== 'inbox' && tab === 0 && (
        <>
          <Paper sx={{ px: 0.25, py: 0.5 }}>
            <TableContainer className="contract-registry-table-wrap">
              <Table size="small" className="contract-registry-table">
                <colgroup>
                  {REGISTRY_COLUMNS.map((column) => (
                    <col key={column.key} style={{ width: `${column.width}px` }} />
                  ))}
                </colgroup>
                <TableHead>
                  <TableRow>
                    {REGISTRY_COLUMNS.map((column) => (
                      <TableCell key={column.key}>
                        <Box className="registry-header-cell">
                          <span>{column.label}</span>
                        </Box>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRegistryContracts.map((row, index) => {
                    return (
                    <TableRow
                      key={row.id}
                      hover
                      selected={selectedContractId === row.id}
                      className={`contract-clickable-row${row.needsSignedAttachment ? ' contract-row-needs-signed-file' : ''}`}
                      title={row.needsSignedAttachment ? 'Нет подписанного экземпляра. Двойной клик откроет карточку договора' : 'Двойной клик откроет карточку договора'}
                      onDoubleClick={() => { void openSheetModal(row.id); }}
                    >
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{row.contractNumber}</TableCell>
                      <TableCell>{row.contractDate || '—'}</TableCell>
                      <TableCell>{formatContractTypeLabel(row.contractType, row.incomeSubtype)}</TableCell>
                      <TableCell title={row.subject || ''}>{row.subject || '—'}</TableCell>
                      <TableCell title={row.counterpartyName}>
                        {row.counterpartyShortName?.trim() || normalizeCounterpartyName(row.counterpartyName)}
                      </TableCell>
                      <TableCell>{row.counterpartyInn || '—'}</TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          className={`contract-registry-status contract-registry-status--${row.status}`}
                        >
                          {STATUS_LABELS[row.status]}
                        </Typography>
                      </TableCell>
                      <TableCell>{row.needsSignedAttachment ? 'Нет подписанного файла' : (row.statusDetail || row.currentStageLabel || '—')}</TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            {!filteredRegistryContracts.length && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                {contractSection === 'mine'
                  ? 'У вас пока нет созданных договоров.'
                  : 'По вашему запросу ничего не найдено.'}
              </Typography>
            )}
          </Paper>
        </>
      )}

      {tab === 1 && (
        <Paper sx={{ px: 0.25, py: 0.5 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Договор</InputLabel>
              <Select label="Договор" value={selectedContractId} onChange={(e) => setSelectedContractId(e.target.value)}>
                {contracts.map((contract) => (
                  <MenuItem key={contract.id} value={contract.id}>{contract.contractNumber} - {contract.counterpartyName}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="outlined" onClick={printApprovalSheet} disabled={!sheet}>Печать</Button>
          </Stack>

          {sheet && (
            <Box className="approval-sheet-print">
              {renderMyApprovalAction()}
              <Typography variant="h6" align="center" sx={{ mb: 2 }}>Лист согласования ООО «Симпл Вэй»</Typography>
              <TableContainer sx={{ mb: 2 }}>
                <Table size="small" className="approval-sheet-table">
                  <TableBody>
                    <TableRow><TableCell className="label">Контрагент</TableCell><TableCell>{sheet.contract.counterpartyName}</TableCell></TableRow>
                    <TableRow><TableCell className="label">Тип договора</TableCell><TableCell>{sheet.contract.contractType === 'expense' ? 'Расходный' : 'Доходный'}</TableCell></TableRow>
                    <TableRow><TableCell className="label">Подтип доходного</TableCell><TableCell>{sheet.contract.contractType === 'income' ? (sheet.contract.incomeSubtype === 'with_psr' ? 'С ПСР' : 'Без ПСР') : '—'}</TableCell></TableRow>
                    <TableRow><TableCell className="label">Предмет/номера договора</TableCell><TableCell>{sheet.contract.subject || '—'}</TableCell></TableRow>
                    <TableRow><TableCell className="label">ПСР (Протокол разногласий)</TableCell><TableCell>{sheet.contract.psrFlag ? 'ПСР' : '—'}</TableCell></TableRow>
                    <TableRow><TableCell className="label">Способ подписания (ЭДО/почта)</TableCell><TableCell>{sheet.contract.signingMethod === 'edo' ? 'ЭДО' : 'почта'}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </TableContainer>

              {sheet.steps.some((step) => step.roleCode === 'secretary' && step.attachments.length > 0) && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ mb: 0.5 }}>Подписанный экземпляр</Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {sheet.steps
                      .filter((step) => step.roleCode === 'secretary')
                      .flatMap((step) => step.attachments)
                      .map((file) => (
                        <Button
                          key={file.id}
                          size="small"
                          variant="text"
                          onClick={() => onOpenAttachmentPreview(file.id, file.originalName)}
                        >
                          {file.originalName}
                        </Button>
                      ))}
                  </Stack>
                </Box>
              )}

              <Typography variant="subtitle1" align="center" sx={{ mb: 1 }}>Ход согласования</Typography>
              <TableContainer>
                <Table size="small" className="approval-sheet-table">
                  <TableHead>
                    <TableRow>
                      <TableCell>Сторона</TableCell>
                      <TableCell>ФИО</TableCell>
                      <TableCell>Статус</TableCell>
                      <TableCell>Дата принятия</TableCell>
                      <TableCell>Дата визирования</TableCell>
                      <TableCell>Комментарии</TableCell>
                      <TableCell>Файлы</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow key="initiator">
                      <TableCell>Инициатор</TableCell>
                      <TableCell>{sheet.contract.initiator?.fullName || '—'}</TableCell>
                      <TableCell>Согласован</TableCell>
                      <TableCell>{formatDateTime(getApprovalStartDate(sheet))}</TableCell>
                      <TableCell>{formatDateTime(getApprovalStartDate(sheet))}</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell>—</TableCell>
                    </TableRow>
                    {sheet.steps.filter((step) => step.roleCode !== 'secretary').map((step) => (
                      <TableRow key={step.id}>
                        <TableCell>{step.roleLabel}</TableCell>
                        <TableCell>{step.approverName || '—'}</TableCell>
                        <TableCell>{getStepDecisionLabel(step)}</TableCell>
                        <TableCell>{formatDateTime(step.acceptedAt || step.assignedAt || null)}</TableCell>
                        <TableCell>{formatDateTime(step.signedAt)}</TableCell>
                        <TableCell>{step.comment || '—'}</TableCell>
                        <TableCell>{renderStepFiles(step, sheet.contract.id)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow key="general-director-signature">
                      <TableCell>Генеральный директор</TableCell>
                      <TableCell>Васильковский М.О.</TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

        </Paper>
      )}

      {contractSection === 'inbox' && isSecurity && tab === 2 && (
        <Paper sx={{ px: 0.25, py: 0.5 }}>
          {!securityInbox.length && (
            <Typography variant="body2" color="text.secondary">Сейчас нет договоров на проверке СБ.</Typography>
          )}
          {!!filteredSecurityInbox.length && (
            <TableContainer className="contract-registry-table-wrap">
              <Table size="small" className="contract-registry-table">
                <colgroup>
                  {SB_COLUMNS.map((column) => (
                    <col key={column.key} style={{ width: `${column.width}px` }} />
                  ))}
                </colgroup>
                <TableHead>
                  <TableRow>
                    {SB_COLUMNS.map((column) => (
                      <TableCell key={column.key}>
                        <Box className="registry-header-cell">
                          <span>{column.label}</span>
                        </Box>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSecurityInbox.map((item, index) => {
                    return (
                      <TableRow
                        key={item.contractId}
                        hover
                        className="contract-clickable-row"
                        title="Двойной клик откроет карточку договора"
                        onDoubleClick={() => {
                          void openSecurityCard(item);
                        }}
                      >
                        <TableCell>{index + 1}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap !important', verticalAlign: 'top' }}>{item.contractNumber}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap !important', verticalAlign: 'top' }}>{item.contractDate || '—'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap !important', verticalAlign: 'top' }}>
                          {item.contractType === 'expense'
                            ? 'Расходный'
                            : `Доходный${item.incomeSubtype === 'with_psr' ? ' (с ПСР)' : ' (без ПСР)'}`}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'normal !important', wordBreak: 'break-word', overflowWrap: 'anywhere', textOverflow: 'clip', overflow: 'visible', verticalAlign: 'top' }} title={item.subject || ''}>{item.subject || '—'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'normal !important', wordBreak: 'break-word', overflowWrap: 'anywhere', textOverflow: 'clip', overflow: 'visible', verticalAlign: 'top' }} title={item.counterpartyName}>
                          {item.counterpartyShortName?.trim() || normalizeCounterpartyName(item.counterpartyName)}
                        </TableCell>
                        <TableCell
                          sx={{
                            whiteSpace: 'nowrap !important',
                            wordBreak: 'normal',
                            overflowWrap: 'normal',
                            textOverflow: 'clip',
                            overflow: 'visible',
                            verticalAlign: 'top',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {item.counterpartyInn || '—'}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'normal !important', wordBreak: 'break-word', overflowWrap: 'anywhere', textOverflow: 'clip', overflow: 'visible', verticalAlign: 'top' }}>{item.initiatorName}</TableCell>
                        <TableCell>{formatDateOnly(item.deadlineAt)}</TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            className={`contract-visa-text contract-visa-text--${getSecurityVisaColor(item)}`}
                          >
                            {getSecurityVisaLabel(item)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {!!securityInbox.length && !filteredSecurityInbox.length && (
            <Typography variant="body2" color="text.secondary">По вашему запросу ничего не найдено.</Typography>
          )}
        </Paper>
      )}

      {contractSection === 'inbox' && isApprovalWorkRole && tab === 3 && (
        <Paper sx={{ px: 0.25, py: 0.5 }}>
          {!approvalInbox.length && (
            <Typography variant="body2" color="text.secondary">Сейчас нет договоров для вашего согласования.</Typography>
          )}
          {!!filteredApprovalInbox.length && (
            <TableContainer className="contract-registry-table-wrap">
              <Table size="small" className="contract-registry-table">
                <colgroup>
                  {approvalInboxColumns.map((column) => (
                    <col key={column.key} style={{ width: `${column.width}px` }} />
                  ))}
                </colgroup>
                <TableHead>
                  <TableRow>
                    {approvalInboxColumns.map((column) => (
                      <TableCell key={column.key}>
                        <Box className="registry-header-cell">
                          <span>{column.label}</span>
                        </Box>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredApprovalInbox.map((item, index) => (
                    <TableRow
                      key={item.contractId}
                      hover
                      className="contract-clickable-row"
                      title="Двойной клик откроет карточку договора"
                      onDoubleClick={() => { void openSheetModal(item.contractId); }}
                    >
                      <TableCell>{index + 1}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap !important', verticalAlign: 'top' }}>{item.contractNumber}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap !important', verticalAlign: 'top' }}>{item.contractDate || '—'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap !important', verticalAlign: 'top' }}>
                        {formatContractTypeLabel(item.contractType, item.incomeSubtype)}
                      </TableCell>
                      {isChiefAccountant && (
                        <TableCell sx={{ whiteSpace: 'nowrap !important', verticalAlign: 'top' }}>
                          {item.signingMethod === 'edo' ? 'ЭДО' : 'Почта'}
                        </TableCell>
                      )}
                      <TableCell sx={{ whiteSpace: 'normal !important', wordBreak: 'break-word', overflowWrap: 'anywhere', textOverflow: 'clip', overflow: 'visible', verticalAlign: 'top' }} title={item.subject || ''}>{item.subject || '—'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'normal !important', wordBreak: 'break-word', overflowWrap: 'anywhere', textOverflow: 'clip', overflow: 'visible', verticalAlign: 'top' }} title={item.counterpartyName}>
                        {item.counterpartyShortName?.trim() || normalizeCounterpartyName(item.counterpartyName)}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap !important', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>{item.counterpartyInn || '—'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'normal !important', wordBreak: 'break-word', overflowWrap: 'anywhere', textOverflow: 'clip', overflow: 'visible', verticalAlign: 'top' }}>{item.initiatorName}</TableCell>
                      <TableCell>{formatDateOnly(item.deadlineAt)}</TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          className={`contract-visa-text contract-visa-text--${getApprovalInboxDecisionTone(item)}`}
                        >
                          {getApprovalInboxDecisionLabel(item)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {!!approvalInbox.length && !filteredApprovalInbox.length && (
            <Typography variant="body2" color="text.secondary">По вашему запросу ничего не найдено.</Typography>
          )}
        </Paper>
      )}

      <Snackbar
        open={Boolean(error || success)}
        autoHideDuration={error ? 8000 : 5000}
        onClose={(_, reason) => {
          if (reason === 'clickaway') return;
          setError(null);
          setSuccess(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={error ? 'error' : 'success'}
          variant="filled"
          onClose={() => {
            setError(null);
            setSuccess(null);
          }}
          sx={{ maxWidth: 560, alignItems: 'center' }}
        >
          {error || success}
        </Alert>
      </Snackbar>

      <Dialog
        open={securityCardOpen}
        onClose={closeSecurityCard}
        fullWidth
        maxWidth="lg"
        PaperProps={{ className: 'contract-card-dialog' }}
      >
        <DialogTitle className="contract-card-title">
          {securityCardItem ? (
            <Box className="contract-card-title-layout">
              <Box>
                <Typography variant="subtitle1" className="contract-card-heading">
                  Договор № {securityCardItem.contractNumber}
                </Typography>
                <Typography variant="body2" className="contract-card-subtitle">
                  {securityCardItem.counterpartyShortName?.trim() || normalizeCounterpartyName(securityCardItem.counterpartyName)}
                </Typography>
              </Box>
              {securityCardSheet && (
                <Typography variant="caption" className="contract-overall-status">
                  <span />{STATUS_LABELS[securityCardSheet.contract.status]}
                </Typography>
              )}
            </Box>
          ) : (
            'Карточка договора'
          )}
        </DialogTitle>
        <DialogContent dividers className="contract-card-content">
          {securityCardLoading && (
            <Stack direction="row" alignItems="center" spacing={1} className="contract-card-loading">
              <CircularProgress size={18} />
              <Typography variant="body2">Загрузка карточки...</Typography>
            </Stack>
          )}
          {!securityCardLoading && !securityCardItem && (
            <Alert severity="info">Договор больше не найден в текущем списке.</Alert>
          )}
          {!securityCardLoading && securityCardItem && (
            <Stack spacing={1}>
              <Box className="contract-card-details">
                <Box className="contract-card-detail contract-card-detail--wide">
                  <Typography variant="caption">Предмет договора</Typography>
                  <Typography variant="body2">{securityCardItem.subject || '—'}</Typography>
                </Box>
                <Box className="contract-card-detail">
                  <Typography variant="caption">Тип</Typography>
                  <Typography variant="body2">{formatContractTypeLabel(securityCardItem.contractType, securityCardItem.incomeSubtype)}</Typography>
                </Box>
                <Box className="contract-card-detail">
                  <Typography variant="caption">Дата договора</Typography>
                  <Typography variant="body2">{securityCardItem.contractDate || '—'}</Typography>
                </Box>
                <Box className="contract-card-detail">
                  <Typography variant="caption">ИНН</Typography>
                  <Typography variant="body2">{securityCardItem.counterpartyInn || '—'}</Typography>
                </Box>
                <Box className="contract-card-detail">
                  <Typography variant="caption">Инициатор</Typography>
                  <Typography variant="body2">{securityCardItem.initiatorName}</Typography>
                </Box>
              </Box>

              <Box className="contract-card-section contract-document-files">
                <Typography variant="body2" className="contract-card-section-title">Документы договора</Typography>
                <Box className="contract-file-list contract-file-list--compact">
                  {securityCardItem.attachments.length ? (
                    securityCardItem.attachments.map((file) => (
                      <Button
                        key={file.id}
                        size="small"
                        variant="text"
                        className="contract-file-button"
                        onClick={() => onOpenAttachmentPreview(file.id, file.originalName)}
                      >
                        {file.originalName}
                      </Button>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">Файлы договора не приложены.</Typography>
                  )}
                </Box>
              </Box>

              <Box className="contract-card-section contract-visa-editor">
                <Box className="contract-visa-header">
                  <Typography variant="body2" className="contract-card-section-title">Ваша задача: Виза СБ</Typography>
                  {securityCardItem.securityDecision && (
                    <Typography
                      variant="caption"
                      className={`contract-visa-previous contract-visa-text--${getSecurityVisaColor(securityCardItem)}`}
                    >
                      Ранее: {getSecurityVisaLabel(securityCardItem)}
                    </Typography>
                  )}
                </Box>
                <Box className="contract-visa-fields">
                  <FormControl fullWidth size="small">
                    <InputLabel shrink>Решение</InputLabel>
                    <Select
                      label="Решение"
                      value={securityCardForm?.visa ?? ''}
                      displayEmpty
                      onChange={(e) => setSecurityVisa((prev) => ({
                        ...prev,
                        [securityCardItem.contractId]: {
                          visa: e.target.value as SecurityVisaValue,
                          comment: securityCardForm?.comment ?? '',
                        },
                      }))}
                      renderValue={(value) => value
                        ? ({
                          approved: 'Согласован',
                          approved_with_remarks: 'Согласован с замечаниями',
                          rejected: 'Не согласован',
                        }[value] ?? value)
                        : <Typography component="span" color="text.secondary">Выберите решение</Typography>}
                    >
                      <MenuItem value="" disabled>Выберите решение</MenuItem>
                      <MenuItem value="approved">Согласован</MenuItem>
                      <MenuItem value="approved_with_remarks">Согласован с замечаниями</MenuItem>
                      <MenuItem value="rejected">Не согласован</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    fullWidth
                    size="small"
                    label="Комментарий"
                    required={securityCardForm?.visa === 'approved_with_remarks'}
                    error={securityCardForm?.visa === 'approved_with_remarks' && !securityCardForm.comment.trim()}
                    placeholder={securityCardForm?.visa === 'approved_with_remarks' ? 'Укажите замечания к договору' : 'Добавьте комментарий при необходимости'}
                    value={securityCardForm?.comment ?? ''}
                    onChange={(e) => setSecurityVisa((prev) => ({
                      ...prev,
                        [securityCardItem.contractId]: {
                        visa: securityCardForm?.visa ?? '',
                        comment: e.target.value,
                      },
                    }))}
                  />
                </Box>
                <Box className="contract-visa-footer">
                  <Typography variant="caption" className={securityCardForm?.visa === 'approved_with_remarks' ? 'contract-visa-hint contract-visa-hint--required' : 'contract-visa-hint'}>
                    {securityCardForm?.visa === 'approved_with_remarks'
                      ? 'Для этого решения комментарий обязателен.'
                      : 'Комментарий можно добавить при необходимости.'}
                  </Typography>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => onSecurityVisa(securityCardItem)}
                    disabled={!securityCardForm?.visa || (securityCardForm.visa === 'approved_with_remarks' && !securityCardForm.comment.trim())}
                  >
                    Сохранить решение
                  </Button>
                </Box>
              </Box>

              {securityCardSheet && (
                <Box className="contract-card-section contract-process">
                  <Typography variant="body2" className="contract-card-section-title">Ход согласования</Typography>
                  {securityApprovalStep && (
                    <Box className="contract-process-group">
                      <Box className="contract-process-group-heading">
                        <Typography variant="body2">Проверка СБ</Typography>
                        <Typography
                          variant="caption"
                          className={`contract-process-group-status contract-step-status--${getStepDecisionTone(securityApprovalStep)}`}
                        >
                          {securityApprovalStep.decision ? 'Завершено' : 'В работе'}
                        </Typography>
                      </Box>
                      {renderProcessStep(securityApprovalStep, securityCardItem.contractId, true)}
                    </Box>
                  )}
                  {!!mainApprovalSteps.length && (
                    <Box className="contract-process-group">
                      <Box className="contract-process-group-heading">
                        <Box>
                          <Typography variant="body2">Основное согласование</Typography>
                          <Typography variant="caption" className="contract-process-note">
                            Участники согласуют договор параллельно
                          </Typography>
                        </Box>
                        <Typography variant="caption" className="contract-process-progress">
                          {completedMainApprovalSteps} из {mainApprovalSteps.length} обработано
                        </Typography>
                      </Box>
                      <Box className="contract-process-participants">
                        {mainApprovalSteps.map((step) => renderProcessStep(step, securityCardItem.contractId))}
                      </Box>
                    </Box>
                  )}
                  {secretaryApprovalStep?.assignedAt && (
                    <Box className="contract-process-group">
                      <Box className="contract-process-group-heading">
                        <Typography variant="body2">Передача на подпись</Typography>
                        <Typography variant="caption" className="contract-process-progress">
                          {secretaryApprovalStep.decision ? 'Подписание подтверждено' : 'На подписи'}
                        </Typography>
                      </Box>
                      {renderProcessStep(secretaryApprovalStep, securityCardItem.contractId, false, false)}
                    </Box>
                  )}
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions className="contract-card-actions">
          <Button onClick={closeSecurityCard}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={previewOpen} onClose={closePreview} fullWidth maxWidth="lg">
        <DialogTitle>{previewFileName || 'Просмотр договора'}</DialogTitle>
        <DialogContent sx={{ minHeight: 620, p: 0, overflow: 'auto' }}>
          {!previewLoading && !previewError && previewUrl && /\.docx$/i.test(previewFileName) && (
            <Alert severity="info" sx={{ borderRadius: 0 }}>
              Для просмотра показана PDF-версия документа. При скачивании будет сохранен исходный файл DOCX.
            </Alert>
          )}
          {previewLoading && (
            <Box sx={{ minHeight: 620, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          )}
          {!previewLoading && previewError && (
            <Box sx={{ p: 2 }}>
              <Alert severity="error">{previewError}</Alert>
            </Box>
          )}
          {!previewLoading && !previewError && previewUrl && (
            previewMimeType?.startsWith('image/') ? (
              <Box
                sx={{
                  minHeight: 620,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: '#f7f9fc',
                }}
              >
                <Box
                  component="img"
                  src={previewUrl}
                  alt={previewFileName || 'preview'}
                  sx={{
                    maxWidth: '100%',
                    maxHeight: '75vh',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </Box>
            ) : (
              <iframe
                title={previewFileName || 'contract-preview'}
                src={previewUrl}
                style={{ border: 0, width: '100%', height: '75vh' }}
              />
            )
          )}
        </DialogContent>
        <DialogActions>
          {previewUrl && previewAttachmentId && (
            <Button
              onClick={async () => {
                if (!previewAttachmentId) return;
                const response = await downloadContractAttachment(previewAttachmentId);
                downloadBlob(response.data as Blob, previewFileName || 'contract-file');
              }}
            >
              Скачать оригинал
            </Button>
          )}
          <Button onClick={closePreview}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={sheetModalOpen}
        onClose={closeSheetModal}
        fullWidth
        maxWidth="lg"
        PaperProps={isApprovalWorkRole ? { className: 'contract-card-dialog' } : undefined}
      >
        <DialogTitle className={isApprovalWorkRole ? 'contract-card-title' : undefined}>
          {isApprovalWorkRole && sheet ? (
            <Box className="contract-card-title-layout">
              <Box>
                <Typography variant="subtitle1" className="contract-card-heading">Договор № {sheet.contract.contractNumber}</Typography>
                <Typography variant="body2" className="contract-card-subtitle">
                  {sheet.contract.counterpartyShortName?.trim() || normalizeCounterpartyName(sheet.contract.counterpartyName)}
                  {(sheet.contract.revisionNo ?? 1) > 1 ? ` · Редакция ${sheet.contract.revisionNo}` : ''}
                </Typography>
              </Box>
              <Typography variant="caption" className="contract-overall-status">
                <span />{STATUS_LABELS[sheet.contract.status]}
              </Typography>
            </Box>
          ) : sheet ? `Договор № ${sheet.contract.contractNumber}` : 'Карточка договора'}
        </DialogTitle>
        <DialogContent dividers className={isApprovalWorkRole ? 'contract-card-content' : undefined}>
          {sheetModalLoading && (
            <Stack direction="row" alignItems="center" spacing={1}>
              <CircularProgress size={18} />
              <Typography variant="body2">Загрузка...</Typography>
            </Stack>
          )}
          {!sheetModalLoading && sheet && isApprovalWorkRole && (
            <Stack spacing={1}>
              <Box className="contract-card-details">
                <Box className="contract-card-detail contract-card-detail--wide">
                  <Typography variant="caption">Предмет договора</Typography>
                  <Typography variant="body2">{sheet.contract.subject || '—'}</Typography>
                </Box>
                <Box className="contract-card-detail">
                  <Typography variant="caption">Тип</Typography>
                  <Typography variant="body2">{formatContractTypeLabel(sheet.contract.contractType, sheet.contract.incomeSubtype)}</Typography>
                </Box>
                <Box className="contract-card-detail">
                  <Typography variant="caption">Дата договора</Typography>
                  <Typography variant="body2">{sheet.contract.contractDate || '—'}</Typography>
                </Box>
                <Box className="contract-card-detail">
                  <Typography variant="caption">ИНН</Typography>
                  <Typography variant="body2">{sheet.contract.counterpartyInn || '—'}</Typography>
                </Box>
                <Box className="contract-card-detail">
                  <Typography variant="caption">Инициатор</Typography>
                  <Typography variant="body2">{approvalCardItem?.initiatorName || sheet.contract.initiator?.fullName || '—'}</Typography>
                </Box>
              </Box>

              <Box className="contract-card-section contract-document-files">
                <Typography variant="body2" className="contract-card-section-title">Документы договора</Typography>
                <Box className="contract-file-list contract-file-list--compact">
                  {sheet.contract.attachments.length ? sheet.contract.attachments.map((file) => (
                    <Button
                      key={file.id}
                      size="small"
                      variant="text"
                      className="contract-file-button"
                      onClick={() => onOpenAttachmentPreview(file.id, file.originalName)}
                    >
                      {file.originalName}
                    </Button>
                  )) : (
                    <Typography variant="body2" color="text.secondary">Файлы договора не приложены.</Typography>
                  )}
                </Box>
              </Box>

              {renderMyApprovalAction()}

              <Box className="contract-card-section contract-process">
                <Typography variant="body2" className="contract-card-section-title">Ход согласования</Typography>
                {approvalCardSecurityStep && (
                  <Box className="contract-process-group">
                    <Box className="contract-process-group-heading">
                      <Typography variant="body2">Проверка СБ</Typography>
                      <Typography variant="caption" className={`contract-process-group-status contract-step-status--${getStepDecisionTone(approvalCardSecurityStep)}`}>
                        {approvalCardSecurityStep.decision ? 'Завершено' : 'В работе'}
                      </Typography>
                    </Box>
                    {renderProcessStep(approvalCardSecurityStep, sheet.contract.id, true)}
                  </Box>
                )}
                {!!approvalCardMainSteps.length && (
                  <Box className="contract-process-group">
                    <Box className="contract-process-group-heading">
                      <Box>
                        <Typography variant="body2">Основное согласование</Typography>
                        <Typography variant="caption" className="contract-process-note">Участники согласуют договор параллельно</Typography>
                      </Box>
                      <Typography variant="caption" className="contract-process-progress">
                        {approvalCardCompletedCount} из {approvalCardMainSteps.length} обработано
                      </Typography>
                    </Box>
                    <Box className="contract-process-participants">
                      {approvalCardMainSteps.map((step) => renderProcessStep(step, sheet.contract.id))}
                    </Box>
                  </Box>
                )}
                {approvalCardSecretaryStep?.assignedAt && (
                  <Box className="contract-process-group">
                    <Box className="contract-process-group-heading">
                      <Typography variant="body2">Передача на подпись</Typography>
                      <Typography variant="caption" className="contract-process-progress">
                        {approvalCardSecretaryStep.decision ? 'Подписание подтверждено' : 'На подписи'}
                      </Typography>
                    </Box>
                    {renderProcessStep(approvalCardSecretaryStep, sheet.contract.id, false, false)}
                  </Box>
                )}
              </Box>
              {renderPreviousRevisions()}
            </Stack>
          )}
          {!sheetModalLoading && sheet && !isApprovalWorkRole && (
            <Box className="approval-sheet-print">
              {renderMyApprovalAction()}
              <Typography variant="h6" align="center" sx={{ mb: 2 }}>Лист согласования ООО «Симпл Вэй»</Typography>
              <TableContainer sx={{ mb: 2 }}>
                <Table size="small" className="approval-sheet-table">
                  <TableBody>
                    <TableRow><TableCell className="label">Контрагент</TableCell><TableCell>{sheet.contract.counterpartyName}</TableCell></TableRow>
                    <TableRow><TableCell className="label">Тип договора</TableCell><TableCell>{sheet.contract.contractType === 'expense' ? 'Расходный' : 'Доходный'}</TableCell></TableRow>
                    <TableRow><TableCell className="label">Подтип доходного</TableCell><TableCell>{sheet.contract.contractType === 'income' ? (sheet.contract.incomeSubtype === 'with_psr' ? 'С ПСР' : 'Без ПСР') : '—'}</TableCell></TableRow>
                    <TableRow><TableCell className="label">Предмет/номера договора</TableCell><TableCell>{sheet.contract.subject || '—'}</TableCell></TableRow>
                    <TableRow><TableCell className="label">ПСР (Протокол разногласий)</TableCell><TableCell>{sheet.contract.psrFlag ? 'ПСР' : '—'}</TableCell></TableRow>
                    <TableRow><TableCell className="label">Способ подписания (ЭДО/почта)</TableCell><TableCell>{sheet.contract.signingMethod === 'edo' ? 'ЭДО' : 'почта'}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </TableContainer>

              {sheet.steps.some((step) => step.roleCode === 'secretary' && step.attachments.length > 0) && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ mb: 0.5 }}>Подписанный экземпляр</Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {sheet.steps
                      .filter((step) => step.roleCode === 'secretary')
                      .flatMap((step) => step.attachments)
                      .map((file) => (
                        <Button
                          key={file.id}
                          size="small"
                          variant="text"
                          onClick={() => onOpenAttachmentPreview(file.id, file.originalName)}
                        >
                          {file.originalName}
                        </Button>
                      ))}
                  </Stack>
                </Box>
              )}

              <Typography variant="subtitle1" align="center" sx={{ mb: 1 }}>Ход согласования</Typography>
              <TableContainer>
                <Table size="small" className="approval-sheet-table">
                  <TableHead>
                    <TableRow>
                      <TableCell>Сторона</TableCell>
                      <TableCell>ФИО</TableCell>
                      <TableCell>Статус</TableCell>
                      <TableCell>Дата принятия</TableCell>
                      <TableCell>Дата визирования</TableCell>
                      <TableCell>Комментарии</TableCell>
                      <TableCell>Файлы</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow key="initiator">
                      <TableCell>Инициатор</TableCell>
                      <TableCell>{sheet.contract.initiator?.fullName || '—'}</TableCell>
                      <TableCell>Согласован</TableCell>
                      <TableCell>{formatDateTime(getApprovalStartDate(sheet))}</TableCell>
                      <TableCell>{formatDateTime(getApprovalStartDate(sheet))}</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell>—</TableCell>
                    </TableRow>
                    {sheet.steps.filter((step) => step.roleCode !== 'secretary').map((step) => (
                      <TableRow key={step.id}>
                        <TableCell>{step.roleLabel}</TableCell>
                        <TableCell>{step.approverName || '—'}</TableCell>
                        <TableCell>{getStepDecisionLabel(step)}</TableCell>
                        <TableCell>{formatDateTime(step.acceptedAt || step.assignedAt || null)}</TableCell>
                        <TableCell>{formatDateTime(step.signedAt)}</TableCell>
                        <TableCell>{step.comment || '—'}</TableCell>
                        <TableCell>{renderStepFiles(step, sheet.contract.id)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow key="general-director-signature">
                      <TableCell>Генеральный директор</TableCell>
                      <TableCell>Васильковский М.О.</TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
              {renderPreviousRevisions()}
            </Box>
          )}
        </DialogContent>
        <DialogActions className={isApprovalWorkRole ? 'contract-card-actions' : undefined}>
          {isAdmin && sheet && (
            <Button onClick={() => { void openDecisionHistory(); }}>
              История решений
            </Button>
          )}
          {canManageOpenDraft && selectedRegistryContract && (
            <>
              <Button
                onClick={() => {
                  closeSheetModal();
                  void continueDraft(selectedRegistryContract);
                }}
              >
                {selectedRegistryContract.status === 'rework' ? 'Продолжить редакцию' : 'Продолжить'}
              </Button>
              {selectedRegistryContract.status === 'draft' && (
                <Button
                  color="error"
                  onClick={() => {
                    closeSheetModal();
                    setDraftDeleteTarget(selectedRegistryContract);
                  }}
                >
                  Удалить
                </Button>
              )}
            </>
          )}
          {canPrepareNewRevision && selectedRegistryContract && (
            <Button
              onClick={() => setRevisionTarget(selectedRegistryContract)}
            >
              Новая редакция
            </Button>
          )}
          <Button onClick={closeSheetModal}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>История решений по договору № {sheet?.contract.contractNumber || '—'}</DialogTitle>
        <DialogContent dividers>
          {historyLoading && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={18} />
              <Typography variant="body2">Загрузка истории...</Typography>
            </Stack>
          )}
          {!historyLoading && !decisionHistory.length && (
            <Typography variant="body2" color="text.secondary">
              История решений пока отсутствует. Визы, сохраненные до добавления журнала, здесь не отображаются.
            </Typography>
          )}
          {!historyLoading && Boolean(decisionHistory.length) && (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Дата изменения</TableCell>
                    <TableCell>Редакция</TableCell>
                    <TableCell>Сторона</TableCell>
                    <TableCell>Кто изменил</TableCell>
                    <TableCell>Было</TableCell>
                    <TableCell>Стало</TableCell>
                    <TableCell>Комментарий</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {decisionHistory.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(event.createdAt)}</TableCell>
                      <TableCell>{event.revisionNo}</TableCell>
                      <TableCell>{event.roleLabel}</TableCell>
                      <TableCell>{event.actorName}</TableCell>
                      <TableCell>{formatDecisionLabel(event.previousDecision, event.previousComment)}</TableCell>
                      <TableCell>{formatDecisionLabel(event.newDecision, event.newComment)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{event.newComment || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(draftDeleteTarget)} onClose={() => !draftDeleting && setDraftDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить черновик?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Договор № {draftDeleteTarget?.contractNumber || '—'} и приложенные к нему файлы будут удалены без возможности восстановления.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDraftDeleteTarget(null)} disabled={draftDeleting}>Отменить</Button>
          <Button color="error" variant="contained" onClick={() => { void removeDraft(); }} disabled={draftDeleting}>
            {draftDeleting ? 'Удаление...' : 'Удалить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(revisionTarget)} onClose={() => !revisionPreparing && setRevisionTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Начать новую редакцию?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Текущий круг виз останется в истории. Приложите измененный договор, после чего он будет направлен на новый круг согласования.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevisionTarget(null)} disabled={revisionPreparing}>Отменить</Button>
          <Button variant="contained" onClick={() => { void beginNewRevision(); }} disabled={revisionPreparing}>
            {revisionPreparing ? 'Подготовка...' : 'Продолжить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(attachmentDeleteTarget)} onClose={() => !attachmentDeleting && setAttachmentDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить файл?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Файл «{attachmentDeleteTarget?.file.originalName || '—'}» будет удален из истории согласования без возможности восстановления.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAttachmentDeleteTarget(null)} disabled={attachmentDeleting}>Отменить</Button>
          <Button color="error" variant="contained" onClick={() => { void removeAttachment(); }} disabled={attachmentDeleting}>
            {attachmentDeleting ? 'Удаление...' : 'Удалить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={wizardOpen}
        onClose={closeWizard}
        fullWidth
        maxWidth="md"
        PaperProps={{
          sx: {
            width: '100%',
            maxWidth: 760,
            minHeight: 500,
            height: 500,
          },
        }}
      >
        <DialogTitle>Добавление на согласование</DialogTitle>
        <DialogContent sx={{ minHeight: 380 }}>
          {wizardStep === 0 && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="ИНН контрагента"
                value={wizard.counterpartyInn}
                onChange={(e) => setWizard({ ...wizard, counterpartyInn: e.target.value.replace(/\D/g, '').slice(0, 12) })}
                onBlur={onWizardInnBlur}
                error={isWizardInnInvalidLength}
                helperText={isWizardInnInvalidLength ? 'Введен неправильный ИНН: должно быть 10 или 12 цифр' : ' '}
              />
              <TextField
                label="Наименование (контрагент)"
                value={wizardPrefill?.counterpartyName || ''}
                InputProps={{ readOnly: true }}
                multiline
                minRows={2}
                placeholder="Будет заполнено автоматически после ввода ИНН"
              />
              {wizardInnResolving && (
                <Typography variant="body2" color="text.secondary">Поиск контрагента по ИНН...</Typography>
              )}
              {!wizardInnResolving && isWizardInnValidLength && !wizardPrefill?.counterpartyName && (
                <Typography variant="body2" color="warning.main">
                  Контрагент пока не определен. Нажмите «Проверить» для повторной проверки.
                </Typography>
              )}
              <FormControl fullWidth>
                <InputLabel>Тип договора</InputLabel>
                <Select
                  label="Тип договора"
                  value={wizard.contractType}
                  onChange={(e) => {
                    const contractType = e.target.value as 'expense' | 'income';
                    setWizard({
                      ...wizard,
                      contractType,
                      psrMode: contractType === 'income' ? wizard.psrMode : 'without_psr',
                    });
                  }}
                >
                  <MenuItem value="expense">Расходный</MenuItem>
                  <MenuItem value="income">Доходный</MenuItem>
                </Select>
              </FormControl>
              {wizard.contractType === 'income' && (
                <FormControl fullWidth>
                  <InputLabel>Подтип доходного</InputLabel>
                  <Select
                    label="Подтип доходного"
                    value={wizard.psrMode}
                    onChange={(e) => setWizard({ ...wizard, psrMode: e.target.value as 'with_psr' | 'without_psr' })}
                  >
                    <MenuItem value="with_psr">С ПСР</MenuItem>
                    <MenuItem value="without_psr">Без ПСР</MenuItem>
                  </Select>
                </FormControl>
              )}
            </Stack>
          )}

          {wizardStep === 4 && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              {wizardChecking && <Typography>Проверка дублей и данных контрагента...</Typography>}
              {!wizardChecking && wizardDuplicates.length > 0 && (
                <Alert severity="warning">
                  Найдены похожие договоры по ИНН и типу. Выберите: отменить или продолжить.
                </Alert>
              )}
              {!wizardChecking && wizardDuplicates.length > 0 && (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>№</TableCell>
                      <TableCell>Дата</TableCell>
                      <TableCell>Предмет</TableCell>
                      <TableCell>Статус</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {wizardDuplicates.map((d) => (
                      <TableRow
                        key={d.id}
                        hover
                        className="contract-clickable-row"
                        title="Двойной клик откроет лист согласования"
                        onDoubleClick={() => {
                          setResumeWizardAfterSheet(true);
                          setWizardOpen(false);
                          void openSheetModal(d.id);
                        }}
                      >
                        <TableCell>{d.contractNumber}</TableCell>
                        <TableCell>{d.contractDate ?? '—'}</TableCell>
                        <TableCell>{d.subject ?? '—'}</TableCell>
                        <TableCell>{STATUS_LABELS[d.status] ?? d.status}</TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            onClick={() => {
                              setResumeWizardAfterSheet(true);
                              setWizardOpen(false);
                              void openSheetModal(d.id);
                            }}
                          >
                            Лист
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {!wizardChecking && wizardDuplicates.length === 0 && (
                <Alert severity="success">Похожих договоров не найдено. Можно продолжать.</Alert>
              )}
            </Stack>
          )}

          {wizardStep === 5 && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="№ договора"
                value={wizard.contractNumber}
                onChange={(e) => setWizard({ ...wizard, contractNumber: e.target.value })}
              />
              <TextField
                label="Предмет договора"
                value={wizard.subject}
                onChange={(e) => setWizard({ ...wizard, subject: e.target.value })}
              />
              <TextField
                label="Дата договора"
                type="date"
                value={wizard.contractDate}
                onChange={(e) => setWizard({ ...wizard, contractDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
              <FormControl fullWidth>
                <InputLabel>Способ подписания</InputLabel>
                <Select
                  label="Способ подписания"
                  value={wizard.signingMethod}
                  onChange={(e) => setWizard({ ...wizard, signingMethod: e.target.value as 'edo' | 'post' })}
                >
                  <MenuItem value="edo">ЭДО</MenuItem>
                  <MenuItem value="post">Почта</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          )}

          {wizardStep === 6 && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body1">Приложите файлы договора (можно перетащить в область ниже)</Typography>
              <Box
                sx={{
                  border: '1px dashed',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 3,
                  textAlign: 'center',
                  bgcolor: 'background.paper',
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = Array.from(e.dataTransfer.files || []);
                  if (!dropped.length) return;
                  appendWizardFiles(dropped);
                }}
              >
                <Button variant="outlined" component="label">
                  Выбрать файлы
                  <input
                    hidden
                    type="file"
                    multiple
                    onChange={(e) => {
                      const selected = Array.from(e.target.files || []);
                      if (!selected.length) return;
                      appendWizardFiles(selected);
                      e.target.value = '';
                    }}
                  />
                </Button>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Перетащите файлы сюда
                </Typography>
              </Box>
              {wizardExistingFiles.length > 0 && (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Уже прикреплены к черновику:
                  </Typography>
                  {wizardExistingFiles.map((file, idx) => (
                    <Typography key={file.id} variant="body2">
                      {idx + 1}. {file.originalName}
                    </Typography>
                  ))}
                </Box>
              )}
              {wizardFiles.length > 0 && (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Новые файлы к отправке:
                  </Typography>
                  {wizardFiles.map((file, idx) => (
                    <Stack
                      key={`${file.name}-${file.size}-${idx}`}
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{ py: 0.25 }}
                    >
                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                        {idx + 1}. {file.name}
                      </Typography>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => removeWizardFile(idx)}
                        disabled={wizardSubmitting}
                      >
                        Удалить
                      </Button>
                    </Stack>
                  ))}
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={closeWizard} disabled={wizardSubmitting}>Отменить</Button>
          {wizardStep > 0 && wizardStep < 7 && (
            <Button onClick={prevWizardStep} disabled={wizardSubmitting}>Назад</Button>
          )}
          {wizardStep === 0 && (
            <Button
              variant="contained"
              onClick={async () => { setWizardStep(4); await runWizardChecks(); }}
              disabled={
                !isWizardInnValidLength ||
                wizardInnResolving ||
                wizardSubmitting
              }
            >
              Проверить
            </Button>
          )}
          {wizardStep === 4 && !wizardChecking && (
            <Button
              variant="contained"
              onClick={() => setWizardStep(5)}
              disabled={!wizardPrefill?.counterpartyName || wizardSubmitting}
            >
              Продолжить
            </Button>
          )}
          {wizardStep === 5 && (
            <Button
              variant="contained"
              onClick={() => {
                if (requiresAttachmentStep()) {
                  setWizardStep(6);
                } else {
                  void proceedFromWizard();
                }
              }}
              disabled={!wizard.contractNumber.trim() || !wizard.subject.trim() || !wizard.contractDate || wizardSubmitting}
            >
              {requiresAttachmentStep() ? 'Далее' : wizardSubmitting ? 'Отправка...' : 'Отправить'}
            </Button>
          )}
          {wizardStep === 6 && (
            <Button variant="contained" onClick={proceedFromWizard} disabled={wizardSubmitting}>
              {wizardSubmitting ? 'Отправка...' : 'Отправить'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
