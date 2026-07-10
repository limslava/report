import { Add, Edit } from '@mui/icons-material';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import {
  createWarehouseClient,
  getAvailableWarehouseCounterparties,
  getWarehouseClients,
  updateWarehouseClient,
  WarehouseClient,
  WarehouseClientPayload,
  WarehouseCounterparty,
} from '../../services/warehouse.api';

interface WarehouseClientsPanelProps {
  onClientsChanged?: () => void;
}

const emptyForm = (): WarehouseClientPayload => ({
  inn: '',
  nameFull: '',
  nameShort: '',
  contractNumber: '',
  contractDate: '',
  contractEndDate: '',
  serviceStartDate: '',
  isActive: true,
  notes: '',
});

const messageFromError = (error: unknown): string => {
  if (
    typeof error === 'object'
    && error !== null
    && 'response' in error
  ) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return error instanceof Error ? error.message : 'Не удалось выполнить операцию.';
};

export default function WarehouseClientsPanel({
  onClientsChanged,
}: WarehouseClientsPanelProps) {
  const [clients, setClients] = useState<WarehouseClient[]>([]);
  const [available, setAvailable] = useState<WarehouseCounterparty[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseClient | null>(null);
  const [selectedCounterparty, setSelectedCounterparty] = useState<WarehouseCounterparty | null>(null);
  const [form, setForm] = useState<WarehouseClientPayload>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    const response = await getWarehouseClients(true);
    setClients(response.data);
  }, []);

  useEffect(() => {
    void loadClients().catch((loadError) => setError(messageFromError(loadError)));
  }, [loadClients]);

  const openCreate = async () => {
    setEditing(null);
    setSelectedCounterparty(null);
    setForm(emptyForm());
    setError(null);
    try {
      const response = await getAvailableWarehouseCounterparties();
      setAvailable(response.data);
    } catch (loadError) {
      setError(messageFromError(loadError));
    }
    setDialogOpen(true);
  };

  const openEdit = (client: WarehouseClient) => {
    setEditing(client);
    setSelectedCounterparty(null);
    setForm({
      inn: client.inn,
      nameFull: client.nameFull,
      nameShort: client.nameShort,
      contractNumber: client.contractNumber,
      contractDate: client.contractDate,
      contractEndDate: client.contractEndDate,
      serviceStartDate: client.serviceStartDate,
      isActive: client.isActive,
      notes: client.notes,
    });
    setError(null);
    setDialogOpen(true);
  };

  const handleCounterpartySelection = (value: WarehouseCounterparty | null) => {
    setSelectedCounterparty(value);
    if (!value) return;
    setForm((current) => ({
      ...current,
      inn: value.inn,
      nameFull: value.nameFull,
      nameShort: value.nameShort,
    }));
  };

  const handleSave = async () => {
    if (!form.inn || !form.nameFull.trim()) {
      setError('Заполните ИНН и полное наименование организации.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateWarehouseClient(editing.id, {
          contractNumber: form.contractNumber,
          contractDate: form.contractDate,
          contractEndDate: form.contractEndDate,
          serviceStartDate: form.serviceStartDate,
          isActive: form.isActive,
          notes: form.notes,
        });
      } else {
        await createWarehouseClient(form);
      }
      setDialogOpen(false);
      await loadClients();
      onClientsChanged?.();
    } catch (saveError) {
      setError(messageFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box />
        <Button variant="contained" startIcon={<Add />} onClick={() => void openCreate()}>
          Добавить клиента
        </Button>
      </Stack>

      {error && !dialogOpen && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {clients.some((client) => client.contractStatus === 'expired') && (
        <Alert severity="error">
          У одного или нескольких активных клиентов истёк договор хранения. Проверьте сроки до следующей приёмки ТС.
        </Alert>
      )}
      {!clients.some((client) => client.contractStatus === 'expired')
        && clients.some((client) => client.contractStatus === 'expiring') && (
          <Alert severity="warning">
            У одного или нескольких клиентов договор хранения закончится в течение 30 дней.
          </Alert>
      )}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Организация</TableCell>
              <TableCell>ИНН</TableCell>
              <TableCell>Договор хранения</TableCell>
              <TableCell>Срок действия</TableCell>
              <TableCell>Начало работы</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id} hover>
                <TableCell>{client.nameShort || client.nameFull}</TableCell>
                <TableCell>{client.inn}</TableCell>
                <TableCell>
                  {client.contractNumber
                    ? `${client.contractNumber}${client.contractDate ? ` от ${client.contractDate}` : ''}`
                    : '—'}
                </TableCell>
                <TableCell>
                  <Stack spacing={0.5} alignItems="flex-start">
                    <Typography variant="body2">{client.contractEndDate || 'Не указан'}</Typography>
                    <Chip
                      size="small"
                      color={
                        client.contractStatus === 'expired'
                          ? 'error'
                          : client.contractStatus === 'expiring'
                            ? 'warning'
                            : client.contractStatus === 'active'
                              ? 'success'
                              : 'default'
                      }
                      label={
                        client.contractStatus === 'expired'
                          ? 'Истёк'
                          : client.contractStatus === 'expiring'
                            ? `Истекает через ${client.contractDaysRemaining} дн.`
                            : client.contractStatus === 'active'
                              ? 'Действует'
                              : 'Срок не указан'
                      }
                    />
                  </Stack>
                </TableCell>
                <TableCell>{client.serviceStartDate || '—'}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={client.isActive ? 'success' : 'default'}
                    label={client.isActive ? 'Активен' : 'Отключён'}
                  />
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Настроить клиента">
                    <IconButton size="small" onClick={() => openEdit(client)}>
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {clients.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                  Клиенты склада ещё не добавлены
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'Настройка клиента склада' : 'Новый клиент склада'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
            {!editing && (
              <Autocomplete
                options={available}
                value={selectedCounterparty}
                onChange={(_event, value) => handleCounterpartySelection(value)}
                getOptionLabel={(option) => `${option.nameShort || option.nameFull} — ${option.inn}`}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Найти в общем справочнике"
                    helperText="Можно выбрать существующую организацию или заполнить реквизиты вручную."
                  />
                )}
              />
            )}
            <TextField
              label="ИНН *"
              value={form.inn}
              disabled={Boolean(editing)}
              onChange={(event) => setForm((current) => ({
                ...current,
                inn: event.target.value.replace(/\D/g, '').slice(0, 12),
              }))}
            />
            <TextField
              label="Полное наименование *"
              value={form.nameFull}
              disabled={Boolean(editing)}
              onChange={(event) => setForm((current) => ({ ...current, nameFull: event.target.value }))}
            />
            <TextField
              label="Краткое наименование"
              value={form.nameShort || ''}
              disabled={Boolean(editing)}
              onChange={(event) => setForm((current) => ({ ...current, nameShort: event.target.value }))}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Номер договора хранения"
                value={form.contractNumber || ''}
                onChange={(event) => setForm((current) => ({ ...current, contractNumber: event.target.value }))}
              />
              <TextField
                fullWidth
                type="date"
                label="Дата договора"
                InputLabelProps={{ shrink: true }}
                value={form.contractDate || ''}
                onChange={(event) => setForm((current) => ({ ...current, contractDate: event.target.value }))}
              />
            </Stack>
            <TextField
              type="date"
              label="Дата окончания договора"
              InputLabelProps={{ shrink: true }}
              value={form.contractEndDate || ''}
              onChange={(event) => setForm((current) => ({ ...current, contractEndDate: event.target.value }))}
              helperText="За 30 дней до этой даты система покажет предупреждение."
            />
            <TextField
              type="date"
              label="Дата начала обслуживания"
              InputLabelProps={{ shrink: true }}
              value={form.serviceStartDate || ''}
              onChange={(event) => setForm((current) => ({ ...current, serviceStartDate: event.target.value }))}
            />
            <TextField
              multiline
              minRows={2}
              label="Комментарий"
              value={form.notes || ''}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
            <FormControlLabel
              control={(
                <Switch
                  checked={form.isActive !== false}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
              )}
              label="Активный клиент склада"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
