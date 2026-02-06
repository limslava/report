import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
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
import { planningV2Api } from '../../services/planning-v2.api';
import { useAuthStore } from '../../store/auth-store';
import { registerUnsavedHandlers, setHasUnsavedChanges } from '../../store/unsavedChanges';
import { PlanningYearTotalsRow } from '../../types/planning-v2.types';
import { downloadBlob } from '../../utils/download';
import { formatInt, formatPct } from '../../utils/format';

interface YearTotalsV2TableProps {
  year: number;
  isAdmin: boolean;
  onYearChange: (year: number) => void;
}

type DraftMap = Record<string, number>;
type EditingCell = { rowId: string; month: number } | null;
type CellCoord = { rowId: string; month: number } | null;
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

function makeDraftKey(rowId: string, month: number): string {
  return `${rowId}__m__${month}`;
}

function parseDraftKey(key: string): { rowId: string; month: number } | null {
  const marker = '__m__';
  const index = key.lastIndexOf(marker);
  if (index < 0) {
    return null;
  }

  const rowId = key.slice(0, index);
  const monthRaw = key.slice(index + marker.length);
  const month = Number(monthRaw);

  if (!rowId || !Number.isInteger(month)) {
    return null;
  }

  return { rowId, month };
}

function percent(fact: number, plan: number): number {
  if (!plan) {
    return 0;
  }
  return (fact / plan) * 100;
}

function rowSortOrder(row: PlanningYearTotalsRow): number {
  if (row.segmentCode === 'KTK_VVO') return 10;
  if (row.segmentCode === 'KTK_MOW') return 20;
  if (row.segmentCode === 'AUTO' && row.planMetricCode === 'AUTO_PLAN_TRUCK') return 30;
  if (row.segmentCode === 'AUTO' && row.planMetricCode === 'AUTO_PLAN_KTK') return 40;
  if (row.segmentCode === 'RAIL') return 50;
  if (row.segmentCode === 'EXTRA') {
    if (row.planMetricName === 'Сборный груз') return 60;
    if (row.planMetricName === 'Шторы (тенты)') return 61;
    if (row.planMetricName === 'Экспедирование') return 62;
    return 63;
  }
  if (row.segmentCode === 'TO') return 70;
  return 999;
}

function rowGroupTitle(row: PlanningYearTotalsRow): string | null {
  if (row.segmentCode === 'KTK_VVO') return 'Владивосток';
  if (row.segmentCode === 'KTK_MOW') return 'Москва';
  if (row.segmentCode === 'AUTO') return 'Автовозы';
  if (row.segmentCode === 'RAIL') return 'ЖД';
  if (row.segmentCode === 'EXTRA') return 'Доп.услуги';
  if (row.segmentCode === 'TO') return 'ТО авто';
  return null;
}

function rowSegmentLabel(row: PlanningYearTotalsRow): string {
  if (row.segmentCode === 'KTK_VVO' || row.segmentCode === 'KTK_MOW') return 'КТК';
  if (row.segmentCode === 'AUTO' && row.planMetricCode === 'AUTO_PLAN_TRUCK') return 'Автовозы';
  if (row.segmentCode === 'AUTO' && row.planMetricCode === 'AUTO_PLAN_KTK') return 'Авто в ктк';
  if (row.segmentCode === 'RAIL') return 'ЖД';
  if (row.segmentCode === 'EXTRA') return row.planMetricName;
  if (row.segmentCode === 'TO') return 'ТО авто';
  return row.segmentName;
}

const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

export default function YearTotalsV2Table({ year, isAdmin, onYearChange }: YearTotalsV2TableProps) {
  const [rows, setRows] = useState<PlanningYearTotalsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftMap>({});
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<CellCoord>(null);
  const [remoteUpdatePending, setRemoteUpdatePending] = useState(false);
  const userId = useAuthStore((state) => state.user?.id);
  const zoomStorageKey = `planning-totals-zoom:${userId ?? 'guest'}`;
  const [tableZoom, setTableZoom] = useState(() => {
    if (typeof window === 'undefined') {
      return 1;
    }
    const stored = window.localStorage.getItem(zoomStorageKey);
    const parsed = stored ? Number(stored) : 1;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  });
  const [zoomInput, setZoomInput] = useState('100%');
  const zoomOptions = ['25%', '50%', '75%', '100%'];
  const cellRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const draftCountRef = useRef(0);
  const savingRef = useRef(false);
  const yearRef = useRef(year);

  const applyZoomFromInput = (raw: string) => {
    const normalized = raw.trim().replace(',', '.');
    if (!normalized) return;
    const numeric = Number(normalized.replace('%', ''));
    if (!Number.isFinite(numeric)) return;
    const scale = normalized.includes('%') || numeric > 2 ? numeric / 100 : numeric;
    if (scale < 0.2 || scale > 2) return;
    setTableZoom(scale);
    setZoomInput(`${Math.round(scale * 100)}%`);
  };

  useEffect(() => {
    setZoomInput(`${Math.round(tableZoom * 100)}%`);
  }, [tableZoom]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(zoomStorageKey);
    const parsed = stored ? Number(stored) : 1;
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    setTableZoom(next);
  }, [zoomStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(zoomStorageKey, String(tableZoom));
  }, [tableZoom, zoomStorageKey]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await planningV2Api.getYearTotals(year);
      setRows(response.rows);
      setDraft({});
      setEditingCell(null);
      setEditingValue('');
      setRemoteUpdatePending(false);
    } catch (err: any) {
      setError(err?.message || 'Ошибка загрузки оперативного отчета');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [year]);

  const draftCount = Object.keys(draft).length;
  useEffect(() => {
    draftCountRef.current = draftCount;
  }, [draftCount]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    yearRef.current = year;
  }, [year]);

  useEffect(() => {
    setHasUnsavedChanges(draftCount > 0);
    return () => setHasUnsavedChanges(false);
  }, [draftCount]);

  useEffect(() => {
    registerUnsavedHandlers({
      save: async () => {
        await handleSaveAll();
        return true;
      },
      discard: () => {
        setDraft({});
        setEditingCell(null);
        setEditingValue('');
      },
    });

    return () => registerUnsavedHandlers(null);
  }, [draftCount, rows, year]);

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
        if (payload.year !== yearRef.current) return;

        if (draftCountRef.current === 0 && !savingRef.current) {
          if (refreshTimer) window.clearTimeout(refreshTimer);
          refreshTimer = window.setTimeout(() => {
            void loadData();
          }, 250);
          return;
        }

        setRemoteUpdatePending(true);
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
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.base += row.yearlyBasePlan;
        acc.carry += row.yearlyCarryPlan;
        acc.fact += row.yearlyFact;
        return acc;
      },
      { base: 0, carry: 0, fact: 0 }
    );
  }, [rows]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => rowSortOrder(a) - rowSortOrder(b));
  }, [rows]);
  const editableRowIds = useMemo(
    () => sortedRows.filter((row) => row.kind === 'PLAN_FLOW').map((row) => row.rowId),
    [sortedRows]
  );

  const makeCellKey = (rowId: string, month: number) => `${rowId}__${month}`;

  const focusCell = (coord: CellCoord) => {
    if (!coord) return;
    setSelectedCell(coord);
    requestAnimationFrame(() => {
      cellRefs.current[makeCellKey(coord.rowId, coord.month)]?.focus();
    });
  };

  const moveCell = (coord: CellCoord, direction: 'left' | 'right' | 'up' | 'down'): CellCoord => {
    if (!coord || editableRowIds.length === 0) {
      return coord;
    }
    const rowIndex = editableRowIds.findIndex((id) => id === coord.rowId);
    if (rowIndex < 0) return coord;
    if (direction === 'left') return { rowId: coord.rowId, month: Math.max(1, coord.month - 1) };
    if (direction === 'right') return { rowId: coord.rowId, month: Math.min(12, coord.month + 1) };
    if (direction === 'up') return { rowId: editableRowIds[Math.max(0, rowIndex - 1)], month: coord.month };
    return { rowId: editableRowIds[Math.min(editableRowIds.length - 1, rowIndex + 1)], month: coord.month };
  };

  const updateDraft = (rowId: string, month: number, raw: string, committedValue?: number) => {
    const key = makeDraftKey(rowId, month);
    const value = Number(raw);

    if (raw.trim() === '') {
      setDraft((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    if (!Number.isFinite(value) || value < 0) {
      return;
    }

    if (committedValue !== undefined && value === committedValue) {
      setDraft((prev) => {
        if (prev[key] === undefined) {
          return prev;
        }
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const startEdit = (rowId: string, month: number) => {
    const row = rows.find((item) => item.rowId === rowId);
    if (!row) {
      return;
    }
    const currentValue = getBaseValue(row, month);
    setEditingCell({ rowId, month });
    setEditingValue(String(currentValue));
  };

  const commitEdit = (direction?: 'left' | 'right' | 'up' | 'down') => {
    if (!editingCell) {
      return;
    }

    const current = editingCell;
    const row = rows.find((item) => item.rowId === current.rowId);
    const committedValue = row ? getCommittedBaseValue(row, current.month) : undefined;
    updateDraft(current.rowId, current.month, editingValue, committedValue);
    setEditingCell(null);
    setEditingValue('');
    if (direction) {
      focusCell(moveCell(current, direction));
    } else {
      focusCell(current);
    }
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  const getBaseValue = (row: PlanningYearTotalsRow, month: number): number => {
    const key = makeDraftKey(row.rowId, month);
    if (draft[key] !== undefined) {
      return draft[key];
    }

    const cell = row.months.find((m) => m.month === month);
    return cell?.basePlan ?? 0;
  };

  const getCommittedBaseValue = (row: PlanningYearTotalsRow, month: number): number => {
    const cell = row.months.find((m) => m.month === month);
    return cell?.basePlan ?? 0;
  };

  const handleSaveAll = async () => {
    if (!isAdmin || draftCount === 0) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      for (const [key, value] of Object.entries(draft)) {
        const parsed = parseDraftKey(key);
        if (!parsed) {
          continue;
        }

        const { rowId, month } = parsed;
        const row = rows.find((item) => item.rowId === rowId);
        if (!row || !row.planMetricCode) {
          continue;
        }

        await planningV2Api.updateBasePlan({
          year,
          month,
          segmentCode: row.segmentCode,
          planMetricCode: row.planMetricCode,
          basePlan: value,
        });
      }

      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Ошибка сохранения базового плана');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadExcel = async () => {
    try {
      setDownloading(true);
      setError(null);
      const { blob, filename } = await planningV2Api.downloadTotalsExcel({ year });
      const fallbackName = `Оперативный отчет — ${year}.xlsx`;
      downloadBlob(blob, filename ?? fallbackName);
    } catch (err: any) {
      setError(err?.message || 'Ошибка выгрузки Excel');
    } finally {
      setDownloading(false);
    }
  };

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
      {remoteUpdatePending && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={(
            <Button color="inherit" size="small" onClick={() => loadData()}>
              Обновить
            </Button>
          )}
        >
          Есть изменения от коллеги.
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
          <Box>
            <Typography variant="h6">Оперативный отчет • {year}</Typography>
          </Box>
          <Box display="flex" gap={1} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
            <TextField
              label="Год"
              type="number"
              size="small"
              inputProps={{ min: 2020, max: 2100 }}
              value={year}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isInteger(next) && next >= 2020 && next <= 2100) {
                  onYearChange(next);
                }
              }}
              sx={{ width: 120 }}
            />
            <Autocomplete
              freeSolo
              options={zoomOptions}
              inputValue={zoomInput}
              onInputChange={(_event, value) => setZoomInput(value)}
              onChange={(_event, value) => {
                if (typeof value === 'string') {
                  setZoomInput(value);
                  applyZoomFromInput(value);
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Масштаб"
                  size="small"
                  onBlur={() => applyZoomFromInput(zoomInput)}
                  placeholder="например 80%"
                />
              )}
              sx={{ width: 140 }}
            />
            <Button variant="outlined" onClick={handleDownloadExcel} disabled={loading || downloading}>
              {downloading ? 'Скачивание...' : 'Скачать Excel'}
            </Button>
            {isAdmin && (
              <Button variant="outlined" onClick={loadData} disabled={saving}>Обновить</Button>
            )}
            {isAdmin && (
              <Button variant="contained" disabled={draftCount === 0 || saving} onClick={handleSaveAll}>
                {saving ? 'Сохранение...' : `Сохранить (${draftCount})`}
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 660 }}>
        <Table size="small" stickyHeader sx={{ zoom: tableZoom }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 260 }}>Сегмент</TableCell>
              <TableCell sx={{ minWidth: 180 }}>Показатель</TableCell>
              {monthNames.map((name) => (
                <TableCell key={name} align="center" sx={{ minWidth: 110 }}>{name}</TableCell>
              ))}
              <TableCell align="center" sx={{ minWidth: 170 }}>Итог за год</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRows.map((row, rowIndex) => {
              const metricRows: Array<{ key: string; label: string }> =
                row.kind === 'PLAN_FLOW'
                  ? [
                      { key: 'base', label: 'Базовый план' },
                      { key: 'fact', label: 'Факт' },
                      { key: 'carry', label: 'План с переносом' },
                      { key: 'completion', label: 'Выполнение плана' },
                    ]
                  : [{ key: 'fact', label: 'Факт' }];

              const prevRow = rowIndex > 0 ? sortedRows[rowIndex - 1] : null;
              const group = rowGroupTitle(row);
              const prevGroup = prevRow ? rowGroupTitle(prevRow) : null;
              const shouldShowGroup = Boolean(group) && group !== prevGroup;

              return (
                <Fragment key={row.rowId}>
                  {shouldShowGroup && (
                    <TableRow>
                      <TableCell
                        colSpan={15}
                        sx={{
                          backgroundColor: 'action.hover',
                          borderTop: '2px solid',
                          borderColor: 'divider',
                        }}
                      >
                        <Typography variant="body2" fontWeight={700}>{group}</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {metricRows.map((metric, metricIndex) => (
                    <TableRow
                      key={`${row.rowId}-${metric.key}`}
                      sx={metricIndex === 0 ? { borderTop: '1px solid', borderColor: 'divider' } : undefined}
                    >
                      {metricIndex === 0 && (
                        <TableCell rowSpan={metricRows.length}>
                          <Typography variant="body2" fontWeight={600} sx={{ pl: 1 }}>
                            • {rowSegmentLabel(row)}
                          </Typography>
                          {row.segmentCode !== 'EXTRA' && (
                            <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                              {row.planMetricName}
                            </Typography>
                          )}
                        </TableCell>
                      )}

                      <TableCell>
                        <Typography variant="body2" fontWeight={metric.key === 'completion' ? 700 : 400}>
                          {metric.label}
                        </Typography>
                      </TableCell>

                      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                        const cell = row.months.find((m) => m.month === month);
                        const base = getBaseValue(row, month);
                        const monthFact = cell?.fact ?? 0;
                        const monthCarry = cell?.carryPlan ?? 0;
                        const monthPct = percent(monthFact, monthCarry);
                        const isEditing =
                          metric.key === 'base' &&
                          editingCell?.rowId === row.rowId &&
                          editingCell?.month === month;

                        return (
                          <TableCell
                            key={`${row.rowId}-${metric.key}-${month}`}
                            align="center"
                            ref={(el) => {
                              if (isAdmin && metric.key === 'base') {
                                cellRefs.current[makeCellKey(row.rowId, month)] = el as HTMLTableCellElement | null;
                              }
                            }}
                            tabIndex={isAdmin && metric.key === 'base' ? 0 : -1}
                            onClick={() => {
                              if (isAdmin && metric.key === 'base') {
                                setSelectedCell({ rowId: row.rowId, month });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (!isAdmin || metric.key !== 'base' || isEditing) {
                                return;
                              }
                              const current: CellCoord = { rowId: row.rowId, month };
                              if (e.key === 'Enter' || e.key === 'F2') {
                                e.preventDefault();
                                startEdit(row.rowId, month);
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
                                updateDraft(row.rowId, month, '', getCommittedBaseValue(row, month));
                                return;
                              }
                              if (/^[0-9]$/.test(e.key)) {
                                e.preventDefault();
                                setEditingCell({ rowId: row.rowId, month });
                                setEditingValue(e.key);
                              }
                            }}
                            sx={{
                              outline:
                                isAdmin &&
                                metric.key === 'base' &&
                                selectedCell?.rowId === row.rowId &&
                                selectedCell?.month === month
                                  ? '1px solid'
                                  : 'none',
                              outlineColor: 'primary.main',
                              outlineOffset: '-2px',
                            }}
                          >
                            {metric.key === 'base' ? (
                              isAdmin && isEditing ? (
                                <TextField
                                  size="small"
                                  type="text"
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
                                  inputProps={{ inputMode: 'numeric' }}
                                  sx={{
                                    width: 95,
                                    '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: 'none' },
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <Typography
                                  variant="body2"
                                  sx={{
                                    cursor: isAdmin ? 'pointer' : 'default',
                                    borderBottom: isAdmin ? '1px dashed' : 'none',
                                    borderColor: 'divider',
                                    display: 'inline-block',
                                  }}
                                  onDoubleClick={isAdmin ? () => startEdit(row.rowId, month) : undefined}
                                >
                                  {formatInt(base)}
                                </Typography>
                              )
                            ) : metric.key === 'fact' ? (
                              <Typography variant="body2">{formatInt(monthFact)}</Typography>
                            ) : metric.key === 'carry' ? (
                              <Typography variant="body2">{formatInt(monthCarry)}</Typography>
                            ) : (
                              <Typography variant="body2">{formatPct(monthPct)}</Typography>
                            )}
                          </TableCell>
                        );
                      })}

                      <TableCell align="center">
                        {metric.key === 'base' && (
                          <Typography variant="body2">{formatInt(row.yearlyBasePlan)}</Typography>
                        )}
                        {metric.key === 'fact' && (
                          <Typography variant="body2">{formatInt(row.yearlyFact)}</Typography>
                        )}
                        {metric.key === 'carry' && (
                          <Typography variant="body2">{formatInt(row.yearlyCarryPlan)}</Typography>
                        )}
                        {metric.key === 'completion' && (
                          <Typography variant="body2" fontWeight={700}>
                            {formatPct(percent(row.yearlyFact, row.yearlyCarryPlan))}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}

            <TableRow sx={{ backgroundColor: 'action.selected' }}>
              <TableCell colSpan={2}><Typography variant="body2" fontWeight={700}>ИТОГО</Typography></TableCell>
              <TableCell colSpan={12} align="right">
                <Typography variant="body2">План: {formatInt(totals.base)}</Typography>
                <Typography variant="body2">План с переносом: {formatInt(totals.carry)}</Typography>
                <Typography variant="body2">Факт: {formatInt(totals.fact)}</Typography>
              </TableCell>
              <TableCell align="center">
                <Typography variant="body2" fontWeight={700}>
                  {formatPct(percent(totals.fact, totals.carry))}
                </Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
