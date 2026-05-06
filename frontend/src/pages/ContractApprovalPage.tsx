import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
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
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useLocation } from 'react-router-dom';
import {
  createContract,
  downloadContractAttachment,
  getSecurityContractInbox,
  getContractApprovalSheet,
  getContractDuplicates,
  getContracts,
  resolveCounterpartyByInn,
  startContractApproval,
  submitSecurityVisa,
  uploadContractAttachments,
} from '../services/api';
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
};

type DuplicateContract = {
  id: string;
  contractNumber: string;
  contractDate: string | null;
  subject: string | null;
  status: string;
};

type SheetStep = {
  id: string;
  roleCode: string;
  roleLabel: string;
  approverUserId: string;
  approverName: string;
  orderNo: number;
  acceptedAt: string | null;
  signedAt: string | null;
  assignedAt?: string | null;
  deadlineAt?: string | null;
  decision: 'approve' | 'rework' | 'reject' | null;
  comment: string | null;
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
    initiator: { id: string; fullName: string } | null;
    assignedGeneralDirector: { id: string; fullName: string } | null;
  };
  currentStepId: string | null;
  steps: SheetStep[];
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
  attachments: Array<{
    id: string;
    originalName: string;
    sizeBytes: number;
    mimeType: string | null;
  }>;
};

const STATUS_LABELS: Record<ContractRecord['status'], string> = {
  draft: 'Черновик',
  in_approval: 'На согласовании',
  rework: 'На доработке',
  approved: 'Согласован',
  rejected: 'Отклонен',
};

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

const REGISTRY_COLUMNS = [
  { key: 'idx', label: '№', width: 36 },
  { key: 'number', label: '№ договора', width: 80 },
  { key: 'date', label: 'Дата договора', width: 96 },
  { key: 'type', label: 'Тип', width: 86 },
  { key: 'subject', label: 'Предмет договора', width: 160 },
  { key: 'counterparty', label: 'Контрагент', width: 173 },
  { key: 'inn', label: 'ИНН', width: 110 },
  { key: 'status', label: 'Статус', width: 90 },
  { key: 'stage', label: 'Текущий этап', width: 150 },
  { key: 'sheet', label: 'Лист', width: 78 },
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
  { key: 'contract', label: 'Договор', width: 74 },
  { key: 'visa', label: 'Виза СБ', width: 184 },
  { key: 'comment', label: 'Комментарий', width: 250 },
  { key: 'action', label: 'Статус отправки', width: 140 },
] as const;

export default function ContractApprovalPage() {
  const location = useLocation();
  const currentUser = useAuthStore((state) => state.user);
  const isSecurity = currentUser?.role === 'security';
  const [tab, setTab] = useState(0);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
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

  const [securityInbox, setSecurityInbox] = useState<SecurityInboxItem[]>([]);
  const [securityInboxView, setSecurityInboxView] = useState<'active' | 'processed' | 'all' | 'new' | 'due_today' | 'overdue'>('active');
  const [securitySearch, setSecuritySearch] = useState('');
  const [securityVisa, setSecurityVisa] = useState<Record<string, { visa: 'approved' | 'rejected' | 'approved_with_remarks'; comment: string }>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMimeType, setPreviewMimeType] = useState<string | null>(null);
  const [sheetModalOpen, setSheetModalOpen] = useState(false);
  const [sheetModalLoading, setSheetModalLoading] = useState(false);

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
      const apiView = securityInboxView === 'new' || securityInboxView === 'due_today' || securityInboxView === 'overdue'
        ? 'active'
        : securityInboxView;
      const response = await getSecurityContractInbox(apiView);
      setSecurityInbox(Array.isArray(response.data) ? response.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить входящие СБ');
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

  const resetWizard = () => {
    setWizardStep(0);
    setWizardDuplicates([]);
    setWizardPrefill(null);
    setWizardChecking(false);
    setWizardSubmitting(false);
    setWizardInnResolving(false);
    setWizardResolvedInn('');
    setWizardFiles([]);
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

  const requiresAttachmentStep = () => wizard.contractType !== 'income' || wizard.psrMode === 'with_psr';

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
      if (!/^(\d{10}|\d{12}|\d{13}|\d{15})$/.test(typedId)) {
        setError('Некорректный идентификатор: допустимо 10/12 (ИНН) или 13/15 (ОГРН/ОГРНИП)');
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

      const createRes = await createContract({
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
      });

      createdId = createRes.data?.id as string | undefined;
      if (createdId && wizardFiles.length) {
        const filesPayload = await Promise.all(
          wizardFiles.map(async (file) => {
            const base64 = await new Promise<string>((resolve, reject) => {
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
              contentBase64: base64,
            };
          })
        );
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
    if (!/^(\d{10}|\d{12}|\d{13}|\d{15})$/.test(typedId)) return;
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
      setError('Контрагент не найден по указанному идентификатору');
    } finally {
      setWizardInnResolving(false);
    }
  };

  const onWizardInnBlur = async () => {
    await resolveWizardInn();
  };

  useEffect(() => {
    const typedId = wizard.counterpartyInn.trim();
    if (!/^(\d{10}|\d{12}|\d{13}|\d{15})$/.test(typedId)) {
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
    loadSheet(selectedContractId);
  }, [selectedContractId]);

  useEffect(() => {
    if (isSecurity) {
      setTab(2);
    }
  }, [isSecurity]);

  useEffect(() => {
    if (!isSecurity) return;
    const params = new URLSearchParams(location.search);
    const kpi = (params.get('kpi') || '').toLowerCase();
    if (kpi === 'new') {
      setSecurityInboxView('new');
      setSecuritySearch('');
      setTab(2);
      return;
    }
    if (kpi === 'in_work') {
      setSecurityInboxView('active');
      setSecuritySearch('');
      setTab(2);
      return;
    }
    if (kpi === 'due_today') {
      setSecurityInboxView('due_today');
      setSecuritySearch('');
      setTab(2);
      return;
    }
    if (kpi === 'overdue') {
      setSecurityInboxView('overdue');
      setSecuritySearch('');
      setTab(2);
      return;
    }
  }, [isSecurity, location.search]);

  const onSecurityVisa = async (item: SecurityInboxItem) => {
    const form = securityVisa[item.contractId] ?? { visa: 'approved' as const, comment: '' };
    if (form.visa === 'approved_with_remarks' && !form.comment.trim()) {
      setError('Для "Согласован с замечаниями" обязателен комментарий');
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
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось сохранить визу СБ');
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewLoading(false);
    setPreviewError(null);
    setPreviewFileName('');
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewMimeType(null);
  };

  const closeSheetModal = () => {
    setSheetModalOpen(false);
    setSheetModalLoading(false);
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

  const onOpenAttachmentPreview = async (attachmentId: string, fallbackName: string) => {
    setError(null);
    setPreviewError(null);
    setPreviewFileName(fallbackName);
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const response = await downloadContractAttachment(attachmentId);
      const disposition = String(response.headers?.['content-disposition'] || '');
      const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
      const quotedMatch = /filename=\"([^\"]+)\"/i.exec(disposition);
      const filename = utfMatch?.[1]
        ? decodeURIComponent(utfMatch[1]).replace(/\+/g, ' ')
        : (quotedMatch?.[1] || fallbackName || 'contract-file');
      const blob = response.data as Blob;
      const url = URL.createObjectURL(blob);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(url);
      setPreviewFileName(filename);
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

  const mapDecisionToVisa = (decision: SecurityInboxItem['securityDecision']): 'approved' | 'rejected' | 'approved_with_remarks' => {
    if (decision === 'reject') return 'rejected';
    return 'approved';
  };


  return (
    <Box sx={{ px: { xs: 0.125, sm: 0.25 }, py: { xs: 0.25, sm: 0.375 }, display: 'grid', gap: 0.5 }}>
      <Paper sx={{ px: 0.25, py: 0.375 }}>
        {isSecurity ? (
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1, gap: 1 }}>
            <Stack direction="row" alignItems="center" sx={{ gap: 1 }}>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel id="sb-view-label">Фильтр</InputLabel>
                <Select
                  labelId="sb-view-label"
                  label="Фильтр"
                  value={securityInboxView}
                  onChange={(e) => setSecurityInboxView(e.target.value as 'active' | 'processed' | 'all' | 'new' | 'due_today' | 'overdue')}
                >
                  <MenuItem value="active">В работе</MenuItem>
                  <MenuItem value="new">Новые</MenuItem>
                  <MenuItem value="due_today">Дедлайн сегодня</MenuItem>
                  <MenuItem value="overdue">Просрочено</MenuItem>
                  <MenuItem value="processed">Обработанные</MenuItem>
                  <MenuItem value="all">Все</MenuItem>
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Поиск"
                placeholder="Поиск по любой колонке"
                value={securitySearch}
                onChange={(e) => setSecuritySearch(e.target.value)}
                sx={{ minWidth: 120 }}
              />
            </Stack>
            <Button variant="contained" onClick={openWizard} sx={{ mr: 1 }}>
              Добавить
            </Button>
          </Stack>
        ) : (
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1 }}>
            <Tabs value={tab} onChange={(_, value) => setTab(value)}>
              <Tab label="Реестр" />
              <Tab label="Лист согласования" />
            </Tabs>
            <Button variant="contained" onClick={openWizard} sx={{ mr: 1 }}>
              Добавить
            </Button>
          </Stack>
        )}
      </Paper>

      {tab === 0 && (
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
                  {contracts.map((row, index) => (
                    <TableRow key={row.id} hover selected={selectedContractId === row.id}>
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
                        <Chip
                          size="small"
                          label={STATUS_LABELS[row.status]}
                          color={row.status === 'rejected' ? 'error' : 'default'}
                          sx={{ fontSize: '9px', fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell>{row.statusDetail || row.currentStageLabel || '—'}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => { void openSheetModal(row.id); }}>Открыть</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
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
            <Button variant="outlined" onClick={() => window.print()} disabled={!sheet}>Печать</Button>
          </Stack>

          {sheet && (
            <Box className="approval-sheet-print">
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

              <Typography variant="subtitle1" align="center" sx={{ mb: 1 }}>Согласование сторон</Typography>
              <TableContainer>
                <Table size="small" className="approval-sheet-table">
                  <TableHead>
                    <TableRow>
                      <TableCell>Сторона</TableCell>
                      <TableCell>ФИО</TableCell>
                      <TableCell>Дата принятия</TableCell>
                      <TableCell>Дата визирования</TableCell>
                      <TableCell>Комментарии</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sheet.steps.map((step) => (
                      <TableRow key={step.id}>
                        <TableCell>{step.roleLabel}</TableCell>
                        <TableCell>{step.approverName}</TableCell>
                        <TableCell>{formatDateTime(step.acceptedAt || step.assignedAt || null)}</TableCell>
                        <TableCell>{formatDateTime(step.signedAt)}</TableCell>
                        <TableCell>{step.comment || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Box sx={{ mt: 2 }}>
                <Typography>Текущий статус: {STATUS_LABELS[sheet.contract.status]}</Typography>
              </Box>
            </Box>
          )}

        </Paper>
      )}

      {isSecurity && tab === 2 && (
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
                      <TableCell
                        key={column.key}
                        align={column.key === 'action' ? 'left' : 'left'}
                        sx={column.key === 'action'
                          ? {
                            position: 'sticky',
                            right: 0,
                            zIndex: 3,
                            backgroundColor: '#f3f6fb',
                            boxShadow: '-1px 0 0 #d0d7de',
                          }
                          : undefined}
                      >
                        <Box className="registry-header-cell">
                          <span>{column.label}</span>
                        </Box>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSecurityInbox.map((item, index) => {
                    const isProcessed = Boolean(item.securityDecision);
                    const form = securityVisa[item.contractId] ?? {
                      visa: mapDecisionToVisa(item.securityDecision),
                      comment: '',
                    };
                    return (
                      <TableRow key={item.contractId} hover>
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
                          {item.attachments.length ? (
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                              {item.attachments.map((file) => (
                                <Button
                                  key={file.id}
                                  size="small"
                                  variant="outlined"
                                  sx={{
                                    minWidth: 56,
                                    px: 1,
                                    py: 0.25,
                                    fontSize: 11,
                                    lineHeight: 1.1,
                                  }}
                                  onClick={() => onOpenAttachmentPreview(file.id, file.originalName)}
                                >
                                  Открыть
                                </Button>
                              ))}
                            </Stack>
                          ) : '—'}
                        </TableCell>
                        <TableCell sx={{ minWidth: 183 }}>
                          <FormControl fullWidth size="small">
                            <Select
                              disabled={isProcessed}
                              sx={{
                                height: 20,
                                '& .MuiSelect-select': {
                                  fontSize: 10,
                                  height: 20,
                                  lineHeight: '20px',
                                  minHeight: '20px !important',
                                  py: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  pl: 0.5,
                                  pr: 2,
                                },
                              }}
                              MenuProps={{
                                PaperProps: {
                                  sx: { '& .MuiMenuItem-root': { fontSize: 10 } },
                                },
                              }}
                              value={form.visa}
                              onChange={(e) => setSecurityVisa((prev) => ({
                                ...prev,
                                [item.contractId]: {
                                  ...form,
                                  visa: e.target.value as 'approved' | 'rejected' | 'approved_with_remarks',
                                },
                              }))}
                            >
                              <MenuItem value="approved">Согласован</MenuItem>
                              <MenuItem value="rejected">Не согласован</MenuItem>
                              <MenuItem value="approved_with_remarks">Согласован с замечаниями</MenuItem>
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell sx={{ minWidth: 150, whiteSpace: 'normal', verticalAlign: 'top' }}>
                          <TextField
                            fullWidth
                            size="small"
                            disabled={isProcessed}
                            multiline
                            minRows={1}
                            maxRows={4}
                            sx={{
                              '& .MuiInputBase-input': {
                                fontSize: 12,
                                lineHeight: 1.2,
                                whiteSpace: 'pre-wrap',
                              },
                            }}
                            placeholder={form.visa === 'approved_with_remarks' ? 'Обязательно' : 'Необязательно'}
                            value={isProcessed ? (item.securityComment || '') : form.comment}
                            onChange={(e) => setSecurityVisa((prev) => ({
                              ...prev,
                              [item.contractId]: { ...form, comment: e.target.value },
                            }))}
                          />
                        </TableCell>
                        <TableCell
                          align="left"
                          sx={{
                            position: 'sticky',
                            right: 0,
                            zIndex: 2,
                            backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fbff',
                            boxShadow: '-1px 0 0 #d0d7de',
                          }}
                        >
                          {isProcessed ? (
                            <Typography variant="caption" sx={{ fontSize: 11, color: 'text.secondary' }}>
                              {formatDateOnly(item.securitySignedAt)}
                            </Typography>
                          ) : (
                            <Button
                              size="small"
                              variant="contained"
                              sx={{
                                minWidth: 74,
                                height: 20,
                                minHeight: '20px !important',
                                px: 1,
                                py: 0,
                                fontSize: 11,
                                lineHeight: '20px',
                              }}
                              onClick={() => onSecurityVisa(item)}
                            >
                              Отправить
                            </Button>
                          )}
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

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Dialog open={previewOpen} onClose={closePreview} fullWidth maxWidth="lg">
        <DialogTitle>{previewFileName || 'Просмотр договора'}</DialogTitle>
        <DialogContent sx={{ minHeight: 620, p: 0, overflow: 'auto' }}>
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
          {previewUrl && (
            <Button
              onClick={async () => {
                if (!previewUrl) return;
                const response = await fetch(previewUrl);
                const blob = await response.blob();
                downloadBlob(blob, previewFileName || 'contract-file');
              }}
            >
              Скачать
            </Button>
          )}
          <Button onClick={closePreview}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={sheetModalOpen} onClose={closeSheetModal} fullWidth maxWidth="lg">
        <DialogTitle>Лист согласования</DialogTitle>
        <DialogContent dividers>
          {sheetModalLoading && (
            <Stack direction="row" alignItems="center" spacing={1}>
              <CircularProgress size={18} />
              <Typography variant="body2">Загрузка...</Typography>
            </Stack>
          )}
          {!sheetModalLoading && sheet && (
            <Box className="approval-sheet-print">
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

              <Typography variant="subtitle1" align="center" sx={{ mb: 1 }}>Согласование сторон</Typography>
              <TableContainer>
                <Table size="small" className="approval-sheet-table">
                  <TableHead>
                    <TableRow>
                      <TableCell>Сторона</TableCell>
                      <TableCell>ФИО</TableCell>
                      <TableCell>Дата принятия</TableCell>
                      <TableCell>Дата визирования</TableCell>
                      <TableCell>Комментарии</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sheet.steps.map((step) => (
                      <TableRow key={step.id}>
                        <TableCell>{step.roleLabel}</TableCell>
                        <TableCell>{step.approverName}</TableCell>
                        <TableCell>{formatDateTime(step.acceptedAt || step.assignedAt || null)}</TableCell>
                        <TableCell>{formatDateTime(step.signedAt)}</TableCell>
                        <TableCell>{step.comment || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Box sx={{ mt: 2 }}>
                <Typography>Текущий статус: {STATUS_LABELS[sheet.contract.status]}</Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeSheetModal}>Закрыть</Button>
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
                label="ИНН/ОГРН контрагента"
                value={wizard.counterpartyInn}
                onChange={(e) => setWizard({ ...wizard, counterpartyInn: e.target.value.replace(/\D/g, '').slice(0, 15) })}
                onBlur={onWizardInnBlur}
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
              {!wizardInnResolving && wizard.counterpartyInn.trim().length > 0 && !wizardPrefill?.counterpartyName && (
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
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {wizardDuplicates.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>{d.contractNumber}</TableCell>
                        <TableCell>{d.contractDate ?? '—'}</TableCell>
                        <TableCell>{d.subject ?? '—'}</TableCell>
                        <TableCell>{d.status}</TableCell>
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
                  setWizardFiles((prev) => [...prev, ...dropped]);
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
                      setWizardFiles((prev) => [...prev, ...selected]);
                    }}
                  />
                </Button>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Перетащите файлы сюда
                </Typography>
              </Box>
              {wizardFiles.length > 0 && (
                <Box>
                  {wizardFiles.map((file, idx) => (
                    <Typography key={`${file.name}-${idx}`} variant="body2">
                      {idx + 1}. {file.name}
                    </Typography>
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
                !/^(\d{10}|\d{12}|\d{13}|\d{15})$/.test(wizard.counterpartyInn) ||
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
