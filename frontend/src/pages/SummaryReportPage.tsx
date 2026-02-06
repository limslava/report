import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Refresh } from '@mui/icons-material';
import { planningV2Api } from '../services/planning-v2.api';
import { PlanningSummaryItem } from '../types/planning-v2.types';
import { useAuthStore } from '../store/auth-store';
import { canViewSummary } from '../utils/rolePermissions';
import { formatInt, formatPct } from '../utils/format';

type PlanningRealtimeEvent = {
  type: 'planning-v2:segment-updated';
  segmentCode: string;
  year: number;
  month: number;
  timestamp: string;
  userId?: string;
};

function getPlanningWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${protocol}://localhost:3000/ws/plans`;
  }
  return `${protocol}://${window.location.host}/ws/plans`;
}

function isPlanningRealtimeEvent(payload: unknown): payload is PlanningRealtimeEvent {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const data = payload as Record<string, unknown>;
  return (
    data.type === 'planning-v2:segment-updated' &&
    typeof data.year === 'number' &&
    typeof data.month === 'number'
  );
}

function segmentGroupTitle(code: PlanningSummaryItem['segmentCode']): string {
  if (code === 'KTK_VVO' || code === 'KTK_MOW') return 'Контейнерные перевозки';
  if (code === 'AUTO') return 'Отправка авто';
  if (code === 'RAIL') return 'ЖД';
  if (code === 'EXTRA') return 'Доп услуги';
  if (code === 'TO') return 'ТО авто';
  return code;
}

function rowLabel(row: PlanningSummaryItem): string {
  if (row.segmentCode === 'KTK_VVO') return 'Владивосток';
  if (row.segmentCode === 'KTK_MOW') return 'Москва';
  if (row.segmentCode === 'AUTO') return row.segmentName;
  if (row.segmentCode === 'RAIL') return row.detailCode ? row.segmentName : 'Итог';
  if (row.segmentCode === 'EXTRA') return row.segmentName;
  if (row.segmentCode === 'TO') return 'ТО авто';
  return row.segmentName;
}

const SummaryReportPage = () => {
  const { user } = useAuthStore();
  const now = new Date();
  const canRefresh = user?.role === 'admin';
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [asOfDate, setAsOfDate] = useState<string>(now.toISOString().slice(0, 10));

  const [rows, setRows] = useState<PlanningSummaryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await planningV2Api.getSummaryReport({ year, month, asOfDate, detailed: true });
      setRows(data);
    } catch (err: any) {
      setError(err?.message || 'Ошибка загрузки сводного отчета');
    } finally {
      setLoading(false);
    }
  }, [year, month, asOfDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let stopped = false;
    let reconnectTimer: number | null = null;
    let refreshTimer: number | null = null;
    const ws = new WebSocket(getPlanningWebSocketUrl());

    ws.onmessage = (event) => {
      if (stopped) return;
      try {
        const payload = JSON.parse(event.data) as unknown;
        if (!isPlanningRealtimeEvent(payload)) return;
        if (payload.year !== year || payload.month !== month) return;

        if (refreshTimer) {
          window.clearTimeout(refreshTimer);
        }
        // Coalesce bursty updates from multiple saves into one refresh.
        refreshTimer = window.setTimeout(() => {
          void loadData();
        }, 350);
      } catch {
        // ignore malformed events
      }
    };

    ws.onclose = () => {
      if (stopped) return;
      reconnectTimer = window.setTimeout(() => {
        if (!stopped) {
          void loadData();
        }
      }, 1500);
    };

    ws.onerror = () => ws.close();

    return () => {
      stopped = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws.close();
    };
  }, [year, month, loadData]);

  const topLevelRows = useMemo(() => {
    const includeDetailForTotals = new Set([
      'AUTO_TRUCK',
      'AUTO_KTK',
      'AUTO_CURTAIN',
      'EXTRA_GROUPAGE',
      'EXTRA_CURTAINS',
      'EXTRA_FORWARDING',
      'EXTRA_REPACK',
      'RAIL_FROM_VVO',
      'RAIL_TO_VVO',
    ]);

    return rows.filter((row) => !row.detailCode || includeDetailForTotals.has(row.detailCode));
  }, [rows]);
  const totalPlan = useMemo(() => topLevelRows.reduce((acc, row) => acc + row.planMonth, 0), [topLevelRows]);
  const totalPlanToDate = useMemo(() => topLevelRows.reduce((acc, row) => acc + row.planToDate, 0), [topLevelRows]);
  const totalFact = useMemo(() => topLevelRows.reduce((acc, row) => acc + row.factToDate, 0), [topLevelRows]);
  const totalMonthFact = useMemo(() => topLevelRows.reduce((acc, row) => acc + row.monthFact, 0), [topLevelRows]);
  const totalCompletion = totalPlan > 0 ? (totalMonthFact / totalPlan) * 100 : 0;
  const orderedRows = useMemo(() => {
    const orderMap: Record<string, number> = {
      'Контейнерные перевозки': 10,
      'Отправка авто': 20,
      ЖД: 30,
      'Доп услуги': 40,
      'ТО авто': 50,
    };

    const detailOrder: Record<string, number> = {
      AUTO_TRUCK: 1,
      AUTO_KTK: 2,
      AUTO_CURTAIN: 3,
      EXTRA_GROUPAGE: 1,
      EXTRA_CURTAINS: 2,
      EXTRA_FORWARDING: 3,
      EXTRA_REPACK: 4,
    };

    return [...rows].sort((a, b) => {
      const baseDiff = (orderMap[segmentGroupTitle(a.segmentCode)] ?? 999) - (orderMap[segmentGroupTitle(b.segmentCode)] ?? 999);
      if (baseDiff !== 0) {
        return baseDiff;
      }

      const aDetail = a.detailCode ? 1 : 0;
      const bDetail = b.detailCode ? 1 : 0;
      if (aDetail !== bDetail) {
        return aDetail - bDetail;
      }

      if (a.detailCode || b.detailCode) {
        return (detailOrder[a.detailCode ?? ''] ?? 999) - (detailOrder[b.detailCode ?? ''] ?? 999);
      }

      return rowLabel(a).localeCompare(rowLabel(b), 'ru');
    });
  }, [rows]);

  const monthOptions = [
    { value: 1, label: 'Январь' }, { value: 2, label: 'Февраль' }, { value: 3, label: 'Март' },
    { value: 4, label: 'Апрель' }, { value: 5, label: 'Май' }, { value: 6, label: 'Июнь' },
    { value: 7, label: 'Июль' }, { value: 8, label: 'Август' }, { value: 9, label: 'Сентябрь' },
    { value: 10, label: 'Октябрь' }, { value: 11, label: 'Ноябрь' }, { value: 12, label: 'Декабрь' },
  ];

  if (!canViewSummary(user?.role)) {
    return (
      <Alert severity="warning">
        У вас нет доступа к сводному отчету. Доступно для ролей: администратор, директор, менеджер по продажам.
      </Alert>
    );
  }

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={3}>
          <TextField
            label="Год"
            type="number"
            fullWidth
            size="small"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || year)}
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField
            label="Месяц"
            select
            fullWidth
            size="small"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {monthOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField
            label="Дата отчета"
            type="date"
            fullWidth
            size="small"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        {canRefresh && (
          <Grid item xs={12} md={3} sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' }, alignItems: 'center' }}>
            <Button variant="outlined" startIcon={<Refresh />} onClick={loadData} disabled={loading}>
              Обновить
            </Button>
          </Grid>
        )}
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 680 }}>
          <Table size="small" stickyHeader>
            <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 300 }}>Сегмент</TableCell>
                  <TableCell align="right" sx={{ minWidth: 130 }}>План месяц</TableCell>
                  <TableCell align="right" sx={{ minWidth: 130 }}>План на дату</TableCell>
                  <TableCell align="right" sx={{ minWidth: 130 }}>Факт на дату</TableCell>
                  <TableCell align="right" sx={{ minWidth: 110 }}>% на дату</TableCell>
                  <TableCell align="right" sx={{ minWidth: 110 }}>% месяц</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
              {orderedRows.map((row, index) => {
                const prev = index > 0 ? orderedRows[index - 1] : null;
                const showGroup = !prev || segmentGroupTitle(prev.segmentCode) !== segmentGroupTitle(row.segmentCode);

                return (
                  <Fragment key={`${row.segmentCode}-${row.detailCode ?? 'main'}`}>
                    {showGroup && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          sx={{
                            backgroundColor: 'action.hover',
                            borderTop: '2px solid',
                            borderColor: 'divider',
                          }}
                        >
                          <Typography variant="body2" fontWeight={700}>
                            {segmentGroupTitle(row.segmentCode)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell>
                        <Typography
                          variant="body2"
                          fontWeight={500}
                          sx={{ pl: 3 }}
                        >
                          • {rowLabel(row)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{formatInt(row.planMonth)}</TableCell>
                      <TableCell align="right">{formatInt(row.planToDate)}</TableCell>
                      <TableCell align="right">{formatInt(row.factToDate)}</TableCell>
                      <TableCell align="right">{formatPct(row.completionToDate)}</TableCell>
                      <TableCell align="right">{formatPct(row.completionMonth)}</TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
              <TableRow sx={{ backgroundColor: 'action.selected' }}>
                <TableCell><strong>ИТОГО</strong></TableCell>
                <TableCell align="right"><strong>{formatInt(totalPlan)}</strong></TableCell>
                <TableCell align="right"><strong>{formatInt(totalPlanToDate)}</strong></TableCell>
                <TableCell align="right"><strong>{formatInt(totalFact)}</strong></TableCell>
                <TableCell align="right">
                  <strong>{totalPlanToDate > 0 ? formatPct((totalFact / totalPlanToDate) * 100) : '0.00%'}</strong>
                </TableCell>
                <TableCell align="right"><strong>{formatPct(totalCompletion)}</strong></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default SummaryReportPage;
