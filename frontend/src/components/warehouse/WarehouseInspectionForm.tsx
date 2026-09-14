import { ExpandMore } from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Checkbox,
  Chip,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ReactNode } from 'react';
import { WarehouseVehicleInspectionPayload } from '../../services/warehouse.api';

interface Props {
  value: WarehouseVehicleInspectionPayload;
  onChange: (value: WarehouseVehicleInspectionPayload) => void;
  /** просмотр без правки (карточка ТС у финансов/клиента, выданное ТС) */
  readOnly?: boolean;
  /** секции раскрыты сразу (в карточке ТС данные должны быть видны без кликов) */
  defaultExpanded?: boolean;
  /** плотная раскладка для карточки ТС: мелкий шрифт, 3 колонки */
  compact?: boolean;
  /** не выводить поля «Личные вещи», «Повреждения», «Ответственность» (карточка рисует их рядом со схемой) */
  hideNotes?: boolean;
}

export const vehicleDetailFields = [
  ['engineNumber', 'Модель и номер двигателя'],
  ['bodyNumber', 'Кузов / кабина / прицеп №'],
  ['manufactureYear', 'Год изготовления'],
  ['bodyColor', 'Цвет кузова'],
  ['ptsNumber', 'ПТС серия, номер'],
  ['odometerKm', 'Показания одометра, км'],
  ['hourMeter', 'Показания счетчика, м/ч'],
] as const;

export const documentsAndKeys = [
  ['serviceBook', 'Сервисная книжка'],
  ['manual', 'Руководство по эксплуатации'],
  ['ignitionKeys', 'Ключи от замка зажигания'],
  ['specialEquipmentKeys', 'Ключи от дверей / спецоборудования'],
] as const;

export const equipmentFields = [
  ['toolKit', 'Инструмент / ЗИП'],
  ['firstAidKit', 'Аптечка'],
  ['fireExtinguisher', 'Огнетушитель'],
  ['jack', 'Домкрат'],
  ['spareWheel', 'Запасное колесо'],
  ['warningTriangle', 'Знак аварийной остановки'],
  ['wheelWrench', 'Баллонный ключ'],
] as const;

export const technicalCondition = [
  ['engineStarts', 'Двигатель запускается'],
  ['movesOnOwn', 'ТС передвигается своим ходом'],
  ['batteryPresent', 'Аккумуляторы на месте'],
  ['majorUnitsMissing', 'Отсутствуют крупные узлы / агрегаты'],
  ['interiorClean', 'Салон чистый, без царапин'],
  ['interiorIncomplete', 'Разукомплектованность салона'],
  ['allWheelsPresent', 'Все колеса на месте'],
  ['completenessMatches', 'Комплектность соответствует документам'],
  ['lightsDamage', 'Повреждения фар / фонарей'],
  ['glassDamage', 'Повреждения стекол'],
  ['mirrorsDamage', 'Повреждения зеркал'],
  ['floorMatsPresent', 'Ковры в салоне'],
] as const;

export const technicalTextFields = [
  ['wheelInfo', 'Марка, модель колес и год'],
] as const;

const updateGroup = (
  value: WarehouseVehicleInspectionPayload,
  group: keyof WarehouseVehicleInspectionPayload,
  key: string,
  nextValue: unknown,
): WarehouseVehicleInspectionPayload => ({
  ...value,
  [group]: {
    ...((value[group] as Record<string, unknown> | undefined) ?? {}),
    [key]: nextValue,
  },
});

const groupValue = (
  value: WarehouseVehicleInspectionPayload,
  group: keyof WarehouseVehicleInspectionPayload,
  key: string,
) => ((value[group] as Record<string, unknown> | undefined) ?? {})[key];

export const emptyWarehouseInspection = (): WarehouseVehicleInspectionPayload => ({
  vehicleDetails: {},
  documentsAndKeys: {},
  equipment: {},
  technicalCondition: {},
  photoChecklist: {},
  damageNotes: '',
  personalItemsNotes: '',
  responsibilityAmount: null,
});

export default function WarehouseInspectionForm({
  value,
  onChange,
  readOnly = false,
  defaultExpanded = false,
  compact = false,
  hideNotes = false,
}: Props) {
  const columns = compact
    ? { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }
    : { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' };
  const textInput = (
    group: keyof WarehouseVehicleInspectionPayload,
    key: string,
    label: string,
  ) => (
    <TextField
      key={`${String(group)}.${key}`}
      fullWidth
      size={compact ? 'small' : 'medium'}
      label={label}
      value={String(groupValue(value, group, key) ?? '')}
      onChange={(event) => onChange(updateGroup(value, group, key, event.target.value))}
      InputProps={{ readOnly }}
    />
  );

  const checkboxInput = (
    group: keyof WarehouseVehicleInspectionPayload,
    key: string,
    label: string,
  ) => (
    <FormControlLabel
      key={`${String(group)}.${key}`}
      control={(
        <Checkbox
          size={compact ? 'small' : 'medium'}
          sx={compact ? { py: 0.25 } : undefined}
          checked={Boolean(groupValue(value, group, key))}
          disabled={readOnly}
          onChange={(event) => onChange(updateGroup(value, group, key, event.target.checked))}
        />
      )}
      label={label}
      sx={compact ? { mr: 0, '& .MuiFormControlLabel-label': { fontSize: 12.5, lineHeight: 1.25 } } : undefined}
    />
  );

  // Секции свёрнуты в аккордеоны: на телефоне осмотр был бесконечной
  // простынёй полей. Счётчик в заголовке показывает заполненность.
  const countFilled = (
    group: keyof WarehouseVehicleInspectionPayload,
    keys: readonly (readonly [string, string])[],
  ) => keys.filter(([key]) => {
    const v = groupValue(value, group, key);
    return typeof v === 'boolean' ? v : Boolean(String(v ?? '').trim());
  }).length;

  const section = (
    title: string,
    filled: number,
    total: number,
    children: ReactNode,
  ) => (
    <Accordion key={title} defaultExpanded={defaultExpanded} disableGutters variant="outlined" sx={{ '&:before': { display: 'none' } }}>
      <AccordionSummary
        expandIcon={<ExpandMore />}
        sx={compact ? { minHeight: 38, '& .MuiAccordionSummary-content': { my: 0.5 } } : undefined}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', pr: 1 }} justifyContent="space-between">
          <Typography fontWeight={700} sx={compact ? { fontSize: 13 } : undefined}>{title}</Typography>
          <Chip
            size="small"
            color={filled > 0 ? 'primary' : 'default'}
            variant={filled > 0 ? 'filled' : 'outlined'}
            label={`${filled} из ${total}`}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={compact ? { pt: 0.5, pb: 1.25 } : undefined}>{children}</AccordionDetails>
    </Accordion>
  );

  return (
    <Stack spacing={compact ? 1 : 1.5}>
      {section(
        'Реквизиты техники',
        countFilled('vehicleDetails', vehicleDetailFields),
        vehicleDetailFields.length,
        <Box sx={{ display: 'grid', gridTemplateColumns: columns, gap: compact ? 1 : 1.5 }}>
          {vehicleDetailFields.map(([key, label]) => textInput('vehicleDetails', key, label))}
        </Box>,
      )}

      {section(
        'Документы и ключи',
        countFilled('documentsAndKeys', documentsAndKeys),
        documentsAndKeys.length,
        <Box sx={{ display: 'grid', gridTemplateColumns: columns, gap: compact ? 0 : 0.5, columnGap: 1 }}>
          {documentsAndKeys.map(([key, label]) => checkboxInput('documentsAndKeys', key, label))}
        </Box>,
      )}

      {section(
        'Комплектность',
        countFilled('equipment', equipmentFields),
        equipmentFields.length,
        <Box sx={{ display: 'grid', gridTemplateColumns: columns, gap: compact ? 0 : 0.5, columnGap: 1 }}>
          {equipmentFields.map(([key, label]) => checkboxInput('equipment', key, label))}
        </Box>,
      )}

      {section(
        'Состояние узлов и агрегатов',
        countFilled('technicalCondition', technicalCondition),
        technicalCondition.length,
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: columns, gap: compact ? 0 : 0.5, columnGap: 1 }}>
            {technicalCondition.map(([key, label]) => checkboxInput('technicalCondition', key, label))}
          </Box>
          <Box sx={{ mt: compact ? 1 : 1.5 }}>
            {technicalTextFields.map(([key, label]) => textInput('technicalCondition', key, label))}
          </Box>
        </>,
      )}

      {!hideNotes && (
        <>
      <TextField
        label="Личные вещи и примечания"
        value={value.personalItemsNotes ?? ''}
        onChange={(event) => onChange({ ...value, personalItemsNotes: event.target.value })}
        InputProps={{ readOnly }}
        multiline
        minRows={2}
      />
      <TextField
        label="Повреждения и замечания"
        value={value.damageNotes ?? ''}
        onChange={(event) => onChange({ ...value, damageNotes: event.target.value })}
        InputProps={{ readOnly }}
        multiline
        minRows={3}
      />
      <TextField
        type="number"
        label="Размер ответственности Хранителя, ₽"
        value={value.responsibilityAmount ?? ''}
        onChange={(event) => onChange({
          ...value,
          responsibilityAmount: event.target.value === '' ? null : Number(event.target.value),
        })}
        inputProps={{ min: 0, step: 0.01, readOnly }}
      />
        </>
      )}
    </Stack>
  );
}
