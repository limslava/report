import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Typography,
} from '@mui/material';
import { importDispatcherOrders, type DispatcherImportSummary } from '../../services/dispatcher-journal.api';

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

const formatDate = (ymd: string | null): string => (ymd ? ymd.split('-').reverse().join('.') : '—');

const errorText = (error: unknown): string =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Не удалось обработать файл';

/**
 * Разовый перенос google-таблицы диспетчеров: выгрузка «Файл → Скачать →
 * Microsoft Excel (.xlsx)» → проверка (что и сколько найдено) → импорт.
 */
export default function DispatcherImportDialog({ open, onClose, onImported }: Props) {
  const [fileName, setFileName] = useState('');
  const [fileBase64, setFileBase64] = useState('');
  const [summary, setSummary] = useState<DispatcherImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmExisting, setConfirmExisting] = useState(false);

  const reset = () => {
    setFileName('');
    setFileBase64('');
    setSummary(null);
    setError(null);
    setConfirmExisting(false);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    reset();
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result ?? '');
      setFileBase64(base64);
      setBusy(true);
      try {
        const { data } = await importDispatcherOrders(base64, true);
        setSummary(data);
      } catch (checkError) {
        setError(errorText(checkError));
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const runImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await importDispatcherOrders(fileBase64, false);
      setSummary(data);
      onImported();
    } catch (importError) {
      setError(errorText(importError));
    } finally {
      setBusy(false);
    }
  };

  const imported = Boolean(summary?.imported);
  const needsConfirm = Boolean(summary && summary.existingInRange > 0 && !imported);

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle>Импорт из Google-таблицы</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13, color: '#4b5563', mb: 1.5 }}>
          В Google-таблице: «Файл → Скачать → Microsoft Excel (.xlsx)». Берутся листы с шапкой реестра
          (статус, клиент…) — обычно это листы-месяцы; «терминалы», «почта» и прочие служебные листы пропускаются.
        </Typography>
        <Button variant="outlined" component="label" disabled={busy}>
          {fileName ? 'Выбрать другой файл' : 'Выбрать файл .xlsx'}
          <input
            hidden
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              pickFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </Button>
        {fileName && <Typography sx={{ fontSize: 13, mt: 1 }}>{fileName}{busy && ' — обработка…'}</Typography>}
        {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
        {summary && (
          <Box sx={{ mt: 1.5, fontSize: 13 }}>
            {imported ? (
              <Alert severity="success" sx={{ mb: 1 }}>Импортировано заявок: {summary.imported}</Alert>
            ) : (
              <Alert severity="info" sx={{ mb: 1 }}>
                Найдено заявок: {summary.total} за период {formatDate(summary.from)} — {formatDate(summary.to)}
              </Alert>
            )}
            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', '& td, & th': { borderBottom: '1px solid #eceff3', py: 0.5, px: 0.75, textAlign: 'left' } }}>
              <thead>
                <tr><th>Лист</th><th>Заявок</th><th>Период</th><th>Пропущено строк</th></tr>
              </thead>
              <tbody>
                {summary.sheets.map((sheet) => (
                  <tr key={sheet.name}>
                    <td>{sheet.name}</td>
                    <td>{sheet.orders}</td>
                    <td>{formatDate(sheet.from)} — {formatDate(sheet.to)}</td>
                    <td>{sheet.skippedRows}</td>
                  </tr>
                ))}
              </tbody>
            </Box>
            {summary.unknownStatuses.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                Статусы, которых нет в справочнике (перенесутся текстом, без цвета): {summary.unknownStatuses.join(', ')}
              </Alert>
            )}
            {needsConfirm && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                За этот период в реестре уже есть заявок: {summary.existingInRange}. Импорт добавит строки из файла
                к ним — повторный импорт того же файла создаст дубли.
                <FormControlLabel
                  sx={{ display: 'block', mt: 0.5 }}
                  control={<Checkbox size="small" checked={confirmExisting} onChange={(event) => setConfirmExisting(event.target.checked)} />}
                  label="Понимаю, всё равно импортировать"
                />
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>{imported ? 'Готово' : 'Отмена'}</Button>
        {!imported && (
          <Button
            variant="contained"
            disabled={busy || !summary || (needsConfirm && !confirmExisting)}
            onClick={() => void runImport()}
          >
            Импортировать {summary ? summary.total : ''}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
