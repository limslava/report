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
  Typography,
} from '@mui/material';
import type { ContractRecord, ContractSection } from '../../types/contracts';
import { UnreadChatCell, UnreadChatHeaderIcon } from './ContractInboxTables';
import {
  getContractDisplayStatus,
  getContractStatusLabel,
  formatContractTypeLabel,
  normalizeCounterpartyName,
} from '../../utils/contract-approval';

const REGISTRY_COLUMNS = [
  { key: 'idx', label: '№', width: 36 },
  { key: 'kind', label: 'Документ', width: 118 },
  { key: 'number', label: '№ документа', width: 96 },
  { key: 'date', label: 'Дата договора', width: 96 },
  { key: 'type', label: 'Тип', width: 86 },
  { key: 'subject', label: 'Предмет договора', width: 160 },
  { key: 'counterparty', label: 'Контрагент', width: 173 },
  { key: 'inn', label: 'ИНН', width: 110 },
  { key: 'status', label: 'Статус', width: 104 },
  { key: 'stage', label: 'Ход согласования', width: 190 },
] as const;

// Колонка непрочитанных сообщений — только в «Мои договоры», в самом конце.
const CHAT_COLUMN = { key: 'chat', label: '', width: 40 } as const;

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

  const displayRows = useMemo<RegistryDisplayRow[]>(() => {
    const rows: RegistryDisplayRow[] = [];
    const visibleIds = new Set(contracts.map((contract) => contract.id));
    const renderedAddendumIds = new Set<string>();
    let masterIndex = 0;

    contracts.forEach((contract) => {
      if (contract.documentKind === 'addendum') return;

      masterIndex += 1;
      const children = addendumsByParentId.get(contract.id) ?? [];
      const isCollapsed = collapsedMasters.has(contract.id);
      rows.push({
        contract,
        depth: 0,
        rowNumber: String(masterIndex),
        childCount: children.length,
        isCollapsed,
      });

      if (!isCollapsed) {
        children.forEach((child, childIndex) => {
          renderedAddendumIds.add(child.id);
          rows.push({
            contract: child,
            depth: 1,
            rowNumber: `${masterIndex}.${childIndex + 1}`,
            childCount: 0,
            isCollapsed: false,
          });
        });
      }
    });

    contracts.forEach((contract) => {
      if (
        contract.documentKind !== 'addendum'
        || renderedAddendumIds.has(contract.id)
        || (contract.parentContractId && visibleIds.has(contract.parentContractId))
      ) {
        return;
      }
      masterIndex += 1;
      rows.push({
        contract,
        depth: 0,
        rowNumber: String(masterIndex),
        childCount: 0,
        isCollapsed: false,
      });
    });

    return rows;
  }, [addendumsByParentId, collapsedMasters, contracts]);

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
                <TableCell key={column.key} sx={column.key === 'chat' ? { textAlign: 'center' } : undefined}>
                  <Box className="registry-header-cell" sx={column.key === 'chat' ? { justifyContent: 'center' } : undefined}>
                    {column.key === 'chat' ? <UnreadChatHeaderIcon /> : <span>{column.label}</span>}
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
                <TableCell>{row.contractNumber}</TableCell>
                <TableCell>{row.contractDate || '—'}</TableCell>
                <TableCell>{formatContractTypeLabel(row.contractType, row.incomeSubtype)}</TableCell>
                <TableCell title={row.documentKind === 'addendum' ? (row.parentContractNumber || '') : (row.subject || '')}>
                  {row.documentKind === 'addendum'
                    ? row.parentContractNumber ? `Допник к договору ${row.parentContractNumber}` : 'Допник к основному договору'
                    : row.subject || '—'}
                </TableCell>
                <TableCell title={row.counterpartyName}>
                  {row.counterpartyShortName?.trim() || normalizeCounterpartyName(row.counterpartyName)}
                </TableCell>
                <TableCell>{row.counterpartyInn || '—'}</TableCell>
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
