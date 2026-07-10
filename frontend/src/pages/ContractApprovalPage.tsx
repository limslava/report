import { useEffect, useRef, useState } from 'react';
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
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useLocation } from 'react-router-dom';
import {
  createContract,
  decideContractApprovalStep,
  deleteContractAttachment,
  deleteDraftContract,
  decideSecurityContractVisa,
  downloadContractAttachment,
  downloadContractPrintPackage,
  getContractApprovalSheet,
  getContractDecisionHistory,
  getContractDuplicates,
  importSignedContract,
  prepareContractRevision,
  previewContractAttachment,
  resolveCounterpartyByInn,
  startContractApproval,
  updateDraftContract,
  uploadContractStepAttachments,
  uploadContractAttachments,
} from '../services/api';
import { subscribePlansRealtime } from '../services/plans-realtime';
import { useApprovalInbox } from '../hooks/useApprovalInbox';
import { useContractSheet } from '../hooks/useContractSheet';
import { useContractsRegistry } from '../hooks/useContractsRegistry';
import { useSecurityInbox } from '../hooks/useSecurityInbox';
import { useAuthStore } from '../store/auth-store';
import { downloadBlob } from '../utils/download';
import { ContractApprovalSheet } from '../components/contracts/ContractApprovalSheet';
import {
  ContractApprovalActionSection,
  ContractCardDetails,
  ContractPreviousRevisions,
  SecurityDecisionEditor,
} from '../components/contracts/ContractCardSections';
import { ContractFileList } from '../components/contracts/ContractFileList';
import {
  DeleteAttachmentDialog,
  DeleteDraftDialog,
  HistoryDialog,
  PreviewDialog,
  RevisionDialog,
} from '../components/contracts/ContractDialogs';
import { ApprovalContractInboxTable, SecurityContractInboxTable } from '../components/contracts/ContractInboxTables';
import { ContractProcessTimeline } from '../components/contracts/ContractProcessTimeline';
import { ContractRegistryTable } from '../components/contracts/ContractRegistryTable';
import { ContractWizard } from '../components/contracts/ContractWizard';
import {
  CONTRACT_STATUS_LABELS,
  buildPrintFileName,
  formatContractTypeLabel,
  formatDateTime,
  getStepDecisionLabel,
  getStepDecisionTone,
  normalizeCounterpartyName,
} from '../utils/contract-approval';
import type {
  ApprovalDecisionValue,
  ContractAttachmentRef,
  ContractRecord,
  ContractSection,
  ContractWizardForm,
  ContractWizardPrefill,
  DecisionHistoryEvent,
  DuplicateContract,
  InboxView,
  SecurityInboxItem,
  SecurityVisaValue,
  SheetStep,
} from '../types/contracts';
import '../styles/contract-approval.css';

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

function getFnsUnavailableMessage(error: any): string | null {
  if (error?.response?.status !== 503) return null;
  return error?.response?.data?.message || 'Сервис ФНС временно недоступен, заполните данные вручную или попробуйте позже';
}

export default function ContractApprovalPage() {
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const {
    sheet,
    setSheet,
    loadSheet,
  } = useContractSheet({
    onClearError: () => setError(null),
    onError: setError,
  });
  const {
    contracts,
    registrySearch,
    setRegistrySearch,
    selectedContractId,
    setSelectedContractId,
    loadRegistry,
    refreshRegistryUntilContains,
  } = useContractsRegistry({
    onClearError: () => setError(null),
    onError: setError,
  });
  const {
    securityInbox,
    securityInboxView,
    setSecurityInboxView,
    securitySearch,
    setSecuritySearch,
    filteredSecurityInbox,
    loadSecurityInbox,
  } = useSecurityInbox({
    enabled: isSecurity,
    onError: setError,
  });
  const {
    approvalInbox,
    approvalInboxView,
    setApprovalInboxView,
    approvalSearch,
    setApprovalSearch,
    filteredApprovalInbox,
    loadApprovalInbox,
  } = useApprovalInbox({
    enabled: isApprovalWorkRole,
    onError: setError,
  });

  const [wizardOpen, setWizardOpen] = useState(false);
  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null);
  const [importMenuAnchor, setImportMenuAnchor] = useState<null | HTMLElement>(null);
  const [wizardImportSigned, setWizardImportSigned] = useState(false);
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
  const [wizardPrefill, setWizardPrefill] = useState<ContractWizardPrefill | null>(null);
  const emptyWizardDetails = {
    counterpartyName: '',
    counterpartyShortName: '',
    counterpartyForm: '' as ContractWizardForm['counterpartyForm'],
    counterpartyOgrn: '',
    counterpartyKpp: '',
    counterpartyLegalAddress: '',
    counterpartyPostalAddress: '',
    counterpartyPhone: '',
    counterpartyEmail: '',
    counterpartySignerPosition: '',
    counterpartySignerName: '',
    counterpartySignerAuthority: '',
    counterpartyBankName: '',
    counterpartyBankBik: '',
    counterpartyBankAccount: '',
    counterpartyCorrespondentAccount: '',
  };
  const [wizard, setWizard] = useState<ContractWizardForm>({
    clientRequestId: crypto.randomUUID(),
    documentKind: 'master',
    parentContractId: '',
    counterpartyInn: '',
    contractType: 'expense' as 'expense' | 'income',
    psrMode: 'without_psr' as 'with_psr' | 'without_psr',
    contractNumber: '',
    subject: '',
    contractDate: '',
    signingMethod: 'post' as 'edo' | 'post',
    ...emptyWizardDetails,
  });
  const wizardInnInput = wizard.counterpartyInn.trim();
  const isWizardInnValidLength = /^(\d{10}|\d{12})$/.test(wizardInnInput);
  const isWizardInnInvalidLength = wizardInnInput.length > 0 && !isWizardInnValidLength;
  const isIncomeContractWizard = wizard.contractType === 'income';
  const isIncomeWithoutPsrWizard = isIncomeContractWizard && wizard.psrMode === 'without_psr';
  const normalizedWizardInn = wizard.counterpartyInn.trim();
  const masterContractOptions = contracts
    .filter((contract) => (
      contract.documentKind !== 'addendum'
      && contract.contractType === wizard.contractType
      && contract.counterpartyInn === normalizedWizardInn
    ))
    .map((contract) => ({
      id: contract.id,
      contractNumber: contract.contractNumber,
      counterpartyName: contract.counterpartyName,
      counterpartyShortName: contract.counterpartyShortName,
      contractType: contract.contractType,
    }));

  const [securityVisa, setSecurityVisa] = useState<Record<string, { visa: SecurityVisaValue; comment: string }>>({});
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
  const openedDeepLinkRef = useRef('');

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
    setWizardImportSigned(false);
    setWizard({
      clientRequestId: crypto.randomUUID(),
      documentKind: 'master',
      parentContractId: '',
      counterpartyInn: '',
      contractType: 'expense',
      psrMode: 'without_psr',
      contractNumber: '',
      subject: '',
      contractDate: '',
      signingMethod: 'post',
      ...emptyWizardDetails,
    });
  };

  const openWizard = (importSigned = false, documentKind: ContractWizardForm['documentKind'] = 'master') => {
    resetWizard();
    setAddMenuAnchor(null);
    setImportMenuAnchor(null);
    setWizardImportSigned(importSigned);
    setWizard((prev) => ({
      ...prev,
      documentKind,
      parentContractId: '',
    }));
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
      counterpartyOgrn: draft.counterpartyOgrn || '',
      counterpartyKpp: draft.counterpartyKpp || '',
      counterpartyLegalAddress: draft.counterpartyLegalAddress || '',
    });
    setWizardResolvedInn(draft.counterpartyInn);
    setWizard({
      clientRequestId: crypto.randomUUID(),
      documentKind: draft.documentKind || 'master',
      parentContractId: draft.parentContractId || '',
      counterpartyInn: draft.counterpartyInn,
      counterpartyName: draft.counterpartyName,
      counterpartyShortName: draft.counterpartyShortName || '',
      counterpartyForm: (draft.counterpartyForm || '') as ContractWizardForm['counterpartyForm'],
      contractType: draft.contractType,
      psrMode: draft.incomeSubtype === 'with_psr' || draft.psrFlag ? 'with_psr' : 'without_psr',
      contractNumber: draft.contractNumber,
      subject: draft.subject || '',
      contractDate: draft.contractDate || '',
      signingMethod: draft.signingMethod,
      counterpartyOgrn: draft.counterpartyOgrn || '',
      counterpartyKpp: draft.counterpartyKpp || '',
      counterpartyLegalAddress: draft.counterpartyLegalAddress || '',
      counterpartyPostalAddress: draft.counterpartyPostalAddress || draft.counterpartyLegalAddress || '',
      counterpartyPhone: draft.counterpartyPhone || '',
      counterpartyEmail: draft.counterpartyEmail || '',
      counterpartySignerPosition: draft.counterpartySignerPosition || '',
      counterpartySignerName: draft.counterpartySignerName || '',
      counterpartySignerAuthority: draft.counterpartySignerAuthority || '',
      counterpartyBankName: draft.counterpartyBankName || '',
      counterpartyBankBik: draft.counterpartyBankBik || '',
      counterpartyBankAccount: draft.counterpartyBankAccount || '',
      counterpartyCorrespondentAccount: draft.counterpartyCorrespondentAccount || '',
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

  const requiresAttachmentStep = () => wizardImportSigned || !isIncomeWithoutPsrWizard;

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
            counterpartyOgrn: data.ogrn,
            counterpartyKpp: data.kpp,
            counterpartyLegalAddress: data.address,
          });
          setWizard((prev) => ({
            ...prev,
            counterpartyInn: data.inn || prev.counterpartyInn,
            counterpartyName: data.nameFull || prev.counterpartyName,
            counterpartyShortName: data.nameShort || prev.counterpartyShortName,
            counterpartyForm: data.counterpartyForm || prev.counterpartyForm,
            counterpartyOgrn: data.ogrn || prev.counterpartyOgrn,
            counterpartyKpp: data.kpp || prev.counterpartyKpp,
            counterpartyLegalAddress: data.address || prev.counterpartyLegalAddress,
            counterpartyPostalAddress: prev.counterpartyPostalAddress || data.address || '',
            counterpartySignerPosition: prev.counterpartySignerPosition || (data.counterpartyForm === 'ip' ? 'Индивидуального предпринимателя' : 'Генерального директора'),
            counterpartySignerAuthority: prev.counterpartySignerAuthority || (data.counterpartyForm === 'ip' ? 'государственной регистрации' : 'Устава'),
          }));
        }
      } else {
        const message = getFnsUnavailableMessage(resolveRes.reason);
        if (message) {
          setError(message);
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
      if (wizard.documentKind === 'addendum' && !wizard.parentContractId) {
        setError('Для доп. соглашения выберите основной договор');
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
            counterpartyOgrn: data.ogrn,
            counterpartyKpp: data.kpp,
            counterpartyLegalAddress: data.address,
          };
          setWizardPrefill(resolved);
          setWizard((prev) => ({
            ...prev,
            counterpartyInn: data.inn || prev.counterpartyInn,
            counterpartyName: data.nameFull || prev.counterpartyName,
            counterpartyShortName: data.nameShort || prev.counterpartyShortName,
            counterpartyForm: data.counterpartyForm || prev.counterpartyForm,
            counterpartyOgrn: data.ogrn || prev.counterpartyOgrn,
            counterpartyKpp: data.kpp || prev.counterpartyKpp,
            counterpartyLegalAddress: data.address || prev.counterpartyLegalAddress,
            counterpartyPostalAddress: prev.counterpartyPostalAddress || data.address || '',
            counterpartySignerPosition: prev.counterpartySignerPosition || (data.counterpartyForm === 'ip' ? 'Индивидуального предпринимателя' : 'Генерального директора'),
            counterpartySignerAuthority: prev.counterpartySignerAuthority || (data.counterpartyForm === 'ip' ? 'государственной регистрации' : 'Устава'),
          }));
        }
      }

      const counterpartyName = (wizard.counterpartyName || resolved?.counterpartyName || '').trim();
      if (!counterpartyName) {
        setError('Заполните наименование контрагента');
        return;
      }
      const inn = String(wizard.counterpartyInn || resolved?.resolvedInn || typedId).trim();
      if (!/^(\d{10}|\d{12})$/.test(inn)) {
        setError('Не удалось определить корректный ИНН контрагента');
        return;
      }

      if (isIncomeWithoutPsrWizard && !wizardImportSigned) {
        const requiredDetails: Array<[keyof ContractWizardForm, string]> = [
          ['counterpartyOgrn', 'ОГРН/ОГРНИП'],
          ['counterpartyLegalAddress', 'юридический адрес'],
          ['counterpartySignerPosition', 'должность подписанта'],
          ['counterpartySignerName', 'ФИО подписанта'],
          ['counterpartySignerAuthority', 'основание полномочий'],
          ['counterpartyBankName', 'банк'],
          ['counterpartyBankBik', 'БИК'],
          ['counterpartyBankAccount', 'расчетный счет'],
          ['counterpartyCorrespondentAccount', 'корреспондентский счет'],
        ];
        const missing = requiredDetails
          .filter(([key]) => !String(wizard[key] ?? '').trim())
          .map(([, label]) => label);
        if (missing.length) {
          setError(`Для формирования договора заполните: ${missing.join(', ')}`);
          return;
        }
      }

      const contractPayload: Parameters<typeof createContract>[0] = {
        clientRequestId: wizard.clientRequestId,
        documentKind: wizard.documentKind,
        parentContractId: wizard.documentKind === 'addendum' ? wizard.parentContractId : null,
        contractNumber: isIncomeContractWizard && !wizardImportSigned && wizard.documentKind !== 'addendum'
          ? null
          : wizard.contractNumber.trim(),
        contractType: wizard.contractType,
        incomeSubtype: wizard.contractType === 'income'
          ? (wizard.psrMode === 'with_psr' ? 'with_psr' : 'standard')
          : null,
        counterpartyName,
        counterpartyShortName: wizard.counterpartyShortName.trim() || resolved?.counterpartyShortName || null,
        counterpartyForm: wizard.counterpartyForm || resolved?.counterpartyForm || null,
        counterpartyInn: inn,
        counterpartyOgrn: wizard.counterpartyOgrn.trim() || null,
        counterpartyKpp: wizard.counterpartyKpp.trim() || null,
        counterpartyLegalAddress: wizard.counterpartyLegalAddress.trim() || null,
        counterpartyPostalAddress: wizard.counterpartyPostalAddress.trim() || wizard.counterpartyLegalAddress.trim() || null,
        counterpartyPhone: wizard.counterpartyPhone.trim() || null,
        counterpartyEmail: wizard.counterpartyEmail.trim() || null,
        counterpartySignerPosition: wizard.counterpartySignerPosition.trim() || null,
        counterpartySignerName: wizard.counterpartySignerName.trim() || null,
        counterpartySignerAuthority: wizard.counterpartySignerAuthority.trim() || null,
        counterpartyBankName: wizard.counterpartyBankName.trim() || null,
        counterpartyBankBik: wizard.counterpartyBankBik.trim() || null,
        counterpartyBankAccount: wizard.counterpartyBankAccount.trim() || null,
        counterpartyCorrespondentAccount: wizard.counterpartyCorrespondentAccount.trim() || null,
        subject: wizard.subject.trim() || (isIncomeWithoutPsrWizard ? 'Оказание транспортно-экспедиционных услуг и перевалке грузов' : ''),
        contractDate: wizard.contractDate,
        psrFlag: wizard.psrMode === 'with_psr',
        signingMethod: wizard.signingMethod,
        allowDuplicate: true,
      };
      if (wizardImportSigned && !wizardFiles.length && !wizardExistingFiles.length) {
        setError('Для импорта подписанного договора приложите файл договора');
        return;
      }
      const filesPayload = wizardFiles.length ? await Promise.all(wizardFiles.map(fileToUploadPayload)) : [];
      const saveRes = wizardImportSigned
        ? await importSignedContract({
          ...contractPayload,
          contractNumber: wizard.contractNumber.trim(),
          contractDate: wizard.contractDate,
          files: filesPayload,
        })
        : editingDraftId
          ? await updateDraftContract(editingDraftId, contractPayload)
          : await createContract(contractPayload);

      createdId = saveRes.data?.id as string | undefined;
      if (!wizardImportSigned && createdId && filesPayload.length) {
        await uploadContractAttachments(createdId, filesPayload);
      }

      if (createdId && !wizardImportSigned) {
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
      const isAddendum = wizard.documentKind === 'addendum';
      setSuccess(
        wizardImportSigned
          ? isAddendum ? 'Подписанное доп. соглашение импортировано' : 'Подписанный договор импортирован'
          : createdId
            ? isAddendum ? 'Доп. соглашение отправлено на согласование' : 'Договор отправлен на согласование'
            : isAddendum ? 'Доп. соглашение создано' : 'Договор создан'
      );
      closeWizard();
    } catch (e: any) {
      if (startedApproval && createdId) {
        // Договор реально ушел на согласование, но UI-обновление могло упасть.
        setSuccess(wizard.documentKind === 'addendum' ? 'Доп. соглашение отправлено на согласование' : 'Договор отправлен на согласование');
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
        counterpartyName: data.nameFull || prev.counterpartyName,
        counterpartyShortName: data.nameShort || prev.counterpartyShortName,
        counterpartyForm: data.counterpartyForm || prev.counterpartyForm,
        counterpartyOgrn: data.ogrn || prev.counterpartyOgrn,
        counterpartyKpp: data.kpp || prev.counterpartyKpp,
        counterpartyLegalAddress: data.address || prev.counterpartyLegalAddress,
        counterpartyPostalAddress: prev.counterpartyPostalAddress || data.address || '',
        counterpartySignerPosition: prev.counterpartySignerPosition || (data.counterpartyForm === 'ip' ? 'Индивидуального предпринимателя' : 'Генерального директора'),
        counterpartySignerAuthority: prev.counterpartySignerAuthority || (data.counterpartyForm === 'ip' ? 'государственной регистрации' : 'Устава'),
      }));
      setWizardPrefill({
        resolvedInn: data.inn,
        counterpartyName: data.nameFull,
        counterpartyShortName: data.nameShort,
        counterpartyForm: data.counterpartyForm,
        counterpartyOgrn: data.ogrn,
        counterpartyKpp: data.kpp,
        counterpartyLegalAddress: data.address,
      });
      setWizardResolvedInn(typedId);
    } catch (error) {
      const message = getFnsUnavailableMessage(error);
      if (message) {
        setError(message);
      }
      setWizardPrefill(null);
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
    if (tab === 1 && selectedContractId) {
      void loadSheet(selectedContractId);
    }
  }, [loadSheet, selectedContractId, tab]);

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
      setError('Выберите решение руководителя СБ');
      return;
    }
    if (form.visa === 'approved_with_remarks' && !form.comment.trim()) {
      setError('Для решения "Согласован с замечаниями" заполните обязательный комментарий');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const response = await decideSecurityContractVisa(item.contractId, {
        visa: form.visa,
        comment: form.comment.trim() || null,
      });
      setSuccess(response.data?.message || 'Виза руководителя СБ сохранена');
      await Promise.all([loadSecurityInbox(), loadRegistry(), loadSheet(selectedContractId)]);
      if (securityInboxView !== 'processed' && securityInboxView !== 'all') {
        closeSecurityCard();
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось сохранить визу руководителя СБ');
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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const contractId = params.get('contractId')?.trim() || '';
    const stepId = params.get('stepId')?.trim() || '';
    if (!contractId) return;

    const deepLinkKey = `${contractId}:${stepId}`;
    if (openedDeepLinkRef.current === deepLinkKey) return;

    if (isSecurity) {
      const item = securityInbox.find((candidate) => candidate.contractId === contractId);
      if (!item) return;
      openedDeepLinkRef.current = deepLinkKey;
      setContractSection('inbox');
      setTab(2);
      void openSecurityCard(item);
      return;
    }

    openedDeepLinkRef.current = deepLinkKey;
    if (isApprovalWorkRole) {
      setContractSection('inbox');
      setTab(3);
    }
    void openSheetModal(contractId);
  }, [approvalInbox, isApprovalWorkRole, isSecurity, location.search, securityInbox]);

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

  const getRegistrySearchText = (contract: ContractRecord, index: number) => [
    index + 1,
    contract.contractNumber,
    contract.contractDate,
    formatContractTypeLabel(contract.contractType, contract.incomeSubtype),
    contract.subject,
    contract.counterpartyShortName,
    contract.counterpartyName,
    contract.counterpartyInn,
    CONTRACT_STATUS_LABELS[contract.status],
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
  const filteredRegistryContracts = registrySearchQuery
    ? (() => {
      const matchedIds = new Set<string>();
      const byId = new Map(registryBaseContracts.map((contract) => [contract.id, contract]));

      registryBaseContracts.forEach((contract, index) => {
        if (!getRegistrySearchText(contract, index).includes(registrySearchQuery)) return;

        matchedIds.add(contract.id);

        if (contract.documentKind === 'addendum' && contract.parentContractId) {
          matchedIds.add(contract.parentContractId);
          return;
        }

        registryBaseContracts.forEach((candidate) => {
          if (candidate.parentContractId === contract.id) {
            matchedIds.add(candidate.id);
          }
        });
      });

      return registryBaseContracts.filter((contract) => matchedIds.has(contract.id) || Boolean(contract.parentContractId && byId.has(contract.parentContractId) && matchedIds.has(contract.parentContractId)));
    })()
    : registryBaseContracts;

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
  const mainApprovalSteps = securityCardSheet?.steps.filter((step) => step.roleCode !== 'secretary') ?? [];
  const secretaryApprovalStep = securityCardSheet?.steps.find((step) => step.roleCode === 'secretary') ?? null;
  const completedMainApprovalSteps = mainApprovalSteps.filter((step) => Boolean(step.decision)).length;
  const approvalCardItem = sheet
    ? approvalInbox.find((item) => item.contractId === sheet.contract.id) ?? null
    : null;
  const approvalCardMainSteps = sheet?.steps.filter((step) => step.roleCode !== 'secretary') ?? [];
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
    <ContractFileList
      files={step.attachments ?? []}
      emptyText={!allowUpload || !canAttachToStep(step) ? '—' : undefined}
      emptyVariant="caption"
      canDeleteFile={canDeleteAttachment}
      onDeleteFile={(file) => setAttachmentDeleteTarget({ file, contractId })}
      onOpenFile={(file) => onOpenAttachmentPreview(file.id, file.originalName)}
      upload={allowUpload ? {
        canUpload: canAttachToStep(step),
        disabled: securityUploadBusy,
        label: 'Прикрепить файл',
        loadingLabel: 'Загрузка...',
        onUpload: (files) => void onAttachStepFiles(contractId, step.id, files),
      } : undefined}
    />
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
              display: contractSection === 'registry' ? 'flex' : 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '210px 230px' },
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 0.75,
              width: { xs: '100%', lg: contractSection === 'registry' ? 'min(100%, 1180px)' : 'auto' },
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
                <Stack direction="row" spacing={1} className="contract-registry-actions">
                  <Button
                    variant="contained"
                    onClick={(event) => setAddMenuAnchor(event.currentTarget)}
                  >
                    Добавить
                  </Button>
                  <Menu
                    anchorEl={addMenuAnchor}
                    open={Boolean(addMenuAnchor)}
                    onClose={() => setAddMenuAnchor(null)}
                  >
                    <MenuItem onClick={() => openWizard(false)}>Договор</MenuItem>
                    <MenuItem onClick={() => openWizard(false, 'addendum')}>Доп. соглашение</MenuItem>
                  </Menu>
                  <Button
                    variant="outlined"
                    onClick={(event) => setImportMenuAnchor(event.currentTarget)}
                  >
                    Импорт
                  </Button>
                  <Menu
                    anchorEl={importMenuAnchor}
                    open={Boolean(importMenuAnchor)}
                    onClose={() => setImportMenuAnchor(null)}
                  >
                    <MenuItem onClick={() => openWizard(true)}>Подписанный договор</MenuItem>
                    <MenuItem onClick={() => openWizard(true, 'addendum')}>Подписанное доп. соглашение</MenuItem>
                  </Menu>
                </Stack>
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
        <ContractRegistryTable
          contracts={filteredRegistryContracts}
          contractSection={contractSection}
          selectedContractId={selectedContractId}
          onOpenContract={(contractId) => { void openSheetModal(contractId); }}
        />
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
            <ContractApprovalSheet
              sheet={sheet}
              actionSlot={(
                <ContractApprovalActionSection
                  activeStep={activeMyApprovalStep}
                  approvalDecision={approvalDecision}
                  setApprovalDecision={setApprovalDecision}
                  approvalComment={approvalComment}
                  setApprovalComment={setApprovalComment}
                  approvalDecisionBusy={approvalDecisionBusy}
                  currentUserId={currentUser?.id}
                  currentUserRole={currentUser?.role}
                  sheet={sheet}
                  printPackageBusy={printPackageBusy}
                  onPrintDocumentPackage={() => { void printDocumentPackage(); }}
                  onSubmitDecision={() => { void submitMyApprovalDecision(); }}
                  renderStepFiles={renderStepFiles}
                />
              )}
              renderStepFiles={renderStepFiles}
              onOpenAttachmentPreview={onOpenAttachmentPreview}
            />
          )}

        </Paper>
      )}

      {contractSection === 'inbox' && isSecurity && tab === 2 && (
        <SecurityContractInboxTable
          items={filteredSecurityInbox}
          totalItems={securityInbox.length}
          onOpenItem={(item) => { void openSecurityCard(item); }}
        />
      )}

      {contractSection === 'inbox' && isApprovalWorkRole && tab === 3 && (
        <ApprovalContractInboxTable
          items={filteredApprovalInbox}
          totalItems={approvalInbox.length}
          isChiefAccountant={isChiefAccountant}
          onOpenContract={(contractId) => { void openSheetModal(contractId); }}
        />
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
        fullScreen={isMobile}
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
                  <span />{CONTRACT_STATUS_LABELS[securityCardSheet.contract.status]}
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
              <ContractCardDetails
                details={[
                  { label: 'Предмет договора', value: securityCardItem.subject || '—', wide: true },
                  { label: 'Тип', value: formatContractTypeLabel(securityCardItem.contractType, securityCardItem.incomeSubtype) },
                  { label: 'Дата договора', value: securityCardItem.contractDate || '—' },
                  { label: 'ИНН', value: securityCardItem.counterpartyInn || '—' },
                  { label: 'Инициатор', value: securityCardItem.initiatorName },
                ]}
              />

              <Box className="contract-card-section contract-document-files">
                <Typography variant="body2" className="contract-card-section-title">Документы договора</Typography>
                <ContractFileList
                  files={securityCardItem.attachments}
                  emptyText="Файлы договора не приложены."
                  onOpenFile={(file) => onOpenAttachmentPreview(file.id, file.originalName)}
                />
              </Box>

              <SecurityDecisionEditor
                item={securityCardItem}
                form={securityCardForm}
                onChange={(form) => setSecurityVisa((prev) => ({
                  ...prev,
                  [securityCardItem.contractId]: form,
                }))}
                onSubmit={() => onSecurityVisa(securityCardItem)}
              />

              {securityCardSheet && (
                <ContractProcessTimeline
                  mainSteps={mainApprovalSteps}
                  secretaryStep={secretaryApprovalStep?.assignedAt ? secretaryApprovalStep : null}
                  contractId={securityCardItem.contractId}
                  completedMainSteps={completedMainApprovalSteps}
                  renderProcessStep={renderProcessStep}
                />
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions className="contract-card-actions">
          <Button onClick={closeSecurityCard}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <PreviewDialog
        open={previewOpen}
        fileName={previewFileName}
        previewUrl={previewUrl}
        mimeType={previewMimeType}
        attachmentId={previewAttachmentId}
        loading={previewLoading}
        error={previewError}
        onClose={closePreview}
        onDownloadOriginal={() => {
          if (!previewAttachmentId) return;
          void (async () => {
            const response = await downloadContractAttachment(previewAttachmentId);
            downloadBlob(response.data as Blob, previewFileName || 'contract-file');
          })();
        }}
      />

      <Dialog
        open={sheetModalOpen}
        onClose={closeSheetModal}
        fullScreen={isMobile}
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
                <span />{CONTRACT_STATUS_LABELS[sheet.contract.status]}
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
              <ContractCardDetails
                details={[
                  { label: 'Предмет договора', value: sheet.contract.subject || '—', wide: true },
                  { label: 'Тип', value: formatContractTypeLabel(sheet.contract.contractType, sheet.contract.incomeSubtype) },
                  { label: 'Дата договора', value: sheet.contract.contractDate || '—' },
                  { label: 'ИНН', value: sheet.contract.counterpartyInn || '—' },
                  { label: 'Инициатор', value: approvalCardItem?.initiatorName || sheet.contract.initiator?.fullName || '—' },
                ]}
              />

              <Box className="contract-card-section contract-document-files">
                <Typography variant="body2" className="contract-card-section-title">Документы договора</Typography>
                <ContractFileList
                  files={sheet.contract.attachments}
                  emptyText="Файлы договора не приложены."
                  onOpenFile={(file) => onOpenAttachmentPreview(file.id, file.originalName)}
                />
              </Box>

              <ContractApprovalActionSection
                activeStep={activeMyApprovalStep}
                approvalDecision={approvalDecision}
                setApprovalDecision={setApprovalDecision}
                approvalComment={approvalComment}
                setApprovalComment={setApprovalComment}
                approvalDecisionBusy={approvalDecisionBusy}
                currentUserId={currentUser?.id}
                currentUserRole={currentUser?.role}
                sheet={sheet}
                printPackageBusy={printPackageBusy}
                onPrintDocumentPackage={() => { void printDocumentPackage(); }}
                onSubmitDecision={() => { void submitMyApprovalDecision(); }}
                renderStepFiles={renderStepFiles}
              />

              <ContractProcessTimeline
                mainSteps={approvalCardMainSteps}
                secretaryStep={approvalCardSecretaryStep?.assignedAt ? approvalCardSecretaryStep : null}
                contractId={sheet.contract.id}
                completedMainSteps={approvalCardCompletedCount}
                renderProcessStep={renderProcessStep}
              />
              <ContractPreviousRevisions
                sheet={sheet}
                onOpenFile={onOpenAttachmentPreview}
                renderProcessStep={renderProcessStep}
              />
            </Stack>
          )}
          {!sheetModalLoading && sheet && !isApprovalWorkRole && (
            <ContractApprovalSheet
              sheet={sheet}
              actionSlot={(
                <ContractApprovalActionSection
                  activeStep={activeMyApprovalStep}
                  approvalDecision={approvalDecision}
                  setApprovalDecision={setApprovalDecision}
                  approvalComment={approvalComment}
                  setApprovalComment={setApprovalComment}
                  approvalDecisionBusy={approvalDecisionBusy}
                  currentUserId={currentUser?.id}
                  currentUserRole={currentUser?.role}
                  sheet={sheet}
                  printPackageBusy={printPackageBusy}
                  onPrintDocumentPackage={() => { void printDocumentPackage(); }}
                  onSubmitDecision={() => { void submitMyApprovalDecision(); }}
                  renderStepFiles={renderStepFiles}
                />
              )}
              footerSlot={(
                <ContractPreviousRevisions
                  sheet={sheet}
                  onOpenFile={onOpenAttachmentPreview}
                  renderProcessStep={renderProcessStep}
                />
              )}
              renderStepFiles={renderStepFiles}
              onOpenAttachmentPreview={onOpenAttachmentPreview}
            />
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

      <HistoryDialog
        open={historyOpen}
        contractNumber={sheet?.contract.contractNumber || ''}
        loading={historyLoading}
        events={decisionHistory}
        onClose={() => setHistoryOpen(false)}
      />

      <DeleteDraftDialog
        target={draftDeleteTarget}
        deleting={draftDeleting}
        onClose={() => setDraftDeleteTarget(null)}
        onConfirm={() => { void removeDraft(); }}
      />

      <RevisionDialog
        target={revisionTarget}
        preparing={revisionPreparing}
        onClose={() => setRevisionTarget(null)}
        onConfirm={() => { void beginNewRevision(); }}
      />

      <DeleteAttachmentDialog
        target={attachmentDeleteTarget}
        deleting={attachmentDeleting}
        onClose={() => setAttachmentDeleteTarget(null)}
        onConfirm={() => { void removeAttachment(); }}
      />

      <ContractWizard
        open={wizardOpen}
        step={wizardStep}
        wizard={wizard}
        setWizard={setWizard}
        prefill={wizardPrefill}
        checking={wizardChecking}
        submitting={wizardSubmitting}
        innResolving={wizardInnResolving}
        duplicates={wizardDuplicates}
        existingFiles={wizardExistingFiles}
        files={wizardFiles}
        parentContracts={masterContractOptions}
        isInnValidLength={isWizardInnValidLength}
        isInnInvalidLength={isWizardInnInvalidLength}
        requiresAttachmentStep={requiresAttachmentStep()}
        importSigned={wizardImportSigned}
        onClose={closeWizard}
        onInnBlur={() => { void onWizardInnBlur(); }}
        onCheck={() => {
          if (wizard.documentKind === 'addendum') {
            setWizardStep(5);
            return;
          }
          setWizardStep(4);
          void runWizardChecks();
        }}
        onContinueFromDuplicates={() => setWizardStep(5)}
        onBack={prevWizardStep}
        onGoToFiles={() => setWizardStep(6)}
        onSubmit={() => { void proceedFromWizard(); }}
        onOpenDuplicate={(contractId) => {
          setResumeWizardAfterSheet(true);
          setWizardOpen(false);
          void openSheetModal(contractId);
        }}
        onAppendFiles={appendWizardFiles}
        onRemoveFile={removeWizardFile}
      />
    </Box>
  );
}
