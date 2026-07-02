import {
  Box,
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
import {
  CONTRACT_STATUS_LABELS,
  formatContractTypeLabel,
  normalizeCounterpartyName,
} from '../../utils/contract-approval';

const REGISTRY_COLUMNS = [
  { key: 'idx', label: '№', width: 36 },
  { key: 'number', label: '№ договора', width: 80 },
  { key: 'date', label: 'Дата договора', width: 96 },
  { key: 'type', label: 'Тип', width: 86 },
  { key: 'subject', label: 'Предмет договора', width: 160 },
  { key: 'counterparty', label: 'Контрагент', width: 173 },
  { key: 'inn', label: 'ИНН', width: 110 },
  { key: 'status', label: 'Статус', width: 104 },
  { key: 'stage', label: 'Ход согласования', width: 190 },
] as const;

type ContractRegistryTableProps = {
  contracts: ContractRecord[];
  contractSection: ContractSection;
  selectedContractId: string;
  onOpenContract: (contractId: string) => void;
};

export function ContractRegistryTable({
  contracts,
  contractSection,
  selectedContractId,
  onOpenContract,
}: ContractRegistryTableProps) {
  return (
    <Paper sx={{ px: 0.25, py: 0.5 }}>
      <TableContainer className="contract-registry-table-wrap">
        <Table size="small" className="contract-registry-table">
          <colgroup>
            {REGISTRY_COLUMNS.map((column) => (
              <col key={column.key} style={{ width: `${column.width}px` }} />
            ))}
          </colgroup>
          <TableHead>
            <TableRow>
              {REGISTRY_COLUMNS.map((column) => (
                <TableCell key={column.key}>
                  <Box className="registry-header-cell">
                    <span>{column.label}</span>
                  </Box>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {contracts.map((row, index) => (
              <TableRow
                key={row.id}
                hover
                selected={selectedContractId === row.id}
                className={`contract-clickable-row${row.needsSignedAttachment ? ' contract-row-needs-signed-file' : ''}`}
                title={row.needsSignedAttachment ? 'Нет подписанного экземпляра. Двойной клик откроет карточку договора' : 'Двойной клик откроет карточку договора'}
                onDoubleClick={() => { onOpenContract(row.id); }}
              >
                <TableCell>{index + 1}</TableCell>
                <TableCell>{row.contractNumber}</TableCell>
                <TableCell>{row.contractDate || '—'}</TableCell>
                <TableCell>{formatContractTypeLabel(row.contractType, row.incomeSubtype)}</TableCell>
                <TableCell title={row.subject || ''}>{row.subject || '—'}</TableCell>
                <TableCell title={row.counterpartyName}>
                  {row.counterpartyShortName?.trim() || normalizeCounterpartyName(row.counterpartyName)}
                </TableCell>
                <TableCell>{row.counterpartyInn || '—'}</TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    className={`contract-registry-status contract-registry-status--${row.status}`}
                  >
                    {CONTRACT_STATUS_LABELS[row.status]}
                  </Typography>
                </TableCell>
                <TableCell>{row.needsSignedAttachment ? 'Нет подписанного файла' : (row.statusDetail || row.currentStageLabel || '—')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!contracts.length && (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          {contractSection === 'mine'
            ? 'У вас пока нет созданных договоров.'
            : 'По вашему запросу ничего не найдено.'}
        </Typography>
      )}
    </Paper>
  );
}
