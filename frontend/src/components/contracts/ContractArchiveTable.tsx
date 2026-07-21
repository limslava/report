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
  Typography,
} from '@mui/material';
import { AttachFile } from '@mui/icons-material';
import type { ContractRecord } from '../../types/contracts';
import {
  getContractDisplayStatus,
  getContractStatusLabel,
  formatContractTypeLabel,
  normalizeCounterpartyName,
} from '../../utils/contract-approval';

const ARCHIVE_COLUMNS = [
  { key: 'idx', label: '№', width: 36 },
  { key: 'number', label: '№ документа', width: 168 },
  { key: 'date', label: 'Дата', width: 96 },
  { key: 'type', label: 'Тип', width: 128 },
  { key: 'counterparty', label: 'Контрагент', width: 210 },
  { key: 'inn', label: 'ИНН', width: 120 },
  { key: 'status', label: 'Статус', width: 116 },
  { key: 'file', label: 'Файл', width: 96 },
] as const;

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

  const displayRows = useMemo<ArchiveDisplayRow[]>(() => {
    const rows: ArchiveDisplayRow[] = [];
    const visibleIds = new Set(contracts.map((contract) => contract.id));
    const renderedAddendumIds = new Set<string>();
    let masterIndex = 0;

    contracts.forEach((contract) => {
      if (contract.documentKind === 'addendum') return;
      masterIndex += 1;
      const children = addendumsByParentId.get(contract.id) ?? [];
      const isCollapsed = children.length > 0 && !expandedMasters.has(contract.id);
      rows.push({ contract, depth: 0, rowNumber: String(masterIndex), childCount: children.length, isCollapsed });
      if (!isCollapsed) {
        children.forEach((child, childIndex) => {
          renderedAddendumIds.add(child.id);
          rows.push({ contract: child, depth: 1, rowNumber: `${masterIndex}.${childIndex + 1}`, childCount: 0, isCollapsed: false });
        });
      } else {
        children.forEach((child) => renderedAddendumIds.add(child.id));
      }
    });

    // Допники без видимого родителя показываем как самостоятельные строки.
    contracts.forEach((contract) => {
      if (
        contract.documentKind !== 'addendum'
        || renderedAddendumIds.has(contract.id)
        || (contract.parentContractId && visibleIds.has(contract.parentContractId))
      ) {
        return;
      }
      masterIndex += 1;
      rows.push({ contract, depth: 0, rowNumber: String(masterIndex), childCount: 0, isCollapsed: false });
    });

    return rows;
  }, [addendumsByParentId, contracts, expandedMasters]);

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
                    <span>{column.label}</span>
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
                <TableCell>{formatContractTypeLabel(row.contractType, row.incomeSubtype)}</TableCell>
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
