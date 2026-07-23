import { useMemo, useState } from 'react';
import {
  Box,
  Link,
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
import { AttachFile } from '@mui/icons-material';
import type { ContractRecord } from '../../types/contracts';
import {
  getContractDisplayStatus,
  getContractStatusLabel,
  formatContractBaseTypeLabel,
  formatContractSubtypeLabel,
  normalizeCounterpartyName,
} from '../../utils/contract-approval';

type ArchiveSortKey = 'counterparty' | 'inn' | 'type' | 'subtype' | 'number' | 'date' | 'status';
type ArchiveSortDir = 'asc' | 'desc';

// Порядок колонок согласован с реестром: №, Контрагент, ИНН, Тип, № документа, Дата, Статус.
// Колонки, которых в архиве нет (Документ, Подтип, Предмет, Ход, Сообщения), не добавляем.
// «Файл» — специфична для архива, остаётся в конце.
const ARCHIVE_COLUMNS: { key: string; label: string; width: number; sortKey?: ArchiveSortKey }[] = [
  { key: 'idx', label: '№', width: 36 },
  { key: 'counterparty', label: 'Контрагент', width: 210, sortKey: 'counterparty' },
  { key: 'inn', label: 'ИНН', width: 120, sortKey: 'inn' },
  { key: 'type', label: 'Тип', width: 96, sortKey: 'type' },
  { key: 'subtype', label: 'Подтип', width: 96, sortKey: 'subtype' },
  { key: 'number', label: '№ документа', width: 168, sortKey: 'number' },
  { key: 'date', label: 'Дата', width: 96, sortKey: 'date' },
  { key: 'status', label: 'Статус', width: 116, sortKey: 'status' },
  { key: 'file', label: 'Файл', width: 96 },
];

function archiveSortText(contract: ContractRecord, key: ArchiveSortKey): string {
  switch (key) {
    case 'counterparty': return (contract.counterpartyShortName?.trim() || normalizeCounterpartyName(contract.counterpartyName)).toLowerCase();
    case 'inn': return contract.counterpartyInn || '';
    case 'type': return formatContractBaseTypeLabel(contract.contractType);
    case 'subtype': return formatContractSubtypeLabel(contract.contractType, contract.incomeSubtype);
    case 'number': return contract.contractNumber || '';
    case 'date': return contract.contractDate || '';
    case 'status': return getContractStatusLabel(contract);
    default: return '';
  }
}

type ArchiveDisplayRow = {
  contract: ContractRecord;
  depth: 0 | 1;
  rowNumber: string;
  childCount: number;
  isCollapsed: boolean;
};

type ContractArchiveTableProps = {
  contracts: ContractRecord[];
  selectedContractId: string;
  onOpenContract: (contractId: string) => void;
  onOpenFile: (attachmentId: string, fileName: string) => void;
};

export function ContractArchiveTable({
  contracts,
  selectedContractId,
  onOpenContract,
  onOpenFile,
}: ContractArchiveTableProps) {
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

  // В архиве допники по умолчанию свёрнуты — раскрываются кликом по бейджу «+ ДС (N)».
  const [expandedMasters, setExpandedMasters] = useState<Set<string>>(() => new Set());
  const [sortKey, setSortKey] = useState<ArchiveSortKey | null>(null);
  const [sortDir, setSortDir] = useState<ArchiveSortDir>('asc');

  const comparator = useMemo(() => {
    if (!sortKey) return null;
    const dir = sortDir === 'asc' ? 1 : -1;
    return (a: ContractRecord, b: ContractRecord) => (
      archiveSortText(a, sortKey).localeCompare(archiveSortText(b, sortKey), 'ru', { numeric: true }) * dir
    );
  }, [sortKey, sortDir]);

  const handleSort = (key: ArchiveSortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const displayRows = useMemo<ArchiveDisplayRow[]>(() => {
    const rows: ArchiveDisplayRow[] = [];
    const visibleIds = new Set(contracts.map((contract) => contract.id));
    const renderedAddendumIds = new Set<string>();
    let masterIndex = 0;

    const masters = contracts.filter((contract) => contract.documentKind !== 'addendum');
    const sortedMasters = comparator ? [...masters].sort(comparator) : masters;

    sortedMasters.forEach((contract) => {
      masterIndex += 1;
      const children = addendumsByParentId.get(contract.id) ?? [];
      const orderedChildren = comparator ? [...children].sort(comparator) : children;
      const isCollapsed = children.length > 0 && !expandedMasters.has(contract.id);
      rows.push({ contract, depth: 0, rowNumber: String(masterIndex), childCount: children.length, isCollapsed });
      if (!isCollapsed) {
        orderedChildren.forEach((child, childIndex) => {
          renderedAddendumIds.add(child.id);
          rows.push({ contract: child, depth: 1, rowNumber: `${masterIndex}.${childIndex + 1}`, childCount: 0, isCollapsed: false });
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
  }, [addendumsByParentId, comparator, contracts, expandedMasters]);

  const toggleMaster = (contractId: string) => {
    setExpandedMasters((current) => {
      const next = new Set(current);
      if (next.has(contractId)) next.delete(contractId);
      else next.add(contractId);
      return next;
    });
  };

  const renderFileCell = (contract: ContractRecord) => {
    if (!contract.signedFile) {
      return <span className="contract-archive-file-empty">—</span>;
    }
    const file = contract.signedFile;
    return (
      <Link
        component="button"
        type="button"
        underline="hover"
        className="contract-archive-file-link"
        onClick={(event) => {
          event.stopPropagation();
          onOpenFile(file.id, file.originalName);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        title={file.originalName}
      >
        <AttachFile sx={{ fontSize: 13 }} />
        скан
      </Link>
    );
  };

  return (
    <Paper sx={{ px: 0.25, py: 0.5 }}>
      <TableContainer className="contract-registry-table-wrap">
        <Table size="small" className="contract-registry-table">
          <colgroup>
            {ARCHIVE_COLUMNS.map((column) => (
              <col key={column.key} style={{ width: `${column.width}px` }} />
            ))}
          </colgroup>
          <TableHead>
            <TableRow>
              {ARCHIVE_COLUMNS.map((column) => (
                <TableCell key={column.key}>
                  <Box className="registry-header-cell">
                    {column.sortKey ? (
                      <TableSortLabel
                        active={sortKey === column.sortKey}
                        direction={sortKey === column.sortKey ? sortDir : 'asc'}
                        onClick={() => handleSort(column.sortKey as ArchiveSortKey)}
                      >
                        {column.label}
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
                className={`contract-clickable-row${depth === 1 ? ' contract-registry-addendum-row' : ''}`}
                title="Двойной клик откроет карточку договора"
                onDoubleClick={() => { onOpenContract(row.id); }}
              >
                <TableCell>{rowNumber}</TableCell>
                <TableCell title={row.counterpartyName}>
                  {row.counterpartyShortName?.trim() || normalizeCounterpartyName(row.counterpartyName)}
                </TableCell>
                <TableCell>{row.counterpartyInn || '—'}</TableCell>
                <TableCell>{formatContractBaseTypeLabel(row.contractType)}</TableCell>
                <TableCell>{formatContractSubtypeLabel(row.contractType, row.incomeSubtype)}</TableCell>
                <TableCell>
                  {depth === 1 ? (
                    <Box className="contract-archive-addendum-cell">
                      <span className="contract-registry-document-pill contract-registry-document-pill--addendum">ДС</span>
                      <span>{row.contractNumber}</span>
                      {row.parentContractNumber && (
                        <span className="contract-archive-parent-ref">к {row.parentContractNumber}</span>
                      )}
                    </Box>
                  ) : (
                    <Box className="contract-archive-master-cell">
                      <span>{row.contractNumber}</span>
                      {childCount > 0 && (
                        <Box
                          component="span"
                          role="button"
                          tabIndex={0}
                          className="contract-archive-ds-badge"
                          title={isCollapsed ? 'Показать доп. соглашения' : 'Скрыть доп. соглашения'}
                          onClick={(event) => { event.stopPropagation(); toggleMaster(row.id); }}
                          onDoubleClick={(event) => event.stopPropagation()}
                        >
                          + ДС {childCount} {isCollapsed ? '▸' : '▾'}
                        </Box>
                      )}
                    </Box>
                  )}
                </TableCell>
                <TableCell>{row.contractDate || '—'}</TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    className={`contract-registry-status contract-registry-status--${getContractDisplayStatus(row)}`}
                  >
                    {getContractStatusLabel(row)}
                  </Typography>
                </TableCell>
                <TableCell>{renderFileCell(row)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!displayRows.length && (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          По вашему запросу ничего не найдено.
        </Typography>
      )}
    </Paper>
  );
}
