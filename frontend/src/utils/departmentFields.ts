export interface FieldDefinition {
  key: string;
  label: string;
  unit?: string;
  isCalculated?: boolean;
  formula?: string;
  dependsOn?: string[];
  category?: string;
  isPlan?: boolean;
}

// Типы направлений (совпадают с backend)
export type Department =
  | 'container_vladivostok'
  | 'container_moscow'
  | 'railway'
  | 'autotruck'
  | 'additional';

export type DepartmentFields = Record<Department, FieldDefinition[]>;

export const departmentFields: DepartmentFields = {
  container_vladivostok: [
    { key: 'unload_plan', label: 'Выгрузка/погрузка', isPlan: true },
    { key: 'move_plan', label: 'Перемещение', isPlan: true },
    { key: 'vehicles_fact', label: 'ТС на линии', isPlan: false },
    { key: 'total_day_plan', label: 'Итого в день план', isCalculated: true, isPlan: true, formula: 'unload_plan + move_plan', dependsOn: ['unload_plan', 'move_plan'] },
    { key: 'unload_fact', label: 'Выгрузка/погрузка', isPlan: false },
    { key: 'move_fact', label: 'Перемещение', isPlan: false },
    { key: 'total_day_fact', label: 'Итого в день факт', isCalculated: true, isPlan: false, formula: 'unload_fact + move_fact', dependsOn: ['unload_fact', 'move_fact'] },
  ],
  container_moscow: [
    { key: 'unload_plan', label: 'Выгрузка/погрузка', isPlan: true },
    { key: 'move_plan', label: 'Перемещение', isPlan: true },
    { key: 'vehicles_fact', label: 'ТС на линии', isPlan: false },
    { key: 'total_day_plan', label: 'Итого в день план', isCalculated: true, isPlan: true, formula: 'unload_plan + move_plan', dependsOn: ['unload_plan', 'move_plan'] },
    { key: 'unload_fact', label: 'Выгрузка/погрузка', isPlan: false },
    { key: 'move_fact', label: 'Перемещение', isPlan: false },
    { key: 'total_day_fact', label: 'Итого в день факт', isCalculated: true, isPlan: false, formula: 'unload_fact + move_fact', dependsOn: ['unload_fact', 'move_fact'] },
  ],
  railway: [
    { key: 'from_vladivostok_20', label: 'из Владивостока (20)', isPlan: false },
    { key: 'from_vladivostok_40', label: 'из Владивостока (40)', isPlan: false },
    { key: 'to_vladivostok_20', label: 'во Владивосток (20)', isPlan: false },
    { key: 'to_vladivostok_40', label: 'во Владивосток (40)', isPlan: false },
    { key: 'shipment_to_curtain', label: 'Отправка груза в шторе', isPlan: false },
  ],
  autotruck: [
    // Автовоз
    { key: 'autotruck_accepted', label: 'Автовоз (Принято)', isPlan: false },
    { key: 'autotruck_sent', label: 'Автовоз (Отправлено)', isPlan: false },
    { key: 'autotruck_waiting', label: 'Автовоз (В ожидании)', isPlan: false },
    // КТК
    { key: 'ktk_accepted', label: 'КТК (Принято)', isPlan: false },
    { key: 'ktk_sent', label: 'КТК (Отправлено)', isPlan: false },
    { key: 'ktk_waiting', label: 'КТК (В ожидании)', isPlan: false },
    // Штора
    { key: 'curtain_accepted', label: 'Штора (Принято)', isPlan: false },
    { key: 'curtain_sent', label: 'Штора (Отправлено)', isPlan: false },
    { key: 'curtain_waiting', label: 'Штора (В ожидании)', isPlan: false },
    // Итоги
    { key: 'total_accepted', label: 'Итого принято', isCalculated: true, formula: 'autotruck_accepted + ktk_accepted + curtain_accepted' },
    { key: 'total_sent', label: 'Итого отправлено', isCalculated: true, formula: 'autotruck_sent + ktk_sent + curtain_sent' },
    { key: 'total_waiting', label: 'Итого в ожидании', isCalculated: true, formula: 'autotruck_waiting + ktk_waiting + curtain_waiting' },
  ],
  additional: [
    { key: 'consolidated_cargo', label: 'Сборный груз', isPlan: false },
    { key: 'curtains', label: 'Шторы (тенты)', isPlan: false },
    { key: 'expedition', label: 'Экспедирование', isPlan: false },
    { key: 'reloading', label: 'Перетарки/доукрепление', isPlan: false },
  ],
};

// Маппинг названий направлений для UI
export const departmentNames: Record<Department, string> = {
  container_vladivostok: 'Контейнерные перевозки - Владивосток',
  container_moscow: 'Контейнерные перевозки - Москва',
  railway: 'ЖД перевозки',
  autotruck: 'Автовозы',
  additional: 'Дополнительные услуги',
};

// Вспомогательная функция для получения полей направления
export function getFieldsForDepartment(department: Department): FieldDefinition[] {
  return departmentFields[department] || [];
}