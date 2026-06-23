import {
  Download,
  Lock,
  Refresh,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  closeWarehouseBilling,
  exportWarehouseBilling,
  getWarehouseBilling,
  getWarehouseClients,
  WarehouseBillingReport,
  WarehouseClient,
  WarehouseVehicleType,
} from '../../services/warehouse.api';

const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' });

const todayVladivostok = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Vladivostok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const monthPeriod = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return { from, to: `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}` };
};

const messageFromError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as {
      response?: { data?: { message?: string; details?: string[]; errors?: Array<{ msg?: string }> } };
    }).response;
    return response?.data?.message || response?.data?.errors?.[0]?.msg || 'Не удалось выполнить расчёт.';
  }
  return error instanceof Error ? error.message : 'Не удалось выполнить расчёт.';
};

interface Props {
  canClose: boolean;
  ownCounterpartyOnly?: boolean;
}

export default function WarehouseBillingPanel({ canClose, ownCounterpartyOnly = false }: Props) {
  const initialPeriod = useMemo(monthPeriod, []);
  const [periodFrom, setPeriodFrom] = useState(initialPeriod.from);
  const [periodTo, setPeriodTo] = useState(initialPeriod.to);
  const [counterpartyId, setCounterpartyId] = useState('');
  const [vehicleType, setVehicleType] = useState<WarehouseVehicleType | ''>('');
  const [clients, setClients] = useState<WarehouseClient[]>([]);
  const [report, setReport] = useState<WarehouseBillingReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const canCloseSelectedPeriod = periodTo < todayVladivostok();

  useEffect(() => {
    void getWarehouseClients(false).then((response) => {
      setClients(response.data);
      if (ownCounterpartyOnly && response.data.length === 1) {
        setCounterpartyId(response.data[0].counterpartyId);
      }
    }).catch((loadError) => setError(messageFromError(loadError)));
  }, [ownCounterpartyOnly]);

  const load = useCallback(async () => {
    if (!periodFrom || !periodTo || periodTo < periodFrom) {
      setError('Проверьте даты расчётного периода.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await getWarehouseBilling({
        periodFrom,
        periodTo,
        counterpartyId: counterpartyId || undefined,
        vehicleType,
      });
      setReport(response.data);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setLoading(false);
    }
  }, [counterpartyId, periodFrom, periodTo, vehicleType]);

  useEffect(() => {
    if (!ownCounterpartyOnly || counterpartyId) void load();
  }, [counterpartyId, load, ownCounterpartyOnly]);

  const download = async (format: 'xlsx' | 'pdf') => {
    setError(null);
    try {
      const response = await exportWarehouseBilling(format, {
        periodFrom,
        periodTo,
        counterpartyId: counterpartyId || undefined,
        vehicleType,
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Акт_склад_${periodFrom}_${periodTo}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(messageFromError(downloadError));
    }
  };

  const closePeriod = async () => {
    if (!counterpartyId) return;
    setClosing(true);
    setError(null);
    try {
      const response = await closeWarehouseBilling({ periodFrom, periodTo, counterpartyId });
      setReport(response.data);
      setCloseDialog(false);
      setSuccess('Период закрыт. Начисления и акт зафиксированы.');
    } catch (closeError) {
      setError(messageFromError(closeError));
    } finally {
      setClosing(false);
    }
  };

  const cards = report ? [
    ['ТС', String(report.totals.vehicleCount)],
    ['Суток хранения', String(report.totals.storageDays)],
    ['Хранение', money.format(report.totals.storageAmount)],
    ['Операции и услуги', money.format(report.totals.servicesAmount)],
    ['Итого', money.format(report.totals.totalAmount)],
  ] : [];

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
        <Box>
          <Typography variant="h6">Начисления и акты</Typography>
          <Typography variant="body2" color="text.secondary">
            Хранение рассчитывается по календарным дням с учётом тарифа каждой даты.
          </Typography>
        </Box>
        {report && (
          <Chip
            color={report.status === 'closed' ? 'success' : 'warning'}
            icon={report.status === 'closed' ? <Lock /> : undefined}
            label={report.status === 'closed' ? 'Период закрыт' : 'Предварительный расчёт'}
          />
        )}
      </Stack>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}
      {report?.warnings.map((warning) => <Alert key={warning} severity="warning">{warning}</Alert>)}

      <Card variant="outlined">
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
            <TextField
              type="date"
              label="Период с"
              InputLabelProps={{ shrink: true }}
              value={periodFrom}
              onChange={(event) => setPeriodFrom(event.target.value)}
            />
            <TextField
              type="date"
              label="Период по"
              InputLabelProps={{ shrink: true }}
              value={periodTo}
              onChange={(event) => setPeriodTo(event.target.value)}
            />
            {!ownCounterpartyOnly && (
              <FormControl sx={{ minWidth: 280 }}>
                <InputLabel>Контрагент</InputLabel>
                <Select
                  label="Контрагент"
                  value={counterpartyId}
                  onChange={(event) => setCounterpartyId(event.target.value)}
                >
                  <MenuItem value="">Все контрагенты</MenuItem>
                  {clients.map((client) => (
                    <MenuItem key={client.id} value={client.counterpartyId}>
                      {client.nameShort || client.nameFull}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <FormControl sx={{ minWidth: 180 }}>
              <InputLabel>Тип ТС</InputLabel>
              <Select
                label="Тип ТС"
                value={vehicleType}
                onChange={(event) => setVehicleType(event.target.value as WarehouseVehicleType | '')}
              >
                <MenuItem value="">Все</MenuItem>
                <MenuItem value="passenger">Легковой</MenuItem>
                <MenuItem value="truck">Грузовой</MenuItem>
              </Select>
            </FormControl>
            <Button variant="contained" startIcon={<Refresh />} onClick={() => void load()}>
              Рассчитать
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {loading ? (
        <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>
      ) : report && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 1.5 }}>
            {cards.map(([label, value]) => (
              <Card key={label} variant="outlined">
                <CardContent>
                  <Typography variant="body2" color="text.secondary">{label}</Typography>
                  <Typography variant="h6">{value}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ТС</TableCell>
                  <TableCell>Контрагент</TableCell>
                  <TableCell>Хранение</TableCell>
                      <TableCell>Операции и дополнительные услуги</TableCell>
                  <TableCell align="right">Итого</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.lines.length === 0 && (
                  <TableRow><TableCell colSpan={5} align="center" sx={{ py: 5 }}>Нет начислений за период</TableCell></TableRow>
                )}
                {report.lines.map((line) => (
                  <TableRow key={line.vehicleId} sx={{ verticalAlign: 'top' }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{line.warehouseNumber}</Typography>
                      <Typography variant="caption">{line.vehicleName}</Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {line.vin || line.registrationNumber || 'Без идентификатора'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {line.counterpartyName}
                      <Typography variant="caption" display="block">ИНН {line.counterpartyInn}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {line.storageFrom}–{line.storageTo}: {line.storageDays} сут.
                      </Typography>
                      {line.storageRates.map((rate) => (
                        <Typography key={`${rate.price}-${rate.days}`} variant="caption" display="block" color="text.secondary">
                          {rate.days} × {money.format(rate.price)} = {money.format(rate.amount)}
                        </Typography>
                      ))}
                      <Typography variant="body2" fontWeight={600}>{money.format(line.storageAmount)}</Typography>
                    </TableCell>
                    <TableCell>
                      {line.services.length === 0 ? '—' : line.services.map((service) => (
                        <Typography key={service.id} variant="caption" display="block">
                          {service.name}: {service.quantity} × {money.format(service.unitPrice)} = {money.format(service.amount)}
                        </Typography>
                      ))}
                      {line.services.length > 0 && (
                        <Typography variant="body2" fontWeight={600}>{money.format(line.servicesAmount)}</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight={700}>{money.format(line.totalAmount)}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end" spacing={1}>
            <Button startIcon={<Download />} onClick={() => void download('xlsx')}>Excel</Button>
            <Button
              startIcon={<Download />}
              disabled={!counterpartyId}
              onClick={() => void download('pdf')}
            >
              PDF-акт
            </Button>
            {canClose && report.status !== 'closed' && (
              <Button
                variant="contained"
                color="warning"
                startIcon={<Lock />}
                disabled={!counterpartyId || report.warnings.length > 0 || !canCloseSelectedPeriod}
                onClick={() => setCloseDialog(true)}
              >
                Закрыть период
              </Button>
            )}
          </Stack>
          {canClose && !counterpartyId && report.status !== 'closed' && (
            <Alert severity="info">
              Для формирования PDF-акта и закрытия периода выберите одного контрагента.
              Excel можно выгрузить по всем контрагентам.
            </Alert>
          )}
          {canClose && counterpartyId && !canCloseSelectedPeriod && report.status !== 'closed' && (
            <Alert severity="warning">
              Закрывать можно только завершившийся период. Текущий день и будущие даты должны оставаться открытыми для операций склада.
            </Alert>
          )}
        </>
      )}

      <Dialog open={closeDialog} onClose={() => !closing && setCloseDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Закрыть расчётный период?</DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning">
            После закрытия нельзя добавлять или исправлять услуги с датами внутри периода
            {` ${periodFrom}–${periodTo}`}. Акт будет сохранён как неизменяемый снимок.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseDialog(false)} disabled={closing}>Отмена</Button>
          <Button variant="contained" color="warning" onClick={() => void closePeriod()} disabled={closing}>
            Закрыть период
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
