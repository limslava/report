import type { ReactNode } from 'react';
import {
  Box,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { ApprovalSheet, SheetStep } from '../../types/contracts';
import {
  formatDateTime,
  getApprovalStartDate,
  getStepDecisionLabel,
} from '../../utils/contract-approval';

type ContractApprovalSheetProps = {
  sheet: ApprovalSheet;
  actionSlot?: ReactNode;
  footerSlot?: ReactNode;
  renderStepFiles: (step: SheetStep, contractId: string, allowUpload?: boolean) => ReactNode;
  onOpenAttachmentPreview: (fileId: string, fileName: string) => void;
};

export function ContractApprovalSheet({
  sheet,
  actionSlot,
  footerSlot,
  renderStepFiles,
  onOpenAttachmentPreview,
}: ContractApprovalSheetProps) {
  const secretaryAttachments = sheet.steps
    .filter((step) => step.roleCode === 'secretary')
    .flatMap((step) => step.attachments);

  return (
    <Box className="approval-sheet-print">
      {actionSlot}
      <Typography variant="h6" align="center" sx={{ mb: 2 }}>Лист согласования ООО «Симпл Вэй»</Typography>
      <TableContainer sx={{ mb: 2 }}>
        <Table size="small" className="approval-sheet-table">
          <TableBody>
            <TableRow><TableCell className="label">Контрагент</TableCell><TableCell>{sheet.contract.counterpartyName}</TableCell></TableRow>
            <TableRow><TableCell className="label">Тип договора</TableCell><TableCell>{sheet.contract.contractType === 'expense' ? 'Расходный' : 'Доходный'}</TableCell></TableRow>
            <TableRow><TableCell className="label">Подтип доходного</TableCell><TableCell>{sheet.contract.contractType === 'income' ? (sheet.contract.incomeSubtype === 'with_psr' ? 'С ПСР' : 'Без ПСР') : '—'}</TableCell></TableRow>
            <TableRow><TableCell className="label">Предмет/номера договора</TableCell><TableCell>{sheet.contract.subject || '—'}</TableCell></TableRow>
            <TableRow><TableCell className="label">ПСР (Протокол разногласий)</TableCell><TableCell>{sheet.contract.psrFlag ? 'ПСР' : '—'}</TableCell></TableRow>
            <TableRow><TableCell className="label">Способ подписания (ЭДО/почта)</TableCell><TableCell>{sheet.contract.signingMethod === 'edo' ? 'ЭДО' : 'почта'}</TableCell></TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      {secretaryAttachments.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 0.5 }}>Подписанный экземпляр</Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {secretaryAttachments.map((file) => (
              <Button
                key={file.id}
                size="small"
                variant="text"
                onClick={() => onOpenAttachmentPreview(file.id, file.originalName)}
              >
                {file.originalName}
              </Button>
            ))}
          </Stack>
        </Box>
      )}

      <Typography variant="subtitle1" align="center" sx={{ mb: 1 }}>Ход согласования</Typography>
      <TableContainer>
        <Table size="small" className="approval-sheet-table">
          <TableHead>
            <TableRow>
              <TableCell>Сторона</TableCell>
              <TableCell>ФИО</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Дата принятия</TableCell>
              <TableCell>Дата визирования</TableCell>
              <TableCell>Комментарии</TableCell>
              <TableCell>Файлы</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow key="initiator">
              <TableCell>Инициатор</TableCell>
              <TableCell>{sheet.contract.initiator?.fullName || '—'}</TableCell>
              <TableCell>Согласован</TableCell>
              <TableCell>{formatDateTime(getApprovalStartDate(sheet))}</TableCell>
              <TableCell>{formatDateTime(getApprovalStartDate(sheet))}</TableCell>
              <TableCell>—</TableCell>
              <TableCell>—</TableCell>
            </TableRow>
            {sheet.steps.filter((step) => step.roleCode !== 'secretary').map((step) => (
              <TableRow key={step.id}>
                <TableCell>{step.roleLabel}</TableCell>
                <TableCell>{step.approverName || '—'}</TableCell>
                <TableCell>{getStepDecisionLabel(step)}</TableCell>
                <TableCell>{formatDateTime(step.acceptedAt || step.assignedAt || null)}</TableCell>
                <TableCell>{formatDateTime(step.signedAt)}</TableCell>
                <TableCell>{step.comment || '—'}</TableCell>
                <TableCell>{renderStepFiles(step, sheet.contract.id)}</TableCell>
              </TableRow>
            ))}
            <TableRow key="general-director-signature">
              <TableCell>Генеральный директор</TableCell>
              <TableCell>Васильковский М.О.</TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
      {footerSlot}
    </Box>
  );
}
