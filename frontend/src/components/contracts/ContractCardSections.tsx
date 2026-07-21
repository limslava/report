import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type {
  ApprovalDecisionValue,
  ApprovalSheet,
  SecurityInboxItem,
  SecurityVisaValue,
  SheetStep,
} from '../../types/contracts';
import {
  getSecurityVisaColor,
  getSecurityVisaLabel,
  getStepDecisionLabel,
  getStepDecisionTone,
} from '../../utils/contract-approval';
import { ContractFileList } from './ContractFileList';

type ContractCardDetail = {
  label: string;
  value: ReactNode;
  wide?: boolean;
};

type ContractCardDetailsProps = {
  details: ContractCardDetail[];
};

type ContractApprovalActionSectionProps = {
  activeStep: SheetStep | null;
  approvalDecision: ApprovalDecisionValue;
  setApprovalDecision: Dispatch<SetStateAction<ApprovalDecisionValue>>;
  approvalComment: string;
  setApprovalComment: Dispatch<SetStateAction<string>>;
  approvalDecisionBusy: boolean;
  currentUserId?: string;
  currentUserRole?: string;
  sheet: ApprovalSheet | null;
  printPackageBusy: boolean;
  onPrintDocumentPackage: () => void;
  onSubmitDecision: () => void;
  renderStepFiles: (step: SheetStep, contractId: string, allowUpload?: boolean) => ReactNode;
};

type SecurityDecisionForm = {
  visa: SecurityVisaValue;
  comment: string;
};

type SecurityDecisionEditorProps = {
  item: SecurityInboxItem;
  form: SecurityDecisionForm | null;
  onChange: (form: SecurityDecisionForm) => void;
  onSubmit: () => void;
};

type ContractPreviousRevisionsProps = {
  sheet: ApprovalSheet | null;
  onOpenFile: (fileId: string, fileName: string) => void;
  renderProcessStep: (step: SheetStep, contractId: string, expanded?: boolean, allowUpload?: boolean) => ReactNode;
};

export function ContractCardDetails({ details }: ContractCardDetailsProps) {
  return (
    <Box className="contract-card-details">
      {details.map((detail) => (
        <Box
          key={detail.label}
          className={`contract-card-detail${detail.wide ? ' contract-card-detail--wide' : ''}`}
        >
          <Typography variant="caption">{detail.label}</Typography>
          <Typography variant="body2">{detail.value}</Typography>
        </Box>
      ))}
    </Box>
  );
}

export function SecurityDecisionEditor({
  item,
  form,
  onChange,
  onSubmit,
}: SecurityDecisionEditorProps) {
  const commentRequired = form?.visa === 'approved_with_remarks';

  return (
    <Box className="contract-card-section contract-visa-editor">
      <Box className="contract-visa-header">
        <Typography variant="body2" className="contract-card-section-title">Ваша задача: виза руководителя СБ</Typography>
        {item.securityDecision && (
          <Typography
            variant="caption"
            className={`contract-visa-previous contract-visa-text--${getSecurityVisaColor(item)}`}
          >
            Ранее: {getSecurityVisaLabel(item)}
          </Typography>
        )}
      </Box>
      <Box className="decision-row">
        <FormControl fullWidth size="small">
          <InputLabel shrink>Решение</InputLabel>
          <Select
            label="Решение"
            value={form?.visa ?? ''}
            displayEmpty
            onChange={(event) => onChange({
              visa: event.target.value as SecurityVisaValue,
              comment: form?.comment ?? '',
            })}
            renderValue={(value) => value
              ? ({
                approved: 'Согласован',
                approved_with_remarks: 'Согласован с замечаниями',
                rejected: 'Не согласован',
              }[value] ?? value)
              : <Typography component="span" color="text.secondary">Выберите решение</Typography>}
          >
            <MenuItem value="" disabled>Выберите решение</MenuItem>
            <MenuItem value="approved">Согласован</MenuItem>
            <MenuItem value="approved_with_remarks">Согласован с замечаниями</MenuItem>
            <MenuItem value="rejected">Не согласован</MenuItem>
          </Select>
        </FormControl>
        <TextField
          fullWidth
          size="small"
          label="Комментарий"
          required={commentRequired}
          error={commentRequired && !form.comment.trim()}
          placeholder={commentRequired ? 'Укажите замечания к договору' : 'Добавьте комментарий при необходимости'}
          value={form?.comment ?? ''}
          onChange={(event) => onChange({
            visa: form?.visa ?? '',
            comment: event.target.value,
          })}
        />
        <Button
          className="decision-submit"
          variant="contained"
          size="small"
          onClick={onSubmit}
          disabled={!form?.visa || (commentRequired && !form.comment.trim())}
        >
          Сохранить решение
        </Button>
      </Box>
      <Box className="contract-visa-footer">
        <Typography variant="caption" className={commentRequired ? 'contract-visa-hint contract-visa-hint--required' : 'contract-visa-hint'}>
          {commentRequired
            ? 'Для этого решения комментарий обязателен.'
            : 'Комментарий можно добавить при необходимости.'}
        </Typography>
      </Box>
    </Box>
  );
}

export function ContractApprovalActionSection({
  activeStep,
  approvalDecision,
  setApprovalDecision,
  approvalComment,
  setApprovalComment,
  approvalDecisionBusy,
  currentUserId,
  currentUserRole,
  sheet,
  printPackageBusy,
  onPrintDocumentPackage,
  onSubmitDecision,
  renderStepFiles,
}: ContractApprovalActionSectionProps) {
  if (!activeStep) return null;

  const isSecretaryTask = activeStep.roleCode === 'secretary';
  if (!isSecretaryTask) {
    const priorLabel = activeStep.decision ? getStepDecisionLabel(activeStep) : null;
    const commentRequired = approvalDecision === 'approved_with_remarks';
    return (
      <Box className="contract-card-section contract-visa-editor">
        <Box className="contract-visa-header">
          <Typography variant="body2" className="contract-card-section-title">
            Ваша задача: {activeStep.roleCode === 'lawyer' ? 'Виза юриста' : activeStep.roleLabel}
          </Typography>
          {priorLabel && (
            <Typography
              variant="caption"
              className={`contract-visa-previous contract-visa-text--${getStepDecisionTone(activeStep)}`}
            >
              Ранее: {priorLabel}
            </Typography>
          )}
        </Box>
        <Box className="decision-row">
          <FormControl size="small">
            <InputLabel shrink>Решение</InputLabel>
            <Select
              label="Решение"
              value={approvalDecision}
              displayEmpty
              onChange={(event) => setApprovalDecision(event.target.value as ApprovalDecisionValue)}
              renderValue={(value) => value
                ? ({
                  approved: 'Согласован',
                  approved_with_remarks: 'Согласован с замечаниями',
                  rejected: 'Не согласован',
                }[value] ?? value)
                : <Typography component="span" color="text.secondary">Выберите решение</Typography>}
            >
              <MenuItem value="" disabled>Выберите решение</MenuItem>
              <MenuItem value="approved">Согласован</MenuItem>
              <MenuItem value="approved_with_remarks">Согласован с замечаниями</MenuItem>
              <MenuItem value="rejected">Не согласован</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label={commentRequired ? 'Комментарий *' : 'Комментарий'}
            required={commentRequired}
            error={commentRequired && !approvalComment.trim()}
            value={approvalComment}
            onChange={(event) => setApprovalComment(event.target.value)}
            placeholder={commentRequired ? 'Укажите замечания к договору' : 'Добавьте комментарий при необходимости'}
          />
          <Button
            className="decision-submit"
            variant="contained"
            size="small"
            disabled={approvalDecisionBusy || !approvalDecision || (commentRequired && !approvalComment.trim())}
            onClick={onSubmitDecision}
          >
            {approvalDecisionBusy ? 'Сохранение...' : 'Сохранить решение'}
          </Button>
        </Box>
        <Box className="contract-visa-footer">
          <Typography
            variant="caption"
            className={commentRequired ? 'contract-visa-hint contract-visa-hint--required' : 'contract-visa-hint'}
          >
            {commentRequired
              ? 'Для этого решения комментарий обязателен.'
              : 'Комментарий можно добавить при необходимости.'}
          </Typography>
        </Box>
      </Box>
    );
  }

  const hasSignedContractFile = Boolean(activeStep.attachments?.length);
  const isSecretaryOwner = currentUserRole === 'secretary' || activeStep.approverUserId === currentUserId;
  const isSigningFallback = !isSecretaryOwner && sheet?.contract.initiator?.id === currentUserId;
  const secretaryRejectSelected = approvalDecision === 'rejected';
  const secretaryApproveSelected = approvalDecision === 'approved';

  return (
    <Box className={`contract-card-section contract-secretary-task${isSigningFallback ? ' contract-secretary-task--compact' : ''}`}>
      <Box className="contract-secretary-task-header">
        <Box>
          <Typography variant="body2" className="contract-card-section-title">
            {isSigningFallback ? 'Подписанный экземпляр' : 'Передача на подпись'}
          </Typography>
          <Typography variant="caption" className="contract-secretary-task-subtitle">
            {isSigningFallback
              ? 'Приложите скан подписанного договора, если он уже у вас.'
              : 'Задача офис-менеджера: подготовить пакет, получить подпись и приложить скан.'}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          className={hasSignedContractFile ? 'contract-secretary-task-status contract-secretary-task-status--ready' : 'contract-secretary-task-status'}
        >
          {hasSignedContractFile ? 'Файл приложен' : 'Нужен подписанный файл'}
        </Typography>
      </Box>
      <Box className="contract-secretary-task-body">
        {!isSigningFallback && (
          <Box className="contract-secretary-task-instruction">
            <Typography variant="caption">Что сделать</Typography>
            <Typography variant="body2">
              Распечатайте договор и лист согласования, передайте на подпись. После возврата подписи приложите скан подписанного экземпляра.
            </Typography>
            <Stack direction="row" spacing={1} className="contract-secretary-task-print-actions">
              <Button
                size="small"
                variant="outlined"
                onClick={onPrintDocumentPackage}
                disabled={!sheet || printPackageBusy}
              >
                {printPackageBusy ? 'Формирование...' : 'Распечатать договор'}
              </Button>
            </Stack>
          </Box>
        )}
        <Box className="contract-secretary-task-files">
          <Typography variant="caption">Подписанный экземпляр</Typography>
          {sheet && renderStepFiles(activeStep, sheet.contract.id)}
        </Box>
        <Box className="contract-secretary-task-decision">
          <FormControl fullWidth size="small">
            <InputLabel shrink>Итоговое решение</InputLabel>
            <Select
              label="Итоговое решение"
              value={approvalDecision}
              displayEmpty
              onChange={(event) => setApprovalDecision(event.target.value as ApprovalDecisionValue)}
              renderValue={(value) => value
                ? ({
                  approved: 'Согласован',
                  approved_with_remarks: 'Согласован',
                  rejected: 'Не согласован',
                }[value] ?? value)
                : <Typography component="span" color="text.secondary">Выберите решение</Typography>}
            >
              <MenuItem value="" disabled>Выберите решение</MenuItem>
              <MenuItem value="approved">Согласован</MenuItem>
              <MenuItem value="rejected">Не согласован</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label={secretaryRejectSelected ? 'Комментарий *' : 'Комментарий'}
            required={secretaryRejectSelected}
            error={secretaryRejectSelected && !approvalComment.trim()}
            value={approvalComment}
            onChange={(event) => setApprovalComment(event.target.value)}
            placeholder={secretaryRejectSelected ? 'Укажите причину, почему ГД не согласовал договор' : 'Комментарий при необходимости'}
          />
        </Box>
        <Button
          className="contract-secretary-task-button"
          variant="contained"
          size="small"
          disabled={
            approvalDecisionBusy
            || !approvalDecision
            || (secretaryApproveSelected && !hasSignedContractFile)
            || (secretaryRejectSelected && !approvalComment.trim())
          }
          onClick={onSubmitDecision}
        >
          {approvalDecisionBusy ? 'Сохранение...' : secretaryRejectSelected ? 'Зафиксировать отказ' : 'Завершить подписание'}
        </Button>
      </Box>
    </Box>
  );
}

export function ContractPreviousRevisions({
  sheet,
  onOpenFile,
  renderProcessStep,
}: ContractPreviousRevisionsProps) {
  if (!sheet?.previousRevisions?.length) return null;

  return (
    <Box className="contract-card-section contract-process">
      <Typography variant="body2" className="contract-card-section-title">Предыдущие редакции</Typography>
      {sheet.previousRevisions.map((revision) => (
        <Box key={revision.revisionNo} className="contract-process-group">
          <Box className="contract-process-group-heading">
            <Typography variant="body2">Редакция {revision.revisionNo}</Typography>
            <Typography variant="caption" className="contract-process-note">Сохранена в истории</Typography>
          </Box>
          {!!revision.attachments.length && (
            <Box className="contract-process-files">
              <Typography variant="caption">Документы:</Typography>
              <ContractFileList
                files={revision.attachments}
                onOpenFile={(file) => onOpenFile(file.id, file.originalName)}
              />
            </Box>
          )}
          {revision.steps
            .filter((step) => step.roleCode !== 'secretary')
            .map((step) => renderProcessStep(step, sheet.contract.id))}
        </Box>
      ))}
    </Box>
  );
}
