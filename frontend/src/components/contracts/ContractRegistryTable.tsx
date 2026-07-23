import { useMemo, useState } from 'react';
import {
  Box,
  IconButton,
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
import type { ContractRecord, ContractSection } from '../../types/contracts';
import { UnreadChatCell, UnreadChatHeaderIcon } from './ContractInboxTables';
import {
  getContractDisplayStatus,
  getContractStatusLabel,
  formatContractBaseTypeLabel,
  formatContractSubtypeLabel,
  normalizeCounterpartyName,
} from '../../utils/contract-approval';

type SortKey =
  | 'counterparty'
  | 'inn'
  | 'kind'
  | 'type'
  | 'subtype'
  | 'subject'
  | 'number'
  | 'date'
  | 'status'
  | 'stage'
  | 'chat';
type SortDir = 'asc' | 'desc';

type RegistryColumn = {
  key: string;
  label: string;
  width: number;
  sortKey?: SortKey;
  align?: 'center';
};

// Порядок колонок: №, Контрагент, ИНН, Документ, Тип, Подтип, Предмет, № договора, Дата, Статус, Ход согласования.
const REGISTRY_COLUMNS: RegistryColumn[] = [
  { key: 'idx', label: '№', width: 36 },
  { key: 'counterparty', label: 'Контрагент', width: 173, sortKey: 'counterparty' },
  { key: 'inn', label: 'ИНН', width: 110, sortKey: 'inn' },
  { key: 'kind', label: 'Документ', width: 118, sortKey: 'kind' },
  { key: 'type', label: 'Тип', width: 90, sortKey: 'type' },
  { key: 'subtype', label: 'Подтип', width: 92, sortKey: 'subtype' },
  { key: 'subject', label: 'Предмет договора', width: 150, sortKey: 'subject' },
  { key: 'number', label: '№ договора', width: 96, sortKey: 'number' },
  { key: 'date', label: 'Дата договора', width: 100, sortKey: 'date' },
  { key: 'status', label: 'Статус', width: 110, sortKey: 'status' },
  { key: 'stage', label: 'Ход согласования', width: 190, sortKey: 'stage' },
];

// Колонка непрочитанных сообщений — только в «Мои договоры», в самом конце.
const CHAT_COLUMN: RegistryColumn = { key: 'chat', label: 'Сообщения', width: 40, sortKey: 'chat', align: 'center' };

type RegistryDisplayRow = {
  contract: ContractRecord;
  depth: 0 | 1;
  rowNumber: string;
  childCount: number;
  isCollapsed: boolean;
};

type ContractRegistryTableProps = {
  contracts: ContractRecord[];
  contractSection: ContractSection;
  selectedContractId: string;
  unreadByContract?: Record<string, number>;
  showUnreadColumn?: boolean;
  onOpenContract: (contractId: string) => void;
};

// Текстовые представления полей — используются и для отображения, и для сортировки.
function counterpartyText(contract: ContractRecord): string {
  return contract.counterpartyShortName?.trim() || normalizeCounterpartyName(contract.counterpartyName);
}
function subjectText(contract: ContractRecord): string {
  if (contract.documentKind === 'addendum') {
    return contract.parentContractNumber ? `Допник к договору ${contract.parentContractNumber}` : 'Допник к основному договору';
  }
  return contract.subject || '';
}
function stageText(contract: ContractRecord): string {
  return contract.needsSignedAttachment ? 'Нет подписанного файла' : (contract.statusDetail || contract.currentStageLabel || '');
}
function kindText(contract: ContractRecord): string {
  return contract.documentKind === 'addendum' ? 'Доп. соглашение' : 'Договор';
}

function sortText(contract: ContractRecord, key: SortKey): string {
  switch (key) {
    case 'counterparty': return counterpartyText(contract).toLowerCase();
    case 'inn': return contract.counterpartyInn || '';
    case 'kind': return kindText(contract);
    case 'type': return formatContractBaseTypeLabel(contract.contractType);
    case 'subtype': return formatContractSubtypeLabel(contract.contractType, contract.incomeSubtype);
    case 'subject': return subjectText(contract).toLowerCase();
    case 'number': return contract.contractNumber || '';
    case 'date': return contract.contractDate || '';
    case 'status': return getContractStatusLabel(contract);
    case 'stage': return stageText(contract).toLowerCase();
    default: return '';
  }
}

export function ContractRegistryTable({
  contracts,
  contractSection,
  selectedContractId,
  unreadByContract,
  showUnreadColumn = false,
  onOpenContract,
}: ContractRegistryTableProps) {
  const columns = showUnreadColumn ? [...REGISTRY_COLUMNS, CHAT_COLUMN] : REGISTRY_COLUMNS;
  const [collapsedMasters, setCollapsedMasters] = useState<Set<string>>(() => new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const addendumsByParentId = useMemo(() => {
    const grouped = new Map<string, ContractRecord[]>();
    contracts.forEach((contract) => {
      if (contract.documentKind !== 'addendum' || !contract.parentContractId) return;
      const group = grouped.get(contract.parentContractId) ?? [];
      group.push(contract);
      grouped.set(contract.parentContractId, group);
    });
    return grouped;
  }, [contracts]);

  const comparator = useMemo(() => {
    if (!sortKey) return null;
    const dir = sortDir === 'asc' ? 1 : -1;
    return (a: ContractRecord, b: ContractRecord) => {
      if (sortKey === 'chat') {
        const av = unreadByContract?.[a.id] ?? 0;
        const bv = unreadByContract?.[b.id] ?? 0;
        return (av - bv) * dir;
      }
      return sortText(a, sortKey).localeCompare(sortText(b, sortKey), 'ru', { numeric: true }) * dir;
    };
  }, [sortKey, sortDir, unreadByContract]);

  const displayRows = useMemo<RegistryDisplayRow[]>(() => {
    const rows: RegistryDisplayRow[] = [];
    const visibleIds = new Set(contracts.map((contract) => contract.id));
    const renderedAddendumIds = new Set<string>();
    let masterIndex = 0;

    const masters = contracts.filter((contract) => contract.documentKind !== 'addendum');
    const sortedMasters = comparator ? [...masters].sort(comparator) : masters;

    sortedMasters.forEach((contract) => {
      const children = addendumsByParentId.get(contract.id) ?? [];
      const orderedChildren = comparator ? [...children].sort(comparator) : children;
      masterIndex += 1;
      const isCollapsed = collapsedMasters.has(contract.id);
      rows.push({
        contract,
        depth: 0,
        rowNumber: String(masterIndex),
        childCount: orderedChildren.length,
        isCollapsed,
      });

      if (!isCollapsed) {
        orderedChildren.forEach((child, childIndex) => {
          renderedAddendumIds.add(child.id);
          rows.push({
            contract: child,
            depth: 1,
            rowNumber: `${masterIndex}.${childIndex + 1}`,
            childCount: 0,
            isCollapsed: false,
          });
        });
      } else {
        orderedChildren.forEach((child) => renderedAddendumIds.add(child.id));
      }
    });

    // Допники без видимого родителя показываем как самостоятельные строки.
    const orphanAddendums = contracts.filter((contract) => (
      contract.documentKind === 'addendum'
      && !renderedAddendumIds.has(contract.id)
      && !(contract.parentContractId && visibleIds.has(contract.parentContractId))
    ));
    const sortedOrphans = comparator ? [...orphanAddendums].sort(comparator) : orphanAddendums;
    sortedOrphans.forEach((contract) => {
      masterIndex += 1;
      rows.push({ contract, depth: 0, rowNumber: String(masterIndex), childCount: 0, isCollapsed: false });
    });

    return rows;
  }, [addendumsByParentId, collapsedMasters, comparator, contracts]);

  const toggleMaster = (contractId: string) => {
    setCollapsedMasters((current) => {
      const next = new Set(current);
      if (next.has(contractId)) {
        next.delete(contractId);
      } else {
        next.add(contractId);
      }
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <Paper sx={{ px: 0.25, py: 0.5 }}>
      <TableContainer className="contract-registry-table-wrap">
        <Table size="small" className="contract-registry-table">
          <colgroup>
            {columns.map((column) => (
              <col key={column.key} style={{ width: `${column.width}px` }} />
            ))}
          </colgroup>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.key} sx={column.align === 'center' ? { textAlign: 'center' } : undefined}>
                  <Box className="registry-header-cell" sx={column.align === 'center' ? { justifyContent: 'center' } : undefined}>
                    {column.sortKey ? (
                      <TableSortLabel
                        active={sortKey === column.sortKey}
                        direction={sortKey === column.sortKey ? sortDir : 'asc'}
                        onClick={() => handleSort(column.sortKey as SortKey)}
                      >
                        {column.key === 'chat' ? <UnreadChatHeaderIcon /> : column.label}
                      </TableSortLabel>
                    ) : (
                      <span>{column.label}</span>
                    )}
                  </Box>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {displayRows.map(({ contract: row, depth, rowNumber, childCount, isCollapsed }) => (
              <TableRow
                key={row.id}
                hover
                selected={selectedContractId === row.id}
                className={`contract-clickable-row${depth === 1 ? ' contract-registry-addendum-row' : ''}${row.needsSignedAttachment ? ' contract-row-needs-signed-file' : ''}`}
                title={row.needsSignedAttachment ? 'Нет подписанного экземпляра. Двойной клик откроет карточку договора' : 'Двойной клик откроет карточку договора'}
                onDoubleClick={() => { onOpenContract(row.id); }}
              >
                <TableCell>{rowNumber}</TableCell>
                <TableCell title={row.counterpartyName}>
                  {counterpartyText(row)}
                </TableCell>
                <TableCell>{row.counterpartyInn || '—'}</TableCell>
                <TableCell>
                  <Box className="contract-registry-tree-cell" sx={{ pl: depth * 2 }}>
                    {childCount > 0 ? (
                      <IconButton
                        size="small"
                        className="contract-registry-tree-toggle"
                        aria-label={isCollapsed ? 'Показать доп. соглашения' : 'Скрыть доп. соглашения'}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleMaster(row.id);
                        }}
                        onDoubleClick={(event) => event.stopPropagation()}
                      >
                        <span aria-hidden="true">{isCollapsed ? '›' : '⌄'}</span>
                      </IconButton>
                    ) : (
                      <span className="contract-registry-tree-spacer" />
                    )}
                    <span className={row.documentKind === 'addendum' ? 'contract-registry-document-pill contract-registry-document-pill--addendum' : 'contract-registry-document-pill'}>
                      {row.documentKind === 'addendum' ? 'Доп. соглашение' : 'Договор'}
                      {childCount > 0 ? ` (${childCount})` : ''}
                    </span>
                  </Box>
                </TableCell>
                <TableCell>{formatContractBaseTypeLabel(row.contractType)}</TableCell>
                <TableCell>{formatContractSubtypeLabel(row.contractType, row.incomeSubtype)}</TableCell>
                <TableCell title={row.documentKind === 'addendum' ? (row.parentContractNumber || '') : (row.subject || '')}>
                  {subjectText(row) || '—'}
                </TableCell>
                <TableCell>{row.contractNumber}</TableCell>
                <TableCell>{row.contractDate || '—'}</TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    className={`contract-registry-status contract-registry-status--${getContractDisplayStatus(row)}`}
                  >
                    {getContractStatusLabel(row)}
                  </Typography>
                </TableCell>
                <TableCell>{row.needsSignedAttachment ? 'Нет подписанного файла' : (row.statusDetail || row.currentStageLabel || '—')}</TableCell>
                {showUnreadColumn && (
                  <TableCell sx={{ textAlign: 'center', verticalAlign: 'middle' }}>
                    <UnreadChatCell count={unreadByContract?.[row.id]} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!displayRows.length && (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          {contractSection === 'mine'
            ? 'У вас пока нет созданных договоров.'
            : 'По вашему запросу ничего не найдено.'}
        </Typography>
      )}
    </Paper>
  );
}
