import { Download, Visibility } from '@mui/icons-material';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import {
  CandidateCheck,
  CandidateCheckStatus,
  decideCandidateCheck,
  downloadCandidateCheckAttachment,
  previewCandidateCheckAttachment,
} from '../../services/api';
import { PreviewDialog } from '../contracts/ContractDialogs';
import {
  candidateDecisionLabels,
  candidateErrorMessage,
  candidateStatusChip,
  candidateStatusLabels,
  formatCandidateDateTime,
  formatSurnameInitials,
} from '../../utils/candidate-checks';

type DecisionValue = Exclude<CandidateCheckStatus, 'pending_security'>;

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

type Props = {
  check: CandidateCheck | null;
  canDecide: boolean;
  onClose: () => void;
  onDecided: (updated: CandidateCheck) => void;
  onError?: (message: string) => void;
};

export function CandidateCheckDialog({ check, canDecide, onClose, onDecided, onError }: Props) {
  const [decision, setDecision] = useState<DecisionValue | ''>('');
  const [securityComment, setSecurityComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMimeType, setPreviewMimeType] = useState<string | null>(null);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);

  useEffect(() => {
    setDecision('');
    setSecurityComment('');
  }, [check?.id]);

  const reportError = (message: string) => {
    if (onError) onError(message);
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewAttachmentId(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const handlePreview = async (attachmentId: string, fileName: string) => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewFileName(fileName);
    setPreviewAttachmentId(attachmentId);
    try {
      const response = await previewCandidateCheckAttachment(attachmentId);
      const blob = response.data as Blob;
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
      setPreviewMimeType(blob.type || null);
    } catch (error) {
      setPreviewError(candidateErrorMessage(error, 'Не удалось открыть предпросмотр анкеты'));
      setPreviewUrl(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async (attachmentId: string, fileName: string) => {
    try {
      const response = await downloadCandidateCheckAttachment(attachmentId);
      downloadBlob(response.data as Blob, fileName);
    } catch (error) {
      reportError(candidateErrorMessage(error, 'Не удалось скачать анкету'));
    }
  };

  const handleDecision = async () => {
    if (!check || !decision) return;
    setSubmitting(true);
    try {
      const response = await decideCandidateCheck(check.id, { decision, securityComment });
      onDecided(response.data);
    } catch (error) {
      reportError(candidateErrorMessage(error, 'Не удалось сохранить решение'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={Boolean(check)} onClose={onClose} maxWidth="md" fullWidth>
        {check && (
          <>
            <DialogTitle>Проверка кандидата: {check.candidateFullName}</DialogTitle>
            <DialogContent>
              <Stack spacing={1.5} sx={{ pt: 1 }}>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Должность</Typography>
                      <Typography>{check.position || '—'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Статус</Typography>
                      <Typography>{candidateStatusLabels[check.status]}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Телефон</Typography>
                      <Typography>{check.phone || '—'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Email</Typography>
                      <Typography>{check.email || '—'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Инициатор</Typography>
                      <Typography>{check.createdByName || '—'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Создано</Typography>
                      <Typography>{formatCandidateDateTime(check.createdAt)}</Typography>
                    </Box>
                  </Box>
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Комментарий HR</Typography>
                  <Typography color={check.hrComment ? 'text.primary' : 'text.secondary'}>
                    {check.hrComment || 'Комментарий не указан.'}
                  </Typography>
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.75 }}>Анкета кандидата</Typography>
                  {check.attachments?.length ? (
                    <Stack spacing={0.75}>
                      {check.attachments.map((attachment) => (
                        <Stack
                          key={attachment.id}
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          spacing={1}
                          sx={{ bgcolor: '#f6f8fc', borderRadius: 1, px: 1.25, py: 0.75 }}
                        >
                          <Typography sx={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={attachment.originalName}>
                            {attachment.originalName}
                          </Typography>
                          <Stack direction="row" spacing={0.5} sx={{ flex: 'none' }}>
                            <Button size="small" startIcon={<Visibility />} onClick={() => handlePreview(attachment.id, attachment.originalName)}>
                              Просмотр
                            </Button>
                            <Button size="small" startIcon={<Download />} onClick={() => handleDownload(attachment.id, attachment.originalName)}>
                              Скачать
                            </Button>
                          </Stack>
                        </Stack>
                      ))}
                    </Stack>
                  ) : (
                    <Typography color="text.secondary">Анкета не приложена.</Typography>
                  )}
                </Paper>

                {check.status !== 'pending_security' && (
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ mb: 0.75 }}>Решение СБ</Typography>
                    <Box
                      component="span"
                      sx={{ display: 'inline-block', px: 1, py: '2px', borderRadius: '6px', fontWeight: 650, fontSize: 13, ...candidateStatusChip(check.status) }}
                    >
                      {candidateStatusLabels[check.status]}
                    </Box>
                    {check.securityComment && (
                      <Box sx={{ mt: 1.25 }}>
                        <Typography variant="caption" color="text.secondary">Комментарий</Typography>
                        <Typography>{check.securityComment}</Typography>
                      </Box>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
                      Решение принял: {formatSurnameInitials(check.decidedByName)} · {formatCandidateDateTime(check.decidedAt)}
                    </Typography>
                  </Paper>
                )}

                {canDecide && check.status === 'pending_security' && (
                  <Paper variant="outlined" sx={{ p: 1.5, borderColor: '#c7d7ef', bgcolor: '#f7faff' }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Решение по кандидату</Typography>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems="flex-start">
                      <FormControl size="small" sx={{ minWidth: 240, flex: 'none' }}>
                        <InputLabel>Решение</InputLabel>
                        <Select
                          label="Решение"
                          value={decision}
                          onChange={(event) => setDecision(event.target.value as DecisionValue)}
                        >
                          {Object.entries(candidateDecisionLabels).map(([value, label]) => (
                            <MenuItem value={value} key={value}>{label}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        size="small"
                        label="Комментарий"
                        value={securityComment}
                        onChange={(event) => setSecurityComment(event.target.value)}
                        multiline
                        minRows={2}
                        fullWidth
                      />
                    </Stack>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
                      <Button
                        variant="contained"
                        onClick={handleDecision}
                        disabled={
                          submitting
                          || !decision
                          || ((decision === 'approved_with_remarks' || decision === 'rejected') && !securityComment.trim())
                        }
                      >
                        Сохранить решение
                      </Button>
                    </Box>
                  </Paper>
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={onClose}>Закрыть</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <PreviewDialog
        open={previewOpen}
        fileName={previewFileName}
        previewUrl={previewUrl}
        mimeType={previewMimeType}
        attachmentId={previewAttachmentId}
        loading={previewLoading}
        error={previewError}
        onClose={closePreview}
        onDownloadOriginal={() => {
          if (previewAttachmentId) void handleDownload(previewAttachmentId, previewFileName || 'анкета');
        }}
      />
    </>
  );
}
