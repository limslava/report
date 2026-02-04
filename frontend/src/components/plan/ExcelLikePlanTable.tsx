import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  MenuItem,
  Typography,
} from '@mui/material';
import { planningV2Api } from '../../services/planning-v2.api';
import { PlanningGridRow, PlanningSegmentReport } from '../../types/planning-v2.types';
import { useAuthStore } from '../../store/auth-store';
import { registerUnsavedHandlers, setHasUnsavedChanges } from '../../store/unsavedChanges';

interface ExcelLikePlanTableProps {
  segmentCode: 'KTK_VVO' | 'KTK_MOW' | 'AUTO' | 'RAIL' | 'EXTRA' | 'TO';
  year: number;
  month: number;
  asOfDate: string;
  isEditable?: boolean;
  onYearChange?: (year: number) => void;
  onMonthChange?: (month: number) => void;
}

type DraftState = Record<string, number | null>;
type DashboardValueKind = 'number' | 'percent' | 'currency' | 'text';
type DashboardCard = { label: string; value: unknown; kind?: DashboardValueKind };
type EditingCell = { metricCode: string; dayIndex: number } | null;
type CellCoord = { metricCode: string; dayIndex: number } | null;
type ReportContext = {
  segmentCode: ExcelLikePlanTableProps['segmentCode'];
  year: number;
  month: number;
  asOfDate: string;
};

function keyFor(metricCode: string, dayIndex: number): string {
  return `${metricCode}:${dayIndex}`;
}

function formatValue(value: unknown): string {
  if (typeof value !== 'number') {
    return String(value ?? '—');
  }
  return Number.isInteger(value) ? value.toLocaleString('ru-RU') : value.toFixed(2);
}

function normalizeMetricLabel(metricCode: string, name: string): string {
  if (metricCode === 'auto_ktk_received') return 'Авто в ктк - Принято';
  if (metricCode === 'auto_ktk_sent') return 'Авто в ктк - Отправлено';
  if (metricCode === 'auto_ktk_waiting') return 'Авто в ктк - В ожидании';
  return name;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function formatDashboardValue(value: unknown, kind: DashboardValueKind = 'number'): string {
  if (kind === 'text') {
    return String(value ?? '—');
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }

  if (kind === 'percent') {
    return `${value.toFixed(2)}%`;
  }

  if (kind === 'currency') {
    return value.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 });
  }

  return formatValue(value);
}

function buildDashboardCards(segmentCode: ExcelLikePlanTableProps['segmentCode'], dashboard: Record<string, unknown>): DashboardCard[] {
  if (segmentCode === 'AUTO') {
    const truck = asRecord(dashboard.truck);
    const ktk = asRecord(dashboard.ktk);
    return [
      { label: 'План месяц (автовоз + шторы)', value: truck.planMonth },
      { label: 'План на дату (автовоз + шторы)', value: truck.planToDate },
      { label: 'Выполнение на дату (автовоз + шторы)', value: truck.factToDate },
      { label: 'Выполнение % на дату (автовоз + шторы)', value: truck.completionToDatePct, kind: 'percent' },
      { label: 'План на дату (авто в ктк)', value: ktk.planToDate },
      { label: 'План месяц (авто в ктк)', value: ktk.planMonth },
      { label: 'Выполнение на дату (авто в ктк)', value: ktk.factToDate },
      { label: 'Выполнение % на дату (авто в ктк)', value: ktk.completionToDatePct, kind: 'percent' },
      { label: 'Задолженность перегруз', value: dashboard.debtOverload, kind: 'currency' },
      { label: 'Задолженность кэшбек', value: dashboard.debtCashback, kind: 'currency' },
      { label: 'В ожидании отгрузки Автовоз', value: dashboard.waitingTruck },
      { label: 'В ожидании отгрузки Авто в ктк', value: dashboard.waitingKtk },
      { label: 'В ожидании отгрузки Штора', value: dashboard.waitingCurtain },
    ];
  }

  if (segmentCode === 'KTK_VVO' || segmentCode === 'KTK_MOW' || segmentCode === 'RAIL' || segmentCode === 'TO') {
    return [
      { label: 'План на месяц', value: dashboard.planMonth },
      { label: 'План на дату', value: dashboard.planToDate },
      { label: 'Выполнение на дату', value: dashboard.factToDate },
      { label: 'Факт за месяц', value: dashboard.monthFact },
      { label: 'Выполнение % по месяцу', value: dashboard.completionMonthPct, kind: 'percent' },
      { label: 'Выполнение % на дату', value: dashboard.completionToDatePct, kind: 'percent' },
      { label: 'Среднее в день', value: dashboard.avgPerDay },
      ...(segmentCode === 'KTK_VVO' || segmentCode === 'KTK_MOW'
        ? [
            { label: 'Вал. общий', value: dashboard.grossTotal, kind: 'currency' as const },
            { label: 'Ср. вал сутки', value: dashboard.grossAvgPerDay, kind: 'currency' as const },
            { label: 'Среднее ТС на линии', value: dashboard.trucksAvgOnLine },
          ]
        : []),
    ];
  }

  return [
    { label: 'Факт на дату', value: dashboard.factToDate },
    { label: 'Факт за месяц', value: dashboard.monthFact },
    { label: 'Сборный груз', value: dashboard.groupage },
    { label: 'Шторы', value: dashboard.curtains },
    { label: 'Экспедирование', value: dashboard.forwarding },
    { label: 'Перетарки/доукрепление', value: dashboard.repack },
  ];
}

const ExcelLikePlanTable: React.FC<ExcelLikePlanTableProps> = ({
  segmentCode,
  year,
  month,
  asOfDate,
  isEditable = false,
  onYearChange,
  onMonthChange,
}) => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const desiredContext = useMemo<ReportContext>(
    () => ({ segmentCode, year, month, asOfDate }),
    [segmentCode, year, month, asOfDate]
  );
  const [currentContext, setCurrentContext] = useState<ReportContext>(desiredContext);
  const [report, setReport] = useState<PlanningSegmentReport | null>(null);
  const [draft, setDraft] = useState<DraftState>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<CellCoord>(null);
  const [showDashboard, setShowDashboard] = useState<boolean>(true);
  const [pendingContext, setPendingContext] = useState<ReportContext | null>(null);
  const [confirmSwitchOpen, setConfirmSwitchOpen] = useState(false);
  const cellRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const dirtyCount = Object.keys(draft).length;

  const loadData = async (ctx: ReportContext = currentContext) => {
    try {
      setLoading(true);
      setError(null);
      const data = await planningV2Api.getSegmentReport({
        segmentCode: ctx.segmentCode,
        year: ctx.year,
        month: ctx.month,
        asOfDate: ctx.asOfDate,
      });
      setReport(data);
      setDraft({});
      setEditingCell(null);
      setEditingValue('');
      setSelectedCell(null);
    } catch (err: any) {
      setError(err?.message || 'Ошибка загрузки данных сегмента');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(currentContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      desiredContext.segmentCode === currentContext.segmentCode &&
      desiredContext.year === currentContext.year &&
      desiredContext.month === currentContext.month &&
      desiredContext.asOfDate === currentContext.asOfDate
    ) {
      return;
    }

    if (Object.keys(draft).length > 0) {
      setPendingContext(desiredContext);
      setConfirmSwitchOpen(true);
      return;
    }

    setCurrentContext(desiredContext);
    loadData(desiredContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredContext]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (Object.keys(draft).length > 0) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [draft]);

  useEffect(() => {
    setHasUnsavedChanges(dirtyCount > 0);
    return () => setHasUnsavedChanges(false);
  }, [dirtyCount]);

  useEffect(() => {
    registerUnsavedHandlers({
      save: async () => {
        const ok = await saveDraft();
        if (ok) {
          setDraft({});
          setEditingCell(null);
          setEditingValue('');
        }
        return ok;
      },
      discard: () => {
        setDraft({});
        setEditingCell(null);
        setEditingValue('');
      },
    });

    return () => registerUnsavedHandlers(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentContext, draft, report]);

  const dayHeaders = useMemo(() => {
    const daysInMonth = report?.daysInMonth ?? 0;
    const weekDays = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = new Date(currentContext.year, currentContext.month - 1, day);
      const dayOfWeek = date.getDay();
      return {
        day,
        dayName: weekDays[dayOfWeek],
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      };
    });
  }, [report?.daysInMonth, currentContext.year, currentContext.month]);

  const rows: PlanningGridRow[] = report?.gridRows ?? [];
  const editableMetricCodes = useMemo(
    () => rows.filter((row) => isEditable && row.isEditable).map((row) => row.metricCode),
    [rows, isEditable]
  );

  const focusCell = (coord: CellCoord) => {
    if (!coord) {
      return;
    }

    setSelectedCell(coord);
    requestAnimationFrame(() => {
      cellRefs.current[keyFor(coord.metricCode, coord.dayIndex)]?.focus();
    });
  };

  const moveCell = (
    coord: CellCoord,
    direction: 'left' | 'right' | 'up' | 'down'
  ): CellCoord => {
    if (!coord || editableMetricCodes.length === 0) {
      return coord;
    }

    const daysInMonth = dayHeaders.length;
    const rowIndex = editableMetricCodes.findIndex((metricCode) => metricCode === coord.metricCode);
    if (rowIndex < 0) {
      return coord;
    }

    if (direction === 'left') {
      return { metricCode: coord.metricCode, dayIndex: Math.max(0, coord.dayIndex - 1) };
    }
    if (direction === 'right') {
      return { metricCode: coord.metricCode, dayIndex: Math.min(daysInMonth - 1, coord.dayIndex + 1) };
    }
    if (direction === 'up') {
      const nextRow = Math.max(0, rowIndex - 1);
      return { metricCode: editableMetricCodes[nextRow], dayIndex: coord.dayIndex };
    }

    const nextRow = Math.min(editableMetricCodes.length - 1, rowIndex + 1);
    return { metricCode: editableMetricCodes[nextRow], dayIndex: coord.dayIndex };
  };

  const applyPaste = (start: CellCoord, rawText: string) => {
    if (!start || !rawText.trim()) {
      return;
    }

    const startRowIndex = editableMetricCodes.findIndex((metricCode) => metricCode === start.metricCode);
    if (startRowIndex < 0) {
      return;
    }

    const matrix = rawText
      .replace(/\r/g, '')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => line.split('\t'));

    if (matrix.length === 0) {
      return;
    }

    setDraft((prev) => {
      const next = { ...prev };

      matrix.forEach((rowValues, rowOffset) => {
        const metricCode = editableMetricCodes[startRowIndex + rowOffset];
        if (!metricCode) {
          return;
        }

        rowValues.forEach((rawValue, colOffset) => {
          const dayIndex = start.dayIndex + colOffset;
          if (dayIndex < 0 || dayIndex >= dayHeaders.length) {
            return;
          }

          const normalized = rawValue.trim();
          if (normalized === '') {
            next[keyFor(metricCode, dayIndex)] = null;
            return;
          }

          const parsed = Number(normalized.replace(',', '.'));
          if (!Number.isNaN(parsed)) {
            next[keyFor(metricCode, dayIndex)] = parsed;
          }
        });
      });

      return next;
    });
  };

  const updateCell = (metricCode: string, dayIndex: number, nextValue: string) => {
    const parsed = nextValue.trim() === '' ? null : Number(nextValue);
    if (nextValue.trim() !== '' && Number.isNaN(parsed)) {
      return;
    }

    setDraft((prev) => ({
      ...prev,
      [keyFor(metricCode, dayIndex)]: parsed,
    }));
  };

  const getCellValue = (row: PlanningGridRow, dayIndex: number): number | null => {
    const draftValue = draft[keyFor(row.metricCode, dayIndex)];
    if (draftValue !== undefined) {
      return draftValue;
    }
    return row.dayValues[dayIndex] ?? null;
  };

  const startEdit = (metricCode: string, dayIndex: number, value: number | null) => {
    setEditingCell({ metricCode, dayIndex });
    setEditingValue(value === null ? '' : String(value));
  };

  const commitEdit = (direction?: 'left' | 'right' | 'up' | 'down') => {
    if (!editingCell) {
      return;
    }
    const current = editingCell;
    updateCell(current.metricCode, current.dayIndex, editingValue);
    setEditingCell(null);
    setEditingValue('');
    const next = direction ? moveCell(current, direction) : current;
    focusCell(next);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditingValue('');
    focusCell(selectedCell);
  };

  const saveDraft = async (): Promise<boolean> => {
    if (!report || dirtyCount === 0) {
      return true;
    }

    try {
      const updates = Object.entries(draft).map(([cellKey, value]) => {
        const [metricCode, dayIndexRaw] = cellKey.split(':');
        const dayIndex = Number(dayIndexRaw);
        const day = String(dayIndex + 1).padStart(2, '0');
        const mm = String(currentContext.month).padStart(2, '0');
        return {
          metricCode,
          date: `${currentContext.year}-${mm}-${day}`,
          value,
        };
      });

      await planningV2Api.batchSaveValues({
        segmentCode: currentContext.segmentCode,
        year: currentContext.year,
        month: currentContext.month,
        updates,
      });
      return true;
    } catch (err: any) {
      setError(err?.message || 'Ошибка сохранения');
      return false;
    }
  };

  const handleSave = async () => {
    if (!report || dirtyCount === 0) return;
    try {
      setSaving(true);
      setError(null);
      const ok = await saveDraft();
      if (ok) await loadData(currentContext);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmSwitch = async (saveBeforeSwitch: boolean) => {
    const next = pendingContext;
    setConfirmSwitchOpen(false);
    setPendingContext(null);
    if (!next) return;

    try {
      setSaving(true);
      if (saveBeforeSwitch && Object.keys(draft).length > 0) {
        const ok = await saveDraft();
        if (!ok) return;
      }
      if (!saveBeforeSwitch) {
        setDraft({});
      }
      setCurrentContext(next);
      await loadData(next);
    } finally {
      setSaving(false);
    }
  };

  const dashboardCards = buildDashboardCards(segmentCode, asRecord(report?.dashboard));
  const compactMode = true;
  const monthOptions = [
    { value: 1, label: 'Январь' }, { value: 2, label: 'Февраль' }, { value: 3, label: 'Март' },
    { value: 4, label: 'Апрель' }, { value: 5, label: 'Май' }, { value: 6, label: 'Июнь' },
    { value: 7, label: 'Июль' }, { value: 8, label: 'Август' }, { value: 9, label: 'Сентябрь' },
    { value: 10, label: 'Октябрь' }, { value: 11, label: 'Ноябрь' }, { value: 12, label: 'Декабрь' },
  ];

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Box>
            <Typography variant="h6">{report?.segment.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              Период: {currentContext.month}.{currentContext.year} • Отчетная дата: {report?.asOfDate}
            </Typography>
          </Box>
          <Box display="flex" gap={1} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
            {onYearChange && (
              <TextField
                label="Год"
                type="number"
                size="small"
                value={currentContext.year}
                inputProps={{ min: 2020, max: 2100 }}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (Number.isInteger(next) && next >= 2020 && next <= 2100) onYearChange(next);
                }}
                sx={{ width: 120 }}
              />
            )}
            {onMonthChange && (
              <TextField
                label="Месяц"
                select
                size="small"
                value={currentContext.month}
                onChange={(e) => onMonthChange(Number(e.target.value))}
                sx={{ width: 170 }}
              >
                {monthOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Button
              variant={showDashboard ? 'contained' : 'outlined'}
              onClick={() => setShowDashboard((prev) => !prev)}
            >
              Дашборд
            </Button>
            {isAdmin && (
              <Button variant="outlined" onClick={() => loadData()} disabled={saving}>
                Обновить
              </Button>
            )}
            {isEditable && (
              <Button variant="contained" onClick={handleSave} disabled={saving || dirtyCount === 0}>
                {saving ? 'Сохранение...' : `Сохранить (${dirtyCount})`}
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      <TableContainer ref={tableContainerRef} component={Paper} variant="outlined" sx={{ mb: 2, maxHeight: 560 }}>
        <Table
          size="small"
          stickyHeader
          sx={{
            '& .MuiTableCell-sizeSmall': {
              py: compactMode ? 0.5 : 1,
              px: compactMode ? 1 : 2,
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell
                sx={{ minWidth: compactMode ? 240 : 280, position: 'sticky', left: 0, zIndex: 5, backgroundColor: 'background.paper' }}
                rowSpan={2}
              >
                Показатель
              </TableCell>
              {dayHeaders.map((header) => (
                <TableCell
                  key={`day-${header.day}`}
                  data-day={header.day}
                  align="center"
                  sx={{ minWidth: compactMode ? 62 : 80, backgroundColor: header.isWeekend ? 'action.hover' : undefined }}
                >
                  {header.day}
                </TableCell>
              ))}
              <TableCell
                align="center"
                sx={{ minWidth: 100, position: 'sticky', right: 0, zIndex: 5, backgroundColor: 'background.paper' }}
                rowSpan={2}
              >
                ИТОГО
              </TableCell>
            </TableRow>
            <TableRow>
              {dayHeaders.map((header) => (
                <TableCell
                  key={`weekday-${header.day}`}
                  align="center"
                  sx={{ backgroundColor: header.isWeekend ? 'action.hover' : undefined }}
                >
                  <Typography variant="caption" color={header.isWeekend ? 'error.main' : 'text.secondary'}>
                    {header.dayName}
                  </Typography>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const autoRowBg = '#dceeff';
              const rowBg = row.isEditable ? 'background.paper' : autoRowBg;
              return (
              <TableRow
                key={row.metricCode}
                sx={
                  !row.isEditable
                    ? {
                        backgroundColor: rowBg,
                        '& td': { color: 'text.secondary', backgroundColor: rowBg },
                      }
                    : undefined
                }
              >
                <TableCell sx={{ position: 'sticky', left: 0, zIndex: 2, backgroundColor: rowBg }}>
                  <Typography variant="body2" color={row.isEditable ? 'text.primary' : 'text.secondary'}>
                    {normalizeMetricLabel(row.metricCode, row.name)}
                  </Typography>
                </TableCell>
                {dayHeaders.map((header) => {
                  const dayIndex = header.day - 1;
                  const value = getCellValue(row, dayIndex);
                  const canEditCell = isEditable && row.isEditable;
                  const isEditing =
                    editingCell?.metricCode === row.metricCode &&
                    editingCell?.dayIndex === dayIndex;
                  return (
                    <TableCell
                      key={`${row.metricCode}:${header.day}`}
                      ref={(el: any) => {
                        if (canEditCell) {
                          cellRefs.current[keyFor(row.metricCode, dayIndex)] = (el as HTMLTableCellElement | null);
                        }
                      }}
                      tabIndex={canEditCell ? 0 : -1}
                      align="center"
                      onClick={() => canEditCell && setSelectedCell({ metricCode: row.metricCode, dayIndex })}
                      onKeyDown={(e) => {
                        if (!canEditCell || isEditing) {
                          return;
                        }

                        const current: CellCoord = { metricCode: row.metricCode, dayIndex };
                        if (e.key === 'Enter' || e.key === 'F2') {
                          e.preventDefault();
                          startEdit(row.metricCode, dayIndex, value);
                          return;
                        }

                        if (e.key === 'Tab') {
                          e.preventDefault();
                          focusCell(moveCell(current, e.shiftKey ? 'left' : 'right'));
                          return;
                        }

                        if (e.key === 'ArrowLeft') {
                          e.preventDefault();
                          focusCell(moveCell(current, 'left'));
                          return;
                        }
                        if (e.key === 'ArrowRight') {
                          e.preventDefault();
                          focusCell(moveCell(current, 'right'));
                          return;
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          focusCell(moveCell(current, 'up'));
                          return;
                        }
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          focusCell(moveCell(current, 'down'));
                          return;
                        }

                        if (e.key === 'Delete' || e.key === 'Backspace') {
                          e.preventDefault();
                          updateCell(row.metricCode, dayIndex, '');
                          return;
                        }

                        if (/^[0-9]$/.test(e.key)) {
                          e.preventDefault();
                          startEdit(row.metricCode, dayIndex, null);
                          setEditingValue(e.key);
                        }
                      }}
                      onPaste={(e) => {
                        if (!canEditCell) {
                          return;
                        }
                        e.preventDefault();
                        applyPaste({ metricCode: row.metricCode, dayIndex }, e.clipboardData.getData('text'));
                      }}
                      sx={{
                        backgroundColor: row.isEditable
                          ? (header.isWeekend ? 'action.hover' : undefined)
                          : rowBg,
                        outline:
                          selectedCell?.metricCode === row.metricCode && selectedCell?.dayIndex === dayIndex
                            ? '2px solid'
                            : 'none',
                        outlineColor: 'primary.main',
                        outlineOffset: '-2px',
                      }}
                    >
                      {canEditCell && isEditing ? (
                        <TextField
                          type="number"
                          size="small"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => commitEdit()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitEdit('down');
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelEdit();
                            }
                            if (e.key === 'Tab') {
                              e.preventDefault();
                              commitEdit(e.shiftKey ? 'left' : 'right');
                            }
                            if (e.key === 'ArrowLeft') {
                              e.preventDefault();
                              commitEdit('left');
                            }
                            if (e.key === 'ArrowRight') {
                              e.preventDefault();
                              commitEdit('right');
                            }
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              commitEdit('up');
                            }
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              commitEdit('down');
                            }
                          }}
                          onPaste={(e) => {
                            e.preventDefault();
                            commitEdit();
                            applyPaste({ metricCode: row.metricCode, dayIndex }, e.clipboardData.getData('text'));
                          }}
                          inputProps={{ min: 0, step: 'any' }}
                          sx={{ width: compactMode ? 58 : 78 }}
                          autoFocus
                        />
                      ) : canEditCell ? (
                        <Typography
                          variant="body2"
                          sx={{
                            cursor: 'pointer',
                            borderBottom: '1px dashed',
                            borderColor: 'divider',
                            display: 'inline-block',
                          }}
                          onDoubleClick={() => startEdit(row.metricCode, dayIndex, value)}
                        >
                          {value === null ? '—' : formatValue(value)}
                        </Typography>
                      ) : (
                        <Typography variant="body2">{value === null ? '—' : formatValue(value)}</Typography>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell align="center" sx={{ position: 'sticky', right: 0, zIndex: 2, backgroundColor: rowBg }}>
                  <Typography variant="body2" fontWeight={600}>
                    {formatValue(row.monthTotal)}
                  </Typography>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {showDashboard && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" gutterBottom>Дашборд</Typography>
          <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap={1.5}>
            {dashboardCards.map((card) => (
              <Box key={card.label} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {formatDashboardValue(card.value, card.kind)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      <Dialog open={confirmSwitchOpen} onClose={() => setConfirmSwitchOpen(false)}>
        <DialogTitle>Несохраненные изменения</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            У вас есть несохраненные данные. Сохранить изменения перед переходом?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleConfirmSwitch(false)}>Нет</Button>
          <Button variant="contained" onClick={() => handleConfirmSwitch(true)}>
            Да, сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ExcelLikePlanTable;
