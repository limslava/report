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
} from '../../services/warehouse.api';

const plainNumber = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 2,
});

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

type BillingSummaryRow = {
  name: string;
  quantity: number | null;
  unit: string;
  price: string;
  totalWithVat: number;
};

const serviceUnitLabel = (unit: string) => {
  if (unit === 'day') return 'сут./дн';
  if (unit === 'liter') return 'л';
  if (unit === 'wheel') return 'кол.';
  return 'шт.';
};

const compactPrice = (prices: number[]) => {
  const unique = Array.from(new Set(
    prices
      .filter((price) => Number.isFinite(price) && price > 0)
      .map((price) => plainNumber.format(price)),
  ));
  return unique.join('; ');
};

const extractVatAmount = (amountWithVat: number, vatRate: number) => {
  if (vatRate <= 0) return 0;
  return Math.round(((amountWithVat * vatRate) / (100 + vatRate) + Number.EPSILON) * 100) / 100;
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
  const [clients, setClients] = useState<WarehouseClient[]>([]);
  const [report, setReport] = useState<WarehouseBillingReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warningsExpanded, setWarningsExpanded] = useState(false);
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
      });
      setReport(response.data);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setLoading(false);
    }
  }, [counterpartyId, periodFrom, periodTo]);

  useEffect(() => {
    if (ownCounterpartyOnly && counterpartyId) void load();
  }, [counterpartyId, load, ownCounterpartyOnly]);

  const download = async (format: 'xlsx' | 'pdf') => {
    setError(null);
    try {
      const response = await exportWarehouseBilling(format, {
        periodFrom,
        periodTo,
        counterpartyId: counterpartyId || undefined,
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

  const summaryRows = useMemo<BillingSummaryRow[]>(() => {
    if (!report) return [];
    const rows: BillingSummaryRow[] = [];
    if (report.totals.storageDays > 0 || report.totals.storageAmount > 0) {
      rows.push({
        name: 'Хранение',
        quantity: report.totals.storageDays,
        unit: 'сут./дн',
        price: compactPrice(report.lines.flatMap((line) => line.storageRates.map((rate) => rate.price))),
        totalWithVat: report.totals.storageAmount,
      });
    }

    const addAutomaticRow = (prefix: string, name: string) => {
      const services = report.lines.flatMap((line) => line.services.filter((service) => service.id.startsWith(prefix)));
      if (!services.length) return;
      rows.push({
        name,
        quantity: services.reduce((sum, service) => sum + service.quantity, 0),
        unit: 'шт.',
        price: compactPrice(services.map((service) => service.unitPrice)),
        totalWithVat: services.reduce((sum, service) => sum + service.amount, 0),
      });
    };
    addAutomaticRow('automatic:vehicle_acceptance:', 'Прием');
    addAutomaticRow('automatic:vehicle_issue:', 'Выдача');

    const manualGroups = new Map<string, BillingSummaryRow>();
    report.lines.forEach((line) => {
      line.services
        .filter((service) => !service.id.startsWith('automatic:'))
        .forEach((service) => {
          const key = `${service.name}:${service.unit}:${service.unitPrice}`;
          const existing = manualGroups.get(key);
          if (existing) {
            existing.quantity = (existing.quantity ?? 0) + service.quantity;
            existing.totalWithVat += service.amount;
            return;
          }
          manualGroups.set(key, {
            name: service.name,
            quantity: service.quantity,
            unit: serviceUnitLabel(service.unit),
            price: compactPrice([service.unitPrice]),
            totalWithVat: service.amount,
          });
        });
    });
    rows.push(...manualGroups.values());
    return rows;
  }, [report]);

  const vatRate = report?.totals.vatRate ?? 0;
  const summaryTotalWithVat = report?.totals.totalWithVat
    ?? summaryRows.reduce((sum, row) => sum + row.totalWithVat, 0);
  const summaryVatAmount = report?.totals.vatAmount ?? extractVatAmount(summaryTotalWithVat, vatRate);
  const summaryTotalWithoutVat = report?.totals.totalWithoutVat
    ?? Math.round((summaryTotalWithVat - summaryVatAmount + Number.EPSILON) * 100) / 100;

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}
      {report && report.warnings.length > 0 && (
        <Alert
          severity="warning"
          action={(
            <Button color="inherit" size="small" onClick={() => setWarningsExpanded((value) => !value)}>
              {warningsExpanded ? 'Скрыть' : 'Показать'}
            </Button>
          )}
        >
          <Typography variant="body2" fontWeight={600}>
            Есть предупреждения по тарифам: {report.warnings.length}
          </Typography>
          <Typography variant="caption" display="block">
            Период можно просматривать и выгружать, но закрыть его нельзя до настройки недостающих тарифов.
          </Typography>
          {warningsExpanded && (
            <Box
              component="ul"
              sx={{
                mt: 1,
                mb: 0,
                pl: 2.5,
                maxHeight: 220,
                overflow: 'auto',
              }}
            >
              {report.warnings.map((warning) => (
                <Typography component="li" variant="caption" key={warning} sx={{ lineHeight: 1.5 }}>
                  {warning}
                </Typography>
              ))}
            </Box>
          )}
        </Alert>
      )}

      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', lg: 'center' }}
            spacing={2}
          >
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
              <TextField
                size="small"
                type="date"
                label="Период с"
                InputLabelProps={{ shrink: true }}
                value={periodFrom}
                onChange={(event) => {
                  setPeriodFrom(event.target.value);
                  setReport(null);
                }}
                sx={{ width: { xs: '100%', md: 190 } }}
              />
              <TextField
                size="small"
                type="date"
                label="Период по"
                InputLabelProps={{ shrink: true }}
                value={periodTo}
                onChange={(event) => {
                  setPeriodTo(event.target.value);
                  setReport(null);
                }}
                sx={{ width: { xs: '100%', md: 190 } }}
              />
              {!ownCounterpartyOnly && (
                <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 340 } }}>
                  <InputLabel>Контрагент</InputLabel>
                  <Select
                    label="Контрагент"
                    value={counterpartyId}
                    onChange={(event) => {
                      setCounterpartyId(event.target.value);
                      setReport(null);
                    }}
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
            </Stack>
            <Button
              variant="contained"
              startIcon={<Refresh />}
              onClick={() => void load()}
              sx={{ minHeight: 40, px: 3, alignSelf: { xs: 'stretch', lg: 'center' } }}
            >
              Рассчитать
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {loading ? (
        <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>
      ) : report && (
        <>
          <TableContainer
            component={Card}
            variant="outlined"
            sx={{
              borderRadius: 1,
              borderColor: '#c9d7ec',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
            }}
          >
            <Table
              size="small"
              sx={{
                tableLayout: 'fixed',
                '& th, & td': {
                  borderColor: '#cfd8e3',
                  borderRight: '1px solid #cfd8e3',
                  fontSize: 13,
                  lineHeight: 1.35,
                  py: 1.1,
                  px: 1.25,
                },
                '& th:last-of-type, & td:last-of-type': {
                  borderRight: 0,
                },
                '& thead th': {
                  backgroundColor: '#f4f7fb',
                  color: '#27364b',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                },
                '& tbody tr:nth-of-type(odd) td': {
                  backgroundColor: '#f8fbff',
                },
                '& tbody tr:nth-of-type(even) td': {
                  backgroundColor: '#ffffff',
                },
                '& tbody tr:hover td': {
                  backgroundColor: '#eef5ff',
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 58 }} align="center">№</TableCell>
                  <TableCell sx={{ width: '30%' }}>Товары (работы, услуги)</TableCell>
                  <TableCell sx={{ width: 130 }} align="right">Количество</TableCell>
                  <TableCell sx={{ width: 90 }}>Ед.</TableCell>
                  <TableCell sx={{ width: 120 }} align="right">Цена</TableCell>
                  <TableCell sx={{ width: 120 }} align="right">Ставка НДС</TableCell>
                  <TableCell sx={{ width: 150 }} align="right">Сумма НДС</TableCell>
                  <TableCell sx={{ width: 170 }} align="right">Сумма с НДС</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summaryRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      Нет начислений за выбранный период
                    </TableCell>
                  </TableRow>
                )}
                {summaryRows.map((row, index) => {
                  const vatAmount = extractVatAmount(row.totalWithVat, vatRate);
                  return (
                    <TableRow key={`${row.name}-${row.price}-${index}`}>
                      <TableCell align="center">{index + 1}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                      <TableCell align="right">{row.quantity === null ? '' : plainNumber.format(row.quantity)}</TableCell>
                      <TableCell>{row.unit}</TableCell>
                      <TableCell align="right">{row.price}</TableCell>
                      <TableCell align="right">{plainNumber.format(vatRate)}%</TableCell>
                      <TableCell align="right">{plainNumber.format(vatAmount)}</TableCell>
                      <TableCell align="right">{plainNumber.format(row.totalWithVat)}</TableCell>
                    </TableRow>
                  );
                })}
                {summaryRows.length > 0 && (
                  <>
                    <TableRow>
                      <TableCell colSpan={6} sx={{ backgroundColor: '#f4f7fb !important' }} />
                      <TableCell align="right" sx={{ backgroundColor: '#f4f7fb !important', fontWeight: 700 }}>Итого</TableCell>
                      <TableCell align="right" sx={{ backgroundColor: '#f4f7fb !important', fontWeight: 700 }}>{plainNumber.format(summaryTotalWithoutVat)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} sx={{ backgroundColor: '#f4f7fb !important' }} />
                      <TableCell align="right" sx={{ backgroundColor: '#f4f7fb !important', fontWeight: 700 }}>
                        В т.ч. НДС ({plainNumber.format(vatRate)}%)
                      </TableCell>
                      <TableCell align="right" sx={{ backgroundColor: '#f4f7fb !important', fontWeight: 700 }}>{plainNumber.format(summaryVatAmount)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} sx={{ backgroundColor: '#f4f7fb !important' }} />
                      <TableCell align="right" sx={{ backgroundColor: '#f4f7fb !important', fontWeight: 700 }}>Итого с НДС</TableCell>
                      <TableCell align="right" sx={{ backgroundColor: '#f4f7fb !important', fontWeight: 700 }}>{plainNumber.format(summaryTotalWithVat)}</TableCell>
                    </TableRow>
                  </>
                )}
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
