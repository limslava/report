/**
 * Каталог ролей для формы пользователя: каскад «Регион → Отдел → Роль»
 * (раскладка согласована 2026-09-10, Роли_Report_v2.xlsx). Коды ролей не
 * переименовываются — регион и отдел задаются здесь, а не в коде роли.
 * counterparty_user — ЛК клиента склада, при выборе требует «Клиента склада».
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
  { value: 'general_director', label: 'Генеральный директор', region: 'all', dept: 'Руководство', desc: 'Согласование договоров (финальный этап), отчёты.' },
  { value: 'director', label: 'Директор', region: 'all', dept: 'Руководство', desc: 'Все показатели, отчёты и графики (просмотр).' },
  { value: 'financer', label: 'Финансист', region: 'all', dept: 'Руководство', desc: 'Все показатели, фин.планы; согласование договоров (фин.директор).' },
  { value: 'chief_accountant', label: 'Главный бухгалтер', region: 'all', dept: 'Бухгалтерия', desc: 'Согласование договоров (этап бухгалтерии).' },
  { value: 'deputy_chief_accountant', label: 'Зам. главного бухгалтера', region: 'all', dept: 'Бухгалтерия', desc: 'Права главного бухгалтера; в согласовании договоров работает с общей очередью шага «Главный бухгалтер» — лист согласования показывает, кто фактически завизировал.' },
  { value: 'lawyer', label: 'Юрист', region: 'all', dept: 'Юристы', desc: 'Согласование договоров (юридический этап).' },
  { value: 'secretary', label: 'Офис-менеджер', region: 'all', dept: 'Офис', desc: 'Согласование договоров: регистрация и архив.' },
  { value: 'security', label: 'Руководитель СБ', region: 'all', dept: 'Служба безопасности', desc: 'График сторожей; согласование договоров (этап СБ).' },
  { value: 'head_hr', label: 'Руководитель отдела кадров', region: 'all', dept: 'Отдел кадров', desc: 'Графики работы всех отделов, HR-модуль.' },
  { value: 'hr_specialist', label: 'Специалист отдела кадров', region: 'all', dept: 'Отдел кадров', desc: 'Графики работы всех отделов, HR-модуль.' },
  { value: 'hr_recruiter', label: 'Рекрутер', region: 'all', dept: 'HR', desc: 'Модуль подбора персонала (hh).' },
  { value: 'counterparty_user', label: 'Пользователь-контрагент', region: 'all', dept: 'Контрагенты', desc: 'ЛК клиента склада: просмотр своих ТС, услуг и начислений. Требуется выбрать «Клиента склада».' },
  // ── Владивосток ──
  { value: 'head_sales', label: 'Руководитель отдела продаж', region: 'vvo', dept: 'Отдел продаж', desc: 'Все показатели (просмотр), сводный отчёт; инициатор договоров.' },
  { value: 'manager_sales', label: 'Менеджер по продажам', region: 'vvo', dept: 'Отдел продаж', desc: 'Все показатели (просмотр), сводный отчёт; инициатор договоров.' },
  { value: 'manager_extra', label: 'Менеджер доп.услуг', region: 'vvo', dept: 'Отдел продаж', desc: 'Показатели «Доп.услуги» (ввод); инициатор договоров.' },
  { value: 'manager_auto', label: 'Менеджер отправки авто', region: 'vvo', dept: 'Отдел перевозки автомобилей', desc: 'Показатели «Отправка авто» (ввод); инициатор договоров.' },
  { value: 'manager_rail', label: 'Менеджер ЖД', region: 'vvo', dept: 'Отдел ЖД перевозок', desc: 'Показатели «ЖД» (ввод); инициатор договоров.' },
  { value: 'head_ktk_vvo', label: 'Руководитель КТК Владивосток', region: 'vvo', dept: 'Диспетчерский отдел', desc: 'Графики КТК, справочники (ред. и удаление), печатные формы, топливо.' },
  { value: 'manager_ktk_vvo', label: 'Менеджер КТК Владивосток', region: 'vvo', dept: 'Диспетчерский отдел', desc: 'Графики КТК, справочники (ред.), печатные формы.' },
  { value: 'bdd_specialist_vvo', label: 'Специалист по БДД Владивосток', region: 'vvo', dept: 'Диспетчерский отдел', desc: 'Учёт топлива, справочник техники (просмотр).' },
  { value: 'dispatcher_vvo', label: 'Диспетчер КТК Влк', region: 'vvo', dept: 'Диспетчерский отдел', desc: 'Диспетчерский журнал заявок (совместная работа в реальном времени).' },
  { value: 'garage_head_vvo', label: 'Начальник гаража Владивосток', region: 'vvo', dept: 'Гараж', desc: 'График автослесарей, справочники (просмотр).' },
  { value: 'warehouse_manager_vvo', label: 'Заведующий складом Владивосток', region: 'vvo', dept: 'Склад', desc: 'Модуль Склад ТС, показатели «ТО авто» (ввод), график сотрудников склада, справочники.' },
  { value: 'warehouse_keeper', label: 'Кладовщик', region: 'vvo', dept: 'Склад', desc: 'Модуль Склад ТС: приёмка и выдача машин.' },
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
