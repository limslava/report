import { ContentPaste } from '@mui/icons-material';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  TextField,
} from '@mui/material';
import { useState } from 'react';
import { buildUploadReport } from '../../utils/warehouse-upload-log';

/**
 * «Скопировать отчёт» — диагностика загрузки фото для разбора проблем в поле.
 * Кладовщик жмёт кнопку и присылает текст из буфера; если буфер недоступен,
 * отчёт открывается в окне для ручного копирования.
 */
export default function UploadReportButton({ size = 'small' }: { size?: 'small' | 'medium' }) {
  const [copied, setCopied] = useState(false);
  const [fallbackReport, setFallbackReport] = useState<string | null>(null);

  const handleClick = async () => {
    const report = await buildUploadReport();
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
    } catch {
      setFallbackReport(report);
    }
  };

  return (
    <>
      <Button size={size} variant="text" startIcon={<ContentPaste />} onClick={() => void handleClick()}>
        Скопировать отчёт
      </Button>
      <Snackbar
        open={copied}
        autoHideDuration={3000}
        onClose={() => setCopied(false)}
        message="Отчёт о загрузке скопирован — пришлите его в чат поддержки"
      />
      <Dialog open={Boolean(fallbackReport)} onClose={() => setFallbackReport(null)} fullWidth maxWidth="sm">
        <DialogTitle>Отчёт о загрузке фото</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            minRows={10}
            maxRows={16}
            value={fallbackReport ?? ''}
            InputProps={{ readOnly: true }}
            onFocus={(event) => event.target.select()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFallbackReport(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
