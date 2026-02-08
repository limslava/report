import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
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
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import { financialPlanApi } from '../../services/financial-plan.api';
import { FinancialPlanRow } from '../../types/financial-plan.types';
import { downloadBlob } from '../../utils/download';
import { useAuthStore } from '../../store/auth-store';
import { registerUnsavedHandlers, setHasUnsavedChanges } from '../../store/unsavedChanges';

interface FinancialPlanTableProps {
  year: number;
  onYearChange: (year: number) => void;
  canEdit: boolean;
}

type DraftMap = Record<string, number | null>;
type EditingCell = { rowId: string; month: number } | null;
type CellCoord = { rowId: string; month: number } | null;
type FinancialPlanRealtimeEvent = {
  type: 'financial-plan:updated';
  year: number;
  timestamp: string;
  userId?: string;
};

const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function getPlanningWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${protocol}://localhost:3000/ws/plans`;
  }
  return `${protocol}://${window.location.host}/ws/plans`;
}

function isFinancialPlanRealtimeEvent(payload: unknown): payload is FinancialPlanRealtimeEvent {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const data = payload as Record<string, unknown>;
  return data.type === 'financial-plan:updated' && typeof data.year === 'number';
}

function makeDraftKey(rowId: string, month: number): string {
  return `${rowId}__m__${month}`;
}

function parseDraftKey(key: string): { rowId: string; month: number } | null {
  const marker = '__m__';
  const index = key.lastIndexOf(marker);
  if (index < 0) return null;
  const rowId = key.slice(0, index);
  const monthRaw = key.slice(index + marker.length);
  const month = Number(monthRaw);
  if (!rowId || !Number.isInteger(month)) return null;
  return { rowId, month };
}

function formatValue(value: number | null | undefined, valueType?: 'number' | 'percent' | 'currency'): string {
  if (value === null || value === undefined) return '';
  const options: Intl.NumberFormatOptions = { maximumFractionDigits: 2 };
  if (valueType === 'number') {
    options.maximumFractionDigits = 0;
  }
  return value.toLocaleString('ru-RU', options);
}

export default function FinancialPlanTable({ year, onYearChange, canEdit }: FinancialPlanTableProps) {
  const [rows, setRows] = useState<FinancialPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftMap>({});
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editingValue, setEditingValue] = useState('');
  const [selectedCell, setSelectedCell] = useState<CellCoord>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [remoteUpdatePending, setRemoteUpdatePending] = useState(false);
  const [confirmYearSwitchOpen, setConfirmYearSwitchOpen] = useState(false);
  const [pendingYear, setPendingYear] = useState<number | null>(null);
  const cellRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const userId = useAuthStore((state) => state.user?.id);
  const userIdRef = useRef(userId);
  const yearRef = useRef(year);
  const savingRef = useRef(saving);
  const wsRef = useRef<WebSocket | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await financialPlanApi.getReport(year);
      setRows(response.rows);
      setDraft({});
      setEditingCell(null);
      setEditingValue('');
      setSelectedCell(null);
      setRemoteUpdatePending(false);
    } catch (err: any) {
      setError(err?.message || 'Ошибка загрузки финансового плана');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const draftCount = Object.keys(draft).length;
  const draftCountRef = useRef(draftCount);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    yearRef.current = year;
  }, [year]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    draftCountRef.current = draftCount;
  }, [draftCount]);

  useEffect(() => {
    setHasUnsavedChanges(draftCount > 0);
    return () => setHasUnsavedChanges(false);
  }, [draftCount]);

  useEffect(() => {
    registerUnsavedHandlers({
      save: async () => {
        const ok = await saveDraft();
        return ok;
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

    const connect = () => {
      if (stopped) return;
      const ws = new WebSocket(getPlanningWebSocketUrl());
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (stopped) return;
        try {
          const payload = JSON.parse(event.data) as unknown;
          if (!isFinancialPlanRealtimeEvent(payload)) return;
          if (payload.year !== yearRef.current) return;
          if (payload.userId && userIdRef.current && payload.userId === userIdRef.current) return;

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
        wsRef.current = null;
        if (!stopped) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      stopped = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [loadData]);

  const updateDraft = (rowId: string, month: number, raw: string, committedValue: number | null) => {
    const key = makeDraftKey(rowId, month);
    const normalized = raw.replace(',', '.').trim();

    if (normalized === '') {
      setDraft((prev) => {
        const next = { ...prev };
        if (committedValue === null || committedValue === undefined) {
          delete next[key];
        } else {
          next[key] = null;
        }
        return next;
      });
      return;
    }

    const value = Number(normalized);
    if (!Number.isFinite(value)) {
      return;
    }

    if (committedValue !== null && committedValue !== undefined && value === committedValue) {
      setDraft((prev) => {
        if (prev[key] === undefined) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const getCommittedValue = (row: FinancialPlanRow, month: number): number | null => {
    const cell = row.months?.find((item) => item.month === month);
    return cell?.value ?? null;
  };

  const getDraftValue = (row: FinancialPlanRow, month: number): number | null => {
    const key = makeDraftKey(row.rowId, month);
    if (draft[key] !== undefined) return draft[key];
    return getCommittedValue(row, month);
  };

  const startEdit = (row: FinancialPlanRow, month: number, initialValue?: string) => {
    if (!canEdit || row.rowType !== 'metric' || !row.editable) return;
    const value = getDraftValue(row, month);
    setEditingCell({ rowId: row.rowId, month });
    setEditingValue(initialValue ?? (value === null || value === undefined ? '' : String(value)));
    setSelectedCell({ rowId: row.rowId, month });
  };

  const rowById = useMemo(() => {
    const map = new Map<string, FinancialPlanRow>();
    rows.forEach((row) => map.set(row.rowId, row));
    return map;
  }, [rows]);

  const editableRowIds = useMemo(() => {
    return rows
      .filter((row) => row.rowType === 'metric' && row.editable && canEdit && !collapsedGroups[row.groupCode ?? ''])
      .map((row) => row.rowId);
  }, [rows, canEdit, collapsedGroups]);

  const focusCell = (coord: CellCoord) => {
    if (!coord) return;
    setSelectedCell(coord);
    requestAnimationFrame(() => {
      cellRefs.current[makeDraftKey(coord.rowId, coord.month)]?.focus();
    });
  };

  const moveCell = (coord: CellCoord, direction: 'left' | 'right' | 'up' | 'down'): CellCoord => {
    if (!coord || editableRowIds.length === 0) return coord;
    const rowIndex = editableRowIds.findIndex((rowId) => rowId === coord.rowId);
    if (rowIndex < 0) return coord;

    if (direction === 'left') {
      return { rowId: coord.rowId, month: Math.max(1, coord.month - 1) };
    }
    if (direction === 'right') {
      return { rowId: coord.rowId, month: Math.min(12, coord.month + 1) };
    }
    if (direction === 'up') {
      const nextRow = Math.max(0, rowIndex - 1);
      return { rowId: editableRowIds[nextRow], month: coord.month };
    }
    const nextRow = Math.min(editableRowIds.length - 1, rowIndex + 1);
    return { rowId: editableRowIds[nextRow], month: coord.month };
  };

  const applyPaste = (start: CellCoord, rawText: string) => {
    if (!start || !rawText.trim()) return;
    const startRowIndex = editableRowIds.findIndex((rowId) => rowId === start.rowId);
    if (startRowIndex < 0) return;

    const matrix = rawText
      .replace(/\r/g, '')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => line.split('\t'));

    if (matrix.length === 0) return;

    setDraft((prev) => {
      const next = { ...prev };
      matrix.forEach((rowValues, rowOffset) => {
        const rowId = editableRowIds[startRowIndex + rowOffset];
        if (!rowId) return;
        const row = rowById.get(rowId);
        if (!row) return;

        rowValues.forEach((rawValue, colOffset) => {
          const month = start.month + colOffset;
          if (month < 1 || month > 12) return;
          const normalized = rawValue.trim();
          const key = makeDraftKey(rowId, month);

          const committed = getCommittedValue(row, month);
          if (normalized === '') {
            if (committed === null || committed === undefined) {
              delete next[key];
            } else {
              next[key] = null;
            }
            return;
          }

          const parsed = Number(normalized.replace(',', '.'));
          if (!Number.isFinite(parsed)) return;

          if (committed !== null && committed !== undefined && parsed === committed) {
            delete next[key];
          } else {
            next[key] = parsed;
          }
        });
      });
      return next;
    });
  };

  const commitEdit = (direction?: 'left' | 'right' | 'up' | 'down') => {
    if (!editingCell) return;
    const row = rowById.get(editingCell.rowId);
    if (!row) return;
    const committedValue = getCommittedValue(row, editingCell.month);
    updateDraft(editingCell.rowId, editingCell.month, editingValue, committedValue);
    setEditingCell(null);
    setEditingValue('');
    const next = direction ? moveCell(editingCell, direction) : editingCell;
    focusCell(next);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditingValue('');
    focusCell(selectedCell);
  };

  const saveDraft = async (): Promise<boolean> => {
    if (!canEdit || draftCount === 0) return true;

    try {
      setSaving(true);
      setError(null);

      const updates = Object.entries(draft)
        .map(([key, value]) => {
          const parsed = parseDraftKey(key);
          if (!parsed) return null;
          const row = rows.find((item) => item.rowId === parsed.rowId);
          if (!row || row.rowType !== 'metric' || !row.metricCode || !row.groupCode || !row.directionCode) return null;
          return {
            groupCode: row.groupCode,
            directionCode: row.directionCode,
            metricCode: row.metricCode,
            month: parsed.month,
            value,
          };
        })
        .filter(Boolean) as Array<{ groupCode: string; directionCode: string; metricCode: string; month: number; value: number | null }>;

      if (updates.length === 0) {
        setDraft({});
        return true;
      }

      await financialPlanApi.batchSaveValues({ year, updates });
      await loadData();
      return true;
    } catch (err: any) {
      setError(err?.message || 'Ошибка сохранения финансового плана');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    await saveDraft();
  };

  const requestYearChange = (nextYear: number) => {
    if (draftCount > 0) {
      setPendingYear(nextYear);
      setConfirmYearSwitchOpen(true);
      return;
    }
    onYearChange(nextYear);
  };

  const handleConfirmYearChange = async (saveBeforeSwitch: boolean) => {
    const next = pendingYear;
    setConfirmYearSwitchOpen(false);
    setPendingYear(null);
    if (!next) return;

    if (saveBeforeSwitch) {
      const ok = await saveDraft();
      if (!ok) return;
    } else {
      setDraft({});
      setEditingCell(null);
      setEditingValue('');
    }

    onYearChange(next);
  };

  const handleDownloadExcel = async () => {
    try {
      setDownloading(true);
      setError(null);
      const { blob, filename } = await financialPlanApi.downloadExcel({ year });
      const fallbackName = `Финансовый результат плановый — ${year}.xlsx`;
      downloadBlob(blob, filename ?? fallbackName);
    } catch (err: any) {
      setError(err?.message || 'Ошибка выгрузки Excel');
    } finally {
      setDownloading(false);
    }
  };

  const toggleGroup = (groupCode?: string) => {
    if (!groupCode) return;
    setCollapsedGroups((prev) => ({ ...prev, [groupCode]: !prev[groupCode] }));
  };

  const firstColWidth = 150;
  const secondColWidth = 300;
  const monthColWidth = 160;
  const totalColWidth = 200;
  const tableMinWidth = firstColWidth + secondColWidth + monthColWidth * 12 + totalColWidth;
  const highlightRowBg = '#e3f2fd';
  const rowBgDefault = '#ffffff';
  const rowBgStriped = '#fafafa';
  const groupRowBg = '#f2f2f2';
  const directionRowBg = '#e9e9e9';
  const zoomStorageKey = `financial-plan-zoom:${userId ?? 'guest'}`;
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

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={260}>
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
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                setRemoteUpdatePending(false);
                void loadData();
              }}
            >
              Обновить
            </Button>
          )}
        >
          Есть изменения от коллеги. Можно обновить данные сейчас или позже.
        </Alert>
      )}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" alignItems="center" flexWrap="wrap" gap={1.5}>
          <Box sx={{ flexGrow: 1, minWidth: 240 }}>
            <Typography variant="h6">Финансовый результат плановый • {year}</Typography>
          </Box>
          <Box
            display="flex"
            gap={1}
            alignItems="center"
            flexWrap="wrap"
            justifyContent="flex-end"
            sx={{
              ml: 'auto',
              width: { xs: '100%', md: 'auto' },
            }}
          >
            <TextField
              label="Год"
              type="number"
              size="small"
              inputProps={{ min: 2020, max: 2100 }}
              value={year}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isInteger(next) && next >= 2020 && next <= 2100) {
                  requestYearChange(next);
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
            <Button variant="outlined" onClick={handleDownloadExcel} disabled={downloading || loading}>
              {downloading ? 'Скачивание...' : 'Скачать Excel'}
            </Button>
            {isAdmin && (
              <Button variant="outlined" onClick={loadData} disabled={saving}>Обновить</Button>
            )}
            {canEdit && (
              <Button variant="contained" disabled={draftCount === 0 || saving} onClick={handleSaveAll}>
                {saving ? 'Сохранение...' : `Сохранить (${draftCount})`}
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          maxHeight: 660,
          overflowX: 'auto',
          backgroundColor: rowBgDefault,
          position: 'relative',
          '& .MuiTableCell-root': {
            fontSize: 12.5,
            py: 0.6,
            px: 1,
            whiteSpace: 'nowrap',
            border: '1px dotted',
            borderColor: 'divider',
            backgroundClip: 'padding-box',
            overflow: 'hidden',
            textOverflow: 'clip',
            verticalAlign: 'middle',
          },
        }}
      >
        <Table
          size="small"
          stickyHeader
          sx={{
            zoom: tableZoom,
            tableLayout: 'fixed',
            minWidth: tableMinWidth,
            borderCollapse: 'separate',
            borderSpacing: 0,
            '& .MuiTableCell-head': {
              fontSize: 12.5,
              fontWeight: 600,
              backgroundColor: rowBgDefault,
              zIndex: 15,
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell
                sx={{
                  minWidth: firstColWidth,
                  width: firstColWidth,
                  maxWidth: firstColWidth,
                  position: 'sticky',
                  top: 0,
                  left: 0,
                  zIndex: 30,
                  backgroundColor: rowBgDefault,
                  whiteSpace: 'normal',
                  textOverflow: 'clip',
                }}
              >
                Вид
              </TableCell>
              <TableCell
                sx={{
                  minWidth: secondColWidth,
                  width: secondColWidth,
                  maxWidth: secondColWidth,
                  position: 'sticky',
                  top: 0,
                  left: firstColWidth,
                  zIndex: 29,
                  backgroundColor: rowBgDefault,
                  borderRight: '2px dotted',
                  borderRightColor: 'divider',
                  boxShadow: '2px 0 0 rgba(0,0,0,0.08)',
                  whiteSpace: 'normal',
                  textOverflow: 'clip',
                }}
              >
                Показатель
              </TableCell>
              {monthNames.map((name) => (
                <TableCell
                  key={name}
                  align="center"
                  sx={{
                    minWidth: monthColWidth,
                    width: monthColWidth,
                    maxWidth: monthColWidth,
                    borderLeft: name === monthNames[0] ? '2px dotted' : undefined,
                    borderRight: name === monthNames[monthNames.length - 1] ? '2px dotted' : undefined,
                    borderLeftColor: name === monthNames[0] ? 'divider' : undefined,
                    borderRightColor: name === monthNames[monthNames.length - 1] ? 'divider' : undefined,
                  }}
                >
                  {name}
                </TableCell>
              ))}
              <TableCell
                align="center"
                sx={{
                  minWidth: totalColWidth,
                  width: totalColWidth,
                  maxWidth: totalColWidth,
                  borderLeft: '2px dotted',
                  borderLeftColor: 'divider',
                }}
              >
                Итог за год
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(() => {
              let metricRowIndex = 0;
              return rows.map((row) => {
              const groupCode = row.groupCode ?? '';
              if (row.rowType !== 'group' && collapsedGroups[groupCode]) {
                return null;
              }

              if (row.rowType === 'group') {
                const collapsed = collapsedGroups[groupCode];
                return (
                  <TableRow key={row.rowId} hover sx={{ backgroundColor: groupRowBg }}>
                    <TableCell
                      sx={{
                        fontWeight: 600,
                        minWidth: firstColWidth,
                        maxWidth: firstColWidth,
                        position: 'sticky',
                        left: 0,
                        zIndex: 9,
                        backgroundColor: groupRowBg,
                        whiteSpace: 'normal',
                        textOverflow: 'clip',
                      }}
                    >
                      <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                        <IconButton size="small" onClick={() => toggleGroup(groupCode)}>
                          {collapsed ? <ExpandMore fontSize="small" /> : <ExpandLess fontSize="small" />}
                        </IconButton>
                        {row.groupLabel}
                      </Box>
                    </TableCell>
                    <TableCell
                      colSpan={14}
                      sx={{
                        minWidth: secondColWidth,
                        maxWidth: secondColWidth,
                        position: 'sticky',
                        left: firstColWidth,
                        zIndex: 8,
                        backgroundColor: groupRowBg,
                        borderRight: '2px dotted',
                        borderRightColor: 'divider',
                        boxShadow: '2px 0 0 rgba(0,0,0,0.08)',
                        whiteSpace: 'normal',
                        textOverflow: 'clip',
                      }}
                    />
                  </TableRow>
                );
              }

              if (row.rowType === 'direction') {
                return (
                  <TableRow key={row.rowId} sx={{ backgroundColor: directionRowBg }}>
                    <TableCell
                      sx={{
                        minWidth: firstColWidth,
                        maxWidth: firstColWidth,
                        position: 'sticky',
                        left: 0,
                        zIndex: 8,
                        backgroundColor: directionRowBg,
                        whiteSpace: 'normal',
                        textOverflow: 'clip',
                      }}
                    />
                    <TableCell
                      sx={{
                        fontWeight: 600,
                        minWidth: secondColWidth,
                        maxWidth: secondColWidth,
                        position: 'sticky',
                        left: firstColWidth,
                        zIndex: 8,
                        backgroundColor: directionRowBg,
                        borderRight: '2px dotted',
                        borderRightColor: 'divider',
                        boxShadow: '2px 0 0 rgba(0,0,0,0.08)',
                        whiteSpace: 'normal',
                        textOverflow: 'clip',
                      }}
                    >
                      {row.directionLabel}
                    </TableCell>
                    <TableCell colSpan={13} />
                  </TableRow>
                );
              }

              if (row.rowType === 'metric') {
                const isStriped = metricRowIndex % 2 === 0;
                metricRowIndex += 1;
                const isAutoHighlight = row.metricCode === 'SALES_WITH_VAT' || row.metricCode === 'FIN_RESULT';
                const rowBg = isAutoHighlight ? highlightRowBg : (isStriped ? rowBgStriped : rowBgDefault);
                return (
                  <TableRow key={row.rowId} sx={{ backgroundColor: rowBg }}>
                    <TableCell
                      sx={{
                        minWidth: firstColWidth,
                        maxWidth: firstColWidth,
                        position: 'sticky',
                        left: 0,
                        zIndex: 7,
                        backgroundColor: rowBg,
                        whiteSpace: 'normal',
                        textOverflow: 'clip',
                      }}
                    />
                    <TableCell
                      sx={{
                        minWidth: secondColWidth,
                        maxWidth: secondColWidth,
                        position: 'sticky',
                        left: firstColWidth,
                        zIndex: 7,
                        backgroundColor: rowBg,
                        borderRight: '2px dotted',
                        borderRightColor: 'divider',
                        boxShadow: '2px 0 0 rgba(0,0,0,0.08)',
                        whiteSpace: 'normal',
                        textOverflow: 'clip',
                      }}
                    >
                      {row.metricLabel}
                    </TableCell>
                    {monthNames.map((_, idx) => {
                      const month = idx + 1;
                      const isEditable = canEdit && row.editable;
                      const isEditing = editingCell?.rowId === row.rowId && editingCell?.month === month;
                      const isSelected =
                        selectedCell?.rowId === row.rowId &&
                        selectedCell?.month === month &&
                        !isEditing;
                      const value = getDraftValue(row, month);
                      const cellBg = isAutoHighlight ? highlightRowBg : (row.editable ? rowBg : highlightRowBg);
                      const cellKey = makeDraftKey(row.rowId, month);
                      const monthBorder = {
                        borderLeft: month === 1 ? '2px dotted' : undefined,
                        borderRight: month === 12 ? '2px dotted' : undefined,
                        borderLeftColor: month === 1 ? 'divider' : undefined,
                        borderRightColor: month === 12 ? 'divider' : undefined,
                      } as const;
                      return (
                        <TableCell
                          key={`${row.rowId}_${month}`}
                          align="center"
                          ref={(el: any) => {
                            if (isEditable) {
                              cellRefs.current[cellKey] = el as HTMLTableCellElement | null;
                            }
                          }}
                          tabIndex={isEditable ? 0 : -1}
                          onClick={() => isEditable && setSelectedCell({ rowId: row.rowId, month })}
                          sx={
                            isEditable
                              ? {
                                  cursor: 'pointer',
                                  borderBottom: '1px dashed',
                                  borderColor: 'divider',
                                  ...monthBorder,
                                  outline: isSelected ? '2px solid' : 'none',
                                  outlineColor: 'primary.main',
                                  outlineOffset: '-2px',
                                }
                              : {
                                  backgroundColor: cellBg,
                                  ...monthBorder,
                                }
                          }
                          onDoubleClick={isEditable ? () => startEdit(row, month) : undefined}
                          onKeyDown={(e) => {
                            if (!isEditable || isEditing) {
                              return;
                            }
                            const current: CellCoord = { rowId: row.rowId, month };

                            if (e.key === 'Enter' || e.key === 'F2') {
                              e.preventDefault();
                              startEdit(row, month);
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
                              updateDraft(row.rowId, month, '', getCommittedValue(row, month));
                              return;
                            }

                            if (/^[0-9.,-]$/.test(e.key)) {
                              e.preventDefault();
                              startEdit(row, month, e.key);
                            }
                          }}
                          onPaste={(e) => {
                            if (!isEditable) return;
                            e.preventDefault();
                            applyPaste({ rowId: row.rowId, month }, e.clipboardData.getData('text'));
                          }}
                        >
                          {isEditing ? (
                            <TextField
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
                                applyPaste({ rowId: row.rowId, month }, e.clipboardData.getData('text'));
                              }}
                              inputProps={{ inputMode: 'decimal' }}
                              autoFocus
                            />
                          ) : (
                            formatValue(value, row.valueType)
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell
                      align="center"
                      sx={{
                        borderLeft: '2px dotted',
                        borderLeftColor: 'divider',
                        backgroundColor: isAutoHighlight ? highlightRowBg : (row.editable ? rowBg : highlightRowBg),
                      }}
                    >
                      {row.yearTotal !== null && row.yearTotal !== undefined ? formatValue(row.yearTotal, row.valueType) : ''}
                    </TableCell>
                  </TableRow>
                );
              }

              return null;
            });
            })()}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={confirmYearSwitchOpen} onClose={() => setConfirmYearSwitchOpen(false)}>
        <DialogTitle>Несохраненные изменения</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            У вас есть несохраненные данные. Сохранить изменения перед переходом?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmYearSwitchOpen(false)}>Отмена</Button>
          <Button onClick={() => handleConfirmYearChange(false)}>Не сохранять</Button>
          <Button variant="contained" onClick={() => handleConfirmYearChange(true)}>
            Да, сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
