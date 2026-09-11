import { CloudDownload, Science } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getUchetTsComparison,
  runUchetTsImport,
  seedUchetTsMock,
  UchetTsComparisonResponse,
} from '../services/uchet-ts.api';

/**
 * Сверка ежедневного отчёта (сегмент АВТО) с программой учёта ТС.
 * На каждую дату две строки: «вручную» и «из учёта ТС»; расхождения
 * подсвечены в строке учёта. Макет согласован 11.09.2026 (Excel v3).
 */

const METRIC_GROUPS: Array<{ label: string; metrics: Array<{ code: string; label: string }> }> = [
  {
    label: 'КТК (контейнер + сетка)',
    metrics: [
      { code: 'auto_ktk_received', label: 'Принято' },
      { code: 'auto_ktk_sent', label: 'Отправлено' },
      { code: 'auto_ktk_waiting', label: 'В ожидании' },
    ],
  },
  {
    label: 'Автовозы',
    metrics: [
      { code: 'auto_truck_received', label: 'Принято' },
      { code: 'auto_truck_sent', label: 'Отправлено' },
      { code: 'auto_truck_sent_own', label: 'в т.ч. собств.' },
      { code: 'auto_truck_sent_hired', label: 'в т.ч. наёмн.' },
      { code: 'auto_truck_waiting', label: 'В ожидании' },
    ],
  },
  {
    label: 'Штора',
    metrics: [
      { code: 'auto_curtain_received', label: 'Принято' },
      { code: 'auto_curtain_sent', label: 'Отправлено' },
      { code: 'auto_curtain_waiting', label: 'В ожидании' },
    ],
  },
];

const ALL_METRICS = METRIC_GROUPS.flatMap((group) => group.metrics);

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const messageFromError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return error instanceof Error ? error.message : 'Не удалось выполнить операцию.';
};

export default function UchetTsComparisonPage() {
  const [monthValue, setMonthValue] = useState(currentMonthValue());
  const [data, setData] = useState<UchetTsComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [year, month] = useMemo(() => {
    const [y, m] = monthValue.split('-').map(Number);
    return [y, m];
  }, [monthValue]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getUchetTsComparison(year, month);
      setData(response.data);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const mismatchStats = useMemo(() => {
    if (!data) return { cells: 0, days: 0 };
    let cells = 0;
    const days = new Set<string>();
    for (const day of data.days) {
      for (const metric of ALL_METRICS) {
        const manual = day.manual[metric.code];
        const uchet = day.uchet[metric.code];
        if (manual !== null && uchet !== null && manual !== uchet) {
          cells += 1;
          days.add(day.date);
        }
      }
    }
    return { cells, days: days.size };
  }, [data]);

  const handleImport = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await runUchetTsImport();
      setNotice(`Импорт выполнен: получено дней — ${response.data.daysReceived}, сохранено — ${response.data.daysSaved}.`);
      await load();
    } catch (importError) {
      setError(messageFromError(importError));
    } finally {
      setBusy(false);
    }
  };

  const handleMock = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await seedUchetTsMock(year, month);
      setNotice('Тестовые данные сгенерированы (в ~20% дней подмешаны расхождения).');
      await load();
    } catch (mockError) {
      setError(messageFromError(mockError));
    } finally {
      setBusy(false);
    }
  };

  const renderCell = (
    value: number | null,
    compareTo: number | null,
    isUchetRow: boolean,
  ) => {
    if (value === null) {
      return (
        <TableCell align="center" sx={{ color: 'text.disabled' }}>—</TableCell>
      );
    }
    const mismatch = isUchetRow && compareTo !== null && compareTo !== value;
    return (
      <TableCell
        align="center"
        sx={mismatch ? { bgcolor: '#FFC7CE', color: '#9C0006', fontWeight: 700 } : undefined}
      >
        {mismatch ? (
          <Tooltip title={`Вручную: ${compareTo} · Из учёта ТС: ${value} · Разница: ${value - compareTo > 0 ? '+' : ''}${value - compareTo}`}>
            <span>{value}</span>
          </Tooltip>
        ) : value}
      </TableCell>
    );
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack spacing={2}>
        <Box>
          <Typography component="h1" sx={{ fontSize: { xs: 20, md: 30 }, fontWeight: 700 }}>
            Сверка с учётом ТС
          </Typography>
          <Typography color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            Ежедневный отчёт (сегмент Авто) против данных программы учёта ТС
          </Typography>
        </Box>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap>
            <TextField
              type="month"
              label="Месяц"
              size="small"
              value={monthValue}
              onChange={(event) => setMonthValue(event.target.value)}
            />
            <Tooltip title={data?.configured ? '' : 'Интеграция не настроена: нужны UCHET_TS_API_URL и UCHET_TS_API_KEY в окружении бэкенда'}>
              <span>
                <Button
                  variant="contained"
                  startIcon={<CloudDownload />}
                  disabled={busy || !data?.configured}
                  onClick={() => void handleImport()}
                >
                  Забрать из учёта ТС
                </Button>
              </span>
            </Tooltip>
            <Button
              variant="outlined"
              startIcon={<Science />}
              disabled={busy}
              onClick={() => void handleMock()}
            >
              Тестовые данные
            </Button>
            {data && (
              <Chip
                color={mismatchStats.cells > 0 ? 'error' : 'success'}
                label={mismatchStats.cells > 0
                  ? `Расхождений: ${mismatchStats.cells} (в ${mismatchStats.days} днях)`
                  : 'Расхождений нет'}
              />
            )}
          </Stack>
        </Paper>

        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        {notice && <Alert severity="success" onClose={() => setNotice(null)}>{notice}</Alert>}

        {loading ? (
          <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>
        ) : data && (
          <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table
              size="small"
              stickyHeader
              sx={{
                minWidth: 980,
                // компактный шрифт и едва заметная сетка (просьба 11.09)
                '& td, & th': {
                  fontSize: 12,
                  lineHeight: 1.3,
                  py: 0.4,
                  px: 0.75,
                  border: '1px solid',
                  borderColor: 'rgba(0, 0, 0, 0.06)',
                },
              }}
            >
              {/* Двухуровневая липкая шапка: высота первой строки фиксирована,
                  смещение второй задано от неё — иначе при компактном шрифте
                  строки шапки съезжают и наезжают на данные (замечание 11.09) */}
              <TableHead>
                <TableRow sx={{ '& th': { height: 30, boxSizing: 'border-box' } }}>
                  <TableCell rowSpan={2} sx={{ fontWeight: 700, bgcolor: 'background.paper', zIndex: 3 }}>Дата</TableCell>
                  <TableCell rowSpan={2} sx={{ fontWeight: 700, bgcolor: 'background.paper', zIndex: 3 }}>День</TableCell>
                  <TableCell rowSpan={2} sx={{ fontWeight: 700, bgcolor: 'background.paper', zIndex: 3 }}>Источник</TableCell>
                  {METRIC_GROUPS.map((group) => (
                    <TableCell
                      key={group.label}
                      align="center"
                      colSpan={group.metrics.length}
                      sx={{ fontWeight: 700, bgcolor: 'primary.main', color: 'primary.contrastText' }}
                    >
                      {group.label}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  {ALL_METRICS.map((metric) => (
                    <TableCell key={metric.code} align="center" sx={{ fontWeight: 600, top: 30, bgcolor: 'grey.100' }}>
                      {metric.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.days.map((day) => {
                  const dateObj = new Date(`${day.date}T00:00:00`);
                  const weekday = WEEKDAYS[dateObj.getDay()];
                  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                  const dayLabel = day.date.slice(8, 10) + '.' + day.date.slice(5, 7);
                  return [
                    <TableRow key={`${day.date}-manual`} sx={isWeekend ? { bgcolor: 'grey.50' } : undefined}>
                      <TableCell rowSpan={2} sx={{ fontWeight: 700, borderBottom: '1px solid', borderBottomColor: 'grey.300' }}>
                        {dayLabel}
                      </TableCell>
                      <TableCell rowSpan={2} sx={{ color: isWeekend ? 'error.main' : 'text.secondary', borderBottom: '1px solid', borderBottomColor: 'grey.300' }}>
                        {weekday}
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: 11 }}>вручную</TableCell>
                      {ALL_METRICS.map((metric) => renderCell(day.manual[metric.code], null, false))}
                    </TableRow>,
                    <TableRow
                      key={`${day.date}-uchet`}
                      sx={{
                        bgcolor: '#EEF4FB',
                        '& td': { borderBottom: '1px solid', borderBottomColor: 'grey.300' },
                      }}
                    >
                      <TableCell sx={{ color: 'text.secondary', fontSize: 11 }}>
                        из учёта ТС{day.uchetSource === 'mock' ? ' (тест)' : ''}
                      </TableCell>
                      {ALL_METRICS.map((metric) => renderCell(day.uchet[metric.code], day.manual[metric.code], true))}
                    </TableRow>,
                  ];
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>
    </Box>
  );
}
