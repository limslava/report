import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import { createContract, getContracts, getMasterContracts } from '../services/api';

type ContractRecord = {
  id: string;
  contractNumber: string;
  contractType: 'expense' | 'income';
  counterpartyName: string;
  counterpartyShortName: string | null;
  ownershipForm: string | null;
  counterpartyInn: string;
  documentKind: 'master' | 'addendum';
  parentContractId: string | null;
  parentContractNumber: string | null;
  initiator: { id: string; fullName: string; role: string } | null;
  createdAt: string;
};

type MasterContract = {
  id: string;
  contractNumber: string;
  counterpartyName: string;
  contractType: 'expense' | 'income';
};

export default function ContractApprovalPage() {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [masters, setMasters] = useState<MasterContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    contractNumber: '',
    contractType: 'expense' as 'expense' | 'income',
    counterpartyName: '',
    counterpartyShortName: '',
    ownershipForm: '',
    counterpartyInn: '',
    documentKind: 'master' as 'master' | 'addendum',
    parentContractId: '',
  });

  const canSubmit = useMemo(() => {
    if (!form.contractNumber.trim()) return false;
    if (!form.counterpartyName.trim()) return false;
    if (!/^(\d{10}|\d{12})$/.test(form.counterpartyInn.trim())) return false;
    if (form.documentKind === 'addendum' && !form.parentContractId) return false;
    return true;
  }, [form]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [contractsRes, mastersRes] = await Promise.all([getContracts(), getMasterContracts()]);
      setContracts(Array.isArray(contractsRes.data) ? contractsRes.data : []);
      setMasters(Array.isArray(mastersRes.data) ? mastersRes.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить договоры');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSuccess(null);
    try {
      await createContract({
        contractNumber: form.contractNumber.trim(),
        contractType: form.contractType,
        counterpartyName: form.counterpartyName.trim(),
        counterpartyShortName: form.counterpartyShortName.trim() || null,
        ownershipForm: form.ownershipForm.trim() || null,
        counterpartyInn: form.counterpartyInn.trim(),
        documentKind: form.documentKind,
        parentContractId: form.documentKind === 'addendum' ? form.parentContractId : null,
      });

      setForm((prev) => ({
        ...prev,
        contractNumber: '',
        counterpartyName: '',
        counterpartyShortName: '',
        ownershipForm: '',
        counterpartyInn: '',
        documentKind: 'master',
        parentContractId: '',
      }));
      setSuccess('Договор создан');
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось создать договор');
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2 }}>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Новый договор
        </Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="№ Договора"
            fullWidth
            value={form.contractNumber}
            onChange={(e) => setForm({ ...form, contractNumber: e.target.value })}
          />
          <FormControl fullWidth>
            <InputLabel>Тип договора</InputLabel>
            <Select
              label="Тип договора"
              value={form.contractType}
              onChange={(e) => setForm({ ...form, contractType: e.target.value as 'expense' | 'income' })}
            >
              <MenuItem value="expense">Расходный</MenuItem>
              <MenuItem value="income">Доходный</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Вид документа</InputLabel>
            <Select
              label="Вид документа"
              value={form.documentKind}
              onChange={(e) => setForm({ ...form, documentKind: e.target.value as 'master' | 'addendum', parentContractId: '' })}
            >
              <MenuItem value="master">Договор</MenuItem>
              <MenuItem value="addendum">Доп. соглашение</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {form.documentKind === 'addendum' && (
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Базовый договор</InputLabel>
            <Select
              label="Базовый договор"
              value={form.parentContractId}
              onChange={(e) => setForm({ ...form, parentContractId: e.target.value })}
            >
              {masters.map((master) => (
                <MenuItem key={master.id} value={master.id}>
                  {master.contractNumber} - {master.counterpartyName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="Наименование контрагента"
            fullWidth
            value={form.counterpartyName}
            onChange={(e) => setForm({ ...form, counterpartyName: e.target.value })}
          />
          <TextField
            label="Краткое наименование"
            fullWidth
            value={form.counterpartyShortName}
            onChange={(e) => setForm({ ...form, counterpartyShortName: e.target.value })}
          />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="Форма собственности"
            fullWidth
            value={form.ownershipForm}
            onChange={(e) => setForm({ ...form, ownershipForm: e.target.value })}
          />
          <TextField
            label="ИНН"
            fullWidth
            value={form.counterpartyInn}
            onChange={(e) => setForm({ ...form, counterpartyInn: e.target.value.replace(/\D/g, '').slice(0, 12) })}
            helperText="10 или 12 цифр"
          />
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={onSubmit} disabled={!canSubmit || loading}>
            Создать
          </Button>
          <Button variant="outlined" onClick={loadData} disabled={loading}>
            Обновить
          </Button>
        </Stack>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert>}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Реестр договоров
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>№</TableCell>
                <TableCell>Тип</TableCell>
                <TableCell>Вид</TableCell>
                <TableCell>Контрагент</TableCell>
                <TableCell>ИНН</TableCell>
                <TableCell>Инициатор</TableCell>
                <TableCell>Базовый договор</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {contracts.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.contractNumber}</TableCell>
                  <TableCell>{row.contractType === 'expense' ? 'Расходный' : 'Доходный'}</TableCell>
                  <TableCell>{row.documentKind === 'master' ? 'Договор' : 'Доп. соглашение'}</TableCell>
                  <TableCell>{row.counterpartyName}</TableCell>
                  <TableCell>{row.counterpartyInn}</TableCell>
                  <TableCell>{row.initiator?.fullName ?? '—'}</TableCell>
                  <TableCell>{row.parentContractNumber ?? '—'}</TableCell>
                </TableRow>
              ))}
              {!contracts.length && (
                <TableRow>
                  <TableCell colSpan={7}>{loading ? 'Загрузка...' : 'Пока нет договоров'}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
