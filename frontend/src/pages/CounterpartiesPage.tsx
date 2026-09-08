import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Snackbar,
  TextField,
  Tooltip,
} from '@mui/material';
import { Delete } from '@mui/icons-material';
import api from '../services/api';
import { useAuthStore } from '../store/auth-store';
import {
  canDeleteDirectoryEntryFrontend,
  canEditDirectoriesFrontend,
} from '../utils/rolePermissions';
import '../styles/operations-preview.css';
import '../styles/fuel.css';

/**
 * Справочник контрагентов: самостоятельный список (не зеркалит БП договоров).
 * Контрагент добавляется по ИНН — реквизиты подтягиваются из ФНС; если ФНС
 * недоступна или не нашла организацию, наименование вводится вручную.
 * «Проваливание» в контрагента (его водители/техника/прицепы) — следующим шагом.
 */

type CounterpartyRow = {
  id: string;
  inn: string;
  nameFull: string;
  nameShort: string;
  ogrn: string;
  kpp: string;
  address: string;
  source: 'fns' | 'manual';
};

type Feedback = { severity: 'success' | 'error'; text: string } | null;

const errorText = (error: unknown): string => {
  const anyError = error as any;
  return anyError?.response?.data?.message || anyError?.message || 'Не удалось выполнить операцию';
};

export default function CounterpartiesPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const canEdit = canEditDirectoriesFrontend(user?.role);
  const canDelete = canDeleteDirectoryEntryFrontend(user?.role, 'vvo') || canDeleteDirectoryEntryFrontend(user?.role, 'mow');
  const [rows, setRows] = useState<CounterpartyRow[]>([]);
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);

  // диалог добавления
  const [addOpen, setAddOpen] = useState(false);
  const [addInn, setAddInn] = useState('');
  const [addName, setAddName] = useState('');
  const [needManualName, setNeedManualName] = useState(false);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    try {
      const response = await api.get<CounterpartyRow[]>('/directories/counterparties', {
        params: { q: query.trim() || undefined },
      });
      setRows(response.data);
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 300);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const openAdd = () => {
    setAddInn('');
    setAddName('');
    setNeedManualName(false);
    setAddOpen(true);
  };

  const submitAdd = async () => {
    setAdding(true);
    try {
      const payload: Record<string, string> = { inn: addInn.trim() };
      if (needManualName) payload.nameFull = addName.trim();
      const response = await api.post<CounterpartyRow>('/directories/counterparties', payload);
      setFeedback({
        severity: 'success',
        text: `Контрагент добавлен: ${response.data.nameShort || response.data.nameFull}`,
      });
      setAddOpen(false);
      await reload();
    } catch (error) {
      const status = (error as any)?.response?.status;
      // 422 — ФНС не дала наименование: открываем ручной ввод
      if (status === 422) setNeedManualName(true);
      setFeedback({ severity: 'error', text: errorText(error) });
    } finally {
      setAdding(false);
    }
  };

  const removeRow = async (row: CounterpartyRow) => {
    if (!window.confirm(`Удалить контрагента «${row.nameShort || row.nameFull}» из справочника?`)) return;
    try {
      await api.delete(`/directories/counterparties/${row.id}`);
      setFeedback({ severity: 'success', text: 'Контрагент удалён' });
      await reload();
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  const innValid = /^(\d{10}|\d{12})$/.test(addInn.trim());

  return (
    <div className="ops-preview dir-page">
      <section className="ops-preview__controls">
        <Paper sx={{ p: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Поиск (название или ИНН)"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              sx={{ flex: '1 1 280px', maxWidth: 420 }}
            />
            {canEdit && (
              <Box sx={{ ml: 'auto' }}>
                <button type="button" className="ops-btn ops-btn--add" onClick={openAdd}>
                  Добавить по ИНН
                </button>
              </Box>
            )}
          </Box>
        </Paper>
      </section>

      <section className="ops-preview__matrix">
        <div className="dir-table">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 260 }}>Наименование</th>
                <th className="fuel-cell--center" style={{ minWidth: 120 }}>ИНН</th>
                <th className="fuel-cell--center" style={{ minWidth: 130 }}>ОГРН</th>
                <th className="fuel-cell--center" style={{ minWidth: 100 }}>КПП</th>
                <th style={{ minWidth: 280 }}>Адрес</th>
                {canDelete && <th className="fuel-cell--center" style={{ minWidth: 70 }} />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  style={{ cursor: 'pointer' }}
                  title="Открыть карточку контрагента"
                  onClick={() => navigate(`/directories/counterparties/${row.id}`)}
                >
                  <td className="fuel-cell--left">{row.nameShort || row.nameFull}</td>
                  <td className="fuel-cell--center">{row.inn}</td>
                  <td className="fuel-cell--center">{row.ogrn || '—'}</td>
                  <td className="fuel-cell--center">{row.kpp || '—'}</td>
                  <td className="fuel-cell--left">{row.address || '—'}</td>
                  {canDelete && (
                    <td className="fuel-cell--center dir-actions">
                      <Tooltip title="Удалить из справочника">
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            void removeRow(row);
                          }}
                        >
                          <Delete sx={{ fontSize: 17 }} />
                        </IconButton>
                      </Tooltip>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canDelete ? 6 : 5} className="fuel-empty">
                    Справочник пуст — добавьте контрагента по ИНН
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Новый контрагент</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ display: 'grid', gap: 1.5, mt: 1 }}>
            <TextField
              size="small" label="ИНН" autoFocus fullWidth
              value={addInn}
              onChange={(event) => {
                setAddInn(event.target.value.replace(/\D/g, '').slice(0, 12));
                setNeedManualName(false);
              }}
              helperText="10 или 12 цифр — реквизиты подтянутся из ФНС"
            />
            {needManualName && (
              <TextField
                size="small" label="Полное наименование" fullWidth
                value={addName}
                onChange={(event) => setAddName(event.target.value)}
                helperText="ФНС не дала данных — введите наименование вручную"
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} disabled={adding}>Отмена</Button>
          <Button
            variant="contained"
            onClick={() => void submitAdd()}
            disabled={adding || !innValid || (needManualName && !addName.trim())}
          >
            {adding ? 'Добавление…' : 'Добавить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(feedback)}
        autoHideDuration={4000}
        onClose={() => setFeedback(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={feedback?.severity ?? 'success'} onClose={() => setFeedback(null)}>
          {feedback?.text ?? ''}
        </Alert>
      </Snackbar>
    </div>
  );
}
