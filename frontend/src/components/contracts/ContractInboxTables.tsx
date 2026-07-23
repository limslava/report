import { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material';
import { ChatBubbleOutline } from '@mui/icons-material';
import type { ApprovalInboxItem, SecurityInboxItem } from '../../types/contracts';
import {
  formatContractBaseTypeLabel,
  formatContractSubtypeLabel,
  formatDateOnly,
  getApprovalInboxDecisionLabel,
  getApprovalInboxDecisionTone,
  getSecurityVisaColor,
  getSecurityVisaLabel,
  normalizeCounterpartyName,
} from '../../utils/contract-approval';

// Иконка чата в заголовке выделенной колонки непрочитанных.
export function UnreadChatHeaderIcon() {
  return (
    <ChatBubbleOutline
      titleAccess="Непрочитанные сообщения в чатах"
      sx={{ fontSize: 14, color: '#57606a', verticalAlign: 'middle' }}
    />
  );
}

// Бейдж для отдельной колонки: по центру ячейки, без левого отступа.
export function UnreadChatCell({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <Box
      component="span"
      title={`${count} новых сообщений в чате`}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        minWidth: 24,
        height: 17,
        px: '5px',
        borderRadius: '999px',
        bgcolor: '#e53935',
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      <ChatBubbleOutline sx={{ fontSize: 12 }} />
      {count}
    </Box>
  );
}

// Порядок колонок согласован с реестром: №, Контрагент, ИНН, Тип, Предмет, № договора, Дата,
// далее — специфичные для входящих (Инициатор, Дедлайн, Виза), в конце — Сообщения.
const SECURITY_INBOX_COLUMNS = [
  { key: 'idx', label: '№', width: 48 },
  { key: 'counterparty', label: 'Контрагент', width: 200 },
  { key: 'inn', label: 'ИНН', width: 96 },
  { key: 'type', label: 'Тип', width: 90 },
  { key: 'subtype', label: 'Подтип', width: 92 },
  { key: 'subject', label: 'Предмет договора', width: 180 },
  { key: 'number', label: '№ договора', width: 96 },
  { key: 'date', label: 'Дата', width: 100 },
  { key: 'initiator', label: 'Инициатор', width: 190 },
  { key: 'deadline', label: 'Дедлайн', width: 104 },
  { key: 'visa', label: 'Виза руководителя СБ', width: 180 },
  { key: 'chat', label: '', width: 40 },
] as const;

// Порядок колонок согласован с реестром: №, Контрагент, ИНН, Тип, Предмет, № договора, Дата,
// далее — специфичные для входящих (Инициатор, Дедлайн, Моё решение), в конце — Сообщения.
const APPROVAL_INBOX_COLUMNS = [
  { key: 'idx', label: '№', width: 48 },
  { key: 'counterparty', label: 'Контрагент', width: 200 },
  { key: 'inn', label: 'ИНН', width: 96 },
  { key: 'type', label: 'Тип', width: 90 },
  { key: 'subtype', label: 'Подтип', width: 92 },
  { key: 'subject', label: 'Предмет договора', width: 180 },
  { key: 'number', label: '№ договора', width: 96 },
  { key: 'date', label: 'Дата', width: 100 },
  { key: 'initiator', label: 'Инициатор', width: 190 },
  { key: 'deadline', label: 'Дедлайн', width: 104 },
  { key: 'decision', label: 'Мое решение', width: 170 },
  { key: 'chat', label: '', width: 40 },
] as const;

const ACCOUNTANT_SIGNING_COLUMN = { key: 'signing', label: 'Способ подписания', width: 134 } as const;

const compactCellSx = { whiteSpace: 'nowrap !important', verticalAlign: 'top' };
const textCellSx = {
  whiteSpace: 'normal !important',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
  textOverflow: 'clip',
  overflow: 'visible',
  verticalAlign: 'top',
};

type SecurityContractInboxTableProps = {
  items: SecurityInboxItem[];
  totalItems: number;
  unreadByContract?: Record<string, number>;
  onOpenItem: (item: SecurityInboxItem) => void;
};

type ApprovalContractInboxTableProps = {
  items: ApprovalInboxItem[];
  totalItems: number;
  isChiefAccountant: boolean;
  unreadByContract?: Record<string, number>;
  showUnreadChat?: boolean;
  onOpenContract: (contractId: string) => void;
};

type InboxSortDir = 'asc' | 'desc';

// Сортируются все колонки, кроме порядкового номера.
const NON_SORTABLE_INBOX_KEYS = new Set(['idx']);

function InboxHeader({
  columns,
  sortKey,
  sortDir,
  onSort,
}: {
  columns: readonly { key: string; label: string; width: number }[];
  sortKey: string | null;
  sortDir: InboxSortDir;
  onSort: (key: string) => void;
}) {
  return (
    <>
      <colgroup>
        {columns.map((column) => (
          <col key={column.key} style={{ width: `${column.width}px` }} />
        ))}
      </colgroup>
      <TableHead>
        <TableRow>
          {columns.map((column) => {
            const sortable = !NON_SORTABLE_INBOX_KEYS.has(column.key);
            const content = column.key === 'chat' ? <UnreadChatHeaderIcon /> : <span>{column.label}</span>;
            return (
              <TableCell key={column.key} sx={column.key === 'chat' ? { textAlign: 'center' } : undefined}>
                <Box className="registry-header-cell" sx={column.key === 'chat' ? { justifyContent: 'center' } : undefined}>
                  {sortable ? (
                    <TableSortLabel
                      active={sortKey === column.key}
                      direction={sortKey === column.key ? sortDir : 'asc'}
                      onClick={() => onSort(column.key)}
                    >
                      {content}
                    </TableSortLabel>
                  ) : content}
                </Box>
              </TableCell>
            );
          })}
        </TableRow>
      </TableHead>
    </>
  );
}

// Хук сортировки для плоских списков входящих: клик по заголовку — asc, повторный — desc.
function useInboxSort<T>(items: T[], sortValue: (item: T, key: string) => string | number) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<InboxSortDir>('asc');
  const onSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
  const sortedItems = useMemo(() => {
    if (!sortKey) return items;
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
      return String(av).localeCompare(String(bv), 'ru', { numeric: true }) * mul;
    });
  }, [items, sortKey, sortDir, sortValue]);
  return { sortKey, sortDir, onSort, sortedItems };
}

function counterpartyLabel(item: { counterpartyShortName?: string | null; counterpartyName: string }): string {
  return (item.counterpartyShortName?.trim() || normalizeCounterpartyName(item.counterpartyName)).toLowerCase();
}

function securityInboxSortValue(item: SecurityInboxItem, key: string, unread?: Record<string, number>): string | number {
  switch (key) {
    case 'counterparty': return counterpartyLabel(item);
    case 'inn': return item.counterpartyInn || '';
    case 'type': return formatContractBaseTypeLabel(item.contractType);
    case 'subtype': return formatContractSubtypeLabel(item.contractType, item.incomeSubtype);
    case 'subject': return (item.subject || '').toLowerCase();
    case 'number': return item.contractNumber || '';
    case 'date': return item.contractDate || '';
    case 'initiator': return (item.initiatorName || '').toLowerCase();
    case 'deadline': return item.deadlineAt || '';
    case 'visa': return getSecurityVisaLabel(item);
    case 'chat': return unread?.[item.contractId] ?? 0;
    default: return '';
  }
}

function approvalInboxSortValue(item: ApprovalInboxItem, key: string, unread?: Record<string, number>): string | number {
  switch (key) {
    case 'counterparty': return counterpartyLabel(item);
    case 'inn': return item.counterpartyInn || '';
    case 'type': return formatContractBaseTypeLabel(item.contractType);
    case 'subtype': return formatContractSubtypeLabel(item.contractType, item.incomeSubtype);
    case 'subject': return (item.subject || '').toLowerCase();
    case 'number': return item.contractNumber || '';
    case 'date': return item.contractDate || '';
    case 'initiator': return (item.initiatorName || '').toLowerCase();
    case 'deadline': return item.deadlineAt || '';
    case 'signing': return item.signingMethod === 'edo' ? 'ЭДО' : 'Почта';
    case 'decision': return getApprovalInboxDecisionLabel(item);
    case 'chat': return unread?.[item.contractId] ?? 0;
    default: return '';
  }
}

function InboxCardField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box className="contract-inbox-card-field">
      <Typography variant="caption">{label}</Typography>
      <Typography variant="body2" component="div">{value || '—'}</Typography>
    </Box>
  );
}

export function SecurityContractInboxTable({
  items,
  totalItems,
  unreadByContract,
  onOpenItem,
}: SecurityContractInboxTableProps) {
  const sortValue = useCallback(
    (item: SecurityInboxItem, key: string) => securityInboxSortValue(item, key, unreadByContract),
    [unreadByContract],
  );
  const { sortKey, sortDir, onSort, sortedItems } = useInboxSort(items, sortValue);
  return (
    <Paper sx={{ px: 0.25, py: 0.5 }}>
      {!totalItems && (
        <Typography variant="body2" color="text.secondary">Сейчас нет договоров на проверке руководителя СБ.</Typography>
      )}
      {!!items.length && (
        <TableContainer className="contract-registry-table-wrap contract-inbox-desktop">
          <Table size="small" className="contract-registry-table">
            <InboxHeader columns={SECURITY_INBOX_COLUMNS} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <TableBody>
              {sortedItems.map((item, index) => (
                <TableRow
                  key={item.contractId}
                  hover
                  className="contract-clickable-row"
                  title="Двойной клик откроет карточку договора"
                  onDoubleClick={() => { onOpenItem(item); }}
                >
                  <TableCell>{index + 1}</TableCell>
                  <TableCell sx={textCellSx} title={item.counterpartyName}>
                    {item.counterpartyShortName?.trim() || normalizeCounterpartyName(item.counterpartyName)}
                  </TableCell>
                  <TableCell
                    sx={{
                      whiteSpace: 'nowrap !important',
                      wordBreak: 'normal',
                      overflowWrap: 'normal',
                      textOverflow: 'clip',
                      overflow: 'visible',
                      verticalAlign: 'top',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {item.counterpartyInn || '—'}
                  </TableCell>
                  <TableCell sx={compactCellSx}>
                    {formatContractBaseTypeLabel(item.contractType)}
                  </TableCell>
                  <TableCell sx={compactCellSx}>
                    {formatContractSubtypeLabel(item.contractType, item.incomeSubtype)}
                  </TableCell>
                  <TableCell sx={textCellSx} title={item.subject || ''}>{item.subject || '—'}</TableCell>
                  <TableCell sx={compactCellSx}>{item.contractNumber}</TableCell>
                  <TableCell sx={compactCellSx}>{item.contractDate || '—'}</TableCell>
                  <TableCell sx={textCellSx}>{item.initiatorName}</TableCell>
                  <TableCell>{formatDateOnly(item.deadlineAt)}</TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      className={`contract-visa-text contract-visa-text--${getSecurityVisaColor(item)}`}
                    >
                      {getSecurityVisaLabel(item)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ textAlign: 'center', verticalAlign: 'middle' }}>
                    <UnreadChatCell count={unreadByContract?.[item.contractId]} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {!!items.length && (
        <Box className="contract-inbox-mobile">
          {items.map((item) => (
            <Box key={item.contractId} className="contract-inbox-card">
              <Box className="contract-inbox-card-heading">
                <Box>
                  <Typography variant="subtitle2">Договор № {item.contractNumber}</Typography>
                  <Typography variant="body2">
                    {item.counterpartyShortName?.trim() || normalizeCounterpartyName(item.counterpartyName)}
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  className={`contract-visa-text contract-visa-text--${getSecurityVisaColor(item)}`}
                >
                  {getSecurityVisaLabel(item)}
                </Typography>
              </Box>
              <Box className="contract-inbox-card-grid">
                <InboxCardField label="Тип" value={formatContractBaseTypeLabel(item.contractType)} />
                <InboxCardField label="Подтип" value={formatContractSubtypeLabel(item.contractType, item.incomeSubtype)} />
                <InboxCardField label="Срок" value={formatDateOnly(item.deadlineAt)} />
                <InboxCardField label="Инициатор" value={item.initiatorName} />
                <InboxCardField label="Предмет" value={item.subject || '—'} />
              </Box>
              <Button variant="outlined" fullWidth onClick={() => onOpenItem(item)}>Открыть</Button>
            </Box>
          ))}
        </Box>
      )}
      {!!totalItems && !items.length && (
        <Typography variant="body2" color="text.secondary">По вашему запросу ничего не найдено.</Typography>
      )}
    </Paper>
  );
}

export function ApprovalContractInboxTable({
  items,
  totalItems,
  isChiefAccountant,
  unreadByContract,
  showUnreadChat = true,
  onOpenContract,
}: ApprovalContractInboxTableProps) {
  const baseColumns = isChiefAccountant
    ? [...APPROVAL_INBOX_COLUMNS.slice(0, 5), ACCOUNTANT_SIGNING_COLUMN, ...APPROVAL_INBOX_COLUMNS.slice(5)]
    : APPROVAL_INBOX_COLUMNS;
  const columns = showUnreadChat ? baseColumns : baseColumns.filter((column) => column.key !== 'chat');
  const sortValue = useCallback(
    (item: ApprovalInboxItem, key: string) => approvalInboxSortValue(item, key, unreadByContract),
    [unreadByContract],
  );
  const { sortKey, sortDir, onSort, sortedItems } = useInboxSort(items, sortValue);

  return (
    <Paper sx={{ px: 0.25, py: 0.5 }}>
      {!totalItems && (
        <Typography variant="body2" color="text.secondary">Сейчас нет договоров для вашего согласования.</Typography>
      )}
      {!!items.length && (
        <TableContainer className="contract-registry-table-wrap contract-inbox-desktop">
          <Table size="small" className="contract-registry-table">
            <InboxHeader columns={columns} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <TableBody>
              {sortedItems.map((item, index) => (
                <TableRow
                  key={item.contractId}
                  hover
                  className="contract-clickable-row"
                  title="Двойной клик откроет карточку договора"
                  onDoubleClick={() => { onOpenContract(item.contractId); }}
                >
                  <TableCell>{index + 1}</TableCell>
                  <TableCell sx={textCellSx} title={item.counterpartyName}>
                    {item.counterpartyShortName?.trim() || normalizeCounterpartyName(item.counterpartyName)}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap !important', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>
                    {item.counterpartyInn || '—'}
                  </TableCell>
                  <TableCell sx={compactCellSx}>
                    {formatContractBaseTypeLabel(item.contractType)}
                  </TableCell>
                  <TableCell sx={compactCellSx}>
                    {formatContractSubtypeLabel(item.contractType, item.incomeSubtype)}
                  </TableCell>
                  {isChiefAccountant && (
                    <TableCell sx={compactCellSx}>{item.signingMethod === 'edo' ? 'ЭДО' : 'Почта'}</TableCell>
                  )}
                  <TableCell sx={textCellSx} title={item.subject || ''}>{item.subject || '—'}</TableCell>
                  <TableCell sx={compactCellSx}>{item.contractNumber}</TableCell>
                  <TableCell sx={compactCellSx}>{item.contractDate || '—'}</TableCell>
                  <TableCell sx={textCellSx}>{item.initiatorName}</TableCell>
                  <TableCell>{formatDateOnly(item.deadlineAt)}</TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      className={`contract-visa-text contract-visa-text--${getApprovalInboxDecisionTone(item)}`}
                    >
                      {getApprovalInboxDecisionLabel(item)}
                    </Typography>
                  </TableCell>
                  {showUnreadChat && (
                    <TableCell sx={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <UnreadChatCell count={unreadByContract?.[item.contractId]} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {!!items.length && (
        <Box className="contract-inbox-mobile">
          {items.map((item) => (
            <Box key={item.contractId} className="contract-inbox-card">
              <Box className="contract-inbox-card-heading">
                <Box>
                  <Typography variant="subtitle2">Договор № {item.contractNumber}</Typography>
                  <Typography variant="body2">
                    {item.counterpartyShortName?.trim() || normalizeCounterpartyName(item.counterpartyName)}
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  className={`contract-visa-text contract-visa-text--${getApprovalInboxDecisionTone(item)}`}
                >
                  {getApprovalInboxDecisionLabel(item)}
                </Typography>
              </Box>
              <Box className="contract-inbox-card-grid">
                <InboxCardField label="Тип" value={formatContractBaseTypeLabel(item.contractType)} />
                <InboxCardField label="Подтип" value={formatContractSubtypeLabel(item.contractType, item.incomeSubtype)} />
                <InboxCardField label="Срок" value={formatDateOnly(item.deadlineAt)} />
                <InboxCardField label="Инициатор" value={item.initiatorName} />
                <InboxCardField label="Предмет" value={item.subject || '—'} />
                {isChiefAccountant && (
                  <InboxCardField label="Подписание" value={item.signingMethod === 'edo' ? 'ЭДО' : 'Почта'} />
                )}
              </Box>
              <Button variant="outlined" fullWidth onClick={() => onOpenContract(item.contractId)}>Открыть</Button>
            </Box>
          ))}
        </Box>
      )}
      {!!totalItems && !items.length && (
        <Typography variant="body2" color="text.secondary">По вашему запросу ничего не найдено.</Typography>
      )}
    </Paper>
  );
}
