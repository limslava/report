import {
  Box,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { WarehouseVehicleInspectionPayload } from '../../services/warehouse.api';

interface Props {
  value: WarehouseVehicleInspectionPayload;
  onChange: (value: WarehouseVehicleInspectionPayload) => void;
}

const vehicleDetailFields = [
  ['engineNumber', 'Модель и номер двигателя'],
  ['bodyNumber', 'Кузов / кабина / прицеп №'],
  ['manufactureYear', 'Год изготовления'],
  ['bodyColor', 'Цвет кузова'],
  ['ptsNumber', 'ПТС серия, номер'],
  ['odometerKm', 'Показания одометра, км'],
  ['hourMeter', 'Показания счетчика, м/ч'],
] as const;

const documentsAndKeys = [
  ['serviceBook', 'Сервисная книжка'],
  ['manual', 'Руководство по эксплуатации'],
  ['ignitionKeys', 'Ключи от замка зажигания'],
  ['specialEquipmentKeys', 'Ключи от дверей / спецоборудования'],
] as const;

const equipmentFields = [
  ['toolKit', 'Инструмент / ЗИП'],
  ['firstAidKit', 'Аптечка'],
  ['fireExtinguisher', 'Огнетушитель'],
  ['jack', 'Домкрат'],
  ['spareWheel', 'Запасное колесо'],
  ['warningTriangle', 'Знак аварийной остановки'],
  ['wheelWrench', 'Баллонный ключ'],
] as const;

const technicalCondition = [
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

const technicalTextFields = [
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

export default function WarehouseInspectionForm({ value, onChange }: Props) {
  const textInput = (
    group: keyof WarehouseVehicleInspectionPayload,
    key: string,
    label: string,
  ) => (
    <TextField
      key={`${String(group)}.${key}`}
      fullWidth
      label={label}
      value={String(groupValue(value, group, key) ?? '')}
      onChange={(event) => onChange(updateGroup(value, group, key, event.target.value))}
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
          checked={Boolean(groupValue(value, group, key))}
          onChange={(event) => onChange(updateGroup(value, group, key, event.target.checked))}
        />
      )}
      label={label}
    />
  );

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="subtitle1" fontWeight={700}>Реквизиты техники</Typography>
        <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
          {vehicleDetailFields.map(([key, label]) => textInput('vehicleDetails', key, label))}
        </Box>
      </Box>

      <Box>
        <Typography variant="subtitle1" fontWeight={700}>Документы и ключи</Typography>
        <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.5 }}>
          {documentsAndKeys.map(([key, label]) => checkboxInput('documentsAndKeys', key, label))}
        </Box>
      </Box>

      <Box>
        <Typography variant="subtitle1" fontWeight={700}>Комплектность</Typography>
        <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.5 }}>
          {equipmentFields.map(([key, label]) => checkboxInput('equipment', key, label))}
        </Box>
      </Box>

      <Box>
        <Typography variant="subtitle1" fontWeight={700}>Состояние узлов и агрегатов</Typography>
        <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.5 }}>
          {technicalCondition.map(([key, label]) => checkboxInput('technicalCondition', key, label))}
        </Box>
        <Box sx={{ mt: 1.5 }}>
          {technicalTextFields.map(([key, label]) => textInput('technicalCondition', key, label))}
        </Box>
      </Box>

      <TextField
        label="Личные вещи и примечания"
        value={value.personalItemsNotes ?? ''}
        onChange={(event) => onChange({ ...value, personalItemsNotes: event.target.value })}
        multiline
        minRows={2}
      />
      <TextField
        label="Повреждения и замечания"
        value={value.damageNotes ?? ''}
        onChange={(event) => onChange({ ...value, damageNotes: event.target.value })}
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
        inputProps={{ min: 0, step: 0.01 }}
      />
    </Stack>
  );
}
