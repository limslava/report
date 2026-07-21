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
  Typography,
} from '@mui/material';
import { ChatBubbleOutline } from '@mui/icons-material';
import type { ApprovalInboxItem, SecurityInboxItem } from '../../types/contracts';
import {
  formatContractTypeLabel,
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

const SECURITY_INBOX_COLUMNS = [
  { key: 'idx', label: '№', width: 48 },
  { key: 'number', label: '№ договора', width: 96 },
  { key: 'date', label: 'Дата', width: 100 },
  { key: 'type', label: 'Тип', width: 132 },
  { key: 'subject', label: 'Предмет договора', width: 180 },
  { key: 'counterparty', label: 'Контрагент', width: 200 },
  { key: 'inn', label: 'ИНН', width: 96 },
  { key: 'initiator', label: 'Инициатор', width: 190 },
  { key: 'deadline', label: 'Дедлайн', width: 104 },
  { key: 'visa', label: 'Виза руководителя СБ', width: 180 },
  { key: 'chat', label: '', width: 40 },
] as const;

const APPROVAL_INBOX_COLUMNS = [
  { key: 'idx', label: '№', width: 48 },
  { key: 'number', label: '№ договора', width: 96 },
  { key: 'date', label: 'Дата', width: 100 },
  { key: 'type', label: 'Тип', width: 132 },
  { key: 'subject', label: 'Предмет договора', width: 180 },
  { key: 'counterparty', label: 'Контрагент', width: 200 },
  { key: 'inn', label: 'ИНН', width: 96 },
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
  onOpenContract: (contractId: string) => void;
};

function InboxHeader({ columns }: { columns: readonly { key: string; label: string; width: number }[] }) {
  return (
    <>
      <colgroup>
        {columns.map((column) => (
          <col key={column.key} style={{ width: `${column.width}px` }} />
        ))}
      </colgroup>
      <TableHead>
        <TableRow>
          {columns.map((column) => (
            <TableCell key={column.key} sx={column.key === 'chat' ? { textAlign: 'center' } : undefined}>
              <Box className="registry-header-cell" sx={column.key === 'chat' ? { justifyContent: 'center' } : undefined}>
                {column.key === 'chat' ? <UnreadChatHeaderIcon /> : <span>{column.label}</span>}
              </Box>
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
    </>
  );
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
  return (
    <Paper sx={{ px: 0.25, py: 0.5 }}>
      {!totalItems && (
        <Typography variant="body2" color="text.secondary">Сейчас нет договоров на проверке руководителя СБ.</Typography>
      )}
      {!!items.length && (
        <TableContainer className="contract-registry-table-wrap contract-inbox-desktop">
          <Table size="small" className="contract-registry-table">
            <InboxHeader columns={SECURITY_INBOX_COLUMNS} />
            <TableBody>
              {items.map((item, index) => (
                <TableRow
                  key={item.contractId}
                  hover
                  className="contract-clickable-row"
                  title="Двойной клик откроет карточку договора"
                  onDoubleClick={() => { onOpenItem(item); }}
                >
                  <TableCell>{index + 1}</TableCell>
                  <TableCell sx={compactCellSx}>{item.contractNumber}</TableCell>
                  <TableCell sx={compactCellSx}>{item.contractDate || '—'}</TableCell>
                  <TableCell sx={compactCellSx}>
                    {formatContractTypeLabel(item.contractType, item.incomeSubtype)}
                  </TableCell>
                  <TableCell sx={textCellSx} title={item.subject || ''}>{item.subject || '—'}</TableCell>
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
                <InboxCardField label="Тип" value={formatContractTypeLabel(item.contractType, item.incomeSubtype)} />
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
  onOpenContract,
}: ApprovalContractInboxTableProps) {
  const columns = isChiefAccountant
    ? [...APPROVAL_INBOX_COLUMNS.slice(0, 4), ACCOUNTANT_SIGNING_COLUMN, ...APPROVAL_INBOX_COLUMNS.slice(4)]
    : APPROVAL_INBOX_COLUMNS;

  return (
    <Paper sx={{ px: 0.25, py: 0.5 }}>
      {!totalItems && (
        <Typography variant="body2" color="text.secondary">Сейчас нет договоров для вашего согласования.</Typography>
      )}
      {!!items.length && (
        <TableContainer className="contract-registry-table-wrap contract-inbox-desktop">
          <Table size="small" className="contract-registry-table">
            <InboxHeader columns={columns} />
            <TableBody>
              {items.map((item, index) => (
                <TableRow
                  key={item.contractId}
                  hover
                  className="contract-clickable-row"
                  title="Двойной клик откроет карточку договора"
                  onDoubleClick={() => { onOpenContract(item.contractId); }}
                >
                  <TableCell>{index + 1}</TableCell>
                  <TableCell sx={compactCellSx}>{item.contractNumber}</TableCell>
                  <TableCell sx={compactCellSx}>{item.contractDate || '—'}</TableCell>
                  <TableCell sx={compactCellSx}>
                    {formatContractTypeLabel(item.contractType, item.incomeSubtype)}
                  </TableCell>
                  {isChiefAccountant && (
                    <TableCell sx={compactCellSx}>{item.signingMethod === 'edo' ? 'ЭДО' : 'Почта'}</TableCell>
                  )}
                  <TableCell sx={textCellSx} title={item.subject || ''}>{item.subject || '—'}</TableCell>
                  <TableCell sx={textCellSx} title={item.counterpartyName}>
                    {item.counterpartyShortName?.trim() || normalizeCounterpartyName(item.counterpartyName)}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap !important', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>
                    {item.counterpartyInn || '—'}
                  </TableCell>
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
                  className={`contract-visa-text contract-visa-text--${getApprovalInboxDecisionTone(item)}`}
                >
                  {getApprovalInboxDecisionLabel(item)}
                </Typography>
              </Box>
              <Box className="contract-inbox-card-grid">
                <InboxCardField label="Тип" value={formatContractTypeLabel(item.contractType, item.incomeSubtype)} />
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
