import { CheckCircleOutline, ErrorOutline } from '@mui/icons-material';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress } from '@mui/material';

export type ExcelExportState =
  /** файл ещё собирается на сервере и качается в браузер */
  | { status: 'preparing'; loaded: number; total: number | null }
  /** файл получен, ждём нажатия «Сохранить» */
  | { status: 'ready'; blob: Blob; filename: string }
  /** «Сохранить» нажали — дальше всё зависит от настроек браузера */
  | { status: 'saved'; blob: Blob; filename: string }
  | { status: 'error'; text: string };

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

/**
 * Окно выгрузки в Excel: сначала показываем, что файл готовится, и только потом даём «Сохранить».
 * Скачивание идёт строго по нажатию кнопки — так браузер гарантированно покажет своё окно выбора
 * папки (если оно включено) либо положит файл в загрузки, а пользователь видит, что произошло.
 */
export default function ExcelExportDialog({
  state,
  hint,
  onSave,
  onRetry,
  onClose,
}: {
  state: ExcelExportState | null;
  /** что именно выгружаем — строкой под прогрессом */
  hint?: string;
  onSave: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const preparing = state?.status === 'preparing';
  const percent =
    preparing && state.total && state.total > 0 ? Math.min(100, Math.round((state.loaded / state.total) * 100)) : null;

  return (
    <Dialog
      open={Boolean(state)}
      onClose={(_, reason) => {
        if (preparing && reason === 'backdropClick') return;
        onClose();
      }}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, width: 420, maxWidth: 'calc(100% - 32px)' } }}
    >
      <DialogTitle sx={{ pb: 1, px: 3, fontWeight: 600 }}>
        {state?.status === 'error' ? 'Не удалось подготовить файл' : 'Выгрузка в Excel'}
      </DialogTitle>

      <DialogContent sx={{ fontSize: 14, color: '#3d4757', px: 3, pb: 1 }}>
        {preparing && (
          <>
            <Box sx={{ mb: 1.5 }}>Готовим файл{hint ? `: ${hint}` : ''}…</Box>
            <LinearProgress
              variant={percent === null ? 'indeterminate' : 'determinate'}
              value={percent ?? 0}
              sx={{ height: 8, borderRadius: 4 }}
            />
            <Box sx={{ mt: 1, fontSize: 13, color: '#6b7280' }}>
              {percent === null
                ? state.loaded > 0
                  ? `Получено ${formatSize(state.loaded)}`
                  : 'Собираем данные на сервере…'
                : `${percent}% · ${formatSize(state.loaded)} из ${formatSize(state.total ?? 0)}`}
            </Box>
          </>
        )}

        {(state?.status === 'ready' || state?.status === 'saved') && (
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <CheckCircleOutline sx={{ color: '#2e7d32', mt: '2px' }} />
            <Box>
              <Box sx={{ fontWeight: 600, wordBreak: 'break-word' }}>{state.filename}</Box>
              <Box sx={{ fontSize: 13, color: '#6b7280', mt: 0.25 }}>{formatSize(state.blob.size)}</Box>
              <Box sx={{ fontSize: 13, color: '#6b7280', mt: 1 }}>
                {state.status === 'ready'
                  ? 'Нажмите «Сохранить». Браузер либо спросит папку, либо сразу положит файл в загрузки.'
                  : 'Файл передан браузеру. Если окно выбора папки не появилось — файл уже в папке загрузок.'}
              </Box>
            </Box>
          </Box>
        )}

        {state?.status === 'error' && (
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <ErrorOutline sx={{ color: '#c62828', mt: '2px' }} />
            <Box>{state.text}</Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 1,
          px: 3,
          pb: 2.5,
          '& > :not(style) ~ :not(style)': { ml: 0 },
          '& .MuiButton-root': { textTransform: 'none', fontSize: 14, fontWeight: 600, py: 0.9, whiteSpace: 'nowrap' },
        }}
      >
        <Button variant="outlined" color="inherit" sx={{ color: '#4b5563', borderColor: '#d1d5db' }} onClick={onClose}>
          {state?.status === 'saved' ? 'Готово' : 'Отмена'}
        </Button>
        {state?.status === 'error' ? (
          <Button variant="contained" disableElevation onClick={onRetry}>
            Повторить
          </Button>
        ) : (
          <Button variant="contained" disableElevation autoFocus disabled={preparing} onClick={onSave}>
            {state?.status === 'saved' ? 'Скачать ещё раз' : 'Сохранить'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
