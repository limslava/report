import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type {
  ContractAttachmentRef,
  ContractRecord,
  DecisionHistoryEvent,
} from '../../types/contracts';
import { formatDateTime, formatDecisionLabel } from '../../utils/contract-approval';

type PreviewDialogProps = {
  open: boolean;
  fileName: string;
  previewUrl: string | null;
  mimeType: string | null;
  attachmentId: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onDownloadOriginal: () => void;
};

type HistoryDialogProps = {
  open: boolean;
  contractNumber: string;
  loading: boolean;
  events: DecisionHistoryEvent[];
  onClose: () => void;
};

type DeleteDraftDialogProps = {
  target: ContractRecord | null;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

type RevisionDialogProps = {
  target: ContractRecord | null;
  preparing: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

type DeleteAttachmentDialogProps = {
  target: { file: ContractAttachmentRef; contractId: string } | null;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function PreviewDialog({
  open,
  fileName,
  previewUrl,
  mimeType,
  attachmentId,
  loading,
  error,
  onClose,
  onDownloadOriginal,
}: PreviewDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{fileName || 'Просмотр договора'}</DialogTitle>
      <DialogContent sx={{ minHeight: 620, p: 0, overflow: 'auto' }}>
        {!loading && !error && previewUrl && /\.docx$/i.test(fileName) && (
          <Alert severity="info" sx={{ borderRadius: 0 }}>
            Для просмотра показана PDF-версия документа. При скачивании будет сохранен исходный файл DOCX.
          </Alert>
        )}
        {loading && (
          <Box sx={{ minHeight: 620, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        )}
        {!loading && error && (
          <Box sx={{ p: 2 }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}
        {!loading && !error && previewUrl && (
          mimeType?.startsWith('image/') ? (
            <Box
              sx={{
                minHeight: 620,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#f7f9fc',
              }}
            >
              <Box
                component="img"
                src={previewUrl}
                alt={fileName || 'preview'}
                sx={{
                  maxWidth: '100%',
                  maxHeight: '75vh',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            </Box>
          ) : (
            <iframe
              title={fileName || 'contract-preview'}
              src={previewUrl}
              style={{ border: 0, width: '100%', height: '75vh' }}
            />
          )
        )}
      </DialogContent>
      <DialogActions>
        {previewUrl && attachmentId && (
          <Button onClick={onDownloadOriginal}>Скачать оригинал</Button>
        )}
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}

export function HistoryDialog({
  open,
  contractNumber,
  loading,
  events,
  onClose,
}: HistoryDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>История решений по договору № {contractNumber || '—'}</DialogTitle>
      <DialogContent dividers>
        {loading && (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={18} />
            <Typography variant="body2">Загрузка истории...</Typography>
          </Stack>
        )}
        {!loading && !events.length && (
          <Typography variant="body2" color="text.secondary">
            История решений пока отсутствует. Визы, сохраненные до добавления журнала, здесь не отображаются.
          </Typography>
        )}
        {!loading && Boolean(events.length) && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Дата изменения</TableCell>
                  <TableCell>Редакция</TableCell>
                  <TableCell>Сторона</TableCell>
                  <TableCell>Кто изменил</TableCell>
                  <TableCell>Было</TableCell>
                  <TableCell>Стало</TableCell>
                  <TableCell>Комментарий</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(event.createdAt)}</TableCell>
                    <TableCell>{event.revisionNo}</TableCell>
                    <TableCell>{event.roleLabel}</TableCell>
                    <TableCell>{event.actorName}</TableCell>
                    <TableCell>{formatDecisionLabel(event.previousDecision, event.previousComment)}</TableCell>
                    <TableCell>{formatDecisionLabel(event.newDecision, event.newComment)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{event.newComment || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}

export function DeleteDraftDialog({
  target,
  deleting,
  onClose,
  onConfirm,
}: DeleteDraftDialogProps) {
  return (
    <Dialog open={Boolean(target)} onClose={() => !deleting && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>Удалить черновик?</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          Договор № {target?.contractNumber || '—'} и приложенные к нему файлы будут удалены без возможности восстановления.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={deleting}>Отменить</Button>
        <Button color="error" variant="contained" onClick={onConfirm} disabled={deleting}>
          {deleting ? 'Удаление...' : 'Удалить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function RevisionDialog({
  target,
  preparing,
  onClose,
  onConfirm,
}: RevisionDialogProps) {
  return (
    <Dialog open={Boolean(target)} onClose={() => !preparing && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>Начать новую редакцию?</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          Текущий круг виз останется в истории. Приложите измененный договор, после чего он будет направлен на новый круг согласования.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={preparing}>Отменить</Button>
        <Button variant="contained" onClick={onConfirm} disabled={preparing}>
          {preparing ? 'Подготовка...' : 'Продолжить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function DeleteAttachmentDialog({
  target,
  deleting,
  onClose,
  onConfirm,
}: DeleteAttachmentDialogProps) {
  return (
    <Dialog open={Boolean(target)} onClose={() => !deleting && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>Удалить файл?</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          Файл «{target?.file.originalName || '—'}» будет удален из истории согласования без возможности восстановления.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={deleting}>Отменить</Button>
        <Button color="error" variant="contained" onClick={onConfirm} disabled={deleting}>
          {deleting ? 'Удаление...' : 'Удалить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
