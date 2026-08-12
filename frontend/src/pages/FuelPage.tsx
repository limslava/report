import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  MenuItem,
  Paper,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useAuthStore } from '../store/auth-store';
import {
  FleetLocation,
  FuelRow,
  FuelRowPayload,
  FuelState,
  downloadFuelExcel,
  getFuelState,
  saveFuelState,
} from '../services/directories.api';
import { fuelLocationsForRole } from '../utils/rolePermissions';
import { downloadBlob } from '../utils/download';
import '../styles/operations-preview.css';
import '../styles/fuel.css';

const LOCATION_LABELS: Record<FleetLocation, string> = { vvo: 'Владивосток', mow: 'Москва' };

const MONTH_OPTIONS = [
  { value: 1, label: 'Январь' },
  { value: 2, label: 'Февраль' },
  { value: 3, label: 'Март' },
  { value: 4, label: 'Апрель' },
  { value: 5, label: 'Май' },
  { value: 6, label: 'Июнь' },
  { value: 7, label: 'Июль' },
  { value: 8, label: 'Август' },
  { value: 9, label: 'Сентябрь' },
  { value: 10, label: 'Октябрь' },
  { value: 11, label: 'Ноябрь' },
  { value: 12, label: 'Декабрь' },
];

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

const toDraft = (value: number | null): string => (value === null ? '' : String(value));

const draftToNumber = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const formatNumber = (value: number | null, digits = 1): string =>
  value === null ? '—' : value.toLocaleString('ru-RU', { maximumFractionDigits: digits });

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

  const parsedMonth = useMemo(() => {
    const [year, month] = monthValue.split('-').map(Number);
    return { year, month };
  }, [monthValue]);

  const setPeriod = (year: number, month: number) => {
    if (year < 2020 || year > 2100 || month < 1 || month > 12) return;
    setMonthValue(`${year}-${String(month).padStart(2, '0')}`);
  };

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

  const exportExcel = async () => {
    try {
      const response = await downloadFuelExcel(location, monthValue);
      const [year, month] = monthValue.split('-');
      await downloadBlob(response.data as Blob, `Топливо_${LOCATION_LABELS[location]}_${month}_${year}.xlsx`);
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  // живой пересчёт по черновикам, чтобы расчётные колонки обновлялись при вводе
  const computedRow = (row: FuelRow): FuelRow => {
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

  const deviationBadge = (deviationPct: number | null) => {
    if (deviationPct === null) return <span className="fuel-badge fuel-badge--none">—</span>;
    const rounded = deviationPct.toFixed(1).replace('.', ',');
    const label = `${deviationPct > 0 ? '+' : ''}${rounded} %`;
    const cls = deviationPct > 10 ? 'fuel-badge--bad' : deviationPct > 0 ? 'fuel-badge--warn' : 'fuel-badge--ok';
    return <span className={`fuel-badge ${cls}`}>{label}</span>;
  };

  const inputCell = (row: FuelRow, field: keyof DraftValues, options?: { manual?: boolean; hint?: string; autoValue?: string }) => {
    const draft = drafts[row.vehicleId]?.[field] ?? '';
    const isManual = options?.manual && draft.trim() !== '';
    const cell = (
      <td className={isManual ? 'fuel-cell--manual' : options?.manual ? 'fuel-cell--calc' : 'fuel-cell--edit'}>
        <input
          value={draft}
          inputMode="decimal"
          placeholder={options?.manual ? options?.autoValue ?? '' : ''}
          onChange={(event) => updateDraft(row.vehicleId, field, event.target.value)}
        />
      </td>
    );
    return options?.hint ? (
      <Tooltip title={isManual ? 'Исправлено вручную' : options.hint} placement="top">
        {cell}
      </Tooltip>
    ) : (
      cell
    );
  };

  return (
    <div className="ops-preview">
      <section className="ops-preview__controls">
        <Paper sx={{ p: 1.5, width: '100%' }}>
          <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
            <TextField
              label="Год"
              type="number"
              size="small"
              value={parsedMonth.year}
              inputProps={{ min: 2020, max: 2100 }}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isInteger(next)) setPeriod(next, parsedMonth.month);
              }}
              sx={{ width: 110, '& .MuiInputBase-root': { height: 40 } }}
            />
            <TextField
              label="Месяц"
              select
              size="small"
              value={parsedMonth.month}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isInteger(next)) setPeriod(parsedMonth.year, next);
              }}
              sx={{ width: 160, '& .MuiInputBase-root': { height: 40 } }}
            >
              {MONTH_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
              ))}
            </TextField>
            {allowedLocations.length > 1 && (
              <TextField
                label="Город"
                select
                size="small"
                value={location}
                onChange={(event) => setLocation(event.target.value as FleetLocation)}
                sx={{ width: 170, '& .MuiInputBase-root': { height: 40 } }}
              >
                {allowedLocations.map((value) => (
                  <MenuItem key={value} value={value}>{LOCATION_LABELS[value]}</MenuItem>
                ))}
              </TextField>
            )}
            <Typography sx={{ fontSize: 13, color: state?.isWinter ? '#1d4ed8' : '#15803d', fontWeight: 600 }}>
              {state ? (state.isWinter ? 'Зимние нормы' : 'Летние нормы') : ''}
            </Typography>
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography sx={{ fontSize: 13, color: '#6b7280' }}>
                Заполнено {filledCount} из {rows.length}
              </Typography>
              <button type="button" className="ops-btn ghost" onClick={() => void exportExcel()}>
                Скачать Excel
              </button>
              <button type="button" className="ops-btn ops-btn--save" disabled={!dirty || loading} onClick={() => void save()}>
                Сохранить
              </button>
            </Box>
          </Box>
        </Paper>
      </section>

      <section className="ops-preview__matrix">
        <div className="fuel-matrix">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 110 }}>Г/Н ТС</th>
                <th style={{ minWidth: 130 }}>Модель</th>
                <th style={{ minWidth: 110 }}>Показания одометра, км</th>
                <th style={{ minWidth: 100 }}>Пробег по Одометру, км</th>
                <th style={{ minWidth: 100 }}>Начальный уровень Топлива</th>
                <th style={{ minWidth: 100 }}>Конечный уровень Топлива</th>
                <th style={{ minWidth: 100 }}>Заправлено по ППР</th>
                <th style={{ minWidth: 90 }}>Расход топлива, л</th>
                <th style={{ minWidth: 90 }}>Расход л/100км по одометру</th>
                <th style={{ minWidth: 80 }}>К норме</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.vehicleId}>
                  <td className="fuel-cell--sticky">
                    {row.plate}
                    {row.status === 'repair' && <span className="fuel-status">ремонт</span>}
                  </td>
                  <td className="fuel-cell--left" style={{ color: '#6b7280' }}>{row.modelLabel || '—'}</td>
                  {inputCell(row, 'odometer')}
                  {inputCell(row, 'mileageManual', {
                    manual: true,
                    hint: row.prevOdometer === null
                      ? 'Прошлого месяца ещё нет — введите пробег вручную'
                      : 'Одометр минус прошлый месяц. Можно исправить вручную',
                    autoValue: formatNumber(row.mileageManual === null ? row.mileage : null),
                  })}
                  {inputCell(row, 'fuelStartManual', {
                    manual: true,
                    hint: row.prevFuelEnd === null
                      ? 'Прошлого месяца ещё нет — введите остаток на начало вручную'
                      : 'Конечный уровень прошлого месяца. Можно исправить вручную',
                    autoValue: formatNumber(row.fuelStartManual === null ? row.fuelStart : null, 2),
                  })}
                  {inputCell(row, 'fuelEnd')}
                  {inputCell(row, 'fuelFilled')}
                  <td className="fuel-cell--calc">{formatNumber(row.consumption, 2)}</td>
                  <td className="fuel-cell--calc" style={{ fontWeight: 700 }}>{formatNumber(row.per100, 1)}</td>
                  <td className="fuel-cell--center">{deviationBadge(row.deviationPct)}</td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="fuel-empty">
                    В справочнике нет техники для «{LOCATION_LABELS[location]}». Добавьте машины в разделе «Справочники».
                  </td>
                </tr>
              )}
              {rows.length > 0 && (
                <tr className="fuel-row--total">
                  <td className="fuel-cell--sticky">Итого</td>
                  <td className="fuel-cell--left">{rows.length} машин</td>
                  <td />
                  <td>{formatNumber(totals.mileage)}</td>
                  <td />
                  <td />
                  <td>{formatNumber(totals.filled, 2)}</td>
                  <td>{formatNumber(totals.consumption, 2)}</td>
                  <td>{totals.mileage > 0 ? formatNumber((totals.consumption / totals.mileage) * 100, 1) : '—'}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

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
    </div>
  );
}
