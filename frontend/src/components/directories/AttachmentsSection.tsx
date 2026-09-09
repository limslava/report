import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import { Delete, Download, UploadFile } from '@mui/icons-material';
import {
  DirectoryAttachmentEntityType,
  DirectoryAttachmentItem,
  DirectoryAttachmentKind,
  deleteDirectoryAttachment,
  downloadDirectoryAttachment,
  getDirectoryAttachments,
  uploadDirectoryAttachment,
} from '../../services/directories.api';

export const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Файл, выбранный в несохранённой карточке — загрузится после создания записи. */
export type PendingDoc = { kind: DirectoryAttachmentKind; file: File };

const formatSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
};

/** data:...;base64,XXX → XXX */
export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const saveBlob = (data: Blob, filename: string) => {
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

type Props = {
  entityType: DirectoryAttachmentEntityType;
  /** id записи; для несохранённой карточки undefined — работает режим отложенных файлов */
  entityId: string | undefined;
  kinds: { kind: DirectoryAttachmentKind; label: string }[];
  canEdit: boolean;
  onError: (text: string) => void;
  onSuccess: (text: string) => void;
  /** отложенные файлы новой карточки (родитель загрузит их после сохранения) */
  pendingFiles?: PendingDoc[];
  onPendingChange?: (files: PendingDoc[]) => void;
};

/** Блок «Документы» в карточках справочников: список сканов по видам + загрузка. */
export default function AttachmentsSection({ entityType, entityId, kinds, canEdit, onError, onSuccess, pendingFiles, onPendingChange }: Props) {
  const [items, setItems] = useState<DirectoryAttachmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<DirectoryAttachmentKind | null>(null);

  const reload = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const { data } = await getDirectoryAttachments(entityType, entityId);
      setItems(data);
    } catch {
      // список документов не критичен для карточки — покажем пусто
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!entityId && !onPendingChange) {
    return (
      <Typography sx={{ fontSize: 12.5, color: '#6b7280', mt: 1 }}>
        Документы можно прикрепить после сохранения карточки.
      </Typography>
    );
  }

  if (!entityId && onPendingChange) {
    const pending = pendingFiles ?? [];
    const pickPending = (kind: DirectoryAttachmentKind) => {
      pendingKind.current = kind;
      inputRef.current?.click();
    };
    const handlePendingFile = (file: File | null) => {
      const kind = pendingKind.current;
      pendingKind.current = null;
      if (!file || !kind) return;
      const ext = `.${(file.name.split('.').pop() ?? '').toLowerCase()}`;
      if (!ACCEPT.split(',').includes(ext)) {
        onError('Допустимые форматы: PDF, JPG, PNG, WEBP');
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        onError('Файл больше 15 МБ');
        return;
      }
      onPendingChange([...pending, { kind, file }]);
    };
    return (
      <Box sx={{ mt: 1.5 }}>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(event) => {
            handlePendingFile(event.target.files?.[0] ?? null);
            event.target.value = '';
          }}
        />
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#374151', mb: 0.5 }}>Документы</Typography>
        <Box sx={{ display: 'grid', gap: 0.75 }}>
          {kinds.map(({ kind, label }) => {
            const files = pending.map((item, index) => ({ ...item, index })).filter((item) => item.kind === kind);
            return (
              <Box key={kind} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Typography sx={{ fontSize: 12.5, color: '#6b7280', minWidth: 92, pt: '3px' }}>{label}</Typography>
                <Box sx={{ flex: 1, display: 'grid', gap: 0.25 }}>
                  {files.map((item) => (
                    <Box key={item.index} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography sx={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.file.name}
                        <Box component="span" sx={{ color: '#9ca3af', ml: 0.5 }}>({formatSize(item.file.size)})</Box>
                      </Typography>
                      {canEdit && (
                        <Tooltip title="Убрать">
                          <IconButton size="small" onClick={() => onPendingChange(pending.filter((_item, i) => i !== item.index))}>
                            <Delete sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  ))}
                  {files.length === 0 && (
                    <Typography sx={{ fontSize: 12.5, color: '#9ca3af', pt: '3px' }}>нет файлов</Typography>
                  )}
                </Box>
                {canEdit && (
                  <Tooltip title={`Загрузить (${ACCEPT}, до 15 МБ)`}>
                    <span>
                      <IconButton size="small" onClick={() => pickPending(kind)}>
                        <UploadFile sx={{ fontSize: 17 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              </Box>
            );
          })}
        </Box>
        {pending.length > 0 && (
          <Typography sx={{ fontSize: 12, color: '#6b7280', mt: 0.5 }}>
            Файлы будут загружены при сохранении карточки.
          </Typography>
        )}
      </Box>
    );
  }

  const pickFile = (kind: DirectoryAttachmentKind) => {
    pendingKind.current = kind;
    inputRef.current?.click();
  };

  const handleFile = async (file: File | null) => {
    const kind = pendingKind.current;
    pendingKind.current = null;
    if (!file || !kind || !entityId) return;
    if (file.size > MAX_FILE_BYTES) {
      onError('Файл больше 15 МБ');
      return;
    }
    setBusy(true);
    try {
      await uploadDirectoryAttachment({
        entityType,
        entityId,
        kind,
        file: { name: file.name, mimeType: file.type, contentBase64: await fileToBase64(file) },
      });
      onSuccess(`«${file.name}» загружен`);
      await reload();
    } catch (error: any) {
      onError(error?.response?.data?.message || 'Не удалось загрузить файл');
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (item: DirectoryAttachmentItem) => {
    try {
      const response = await downloadDirectoryAttachment(item.id);
      saveBlob(response.data as Blob, item.originalName);
    } catch {
      onError('Не удалось скачать файл');
    }
  };

  const handleDelete = async (item: DirectoryAttachmentItem) => {
    if (!window.confirm(`Удалить «${item.originalName}»?`)) return;
    setBusy(true);
    try {
      await deleteDirectoryAttachment(item.id);
      onSuccess(`«${item.originalName}» удалён`);
      await reload();
    } catch (error: any) {
      onError(error?.response?.data?.message || 'Не удалось удалить файл');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ mt: 1.5 }}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(event) => {
          void handleFile(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#374151', mb: 0.5 }}>
        Документы {loading && <CircularProgress size={12} sx={{ ml: 0.5 }} />}
      </Typography>
      <Box sx={{ display: 'grid', gap: 0.75 }}>
        {kinds.map(({ kind, label }) => {
          const files = items.filter((item) => item.kind === kind);
          return (
            <Box key={kind} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Typography sx={{ fontSize: 12.5, color: '#6b7280', minWidth: 92, pt: '3px' }}>{label}</Typography>
              <Box sx={{ flex: 1, display: 'grid', gap: 0.25 }}>
                {files.map((item) => (
                  <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.originalName}
                      <Box component="span" sx={{ color: '#9ca3af', ml: 0.5 }}>({formatSize(item.sizeBytes)})</Box>
                    </Typography>
                    <Tooltip title="Скачать">
                      <IconButton size="small" onClick={() => void handleDownload(item)}>
                        <Download sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                    {canEdit && (
                      <Tooltip title="Удалить">
                        <IconButton size="small" disabled={busy} onClick={() => void handleDelete(item)}>
                          <Delete sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                ))}
                {files.length === 0 && (
                  <Typography sx={{ fontSize: 12.5, color: '#9ca3af', pt: '3px' }}>нет файлов</Typography>
                )}
              </Box>
              {canEdit && (
                <Tooltip title={`Загрузить (${ACCEPT}, до 15 МБ)`}>
                  <span>
                    <IconButton size="small" disabled={busy} onClick={() => pickFile(kind)}>
                      {busy ? <CircularProgress size={15} /> : <UploadFile sx={{ fontSize: 17 }} />}
                    </IconButton>
                  </span>
                </Tooltip>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
