import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import {
  createContract,
  decideContractApprovalStep,
  getContractApprovalSheet,
  getContracts,
  getMasterContracts,
  getUsersDirectory,
  startContractApproval,
} from '../services/api';
import '../styles/contract-approval.css';

type ContractRecord = {
  id: string;
  contractNumber: string;
  contractType: 'expense' | 'income';
  incomeSubtype: 'standard' | 'with_psr' | null;
  counterpartyName: string;
  counterpartyShortName: string | null;
  ownershipForm: string | null;
  counterpartyInn: string;
  templateKind: 'typical' | 'non_typical';
  subject: string | null;
  contractDate: string | null;
  psrFlag: boolean;
  signingMethod: 'edo' | 'post';
  status: 'draft' | 'in_approval' | 'rework' | 'approved' | 'rejected';
  documentKind: 'master' | 'addendum';
  parentContractId: string | null;
  parentContractNumber: string | null;
  assignedGeneralDirectorId: string | null;
  assignedGeneralDirector: { id: string; fullName: string } | null;
  initiator: { id: string; fullName: string; role: string } | null;
};

type MasterContract = {
  id: string;
  contractNumber: string;
  counterpartyName: string;
  contractType: 'expense' | 'income';
  subject: string | null;
};

type UserDirectory = {
  id: string;
  fullName: string;
  role: string;
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
  decision: 'approve' | 'rework' | 'reject' | null;
  comment: string | null;
};

type ApprovalSheet = {
  contract: {
    id: string;
    contractNumber: string;
    contractType: 'expense' | 'income';
    incomeSubtype: 'standard' | 'with_psr' | null;
    templateKind: 'typical' | 'non_typical';
    counterpartyName: string;
    counterpartyShortName: string | null;
    ownershipForm: string | null;
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

const STATUS_LABELS: Record<ContractRecord['status'], string> = {
  draft: 'Черновик',
  in_approval: 'На согласовании',
  rework: 'На доработке',
  approved: 'Согласован',
  rejected: 'Отклонен',
};

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

export default function ContractApprovalPage() {
  const [tab, setTab] = useState(0);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [masters, setMasters] = useState<MasterContract[]>([]);
  const [directors, setDirectors] = useState<UserDirectory[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [sheet, setSheet] = useState<ApprovalSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [decisionForm, setDecisionForm] = useState({
    stepId: '',
    decision: 'approve' as 'approve' | 'rework' | 'reject',
    comment: '',
    acceptedAt: '',
    signedAt: '',
  });

  const [form, setForm] = useState({
    contractNumber: '',
    contractType: 'expense' as 'expense' | 'income',
    incomeSubtype: 'standard' as 'standard' | 'with_psr',
    counterpartyName: '',
    counterpartyShortName: '',
    ownershipForm: '',
    counterpartyInn: '',
    templateKind: 'typical' as 'typical' | 'non_typical',
    subject: '',
    contractDate: '',
    psrFlag: false,
    signingMethod: 'post' as 'edo' | 'post',
    assignedGeneralDirectorId: '',
    documentKind: 'master' as 'master' | 'addendum',
    parentContractId: '',
  });

  const canSubmit = useMemo(() => {
    if (!form.contractNumber.trim()) return false;
    if (!form.counterpartyName.trim()) return false;
    if (!form.subject.trim()) return false;
    if (!form.contractDate) return false;
    if (!/^(\d{10}|\d{12})$/.test(form.counterpartyInn.trim())) return false;
    if (!form.assignedGeneralDirectorId) return false;
    if (form.documentKind === 'addendum' && !form.parentContractId) return false;
    if (form.contractType === 'income' && !form.incomeSubtype) return false;
    return true;
  }, [form]);

  const loadRegistry = async () => {
    setLoading(true);
    setError(null);
    try {
      const [contractsRes, mastersRes, usersRes] = await Promise.all([
        getContracts(),
        getMasterContracts(),
        getUsersDirectory(),
      ]);
      setContracts(Array.isArray(contractsRes.data) ? contractsRes.data : []);
      setMasters(Array.isArray(mastersRes.data) ? mastersRes.data : []);
      const allUsers = Array.isArray(usersRes.data) ? usersRes.data : [];
      setDirectors(allUsers.filter((u: UserDirectory) => u.role === 'general_director' || u.role === 'director'));
      if (!selectedContractId && Array.isArray(contractsRes.data) && contractsRes.data.length > 0) {
        setSelectedContractId(contractsRes.data[0].id);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить договоры');
    } finally {
      setLoading(false);
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
      setDecisionForm((prev) => ({ ...prev, stepId: response.data.currentStepId ?? '' }));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить лист согласования');
    }
  };

  useEffect(() => {
    loadRegistry();
  }, []);

  useEffect(() => {
    loadSheet(selectedContractId);
  }, [selectedContractId]);

  const onCreate = async () => {
    if (!canSubmit) return;
    setError(null);
    setSuccess(null);
    try {
      await createContract({
        contractNumber: form.contractNumber.trim(),
        contractType: form.contractType,
        incomeSubtype: form.contractType === 'income' ? form.incomeSubtype : null,
        counterpartyName: form.counterpartyName.trim(),
        counterpartyShortName: form.counterpartyShortName.trim() || null,
        ownershipForm: form.ownershipForm.trim() || null,
        counterpartyInn: form.counterpartyInn.trim(),
        templateKind: form.templateKind,
        subject: form.subject.trim(),
        contractDate: form.contractDate,
        psrFlag: form.contractType === 'income' && form.incomeSubtype === 'with_psr' ? true : form.psrFlag,
        signingMethod: form.signingMethod,
        assignedGeneralDirectorId: form.assignedGeneralDirectorId,
        documentKind: form.documentKind,
        parentContractId: form.documentKind === 'addendum' ? form.parentContractId : null,
      });

      setSuccess('Договор создан');
      await loadRegistry();
      setForm((prev) => ({
        ...prev,
        contractNumber: '',
        counterpartyName: '',
        counterpartyShortName: '',
        ownershipForm: '',
        counterpartyInn: '',
        subject: '',
        contractDate: '',
        documentKind: 'master',
        parentContractId: '',
      }));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось создать договор');
    }
  };

  const onStartApproval = async () => {
    if (!selectedContractId) return;
    setError(null);
    setSuccess(null);
    try {
      await startContractApproval(selectedContractId);
      setSuccess('Маршрут согласования запущен');
      await loadRegistry();
      await loadSheet(selectedContractId);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось запустить согласование');
    }
  };

  const onDecision = async () => {
    if (!selectedContractId || !decisionForm.stepId) return;
    setError(null);
    setSuccess(null);
    try {
      await decideContractApprovalStep(selectedContractId, decisionForm.stepId, {
        decision: decisionForm.decision,
        comment: decisionForm.comment || null,
        acceptedAt: decisionForm.acceptedAt ? new Date(decisionForm.acceptedAt).toISOString() : null,
        signedAt: decisionForm.signedAt ? new Date(decisionForm.signedAt).toISOString() : null,
      });
      setSuccess('Решение по этапу сохранено');
      setDecisionForm((prev) => ({ ...prev, comment: '', acceptedAt: '', signedAt: '' }));
      await loadRegistry();
      await loadSheet(selectedContractId);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось сохранить решение');
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2 }}>
      <Paper sx={{ p: 1 }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab label="Реестр" />
          <Tab label="Лист согласования" />
        </Tabs>
      </Paper>

      {tab === 0 && (
        <>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Новый договор</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
              <TextField label="№ Договора" fullWidth value={form.contractNumber} onChange={(e) => setForm({ ...form, contractNumber: e.target.value })} />
              <FormControl fullWidth>
                <InputLabel>Тип договора</InputLabel>
                <Select label="Тип договора" value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value as 'expense' | 'income' })}>
                  <MenuItem value="expense">Расходный</MenuItem>
                  <MenuItem value="income">Доходный</MenuItem>
                </Select>
              </FormControl>
              {form.contractType === 'income' && (
                <FormControl fullWidth>
                  <InputLabel>Подтип доходного</InputLabel>
                  <Select label="Подтип доходного" value={form.incomeSubtype} onChange={(e) => setForm({ ...form, incomeSubtype: e.target.value as 'standard' | 'with_psr' })}>
                    <MenuItem value="standard">Стандартный</MenuItem>
                    <MenuItem value="with_psr">С ПСР</MenuItem>
                  </Select>
                </FormControl>
              )}
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
              <TextField label="Наименование контрагента" fullWidth value={form.counterpartyName} onChange={(e) => setForm({ ...form, counterpartyName: e.target.value })} />
              <TextField label="Краткое наименование" fullWidth value={form.counterpartyShortName} onChange={(e) => setForm({ ...form, counterpartyShortName: e.target.value })} />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
              <TextField label="Форма собственности" fullWidth value={form.ownershipForm} onChange={(e) => setForm({ ...form, ownershipForm: e.target.value })} />
              <TextField label="ИНН" fullWidth value={form.counterpartyInn} onChange={(e) => setForm({ ...form, counterpartyInn: e.target.value.replace(/\D/g, '').slice(0, 12) })} helperText="10 или 12 цифр" />
              <TextField label="Предмет/номер договора" fullWidth value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
              <TextField label="Дата договора" type="date" fullWidth value={form.contractDate} onChange={(e) => setForm({ ...form, contractDate: e.target.value })} InputLabelProps={{ shrink: true }} />
              <FormControl fullWidth>
                <InputLabel>Типовой/нетиповой</InputLabel>
                <Select label="Типовой/нетиповой" value={form.templateKind} onChange={(e) => setForm({ ...form, templateKind: e.target.value as 'typical' | 'non_typical' })}>
                  <MenuItem value="typical">Типовой</MenuItem>
                  <MenuItem value="non_typical">Нетиповой</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Способ подписания</InputLabel>
                <Select label="Способ подписания" value={form.signingMethod} onChange={(e) => setForm({ ...form, signingMethod: e.target.value as 'edo' | 'post' })}>
                  <MenuItem value="edo">ЭДО</MenuItem>
                  <MenuItem value="post">Почта</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Вид документа</InputLabel>
                <Select label="Вид документа" value={form.documentKind} onChange={(e) => setForm({ ...form, documentKind: e.target.value as 'master' | 'addendum', parentContractId: '' })}>
                  <MenuItem value="master">Договор</MenuItem>
                  <MenuItem value="addendum">Доп. соглашение</MenuItem>
                </Select>
              </FormControl>
              {form.documentKind === 'addendum' && (
                <FormControl fullWidth>
                  <InputLabel>Базовый договор</InputLabel>
                  <Select label="Базовый договор" value={form.parentContractId} onChange={(e) => setForm({ ...form, parentContractId: e.target.value })}>
                    {masters.map((master) => (
                      <MenuItem key={master.id} value={master.id}>{master.contractNumber} - {master.counterpartyName}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <FormControl fullWidth>
                <InputLabel>Назначенный ГД</InputLabel>
                <Select label="Назначенный ГД" value={form.assignedGeneralDirectorId} onChange={(e) => setForm({ ...form, assignedGeneralDirectorId: e.target.value })}>
                  {directors.map((director) => (
                    <MenuItem key={director.id} value={director.id}>{director.fullName}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={onCreate} disabled={!canSubmit || loading}>Создать</Button>
              <Button variant="outlined" onClick={loadRegistry} disabled={loading}>Обновить</Button>
            </Stack>
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Реестр договоров</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>№</TableCell>
                    <TableCell>Тип</TableCell>
                    <TableCell>Подтип</TableCell>
                    <TableCell>Контрагент</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell>ГД</TableCell>
                    <TableCell>Лист</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {contracts.map((row) => (
                    <TableRow key={row.id} hover selected={selectedContractId === row.id}>
                      <TableCell>{row.contractNumber}</TableCell>
                      <TableCell>{row.contractType === 'expense' ? 'Расходный' : 'Доходный'}</TableCell>
                      <TableCell>{row.incomeSubtype === 'with_psr' ? 'С ПСР' : row.incomeSubtype === 'standard' ? 'Стандартный' : '—'}</TableCell>
                      <TableCell>{row.counterpartyName}</TableCell>
                      <TableCell><Chip size="small" label={STATUS_LABELS[row.status]} /></TableCell>
                      <TableCell>{row.assignedGeneralDirector?.fullName ?? '—'}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => { setSelectedContractId(row.id); setTab(1); }}>Открыть</Button>
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
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Договор</InputLabel>
              <Select label="Договор" value={selectedContractId} onChange={(e) => setSelectedContractId(e.target.value)}>
                {contracts.map((contract) => (
                  <MenuItem key={contract.id} value={contract.id}>{contract.contractNumber} - {contract.counterpartyName}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="contained" onClick={onStartApproval} disabled={!selectedContractId}>Запустить согласование</Button>
            <Button variant="outlined" onClick={() => window.print()} disabled={!sheet}>Печать</Button>
          </Stack>

          {sheet && (
            <Box className="approval-sheet-print">
              <Typography variant="h6" align="center" sx={{ mb: 2 }}>Лист согласования ООО «Симпл Вэй»</Typography>
              <TableContainer sx={{ mb: 2 }}>
                <Table size="small" className="approval-sheet-table">
                  <TableBody>
                    <TableRow><TableCell className="label">Контрагент</TableCell><TableCell>{sheet.contract.counterpartyName}</TableCell></TableRow>
                    <TableRow><TableCell className="label">Тип договора (типовой/не типовой)</TableCell><TableCell>{sheet.contract.templateKind === 'typical' ? 'типовой' : 'не типовой'}</TableCell></TableRow>
                    <TableRow><TableCell className="label">Предмет/номера договора</TableCell><TableCell>{sheet.contract.subject || '—'}</TableCell></TableRow>
                    <TableRow><TableCell className="label">ПСР (Протокол разногласий)</TableCell><TableCell>{sheet.contract.psrFlag ? 'ПСР' : '—'}</TableCell></TableRow>
                    <TableRow><TableCell className="label">Статья бюджета (доходный/расходный)</TableCell><TableCell>{sheet.contract.contractType === 'expense' ? 'Расходный' : 'Доходный'}</TableCell></TableRow>
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
                        <TableCell>{formatDateTime(step.acceptedAt)}</TableCell>
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

          {sheet && sheet.currentStepId && sheet.contract.status === 'in_approval' && (
            <Paper variant="outlined" sx={{ p: 2, mt: 2 }} className="no-print">
              <Typography variant="subtitle1" sx={{ mb: 1 }}>Решение по текущему этапу</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Действие</InputLabel>
                  <Select
                    label="Действие"
                    value={decisionForm.decision}
                    onChange={(e) => setDecisionForm({ ...decisionForm, decision: e.target.value as 'approve' | 'rework' | 'reject' })}
                  >
                    <MenuItem value="approve">Согласовать</MenuItem>
                    <MenuItem value="rework">Вернуть на доработку</MenuItem>
                    <MenuItem value="reject">Отклонить</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Дата принятия"
                  type="datetime-local"
                  fullWidth
                  value={decisionForm.acceptedAt}
                  onChange={(e) => setDecisionForm({ ...decisionForm, acceptedAt: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Дата визирования"
                  type="datetime-local"
                  fullWidth
                  value={decisionForm.signedAt}
                  onChange={(e) => setDecisionForm({ ...decisionForm, signedAt: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
              <TextField
                label="Комментарий"
                fullWidth
                multiline
                minRows={2}
                value={decisionForm.comment}
                onChange={(e) => setDecisionForm({ ...decisionForm, comment: e.target.value })}
                sx={{ mb: 2 }}
              />
              <Button variant="contained" onClick={onDecision}>Сохранить решение</Button>
            </Paper>
          )}
        </Paper>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
    </Box>
  );
}
