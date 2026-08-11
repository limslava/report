import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Snackbar,
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
import { ChevronLeft, ChevronRight, Download, PlayArrow } from '@mui/icons-material';
import { useAuthStore } from '../store/auth-store';
import {
  FleetLocation,
  FuelRow,
  FuelRowPayload,
  FuelState,
  downloadFuelExcel,
  getFuelState,
  saveFuelState,
  setFuelBaseline,
} from '../services/directories.api';
import { fuelLocationsForRole } from '../utils/rolePermissions';
import { downloadBlob } from '../utils/download';

const LOCATION_LABELS: Record<FleetLocation, string> = { vvo: 'Владивосток', mow: 'Москва' };
const MONTH_NAMES = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

type DraftValues = {
  odometer: string;
  fuelEnd: string;
  fuelFilled: string;
  mileageManual: string;
  fuelStartManual: string;
};

type Feedback = { severity: 'success' | 'error' | 'info'; text: string } | null;

const currentMonthValue = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const shiftMonth = (monthValue: string, delta: number): string => {
  const [year, month] = monthValue.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const monthTitle = (monthValue: string): string => {
  const [year, month] = monthValue.split('-').map(Number);
  return `${MONTH_NAMES[month]} ${year}`;
};

const toDraft = (value: number | null): string => (value === null ? '' : String(value));

const draftToNumber = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const formatNumber = (value: number | null, digits = 1): string =>
  value === null ? '—' : value.toLocaleString('ru-RU', { maximumFractionDigits: digits });

const deviationChip = (deviationPct: number | null) => {
  if (deviationPct === null) return <Typography component="span" color="text.disabled">—</Typography>;
  const rounded = deviationPct.toFixed(1).replace('.', ',');
  const label = `${deviationPct > 0 ? '+' : ''}${rounded} %`;
  const color = deviationPct > 10 ? 'error' : deviationPct > 0 ? 'warning' : 'success';
  return <Chip size="small" color={color} variant="outlined" label={label} />;
};

const errorText = (error: unknown): string => {
  const anyError = error as any;
  return anyError?.response?.data?.message || anyError?.message || 'Не удалось выполнить операцию';
};

export default function FuelPage() {
  const { user } = useAuthStore();
  const allowedLocations = useMemo(() => fuelLocationsForRole(user?.role), [user?.role]);
  const [location, setLocation] = useState<FleetLocation>(allowedLocations[0] ?? 'vvo');
  const [monthValue, setMonthValue] = useState<string>(currentMonthValue());
  const [state, setState] = useState<FuelState | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftValues>>({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [baselineEdit, setBaselineEdit] = useState<{ row: FuelRow; odometer: string; fuelLevel: string } | null>(null);

  const applyState = useCallback((next: FuelState) => {
    setState(next);
    setDrafts(
      Object.fromEntries(
        next.rows.map((row) => [
          row.vehicleId,
          {
            odometer: toDraft(row.odometer),
            fuelEnd: toDraft(row.fuelEnd),
            fuelFilled: toDraft(row.fuelFilled),
            mileageManual: toDraft(row.mileageManual),
            fuelStartManual: toDraft(row.fuelStartManual),
          },
        ])
      )
    );
    setDirty(false);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getFuelState(location, monthValue);
      applyState(data);
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    } finally {
      setLoading(false);
    }
  }, [location, monthValue, applyState]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateDraft = (vehicleId: string, field: keyof DraftValues, value: string) => {
    setDrafts((prev) => ({ ...prev, [vehicleId]: { ...prev[vehicleId], [field]: value } }));
    setDirty(true);
  };

  const save = async () => {
    if (!state) return;
    const rows: FuelRowPayload[] = state.rows.map((row) => {
      const draft = drafts[row.vehicleId];
      return {
        vehicleId: row.vehicleId,
        odometer: draftToNumber(draft?.odometer ?? ''),
        fuelEnd: draftToNumber(draft?.fuelEnd ?? ''),
        fuelFilled: draftToNumber(draft?.fuelFilled ?? ''),
        mileageManual: draftToNumber(draft?.mileageManual ?? ''),
        fuelStartManual: draftToNumber(draft?.fuelStartManual ?? ''),
      };
    });
    setLoading(true);
    try {
      const { data } = await saveFuelState(location, monthValue, rows);
      applyState(data);
      setFeedback({ severity: 'success', text: 'Данные сохранены' });
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    } finally {
      setLoading(false);
    }
  };

  const saveBaseline = async () => {
    if (!baselineEdit) return;
    try {
      await setFuelBaseline({
        location,
        monthValue,
        vehicleId: baselineEdit.row.vehicleId,
        startOdometer: draftToNumber(baselineEdit.odometer),
        startFuelLevel: draftToNumber(baselineEdit.fuelLevel),
      });
      setBaselineEdit(null);
      await reload();
      setFeedback({ severity: 'success', text: `Стартовые данные для ${baselineEdit.row.plate} сохранены` });
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  const exportExcel = async () => {
    try {
      const response = await downloadFuelExcel(location, monthValue);
      const [year, month] = monthValue.split('-');
      await downloadBlob(response.data as Blob, `Топливо_${LOCATION_LABELS[location]}_${month}_${year}.xlsx`);
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  const computedRow = (row: FuelRow): FuelRow => {
    // живой пересчёт по черновикам, чтобы расчётные колонки обновлялись при вводе
    const draft = drafts[row.vehicleId];
    if (!draft) return row;
    const odometer = draftToNumber(draft.odometer);
    const fuelEnd = draftToNumber(draft.fuelEnd);
    const fuelFilled = draftToNumber(draft.fuelFilled);
    const mileageManual = draftToNumber(draft.mileageManual);
    const fuelStartManual = draftToNumber(draft.fuelStartManual);
    const mileage = mileageManual ?? (odometer !== null && row.prevOdometer !== null ? odometer - row.prevOdometer : null);
    const fuelStart = fuelStartManual ?? row.prevFuelEnd;
    const consumption = fuelStart !== null && fuelFilled !== null && fuelEnd !== null ? fuelStart + fuelFilled - fuelEnd : null;
    const per100 = consumption !== null && mileage !== null && mileage > 0 ? (consumption / mileage) * 100 : null;
    const deviationPct = per100 !== null && row.norm !== null && row.norm > 0 ? ((per100 - row.norm) / row.norm) * 100 : null;
    return { ...row, odometer, fuelEnd, fuelFilled, mileageManual, fuelStartManual, mileage, fuelStart, consumption, per100, deviationPct };
  };

  const rows = useMemo(() => (state ? state.rows.map(computedRow) : []), [state, drafts]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          mileage: acc.mileage + (row.mileage ?? 0),
          filled: acc.filled + (row.fuelFilled ?? 0),
          consumption: acc.consumption + (row.consumption ?? 0),
        }),
        { mileage: 0, filled: 0, consumption: 0 }
      ),
    [rows]
  );
  const filledCount = rows.filter((row) => row.odometer !== null && row.fuelEnd !== null && row.fuelFilled !== null).length;

  const numberCell = (
    row: FuelRow,
    field: keyof DraftValues,
    options?: { width?: number; manualBase?: number | null }
  ) => {
    const draft = drafts[row.vehicleId]?.[field] ?? '';
    const isManualOverride = options?.manualBase !== undefined && draft.trim() !== '';
    return (
      <TextField
        size="small"
        value={draft}
        onChange={(event) => updateDraft(row.vehicleId, field, event.target.value)}
        inputProps={{ inputMode: 'decimal', style: { textAlign: 'right', padding: '4px 8px', fontSize: 13 } }}
        sx={{
          width: options?.width ?? 110,
          '& .MuiOutlinedInput-root': {
            bgcolor: isManualOverride ? '#fff3e0' : '#fffdf5',
          },
        }}
      />
    );
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5" fontWeight={700}>Топливо</Typography>
        {allowedLocations.length > 1 ? (
          <TextField
            select size="small" value={location}
            onChange={(event) => setLocation(event.target.value as FleetLocation)}
            sx={{ minWidth: 170 }}
          >
            {allowedLocations.map((value) => (
              <MenuItem key={value} value={value}>{LOCATION_LABELS[value]}</MenuItem>
            ))}
          </TextField>
        ) : (
          <Chip label={LOCATION_LABELS[location]} />
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton size="small" onClick={() => setMonthValue((prev) => shiftMonth(prev, -1))}>
            <ChevronLeft />
          </IconButton>
          <Typography sx={{ minWidth: 140, textAlign: 'center', fontWeight: 600 }}>{monthTitle(monthValue)}</Typography>
          <IconButton size="small" onClick={() => setMonthValue((prev) => shiftMonth(prev, 1))}>
            <ChevronRight />
          </IconButton>
        </Box>
        {state && (
          <Chip
            size="small"
            variant="outlined"
            color={state.isWinter ? 'info' : 'success'}
            label={state.isWinter ? 'зимние нормы' : 'летние нормы'}
          />
        )}
        <Box sx={{ flex: 1 }} />
        <Typography variant="body2" color="text.secondary">
          Заполнено {filledCount} из {rows.length}
        </Typography>
        <Button size="small" startIcon={<Download />} onClick={() => void exportExcel()}>Excel</Button>
        <Button variant="contained" size="small" disabled={!dirty || loading} onClick={() => void save()}>
          Сохранить
        </Button>
      </Box>

      {loading && <LinearProgress sx={{ mb: 1 }} />}

      <Paper>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 190px)' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Г/Н ТС</TableCell>
                <TableCell>Модель</TableCell>
                <TableCell align="right">Показания одометра, км ✏️</TableCell>
                <TableCell align="right">Пробег по Одометру, км</TableCell>
                <TableCell align="right">Начальный уровень Топлива</TableCell>
                <TableCell align="right">Конечный уровень Топлива ✏️</TableCell>
                <TableCell align="right">Заправлено по ППР ✏️</TableCell>
                <TableCell align="right">Расход топлива, л</TableCell>
                <TableCell align="right">Расход л/100км</TableCell>
                <TableCell align="center">К норме</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.vehicleId} hover>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {row.plate}
                    {row.status === 'repair' && (
                      <Chip size="small" label="ремонт" color="warning" variant="outlined" sx={{ ml: 0.5 }} />
                    )}
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{row.modelLabel || '—'}</TableCell>
                  {row.hasBaseline || row.odometer !== null ? (
                    <>
                      <TableCell align="right">{numberCell(row, 'odometer', { width: 120 })}</TableCell>
                      <TableCell align="right">
                        <Tooltip title={row.mileageManual !== null ? 'Значение исправлено вручную' : 'Одометр минус прошлый месяц; можно исправить вручную'}>
                          <Box component="span">{numberCell(row, 'mileageManual', { manualBase: row.mileage })}</Box>
                        </Tooltip>
                        {row.mileageManual === null && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            {formatNumber(row.mileage)}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title={row.fuelStartManual !== null ? 'Значение исправлено вручную' : 'Конечный уровень прошлого месяца; можно исправить вручную'}>
                          <Box component="span">{numberCell(row, 'fuelStartManual', { manualBase: row.fuelStart })}</Box>
                        </Tooltip>
                        {row.fuelStartManual === null && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            {formatNumber(row.fuelStart, 2)}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">{numberCell(row, 'fuelEnd')}</TableCell>
                      <TableCell align="right">{numberCell(row, 'fuelFilled')}</TableCell>
                      <TableCell align="right" sx={{ bgcolor: '#f6f8fb' }}>{formatNumber(row.consumption, 2)}</TableCell>
                      <TableCell align="right" sx={{ bgcolor: '#f6f8fb', fontWeight: 600 }}>{formatNumber(row.per100, 1)}</TableCell>
                      <TableCell align="center">{deviationChip(row.deviationPct)}</TableCell>
                    </>
                  ) : (
                    <TableCell colSpan={8}>
                      <Button
                        size="small"
                        startIcon={<PlayArrow />}
                        onClick={() => setBaselineEdit({ row, odometer: '', fuelLevel: '' })}
                      >
                        Ввести стартовые данные (одометр и остаток топлива)
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {rows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    В справочнике нет техники для «{LOCATION_LABELS[location]}». Добавьте машины в разделе «Справочники».
                  </TableCell>
                </TableRow>
              )}
              {rows.length > 0 && (
                <TableRow sx={{ '& td': { fontWeight: 700, bgcolor: '#f2f4f9' } }}>
                  <TableCell colSpan={3}>Итого ({rows.length} машин)</TableCell>
                  <TableCell align="right">{formatNumber(totals.mileage)}</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell align="right">{formatNumber(totals.filled, 2)}</TableCell>
                  <TableCell align="right">{formatNumber(totals.consumption, 2)}</TableCell>
                  <TableCell align="right">
                    {totals.mileage > 0 ? formatNumber((totals.consumption / totals.mileage) * 100, 1) : '—'}
                  </TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        ✏️ — вводит оператор; серые колонки считает система. Пробег и начальный уровень подставляются из прошлого месяца —
        при необходимости их можно исправить вручную (исправленная ячейка подсвечивается оранжевым).
      </Typography>

      <Dialog open={Boolean(baselineEdit)} onClose={() => setBaselineEdit(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Стартовые данные · {baselineEdit?.row.plate}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Значения на начало {monthTitle(monthValue).toLowerCase()} — от них пойдёт расчёт пробега и расхода.
          </Typography>
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <TextField
              label="Показания одометра, км" size="small" autoFocus
              value={baselineEdit?.odometer ?? ''}
              onChange={(event) => setBaselineEdit((prev) => (prev ? { ...prev, odometer: event.target.value } : prev))}
              inputProps={{ inputMode: 'decimal' }}
            />
            <TextField
              label="Остаток топлива, л" size="small"
              value={baselineEdit?.fuelLevel ?? ''}
              onChange={(event) => setBaselineEdit((prev) => (prev ? { ...prev, fuelLevel: event.target.value } : prev))}
              inputProps={{ inputMode: 'decimal' }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBaselineEdit(null)}>Отмена</Button>
          <Button variant="contained" onClick={() => void saveBaseline()}>Сохранить</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(feedback)}
        autoHideDuration={4000}
        onClose={() => setFeedback(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={feedback?.severity ?? 'success'} onClose={() => setFeedback(null)}>
          {feedback?.text}
        </Alert>
      </Snackbar>
    </Box>
  );
}
