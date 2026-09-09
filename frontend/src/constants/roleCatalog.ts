/**
 * Каталог ролей для формы пользователя: каскад «Регион → Отдел → Роль»
 * (раскладка согласована 2026-09-10, Роли_Report_v2.xlsx). Коды ролей не
 * переименовываются — регион и отдел задаются здесь, а не в коде роли.
 */

export type RoleRegion = 'all' | 'vvo' | 'mow';

export type RoleCatalogEntry = {
  value: string;
  label: string;
  region: RoleRegion;
  dept: string;
  /** краткая справка «что видит и может» — показывается при выборе роли */
  desc: string;
};

export const ROLE_REGION_LABELS: Record<RoleRegion, string> = {
  all: 'Вся компания',
  vvo: 'Владивосток',
  mow: 'Москва',
};

export const ROLE_CATALOG: RoleCatalogEntry[] = [
  // ── Вся компания ──
  { value: 'admin', label: 'Администратор', region: 'all', dept: 'Руководство', desc: 'Полный доступ ко всем разделам и администрированию.' },
  { value: 'director', label: 'Директор', region: 'all', dept: 'Руководство', desc: 'Все показатели, отчёты и графики (просмотр).' },
  { value: 'financer', label: 'Финансист', region: 'all', dept: 'Руководство', desc: 'Все показатели, финансовые планы, сводный отчёт.' },
  { value: 'security', label: 'Руководитель СБ', region: 'all', dept: 'Служба безопасности', desc: 'График сторожей.' },
  { value: 'head_hr', label: 'Руководитель отдела кадров', region: 'all', dept: 'Отдел кадров', desc: 'Графики работы всех отделов.' },
  { value: 'hr_specialist', label: 'Специалист отдела кадров', region: 'all', dept: 'Отдел кадров', desc: 'Графики работы всех отделов.' },
  // ── Владивосток ──
  { value: 'head_sales', label: 'Руководитель отдела продаж', region: 'vvo', dept: 'Отдел продаж', desc: 'Все показатели (просмотр), сводный отчёт.' },
  { value: 'manager_sales', label: 'Менеджер по продажам', region: 'vvo', dept: 'Отдел продаж', desc: 'Все показатели (просмотр), сводный отчёт.' },
  { value: 'manager_extra', label: 'Менеджер доп.услуг', region: 'vvo', dept: 'Отдел продаж', desc: 'Показатели «Доп.услуги» (ввод).' },
  { value: 'manager_auto', label: 'Менеджер отправки авто', region: 'vvo', dept: 'Отдел перевозки автомобилей', desc: 'Показатели «Отправка авто» (ввод).' },
  { value: 'manager_rail', label: 'Менеджер ЖД', region: 'vvo', dept: 'Отдел ЖД перевозок', desc: 'Показатели «ЖД» (ввод).' },
  { value: 'head_ktk_vvo', label: 'Руководитель КТК Владивосток', region: 'vvo', dept: 'Диспетчерский отдел', desc: 'Графики КТК, справочники (ред. и удаление), печатные формы, топливо.' },
  { value: 'manager_ktk_vvo', label: 'Менеджер КТК Владивосток', region: 'vvo', dept: 'Диспетчерский отдел', desc: 'Графики КТК, справочники (ред.), печатные формы.' },
  { value: 'bdd_specialist_vvo', label: 'Специалист по БДД Владивосток', region: 'vvo', dept: 'Диспетчерский отдел', desc: 'Учёт топлива, справочник техники (просмотр).' },
  { value: 'garage_head_vvo', label: 'Начальник гаража Владивосток', region: 'vvo', dept: 'Гараж', desc: 'График автослесарей, справочники (просмотр).' },
  { value: 'warehouse_manager_vvo', label: 'Заведующий складом Владивосток', region: 'vvo', dept: 'Склад', desc: 'Показатели «ТО авто» (ввод), график сотрудников склада, справочники (просмотр).' },
  // ── Москва ──
  { value: 'head_ktk_mow', label: 'Руководитель КТК Москва', region: 'mow', dept: 'Диспетчерский отдел', desc: 'Графики КТК, справочники (ред. и удаление), топливо.' },
  { value: 'manager_ktk_mow', label: 'Менеджер КТК Москва', region: 'mow', dept: 'Диспетчерский отдел', desc: 'Графики КТК, справочники (ред.).' },
  { value: 'bdd_specialist_mow', label: 'Специалист по БДД Москва', region: 'mow', dept: 'Диспетчерский отдел', desc: 'Учёт топлива, справочник техники (просмотр).' },
];

export const roleCatalogEntry = (value: string): RoleCatalogEntry | undefined =>
  ROLE_CATALOG.find((entry) => entry.value === value);

/** Регионы, в которых есть хотя бы одна роль (для первого шага каскада). */
export const roleRegions = (): RoleRegion[] =>
  (['all', 'vvo', 'mow'] as RoleRegion[]).filter((region) => ROLE_CATALOG.some((entry) => entry.region === region));

export const roleDepts = (region: RoleRegion): string[] =>
  [...new Set(ROLE_CATALOG.filter((entry) => entry.region === region).map((entry) => entry.dept))];

export const rolesFor = (region: RoleRegion, dept: string): RoleCatalogEntry[] =>
  ROLE_CATALOG.filter((entry) => entry.region === region && entry.dept === dept);
