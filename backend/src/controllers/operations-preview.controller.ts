import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { AppDataSource } from '../config/data-source';
import { OperationsPreviewState } from '../models/operations-preview-state.model';
import { recordAuditLog } from '../services/audit-log.service';

const operationsPreviewRepo = AppDataSource.getRepository(OperationsPreviewState);
const OPERATIONS_PREVIEW_SCOPE_KEY = 'ktk_vvo_preview_v1';
const OPERATIONS_PREVIEW_SCOPE_BY_LOCATION = {
  ktk_vvo: OPERATIONS_PREVIEW_SCOPE_KEY,
  ktk_mow: 'ktk_mow_preview_v1',
  garage_vvo: 'garage_preview_v1',
  garage_mow: 'garage_mow_preview_v1',
  security_vvo: 'security_preview_v1',
} as const;

const isValidFilter = (value: unknown): value is 'Все' | Department =>
  value === 'Все' ||
  value === 'Контейнеры' ||
  value === 'Авто' ||
  value === 'Диспетчера' ||
  value === 'Курьеры' ||
  value === 'Автослесари' ||
  value === 'Сторожа';

type PreviewLocation = keyof typeof OPERATIONS_PREVIEW_SCOPE_BY_LOCATION;
type PreviewSection = 'containers' | 'auto' | 'dispatchers' | 'couriers' | 'mechanics' | 'guards' | 'efficiency';
type PreviewMode = 'plan' | 'fact';
type Department = 'Контейнеры' | 'Авто' | 'Диспетчера' | 'Курьеры' | 'Автослесари' | 'Сторожа';
type CellCode = 'W' | 'O' | 'B' | 'H' | 'S' | 'R' | 'N' | 'V' | 'E';
type OverrideScopeKey = `${PreviewMode}|${string}`;
type SortField = 'manual' | 'name' | 'plate';
type SortDirection = 'asc' | 'desc';
const VALID_CELL_CODES = new Set<CellCode>(['W', 'O', 'B', 'H', 'S', 'R', 'N', 'V', 'E']);

type PersonRow = {
  id: string;
  name: string;
  secondName?: string;
  plate: string;
  note?: string;
  secondNote?: string;
  department: Department;
};

type PreviewPersistedState = {
  mode?: PreviewMode;
  filter?: 'Все' | Department;
  overrides?: Record<OverrideScopeKey, Record<string, CellCode>>;
  peopleByMonth?: Record<string, PersonRow[]>;
  peopleState?: PersonRow[];
  monthValue?: string;
  meta?: {
    overrideScopeVersions?: Record<string, string>;
    peopleMonthVersions?: Record<string, string>;
  };
};

type SaveClientVersions = {
  overrideScopeVersions?: Record<string, string | null>;
  peopleMonthVersions?: Record<string, string | null>;
};

type OverridesPatchPayload = {
  [scopeKey: string]: {
    set?: Record<string, CellCode>;
    unset?: string[];
  };
};

const DEPARTMENT_BY_SECTION: Record<PreviewSection, Department> = {
  containers: 'Контейнеры',
  auto: 'Авто',
  dispatchers: 'Диспетчера',
  couriers: 'Курьеры',
  mechanics: 'Автослесари',
  guards: 'Сторожа',
  efficiency: 'Контейнеры',
};

const SECTION_LABEL: Record<PreviewSection, string> = {
  containers: 'Контейнеровозы',
  auto: 'Автовозы',
  dispatchers: 'Диспетчера',
  couriers: 'Оперативники',
  mechanics: 'Автослесарь',
  guards: 'Сотрудник охраны',
  efficiency: 'Эффективность',
};

const getSectionLabel = (section: PreviewSection, location: PreviewLocation): string =>
  location === 'ktk_mow' && section === 'couriers' ? 'Механики' : SECTION_LABEL[section];

const WEEKDAY_LABELS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const DEFAULT_PREVIEW_PEOPLE: PersonRow[] = [];

const sanitizePayload = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  const source = payload as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  if (typeof source.monthValue === 'string') {
    result.monthValue = source.monthValue;
  }
  if (source.mode === 'plan' || source.mode === 'fact') {
    result.mode = source.mode;
  }
  if (isValidFilter(source.filter)) {
    result.filter = source.filter;
  }
  if (source.overrides && typeof source.overrides === 'object' && !Array.isArray(source.overrides)) {
    result.overrides = source.overrides;
  }
  if (source.peopleByMonth && typeof source.peopleByMonth === 'object' && !Array.isArray(source.peopleByMonth)) {
    result.peopleByMonth = source.peopleByMonth;
  }
  if (Array.isArray(source.peopleState)) {
    result.peopleState = source.peopleState;
  }

  return result;
};

const mergePreviewPayload = (
  current: PreviewPersistedState,
  incoming: PreviewPersistedState
): PreviewPersistedState => {
  const currentOverrides = (current.overrides ?? {}) as Record<OverrideScopeKey, Record<string, CellCode>>;
  const incomingOverrides = (incoming.overrides ?? {}) as Record<OverrideScopeKey, Record<string, CellCode>>;
  const mergedOverrides: Record<OverrideScopeKey, Record<string, CellCode>> = { ...currentOverrides };

  for (const [scopeKey, scopeValues] of Object.entries(incomingOverrides)) {
    const castScopeKey = scopeKey as OverrideScopeKey;
    mergedOverrides[castScopeKey] = {
      ...(currentOverrides[castScopeKey] ?? {}),
      ...(scopeValues ?? {}),
    };
  }

  const currentPeopleByMonth = (current.peopleByMonth ?? {}) as Record<string, PersonRow[]>;
  const incomingPeopleByMonth = (incoming.peopleByMonth ?? {}) as Record<string, PersonRow[]>;
  const mergedPeopleByMonth: Record<string, PersonRow[]> = {
    ...currentPeopleByMonth,
    ...incomingPeopleByMonth,
  };

  return {
    ...current,
    ...incoming,
    overrides: mergedOverrides,
    peopleByMonth: mergedPeopleByMonth,
    meta: {
      overrideScopeVersions: {
        ...(current.meta?.overrideScopeVersions ?? {}),
        ...(incoming.meta?.overrideScopeVersions ?? {}),
      },
      peopleMonthVersions: {
        ...(current.meta?.peopleMonthVersions ?? {}),
        ...(incoming.meta?.peopleMonthVersions ?? {}),
      },
    },
  };
};

const isValidLocation = (value: unknown): value is PreviewLocation =>
  value === 'ktk_vvo' || value === 'ktk_mow' || value === 'garage_vvo' || value === 'garage_mow' || value === 'security_vvo';

const parseLocation = (value: unknown): PreviewLocation => {
  if (value === 'garage') return 'garage_vvo';
  return isValidLocation(value) ? value : 'ktk_vvo';
};

const isValidSection = (value: unknown): value is PreviewSection =>
  value === 'containers' ||
  value === 'auto' ||
  value === 'dispatchers' ||
  value === 'couriers' ||
  value === 'mechanics' ||
  value === 'guards' ||
  value === 'efficiency';

const isEfficiencyOnlyViewer = (role: unknown): boolean => role === 'director' || role === 'financer';

const isAllowedSectionForLocation = (location: PreviewLocation, section: PreviewSection): boolean => {
  if (location === 'garage_vvo' || location === 'garage_mow') return section === 'mechanics';
  if (location === 'security_vvo') return section === 'guards';
  if (location === 'ktk_mow') return section === 'containers' || section === 'dispatchers' || section === 'couriers' || section === 'efficiency';
  return section === 'containers' || section === 'auto' || section === 'dispatchers' || section === 'couriers' || section === 'efficiency';
};

const canAccessLocationSection = (role: unknown, location: PreviewLocation, section: PreviewSection): boolean => {
  if (!isAllowedSectionForLocation(location, section)) return false;
  if (role === 'admin') return true;
  if ((role === 'head_hr' || role === 'hr_specialist') && section !== 'efficiency') return true;
  if (role === 'garage_head' || role === 'garage_head_vvo') return location === 'garage_vvo' && section === 'mechanics';
  if (role === 'security') return location === 'security_vvo' && section === 'guards';
  if (role === 'manager_ktk_vvo' || role === 'head_ktk_vvo') return location === 'ktk_vvo';
  if (role === 'manager_ktk_mow' || role === 'head_ktk_mow') return location === 'ktk_mow';
  if (isEfficiencyOnlyViewer(role)) return (location === 'ktk_vvo' || location === 'ktk_mow') && section === 'efficiency';
  return false;
};

const assertPreviewAccess = (role: unknown, location: PreviewLocation, section: PreviewSection) => {
  if (canAccessLocationSection(role, location, section)) return;
  const error: any = new Error('Access denied for requested operations preview scope');
  error.statusCode = 403;
  throw error;
};

const isValidSortField = (value: unknown): value is SortField =>
  value === 'manual' || value === 'name' || value === 'plate';

const isValidSortDirection = (value: unknown): value is SortDirection =>
  value === 'asc' || value === 'desc';

const getPrevMonthValue = (value: string): string | null => {
  const [yearRaw, monthRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
};

const getMonthlyCell = (_rowIndex: number, _day: number, _department: Department): CellCode => {
  return 'E';
};

const normalizeCellCode = (value: unknown): CellCode => {
  return typeof value === 'string' && VALID_CELL_CODES.has(value as CellCode) ? (value as CellCode) : 'E';
};

const getShiftValueForCount = (department: Department, code: CellCode): number => {
  if (code === 'W') return 1;
  if (department === 'Авто' && code === 'S') return 1;
  if (code !== 'H') return 0;
  if (department === 'Контейнеры') return 0.5;
  if (department === 'Авто') return 1;
  return 0;
};

const toCellLabel = (code: CellCode): string => {
  const map: Record<CellCode, string> = {
    E: '',
    W: '1',
    O: 'В',
    V: 'О',
    B: 'Б',
    H: 'П',
    S: 'С',
    R: 'Р',
    N: 'Н',
  };
  return map[normalizeCellCode(code)];
};

const buildContentDisposition = (filename: string): string => {
  const normalized = filename.normalize('NFC');
  const sanitized = normalized.replace(/"/g, '');
  const asciiFallback = sanitized
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/[\\"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const safeFallback = asciiFallback || 'report.xlsx';
  const encoded = encodeURIComponent(normalized)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
  return `attachment; filename="${safeFallback}"; filename*=UTF-8''${encoded}`;
};

const extractPeopleByMonth = (payload: PreviewPersistedState): Record<string, PersonRow[]> => {
  if (payload.peopleByMonth && typeof payload.peopleByMonth === 'object') {
    return payload.peopleByMonth;
  }
  if (Array.isArray(payload.peopleState) && payload.peopleState.length > 0) {
    const baseMonth = typeof payload.monthValue === 'string' ? payload.monthValue : '2026-04';
    return { [baseMonth]: payload.peopleState };
  }
  return {};
};

const resolvePeopleForMonth = (targetMonth: string, source: Record<string, PersonRow[]>): PersonRow[] => {
  if (Array.isArray(source[targetMonth]) && source[targetMonth].length > 0) return source[targetMonth];
  const prevMonth = getPrevMonthValue(targetMonth);
  if (prevMonth && Array.isArray(source[prevMonth]) && source[prevMonth].length > 0) return source[prevMonth];
  return DEFAULT_PREVIEW_PEOPLE;
};

const parseYear = (value: unknown, fallback: number): number => {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return fallback;
  return year;
};

const parseMonth = (value: unknown, fallback: number): number => {
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) return fallback;
  return month;
};

export const getOperationsPreviewState = async (req: Request, res: Response) => {
  const location = parseLocation(req.query.location);
  const sectionRaw = req.query.section;
  const section: PreviewSection = isValidSection(sectionRaw) ? sectionRaw : 'containers';
  assertPreviewAccess(req.user?.role, location, section);

  const row = await operationsPreviewRepo.findOne({
    where: { scopeKey: OPERATIONS_PREVIEW_SCOPE_BY_LOCATION[location] },
  });

  res.json({
    state: row?.payload ?? null,
    updatedAt: row?.updatedAt ?? null,
  });
};

export const saveOperationsPreviewState = async (req: Request, res: Response) => {
  const location = parseLocation(req.query.location ?? req.body?.location);
  const sectionRaw = req.query.section ?? req.body?.section;
  const section: PreviewSection = isValidSection(sectionRaw) ? sectionRaw : 'containers';
  assertPreviewAccess(req.user?.role, location, section);

  const sanitized = sanitizePayload(req.body);
  const clientVersions = (req.body?.clientVersions ?? {}) as SaveClientVersions;
  const overridesPatch = (req.body?.overridesPatch ?? null) as OverridesPatchPayload | null;

  const hasOverridesSnapshot = !!sanitized.overrides;
  const hasOverridesPatch = !!overridesPatch && typeof overridesPatch === 'object' && Object.keys(overridesPatch).length > 0;
  const hasPeoplePayload = !!sanitized.peopleByMonth || !!sanitized.peopleState;
  const auditOverrideScopes = hasOverridesPatch
    ? Object.keys(overridesPatch ?? {})
    : Object.keys(((sanitized as PreviewPersistedState).overrides ?? {}));
  const auditPeopleMonths = Object.keys(((sanitized as PreviewPersistedState).peopleByMonth ?? {}));
  const auditPatchSetCount = Object.values(overridesPatch ?? {}).reduce((sum, patch) => sum + Object.keys(patch?.set ?? {}).length, 0);
  const auditPatchUnsetCount = Object.values(overridesPatch ?? {}).reduce((sum, patch) => sum + (patch?.unset ?? []).length, 0);

  if ((!hasOverridesSnapshot && !hasOverridesPatch) && !hasPeoplePayload) {
    const error: any = new Error('Invalid operations preview payload');
    error.statusCode = 400;
    throw error;
  }

  let row = await operationsPreviewRepo.findOne({
    where: { scopeKey: OPERATIONS_PREVIEW_SCOPE_BY_LOCATION[location] },
  });

  if (!row) {
    const incomingPayload = sanitized as PreviewPersistedState;
    const incomingOverrideScopes = hasOverridesPatch
      ? Object.keys(overridesPatch ?? {})
      : Object.keys(incomingPayload.overrides ?? {});
    const incomingPeopleMonths = Object.keys(incomingPayload.peopleByMonth ?? {});
    const nowIso = new Date().toISOString();
    const overrideScopeVersions = Object.fromEntries(incomingOverrideScopes.map((scope) => [scope, nowIso]));
    const peopleMonthVersions = Object.fromEntries(incomingPeopleMonths.map((monthKey) => [monthKey, nowIso]));
    const payloadWithMeta: PreviewPersistedState = {
      ...incomingPayload,
      meta: {
        overrideScopeVersions,
        peopleMonthVersions,
      },
    };
    row = operationsPreviewRepo.create({
      scopeKey: OPERATIONS_PREVIEW_SCOPE_BY_LOCATION[location],
      payload: payloadWithMeta,
      updatedByUserId: req.user?.id ?? null,
    });
  } else {
    const currentPayload = sanitizePayload(row.payload) as PreviewPersistedState;
    const incomingPayload = sanitized as PreviewPersistedState;
    const currentOverrideVersions = currentPayload.meta?.overrideScopeVersions ?? {};
    const currentPeopleVersions = currentPayload.meta?.peopleMonthVersions ?? {};

    const incomingOverrideScopes = hasOverridesPatch
      ? Object.keys(overridesPatch ?? {})
      : Object.keys(incomingPayload.overrides ?? {});
    const incomingPeopleMonths = Object.keys(incomingPayload.peopleByMonth ?? {});

    for (const scope of incomingOverrideScopes) {
      const serverVersion = currentOverrideVersions[scope] ?? null;
      const clientVersion = clientVersions.overrideScopeVersions?.[scope] ?? null;
      if (serverVersion && clientVersion !== serverVersion) {
        const error: any = new Error(`Scope conflict for ${scope}. Please refresh and retry.`);
        error.statusCode = 409;
        throw error;
      }
    }
    for (const monthKey of incomingPeopleMonths) {
      const serverVersion = currentPeopleVersions[monthKey] ?? null;
      const clientVersion = clientVersions.peopleMonthVersions?.[monthKey] ?? null;
      if (serverVersion && clientVersion !== serverVersion) {
        const error: any = new Error(`People month conflict for ${monthKey}. Please refresh and retry.`);
        error.statusCode = 409;
        throw error;
      }
    }

    const nowIso = new Date().toISOString();
    let merged: PreviewPersistedState;
    if (hasOverridesPatch) {
      const nextOverrides: Record<OverrideScopeKey, Record<string, CellCode>> = {
        ...((currentPayload.overrides ?? {}) as Record<OverrideScopeKey, Record<string, CellCode>>),
      };
      for (const [scopeKeyRaw, patch] of Object.entries(overridesPatch ?? {})) {
        const scopeKey = scopeKeyRaw as OverrideScopeKey;
        const currentScope = { ...(nextOverrides[scopeKey] ?? {}) };
        const toSet = patch?.set ?? {};
        const toUnset = patch?.unset ?? [];
        Object.entries(toSet).forEach(([cellKey, cellCode]) => {
          currentScope[cellKey] = normalizeCellCode(cellCode);
        });
        toUnset.forEach((cellKey) => {
          delete currentScope[cellKey];
        });
        nextOverrides[scopeKey] = currentScope;
      }
      merged = mergePreviewPayload(currentPayload, {
        ...incomingPayload,
        overrides: nextOverrides,
      });
    } else {
      merged = mergePreviewPayload(currentPayload, incomingPayload);
    }
    const nextOverrideVersions = { ...(merged.meta?.overrideScopeVersions ?? {}) };
    const nextPeopleVersions = { ...(merged.meta?.peopleMonthVersions ?? {}) };
    incomingOverrideScopes.forEach((scope) => {
      nextOverrideVersions[scope] = nowIso;
    });
    incomingPeopleMonths.forEach((monthKey) => {
      nextPeopleVersions[monthKey] = nowIso;
    });

    row.payload = {
      ...merged,
      meta: {
        overrideScopeVersions: nextOverrideVersions,
        peopleMonthVersions: nextPeopleVersions,
      },
    };
    row.updatedByUserId = req.user?.id ?? null;
  }

  const saved = await operationsPreviewRepo.save(row);
  await recordAuditLog({
    action: 'WORK_SCHEDULE_SAVED',
    userId: req.user?.id ?? null,
    entityType: 'operations_preview',
    entityId: `${location}:${section}:${String(sanitized.monthValue ?? '')}`,
    details: {
      location,
      section,
      monthValue: sanitized.monthValue ?? null,
      mode: sanitized.mode ?? null,
      filter: sanitized.filter ?? null,
      overrideScopes: auditOverrideScopes,
      peopleMonths: auditPeopleMonths,
      hasOverridesSnapshot,
      hasOverridesPatch,
      hasPeoplePayload,
      setCount: hasOverridesPatch ? auditPatchSetCount : null,
      unsetCount: hasOverridesPatch ? auditPatchUnsetCount : null,
    },
    req,
  });
  res.json({
    ok: true,
    updatedAt: saved.updatedAt,
  });
};

export const downloadOperationsPreviewExcel = async (req: Request, res: Response) => {
  const location = parseLocation(req.query.location);
  const sectionRaw = req.query.section;
  if (!isValidSection(sectionRaw)) {
    const error: any = new Error('Invalid section');
    error.statusCode = 400;
    throw error;
  }
  const section = sectionRaw;
  assertPreviewAccess(req.user?.role, location, section);

  const department = DEPARTMENT_BY_SECTION[section];

  const now = new Date();
  const year = parseYear(req.query.year, now.getFullYear());
  const month = parseMonth(req.query.month, now.getMonth() + 1);
  const monthValue = `${year}-${String(month).padStart(2, '0')}`;

  const requestedMode: PreviewMode = req.query.mode === 'plan' ? 'plan' : 'fact';
  const canUsePersonnelPlan = (section === 'mechanics' || section === 'guards') && (
    req.user?.role === 'admin'
    || req.user?.role === 'head_hr'
    || req.user?.role === 'hr_specialist'
  );
  const mode: PreviewMode = section === 'containers' || canUsePersonnelPlan ? requestedMode : 'fact';

  const sortField: SortField = isValidSortField(req.query.sortField) ? req.query.sortField : 'manual';
  const sortDirection: SortDirection = isValidSortDirection(req.query.sortDirection) ? req.query.sortDirection : 'asc';

  const row = await operationsPreviewRepo.findOne({
    where: { scopeKey: OPERATIONS_PREVIEW_SCOPE_BY_LOCATION[location] },
  });

  const payload = (row?.payload ?? {}) as PreviewPersistedState;
  const overrides = (payload.overrides ?? {}) as Record<OverrideScopeKey, Record<string, CellCode>>;
  const peopleByMonth = extractPeopleByMonth(payload);
  if (section === 'efficiency') {
    const workbook = new ExcelJS.Workbook();
    const locationLabel = location === 'ktk_mow' ? 'КТК Москва' : 'КТК Владивосток';
    const sheet = workbook.addWorksheet(location === 'ktk_mow' ? 'Эффективность КТК Мск' : 'Эффективность КТК Влк');
    const months = Array.from({ length: 12 }, (_, index) => index + 1);
    const monthLabels = ['ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ', 'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ'];
    const thin: ExcelJS.BorderStyle = 'thin';
    const border: Partial<ExcelJS.Borders> = {
      top: { style: thin, color: { argb: 'FFD6DCE8' } },
      left: { style: thin, color: { argb: 'FFD6DCE8' } },
      bottom: { style: thin, color: { argb: 'FFD6DCE8' } },
      right: { style: thin, color: { argb: 'FFD6DCE8' } },
    };

    const toVehicleDayCode = (codes: CellCode[]): 'WORK' | 'REPAIR' | 'NO_DRIVER' | 'SICK' | 'OFF' | 'EMPTY' => {
      if (codes.some((code) => code === 'W' || code === 'H' || code === 'S')) return 'WORK';
      if (codes.some((code) => code === 'R')) return 'REPAIR';
      if (codes.some((code) => code === 'N')) return 'NO_DRIVER';
      if (codes.some((code) => code === 'B')) return 'SICK';
      if (codes.some((code) => code === 'O' || code === 'V')) return 'OFF';
      return 'EMPTY';
    };

    const calculateDepartment = (departmentName: Department) => {
      return months.map((monthIndex) => {
        const monthValueForYear = `${year}-${String(monthIndex).padStart(2, '0')}`;
        const monthPeople = resolvePeopleForMonth(monthValueForYear, peopleByMonth).filter(
          (person) => person.department === departmentName
        );
        const daysInMonthForCalc = new Date(year, monthIndex, 0).getDate();
        const factScopeKey = `fact|${monthValueForYear}` as OverrideScopeKey;
        const factScope = overrides[factScopeKey] ?? {};

        const uniquePlatesCount = new Set(
          monthPeople.map((person) => person.plate.trim().toUpperCase()).filter((plate) => plate.length > 0)
        ).size;
        const totalAutoDays = uniquePlatesCount * daysInMonthForCalc;

        let workAutoDays = 0;
        let offOrVacationDays = 0;
        let repairDays = 0;
        let noDriverDays = 0;
        let sickDays = 0;

        monthPeople.forEach((person, rowIndex) => {
          for (let day = 1; day <= daysInMonthForCalc; day += 1) {
            const lane1 = factScope[`${person.id}-1-${day}`] ?? getMonthlyCell(rowIndex, day, departmentName);
            const lane2 = person.secondName
              ? factScope[`${person.id}-2-${day}`] ?? getMonthlyCell(rowIndex + 50, day, departmentName)
              : null;
            const vehicleDay = toVehicleDayCode([lane1, lane2].filter(Boolean) as CellCode[]);
            if (vehicleDay === 'WORK') {
              workAutoDays += 1;
            } else if (vehicleDay === 'OFF') {
              offOrVacationDays += 1;
            } else if (vehicleDay === 'REPAIR') {
              repairDays += 1;
            } else if (vehicleDay === 'NO_DRIVER') {
              noDriverDays += 1;
            } else if (vehicleDay === 'SICK') {
              sickDays += 1;
            }
          }
        });

        const totalIdleDays = offOrVacationDays + repairDays + noDriverDays + sickDays;
        const technicalReadyDays = totalAutoDays - repairDays;
        const loadFactor = totalAutoDays > 0 ? workAutoDays / totalAutoDays : 0;
        const techReadyFactor = totalAutoDays > 0 ? technicalReadyDays / totalAutoDays : 0;

        return {
          uniquePlatesCount,
          daysInMonth: daysInMonthForCalc,
          totalAutoDays,
          workAutoDays,
          loadFactor,
          offOrVacationDays,
          repairDays,
          noDriverDays,
          sickDays,
          totalIdleDays,
          technicalReadyDays,
          techReadyFactor,
        };
      });
    };

    const containers = calculateDepartment('Контейнеры');
    const auto = calculateDepartment('Авто');

    sheet.getColumn(1).width = 44;
    for (let col = 2; col <= 13; col += 1) {
      sheet.getColumn(col).width = 11;
    }

    const renderBlock = (startRow: number, title: string, firstRowLabel: string, data: ReturnType<typeof calculateDepartment>) => {
      const endCol = 13;
      const turquoiseFill = 'FFD4F3F1';
      const peachFill = 'FFFFE8D8';
      const isMetricRow = (label: string) =>
        label === 'Коэффициент загрузки' ||
        label === 'Итого дни простоя' ||
        label === 'Коэффициент технической готовности';
      const isTurquoiseRow = (label: string) =>
        label === 'Коэффициент загрузки' || label === 'Коэффициент технической готовности';
      const isPeachRow = (label: string) =>
        label === 'Выходные, отпуск, автодни' ||
        label === 'Ремонт, автодни' ||
        label === 'Нет водителя, автодни';

      sheet.mergeCells(startRow, 1, startRow, endCol);
      const titleCell = sheet.getCell(startRow, 1);
      titleCell.value = title;
      titleCell.font = { name: 'Arial', size: 12, bold: true };
      titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6E6' } };
      titleCell.border = border;
      sheet.getRow(startRow).height = 24;

      const headerRow = startRow + 1;
      sheet.getCell(headerRow, 1).value = 'Показатели';
      monthLabels.forEach((label, index) => {
        sheet.getCell(headerRow, index + 2).value = label;
      });

      const rows: Array<{ label: string; values: number[]; ratio?: boolean }> = [
        { label: firstRowLabel, values: data.map((item) => item.uniquePlatesCount) },
        { label: 'Дней в месяце', values: data.map((item) => item.daysInMonth) },
        { label: 'Всего автодней в месяц', values: data.map((item) => item.totalAutoDays) },
        { label: 'Рабочие автодни, автодни', values: data.map((item) => item.workAutoDays) },
        { label: 'Коэффициент загрузки', values: data.map((item) => item.loadFactor), ratio: true },
        { label: 'Выходные, отпуск, автодни', values: data.map((item) => item.offOrVacationDays) },
        { label: 'Ремонт, автодни', values: data.map((item) => item.repairDays) },
        { label: 'Нет водителя, автодни', values: data.map((item) => item.noDriverDays) },
        { label: 'Неофициальный больничный, автодни', values: data.map((item) => item.sickDays) },
        { label: 'Итого дни простоя', values: data.map((item) => item.totalIdleDays) },
        { label: 'Технически готовы, автодни', values: data.map((item) => item.technicalReadyDays) },
        { label: 'Коэффициент технической готовности', values: data.map((item) => item.techReadyFactor), ratio: true },
      ];

      rows.forEach((rowData, idx) => {
        const rowNumber = headerRow + 1 + idx;
        sheet.getCell(rowNumber, 1).value = rowData.label;
        rowData.values.forEach((value, valueIndex) => {
          const cell = sheet.getCell(rowNumber, valueIndex + 2);
          cell.value = value;
          if (rowData.ratio) {
            cell.numFmt = '0.00';
          }
        });
      });

      for (let rowNumber = headerRow; rowNumber <= headerRow + rows.length; rowNumber += 1) {
        for (let col = 1; col <= endCol; col += 1) {
          const cell = sheet.getCell(rowNumber, col);
          cell.border = border;
          cell.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle' };
          if (rowNumber === headerRow) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F9' } };
            cell.font = { name: 'Arial', size: 11, bold: true };
          } else {
            cell.font = { name: 'Arial', size: 11 };
          }
        }
      }

      rows.forEach((rowData, idx) => {
        const rowNumber = headerRow + 1 + idx;
        if (isMetricRow(rowData.label)) {
          const labelCell = sheet.getCell(rowNumber, 1);
          labelCell.font = { name: 'Arial', size: 11, bold: true };
          for (let col = 2; col <= endCol; col += 1) {
            const valueCell = sheet.getCell(rowNumber, col);
            valueCell.font = { name: 'Arial', size: 11, bold: true };
          }
        }

        if (isTurquoiseRow(rowData.label)) {
          for (let col = 1; col <= endCol; col += 1) {
            const cell = sheet.getCell(rowNumber, col);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: turquoiseFill } };
          }
        }

        if (isPeachRow(rowData.label)) {
          for (let col = 1; col <= endCol; col += 1) {
            const cell = sheet.getCell(rowNumber, col);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: peachFill } };
          }
        }
      });
    };

    renderBlock(
      1,
      `Расчет показателей использования контейнеровозов ${year} г. — ${locationLabel}`,
      'Количество контейнеровозов',
      containers
    );
    if (location !== 'ktk_mow') {
      renderBlock(
        16,
        `Расчет показателей использования автовозов ${year} г. — ${locationLabel}`,
        'Количество автовозов',
        auto
      );
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `График эффективности - ${locationLabel}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', buildContentDisposition(filename));
    res.send(Buffer.from(buffer));
    return;
  }
  const allPeople = resolvePeopleForMonth(monthValue, peopleByMonth);
  const sectionPeopleBase = allPeople
    .map((person, index) => ({ ...person, rowIndex: index }))
    .filter((person) => person.department === department);

  const sectionPeople =
    sortField === 'manual' || (sortField === 'plate' && (section === 'dispatchers' || section === 'couriers'))
      ? sectionPeopleBase
      : (() => {
          const sorted = [...sectionPeopleBase].sort((a, b) => {
            const left = sortField === 'name' ? a.name : a.plate;
            const right = sortField === 'name' ? b.name : b.plate;
            return left.localeCompare(right, 'ru', { sensitivity: 'base' });
          });
          if (sortDirection === 'desc') {
            sorted.reverse();
          }
          return sorted;
        })();

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekdays = monthDays.map((day) => WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()]);
  const scopeKey = `${mode}|${monthValue}` as OverrideScopeKey;
  const scopeOverrides = overrides[scopeKey] ?? {};

  const getCellCode = (
    rowIndex: number,
    day: number,
    personId: string,
    lane: '1' | '2' = '1'
  ): CellCode => {
    const key = `${personId}-${lane}-${day}`;
    return normalizeCellCode(scopeOverrides[key] ?? getMonthlyCell(rowIndex, day, department));
  };

  const isPersonnel = section === 'dispatchers' || section === 'couriers' || section === 'mechanics' || section === 'guards';
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('График работы');

  const COLORS = {
    border: 'FFD6DCE8',
    titleBg: 'FFE6E6E6',
    header: 'FFF2F4F9',
    weekend: 'FFF3F3F3',
    totalRow: 'FFEAF2FF',
    white: 'FFFFFFFF',
    cellWork: 'FF87D4A1',
    cellHalfDay: 'FFE6CF73',
    cellCargoRemoval: 'FFF8C99B',
    cellSick: 'FF87BDDE',
    cellRepair: 'FF56C6CE',
    cellNoDriver: 'FF95A5B6',
    cellWeekend: 'FFEBC1C1',
    cellVacation: 'FFB394E0',
    cellEmpty: 'FFFFFFFF',
    textDark: 'FF1F2937',
    textRed: 'FFD32F2F',
  } as const;

  const startRow = 4;
  const nameCol = 1;
  const plateCol = isPersonnel ? -1 : 2;
  const noteCol = isPersonnel ? -1 : 3;
  const dayStartCol = isPersonnel ? 2 : 4;
  const totalCol = dayStartCol + monthDays.length;

  sheet.getColumn(nameCol).width = 28;
  if (!isPersonnel) {
    sheet.getColumn(plateCol).width = 13;
    sheet.getColumn(noteCol).width = 17;
  }
  monthDays.forEach((_, idx) => {
    sheet.getColumn(dayStartCol + idx).width = 4.3;
  });
  sheet.getColumn(totalCol).width = isPersonnel ? 18 : 12;

  sheet.mergeCells(1, 1, 1, totalCol);
  const sectionLabel = getSectionLabel(section, location);
  sheet.getCell(1, 1).value = `График работы - ${sectionLabel} (${mode === 'plan' ? 'План' : 'Факт'})`;
  sheet.getCell(1, 1).font = { bold: true, size: 13, name: 'Arial', color: { argb: COLORS.textDark } };
  sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
  sheet.getCell(1, 1).alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(1).height = 24;

  sheet.mergeCells(2, 1, 2, totalCol);
  sheet.getCell(2, 1).value = `Период: ${String(month).padStart(2, '0')}.${year}`;
  sheet.getCell(2, 1).font = { size: 11, name: 'Arial', color: { argb: 'FF5F6B7A' } };
  sheet.getCell(2, 1).alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(2).height = 20;

  const headerDaysRow = startRow;
  const headerWeekdaysRow = startRow + 1;
  const verticalHeaderEnd = startRow + 1;

  const thinBorderStyle: ExcelJS.BorderStyle = 'thin';
  const fullBorder: Partial<ExcelJS.Borders> = {
    top: { style: thinBorderStyle, color: { argb: COLORS.border } },
    left: { style: thinBorderStyle, color: { argb: COLORS.border } },
    bottom: { style: thinBorderStyle, color: { argb: COLORS.border } },
    right: { style: thinBorderStyle, color: { argb: COLORS.border } },
  };

  const applyBorderRange = (rowNumber: number) => {
    for (let col = 1; col <= totalCol; col += 1) {
      sheet.getCell(rowNumber, col).border = fullBorder;
    }
  };

  const applyHeaderFill = (rowNumber: number) => {
    for (let col = 1; col <= totalCol; col += 1) {
      sheet.getCell(rowNumber, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
    }
  };

  sheet.mergeCells(headerDaysRow, nameCol, verticalHeaderEnd, nameCol);
  sheet.getCell(headerDaysRow, nameCol).value = 'ФИО';
  if (!isPersonnel) {
    sheet.mergeCells(headerDaysRow, plateCol, verticalHeaderEnd, plateCol);
    sheet.getCell(headerDaysRow, plateCol).value = 'Г/Н ТС';
    sheet.mergeCells(headerDaysRow, noteCol, verticalHeaderEnd, noteCol);
    sheet.getCell(headerDaysRow, noteCol).value = 'Примечание';
  }
  sheet.mergeCells(headerDaysRow, totalCol, verticalHeaderEnd, totalCol);
  sheet.getCell(headerDaysRow, totalCol).value = isPersonnel ? 'Количество рабочих смен' : 'Кол-во смен';

  monthDays.forEach((day, index) => {
    const col = dayStartCol + index;
    const dateCell = sheet.getCell(headerDaysRow, col);
    const weekdayCell = sheet.getCell(headerWeekdaysRow, col);
    dateCell.value = day;
    weekdayCell.value = weekdays[index];
    const isWeekend = weekdays[index] === 'сб' || weekdays[index] === 'вс';
    if (isWeekend) {
      weekdayCell.font = { color: { argb: COLORS.textRed }, size: 11, name: 'Arial' };
      dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.weekend } };
      weekdayCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.weekend } };
    }
  });

  [headerDaysRow, headerWeekdaysRow].forEach((rowNumber) => {
    applyBorderRange(rowNumber);
    applyHeaderFill(rowNumber);
    const row = sheet.getRow(rowNumber);
    row.height = rowNumber === headerDaysRow ? 30 : 26;
    row.eachCell((cell, colNumber) => {
      const isLeft = colNumber === nameCol || (!isPersonnel && (colNumber === plateCol || colNumber === noteCol));
      cell.alignment = { vertical: 'middle', horizontal: isLeft ? 'left' : 'center' };
      if (!cell.font) {
        cell.font = { size: 11, name: 'Arial', color: { argb: COLORS.textDark } };
      }
    });
  });

  const styleDayCell = (cell: ExcelJS.Cell, code: CellCode, isWeekend: boolean) => {
    const styleMap: Record<CellCode, { bg: string; color: string }> = {
      W: { bg: COLORS.cellWork, color: 'FF0F172A' },
      H: { bg: COLORS.cellHalfDay, color: 'FF0F172A' },
      S: { bg: COLORS.cellCargoRemoval, color: 'FF7C2D12' },
      B: { bg: COLORS.cellSick, color: 'FF0F385E' },
      R: { bg: COLORS.cellRepair, color: 'FF0A4A52' },
      N: { bg: COLORS.cellNoDriver, color: 'FF1F2937' },
      O: { bg: COLORS.cellWeekend, color: 'FF7B2323' },
      V: { bg: COLORS.cellVacation, color: 'FF4A2C8A' },
      E: { bg: isWeekend ? COLORS.weekend : COLORS.cellEmpty, color: 'FF374151' },
    };
    const normalizedCode = normalizeCellCode(code);
    const s = styleMap[normalizedCode] ?? styleMap.E;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.bg } };
    cell.font = { size: 11, name: 'Arial', bold: normalizedCode !== 'E', color: { argb: s.color } };
  };

  let cursorRow = startRow + 2;
  sectionPeople.forEach((person) => {
    const lanes: Array<'1' | '2'> = person.secondName ? ['1', '2'] : ['1'];
    const personStartRow = cursorRow;
    lanes.forEach((lane) => {
      const rowIndex = lane === '1' ? person.rowIndex : person.rowIndex + 50;
      const name = lane === '1' ? person.name : person.secondName ?? '';
      const note = lane === '1' ? person.note ?? '' : person.secondNote ?? '';

      sheet.getCell(cursorRow, nameCol).value = name;
      if (!isPersonnel) {
        sheet.getCell(cursorRow, plateCol).value = lane === '1' ? person.plate : '';
        sheet.getCell(cursorRow, noteCol).value = note;
      }

      let workCount = 0;
      monthDays.forEach((day, index) => {
        const code = getCellCode(rowIndex, day, person.id, lane);
        workCount += getShiftValueForCount(department, code);
        const dayCol = dayStartCol + index;
        const cell = sheet.getCell(cursorRow, dayCol);
        cell.value = toCellLabel(code);
        styleDayCell(cell, code, weekdays[index] === 'сб' || weekdays[index] === 'вс');
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      sheet.getCell(cursorRow, totalCol).value = workCount;
      sheet.getRow(cursorRow).height = 28;
      for (let col = 1; col <= totalCol; col += 1) {
        const cell = sheet.getCell(cursorRow, col);
        if (col === nameCol || (!isPersonnel && (col === plateCol || col === noteCol))) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          if (!cell.font) cell.font = { size: 11, name: 'Arial', color: { argb: COLORS.textDark } };
        } else if (col === totalCol) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = { size: 11, bold: true, name: 'Arial', color: { argb: COLORS.textDark } };
        }
        if (!cell.fill) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.white } };
        }
        cell.border = fullBorder;
      }
      cursorRow += 1;
    });

    if (!isPersonnel && person.secondName) {
      sheet.mergeCells(personStartRow, plateCol, personStartRow + 1, plateCol);
      const plateCell = sheet.getCell(personStartRow, plateCol);
      plateCell.value = person.plate;
      plateCell.alignment = { horizontal: 'left', vertical: 'middle' };
      plateCell.font = { size: 11, name: 'Arial', color: { argb: COLORS.textDark } };
      plateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.white } };
      for (let row = personStartRow; row <= personStartRow + 1; row += 1) {
        sheet.getCell(row, plateCol).border = fullBorder;
      }
    }
  });

  sheet.getCell(cursorRow, nameCol).value = isPersonnel ? 'На смене:' : 'Итого';
  if (!isPersonnel) {
    const uniquePlates = new Set(
      sectionPeople.map((person) => person.plate.trim().toUpperCase()).filter((plate) => plate.length > 0)
    ).size;
    sheet.getCell(cursorRow, plateCol).value = uniquePlates;
  }

  monthDays.forEach((day, index) => {
    const total = sectionPeople.reduce((acc, person) => {
      const code = getCellCode(person.rowIndex, day, person.id, '1');
      if (section === 'containers' || section === 'auto') {
        const primaryWorked = code === 'W' || code === 'H' || (section === 'auto' && code === 'S');
        const secondaryWorked = person.secondName
          ? (() => {
              const code2 = getCellCode(person.rowIndex + 50, day, person.id, '2');
              return code2 === 'W' || code2 === 'H' || (section === 'auto' && code2 === 'S');
            })()
          : false;
        return acc + (primaryWorked || secondaryWorked ? 1 : 0);
      }

      let next = code === 'W' ? acc + 1 : acc;
      if (person.secondName) {
        const code2 = getCellCode(person.rowIndex + 50, day, person.id, '2');
        if (code2 === 'W') next += 1;
      }
      return next;
    }, 0);
    sheet.getCell(cursorRow, dayStartCol + index).value = total;
  });
  sheet.getRow(cursorRow).height = 30;
  for (let col = 1; col <= totalCol; col += 1) {
    const cell = sheet.getCell(cursorRow, col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalRow } };
    cell.border = fullBorder;
    if (col === nameCol || (!isPersonnel && (col === plateCol || col === noteCol))) {
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.font = { size: 11, bold: true, name: 'Arial', color: { argb: COLORS.textDark } };
    } else {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { size: 11, name: 'Arial', color: { argb: COLORS.textDark } };
    }
  }

  const legendStartRow = cursorRow + 2;
  const legendItems = isPersonnel
    ? [
        { code: '1', text: 'рабочий день', bg: COLORS.cellWork, color: 'FF0F172A' },
        { code: 'О', text: 'отпуск', bg: COLORS.cellVacation, color: 'FF4A2C8A' },
        { code: 'В', text: 'выходной', bg: COLORS.cellWeekend, color: 'FF7B2323' },
        { code: 'Б', text: 'больничный', bg: COLORS.cellSick, color: 'FF0F385E' },
        ...((section === 'mechanics' || section === 'guards')
          ? [{ code: 'Н', text: 'нет сотрудника', bg: COLORS.cellNoDriver, color: 'FF1F2937' }]
          : []),
      ]
    : [
        { code: '1', text: 'на линии', bg: COLORS.cellWork, color: 'FF0F172A' },
        { code: 'В', text: 'выходной', bg: COLORS.cellWeekend, color: 'FF7B2323' },
        { code: 'О', text: 'отпуск', bg: COLORS.cellVacation, color: 'FF4A2C8A' },
        { code: 'Б', text: 'больничный', bg: COLORS.cellSick, color: 'FF0F385E' },
        { code: 'П', text: 'погрузка', bg: COLORS.cellHalfDay, color: 'FF0F172A' },
        ...(section === 'auto'
          ? [{ code: 'С', text: 'снятие груза', bg: COLORS.cellCargoRemoval, color: 'FF7C2D12' }]
          : []),
        { code: 'Р', text: 'ремонт', bg: COLORS.cellRepair, color: 'FF0A4A52' },
        { code: 'Н', text: 'нет водителя', bg: COLORS.cellNoDriver, color: 'FF1F2937' },
      ];
  let legendCol = 1;
  legendItems.forEach((item) => {
    sheet.mergeCells(legendStartRow, legendCol, legendStartRow, legendCol + 2);
    const legendCell = sheet.getCell(legendStartRow, legendCol);
    legendCell.value = `${item.code} — ${item.text}`;
    legendCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.bg } };
    legendCell.font = { size: 11, name: 'Arial', color: { argb: item.color }, bold: true };
    legendCell.alignment = { horizontal: 'left', vertical: 'middle' };
    legendCell.border = fullBorder;
    for (let col = legendCol; col <= legendCol + 2; col += 1) {
      sheet.getCell(legendStartRow, col).border = fullBorder;
      sheet.getCell(legendStartRow, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.bg } };
    }
    legendCol += 4;
  });
  sheet.getRow(legendStartRow).height = 22;

  sheet.views = [{ state: 'frozen', ySplit: startRow + 1, xSplit: dayStartCol - 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `График работы - ${sectionLabel} - ${String(month).padStart(2, '0')}.${year}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', buildContentDisposition(filename));
  res.send(Buffer.from(buffer));
};

type RenderScheduleWorksheetParams = {
  workbook: ExcelJS.Workbook;
  sheetName: string;
  tabColor: string;
  titleLabel: string;
  section: Exclude<PreviewSection, 'efficiency'>;
  department: Department;
  year: number;
  month: number;
  monthValue: string;
  mode: PreviewMode;
  peopleByMonth: Record<string, PersonRow[]>;
  overrides: Record<OverrideScopeKey, Record<string, CellCode>>;
};

const renderOperationsScheduleWorksheet = ({
  workbook,
  sheetName,
  tabColor,
  titleLabel,
  section,
  department,
  year,
  month,
  monthValue,
  mode,
  peopleByMonth,
  overrides,
}: RenderScheduleWorksheetParams): void => {
  const allPeople = resolvePeopleForMonth(monthValue, peopleByMonth);
  const sectionPeople = allPeople
    .map((person, index) => ({ ...person, rowIndex: index }))
    .filter((person) => person.department === department);

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekdays = monthDays.map((day) => WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()]);
  const scopeKey = `${mode}|${monthValue}` as OverrideScopeKey;
  const scopeOverrides = overrides[scopeKey] ?? {};
  const isPersonnel = section === 'dispatchers' || section === 'couriers' || section === 'mechanics' || section === 'guards';
  const sheet = workbook.addWorksheet(makeSheetName(workbook, sheetName));
  sheet.properties.tabColor = { argb: tabColor };

  const COLORS = {
    border: 'FFD6DCE8',
    titleBg: 'FFE6E6E6',
    header: 'FFF2F4F9',
    weekend: 'FFF3F3F3',
    totalRow: 'FFEAF2FF',
    white: 'FFFFFFFF',
    cellWork: 'FF87D4A1',
    cellHalfDay: 'FFE6CF73',
    cellCargoRemoval: 'FFF8C99B',
    cellSick: 'FF87BDDE',
    cellRepair: 'FF56C6CE',
    cellNoDriver: 'FF95A5B6',
    cellWeekend: 'FFEBC1C1',
    cellVacation: 'FFB394E0',
    cellEmpty: 'FFFFFFFF',
    textDark: 'FF1F2937',
    textRed: 'FFD32F2F',
  } as const;

  const getCellCode = (rowIndex: number, day: number, personId: string, lane: '1' | '2' = '1'): CellCode => {
    const key = `${personId}-${lane}-${day}`;
    return normalizeCellCode(scopeOverrides[key] ?? getMonthlyCell(rowIndex, day, department));
  };

  const startRow = 4;
  const nameCol = 1;
  const plateCol = isPersonnel ? -1 : 2;
  const noteCol = isPersonnel ? -1 : 3;
  const dayStartCol = isPersonnel ? 2 : 4;
  const totalCol = dayStartCol + monthDays.length;

  sheet.getColumn(nameCol).width = 28;
  if (!isPersonnel) {
    sheet.getColumn(plateCol).width = 13;
    sheet.getColumn(noteCol).width = 17;
  }
  monthDays.forEach((_, idx) => {
    sheet.getColumn(dayStartCol + idx).width = 4.3;
  });
  sheet.getColumn(totalCol).width = isPersonnel ? 18 : 12;

  sheet.mergeCells(1, 1, 1, totalCol);
  sheet.getCell(1, 1).value = `График работы - ${titleLabel} (${mode === 'plan' ? 'План' : 'Факт'})`;
  sheet.getCell(1, 1).font = { bold: true, size: 13, name: 'Arial', color: { argb: COLORS.textDark } };
  sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
  sheet.getCell(1, 1).alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(1).height = 24;

  sheet.mergeCells(2, 1, 2, totalCol);
  sheet.getCell(2, 1).value = `Период: ${String(month).padStart(2, '0')}.${year}`;
  sheet.getCell(2, 1).font = { size: 11, name: 'Arial', color: { argb: 'FF5F6B7A' } };
  sheet.getCell(2, 1).alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(2).height = 20;

  const headerDaysRow = startRow;
  const headerWeekdaysRow = startRow + 1;
  const verticalHeaderEnd = startRow + 1;
  const thinBorderStyle: ExcelJS.BorderStyle = 'thin';
  const fullBorder: Partial<ExcelJS.Borders> = {
    top: { style: thinBorderStyle, color: { argb: COLORS.border } },
    left: { style: thinBorderStyle, color: { argb: COLORS.border } },
    bottom: { style: thinBorderStyle, color: { argb: COLORS.border } },
    right: { style: thinBorderStyle, color: { argb: COLORS.border } },
  };

  const applyBorderRange = (rowNumber: number) => {
    for (let col = 1; col <= totalCol; col += 1) {
      sheet.getCell(rowNumber, col).border = fullBorder;
    }
  };

  const applyHeaderFill = (rowNumber: number) => {
    for (let col = 1; col <= totalCol; col += 1) {
      sheet.getCell(rowNumber, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
    }
  };

  sheet.mergeCells(headerDaysRow, nameCol, verticalHeaderEnd, nameCol);
  sheet.getCell(headerDaysRow, nameCol).value = 'ФИО';
  if (!isPersonnel) {
    sheet.mergeCells(headerDaysRow, plateCol, verticalHeaderEnd, plateCol);
    sheet.getCell(headerDaysRow, plateCol).value = 'Г/Н ТС';
    sheet.mergeCells(headerDaysRow, noteCol, verticalHeaderEnd, noteCol);
    sheet.getCell(headerDaysRow, noteCol).value = 'Примечание';
  }
  sheet.mergeCells(headerDaysRow, totalCol, verticalHeaderEnd, totalCol);
  sheet.getCell(headerDaysRow, totalCol).value = isPersonnel ? 'Количество рабочих смен' : 'Кол-во смен';

  monthDays.forEach((day, index) => {
    const col = dayStartCol + index;
    const dateCell = sheet.getCell(headerDaysRow, col);
    const weekdayCell = sheet.getCell(headerWeekdaysRow, col);
    dateCell.value = day;
    weekdayCell.value = weekdays[index];
    const isWeekend = weekdays[index] === 'сб' || weekdays[index] === 'вс';
    if (isWeekend) {
      weekdayCell.font = { color: { argb: COLORS.textRed }, size: 11, name: 'Arial' };
      dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.weekend } };
      weekdayCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.weekend } };
    }
  });

  [headerDaysRow, headerWeekdaysRow].forEach((rowNumber) => {
    applyBorderRange(rowNumber);
    applyHeaderFill(rowNumber);
    const row = sheet.getRow(rowNumber);
    row.height = rowNumber === headerDaysRow ? 30 : 26;
    row.eachCell((cell, colNumber) => {
      const isLeft = colNumber === nameCol || (!isPersonnel && (colNumber === plateCol || colNumber === noteCol));
      cell.alignment = { vertical: 'middle', horizontal: isLeft ? 'left' : 'center' };
      if (!cell.font) {
        cell.font = { size: 11, name: 'Arial', color: { argb: COLORS.textDark } };
      }
    });
  });

  const styleDayCell = (cell: ExcelJS.Cell, code: CellCode, isWeekend: boolean) => {
    const styleMap: Record<CellCode, { bg: string; color: string }> = {
      W: { bg: COLORS.cellWork, color: 'FF0F172A' },
      H: { bg: COLORS.cellHalfDay, color: 'FF0F172A' },
      S: { bg: COLORS.cellCargoRemoval, color: 'FF7C2D12' },
      B: { bg: COLORS.cellSick, color: 'FF0F385E' },
      R: { bg: COLORS.cellRepair, color: 'FF0A4A52' },
      N: { bg: COLORS.cellNoDriver, color: 'FF1F2937' },
      O: { bg: COLORS.cellWeekend, color: 'FF7B2323' },
      V: { bg: COLORS.cellVacation, color: 'FF4A2C8A' },
      E: { bg: isWeekend ? COLORS.weekend : COLORS.cellEmpty, color: 'FF374151' },
    };
    const normalizedCode = normalizeCellCode(code);
    const dayStyle = styleMap[normalizedCode] ?? styleMap.E;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: dayStyle.bg } };
    cell.font = { size: 11, name: 'Arial', bold: normalizedCode !== 'E', color: { argb: dayStyle.color } };
  };

  let cursorRow = startRow + 2;
  sectionPeople.forEach((person) => {
    const lanes: Array<'1' | '2'> = person.secondName ? ['1', '2'] : ['1'];
    const personStartRow = cursorRow;
    lanes.forEach((lane) => {
      const rowIndex = lane === '1' ? person.rowIndex : person.rowIndex + 50;
      const name = lane === '1' ? person.name : person.secondName ?? '';
      const note = lane === '1' ? person.note ?? '' : person.secondNote ?? '';

      sheet.getCell(cursorRow, nameCol).value = name;
      if (!isPersonnel) {
        sheet.getCell(cursorRow, plateCol).value = lane === '1' ? person.plate : '';
        sheet.getCell(cursorRow, noteCol).value = note;
      }

      let workCount = 0;
      monthDays.forEach((day, index) => {
        const code = getCellCode(rowIndex, day, person.id, lane);
        workCount += getShiftValueForCount(department, code);
        const dayCol = dayStartCol + index;
        const cell = sheet.getCell(cursorRow, dayCol);
        cell.value = toCellLabel(code);
        styleDayCell(cell, code, weekdays[index] === 'сб' || weekdays[index] === 'вс');
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      sheet.getCell(cursorRow, totalCol).value = workCount;
      sheet.getRow(cursorRow).height = 28;
      for (let col = 1; col <= totalCol; col += 1) {
        const cell = sheet.getCell(cursorRow, col);
        if (col === nameCol || (!isPersonnel && (col === plateCol || col === noteCol))) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          if (!cell.font) cell.font = { size: 11, name: 'Arial', color: { argb: COLORS.textDark } };
        } else if (col === totalCol) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = { size: 11, bold: true, name: 'Arial', color: { argb: COLORS.textDark } };
        }
        if (!cell.fill) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.white } };
        }
        cell.border = fullBorder;
      }
      cursorRow += 1;
    });

    if (!isPersonnel && person.secondName) {
      sheet.mergeCells(personStartRow, plateCol, personStartRow + 1, plateCol);
      const plateCell = sheet.getCell(personStartRow, plateCol);
      plateCell.value = person.plate;
      plateCell.alignment = { horizontal: 'left', vertical: 'middle' };
      plateCell.font = { size: 11, name: 'Arial', color: { argb: COLORS.textDark } };
      plateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.white } };
      for (let row = personStartRow; row <= personStartRow + 1; row += 1) {
        sheet.getCell(row, plateCol).border = fullBorder;
      }
    }
  });

  sheet.getCell(cursorRow, nameCol).value = isPersonnel ? 'На смене:' : 'Итого';
  if (!isPersonnel) {
    const uniquePlates = new Set(
      sectionPeople.map((person) => person.plate.trim().toUpperCase()).filter((plate) => plate.length > 0)
    ).size;
    sheet.getCell(cursorRow, plateCol).value = uniquePlates;
  }

  monthDays.forEach((day, index) => {
    const total = sectionPeople.reduce((acc, person) => {
      const code = getCellCode(person.rowIndex, day, person.id, '1');
      if (section === 'containers' || section === 'auto') {
        const primaryWorked = code === 'W' || code === 'H' || (section === 'auto' && code === 'S');
        const secondaryWorked = person.secondName
          ? (() => {
              const code2 = getCellCode(person.rowIndex + 50, day, person.id, '2');
              return code2 === 'W' || code2 === 'H' || (section === 'auto' && code2 === 'S');
            })()
          : false;
        return acc + (primaryWorked || secondaryWorked ? 1 : 0);
      }

      let next = code === 'W' ? acc + 1 : acc;
      if (person.secondName) {
        const code2 = getCellCode(person.rowIndex + 50, day, person.id, '2');
        if (code2 === 'W') next += 1;
      }
      return next;
    }, 0);
    sheet.getCell(cursorRow, dayStartCol + index).value = total;
  });
  sheet.getRow(cursorRow).height = 30;
  for (let col = 1; col <= totalCol; col += 1) {
    const cell = sheet.getCell(cursorRow, col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalRow } };
    cell.border = fullBorder;
    if (col === nameCol || (!isPersonnel && (col === plateCol || col === noteCol))) {
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.font = { size: 11, bold: true, name: 'Arial', color: { argb: COLORS.textDark } };
    } else {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { size: 11, name: 'Arial', color: { argb: COLORS.textDark } };
    }
  }

  const legendStartRow = cursorRow + 2;
  const legendItems = isPersonnel
    ? [
        { code: '1', text: 'рабочий день', bg: COLORS.cellWork, color: 'FF0F172A' },
        { code: 'О', text: 'отпуск', bg: COLORS.cellVacation, color: 'FF4A2C8A' },
        { code: 'В', text: 'выходной', bg: COLORS.cellWeekend, color: 'FF7B2323' },
        { code: 'Б', text: 'больничный', bg: COLORS.cellSick, color: 'FF0F385E' },
        ...((section === 'mechanics' || section === 'guards')
          ? [{ code: 'Н', text: 'нет сотрудника', bg: COLORS.cellNoDriver, color: 'FF1F2937' }]
          : []),
      ]
    : [
        { code: '1', text: 'на линии', bg: COLORS.cellWork, color: 'FF0F172A' },
        { code: 'В', text: 'выходной', bg: COLORS.cellWeekend, color: 'FF7B2323' },
        { code: 'О', text: 'отпуск', bg: COLORS.cellVacation, color: 'FF4A2C8A' },
        { code: 'Б', text: 'больничный', bg: COLORS.cellSick, color: 'FF0F385E' },
        { code: 'П', text: 'погрузка', bg: COLORS.cellHalfDay, color: 'FF0F172A' },
        ...(section === 'auto'
          ? [{ code: 'С', text: 'снятие груза', bg: COLORS.cellCargoRemoval, color: 'FF7C2D12' }]
          : []),
        { code: 'Р', text: 'ремонт', bg: COLORS.cellRepair, color: 'FF0A4A52' },
        { code: 'Н', text: 'нет водителя', bg: COLORS.cellNoDriver, color: 'FF1F2937' },
      ];
  let legendCol = 1;
  legendItems.forEach((item) => {
    sheet.mergeCells(legendStartRow, legendCol, legendStartRow, legendCol + 2);
    const legendCell = sheet.getCell(legendStartRow, legendCol);
    legendCell.value = `${item.code} — ${item.text}`;
    legendCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.bg } };
    legendCell.font = { size: 11, name: 'Arial', color: { argb: item.color }, bold: true };
    legendCell.alignment = { horizontal: 'left', vertical: 'middle' };
    legendCell.border = fullBorder;
    for (let col = legendCol; col <= legendCol + 2; col += 1) {
      sheet.getCell(legendStartRow, col).border = fullBorder;
      sheet.getCell(legendStartRow, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.bg } };
    }
    legendCol += 4;
  });
  sheet.getRow(legendStartRow).height = 22;
  sheet.views = [{ state: 'frozen', ySplit: startRow + 1, xSplit: dayStartCol - 1 }];
};


const REPORT_LOCATION_PREFIX: Record<PreviewLocation, string> = {
  ktk_vvo: 'Влд',
  ktk_mow: 'МСК',
  garage_vvo: 'Влд',
  garage_mow: 'МСК',
  security_vvo: 'Влд',
};

const REPORT_SHEET_TAB_COLOR_BY_LOCATION: Record<PreviewLocation, string> = {
  ktk_vvo: 'FFBFD7F5',
  ktk_mow: 'FFFFD6BA',
  garage_vvo: 'FFCFE8D6',
  garage_mow: 'FFE5E7EB',
  security_vvo: 'FFE0E7FF',
};

const REPORT_MONTH_NAMES = [
  '',
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

const parseReportCity = (value: unknown, locations: PreviewLocation[]): 'vvo' | 'mow' => {
  if (value === 'mow') return 'mow';
  if (value === 'vvo') return 'vvo';
  return locations.includes('ktk_mow') && !locations.includes('ktk_vvo') && !locations.includes('garage_vvo') && !locations.includes('security_vvo') ? 'mow' : 'vvo';
};

const parseCsv = (value: unknown): string[] => {
  if (typeof value !== 'string') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
};

const makeSheetName = (workbook: ExcelJS.Workbook, rawName: string): string => {
  const base = rawName.replace(/[\\/*?:\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Лист';
  let name = base;
  let index = 2;
  while (workbook.getWorksheet(name)) {
    const suffix = ` ${index}`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    index += 1;
  }
  return name;
};

export const downloadOperationsPreviewReport = async (req: Request, res: Response) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'head_hr' && req.user?.role !== 'hr_specialist') {
    const error: any = new Error('Access denied for operations preview report');
    error.statusCode = 403;
    throw error;
  }

  const now = new Date();
  const year = parseYear(req.query.year, now.getFullYear());
  const month = parseMonth(req.query.month, now.getMonth() + 1);
  const monthValue = `${year}-${String(month).padStart(2, '0')}`;
  const requestedLocations = parseCsv(req.query.locations)
    .filter(isValidLocation)
    .filter((location) => location !== 'garage_mow') as PreviewLocation[];
  const requestedSections = parseCsv(req.query.sections).filter(isValidSection) as PreviewSection[];
  const requestedModes = parseCsv(req.query.modes).filter((mode): mode is PreviewMode => mode === 'plan' || mode === 'fact');
  const locations = requestedLocations.length > 0 ? requestedLocations : (['ktk_vvo', 'ktk_mow', 'garage_vvo', 'security_vvo'] as PreviewLocation[]);
  const reportCity = parseReportCity(req.query.city, locations);
  const sections = requestedSections.length > 0 ? requestedSections : (['containers', 'auto', 'dispatchers', 'couriers', 'mechanics', 'guards'] as PreviewSection[]);
  const modes = requestedModes.length > 0 ? requestedModes : (['fact'] as PreviewMode[]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Logistics Reporting';
  workbook.created = new Date();

  let sheetsCount = 0;
  for (const location of locations) {
    const row = await operationsPreviewRepo.findOne({
      where: { scopeKey: OPERATIONS_PREVIEW_SCOPE_BY_LOCATION[location] },
    });
    const payload = (row?.payload ?? {}) as PreviewPersistedState;
    const overrides = (payload.overrides ?? {}) as Record<OverrideScopeKey, Record<string, CellCode>>;
    const peopleByMonth = extractPeopleByMonth(payload);

    for (const section of sections) {
      if (section === 'efficiency' || !canAccessLocationSection(req.user?.role, location, section)) continue;
      const department = DEPARTMENT_BY_SECTION[section];
      const sectionModes = section === 'containers' || section === 'mechanics' || section === 'guards' ? modes : (['fact'] as PreviewMode[]);

      for (const mode of sectionModes) {
        const modeLabel = section === 'containers' || section === 'mechanics' || section === 'guards' ? ` (${mode === 'plan' ? 'план' : 'факт'})` : '';
        const sectionLabel = getSectionLabel(section, location);
        const sheetTitle = `${REPORT_LOCATION_PREFIX[location]} - ${sectionLabel}${modeLabel}`;
        renderOperationsScheduleWorksheet({
          workbook,
          sheetName: sheetTitle,
          tabColor: REPORT_SHEET_TAB_COLOR_BY_LOCATION[location],
          titleLabel: sectionLabel,
          section: section as Exclude<PreviewSection, 'efficiency'>,
          department,
          year,
          month,
          monthValue,
          mode,
          peopleByMonth,
          overrides,
        });
        sheetsCount += 1;
      }
    }
  }

  if (sheetsCount === 0) {
    const error: any = new Error('No report sections available for selected filters');
    error.statusCode = 400;
    throw error;
  }

  const reportCityLabel = reportCity === 'mow' ? 'Москва' : 'Владивосток';
  const reportMonthName = REPORT_MONTH_NAMES[month] ?? String(month).padStart(2, '0');
  const filename = `ГР_${reportCityLabel}_${reportMonthName}_${year}.xlsx`.normalize('NFC');
  const documentTitle = filename.replace(/\.xlsx$/i, '');
  workbook.title = documentTitle;
  workbook.subject = documentTitle;
  workbook.description = documentTitle;
  workbook.modified = new Date();

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', buildContentDisposition(filename));
  res.send(Buffer.from(buffer));
};
