import type { Dispatch, SetStateAction } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type {
  ContractAttachmentRef,
  ContractWizardForm,
  ContractWizardPrefill,
  DuplicateContract,
} from '../../types/contracts';
import { CONTRACT_STATUS_LABELS } from '../../utils/contract-approval';

type ContractWizardProps = {
  open: boolean;
  step: number;
  wizard: ContractWizardForm;
  setWizard: Dispatch<SetStateAction<ContractWizardForm>>;
  prefill: ContractWizardPrefill | null;
  checking: boolean;
  submitting: boolean;
  innResolving: boolean;
  duplicates: DuplicateContract[];
  existingFiles: ContractAttachmentRef[];
  files: File[];
  parentContracts: Array<{
    id: string;
    contractNumber: string;
    counterpartyName: string;
    counterpartyShortName?: string | null;
    contractType: 'expense' | 'income';
  }>;
  isInnValidLength: boolean;
  isInnInvalidLength: boolean;
  requiresAttachmentStep: boolean;
  importSigned: boolean;
  onClose: () => void;
  onInnBlur: () => void;
  onCheck: () => void;
  onContinueFromDuplicates: () => void;
  onBack: () => void;
  onGoToFiles: () => void;
  onSubmit: () => void;
  onOpenDuplicate: (contractId: string) => void;
  onAppendFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
};

export function ContractWizard({
  open,
  step,
  wizard,
  setWizard,
  prefill,
  checking,
  submitting,
  innResolving,
  duplicates,
  existingFiles,
  files,
  parentContracts,
  isInnValidLength,
  isInnInvalidLength,
  requiresAttachmentStep,
  importSigned,
  onClose,
  onInnBlur,
  onCheck,
  onContinueFromDuplicates,
  onBack,
  onGoToFiles,
  onSubmit,
  onOpenDuplicate,
  onAppendFiles,
  onRemoveFile,
}: ContractWizardProps) {
  const isIncomeContract = wizard.contractType === 'income';
  const isIncomeWithoutPsr = isIncomeContract && wizard.psrMode === 'without_psr';
  const isAddendum = wizard.documentKind === 'addendum';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          width: '100%',
          maxWidth: 760,
          minHeight: 500,
          maxHeight: '90vh',
        },
      }}
    >
      <DialogTitle>
        {importSigned
          ? isAddendum ? 'Импорт подписанного доп. соглашения' : 'Импорт подписанного договора'
          : isAddendum ? 'Добавление доп. соглашения' : 'Добавление договора на согласование'}
      </DialogTitle>
      <DialogContent sx={{ minHeight: 380 }}>
        {step === 0 && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="ИНН контрагента"
              value={wizard.counterpartyInn}
              onChange={(event) => setWizard({
                ...wizard,
                counterpartyInn: event.target.value.replace(/\D/g, '').slice(0, 12),
              })}
              onBlur={onInnBlur}
              error={isInnInvalidLength}
              helperText={isInnInvalidLength ? 'Введен неправильный ИНН: должно быть 10 или 12 цифр' : ' '}
            />
            <TextField
              label="Наименование (контрагент)"
              value={wizard.counterpartyName}
              onChange={(event) => setWizard({ ...wizard, counterpartyName: event.target.value })}
              multiline
              minRows={2}
              placeholder="Заполнится из ФНС или введите вручную"
            />
            <TextField
              label="Краткое наименование"
              value={wizard.counterpartyShortName}
              onChange={(event) => setWizard({ ...wizard, counterpartyShortName: event.target.value })}
              placeholder="Например: ООО Ромашка"
            />
            <FormControl fullWidth>
              <InputLabel>Форма контрагента</InputLabel>
              <Select
                label="Форма контрагента"
                value={wizard.counterpartyForm}
                onChange={(event) => setWizard({
                  ...wizard,
                  counterpartyForm: event.target.value as ContractWizardForm['counterpartyForm'],
                })}
              >
                <MenuItem value="">Не указана</MenuItem>
                <MenuItem value="ooo">ООО</MenuItem>
                <MenuItem value="ao">АО</MenuItem>
                <MenuItem value="pao">ПАО</MenuItem>
                <MenuItem value="zao">ЗАО</MenuItem>
                <MenuItem value="ip">ИП</MenuItem>
              </Select>
            </FormControl>
            {innResolving && (
              <Typography variant="body2" color="text.secondary">Поиск контрагента по ИНН...</Typography>
            )}
            {!innResolving && isInnValidLength && !prefill?.counterpartyName && (
              <Typography variant="body2" color="warning.main">
                Если ФНС не вернет данные, заполните реквизиты вручную.
              </Typography>
            )}
            <FormControl fullWidth>
              <InputLabel>Вид документа</InputLabel>
              <Select
                label="Вид документа"
                value={wizard.documentKind}
                onChange={(event) => setWizard({
                  ...wizard,
                  documentKind: event.target.value as ContractWizardForm['documentKind'],
                  parentContractId: event.target.value === 'master' ? '' : wizard.parentContractId,
                })}
              >
                <MenuItem value="master">Основной договор</MenuItem>
                <MenuItem value="addendum">Доп. соглашение</MenuItem>
              </Select>
            </FormControl>
            {isAddendum && (
              <FormControl fullWidth>
                <InputLabel>К основному договору</InputLabel>
                <Select
                  label="К основному договору"
                  value={wizard.parentContractId}
                  onChange={(event) => setWizard({
                    ...wizard,
                    parentContractId: event.target.value,
                  })}
                >
                  {!parentContracts.length && (
                    <MenuItem disabled value="">
                      Нет основных договоров этого контрагента и типа
                    </MenuItem>
                  )}
                  {parentContracts.map((contract) => (
                    <MenuItem key={contract.id} value={contract.id}>
                      {contract.contractNumber} - {contract.counterpartyShortName || contract.counterpartyName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <FormControl fullWidth>
              <InputLabel>Тип договора</InputLabel>
              <Select
                label="Тип договора"
                value={wizard.contractType}
                onChange={(event) => {
                  const contractType = event.target.value as ContractWizardForm['contractType'];
                  setWizard({
                    ...wizard,
                    contractType,
                    psrMode: contractType === 'income' ? wizard.psrMode : 'without_psr',
                    contractNumber: contractType === 'income' ? '' : wizard.contractNumber,
                    parentContractId: wizard.documentKind === 'addendum' ? '' : wizard.parentContractId,
                  });
                }}
              >
                <MenuItem value="expense">Расходный</MenuItem>
                <MenuItem value="income">Доходный</MenuItem>
              </Select>
            </FormControl>
            {wizard.contractType === 'income' && (
              <FormControl fullWidth>
                <InputLabel>Подтип доходного</InputLabel>
                <Select
                  label="Подтип доходного"
                  value={wizard.psrMode}
                  onChange={(event) => setWizard({
                    ...wizard,
                    psrMode: event.target.value as ContractWizardForm['psrMode'],
                    contractNumber: '',
                  })}
                >
                  <MenuItem value="with_psr">С ПСР</MenuItem>
                  <MenuItem value="without_psr">Без ПСР</MenuItem>
                </Select>
              </FormControl>
            )}
          </Stack>
        )}

        {step === 4 && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            {checking && <Typography>Проверка дублей и данных контрагента...</Typography>}
            {!checking && duplicates.length > 0 && (
              <Alert severity="warning">
                Найдены похожие договоры по ИНН и типу. Выберите: отменить или продолжить.
              </Alert>
            )}
            {!checking && duplicates.length > 0 && (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>№</TableCell>
                    <TableCell>Дата</TableCell>
                    <TableCell>Предмет</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {duplicates.map((duplicate) => (
                    <TableRow
                      key={duplicate.id}
                      hover
                      className="contract-clickable-row"
                      title="Двойной клик откроет лист согласования"
                      onDoubleClick={() => onOpenDuplicate(duplicate.id)}
                    >
                      <TableCell>{duplicate.contractNumber}</TableCell>
                      <TableCell>{duplicate.contractDate ?? '—'}</TableCell>
                      <TableCell>{duplicate.subject ?? '—'}</TableCell>
                      <TableCell>{CONTRACT_STATUS_LABELS[duplicate.status] ?? duplicate.status}</TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => onOpenDuplicate(duplicate.id)}>
                          Лист
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!checking && duplicates.length === 0 && (
              <Alert severity="success">Похожих договоров не найдено. Можно продолжать.</Alert>
            )}
          </Stack>
        )}

        {step === 5 && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            {isIncomeContract && !importSigned && !isAddendum ? (
              <Alert severity="info">
                Номер доходного договора будет присвоен автоматически при отправке.
              </Alert>
            ) : (
              <TextField
                label={isAddendum ? '№ доп. соглашения' : '№ договора'}
                value={wizard.contractNumber}
                onChange={(event) => setWizard({ ...wizard, contractNumber: event.target.value })}
              />
            )}
            {!isAddendum && (
              <TextField
                label="Предмет договора"
                value={wizard.subject}
                onChange={(event) => setWizard({ ...wizard, subject: event.target.value })}
              />
            )}
            <TextField
              label={isAddendum ? 'Дата доп. соглашения' : 'Дата договора'}
              type="date"
              value={wizard.contractDate}
              onChange={(event) => setWizard({ ...wizard, contractDate: event.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            <FormControl fullWidth>
              <InputLabel>Способ подписания</InputLabel>
              <Select
                label="Способ подписания"
                value={wizard.signingMethod}
                onChange={(event) => setWizard({
                  ...wizard,
                  signingMethod: event.target.value as ContractWizardForm['signingMethod'],
                })}
              >
                <MenuItem value="edo">ЭДО</MenuItem>
                <MenuItem value="post">Почта</MenuItem>
              </Select>
            </FormControl>
            {isIncomeWithoutPsr && (
              <>
                <Typography variant="subtitle2">Данные из ФНС</Typography>
                <TextField
                  label="ОГРН / ОГРНИП"
                  value={wizard.counterpartyOgrn}
                  onChange={(event) => setWizard({ ...wizard, counterpartyOgrn: event.target.value.replace(/\D/g, '').slice(0, 15) })}
                />
                <TextField
                  label="КПП"
                  value={wizard.counterpartyKpp}
                  onChange={(event) => setWizard({ ...wizard, counterpartyKpp: event.target.value.replace(/\D/g, '').slice(0, 9) })}
                  helperText={prefill?.counterpartyForm === 'ip' ? 'Для ИП КПП не требуется' : ' '}
                />
                <TextField
                  label="Юридический адрес"
                  value={wizard.counterpartyLegalAddress}
                  onChange={(event) => setWizard({ ...wizard, counterpartyLegalAddress: event.target.value })}
                  multiline
                  minRows={2}
                />
                <TextField
                  label="Почтовый адрес"
                  value={wizard.counterpartyPostalAddress}
                  onChange={(event) => setWizard({ ...wizard, counterpartyPostalAddress: event.target.value })}
                  multiline
                  minRows={2}
                  placeholder="Если совпадает с юридическим, можно оставить как есть"
                />

                <Typography variant="subtitle2">Подписант</Typography>
                <TextField
                  label="Должность подписанта в договоре"
                  value={wizard.counterpartySignerPosition}
                  onChange={(event) => setWizard({ ...wizard, counterpartySignerPosition: event.target.value })}
                  helperText="Например: Генерального директора"
                />
                <TextField
                  label="ФИО подписанта"
                  value={wizard.counterpartySignerName}
                  onChange={(event) => setWizard({ ...wizard, counterpartySignerName: event.target.value })}
                />
                <TextField
                  label="Основание полномочий"
                  value={wizard.counterpartySignerAuthority}
                  onChange={(event) => setWizard({ ...wizard, counterpartySignerAuthority: event.target.value })}
                  placeholder="Например: Устава"
                />

                <Typography variant="subtitle2">Банковские и контактные реквизиты</Typography>
                <TextField
                  label="Расчетный счет"
                  value={wizard.counterpartyBankAccount}
                  onChange={(event) => setWizard({ ...wizard, counterpartyBankAccount: event.target.value.replace(/\D/g, '').slice(0, 20) })}
                />
                <TextField
                  label="Банк"
                  value={wizard.counterpartyBankName}
                  onChange={(event) => setWizard({ ...wizard, counterpartyBankName: event.target.value })}
                />
                <TextField
                  label="Корреспондентский счет"
                  value={wizard.counterpartyCorrespondentAccount}
                  onChange={(event) => setWizard({ ...wizard, counterpartyCorrespondentAccount: event.target.value.replace(/\D/g, '').slice(0, 20) })}
                />
                <TextField
                  label="БИК"
                  value={wizard.counterpartyBankBik}
                  onChange={(event) => setWizard({ ...wizard, counterpartyBankBik: event.target.value.replace(/\D/g, '').slice(0, 9) })}
                />
                <TextField
                  label="Телефон"
                  value={wizard.counterpartyPhone}
                  onChange={(event) => setWizard({ ...wizard, counterpartyPhone: event.target.value })}
                />
                <TextField
                  label="E-mail"
                  value={wizard.counterpartyEmail}
                  onChange={(event) => setWizard({ ...wizard, counterpartyEmail: event.target.value })}
                />
              </>
            )}
          </Stack>
        )}

        {step === 6 && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body1">Приложите файлы договора (можно перетащить в область ниже)</Typography>
            <Box
              sx={{
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 1,
                p: 3,
                textAlign: 'center',
                bgcolor: 'background.paper',
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const dropped = Array.from(event.dataTransfer.files || []);
                if (!dropped.length) return;
                onAppendFiles(dropped);
              }}
            >
              <Button variant="outlined" component="label">
                Выбрать файлы
                <input
                  hidden
                  type="file"
                  multiple
                  onChange={(event) => {
                    const selected = Array.from(event.target.files || []);
                    if (!selected.length) return;
                    onAppendFiles(selected);
                    event.target.value = '';
                  }}
                />
              </Button>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Перетащите файлы сюда
              </Typography>
            </Box>
            {existingFiles.length > 0 && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  Уже прикреплены к черновику:
                </Typography>
                {existingFiles.map((file, index) => (
                  <Typography key={file.id} variant="body2">
                    {index + 1}. {file.originalName}
                  </Typography>
                ))}
              </Box>
            )}
            {files.length > 0 && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  Новые файлы к отправке:
                </Typography>
                {files.map((file, index) => (
                  <Stack
                    key={`${file.name}-${file.size}-${index}`}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ py: 0.25 }}
                  >
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                      {index + 1}. {file.name}
                    </Typography>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => onRemoveFile(index)}
                      disabled={submitting}
                    >
                      Удалить
                    </Button>
                  </Stack>
                ))}
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Отменить</Button>
        {step > 0 && step < 7 && (
          <Button onClick={onBack} disabled={submitting}>Назад</Button>
        )}
        {step === 0 && (
          <Button
            variant="contained"
            onClick={onCheck}
            disabled={!isInnValidLength || innResolving || submitting || (isAddendum && !wizard.parentContractId)}
          >
            {isAddendum ? 'Далее' : 'Проверить'}
          </Button>
        )}
        {step === 4 && !checking && (
          <Button
            variant="contained"
            onClick={onContinueFromDuplicates}
            disabled={!wizard.counterpartyName.trim() || submitting}
          >
            Продолжить
          </Button>
        )}
        {step === 5 && (
          <Button
            variant="contained"
            onClick={requiresAttachmentStep ? onGoToFiles : onSubmit}
            disabled={((requiresAttachmentStep && (!isIncomeContract || importSigned)) || isAddendum) && !wizard.contractNumber.trim() || (!isAddendum && !wizard.subject.trim()) || !wizard.contractDate || submitting}
          >
            {requiresAttachmentStep ? 'Далее' : submitting ? 'Отправка...' : 'Отправить'}
          </Button>
        )}
        {step === 6 && (
          <Button variant="contained" onClick={onSubmit} disabled={submitting || (importSigned && files.length === 0 && existingFiles.length === 0)}>
            {submitting ? 'Отправка...' : importSigned ? 'Импортировать' : 'Отправить'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
