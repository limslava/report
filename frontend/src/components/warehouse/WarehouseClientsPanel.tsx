import { Search } from '@mui/icons-material';
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
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

export interface WarehouseClientsPanelHandle {
  openCreate: () => void;
}

const emptyForm = (): WarehouseClientPayload => ({
  inn: '',
  nameFull: '',
  nameShort: '',
  contractNumber: '',
  contractDate: '',
  contractEndDate: '',
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

const WarehouseClientsPanel = forwardRef<WarehouseClientsPanelHandle, WarehouseClientsPanelProps>(function WarehouseClientsPanel({
  onClientsChanged,
}, ref) {
  const [clients, setClients] = useState<WarehouseClient[]>([]);
  const [available, setAvailable] = useState<WarehouseCounterparty[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseClient | null>(null);
  const [selectedCounterparty, setSelectedCounterparty] = useState<WarehouseCounterparty | null>(null);
  const [form, setForm] = useState<WarehouseClientPayload>(emptyForm);
  const [query, setQuery] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'active' | 'inactive'>('all');
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

  useImperativeHandle(ref, () => ({
    openCreate: () => {
      void openCreate();
    },
  }));

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

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return clients.filter((client) => {
      if (activityFilter === 'active' && !client.isActive) return false;
      if (activityFilter === 'inactive' && client.isActive) return false;
      if (!normalizedQuery) return true;

      return [
        client.nameFull,
        client.nameShort,
        client.inn,
        client.contractNumber,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [activityFilter, clients, query]);

  const contractStatusText = (client: WarehouseClient) => {
    if (client.contractStatus === 'expired') return 'Истёк';
    if (client.contractStatus === 'expiring') return `Истекает через ${client.contractDaysRemaining} дн.`;
    if (client.contractStatus === 'active') return 'Действует';
    return 'Срок не указан';
  };

  return (
    <Stack spacing={0.5}>
      <Paper variant="outlined" sx={{ px: 0.75, py: 0.75 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }}>
          <TextField
            label="Поиск"
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Организация, ИНН, договор"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ flex: 1 }}
          />
          <Select
            size="small"
            value={activityFilter}
            onChange={(event) => setActivityFilter(event.target.value as 'all' | 'active' | 'inactive')}
            sx={{ width: { xs: '100%', md: 180 } }}
          >
            <MenuItem value="all">Все клиенты</MenuItem>
            <MenuItem value="active">Активные</MenuItem>
            <MenuItem value="inactive">Отключённые</MenuItem>
          </Select>
        </Stack>
      </Paper>

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
        <Table
          size="small"
          sx={{
            minWidth: 1120,
            tableLayout: 'fixed',
            '& th, & td': {
              borderLeft: '1px solid #d0d7de',
              borderColor: '#d0d7de',
              fontSize: '10px',
              lineHeight: 1.25,
              py: '6px',
              px: '8px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
            '& th': {
              bgcolor: '#f3f6fb',
              fontWeight: 700,
              color: '#2f3b52',
            },
            '& th:first-of-type, & td:first-of-type': {
              borderLeft: 0,
            },
            '& tbody tr:nth-of-type(odd) td': {
              backgroundColor: '#f8fbff',
            },
            '& tbody tr:hover td': {
              backgroundColor: '#eef5ff',
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 260 }}>Организация</TableCell>
              <TableCell sx={{ width: 100 }}>ИНН</TableCell>
              <TableCell sx={{ width: 130 }}>№ договора</TableCell>
              <TableCell sx={{ width: 110 }}>Дата договора</TableCell>
              <TableCell sx={{ width: 130 }}>Дата окончания</TableCell>
              <TableCell sx={{ width: 150 }}>Срок договора</TableCell>
              <TableCell sx={{ width: 90 }}>Статус</TableCell>
              <TableCell>Комментарий</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredClients.map((client) => (
              <TableRow
                key={client.id}
                hover
                title="Двойной клик откроет карточку клиента"
                onDoubleClick={() => openEdit(client)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell sx={{ fontWeight: 600 }}>{client.nameShort || client.nameFull}</TableCell>
                <TableCell>{client.inn}</TableCell>
                <TableCell>{client.contractNumber || '—'}</TableCell>
                <TableCell>{client.contractDate || '—'}</TableCell>
                <TableCell>{client.contractEndDate || '—'}</TableCell>
                <TableCell>{contractStatusText(client)}</TableCell>
                <TableCell>{client.isActive ? 'Активен' : 'Отключён'}</TableCell>
                <TableCell>{client.notes || '—'}</TableCell>
              </TableRow>
            ))}
            {filteredClients.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                  Клиенты склада не найдены
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
});

export default WarehouseClientsPanel;
