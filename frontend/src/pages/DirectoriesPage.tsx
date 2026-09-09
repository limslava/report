import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Popover,
  Snackbar,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ArrowBack, ContentCopy, DragIndicator, KeyboardArrowDown, KeyboardArrowUp, Settings } from '@mui/icons-material';
import { useAuthStore } from '../store/auth-store';
import { registerUnsavedHandlers, setHasUnsavedChanges } from '../store/unsavedChanges';
import {
  AttachmentSummary,
  DirectoryAttachmentKind,
  downloadDirectoryAttachment,
  EmployeeItem,
  bootstrapDirectories,
  EmployeePayload,
  FleetLocation,
  FleetVehicleItem,
  TrailerItem,
  VehicleModelItem,
  createEmployee,
  createFleetVehicle,
  createTrailer,
  createVehicleModel,
  deleteEmployee,
  deleteFleetVehicle,
  deleteTrailer,
  deleteVehicleModel,
  exportDirectoryExcel,
  getEmployeeCardText,
  getEmployees,
  getFleetVehicles,
  getFuelSeasons,
  getTrailers,
  getVehicleModels,
  saveFuelSeasons,
  updateEmployee,
  updateFleetVehicle,
  updateTrailer,
  updateVehicleModel,
} from '../services/directories.api';
import { TableSortState, cycleSort, loadSortState, saveSortState, sortIndicator, sortRows } from '../utils/tableSort';
import { ColumnPrefs, applyColumnPrefs, isHidden, moveColumnTo, orderedKeys, toggleHidden } from '../utils/tableColumns';
import {
  canDeleteDirectoryEntryFrontend,
  canEditDirectoriesFrontend,
  canManageFuelNormsFrontend,
  directoryLocationsForRole,
} from '../utils/rolePermissions';
import AttachmentsSection from '../components/directories/AttachmentsSection';
import '../styles/operations-preview.css';
import '../styles/fuel.css';

const LOCATION_LABELS: Record<FleetLocation, string> = { vvo: 'Владивосток', mow: 'Москва' };
const TRAILER_KIND_LABELS: Record<string, string> = { auto: 'Автовозный', container: 'Контейнерный' };
const trailerKindLabel = (kind: string): string => TRAILER_KIND_LABELS[kind] ?? '';

const usagePill = (usage: { section: string; driverName: string } | null | undefined) =>
  usage ? (
    <Tooltip title={`${usage.section}${usage.driverName ? ` · ${usage.driverName}` : ''}`}>
      <span className="dir-status dir-status--ok">в графике</span>
    </Tooltip>
  ) : (
    <span className="dir-status dir-status--off">свободен</span>
  );
const MONTH_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

type TabKey = 'drivers' | 'staff' | 'vehicles' | 'trailers' | 'models';

type Feedback = { severity: 'success' | 'error'; text: string } | null;

const formatDateInput = (value: string | null | undefined): string => (value ? value.slice(0, 10) : '');

const formatDateDisplay = (value: string | null | undefined): string => {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
};

const errorText = (error: unknown): string => {
  const anyError = error as any;
  return anyError?.response?.data?.message || anyError?.message || 'Не удалось выполнить операцию';
};

const saveBlobFile = (data: Blob, filename: string) => {
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const DOC_KIND_LABELS: Record<string, string> = { passport: 'Паспорт', license: 'В/У', sor: 'СОР' };

/**
 * Ячейка «Документы»: чип на каждый вид скана — синий (клик = скачать,
 * несколько файлов = меню), серый — не загружен.
 */
function DocsCell({ attachments, kinds }: { attachments?: AttachmentSummary[]; kinds: DirectoryAttachmentKind[] }) {
  const [menu, setMenu] = useState<{ anchor: HTMLElement; files: AttachmentSummary[] } | null>(null);
  const download = async (file: AttachmentSummary) => {
    try {
      const response = await downloadDirectoryAttachment(file.id);
      saveBlobFile(response.data as Blob, file.originalName);
    } catch {
      window.alert('Не удалось скачать файл');
    }
  };
  return (
    <span onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      {kinds.map((kind) => {
        const files = (attachments ?? []).filter((file) => file.kind === kind);
        const label = DOC_KIND_LABELS[kind] ?? kind;
        if (!files.length) {
          return (
            <span key={kind} className="dir-doc-chip dir-doc-chip--off" title="Скан не загружен — прикрепите в карточке">
              {label}
            </span>
          );
        }
        return (
          <span
            key={kind}
            className="dir-doc-chip"
            title={`Скачать: ${files.map((file) => file.originalName).join(', ')}`}
            onClick={(event) => {
              if (files.length === 1) void download(files[0]);
              else setMenu({ anchor: event.currentTarget as HTMLElement, files });
            }}
          >
            {label}
            {files.length > 1 ? ` (${files.length})` : ''}
          </span>
        );
      })}
      <Menu open={Boolean(menu)} anchorEl={menu?.anchor ?? null} onClose={() => setMenu(null)}>
        {(menu?.files ?? []).map((file) => (
          <MenuItem
            key={file.id}
            sx={{ fontSize: 13 }}
            onClick={() => {
              setMenu(null);
              void download(file);
            }}
          >
            {file.originalName}
          </MenuItem>
        ))}
      </Menu>
    </span>
  );
}

const employeeStatusPill = (status: string) => (
  <span className={`dir-status ${status === 'active' ? 'dir-status--ok' : 'dir-status--off'}`}>
    {status === 'active' ? 'работает' : 'уволен'}
  </span>
);
const techStatusPill = (status: string) => (
  <span className={`dir-status ${status === 'active' ? 'dir-status--ok' : status === 'repair' ? 'dir-status--warn' : 'dir-status--off'}`}>
    {status === 'active' ? 'в работе' : status === 'repair' ? 'ремонт' : 'архив'}
  </span>
);

/**
 * Настраиваемые колонки таблиц (пользователь выбирает видимость и порядок,
 * кнопка «Колонки»). Первая колонка (ФИО/номер) и колонка действий — фиксированы.
 * key совпадает с полем сортировки. defaultHidden — поля карточек, по умолчанию
 * в таблице не показываются, но пользователь может их включить.
 */
type DirColumn<T> = {
  key: string;
  label: string;
  minWidth: number;
  thCenter?: boolean;
  tdClass: string;
  defaultHidden?: boolean;
  /** колонка без сортировки (например «Документы») */
  noSort?: boolean;
  render: (row: T) => React.ReactNode;
};
/** Поля карточки сотрудника, доступные как скрытые колонки (общие для водителей и сотрудников). */
const EMPLOYEE_CARD_COLUMNS: DirColumn<EmployeeItem>[] = [
  { key: 'passportNumber', label: 'Паспорт (серия и номер)', minWidth: 150, tdClass: 'fuel-cell--center', defaultHidden: true, render: (e) => e.passportNumber || '—' },
  { key: 'passportIssueDate', label: 'Дата выдачи паспорта', minWidth: 120, thCenter: true, tdClass: 'fuel-cell--center', defaultHidden: true, render: (e) => formatDateDisplay(e.passportIssueDate) },
  { key: 'passportIssuedBy', label: 'Кем выдан паспорт', minWidth: 220, tdClass: 'fuel-cell--left', defaultHidden: true, render: (e) => e.passportIssuedBy || '—' },
  { key: 'birthPlace', label: 'Место рождения', minWidth: 180, tdClass: 'fuel-cell--left', defaultHidden: true, render: (e) => e.birthPlace || '—' },
  { key: 'registrationAddress', label: 'Адрес регистрации', minWidth: 240, tdClass: 'fuel-cell--left', defaultHidden: true, render: (e) => e.registrationAddress || '—' },
];
const DRIVER_COLUMNS: DirColumn<EmployeeItem>[] = [
  { key: 'phone', label: 'Телефон', minWidth: 130, tdClass: 'fuel-cell--center', render: (e) => e.phone || '—' },
  { key: 'licenseNumber', label: 'ВУ (номер)', minWidth: 120, tdClass: 'fuel-cell--center', render: (e) => e.licenseNumber || '—' },
  { key: 'licenseIssueDate', label: 'Дата выдачи ВУ', minWidth: 110, thCenter: true, tdClass: 'fuel-cell--center', render: (e) => formatDateDisplay(e.licenseIssueDate) },
  { key: 'inn', label: 'ИНН', minWidth: 120, thCenter: true, tdClass: 'fuel-cell--center', render: (e) => e.inn || '—' },
  { key: 'birthDate', label: 'Дата рождения', minWidth: 110, thCenter: true, tdClass: 'fuel-cell--center', render: (e) => formatDateDisplay(e.birthDate) },
  ...EMPLOYEE_CARD_COLUMNS,
  { key: 'docs', label: 'Документы', minWidth: 140, thCenter: true, tdClass: 'fuel-cell--center', noSort: true, render: (e) => <DocsCell attachments={e.attachments} kinds={['passport', 'license']} /> },
  { key: 'status', label: 'Статус', minWidth: 90, thCenter: true, tdClass: 'fuel-cell--center', render: (e) => employeeStatusPill(e.status) },
];
const STAFF_COLUMNS: DirColumn<EmployeeItem>[] = [
  { key: 'position', label: 'Должность', minWidth: 180, tdClass: 'fuel-cell--left', render: (e) => e.position || '—' },
  { key: 'phone', label: 'Телефон', minWidth: 130, tdClass: 'fuel-cell--center', render: (e) => e.phone || '—' },
  { key: 'inn', label: 'ИНН', minWidth: 120, thCenter: true, tdClass: 'fuel-cell--center', render: (e) => e.inn || '—' },
  { key: 'birthDate', label: 'Дата рождения', minWidth: 110, thCenter: true, tdClass: 'fuel-cell--center', render: (e) => formatDateDisplay(e.birthDate) },
  { key: 'licenseNumber', label: 'ВУ (номер)', minWidth: 120, tdClass: 'fuel-cell--center', defaultHidden: true, render: (e) => e.licenseNumber || '—' },
  { key: 'licenseIssueDate', label: 'Дата выдачи ВУ', minWidth: 110, thCenter: true, tdClass: 'fuel-cell--center', defaultHidden: true, render: (e) => formatDateDisplay(e.licenseIssueDate) },
  ...EMPLOYEE_CARD_COLUMNS,
  { key: 'docs', label: 'Документы', minWidth: 100, thCenter: true, tdClass: 'fuel-cell--center', noSort: true, render: (e) => <DocsCell attachments={e.attachments} kinds={['passport']} /> },
  { key: 'status', label: 'Статус', minWidth: 90, thCenter: true, tdClass: 'fuel-cell--center', render: (e) => employeeStatusPill(e.status) },
];
const VEHICLE_COLUMNS: DirColumn<FleetVehicleItem>[] = [
  { key: 'vehicleKind', label: 'Тип ТС', minWidth: 170, tdClass: 'fuel-cell--left', render: (v) => v.vehicleKind || '—' },
  { key: 'modelLabel', label: 'Модель', minWidth: 150, tdClass: 'fuel-cell--left', render: (v) => (v.model ? `${v.model.brand} ${v.model.name}`.trim() : '—') },
  { key: 'color', label: 'Цвет', minWidth: 90, tdClass: 'fuel-cell--center', render: (v) => v.color || '—' },
  { key: 'vin', label: 'VIN', minWidth: 140, tdClass: 'fuel-cell--left', render: (v) => v.vin || '—' },
  { key: 'sor', label: 'СОР', minWidth: 120, thCenter: true, tdClass: 'fuel-cell--center', render: (v) => v.sor || '—' },
  { key: 'sorIssueDate', label: 'Дата выдачи СОР', minWidth: 120, thCenter: true, tdClass: 'fuel-cell--center', defaultHidden: true, render: (v) => formatDateDisplay(v.sorIssueDate) },
  { key: 'owner', label: 'Собственник', minWidth: 160, tdClass: 'fuel-cell--left', defaultHidden: true, render: (v) => v.owner || '—' },
  { key: 'manufactureYear', label: 'Год выпуска', minWidth: 90, thCenter: true, tdClass: 'fuel-cell--center', render: (v) => v.manufactureYear || '—' },
  { key: 'docs', label: 'Документы', minWidth: 80, thCenter: true, tdClass: 'fuel-cell--center', noSort: true, render: (v) => <DocsCell attachments={v.attachments} kinds={['sor']} /> },
  { key: 'status', label: 'Статус', minWidth: 90, thCenter: true, tdClass: 'fuel-cell--center', render: (v) => techStatusPill(v.status) },
  { key: 'scheduleUsage', label: 'В графике', minWidth: 100, thCenter: true, tdClass: 'fuel-cell--center', render: (v) => usagePill(v.scheduleUsage) },
];
const TRAILER_COLUMNS: DirColumn<TrailerItem>[] = [
  { key: 'kind', label: 'Тип', minWidth: 130, tdClass: 'fuel-cell--left', render: (t) => trailerKindLabel(t.kind) || '—' },
  { key: 'brand', label: 'Марка', minWidth: 130, tdClass: 'fuel-cell--left', render: (t) => t.brand || '—' },
  { key: 'axles', label: 'Оси', minWidth: 70, thCenter: true, tdClass: 'fuel-cell--center', render: (t) => t.axles || '—' },
  { key: 'footage', label: 'Футовость', minWidth: 100, thCenter: true, tdClass: 'fuel-cell--center', render: (t) => t.footage || '—' },
  { key: 'note', label: 'Примечание', minWidth: 200, tdClass: 'fuel-cell--left', render: (t) => t.note || '—' },
  { key: 'docs', label: 'Документы', minWidth: 80, thCenter: true, tdClass: 'fuel-cell--center', noSort: true, render: (t) => <DocsCell attachments={t.attachments} kinds={['sor']} /> },
  { key: 'status', label: 'Статус', minWidth: 90, thCenter: true, tdClass: 'fuel-cell--center', render: (t) => techStatusPill(t.status) },
  { key: 'scheduleUsage', label: 'В графике', minWidth: 100, thCenter: true, tdClass: 'fuel-cell--center', render: (t) => usagePill(t.scheduleUsage) },
];
const MODEL_COLUMNS: DirColumn<VehicleModelItem>[] = [
  { key: 'fuelNormWinter', label: 'Норма зима, л/100км', minWidth: 140, thCenter: true, tdClass: 'fuel-cell--center', render: (m) => m.fuelNormWinter ?? '—' },
  { key: 'fuelNormSummer', label: 'Норма лето, л/100км', minWidth: 140, thCenter: true, tdClass: 'fuel-cell--center', render: (m) => m.fuelNormSummer ?? '—' },
  { key: 'vehicleCount', label: 'Машин', minWidth: 80, thCenter: true, tdClass: 'fuel-cell--center', render: (m) => m.vehicleCount ?? 0 },
];
const TAB_COLUMNS: Record<TabKey, DirColumn<any>[]> = {
  drivers: DRIVER_COLUMNS,
  staff: STAFF_COLUMNS,
  vehicles: VEHICLE_COLUMNS,
  trailers: TRAILER_COLUMNS,
  models: MODEL_COLUMNS,
};

/**
 * counterpartyId/-Name: страница работает как карточка контрагента —
 * те же вкладки водители/техника/прицепы, но данные принадлежат контрагенту
 * (в наши списки и графики не попадают). Без пропсов — «Наша организация».
 */
export default function DirectoriesPage({
  counterpartyId,
  counterpartyName,
  counterpartyInn,
}: { counterpartyId?: string; counterpartyName?: string; counterpartyInn?: string } = {}) {
  const isCounterpartyMode = Boolean(counterpartyId);
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const allowedLocations = useMemo(() => directoryLocationsForRole(user?.role), [user?.role]);
  const canManageNorms = canManageFuelNormsFrontend(user?.role);
  const isAdmin = user?.role === 'admin';
  const [location, setLocation] = useState<FleetLocation>(allowedLocations[0] ?? 'vvo');
  // менеджеры КТК — только просмотр и копирование; удаление — админ и рук. КТК своего региона
  const canEdit = canEditDirectoriesFrontend(user?.role);
  const canDelete = canDeleteDirectoryEntryFrontend(user?.role, location);
  const [tab, setTab] = useState<TabKey>('drivers');
  const [feedback, setFeedback] = useState<Feedback>(null);

  const sortStorageKey = `dir-sort-v1:${user?.id ?? 'anonymous'}`;
  const [sortByTab, setSortByTab] = useState<Record<TabKey, TableSortState>>(() =>
    loadSortState(sortStorageKey, { drivers: null, staff: null, vehicles: null, trailers: null, models: null })
  );
  useEffect(() => saveSortState(sortStorageKey, sortByTab), [sortStorageKey, sortByTab]);

  // настройка колонок (видимость + порядок), на пользователя, по вкладкам
  const columnsStorageKey = `dir-columns-v1:${user?.id ?? 'anonymous'}`;
  const [columnPrefs, setColumnPrefs] = useState<Partial<Record<TabKey, ColumnPrefs>>>(() =>
    loadSortState(columnsStorageKey, {})
  );
  useEffect(() => saveSortState(columnsStorageKey, columnPrefs), [columnsStorageKey, columnPrefs]);
  const [columnsAnchor, setColumnsAnchor] = useState<HTMLElement | null>(null);
  const dragColumnKey = useRef<string | null>(null);
  const tabColumnKeys = (tabKey: TabKey) => TAB_COLUMNS[tabKey].map((column) => column.key);
  const tabDefaultHidden = (tabKey: TabKey) =>
    TAB_COLUMNS[tabKey].filter((column) => column.defaultHidden).map((column) => column.key);
  const visibleColumns = (tabKey: TabKey): DirColumn<any>[] => {
    const byKey = new Map(TAB_COLUMNS[tabKey].map((column) => [column.key, column]));
    return applyColumnPrefs(tabColumnKeys(tabKey), tabDefaultHidden(tabKey), columnPrefs[tabKey]).map((key) => byKey.get(key)!);
  };
  const columnTh = (tabKey: TabKey, column: DirColumn<any>) => (
    <th key={column.key} className={column.thCenter ? 'fuel-cell--center' : undefined} style={{ minWidth: column.minWidth }}>
      {column.noSort ? <span>{column.label}</span> : sortHeader(tabKey, column.key, column.label)}
    </th>
  );
  const columnTd = (column: DirColumn<any>, row: unknown) => (
    <td key={column.key} className={column.tdClass}>{column.render(row)}</td>
  );

  const toggleSort = (tabKey: TabKey, field: string) =>
    setSortByTab((prev) => ({ ...prev, [tabKey]: cycleSort(prev[tabKey], field) }));
  const sortHeader = (tabKey: TabKey, field: string, label: string) => (
    <button type="button" className="ops-matrix__sort-btn" onClick={() => toggleSort(tabKey, field)}>
      <span>{label}</span>
      <span className={`ops-matrix__sort-indicator is-${sortIndicator(sortByTab[tabKey], field)}`} aria-hidden="true" />
    </button>
  );

  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicleItem[]>([]);
  const [trailers, setTrailers] = useState<TrailerItem[]>([]);
  const [models, setModels] = useState<VehicleModelItem[]>([]);
  const [seasons, setSeasons] = useState<{ winterStartMonth: number; winterEndMonth: number }>({
    winterStartMonth: 11,
    winterEndMonth: 3,
  });

  const [employeeEdit, setEmployeeEdit] = useState<Partial<EmployeeItem> | null>(null);
  const [vehicleEdit, setVehicleEdit] = useState<Partial<FleetVehicleItem> | null>(null);
  const [vehicleModelLabel, setVehicleModelLabel] = useState('');
  const [trailerEdit, setTrailerEdit] = useState<Partial<TrailerItem> | null>(null);
  const [modelEdit, setModelEdit] = useState<Partial<VehicleModelItem> | null>(null);
  // экспорт: режим галочек слева в таблице (решение пользователя 2026-08-19)
  const [exportMode, setExportMode] = useState(false);
  const [exportIds, setExportIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    setExportMode(false);
    setExportIds([]);
  }, [tab, location]);
  const toggleExportId = (id: string) =>
    setExportIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const reload = useCallback(async () => {
    try {
      const [employeesRes, vehiclesRes, trailersRes, modelsRes, seasonsRes] = await Promise.all([
        getEmployees(location, counterpartyId).catch(() => ({ data: [] as EmployeeItem[] })),
        getFleetVehicles(location, counterpartyId),
        getTrailers(location, counterpartyId),
        getVehicleModels(location),
        getFuelSeasons().catch(() => ({ data: { winterStartMonth: 11, winterEndMonth: 3 } })),
      ]);
      setEmployees(employeesRes.data);
      setVehicles(vehiclesRes.data);
      setTrailers(trailersRes.data);
      setModels(modelsRes.data);
      setSeasons(seasonsRes.data);
      seasonsSnapshot.current = JSON.stringify(seasonsRes.data);
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  }, [location, counterpartyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (isCounterpartyMode && (tab === 'staff' || tab === 'models')) setTab('drivers');
  }, [isCounterpartyMode, tab]);

  // «несохранённое» в справочниках: открытая карточка с изменениями или неприменённые сезоны
  const employeeSnapshot = useRef<string | null>(null);
  const vehicleSnapshot = useRef<string | null>(null);
  const trailerSnapshot = useRef<string | null>(null);
  const modelSnapshot = useRef<string | null>(null);
  const seasonsSnapshot = useRef<string>(JSON.stringify({ winterStartMonth: 11, winterEndMonth: 3 }));

  useEffect(() => {
    employeeSnapshot.current = employeeEdit ? (employeeSnapshot.current ?? JSON.stringify(employeeEdit)) : null;
  }, [employeeEdit === null]);
  useEffect(() => {
    vehicleSnapshot.current = vehicleEdit ? (vehicleSnapshot.current ?? JSON.stringify({ ...vehicleEdit, __label: vehicleModelLabel })) : null;
  }, [vehicleEdit === null]);
  useEffect(() => {
    trailerSnapshot.current = trailerEdit ? (trailerSnapshot.current ?? JSON.stringify(trailerEdit)) : null;
  }, [trailerEdit === null]);
  useEffect(() => {
    modelSnapshot.current = modelEdit ? (modelSnapshot.current ?? JSON.stringify(modelEdit)) : null;
  }, [modelEdit === null]);

  const dirty =
    (employeeEdit !== null && employeeSnapshot.current !== null && JSON.stringify(employeeEdit) !== employeeSnapshot.current) ||
    (vehicleEdit !== null && vehicleSnapshot.current !== null && JSON.stringify({ ...vehicleEdit, __label: vehicleModelLabel }) !== vehicleSnapshot.current) ||
    (trailerEdit !== null && trailerSnapshot.current !== null && JSON.stringify(trailerEdit) !== trailerSnapshot.current) ||
    (modelEdit !== null && modelSnapshot.current !== null && JSON.stringify(modelEdit) !== modelSnapshot.current) ||
    (canManageNorms && JSON.stringify(seasons) !== seasonsSnapshot.current);

  useEffect(() => {
    setHasUnsavedChanges(dirty);
  }, [dirty]);

  useEffect(() => {
    registerUnsavedHandlers({
      save: async () => {
        if (employeeEdit) return saveEmployeeEdit();
        if (vehicleEdit) return saveVehicleEdit();
        if (trailerEdit) return saveTrailerEdit();
        if (modelEdit) return saveModelEdit();
        if (JSON.stringify(seasons) !== seasonsSnapshot.current) {
          await saveSeasons();
          seasonsSnapshot.current = JSON.stringify(seasons);
        }
        return true;
      },
      discard: () => {
        setEmployeeEdit(null);
        setVehicleEdit(null);
        setTrailerEdit(null);
        setModelEdit(null);
        try {
          setSeasons(JSON.parse(seasonsSnapshot.current));
        } catch {
          // снапшот всегда валиден
        }
      },
    });
    return () => {
      registerUnsavedHandlers(null);
      setHasUnsavedChanges(false);
    };
  });

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const drivers = useMemo(
    () =>
      sortRows(
        isCounterpartyMode ? employees : employees.filter((e) => e.position === 'водитель'),
        sortByTab.drivers,
        (row, field) => (row as unknown as Record<string, unknown>)[field]
      ),
    [employees, isCounterpartyMode, sortByTab.drivers]
  );
  const staff = useMemo(
    () =>
      sortRows(
        employees.filter((e) => e.position !== 'водитель'),
        sortByTab.staff,
        (row, field) => (row as unknown as Record<string, unknown>)[field]
      ),
    [employees, sortByTab.staff]
  );
  /** Подсказки собственника — из уже введённых значений (как направления в графике). */
  const ownerSuggestions = useMemo(
    () =>
      [...new Set(vehicles.map((vehicle) => vehicle.owner?.trim()).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b, 'ru')
      ),
    [vehicles]
  );
  const sortedVehicles = useMemo(
    () =>
      sortRows(vehicles, sortByTab.vehicles, (row, field) =>
        field === 'modelLabel'
          ? (row.model ? `${row.model.brand} ${row.model.name}`.trim() : '')
          : field === 'scheduleUsage'
            ? (row.scheduleUsage ? 'в графике' : 'свободен')
            : (row as unknown as Record<string, unknown>)[field]
      ),
    [vehicles, sortByTab.vehicles]
  );
  const sortedTrailers = useMemo(
    () =>
      sortRows(trailers, sortByTab.trailers, (row, field) =>
        field === 'kind'
          ? trailerKindLabel(row.kind)
          : field === 'scheduleUsage'
            ? (row.scheduleUsage ? 'в графике' : 'свободен')
            : (row as unknown as Record<string, unknown>)[field]
      ),
    [trailers, sortByTab.trailers]
  );
  const sortedModels = useMemo(
    () =>
      sortRows(models, sortByTab.models, (row, field) =>
        field === 'label' ? `${row.brand} ${row.name}`.trim() : (row as unknown as Record<string, unknown>)[field]
      ),
    [models, sortByTab.models]
  );

  const copyCard = async (employee: EmployeeItem) => {
    try {
      const { data } = await getEmployeeCardText(employee.id);
      await navigator.clipboard.writeText(data.text);
      setFeedback({ severity: 'success', text: `Карточка «${employee.fullName}» скопирована в буфер обмена` });
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  // Копия для прицепов/моделей: только данные самого справочника, без обращения
  // к серверу (ПДн здесь нет), по аналогии с карточкой водителя.
  const copyPlain = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback({ severity: 'success', text: `${label} — скопировано в буфер обмена` });
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  const exportOptions = useMemo(() => {
    if (tab === 'drivers') return drivers.map((d) => ({ id: d.id, label: d.fullName }));
    if (tab === 'staff') return staff.map((d) => ({ id: d.id, label: d.fullName }));
    if (tab === 'vehicles') return sortedVehicles.map((v) => ({ id: v.id, label: v.plate }));
    if (tab === 'trailers') return sortedTrailers.map((t) => ({ id: t.id, label: t.plate }));
    return sortedModels.map((m) => ({ id: m.id, label: `${m.brand} ${m.name}`.trim() }));
  }, [tab, drivers, staff, sortedVehicles, sortedTrailers, sortedModels]);

  const TAB_EXPORT_LABELS: Record<TabKey, string> = {
    drivers: 'водители',
    staff: 'сотрудники',
    vehicles: 'техника',
    trailers: 'прицепы',
    models: 'модели_и_нормы',
  };

  const runExport = async () => {
    setExporting(true);
    try {
      const { data } = await exportDirectoryExcel(tab, location, exportIds);
      const url = URL.createObjectURL(new Blob([data as BlobPart]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `Справочник_${TAB_EXPORT_LABELS[tab]}_${LOCATION_LABELS[location]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportMode(false);
      setExportIds([]);
      setFeedback({ severity: 'success', text: 'Файл выгружен' });
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    } finally {
      setExporting(false);
    }
  };

  const allExportSelected = exportIds.length > 0 && exportIds.length === exportOptions.length;
  const toggleAllExport = () =>
    setExportIds(allExportSelected ? [] : exportOptions.map((option) => option.id));
  const exportCheckboxHeader = (
    <th className="fuel-cell--center" style={{ width: 44 }}>
      <Checkbox
        size="small"
        sx={{ p: 0.25 }}
        checked={allExportSelected}
        indeterminate={exportIds.length > 0 && !allExportSelected}
        onChange={toggleAllExport}
      />
    </th>
  );
  const exportCheckboxCell = (id: string) => (
    <td className="fuel-cell--center dir-actions" onDoubleClick={(event) => event.stopPropagation()}>
      <Checkbox size="small" sx={{ p: 0.25 }} checked={exportIds.includes(id)} onChange={() => toggleExportId(id)} />
    </td>
  );

  const saveEmployeeEdit = async (): Promise<boolean> => {
    if (!employeeEdit) return true;
    if (!employeeEdit.fullName?.trim()) {
      setFeedback({ severity: 'error', text: 'Укажите ФИО' });
      return false;
    }
    const payload: EmployeePayload = {
      ...employeeEdit,
      location,
      fullName: employeeEdit.fullName.trim(),
      counterpartyId,
    } as EmployeePayload;
    try {
      if (employeeEdit.id) await updateEmployee(employeeEdit.id, payload);
      else await createEmployee(payload);
      setEmployeeEdit(null);
      await reload();
      setFeedback({ severity: 'success', text: 'Сотрудник сохранён' });
      return true;
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
      return false;
    }
  };

  const saveVehicleEdit = async (): Promise<boolean> => {
    if (!vehicleEdit) return true;
    if (!vehicleEdit.plate?.trim()) {
      setFeedback({ severity: 'error', text: 'Укажите госномер' });
      return false;
    }
    try {
      const payload = { ...vehicleEdit, location, modelLabel: vehicleModelLabel.trim(), modelId: vehicleModelLabel.trim() ? undefined : null, counterpartyId };
      if (vehicleEdit.id) await updateFleetVehicle(vehicleEdit.id, payload);
      else await createFleetVehicle(payload);
      setVehicleEdit(null);
      await reload();
      setFeedback({ severity: 'success', text: 'Техника сохранена' });
      return true;
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
      return false;
    }
  };

  const saveTrailerEdit = async (): Promise<boolean> => {
    if (!trailerEdit) return true;
    if (!trailerEdit.plate?.trim()) {
      setFeedback({ severity: 'error', text: 'Укажите номер прицепа' });
      return false;
    }
    try {
      const payload = { ...trailerEdit, location, counterpartyId };
      if (trailerEdit.id) await updateTrailer(trailerEdit.id, payload);
      else await createTrailer(payload);
      setTrailerEdit(null);
      await reload();
      setFeedback({ severity: 'success', text: 'Прицеп сохранён' });
      return true;
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
      return false;
    }
  };

  const saveModelEdit = async (): Promise<boolean> => {
    if (!modelEdit) return true;
    if (!modelEdit.brand?.trim()) {
      setFeedback({ severity: 'error', text: 'Укажите марку' });
      return false;
    }
    try {
      if (modelEdit.id) await updateVehicleModel(modelEdit.id, modelEdit);
      else await createVehicleModel({ ...modelEdit, location });
      setModelEdit(null);
      await reload();
      setFeedback({ severity: 'success', text: 'Модель сохранена' });
      return true;
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
      return false;
    }
  };

  const removeEntity = async (kind: 'employees' | 'vehicles' | 'trailers' | 'models', id: string, label: string) => {
    if (!window.confirm(`Удалить «${label}»?`)) return;
    try {
      if (kind === 'employees') { await deleteEmployee(id); setEmployeeEdit(null); }
      if (kind === 'vehicles') { await deleteFleetVehicle(id); setVehicleEdit(null); }
      if (kind === 'trailers') { await deleteTrailer(id); setTrailerEdit(null); }
      if (kind === 'models') { await deleteVehicleModel(id); setModelEdit(null); }
      await reload();
      setFeedback({ severity: 'success', text: 'Удалено' });
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  const saveSeasons = async () => {
    try {
      await saveFuelSeasons(seasons);
      seasonsSnapshot.current = JSON.stringify(seasons);
      setFeedback({ severity: 'success', text: 'Сезоны сохранены' });
    } catch (error) {
      setFeedback({ severity: 'error', text: errorText(error) });
    }
  };

  const textField = (
    label: string,
    value: string | undefined,
    onChange: (value: string) => void,
    options?: { type?: string; multiline?: boolean }
  ) => (
    <TextField
      label={label}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      size="small"
      fullWidth
      type={options?.type}
      multiline={options?.multiline}
      InputLabelProps={options?.type === 'date' ? { shrink: true } : undefined}
    />
  );

  return (
    <div className="ops-preview dir-page">
      <section className="ops-preview__controls">
        <Paper sx={{ p: 1.5, width: '100%' }}>
          <Box display="flex" alignItems="center" gap={2} sx={{ flexWrap: 'nowrap', minWidth: 0 }}>
            {isCounterpartyMode && (
              <>
                <Tooltip title="К списку контрагентов">
                  <IconButton size="small" onClick={() => navigate('/directories/counterparties')}>
                    <ArrowBack sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
                <Box sx={{ minWidth: 0, flexShrink: 0, maxWidth: 280 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 14, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {counterpartyName || 'Контрагент'}
                  </Typography>
                  {counterpartyInn && (
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', lineHeight: 1 }}>
                      ИНН {counterpartyInn}
                    </Typography>
                  )}
                </Box>
              </>
            )}
            {allowedLocations.length > 1 && (
              <TextField
                label="Город"
                select
                size="small"
                value={location}
                onChange={(event) => setLocation(event.target.value as FleetLocation)}
                sx={{ width: 170, '& .MuiInputBase-root': { height: 40 } }}
              >
                {allowedLocations.map((value) => (
                  <MenuItem key={value} value={value}>{LOCATION_LABELS[value]}</MenuItem>
                ))}
              </TextField>
            )}
            <Tabs
              value={tab}
              onChange={(_event, value) => setTab(value as TabKey)}
              variant="scrollable"
              sx={{ minHeight: 40, flexShrink: 1, minWidth: 0, '& .MuiTab-root': { minHeight: 40, py: 0 } }}
            >
              <Tab value="drivers" label={`Водители (${drivers.length})`} />
              <Tab value="vehicles" label={`Техника (${vehicles.length})`} />
              {!isCounterpartyMode && <Tab value="staff" label={`Сотрудники (${staff.length})`} />}
              <Tab value="trailers" label={`Прицепы (${trailers.length})`} />
              {!isCounterpartyMode && <Tab value="models" label={`Модели и нормы (${models.length})`} />}
            </Tabs>
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
              <Tooltip title="Настроить колонки">
                <IconButton size="small" onClick={(event) => setColumnsAnchor(event.currentTarget)}>
                  <Settings sx={{ fontSize: 20, color: '#6b7280' }} />
                </IconButton>
              </Tooltip>
              {!exportMode && !isCounterpartyMode && (
                <button
                  type="button"
                  className="ops-btn ops-btn--download"
                  onClick={() => {
                    setExportIds([]);
                    setExportMode(true);
                  }}
                >
                  Скачать Excel
                </button>
              )}
              {exportMode && (
                <>
                  <button
                    type="button"
                    className="ops-btn ops-btn--download"
                    disabled={exporting}
                    onClick={() => void runExport()}
                  >
                    {exporting ? 'Выгрузка…' : exportIds.length ? `Скачать (${exportIds.length})` : 'Скачать всех'}
                  </button>
                  <button
                    type="button"
                    className="ops-btn ghost"
                    onClick={() => {
                      setExportMode(false);
                      setExportIds([]);
                    }}
                  >
                    Отмена
                  </button>
                </>
              )}
              {isAdmin && !isCounterpartyMode && (tab === 'drivers' || tab === 'vehicles') && (
                <button
                  type="button"
                  className="ops-btn ghost"
                  onClick={() => {
                    if (!window.confirm('Наполнить справочники из графиков? Будут созданы отсутствующие водители и машины из графиков контейнеровозов и автовозов обоих регионов. Существующие записи не изменятся.')) return;
                    void bootstrapDirectories()
                      .then(({ data }) => {
                        setFeedback({
                          severity: 'success',
                          text: `Добавлено из графиков: водителей ${data.createdEmployees}, машин ${data.createdVehicles}`,
                        });
                        return reload();
                      })
                      .catch((error) => setFeedback({ severity: 'error', text: errorText(error) }));
                  }}
                >
                  Наполнить из графиков
                </button>
              )}
              {(tab === 'drivers' || tab === 'staff') && canEdit && (
                <button
                  type="button"
                  className="ops-btn ops-btn--add"
                  onClick={() => setEmployeeEdit({ position: tab === 'drivers' ? 'водитель' : '', status: 'active' })}
                >
                  Добавить
                </button>
              )}
              {tab === 'vehicles' && canEdit && (
                <button
                  type="button"
                  className="ops-btn ops-btn--add"
                  onClick={() => {
                    setVehicleModelLabel('');
                    setVehicleEdit({ status: 'active' });
                  }}
                >
                  Добавить
                </button>
              )}
              {tab === 'trailers' && canEdit && (
                <button type="button" className="ops-btn ops-btn--add" onClick={() => setTrailerEdit({ status: 'active' })}>
                  Добавить
                </button>
              )}
              {tab === 'models' && canManageNorms && (
                <button type="button" className="ops-btn ops-btn--add" onClick={() => setModelEdit({})}>
                  Добавить
                </button>
              )}
            </Box>
          </Box>
        </Paper>
      </section>

      {/* настройка колонок текущей вкладки: видимость чекбоксами, порядок перетаскиванием */}
      <Popover
        open={Boolean(columnsAnchor)}
        anchorEl={columnsAnchor}
        onClose={() => setColumnsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 1.5, width: 280 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 15 }}>Колонки</Typography>
          <Typography sx={{ fontSize: 12, color: '#6b7280', mb: 1 }}>
            Отметьте нужные и перетащите для порядка
          </Typography>
          {orderedKeys(tabColumnKeys(tab), columnPrefs[tab]).map((key, index) => {
            const column = TAB_COLUMNS[tab].find((item) => item.key === key);
            if (!column) return null;
            return (
              <Box
                key={key}
                draggable
                onDragStart={() => { dragColumnKey.current = key; }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const dragged = dragColumnKey.current;
                  dragColumnKey.current = null;
                  if (!dragged || dragged === key) return;
                  setColumnPrefs((prev) => ({
                    ...prev,
                    [tab]: moveColumnTo(tabColumnKeys(tab), tabDefaultHidden(tab), prev[tab], dragged, index),
                  }));
                }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.5,
                  border: '1px solid #e5e7eb', borderRadius: '8px',
                  px: 0.75, py: 0.25, mb: 0.5, cursor: 'grab', bgcolor: '#fafafa',
                }}
              >
                <DragIndicator sx={{ fontSize: 16, color: '#9ca3af' }} />
                <Checkbox
                  size="small"
                  sx={{ p: 0.5 }}
                  checked={!isHidden(tabColumnKeys(tab), tabDefaultHidden(tab), columnPrefs[tab], key)}
                  onChange={() =>
                    setColumnPrefs((prev) => ({
                      ...prev,
                      [tab]: toggleHidden(tabColumnKeys(tab), tabDefaultHidden(tab), prev[tab], key),
                    }))
                  }
                />
                <Typography sx={{ fontSize: 13, flex: 1 }}>{column.label}</Typography>
                <IconButton
                  size="small" sx={{ p: 0.25 }}
                  disabled={index === 0}
                  onClick={() =>
                    setColumnPrefs((prev) => ({ ...prev, [tab]: moveColumnTo(tabColumnKeys(tab), tabDefaultHidden(tab), prev[tab], key, index - 1) }))
                  }
                >
                  <KeyboardArrowUp sx={{ fontSize: 16 }} />
                </IconButton>
                <IconButton
                  size="small" sx={{ p: 0.25 }}
                  disabled={index === tabColumnKeys(tab).length - 1}
                  onClick={() =>
                    setColumnPrefs((prev) => ({ ...prev, [tab]: moveColumnTo(tabColumnKeys(tab), tabDefaultHidden(tab), prev[tab], key, index + 1) }))
                  }
                >
                  <KeyboardArrowDown sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            );
          })}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
            <Button size="small" onClick={() => setColumnPrefs((prev) => ({ ...prev, [tab]: undefined }))}>
              Сбросить
            </Button>
            <Button size="small" onClick={() => setColumnsAnchor(null)}>Готово</Button>
          </Box>
        </Box>
      </Popover>

      <section className="ops-preview__matrix">
        {tab === 'drivers' && (
          <div className="dir-table">
            <table>
              <thead>
                <tr>
                  {exportMode && exportCheckboxHeader}
                  <th style={{ minWidth: 290, whiteSpace: "nowrap" }}>{sortHeader('drivers', 'fullName', 'ФИО')}</th>
                  {visibleColumns('drivers').map((column) => columnTh('drivers', column))}
                  <th className="fuel-cell--center" style={{ minWidth: 80 }}>Карточка</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((employee) => (
                  <tr
                    key={employee.id}
                    onDoubleClick={() => setEmployeeEdit(employee)}
                  >
                    {exportMode && exportCheckboxCell(employee.id)}
                    <td className="fuel-cell--sticky">{employee.fullName}</td>
                    {visibleColumns('drivers').map((column) => columnTd(column, employee))}
                    <td className="fuel-cell--center dir-actions">
                      <Tooltip title="Скопировать данные водителя (без машины и прицепа)">
                        <IconButton size="small" onClick={() => void copyCard(employee)}>
                          <ContentCopy sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
                {drivers.length === 0 && (
                  <tr>
                    <td colSpan={visibleColumns('drivers').length + 3} className="fuel-empty">Водителей пока нет — добавьте</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'staff' && (
          <div className="dir-table">
            <table>
              <thead>
                <tr>
                  {exportMode && exportCheckboxHeader}
                  <th style={{ minWidth: 290, whiteSpace: "nowrap" }}>{sortHeader('staff', 'fullName', 'ФИО')}</th>
                  {visibleColumns('staff').map((column) => columnTh('staff', column))}
                  <th className="fuel-cell--center" style={{ minWidth: 80 }}>Карточка</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((employee) => (
                  <tr key={employee.id} onDoubleClick={() => setEmployeeEdit(employee)}>
                    {exportMode && exportCheckboxCell(employee.id)}
                    <td className="fuel-cell--sticky">{employee.fullName}</td>
                    {visibleColumns('staff').map((column) => columnTd(column, employee))}
                    <td className="fuel-cell--center dir-actions">
                      <Tooltip title="Скопировать данные сотрудника">
                        <IconButton size="small" onClick={() => void copyCard(employee)}>
                          <ContentCopy sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan={visibleColumns('staff').length + 3} className="fuel-empty">Сотрудников пока нет — добавьте (для доверенностей не на водителей)</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'vehicles' && (
          <div className="dir-table">
            <table>
              <thead>
                <tr>
                  {exportMode && exportCheckboxHeader}
                  <th style={{ minWidth: 110 }}>{sortHeader('vehicles', 'plate', 'Г/Н ТС')}</th>
                  {visibleColumns('vehicles').map((column) => columnTh('vehicles', column))}
                  <th className="fuel-cell--center" style={{ minWidth: 70 }}>Копия</th>
                </tr>
              </thead>
              <tbody>
                {sortedVehicles.map((vehicle) => (
                  <tr
                    key={vehicle.id}
                    onDoubleClick={() => {
                      setVehicleModelLabel(vehicle.model ? `${vehicle.model.brand} ${vehicle.model.name}`.trim() : '');
                      setVehicleEdit(vehicle);
                    }}
                  >
                    {exportMode && exportCheckboxCell(vehicle.id)}
                    <td className="fuel-cell--sticky">{vehicle.plate}</td>
                    {visibleColumns('vehicles').map((column) => columnTd(column, vehicle))}
                    <td className="fuel-cell--center dir-actions">
                      <Tooltip title="Скопировать данные техники">
                        <IconButton
                          size="small"
                          onClick={() => {
                            const lines = [
                              `Гос.номер: ${vehicle.plate ?? ''}`,
                              `Модель: ${vehicle.model ? `${vehicle.model.brand} ${vehicle.model.name}`.trim() : ''}`,
                              `Тип: ${vehicle.vehicleKind ?? ''}`,
                              `Цвет: ${vehicle.color ?? ''}`,
                              `VIN: ${vehicle.vin ?? ''}`,
                              `Год выпуска: ${vehicle.manufactureYear ?? ''}`,
                            ];
                            void copyPlain(lines.join('\n'), `Техника «${vehicle.plate}»`);
                          }}
                        >
                          <ContentCopy sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
                {vehicles.length === 0 && (
                  <tr>
                    <td colSpan={visibleColumns('vehicles').length + 3} className="fuel-empty">Справочник пуст — техника появится из графиков или добавьте вручную</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'trailers' && (
          <div className="dir-table">
            <table>
              <thead>
                <tr>
                  {exportMode && exportCheckboxHeader}
                  <th style={{ minWidth: 130 }}>{sortHeader('trailers', 'plate', 'Номер')}</th>
                  {visibleColumns('trailers').map((column) => columnTh('trailers', column))}
                  <th className="fuel-cell--center" style={{ minWidth: 70 }}>Копия</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrailers.map((trailer) => (
                  <tr key={trailer.id} onDoubleClick={() => setTrailerEdit(trailer)}>
                    {exportMode && exportCheckboxCell(trailer.id)}
                    <td className="fuel-cell--sticky">{trailer.plate}</td>
                    {visibleColumns('trailers').map((column) => columnTd(column, trailer))}
                    <td className="fuel-cell--center dir-actions">
                      <Tooltip title="Скопировать данные прицепа">
                        <IconButton
                          size="small"
                          onClick={() => {
                            const lines = [
                              `Номер: ${trailer.plate ?? ''}`,
                              `Марка: ${trailer.brand ?? ''}`,
                              `Оси: ${trailer.axles ?? ''}`,
                              `Футовость: ${trailer.footage ?? ''}`,
                            ];
                            void copyPlain(lines.join('\n'), `Прицеп «${trailer.plate}»`);
                          }}
                        >
                          <ContentCopy sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
                {trailers.length === 0 && (
                  <tr>
                    <td colSpan={visibleColumns('trailers').length + 3} className="fuel-empty">Справочник пуст — добавьте прицепы</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'models' && (
          <>
            {canManageNorms && (
              <Paper sx={{ p: 1.5, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: 13, color: '#6b7280' }}>Зимний период:</Typography>
                  <TextField
                    select size="small" sx={{ minWidth: 140, '& .MuiInputBase-root': { height: 36 } }}
                    value={seasons.winterStartMonth}
                    onChange={(event) => setSeasons((prev) => ({ ...prev, winterStartMonth: Number(event.target.value) }))}
                  >
                    {MONTH_GENITIVE.map((name, index) => (
                      <MenuItem key={name} value={index + 1}>с 1 {name}</MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select size="small" sx={{ minWidth: 170, '& .MuiInputBase-root': { height: 36 } }}
                    value={seasons.winterEndMonth}
                    onChange={(event) => setSeasons((prev) => ({ ...prev, winterEndMonth: Number(event.target.value) }))}
                  >
                    {MONTH_GENITIVE.map((name, index) => (
                      <MenuItem key={name} value={index + 1}>по конец {name}</MenuItem>
                    ))}
                  </TextField>
                  <button type="button" className="ops-btn ghost" onClick={() => void saveSeasons()}>
                    Сохранить сезоны
                  </button>
                </Box>
              </Paper>
            )}
            <div className="dir-table">
              <table>
                <thead>
                  <tr>
                    {exportMode && exportCheckboxHeader}
                    <th style={{ minWidth: 220 }}>{sortHeader('models', 'label', 'Марка / модель')}</th>
                    {visibleColumns('models').map((column) => columnTh('models', column))}
                  </tr>
                </thead>
                <tbody>
                  {sortedModels.map((model) => (
                    <tr key={model.id} onDoubleClick={canManageNorms ? () => setModelEdit(model) : undefined}>
                      {exportMode && exportCheckboxCell(model.id)}
                      <td className="fuel-cell--sticky">{`${model.brand} ${model.name}`.trim()}</td>
                      {visibleColumns('models').map((column) => columnTd(column, model))}
                    </tr>
                  ))}
                  {models.length === 0 && (
                    <tr>
                      <td colSpan={visibleColumns('models').length + 2} className="fuel-empty">Моделей пока нет — они появятся при заполнении карточек техники</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>



      {/* ─── Карточка сотрудника: полная для водителя, короткая для остальных ─── */}
      <Dialog open={Boolean(employeeEdit)} onClose={() => setEmployeeEdit(null)} maxWidth="md" fullWidth>
        <DialogTitle>{employeeEdit?.id ? 'Карточка водителя' : 'Новый водитель'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <fieldset disabled={!canEdit} style={{ border: 0, margin: 0, padding: 0, display: 'contents' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mt: 1 }}>
            {textField('ФИО', employeeEdit?.fullName, (value) => setEmployeeEdit((prev) => ({ ...prev, fullName: value })))}
            <Autocomplete
              freeSolo
              size="small"
              options={['водитель', 'оперативник', 'диспетчер', 'механик']}
              value={employeeEdit?.position ?? ''}
              inputValue={employeeEdit?.position ?? ''}
              onInputChange={(_event, value) => setEmployeeEdit((prev) => ({ ...prev, position: value }))}
              disabled={!canEdit}
              renderInput={(params) => <TextField {...params} label="Должность" fullWidth />}
            />
            {textField('Телефон', employeeEdit?.phone, (value) => setEmployeeEdit((prev) => ({ ...prev, phone: value })))}
            <TextField
              select size="small" label="Статус" fullWidth
              value={employeeEdit?.status ?? 'active'}
              onChange={(event) => setEmployeeEdit((prev) => ({ ...prev, status: event.target.value as 'active' | 'fired' }))}
            >
              <MenuItem value="active">работает</MenuItem>
              <MenuItem value="fired">уволен</MenuItem>
            </TextField>
          </Box>
          <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mt: 1.5 }}>
                {textField('Дата рождения', formatDateInput(employeeEdit?.birthDate), (value) => setEmployeeEdit((prev) => ({ ...prev, birthDate: value || null })), { type: 'date' })}
                {textField('Место рождения', employeeEdit?.birthPlace, (value) => setEmployeeEdit((prev) => ({ ...prev, birthPlace: value })))}
                {textField('Паспорт (серия и номер)', employeeEdit?.passportNumber, (value) => setEmployeeEdit((prev) => ({ ...prev, passportNumber: value })))}
                {textField('Дата выдачи паспорта', formatDateInput(employeeEdit?.passportIssueDate), (value) => setEmployeeEdit((prev) => ({ ...prev, passportIssueDate: value || null })), { type: 'date' })}
              </Box>
              <Box sx={{ mt: 1.5, display: 'grid', gap: 1.5 }}>
                {textField('Кем выдан паспорт', employeeEdit?.passportIssuedBy, (value) => setEmployeeEdit((prev) => ({ ...prev, passportIssuedBy: value })))}
                {textField('Адрес регистрации', employeeEdit?.registrationAddress, (value) => setEmployeeEdit((prev) => ({ ...prev, registrationAddress: value })))}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 1.5, mt: 1.5 }}>
                {textField('ВУ (номер)', employeeEdit?.licenseNumber, (value) => setEmployeeEdit((prev) => ({ ...prev, licenseNumber: value })))}
                {textField('Дата выдачи ВУ', formatDateInput(employeeEdit?.licenseIssueDate), (value) => setEmployeeEdit((prev) => ({ ...prev, licenseIssueDate: value || null })), { type: 'date' })}
                {textField('ИНН', employeeEdit?.inn, (value) => setEmployeeEdit((prev) => ({ ...prev, inn: value.replace(/\D/g, '').slice(0, 12) })))}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Машина и прицеп не закрепляются в справочнике — сцепка берётся из строки графика.
              </Typography>
          </>
          </fieldset>
          <AttachmentsSection
            entityType="employee"
            entityId={employeeEdit?.id}
            kinds={
              (employeeEdit?.position ?? '').trim().toLowerCase() === 'водитель'
                ? [{ kind: 'passport', label: 'Паспорт' }, { kind: 'license', label: 'В/У' }]
                : [{ kind: 'passport', label: 'Паспорт' }]
            }
            canEdit={canEdit}
            onError={(text) => setFeedback({ severity: 'error', text })}
            onSuccess={(text) => setFeedback({ severity: 'success', text })}
          />
        </DialogContent>
        <DialogActions>
          {canDelete && employeeEdit?.id && (
            <Button
              color="error"
              sx={{ mr: 'auto' }}
              onClick={() => void removeEntity('employees', employeeEdit.id!, employeeEdit.fullName ?? '')}
            >
              Удалить
            </Button>
          )}
          <Button onClick={() => setEmployeeEdit(null)}>{canEdit ? 'Отмена' : 'Закрыть'}</Button>
          {canEdit && <Button variant="contained" onClick={() => void saveEmployeeEdit()}>Сохранить</Button>}
        </DialogActions>
      </Dialog>

      {/* ─── Карточка техники ─── */}
      <Dialog open={Boolean(vehicleEdit)} onClose={() => setVehicleEdit(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{vehicleEdit?.id ? 'Карточка техники' : 'Новая техника'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <fieldset disabled={!canEdit} style={{ border: 0, margin: 0, padding: 0, display: 'contents' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mt: 1 }}>
            {textField('Госномер', vehicleEdit?.plate, (value) => setVehicleEdit((prev) => ({ ...prev, plate: value })))}
            {textField('Тип ТС', vehicleEdit?.vehicleKind, (value) => setVehicleEdit((prev) => ({ ...prev, vehicleKind: value })))}
            <Autocomplete
              freeSolo
              size="small"
              options={models.map((model) => `${model.brand} ${model.name}`.trim())}
              value={vehicleModelLabel}
              onChange={(_event, value) => setVehicleModelLabel(value ?? '')}
              onInputChange={(_event, value) => setVehicleModelLabel(value)}
              renderInput={(params) => (
                <TextField {...params} label="Модель" placeholder="Начните вводить — или выберите из списка" fullWidth />
              )}
            />
            <Autocomplete
              freeSolo
              size="small"
              options={ownerSuggestions}
              value={vehicleEdit?.owner ?? ''}
              onChange={(_event, value) => setVehicleEdit((prev) => (prev ? { ...prev, owner: value ?? '' } : prev))}
              onInputChange={(_event, value) => setVehicleEdit((prev) => (prev ? { ...prev, owner: value } : prev))}
              renderInput={(params) => (
                <TextField {...params} label="Собственник" placeholder="Начните вводить — или выберите" fullWidth />
              )}
            />
            {textField('Цвет', vehicleEdit?.color, (value) => setVehicleEdit((prev) => ({ ...prev, color: value })))}
            {textField('VIN', vehicleEdit?.vin, (value) => setVehicleEdit((prev) => ({ ...prev, vin: value })))}
            {textField('СОР', vehicleEdit?.sor, (value) => setVehicleEdit((prev) => ({ ...prev, sor: value })))}
            {textField('Дата выдачи СОР', formatDateInput(vehicleEdit?.sorIssueDate), (value) => setVehicleEdit((prev) => ({ ...prev, sorIssueDate: value || null })), { type: 'date' })}
            {textField('Год выпуска', vehicleEdit?.manufactureYear, (value) => setVehicleEdit((prev) => ({ ...prev, manufactureYear: value })))}
            <TextField
              select size="small" label="Статус" fullWidth
              value={vehicleEdit?.status ?? 'active'}
              onChange={(event) => setVehicleEdit((prev) => ({ ...prev, status: event.target.value as FleetVehicleItem['status'] }))}
            >
              <MenuItem value="active">в работе</MenuItem>
              <MenuItem value="repair">ремонт</MenuItem>
              <MenuItem value="archived">архив</MenuItem>
            </TextField>
          </Box>
          </fieldset>
          <AttachmentsSection
            entityType="vehicle"
            entityId={vehicleEdit?.id}
            kinds={[{ kind: 'sor', label: 'СОР' }]}
            canEdit={canEdit}
            onError={(text) => setFeedback({ severity: 'error', text })}
            onSuccess={(text) => setFeedback({ severity: 'success', text })}
          />
        </DialogContent>
        <DialogActions>
          {canDelete && vehicleEdit?.id && (
            <Button
              color="error"
              sx={{ mr: 'auto' }}
              onClick={() => void removeEntity('vehicles', vehicleEdit.id!, vehicleEdit.plate ?? '')}
            >
              Удалить
            </Button>
          )}
          <Button onClick={() => setVehicleEdit(null)}>{canEdit ? 'Отмена' : 'Закрыть'}</Button>
          {canEdit && <Button variant="contained" onClick={() => void saveVehicleEdit()}>Сохранить</Button>}
        </DialogActions>
      </Dialog>

      {/* ─── Прицеп ─── */}
      <Dialog open={Boolean(trailerEdit)} onClose={() => setTrailerEdit(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{trailerEdit?.id ? 'Прицеп' : 'Новый прицеп'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <fieldset disabled={!canEdit} style={{ border: 0, margin: 0, padding: 0, display: 'contents' }}>
          <Box sx={{ display: 'grid', gap: 1.5, mt: 1 }}>
            {textField('Номер прицепа', trailerEdit?.plate, (value) => setTrailerEdit((prev) => ({ ...prev, plate: value })))}
            <TextField
              select size="small" label="Тип прицепа (необязательно)" fullWidth
              value={trailerEdit?.kind ?? ''}
              onChange={(event) => setTrailerEdit((prev) => ({ ...prev, kind: event.target.value as TrailerItem['kind'] }))}
            >
              <MenuItem value="">— не указан —</MenuItem>
              <MenuItem value="auto">Автовозный прицеп</MenuItem>
              <MenuItem value="container">Контейнерный прицеп</MenuItem>
            </TextField>
            {textField('Марка', trailerEdit?.brand, (value) => setTrailerEdit((prev) => ({ ...prev, brand: value })))}
            {textField('Оси', trailerEdit?.axles, (value) => setTrailerEdit((prev) => ({ ...prev, axles: value })))}
            {textField('Футовость', trailerEdit?.footage, (value) => setTrailerEdit((prev) => ({ ...prev, footage: value })))}
            <TextField
              select size="small" label="Статус" fullWidth
              value={trailerEdit?.status ?? 'active'}
              onChange={(event) => setTrailerEdit((prev) => ({ ...prev, status: event.target.value as TrailerItem['status'] }))}
            >
              <MenuItem value="active">в работе</MenuItem>
              <MenuItem value="repair">ремонт</MenuItem>
              <MenuItem value="archived">архив</MenuItem>
            </TextField>
            {textField('Примечание', trailerEdit?.note, (value) => setTrailerEdit((prev) => ({ ...prev, note: value })))}
          </Box>
          </fieldset>
          <AttachmentsSection
            entityType="trailer"
            entityId={trailerEdit?.id}
            kinds={[{ kind: 'sor', label: 'СОР' }]}
            canEdit={canEdit}
            onError={(text) => setFeedback({ severity: 'error', text })}
            onSuccess={(text) => setFeedback({ severity: 'success', text })}
          />
        </DialogContent>
        <DialogActions>
          {canDelete && trailerEdit?.id && (
            <Button
              color="error"
              sx={{ mr: 'auto' }}
              onClick={() => void removeEntity('trailers', trailerEdit.id!, trailerEdit.plate ?? '')}
            >
              Удалить
            </Button>
          )}
          <Button onClick={() => setTrailerEdit(null)}>{canEdit ? 'Отмена' : 'Закрыть'}</Button>
          {canEdit && <Button variant="contained" onClick={() => void saveTrailerEdit()}>Сохранить</Button>}
        </DialogActions>
      </Dialog>

      {/* ─── Модель ─── */}
      <Dialog open={Boolean(modelEdit)} onClose={() => setModelEdit(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{modelEdit?.id ? 'Модель техники' : 'Новая модель'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ display: 'grid', gap: 1.5, mt: 1 }}>
            {textField('Марка', modelEdit?.brand, (value) => setModelEdit((prev) => ({ ...prev, brand: value })))}
            {textField('Модель', modelEdit?.name, (value) => setModelEdit((prev) => ({ ...prev, name: value })))}
            {textField('Норма зима, л/100км', modelEdit?.fuelNormWinter ?? '', (value) => setModelEdit((prev) => ({ ...prev, fuelNormWinter: value || null })), { type: 'number' })}
            {textField('Норма лето, л/100км', modelEdit?.fuelNormSummer ?? '', (value) => setModelEdit((prev) => ({ ...prev, fuelNormSummer: value || null })), { type: 'number' })}
          </Box>
        </DialogContent>
        <DialogActions>
          {canDelete && modelEdit?.id && (
            <Button
              color="error"
              sx={{ mr: 'auto' }}
              onClick={() => void removeEntity('models', modelEdit.id!, `${modelEdit.brand ?? ''} ${modelEdit.name ?? ''}`.trim())}
            >
              Удалить
            </Button>
          )}
          <Button onClick={() => setModelEdit(null)}>Отмена</Button>
          <Button variant="contained" onClick={() => void saveModelEdit()}>Сохранить</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(feedback)}
        autoHideDuration={4000}
        onClose={() => setFeedback(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={feedback?.severity ?? 'success'} onClose={() => setFeedback(null)}>
          {feedback?.text}
        </Alert>
      </Snackbar>
    </div>
  );
}
