import {
  Add,
  AttachFile,
  Close,
  Search,
  Visibility,
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
  IconButton,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CandidateCheck,
  CandidateCheckStatus,
  createCandidateCheck,
  getCandidateChecks,
} from '../services/api';
import { CandidateCheckDialog } from '../components/candidate-checks/CandidateCheckDialog';
import { PreviewDialog } from '../components/contracts/ContractDialogs';
import { candidateStatusChip } from '../utils/candidate-checks';
import { useAuthStore } from '../store/auth-store';
import '../styles/contract-approval.css';

const canPreviewLocally = (file: File): boolean => {
  const name = file.name.toLowerCase();
  return (file.type || '').startsWith('image/')
    || file.type === 'application/pdf'
    || name.endsWith('.pdf')
    || /\.(png|jpe?g)$/.test(name);
};

const statusLabels: Record<CandidateCheckStatus, string> = {
  pending_security: 'Проверка СБ',
  approved: 'Согласован',
  approved_with_remarks: 'Согласован с замечаниями',
  rejected: 'Не согласован',
};

const formatSurnameInitials = (fullName?: string | null): string => {
  const raw = String(fullName ?? '').trim().replace(/\s+/g, ' ');
  if (!raw) return '—';
  const parts = raw.split(' ');
  if (parts.length === 1) return parts[0];
  const [surname, ...rest] = parts;
  const initials = rest
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(' ');
  return `${surname} ${initials}`.trim();
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

export default function CandidateChecksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';
  const isHr = isAdmin || user?.role === 'hr_recruiter';
  const isSecurity = isAdmin || user?.role === 'security';
  const [items, setItems] = useState<CandidateCheck[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<CandidateCheckStatus | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState<CandidateCheck | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [localPreview, setLocalPreview] = useState<{ url: string; name: string; mime: string | null } | null>(null);

  const openLocalPreview = (file: File) => {
    if (localPreview) URL.revokeObjectURL(localPreview.url);
    setLocalPreview({ url: URL.createObjectURL(file), name: file.name, mime: file.type || null });
  };
  const closeLocalPreview = () => {
    if (localPreview) URL.revokeObjectURL(localPreview.url);
    setLocalPreview(null);
  };

  useEffect(() => {
    const statusParam = searchParams.get('status');
    const nextStatus = (
      statusParam === 'pending_security'
      || statusParam === 'approved'
      || statusParam === 'approved_with_remarks'
      || statusParam === 'rejected'
    ) ? statusParam : '';
    setStatus(nextStatus);
  }, [searchParams]);

  // Открыть форму создания по прямой ссылке (кнопка «Новая проверка» с дашборда),
  // затем сразу убрать параметр из адреса, чтобы перезагрузка не открывала форму заново.
  useEffect(() => {
    if (isHr && searchParams.get('new') === '1') {
      setCreateOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [isHr, searchParams, setSearchParams]);

  const requestIdRef = useRef(0);
  const loadItems = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await getCandidateChecks({
        q: q.trim() || undefined,
        status: status || undefined,
      });
      // Применяем результат только последнего запроса (защита от гонки при
      // переходе с фильтром в адресе — иначе «пустой» ответ может перетереть отфильтрованный).
      if (requestId !== requestIdRef.current) return;
      setItems(response.data);
      const candidateCheckId = searchParams.get('candidateCheckId');
      if (candidateCheckId) {
        const match = response.data.find((item) => item.id === candidateCheckId);
        if (match) setSelected(match);
      }
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(errorMessage(loadError, 'Не удалось загрузить проверки кандидатов'));
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [q, searchParams, status]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const files = await Promise.all(createFiles.map(fileToPayload));
      const response = await createCandidateCheck({ ...createForm, files });
      // Закрываем форму и возвращаемся к списку (новая строка уже сверху),
      // без автооткрытия карточки — показываем короткое подтверждение.
      setItems((prev) => [response.data, ...prev]);
      setCreateOpen(false);
      setCreateForm(emptyCreateForm);
      setCreateFiles([]);
      setSuccess(`Проверка кандидата «${response.data.candidateFullName}» отправлена.`);
    } catch (createError) {
      setError(errorMessage(createError, 'Не удалось создать проверку кандидата'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecided = (updated: CandidateCheck) => {
    setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setSelected(updated);
  };

  return (
    <Box sx={{ px: { xs: 0.125, sm: 0.25 }, py: { xs: 0.25, sm: 0.375 }, display: 'grid', gap: 0.5 }}>
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Paper sx={{ p: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', md: `1fr 220px${isHr ? ' auto' : ''}` }, gap: 1, alignItems: 'center' }}>
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
        {isHr && (
          <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)} sx={{ whiteSpace: 'nowrap' }}>
            Новая проверка
          </Button>
        )}
      </Paper>

      <Paper sx={{ px: 0.25, py: 0.5 }}>
        <TableContainer className="contract-registry-table-wrap">
          <Table size="small" className="contract-registry-table">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 40 }}>№</TableCell>
                <TableCell>Кандидат</TableCell>
                <TableCell>Должность</TableCell>
                <TableCell>Телефон</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Комментарий</TableCell>
                <TableCell>Инициатор</TableCell>
                <TableCell>Создано</TableCell>
                <TableCell align="center">Файлы</TableCell>
                <TableCell>Статус</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={item.id} hover onClick={() => setSelected(item)} sx={{ cursor: 'pointer' }}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} title={item.candidateFullName}>{item.candidateFullName}</TableCell>
                  <TableCell title={item.position || ''}>{item.position || '—'}</TableCell>
                  <TableCell>{item.phone || '—'}</TableCell>
                  <TableCell>{item.email || '—'}</TableCell>
                  <TableCell title={item.hrComment || ''}>{item.hrComment || '—'}</TableCell>
                  <TableCell title={item.createdByName || ''}>{formatSurnameInitials(item.createdByName)}</TableCell>
                  <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                  <TableCell align="center">{item.attachments?.length || '—'}</TableCell>
                  <TableCell>
                    <Box component="span" sx={{ display: 'inline-block', px: 0.75, py: '1px', borderRadius: '5px', fontWeight: 650, ...candidateStatusChip(item.status) }}>
                      {statusLabels[item.status]}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    Проверок кандидатов пока нет.
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    Загрузка...
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

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
              Прикрепить файлы
              <input
                type="file"
                hidden
                multiple
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={(event) => {
                  const picked = Array.from(event.target.files ?? []);
                  setCreateFiles((prev) => {
                    const merged = [...prev];
                    for (const file of picked) {
                      if (!merged.some((existing) => existing.name === file.name && existing.size === file.size)) {
                        merged.push(file);
                      }
                    }
                    return merged.slice(0, 10);
                  });
                  event.target.value = '';
                }}
              />
            </Button>
            <Box>
              {createFiles.length ? (
                <Stack spacing={0.5}>
                  {createFiles.map((file) => {
                    const canPreview = canPreviewLocally(file);
                    return (
                      <Stack
                        key={`${file.name}-${file.size}`}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        spacing={1}
                        sx={{ bgcolor: '#f4f6fa', borderRadius: 1, px: 1, py: 0.5 }}
                      >
                        <Typography
                          variant="body2"
                          onClick={canPreview ? () => openLocalPreview(file) : undefined}
                          sx={{
                            color: canPreview ? 'primary.main' : 'text.secondary',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: canPreview ? 'pointer' : 'default',
                            '&:hover': canPreview ? { textDecoration: 'underline' } : undefined,
                          }}
                          title={canPreview ? 'Открыть предпросмотр' : 'Предпросмотр DOC/DOCX доступен после сохранения'}
                        >
                          {file.name}
                        </Typography>
                        <Stack direction="row" spacing={0.25} sx={{ flex: 'none' }}>
                          {canPreview && (
                            <IconButton size="small" aria-label="Просмотр" onClick={() => openLocalPreview(file)}>
                              <Visibility fontSize="small" />
                            </IconButton>
                          )}
                          <IconButton
                            size="small"
                            aria-label="Удалить файл"
                            onClick={() => setCreateFiles((prev) => prev.filter((f) => !(f.name === file.name && f.size === file.size)))}
                          >
                            <Close fontSize="small" />
                          </IconButton>
                        </Stack>
                      </Stack>
                    );
                  })}
                  <Typography variant="caption" color="text.secondary">
                    Можно прикрепить несколько файлов (до 10). Форматы: PDF, DOC, DOCX, PNG, JPG. Предпросмотр DOC/DOCX — после сохранения.
                  </Typography>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Прикрепите один или несколько файлов: PDF, DOC, DOCX, PNG или JPG.
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
            {submitting ? 'Отправка…' : 'Отправить'}
          </Button>
        </DialogActions>
      </Dialog>

      <CandidateCheckDialog
        check={selected}
        canDecide={isSecurity}
        onClose={() => setSelected(null)}
        onDecided={handleDecided}
        onError={setError}
      />

      <PreviewDialog
        open={Boolean(localPreview)}
        fileName={localPreview?.name || ''}
        previewUrl={localPreview?.url || null}
        mimeType={localPreview?.mime || null}
        attachmentId={null}
        loading={false}
        error={null}
        onClose={closeLocalPreview}
        onDownloadOriginal={() => {}}
      />
    </Box>
  );
}
