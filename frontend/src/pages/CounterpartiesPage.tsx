import { useEffect, useState } from 'react';
import { Alert, Box, Paper, Snackbar, TextField } from '@mui/material';
import api from '../services/api';
import '../styles/operations-preview.css';
import '../styles/fuel.css';

/**
 * Справочник контрагентов (каркас): список организаций из общего справочника
 * (тот же, что в БП договоров). «Проваливание» в контрагента — водители,
 * техника, прицепы — будет добавлено следующим шагом.
 */

type CounterpartyRow = {
  id: string;
  inn: string;
  nameFull: string;
  nameShort: string | null;
  ogrn: string | null;
  kpp: string | null;
  address: string | null;
};

export default function CounterpartiesPage() {
  const [rows, setRows] = useState<CounterpartyRow[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get<CounterpartyRow[]>('/directories/counterparties', {
          params: { q: query.trim() || undefined },
        });
        setRows(response.data);
      } catch (loadError) {
        const anyError = loadError as any;
        setError(anyError?.response?.data?.message || 'Не удалось загрузить контрагентов');
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

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
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="fuel-cell--left">{row.nameShort || row.nameFull}</td>
                  <td className="fuel-cell--center">{row.inn}</td>
                  <td className="fuel-cell--center">{row.ogrn || '—'}</td>
                  <td className="fuel-cell--center">{row.kpp || '—'}</td>
                  <td className="fuel-cell--left">{row.address || '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="fuel-empty">
                    Контрагенты не найдены — организации появляются здесь из БП договоров
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Snackbar
        open={Boolean(error)}
        autoHideDuration={4000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setError(null)}>{error ?? ''}</Alert>
      </Snackbar>
    </div>
  );
}
