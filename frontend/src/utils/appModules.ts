/**
 * Выключатель модулей приложения.
 *
 * Сервер сообщает список отключённых модулей (env DISABLED_MODULES) через
 * GET /api/app-config. Проверка встроена в функции прав (rolePermissions),
 * поэтому выключенный модуль пропадает сразу отовсюду: из меню, маршрутов
 * и расчёта стартовой страницы. Пока конфиг не загружен, считаем все
 * модули включёнными (как на стейдже, где переменная не задана).
 */
export type ToggleableModule = 'warehouse' | 'hh' | 'bill_of_lading';

let disabledModules = new Set<string>();

export const setDisabledModules = (modules: string[]): void => {
  disabledModules = new Set(modules.map((module) => module.trim().toLowerCase()));
};

export const isModuleEnabled = (module: ToggleableModule): boolean => !disabledModules.has(module);
