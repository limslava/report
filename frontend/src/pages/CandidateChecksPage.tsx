import {
  Add,
  AttachFile,
  Download,
  Search,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CandidateCheck,
  CandidateCheckStatus,
  createCandidateCheck,
  decideCandidateCheck,
  downloadCandidateCheckAttachment,
  getCandidateChecks,
} from '../services/api';
import { useAuthStore } from '../store/auth-store';

const statusLabels: Record<CandidateCheckStatus, string> = {
  pending_security: 'Проверка СБ',
  approved: 'Согласован',
  approved_with_remarks: 'Согласован с замечаниями',
  rejected: 'Не согласован',
};

const decisionLabels: Record<Exclude<CandidateCheckStatus, 'pending_security'>, string> = {
  approved: 'Согласован',
  approved_with_remarks: 'Согласован с замечаниями',
  rejected: 'Не согласован',
};

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Vladivostok',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
};

const errorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string; errors?: Array<{ msg?: string }> } } }).response;
    return response?.data?.message || response?.data?.errors?.[0]?.msg || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
};

const emptyCreateForm = {
  candidateFullName: '',
  position: '',
  phone: '',
  email: '',
  hrComment: '',
};

const fileToPayload = (file: File): Promise<{
  name: string;
  mimeType: string | null;
  size: number;
  contentBase64: string;
}> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    resolve({
      name: file.name,
      mimeType: file.type || null,
      size: file.size,
      contentBase64: result.includes(',') ? result.split(',')[1] : result,
    });
  };
  reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать файл'));
  reader.readAsDataURL(file);
});

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

export default function CandidateChecksPage() {
  const [searchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';
  const isHr = isAdmin || user?.role === 'head_hr' || user?.role === 'hr_specialist';
  const isSecurity = isAdmin || user?.role === 'security';
  const [items, setItems] = useState<CandidateCheck[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<CandidateCheckStatus | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState<CandidateCheck | null>(null);
  const [decision, setDecision] = useState<Exclude<CandidateCheckStatus, 'pending_security'> | ''>('');
  const [securityComment, setSecurityComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getCandidateChecks({
        q: q.trim() || undefined,
        status: status || undefined,
      });
      setItems(response.data);
      const candidateCheckId = searchParams.get('candidateCheckId');
      if (candidateCheckId) {
        const match = response.data.find((item) => item.id === candidateCheckId);
        if (match) setSelected(match);
      }
    } catch (loadError) {
      setError(errorMessage(loadError, 'Не удалось загрузить проверки кандидатов'));
    } finally {
      setLoading(false);
    }
  }, [q, searchParams, status]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const canDecideSelected = useMemo(
    () => Boolean(isSecurity && selected?.status === 'pending_security'),
    [isSecurity, selected],
  );

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const files = await Promise.all(createFiles.map(fileToPayload));
      const response = await createCandidateCheck({ ...createForm, files });
      setItems((prev) => [response.data, ...prev]);
      setCreateOpen(false);
      setCreateForm(emptyCreateForm);
      setCreateFiles([]);
      setSelected(response.data);
    } catch (createError) {
      setError(errorMessage(createError, 'Не удалось создать проверку кандидата'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadAttachment = async (attachmentId: string, filename: string) => {
    setError(null);
    try {
      const response = await downloadCandidateCheckAttachment(attachmentId);
      downloadBlob(response.data, filename);
    } catch (downloadError) {
      setError(errorMessage(downloadError, 'Не удалось скачать анкету'));
    }
  };

  const handleDecision = async () => {
    if (!selected || !decision) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await decideCandidateCheck(selected.id, {
        decision,
        securityComment,
      });
      setItems((prev) => prev.map((item) => (item.id === response.data.id ? response.data : item)));
      setSelected(response.data);
      setDecision('');
      setSecurityComment('');
    } catch (decisionError) {
      setError(errorMessage(decisionError, 'Не удалось сохранить решение'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ mb: 1.5, p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Проверка кандидатов
        </Typography>
        {isHr && (
          <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
            Новая проверка
          </Button>
        )}
      </Paper>

      <Paper sx={{ mb: 1.5, p: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 260px' }, gap: 1 }}>
        <TextField
          size="small"
          label="Поиск"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="ФИО, должность, телефон, email"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <FormControl size="small">
          <InputLabel>Статус</InputLabel>
          <Select
            label="Статус"
            value={status}
            onChange={(event) => setStatus(event.target.value as CandidateCheckStatus | '')}
          >
            <MenuItem value="">Все статусы</MenuItem>
            {Object.entries(statusLabels).map(([value, label]) => (
              <MenuItem value={value} key={value}>{label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small" sx={{ '& th, & td': { borderRight: '1px solid #d6dee8' } }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f3f6fb' }}>
              <TableCell sx={{ width: 70, fontWeight: 700 }}>№</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Кандидат</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Должность</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Контакты</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>HR</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Создано</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Анкета</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Статус</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Решение СБ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item, index) => (
              <TableRow
                key={item.id}
                hover
                onDoubleClick={() => setSelected(item)}
                sx={{ bgcolor: index % 2 === 0 ? '#eef4fd' : '#fff', cursor: 'pointer' }}
              >
                <TableCell>{index + 1}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{item.candidateFullName}</TableCell>
                <TableCell>{item.position || '—'}</TableCell>
                <TableCell>
                  {[item.phone, item.email].filter(Boolean).join(', ') || '—'}
                </TableCell>
                <TableCell>{item.createdByName || '—'}</TableCell>
                <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                <TableCell>{item.attachments?.length ? `${item.attachments.length} файл(а)` : '—'}</TableCell>
                <TableCell>{statusLabels[item.status]}</TableCell>
                <TableCell>
                  {item.decidedByName
                    ? `${item.decidedByName}, ${formatDateTime(item.decidedAt)}`
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                  Проверок кандидатов пока нет.
                </TableCell>
              </TableRow>
            )}
            {loading && (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                  Загрузка...
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Новая проверка кандидата</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="ФИО кандидата"
              value={createForm.candidateFullName}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, candidateFullName: event.target.value }))}
              required
              fullWidth
            />
            <TextField
              label="Должность"
              value={createForm.position}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, position: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Телефон"
              value={createForm.phone}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Email"
              value={createForm.email}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Комментарий HR"
              value={createForm.hrComment}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, hrComment: event.target.value }))}
              multiline
              minRows={3}
              fullWidth
            />
            <Button
              component="label"
              variant="outlined"
              startIcon={<AttachFile />}
              sx={{ alignSelf: 'flex-start' }}
            >
              Прикрепить анкету
              <input
                type="file"
                hidden
                multiple
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  setCreateFiles(files);
                  event.target.value = '';
                }}
              />
            </Button>
            <Box>
              {createFiles.length ? (
                createFiles.map((file) => (
                  <Typography variant="body2" key={`${file.name}-${file.size}`} sx={{ color: 'text.secondary' }}>
                    {file.name}
                  </Typography>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Анкета обязательна: PDF, DOC, DOCX, PNG или JPG.
                </Typography>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={submitting || !createForm.candidateFullName.trim() || createFiles.length === 0}
          >
            Отправить в СБ
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="md" fullWidth>
        {selected && (
          <>
            <DialogTitle>
              Проверка кандидата: {selected.candidateFullName}
            </DialogTitle>
            <DialogContent>
              <Stack spacing={1.5} sx={{ pt: 1 }}>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Должность</Typography>
                      <Typography>{selected.position || '—'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Статус</Typography>
                      <Typography>{statusLabels[selected.status]}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Телефон</Typography>
                      <Typography>{selected.phone || '—'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Email</Typography>
                      <Typography>{selected.email || '—'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">HR</Typography>
                      <Typography>{selected.createdByName || '—'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Создано</Typography>
                      <Typography>{formatDateTime(selected.createdAt)}</Typography>
                    </Box>
                  </Box>
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Комментарий HR</Typography>
                  <Typography color={selected.hrComment ? 'text.primary' : 'text.secondary'}>
                    {selected.hrComment || 'Комментарий не указан.'}
                  </Typography>
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Анкета кандидата</Typography>
                  {selected.attachments?.length ? (
                    <Stack spacing={0.5}>
                      {selected.attachments.map((attachment) => (
                        <Box
                          key={attachment.id}
                          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
                        >
                          <Typography>{attachment.originalName}</Typography>
                          <Button
                            size="small"
                            startIcon={<Download />}
                            onClick={() => handleDownloadAttachment(attachment.id, attachment.originalName)}
                          >
                            Скачать
                          </Button>
                        </Box>
                      ))}
                    </Stack>
                  ) : (
                    <Typography color="text.secondary">Анкета не приложена.</Typography>
                  )}
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Решение СБ</Typography>
                  {selected.status === 'pending_security' ? (
                    <Typography color="text.secondary">Решение ещё не принято.</Typography>
                  ) : (
                    <>
                      <Typography>{statusLabels[selected.status]}</Typography>
                      <Typography color="text.secondary">
                        {selected.decidedByName || '—'}, {formatDateTime(selected.decidedAt)}
                      </Typography>
                      <Typography sx={{ mt: 1 }}>
                        {selected.securityComment || 'Комментарий не указан.'}
                      </Typography>
                    </>
                  )}
                </Paper>

                {canDecideSelected && (
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Ваша задача: проверка кандидата</Typography>
                    <Stack spacing={1.5}>
                      <FormControl fullWidth>
                        <InputLabel>Решение</InputLabel>
                        <Select
                          label="Решение"
                          value={decision}
                          onChange={(event) => setDecision(event.target.value as Exclude<CandidateCheckStatus, 'pending_security'>)}
                        >
                          {Object.entries(decisionLabels).map(([value, label]) => (
                            <MenuItem value={value} key={value}>{label}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        label="Комментарий"
                        value={securityComment}
                        onChange={(event) => setSecurityComment(event.target.value)}
                        multiline
                        minRows={3}
                        fullWidth
                      />
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
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
                    </Stack>
                  </Paper>
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelected(null)}>Закрыть</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
