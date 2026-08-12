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

export function buildEmployeeCardText(employee: Employee, rig: EmployeeRig): string {
  const vehicle = rig.vehicle;
  const model = vehicle?.model;
  const autoParts = [vehicle?.vehicleKind ?? '', vehicle?.plate ?? '', model ? `${model.brand} ${model.name}`.trim() : '', vehicle?.color ?? '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join('  ');

  return [
    employee.fullName,
    `Паспорт: ${employee.passportNumber} дата выдачи: ${formatDate(employee.passportIssueDate)}`,
    `Выдан: ${employee.passportIssuedBy}`,
    `Дата рождения: ${formatDate(employee.birthDate)}`,
    `Место рождения: ${employee.birthPlace}`,
    `Зарегистрирован: ${employee.registrationAddress}`,
    `ВУ: ${employee.licenseNumber} Выдано: ${formatDate(employee.licenseIssueDate)}`,
    `Авто: ${autoParts}`,
    `VIN: ${vehicle?.vin ?? ''}`,
    `Номер прицепа: ${rig.trailerPlate}`,
    `Номер телефона: ${employee.phone}`,
  ].join('\n');
}
