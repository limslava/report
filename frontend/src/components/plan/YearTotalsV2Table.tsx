import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { PlanningYearTotalsRow } from '../../types/planning-v2.types';

interface YearTotalsV2TableProps {
  year: number;
  isAdmin: boolean;
  onYearChange: (year: number) => void;
}

type DraftMap = Record<string, number>;
type EditingCell = { rowId: string; month: number } | null;

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
const formatInt = (value: number) => value.toLocaleString('ru-RU');
const formatPct = (value: number) => `${value.toFixed(2)}%`;

export default function YearTotalsV2Table({ year, isAdmin, onYearChange }: YearTotalsV2TableProps) {
  const [rows, setRows] = useState<PlanningYearTotalsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftMap>({});
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await planningV2Api.getYearTotals(year);
      setRows(response.rows);
      setDraft({});
      setEditingCell(null);
      setEditingValue('');
    } catch (err: any) {
      setError(err?.message || 'Ошибка загрузки ИТОГО v2');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [year]);

  const draftCount = Object.keys(draft).length;

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

  const updateDraft = (rowId: string, month: number, raw: string) => {
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

  const commitEdit = () => {
    if (!editingCell) {
      return;
    }

    updateDraft(editingCell.rowId, editingCell.month, editingValue);
    setEditingCell(null);
    setEditingValue('');
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
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
          <Box>
            <Typography variant="h6">ИТОГО • {year}</Typography>
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
        <Table size="small" stickyHeader>
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
                          <TableCell key={`${row.rowId}-${metric.key}-${month}`} align="center">
                            {metric.key === 'base' ? (
                              isAdmin && isEditing ? (
                                <TextField
                                  size="small"
                                  type="number"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onBlur={commitEdit}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      commitEdit();
                                    }
                                    if (e.key === 'Escape') {
                                      cancelEdit();
                                    }
                                  }}
                                  inputProps={{ min: 0 }}
                                  sx={{ width: 95 }}
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
