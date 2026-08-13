import { Employee } from '../models/employee.model';
import { FleetVehicle } from '../models/fleet-vehicle.model';

/**
 * Фиксированный шаблон карточки водителя для копирования во внешние программы.
 * Формат согласован и НЕ меняется; незаполненные поля выводятся пустыми
 * (в т.ч. VIN), строки из шаблона не выбрасываются.
 * Машина и прицеп передаются снаружи — их источник строка графика.
 */

const formatDate = (value: string | null): string => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const dd = String(parsed.getDate()).padStart(2, '0');
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${parsed.getFullYear()}`;
};

export type EmployeeRig = {
  vehicle: FleetVehicle | null;
  trailerPlate: string;
};

/**
 * rig передаётся из строки графика (пункт «Скопировать данные» в графике) —
 * тогда в карточку входят строки «Авто», «VIN» и «Номер прицепа».
 * Без rig (копирование из справочника) выводятся только данные водителя.
 */
export function buildEmployeeCardText(employee: Employee, rig: EmployeeRig | null): string {
  const personLines = [
    employee.fullName,
    `Паспорт: ${employee.passportNumber} дата выдачи: ${formatDate(employee.passportIssueDate)}`,
    `Выдан: ${employee.passportIssuedBy}`,
    `Дата рождения: ${formatDate(employee.birthDate)}`,
    `Место рождения: ${employee.birthPlace}`,
    `Зарегистрирован: ${employee.registrationAddress}`,
    `ВУ: ${employee.licenseNumber} Выдано: ${formatDate(employee.licenseIssueDate)}`,
  ];
  const phoneLine = `Номер телефона: ${employee.phone}`;
  if (!rig) return [...personLines, phoneLine].join('\n');

  const vehicle = rig.vehicle;
  const model = vehicle?.model;
  const autoParts = [vehicle?.vehicleKind ?? '', vehicle?.plate ?? '', model ? `${model.brand} ${model.name}`.trim() : '', vehicle?.color ?? '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join('  ');
  return [
    ...personLines,
    `Авто: ${autoParts}`,
    `VIN: ${vehicle?.vin ?? ''}`,
    `Номер прицепа: ${rig.trailerPlate}`,
    phoneLine,
  ].join('\n');
}
