import { useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  AttachFile,
  Close,
  Download,
  Send,
} from '@mui/icons-material';
import type {
  ContractDiscussionAttachmentRef,
  ContractDiscussionMessage,
  UserDirectoryItem,
} from '../../types/contracts';
import { formatDateTime } from '../../utils/contract-approval';

type ContractDiscussionPanelProps = {
  messages: ContractDiscussionMessage[];
  loading: boolean;
  sending: boolean;
  readOnly?: boolean;
  readOnlyReason?: string;
  unreadCount?: number;
  mentionableUsers: UserDirectoryItem[];
  mentionedUserIds: string[];
  text: string;
  files: File[];
  onMentionedUserIdsChange: (ids: string[]) => void;
  onTextChange: (value: string) => void;
  onFilesChange: (files: File[]) => void;
  onSend: () => void;
  onDownloadAttachment: (file: ContractDiscussionAttachmentRef) => void;
};

function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '';
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} КБ`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} МБ`;
}

function getMentionQuery(text: string, cursorPosition: number) {
  const beforeCursor = text.slice(0, cursorPosition);
  const match = beforeCursor.match(/(^|\s)@([\p{L}\d._-]{0,40})$/u);
  if (!match || match.index === undefined) return null;
  return {
    query: match[2].toLowerCase(),
    start: match.index + match[1].length,
    end: cursorPosition,
  };
}

function renderMessageBody(message: ContractDiscussionMessage, usersById: Map<string, UserDirectoryItem>) {
  const mentionNames = message.mentionedUserIds
    .map((userId) => usersById.get(userId)?.fullName)
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => b.length - a.length);

  if (!mentionNames.length) {
    return message.body;
  }

  const escapedNames = mentionNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const mentionPattern = new RegExp(`@(${escapedNames.join('|')})`, 'g');
  const parts: Array<string | { value: string; mention: true }> = [];
  let lastIndex = 0;
  for (const match of message.body.matchAll(mentionPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(message.body.slice(lastIndex, index));
    }
    parts.push({ value: match[0], mention: true });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < message.body.length) {
    parts.push(message.body.slice(lastIndex));
  }

  return parts.map((part, index) => (
    typeof part === 'string'
      ? part
      : <span key={`${part.value}-${index}`} className="contract-discussion-inline-mention">{part.value}</span>
  ));
}

export function ContractDiscussionPanel({
  messages,
  loading,
  sending,
  readOnly = false,
  readOnlyReason,
  unreadCount = 0,
  mentionableUsers,
  mentionedUserIds,
  text,
  files,
  onMentionedUserIdsChange,
  onTextChange,
  onFilesChange,
  onSend,
  onDownloadAttachment,
}: ContractDiscussionPanelProps) {
  const canSend = Boolean(text.trim()) || files.length > 0;
  const usersById = new Map(mentionableUsers.map((user) => [user.id, user]));
  const textInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const [cursorPosition, setCursorPosition] = useState(text.length);
  const activeMention = getMentionQuery(text, cursorPosition);
  const mentionSuggestions = useMemo(() => {
    if (!activeMention) return [];
    const query = activeMention.query;
    return mentionableUsers
      .filter((user) => user.fullName.toLowerCase().includes(query))
      .slice(0, 6);
  }, [activeMention, mentionableUsers]);

  const syncMentionIdsFromText = (nextText: string, extraUserId?: string) => {
    const nextIds = new Set<string>();
    for (const userId of mentionedUserIds) {
      const user = usersById.get(userId);
      if (user && nextText.includes(`@${user.fullName}`)) {
        nextIds.add(userId);
      }
    }
    if (extraUserId) {
      nextIds.add(extraUserId);
    }
    onMentionedUserIdsChange([...nextIds]);
  };

  const handleTextChange = (nextText: string, nextCursorPosition: number) => {
    setCursorPosition(nextCursorPosition);
    onTextChange(nextText);
    syncMentionIdsFromText(nextText);
  };

  const insertMention = (user: UserDirectoryItem) => {
    if (!activeMention) return;
    const mentionText = `@${user.fullName} `;
    const nextText = `${text.slice(0, activeMention.start)}${mentionText}${text.slice(activeMention.end)}`;
    const nextCursorPosition = activeMention.start + mentionText.length;
    onTextChange(nextText);
    onMentionedUserIdsChange([...new Set([...mentionedUserIds, user.id])]);
    setCursorPosition(nextCursorPosition);
    window.setTimeout(() => {
      textInputRef.current?.focus();
      textInputRef.current?.setSelectionRange(nextCursorPosition, nextCursorPosition);
    }, 0);
  };

  return (
    <Box className="contract-discussion-panel">
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Badge
          color="primary"
          badgeContent={unreadCount}
          invisible={!unreadCount}
          className="contract-discussion-badge"
        >
          <Typography variant="subtitle1" className="contract-discussion-title">
            Обсуждение
          </Typography>
        </Badge>
        {loading && <CircularProgress size={16} />}
      </Stack>

      {readOnly && (
        <Typography variant="body2" className="contract-discussion-readonly">
          {readOnlyReason || 'Обсуждение доступно только для чтения.'}
        </Typography>
      )}

      <Stack spacing={1} className="contract-discussion-messages">
        {!loading && messages.length === 0 && (
          <Typography variant="body2" className="contract-discussion-empty">
            Сообщений пока нет.
          </Typography>
        )}
        {messages.map((message) => (
          <Box key={message.id} className="contract-discussion-message">
            <Stack direction="row" spacing={1} alignItems="baseline" justifyContent="space-between">
              <Typography variant="body2" className="contract-discussion-author">
                {message.author.fullName || 'Пользователь'}
              </Typography>
              <Typography variant="caption" className="contract-discussion-time">
                {formatDateTime(message.createdAt)}
              </Typography>
            </Stack>
            <Typography variant="body2" className="contract-discussion-body">
              {renderMessageBody(message, usersById)}
            </Typography>
            {message.attachments.length > 0 && (
              <Stack spacing={0.5} sx={{ mt: 0.75 }}>
                {message.attachments.map((file) => (
                  <Button
                    key={file.id}
                    size="small"
                    variant="text"
                    startIcon={<Download fontSize="small" />}
                    onClick={() => onDownloadAttachment(file)}
                    className="contract-discussion-file"
                  >
                    {file.originalName}{formatFileSize(file.sizeBytes) ? ` · ${formatFileSize(file.sizeBytes)}` : ''}
                  </Button>
                ))}
              </Stack>
            )}
          </Box>
        ))}
      </Stack>

      {files.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
          {files.map((file, index) => (
            <Box key={`${file.name}-${index}`} className="contract-discussion-selected-file">
              <Typography variant="caption">{file.name}</Typography>
              <IconButton
                size="small"
                onClick={() => onFilesChange(files.filter((_, currentIndex) => currentIndex !== index))}
                aria-label="Убрать файл"
              >
                <Close fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Stack>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="flex-end" sx={{ mt: 1 }}>
        <Box className="contract-discussion-input-wrap">
          <TextField
            size="small"
            multiline
            minRows={2}
            maxRows={5}
            fullWidth
            label="Сообщение"
            value={text}
            disabled={readOnly}
            inputRef={textInputRef}
            placeholder="Напишите сообщение. Для упоминания введите @"
            onChange={(event) => {
              const target = event.target as HTMLTextAreaElement;
              handleTextChange(target.value, target.selectionStart ?? target.value.length);
            }}
            onClick={(event) => {
              const target = event.target as HTMLTextAreaElement;
              setCursorPosition(target.selectionStart ?? text.length);
            }}
            onKeyUp={(event) => {
              const target = event.target as HTMLTextAreaElement;
              setCursorPosition(target.selectionStart ?? text.length);
            }}
          />
          {!readOnly && mentionSuggestions.length > 0 && (
            <Box className="contract-discussion-mention-menu">
              {mentionSuggestions.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="contract-discussion-mention-option"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMention(user);
                  }}
                >
                  <span>@{user.fullName}</span>
                  <small>{user.role}</small>
                </button>
              ))}
            </Box>
          )}
        </Box>
        <Button
          component="label"
          variant="outlined"
          startIcon={<AttachFile />}
          disabled={sending || readOnly}
          className="contract-discussion-attach-button"
        >
          Файлы
          <input
            hidden
            multiple
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              if (selected.length) {
                onFilesChange([...files, ...selected].slice(0, 5));
              }
              event.target.value = '';
            }}
          />
        </Button>
        <Button
          variant="contained"
          startIcon={sending ? <CircularProgress size={14} color="inherit" /> : <Send />}
          disabled={!canSend || sending || readOnly}
          onClick={onSend}
          className="contract-discussion-send-button"
        >
          Отправить
        </Button>
      </Stack>
    </Box>
  );
}
