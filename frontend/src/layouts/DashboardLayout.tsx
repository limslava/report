import { Outlet } from 'react-router-dom';
import {
  AppBar,
  Alert,
  Box,
  Button,
  Collapse,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Divider,
  Tooltip,
  Badge,
  SvgIcon,
  FormControl,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Assignment,
  People,
  Settings,
  Logout,
  TableChart,
  CalendarMonth,
  ChevronLeft,
  ChevronRight,
  Close,
  FactCheck,
  LocalShipping,
  ExpandLess,
  ExpandMore,
  AccountTree,
  Warehouse,
  SpaceDashboard,
} from '@mui/icons-material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth-store';
import {
  canAccessBillOfLading,
  canAccessCandidateChecks,
  canAccessContractApproval,
  canAccessAdmin,
  canAccessOperationsPreview,
  canViewCalendar,
  canViewOperationsEfficiency,
  canViewFinancialPlan,
  canViewPlans,
  canViewSummary,
  canViewTechDashboard,
  canViewTotalsInPlans,
  canViewBPDashboard,
  canShowBPDashboardMenu,
  canAccessWarehouse,
} from '../utils/rolePermissions';
import { getHasUnsavedChanges, getUnsavedHandlers, setHasUnsavedChanges } from '../store/unsavedChanges';
import { getRuntimeAppSettings } from '../services/api';
import { useServiceHealth } from '../hooks/useServiceHealth';
import useNotesUnreadStore from '../store/notes-unread-store';
import useContractUnreadStore from '../store/contract-unread-store';

const expandedDrawerWidth = 280;
const collapsedDrawerWidth = 86;
const DEFAULT_IDLE_TIMEOUT_MIN = 60;
const IDLE_TIMEOUT_MIN = (() => {
  const raw = Number(import.meta.env.VITE_IDLE_TIMEOUT_MIN);
  if (!Number.isFinite(raw)) return DEFAULT_IDLE_TIMEOUT_MIN;
  if (raw <= 0) return DEFAULT_IDLE_TIMEOUT_MIN;
  return raw;
})();
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MIN * 60 * 1000;
const LAST_ACTIVITY_KEY = 'last-activity-at';
const SIDEBAR_SUBMENUS_KEY = 'sidebar-submenus-open';

const DashboardLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [processingUnsavedAction, setProcessingUnsavedAction] = useState(false);
  const [isPinnedOpen, setIsPinnedOpen] = useState<boolean>(() => {
    const raw = localStorage.getItem('sidebar-pinned-open');
    return raw !== 'false';
  });
  const unreadNotesCount = useNotesUnreadStore((state) => state.unreadCount);
  const startUnreadSync = useNotesUnreadStore((state) => state.start);
  const stopUnreadSync = useNotesUnreadStore((state) => state.stop);
  const contractUnreadCount = useContractUnreadStore((state) => state.unreadCount);
  const startContractUnreadSync = useContractUnreadStore((state) => state.start);
  const stopContractUnreadSync = useContractUnreadStore((state) => state.stop);
  const [isWorkSubmenuOpen, setIsWorkSubmenuOpen] = useState(false);
  const [isPlansSubmenuOpen, setIsPlansSubmenuOpen] = useState(true);
  const [isAdminWorkSubmenuOpen, setIsAdminWorkSubmenuOpen] = useState(false);
  const [isAdminWorkDeptSubmenuOpen, setIsAdminWorkDeptSubmenuOpen] = useState(false);
  const [isVvoDispatchSubmenuOpen, setIsVvoDispatchSubmenuOpen] = useState(false);
  const [isWorkMoscowSubmenuOpen, setIsWorkMoscowSubmenuOpen] = useState(false);
  const [isMoscowDispatchSubmenuOpen, setIsMoscowDispatchSubmenuOpen] = useState(false);
  const [isWorkGarageSubmenuOpen, setIsWorkGarageSubmenuOpen] = useState(false);
  const [isMoscowGarageSubmenuOpen, setIsMoscowGarageSubmenuOpen] = useState(false);
  const [isWorkSecuritySubmenuOpen, setIsWorkSecuritySubmenuOpen] = useState(false);
  const [isBusinessProcessSubmenuOpen, setIsBusinessProcessSubmenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [appTitle, setAppTitle] = useState('Логистика & Отчетность');
  const drawerWidth = isPinnedOpen ? expandedDrawerWidth : collapsedDrawerWidth;
  const canViewTotals = canViewTotalsInPlans(user?.role);
  const canViewFinancial = canViewFinancialPlan(user?.role);
  const canViewEfficiency = canViewOperationsEfficiency(user?.role);
  const isTechDashboardRoute = location.pathname.includes('/sw-tech-dashboard');
  const isOperationsPreviewRoute = location.pathname === '/operations-preview';
  const isWarehouseReceptionRoute = location.pathname === '/warehouse/reception';
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const swQuery = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const parseIntInRange = (raw: string | null, min: number, max: number): number | null => {
    if (!raw || !/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) return null;
    return value;
  };
  const selectedYear = parseIntInRange(swQuery.get('year'), currentYear - 3, currentYear + 1) ?? currentYear;
  const selectedMonth = parseIntInRange(swQuery.get('month'), 1, 12) ?? currentDate.getMonth() + 1;
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear - 3; y <= currentYear + 1; y += 1) years.push(y);
    return years;
  }, [currentYear]);
  const monthOptions = useMemo(
    () => [
      { value: 1, label: 'Янв' },
      { value: 2, label: 'Фев' },
      { value: 3, label: 'Мар' },
      { value: 4, label: 'Апр' },
      { value: 5, label: 'Май' },
      { value: 6, label: 'Июн' },
      { value: 7, label: 'Июл' },
      { value: 8, label: 'Авг' },
      { value: 9, label: 'Сен' },
      { value: 10, label: 'Окт' },
      { value: 11, label: 'Ноя' },
      { value: 12, label: 'Дек' },
    ],
    [],
  );
  const isHeadKtkVvo = user?.role === 'head_ktk_vvo';
  const isKtkVvoManager = user?.role === 'manager_ktk_vvo' || user?.role === 'head_ktk_vvo';
  const isKtkMowManager = user?.role === 'manager_ktk_mow' || user?.role === 'head_ktk_mow';
  const isKtkDispatchRole = isKtkVvoManager || isKtkMowManager;
  const isHrScheduleRole = user?.role === 'head_hr' || user?.role === 'hr_specialist';
  const isGarageHead = user?.role === 'garage_head' || user?.role === 'garage_head_vvo';
  const isWarehouseStaffScheduleOperator = user?.role === 'warehouse_manager_vvo' || user?.role === 'manager_to';
  const isSecurityHead = user?.role === 'security';
  const isAdmin = canAccessAdmin(user?.role);
  const canUseWorkSchedule = canAccessOperationsPreview(user?.role);
  const canViewPlansMenu = canViewPlans(user?.role) && !isHrScheduleRole && !isGarageHead;
  const canViewVvoSchedule = isAdmin || isHrScheduleRole || isKtkVvoManager;
  const canViewMoscowSchedule = isAdmin || isHrScheduleRole || isKtkMowManager;
  const canViewVvoGarageSchedule = isAdmin || isHrScheduleRole || isGarageHead || isWarehouseStaffScheduleOperator;
  const canViewVvoSecuritySchedule = isAdmin || isHrScheduleRole || isSecurityHead;
  const canViewMoscowGarageSchedule = false;
  const defaultScheduleRoute = isGarageHead
    ? '/operations-preview?location=garage_vvo&section=mechanics'
    : isWarehouseStaffScheduleOperator
      ? '/operations-preview?location=garage_vvo&section=warehouse_staff'
    : isSecurityHead
      ? '/operations-preview?location=security_vvo&section=guards'
    : isKtkMowManager
      ? '/operations-preview?location=ktk_mow&section=containers'
      : '/operations-preview?location=ktk_vvo&section=containers';
  const canOpenContractApproval = canAccessContractApproval(user?.role);
  const canOpenCandidateChecks = canAccessCandidateChecks(user?.role);
  const canOpenBillOfLading = canAccessBillOfLading(user?.role);
  const showBPDashboardMenu = canShowBPDashboardMenu(user?.role);
  const canOpenBusinessProcesses = canOpenContractApproval || canOpenCandidateChecks || canOpenBillOfLading;
  const defaultBusinessProcessRoute = canOpenContractApproval
    ? '/business-processes/contract-approval'
    : canOpenCandidateChecks
      ? '/business-processes/candidate-checks'
      : canOpenBillOfLading
        ? '/business-processes/bill-of-lading'
        : '/business-processes/dashboard';
  const homeRoute = user?.role === 'warehouse_manager'
    || user?.role === 'counterparty_user'
    ? '/warehouse'
    : user?.role === 'warehouse_keeper'
      ? '/warehouse/operations'
    : canViewTechDashboard(user?.role)
    ? '/sw-tech-dashboard'
    : (canViewPlansMenu && canViewPlans(user?.role))
      ? '/plans'
    : canViewBPDashboard(user?.role)
        ? '/business-processes/dashboard'
        : canOpenBusinessProcesses
          ? defaultBusinessProcessRoute
          : defaultScheduleRoute;
  const serviceHealth = useServiceHealth();
  const idleTimeoutRef = useRef<number | null>(null);
  const techPeriodDebounceRef = useRef<number | null>(null);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const runOrConfirmUnsaved = (action: () => void) => {
    if (!getHasUnsavedChanges()) {
      action();
      return;
    }
    setPendingAction(() => action);
    setUnsavedDialogOpen(true);
  };

  const handleNavigate = (to: string) => runOrConfirmUnsaved(() => navigate(to));
  const handleTechPeriodChange = (nextYear: number, nextMonth: number) => {
    if (!isTechDashboardRoute) return;
    if (techPeriodDebounceRef.current) {
      window.clearTimeout(techPeriodDebounceRef.current);
    }
    techPeriodDebounceRef.current = window.setTimeout(() => {
      handleNavigate(`/sw-tech-dashboard?year=${nextYear}&month=${nextMonth}`);
      techPeriodDebounceRef.current = null;
    }, 250);
  };

  useEffect(() => () => {
    if (techPeriodDebounceRef.current) {
      window.clearTimeout(techPeriodDebounceRef.current);
      techPeriodDebounceRef.current = null;
    }
  }, []);

  const handleLogout = () => {
    runOrConfirmUnsaved(() => {
      logout();
      navigate('/login');
    });
  };

  const toggleWorkSubmenuAtContainers = () => {
    const currentSection = new URLSearchParams(location.search).get('section');
    const currentPreviewLocation = new URLSearchParams(location.search).get('location') ?? 'ktk_vvo';
    const targetLocation = isKtkMowManager ? 'ktk_mow' : 'ktk_vvo';
    const shouldOpen = !isWorkSubmenuOpen;
    setIsWorkSubmenuOpen(shouldOpen);
    if (shouldOpen && (location.pathname !== '/operations-preview' || currentSection !== 'containers' || currentPreviewLocation !== targetLocation)) {
      handleNavigate(`/operations-preview?location=${targetLocation}&section=containers`);
    }
  };

  const togglePlansSubmenu = () => {
    const shouldOpen = !isPlansSubmenuOpen;
    setIsPlansSubmenuOpen(shouldOpen);
    if (shouldOpen && !location.pathname.includes('/plans')) {
      handleNavigate('/plans');
    }
  };

  const toggleAdminWorkSubmenu = () => {
    const currentSection = new URLSearchParams(location.search).get('section');
    const currentPreviewLocation = new URLSearchParams(location.search).get('location') ?? 'ktk_vvo';
    const shouldOpen = !isAdminWorkSubmenuOpen;
    setIsAdminWorkSubmenuOpen(shouldOpen);
    if (shouldOpen) {
      if (canViewVvoSchedule) {
        setIsAdminWorkDeptSubmenuOpen(true);
        setIsVvoDispatchSubmenuOpen(true);
        if (location.pathname !== '/operations-preview' || currentSection !== 'containers' || currentPreviewLocation !== 'ktk_vvo') {
          handleNavigate('/operations-preview?location=ktk_vvo&section=containers');
        }
        return;
      }
      if (canViewMoscowSchedule) {
        setIsWorkMoscowSubmenuOpen(true);
        handleNavigate('/operations-preview?location=ktk_mow&section=containers');
        return;
      }
      if (canViewVvoGarageSchedule) {
        setIsWorkGarageSubmenuOpen(true);
        handleNavigate(`/operations-preview?location=garage_vvo&section=${isWarehouseStaffScheduleOperator ? 'warehouse_staff' : 'mechanics'}`);
      }
    }
  };

  const togglePinnedSidebar = () => {
    setIsPinnedOpen((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-pinned-open', String(next));
      return next;
    });
  };

  const calendarIcon = unreadNotesCount > 0 ? (
    <Badge color="error" badgeContent={unreadNotesCount > 9 ? '9+' : unreadNotesCount}>
      <CalendarMonth />
    </Badge>
  ) : (
    <CalendarMonth />
  );

  const dispatchMenuIcon = isHeadKtkVvo ? (
    <SvgIcon viewBox="0 0 24 24" sx={{ fontSize: 24 }}>
      <defs>
        <linearGradient id="csMarkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFB347" />
          <stop offset="100%" stopColor="#FF6A00" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9.5" fill="#111827" />
      <circle cx="12" cy="12" r="7.25" fill="none" stroke="url(#csMarkGradient)" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="#22D3EE" strokeWidth="1.6" />
      <path d="M12 3.6v3.1M12 17.3v3.1M3.6 12h3.1M17.3 12h3.1" stroke="#22D3EE" strokeWidth="1.6" strokeLinecap="round" />
    </SvgIcon>
  ) : isKtkDispatchRole ? (
    <LocalShipping />
  ) : (
    <TableChart />
  );

  const contractUnreadLabel = contractUnreadCount > 99 ? '99+' : contractUnreadCount;
  const contractUnreadPill = (
    <Box
      component="span"
      title={`${contractUnreadCount} новых сообщений в чатах договоров`}
      sx={{
        ml: 1,
        minWidth: 18,
        height: 18,
        px: '5px',
        borderRadius: '999px',
        bgcolor: '#e53935',
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {contractUnreadLabel}
    </Box>
  );

  const menuItems = [
    canAccessWarehouse(user?.role)
      ? {
          key: 'warehouse',
          label: user?.role === 'warehouse_keeper' ? 'Рабочая станция' : 'Склад ТС',
          icon: <Warehouse />,
          onClick: () => handleNavigate(user?.role === 'warehouse_keeper' ? '/warehouse/operations' : '/warehouse'),
          active: location.pathname.startsWith('/warehouse'),
        }
      : null,
    canViewSummary(user?.role)
      ? { key: 'summary', label: 'Сводный отчет', icon: <Assignment />, onClick: () => handleNavigate('/summary-report'), active: location.pathname.includes('/summary') }
      : null,
    canViewCalendar(user?.role)
      ? { key: 'calendar', label: 'Календарь', icon: calendarIcon, onClick: () => handleNavigate('/calendar'), active: location.pathname.includes('/calendar') }
      : null,
    canAccessAdmin(user?.role)
      ? { key: 'admin', label: 'Администрирование', icon: <People />, onClick: () => handleNavigate('/admin'), active: location.pathname.includes('/admin') }
      : null,
    { key: 'settings', label: 'Настройки', icon: <Settings />, onClick: () => handleNavigate('/settings'), active: location.pathname.includes('/settings') },
    { key: 'logout', label: 'Выход', icon: <Logout />, onClick: handleLogout, active: false },
  ].filter(Boolean) as Array<{ key: string; label: string; icon: JSX.Element; onClick: () => void; active: boolean }>;

  useEffect(() => {
    const loadTitle = async () => {
      try {
        const response = await getRuntimeAppSettings();
        const title = response?.data?.appTitle;
        if (typeof title === 'string' && title.trim().length > 0) {
          setAppTitle(title.trim());
        }
      } catch {
        // fallback title already set
      }
    };
    loadTitle();
  }, []);

  useEffect(() => {
    if (!user?.id || !canViewCalendar(user.role)) {
      stopUnreadSync();
      return;
    }
    startUnreadSync(user.id);
    return () => {
      stopUnreadSync();
    };
  }, [user?.id, user?.role, startUnreadSync, stopUnreadSync]);

  useEffect(() => {
    if (!user?.id || !canAccessContractApproval(user.role)) {
      stopContractUnreadSync();
      return;
    }
    startContractUnreadSync(user.id);
    return () => {
      stopContractUnreadSync();
    };
  }, [user?.id, user?.role, startContractUnreadSync, stopContractUnreadSync]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const updateActivity = () => {
      const now = Date.now();
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    };

    const scheduleIdleCheck = () => {
      if (idleTimeoutRef.current) {
        window.clearTimeout(idleTimeoutRef.current);
      }
      const lastRaw = localStorage.getItem(LAST_ACTIVITY_KEY);
      const last = lastRaw ? Number(lastRaw) : Date.now();
      const remaining = Math.max(0, IDLE_TIMEOUT_MS - (Date.now() - last));
      idleTimeoutRef.current = window.setTimeout(() => {
        logout();
        navigate('/login');
      }, remaining);
    };

    const handleActivity = () => {
      updateActivity();
      scheduleIdleCheck();
    };

    const lastRaw = localStorage.getItem(LAST_ACTIVITY_KEY);
    const last = lastRaw ? Number(lastRaw) : Date.now();
    if (Date.now() - last >= IDLE_TIMEOUT_MS) {
      logout();
      navigate('/login');
      return;
    }

    scheduleIdleCheck();
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));

    return () => {
      if (idleTimeoutRef.current) {
        window.clearTimeout(idleTimeoutRef.current);
      }
      events.forEach((event) => window.removeEventListener(event, handleActivity));
    };
  }, [user, logout, navigate]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_SUBMENUS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        plans: boolean;
        work: boolean;
        adminWork: boolean;
        adminWorkDept: boolean;
        vvoDispatch: boolean;
        workMoscow: boolean;
        moscowDispatch: boolean;
        workGarage: boolean;
        moscowGarage: boolean;
        businessProcess: boolean;
      }>;
      if (typeof parsed.plans === 'boolean') setIsPlansSubmenuOpen(parsed.plans);
      if (typeof parsed.work === 'boolean') setIsWorkSubmenuOpen(parsed.work);
      if (typeof parsed.adminWork === 'boolean') setIsAdminWorkSubmenuOpen(parsed.adminWork);
      if (typeof parsed.adminWorkDept === 'boolean') setIsAdminWorkDeptSubmenuOpen(parsed.adminWorkDept);
      if (typeof parsed.vvoDispatch === 'boolean') setIsVvoDispatchSubmenuOpen(parsed.vvoDispatch);
      if (typeof parsed.workMoscow === 'boolean') setIsWorkMoscowSubmenuOpen(parsed.workMoscow);
      if (typeof parsed.moscowDispatch === 'boolean') setIsMoscowDispatchSubmenuOpen(parsed.moscowDispatch);
      if (typeof parsed.workGarage === 'boolean') setIsWorkGarageSubmenuOpen(parsed.workGarage);
      if (typeof parsed.moscowGarage === 'boolean') setIsMoscowGarageSubmenuOpen(parsed.moscowGarage);
      if (typeof parsed.businessProcess === 'boolean') setIsBusinessProcessSubmenuOpen(parsed.businessProcess);
    } catch {
      // ignore invalid persisted submenu state
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        SIDEBAR_SUBMENUS_KEY,
        JSON.stringify({
          plans: isPlansSubmenuOpen,
          work: isWorkSubmenuOpen,
          adminWork: isAdminWorkSubmenuOpen,
          adminWorkDept: isAdminWorkDeptSubmenuOpen,
          vvoDispatch: isVvoDispatchSubmenuOpen,
          workMoscow: isWorkMoscowSubmenuOpen,
          moscowDispatch: isMoscowDispatchSubmenuOpen,
          workGarage: isWorkGarageSubmenuOpen,
          moscowGarage: isMoscowGarageSubmenuOpen,
          businessProcess: isBusinessProcessSubmenuOpen,
        }),
      );
    } catch {
      // ignore localStorage write issues
    }
  }, [
    isPlansSubmenuOpen,
    isWorkSubmenuOpen,
    isAdminWorkSubmenuOpen,
    isAdminWorkDeptSubmenuOpen,
    isVvoDispatchSubmenuOpen,
    isWorkMoscowSubmenuOpen,
    isMoscowDispatchSubmenuOpen,
    isWorkGarageSubmenuOpen,
    isMoscowGarageSubmenuOpen,
    isBusinessProcessSubmenuOpen,
  ]);


  const closeUnsavedDialog = () => {
    if (processingUnsavedAction) return;
    setUnsavedDialogOpen(false);
    setPendingAction(null);
  };

  const handleDiscardAndContinue = () => {
    const action = pendingAction;
    const handlers = getUnsavedHandlers();
    handlers?.discard?.();
    setHasUnsavedChanges(false);
    setUnsavedDialogOpen(false);
    setPendingAction(null);
    action?.();
  };

  const handleSaveAndContinue = async () => {
    const action = pendingAction;
    if (!action) return;
    const handlers = getUnsavedHandlers();
    if (!handlers?.save) {
      setHasUnsavedChanges(false);
      setUnsavedDialogOpen(false);
      setPendingAction(null);
      action();
      return;
    }

    try {
      setProcessingUnsavedAction(true);
      const ok = await handlers.save();
      if (!ok) return;
      setHasUnsavedChanges(false);
      setUnsavedDialogOpen(false);
      setPendingAction(null);
      action();
    } finally {
      setProcessingUnsavedAction(false);
    }
  };

  const drawer = (
    <Box>
      <Toolbar sx={{ justifyContent: isPinnedOpen ? 'space-between' : 'center', py: 2, px: 1.5 }}>
        <Box
          onClick={() => handleNavigate(homeRoute)}
          sx={{
            minWidth: 0,
            flexGrow: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {isPinnedOpen ? (
            <Typography variant="h6" noWrap>
              {appTitle}
            </Typography>
          ) : (
            <Typography variant="h6" noWrap>
              ЛО
            </Typography>
          )}
        </Box>
        <IconButton onClick={togglePinnedSidebar} size="small" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
          {isPinnedOpen ? <ChevronLeft /> : <ChevronRight />}
        </IconButton>
      </Toolbar>
      <Divider />
      <List>
        {showBPDashboardMenu && (
          <ListItem disablePadding key="bp-dashboard">
            <Tooltip title={!isPinnedOpen ? 'Дашборд' : ''} placement="right">
              <ListItemButton
                selected={location.pathname === '/business-processes/dashboard'}
                onClick={() => handleNavigate('/business-processes/dashboard')}
              >
                <ListItemIcon sx={{ minWidth: isPinnedOpen ? 40 : 0, justifyContent: 'center' }}>
                  <SpaceDashboard />
                </ListItemIcon>
                {isPinnedOpen && <ListItemText primary="Дашборд" />}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        )}
        {canViewPlansMenu && (
        <ListItem disablePadding key="plans">
          <Tooltip title={!isPinnedOpen ? (isKtkDispatchRole ? 'Диспетчерский отдел' : 'Показатели') : ''} placement="right">
            <ListItemButton
              selected={
                location.pathname.includes('/plans') ||
                location.pathname === '/' ||
                (isKtkDispatchRole && location.pathname.includes('/operations-preview')) ||
                (canViewEfficiency &&
                  location.pathname === '/operations-preview' &&
                  location.search.includes('section=efficiency'))
              }
              onClick={togglePlansSubmenu}
            >
              <ListItemIcon sx={{ minWidth: isPinnedOpen ? 40 : 0, justifyContent: 'center' }}>
                {dispatchMenuIcon}
              </ListItemIcon>
              {isPinnedOpen && <ListItemText primary={isKtkDispatchRole ? 'Диспетчерский отдел' : 'Показатели'} />}
              {isPinnedOpen ? (isPlansSubmenuOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />) : null}
            </ListItemButton>
          </Tooltip>
        </ListItem>
        )}
        {canViewPlansMenu && isPinnedOpen && isPlansSubmenuOpen && (
          <>
            <ListItem disablePadding sx={{ pl: 4 }}>
                <ListItemButton
                  selected={location.pathname === '/plans'}
                  onClick={() => handleNavigate('/plans')}
                  sx={{ py: 0.5, minHeight: 34 }}
                >
                <ListItemText primary="Ежедневный отчет" primaryTypographyProps={{ fontSize: 14 }} />
                </ListItemButton>
              </ListItem>
            {canViewTotals && (
              <ListItem disablePadding sx={{ pl: 4 }}>
                <ListItemButton
                  selected={location.pathname === '/plans/totals'}
                  onClick={() => handleNavigate('/plans/totals')}
                  sx={{ py: 0.5, minHeight: 34 }}
                >
                  <ListItemText primary="Операционный отчет" primaryTypographyProps={{ fontSize: 14 }} />
                </ListItemButton>
              </ListItem>
            )}
            {isKtkDispatchRole && !isAdmin && (
              <>
                <ListItem disablePadding sx={{ pl: 4 }}>
                <ListItemButton
                  selected={location.pathname.startsWith('/operations-preview')}
                  onClick={toggleWorkSubmenuAtContainers}
                  sx={{ py: 0.5, minHeight: 34 }}
                >
                  <ListItemText
                    primary="График работы"
                    primaryTypographyProps={{ fontSize: 14 }}
                  />
                  {isWorkSubmenuOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                </ListItemButton>
              </ListItem>
              {isWorkSubmenuOpen && (
                <>
                    <ListItem disablePadding sx={{ pl: 6 }}>
                      <ListItemButton
                        selected={location.pathname === '/operations-preview' && location.search.includes('section=containers') && (isKtkMowManager ? location.search.includes('location=ktk_mow') : !location.search.includes('location=ktk_mow') && !location.search.includes('location=garage'))}
                        onClick={() => handleNavigate(`/operations-preview?location=${isKtkMowManager ? 'ktk_mow' : 'ktk_vvo'}&section=containers`)}
                        sx={{ py: 0.5, minHeight: 32 }}
                      >
                        <ListItemText primary="Контейнеровозы" primaryTypographyProps={{ fontSize: 13 }} />
                      </ListItemButton>
                    </ListItem>
                    {isKtkVvoManager && (
                    <ListItem disablePadding sx={{ pl: 6 }}>
                      <ListItemButton
                        selected={location.pathname === '/operations-preview' && location.search.includes('section=auto') && !location.search.includes('location=ktk_mow') && !location.search.includes('location=garage')}
                        onClick={() => handleNavigate('/operations-preview?location=ktk_vvo&section=auto')}
                        sx={{ py: 0.5, minHeight: 32 }}
                      >
                        <ListItemText primary="Автовозы" primaryTypographyProps={{ fontSize: 13 }} />
                      </ListItemButton>
                    </ListItem>
                    )}
                    <ListItem disablePadding sx={{ pl: 6 }}>
                      <ListItemButton
                        selected={location.pathname === '/operations-preview' && location.search.includes('section=dispatchers') && (isKtkMowManager ? location.search.includes('location=ktk_mow') : !location.search.includes('location=ktk_mow') && !location.search.includes('location=garage'))}
                        onClick={() => handleNavigate(`/operations-preview?location=${isKtkMowManager ? 'ktk_mow' : 'ktk_vvo'}&section=dispatchers`)}
                        sx={{ py: 0.5, minHeight: 32 }}
                      >
                        <ListItemText primary="Диспетчера" primaryTypographyProps={{ fontSize: 13 }} />
                      </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding sx={{ pl: 6 }}>
                      <ListItemButton
                        selected={location.pathname === '/operations-preview' && location.search.includes('section=couriers') && (isKtkMowManager ? location.search.includes('location=ktk_mow') : !location.search.includes('location=ktk_mow') && !location.search.includes('location=garage'))}
                        onClick={() => handleNavigate(`/operations-preview?location=${isKtkMowManager ? 'ktk_mow' : 'ktk_vvo'}&section=couriers`)}
                        sx={{ py: 0.5, minHeight: 32 }}
                      >
                        <ListItemText primary={isKtkMowManager ? 'Механики' : 'Оперативники'} primaryTypographyProps={{ fontSize: 13 }} />
                      </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding sx={{ pl: 6 }}>
                      <ListItemButton
                        selected={location.pathname === '/operations-preview' && location.search.includes('section=efficiency') && (isKtkMowManager ? location.search.includes('location=ktk_mow') : !location.search.includes('location=ktk_mow'))}
                        onClick={() => handleNavigate(`/operations-preview?location=${isKtkMowManager ? 'ktk_mow' : 'ktk_vvo'}&section=efficiency`)}
                        sx={{ py: 0.5, minHeight: 32 }}
                      >
                        <ListItemText primary="Эффективность" primaryTypographyProps={{ fontSize: 13 }} />
                      </ListItemButton>
                    </ListItem>
                  </>
                )}
              </>
            )}
            {canViewFinancial && (
              <ListItem disablePadding sx={{ pl: 4 }}>
                <ListItemButton
                  selected={location.pathname === '/plans/financial'}
                  onClick={() => handleNavigate('/plans/financial')}
                  sx={{ py: 0.5, minHeight: 34 }}
                >
                  <ListItemText primary="Валовая прибыль, план" primaryTypographyProps={{ fontSize: 14 }} />
                </ListItemButton>
              </ListItem>
            )}
            {canViewEfficiency && (
              <ListItem disablePadding sx={{ pl: 4 }}>
                <ListItemButton
                  selected={location.pathname === '/operations-preview' && location.search.includes('section=efficiency')}
                  onClick={() => handleNavigate('/operations-preview?location=ktk_vvo&section=efficiency')}
                  sx={{ py: 0.5, minHeight: 34 }}
                >
                  <ListItemText primary="Эффективность" primaryTypographyProps={{ fontSize: 14 }} />
                </ListItemButton>
              </ListItem>
            )}
          </>
        )}
        {canUseWorkSchedule && (isAdmin || isHrScheduleRole || isGarageHead || isWarehouseStaffScheduleOperator || isSecurityHead) && (
          <>
            <ListItem disablePadding>
              <Tooltip title={!isPinnedOpen ? 'График работы' : ''} placement="right">
                <ListItemButton
                  selected={location.pathname === '/operations-preview'}
                  onClick={toggleAdminWorkSubmenu}
                >
                  <ListItemIcon sx={{ minWidth: isPinnedOpen ? 40 : 0, justifyContent: 'center' }}>
                    <FactCheck />
                  </ListItemIcon>
                  {isPinnedOpen && <ListItemText primary="График работы" />}
                  {isPinnedOpen ? (isAdminWorkSubmenuOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />) : null}
                </ListItemButton>
              </Tooltip>
            </ListItem>

            {isPinnedOpen && isAdminWorkSubmenuOpen && (
              <>
                {(canViewVvoSchedule || canViewVvoGarageSchedule || canViewVvoSecuritySchedule) && (
                  <>
                    <ListItem disablePadding sx={{ pl: 4 }}>
                      <ListItemButton
                        selected={location.pathname === '/operations-preview' && !location.search.includes('location=ktk_mow') && !location.search.includes('location=garage_mow')}
                        onClick={() => {
                          setIsAdminWorkDeptSubmenuOpen((prev) => !prev);
                          if (canViewVvoSchedule && location.pathname !== '/operations-preview') {
                            handleNavigate('/operations-preview?location=ktk_vvo&section=containers');
                          }
                        }}
                        sx={{ py: 0.5, minHeight: 34 }}
                      >
                        <ListItemText primary="Владивосток" primaryTypographyProps={{ fontSize: 14 }} />
                        {isAdminWorkDeptSubmenuOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                      </ListItemButton>
                    </ListItem>

                    {isAdminWorkDeptSubmenuOpen && (
                      <>
                        {canViewVvoSchedule && (
                          <>
                            <ListItem disablePadding sx={{ pl: 6 }}>
                              <ListItemButton
                                selected={location.pathname === '/operations-preview' && location.search.includes('location=ktk_vvo') && ['containers', 'auto', 'dispatchers', 'couriers', 'efficiency'].some((section) => location.search.includes(`section=${section}`))}
                                onClick={() => setIsVvoDispatchSubmenuOpen((prev) => !prev)}
                                sx={{ py: 0.5, minHeight: 32 }}
                              >
                                <ListItemText primary="Диспетчерский отдел" primaryTypographyProps={{ fontSize: 13 }} />
                                {isVvoDispatchSubmenuOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                              </ListItemButton>
                            </ListItem>
                            {isVvoDispatchSubmenuOpen && (
                              <>
                                <ListItem disablePadding sx={{ pl: 8 }}>
                                  <ListItemButton
                                    selected={location.pathname === '/operations-preview' && location.search.includes('location=ktk_vvo') && location.search.includes('section=containers')}
                                    onClick={() => handleNavigate('/operations-preview?location=ktk_vvo&section=containers')}
                                    sx={{ py: 0.5, minHeight: 30 }}
                                  >
                                    <ListItemText primary="Контейнеровозы" primaryTypographyProps={{ fontSize: 13 }} />
                                  </ListItemButton>
                                </ListItem>
                                <ListItem disablePadding sx={{ pl: 8 }}>
                                  <ListItemButton
                                    selected={location.pathname === '/operations-preview' && location.search.includes('location=ktk_vvo') && location.search.includes('section=auto')}
                                    onClick={() => handleNavigate('/operations-preview?location=ktk_vvo&section=auto')}
                                    sx={{ py: 0.5, minHeight: 30 }}
                                  >
                                    <ListItemText primary="Автовозы" primaryTypographyProps={{ fontSize: 13 }} />
                                  </ListItemButton>
                                </ListItem>
                                <ListItem disablePadding sx={{ pl: 8 }}>
                                  <ListItemButton
                                    selected={location.pathname === '/operations-preview' && location.search.includes('location=ktk_vvo') && location.search.includes('section=dispatchers')}
                                    onClick={() => handleNavigate('/operations-preview?location=ktk_vvo&section=dispatchers')}
                                    sx={{ py: 0.5, minHeight: 30 }}
                                  >
                                    <ListItemText primary="Диспетчера" primaryTypographyProps={{ fontSize: 13 }} />
                                  </ListItemButton>
                                </ListItem>
                                <ListItem disablePadding sx={{ pl: 8 }}>
                                  <ListItemButton
                                    selected={location.pathname === '/operations-preview' && location.search.includes('location=ktk_vvo') && location.search.includes('section=couriers')}
                                    onClick={() => handleNavigate('/operations-preview?location=ktk_vvo&section=couriers')}
                                    sx={{ py: 0.5, minHeight: 30 }}
                                  >
                                    <ListItemText primary="Оперативники" primaryTypographyProps={{ fontSize: 13 }} />
                                  </ListItemButton>
                                </ListItem>
                                {isAdmin && (
                                  <ListItem disablePadding sx={{ pl: 8 }}>
                                    <ListItemButton
                                      selected={location.pathname === '/operations-preview' && location.search.includes('location=ktk_vvo') && location.search.includes('section=efficiency')}
                                      onClick={() => handleNavigate('/operations-preview?location=ktk_vvo&section=efficiency')}
                                      sx={{ py: 0.5, minHeight: 30 }}
                                    >
                                      <ListItemText primary="Эффективность" primaryTypographyProps={{ fontSize: 13 }} />
                                    </ListItemButton>
                                  </ListItem>
                                )}
                              </>
                            )}
                          </>
                        )}

                        {canViewVvoGarageSchedule && (
                          <>
                            <ListItem disablePadding sx={{ pl: 6 }}>
                              <ListItemButton
                                selected={location.pathname === '/operations-preview' && location.search.includes('location=garage_vvo')}
                                onClick={() => setIsWorkGarageSubmenuOpen((prev) => !prev)}
                                sx={{ py: 0.5, minHeight: 32 }}
                              >
                                <ListItemText primary="Гараж" primaryTypographyProps={{ fontSize: 13 }} />
                                {isWorkGarageSubmenuOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                              </ListItemButton>
                            </ListItem>
                            {isWorkGarageSubmenuOpen && (
                              <>
                                {!isWarehouseStaffScheduleOperator && (
                                  <ListItem disablePadding sx={{ pl: 8 }}>
                                    <ListItemButton
                                      selected={location.pathname === '/operations-preview' && location.search.includes('location=garage_vvo') && location.search.includes('section=mechanics')}
                                      onClick={() => handleNavigate('/operations-preview?location=garage_vvo&section=mechanics')}
                                      sx={{ py: 0.5, minHeight: 30 }}
                                    >
                                      <ListItemText primary="Автослесарь" primaryTypographyProps={{ fontSize: 13 }} />
                                    </ListItemButton>
                                  </ListItem>
                                )}
                                {!isGarageHead && (
                                  <ListItem disablePadding sx={{ pl: 8 }}>
                                    <ListItemButton
                                      selected={location.pathname === '/operations-preview' && location.search.includes('location=garage_vvo') && location.search.includes('section=warehouse_staff')}
                                      onClick={() => handleNavigate('/operations-preview?location=garage_vvo&section=warehouse_staff')}
                                      sx={{ py: 0.5, minHeight: 30 }}
                                    >
                                      <ListItemText primary="Сотрудник склада" primaryTypographyProps={{ fontSize: 13 }} />
                                    </ListItemButton>
                                  </ListItem>
                                )}
                              </>
                            )}
                          </>
                        )}

                        {canViewVvoSecuritySchedule && (
                          <>
                            <ListItem disablePadding sx={{ pl: 6 }}>
                              <ListItemButton
                                selected={location.pathname === '/operations-preview' && location.search.includes('location=security_vvo')}
                                onClick={() => setIsWorkSecuritySubmenuOpen((prev) => !prev)}
                                sx={{ py: 0.5, minHeight: 32 }}
                              >
                                <ListItemText primary="Служба Безопасности" primaryTypographyProps={{ fontSize: 13 }} />
                                {isWorkSecuritySubmenuOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                              </ListItemButton>
                            </ListItem>
                            {isWorkSecuritySubmenuOpen && (
                              <ListItem disablePadding sx={{ pl: 8 }}>
                                <ListItemButton
                                  selected={location.pathname === '/operations-preview' && location.search.includes('location=security_vvo') && location.search.includes('section=guards')}
                                  onClick={() => handleNavigate('/operations-preview?location=security_vvo&section=guards')}
                                  sx={{ py: 0.5, minHeight: 30 }}
                                >
                                  <ListItemText primary="Сотрудник охраны" primaryTypographyProps={{ fontSize: 13 }} />
                                </ListItemButton>
                              </ListItem>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </>
                )}

                {(canViewMoscowSchedule || canViewMoscowGarageSchedule) && (
                  <>
                    <ListItem disablePadding sx={{ pl: 4 }}>
                      <ListItemButton
                        selected={location.pathname === '/operations-preview' && (location.search.includes('location=ktk_mow') || location.search.includes('location=garage_mow'))}
                        onClick={() => {
                          setIsWorkMoscowSubmenuOpen((prev) => !prev);
                          if (canViewMoscowSchedule && location.pathname !== '/operations-preview') {
                            handleNavigate('/operations-preview?location=ktk_mow&section=containers');
                          }
                        }}
                        sx={{ py: 0.5, minHeight: 34 }}
                      >
                        <ListItemText primary="Москва" primaryTypographyProps={{ fontSize: 14 }} />
                        {isWorkMoscowSubmenuOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                      </ListItemButton>
                    </ListItem>

                    {isWorkMoscowSubmenuOpen && (
                      <>
                        {canViewMoscowSchedule && (
                          <>
                            <ListItem disablePadding sx={{ pl: 6 }}>
                              <ListItemButton
                                selected={location.pathname === '/operations-preview' && location.search.includes('location=ktk_mow')}
                                onClick={() => setIsMoscowDispatchSubmenuOpen((prev) => !prev)}
                                sx={{ py: 0.5, minHeight: 32 }}
                              >
                                <ListItemText primary="Диспетчерский отдел" primaryTypographyProps={{ fontSize: 13 }} />
                                {isMoscowDispatchSubmenuOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                              </ListItemButton>
                            </ListItem>
                            {isMoscowDispatchSubmenuOpen && (
                              <>
                                <ListItem disablePadding sx={{ pl: 8 }}>
                                  <ListItemButton
                                    selected={location.pathname === '/operations-preview' && location.search.includes('location=ktk_mow') && location.search.includes('section=containers')}
                                    onClick={() => handleNavigate('/operations-preview?location=ktk_mow&section=containers')}
                                    sx={{ py: 0.5, minHeight: 30 }}
                                  >
                                    <ListItemText primary="Контейнеровозы" primaryTypographyProps={{ fontSize: 13 }} />
                                  </ListItemButton>
                                </ListItem>
                                <ListItem disablePadding sx={{ pl: 8 }}>
                                  <ListItemButton
                                    selected={location.pathname === '/operations-preview' && location.search.includes('location=ktk_mow') && location.search.includes('section=dispatchers')}
                                    onClick={() => handleNavigate('/operations-preview?location=ktk_mow&section=dispatchers')}
                                    sx={{ py: 0.5, minHeight: 30 }}
                                  >
                                    <ListItemText primary="Диспетчера" primaryTypographyProps={{ fontSize: 13 }} />
                                  </ListItemButton>
                                </ListItem>
                                <ListItem disablePadding sx={{ pl: 8 }}>
                                  <ListItemButton
                                    selected={location.pathname === '/operations-preview' && location.search.includes('location=ktk_mow') && location.search.includes('section=couriers')}
                                    onClick={() => handleNavigate('/operations-preview?location=ktk_mow&section=couriers')}
                                    sx={{ py: 0.5, minHeight: 30 }}
                                  >
                                    <ListItemText primary="Механики" primaryTypographyProps={{ fontSize: 13 }} />
                                  </ListItemButton>
                                </ListItem>
                                {isAdmin && (
                                  <ListItem disablePadding sx={{ pl: 8 }}>
                                    <ListItemButton
                                      selected={location.pathname === '/operations-preview' && location.search.includes('location=ktk_mow') && location.search.includes('section=efficiency')}
                                      onClick={() => handleNavigate('/operations-preview?location=ktk_mow&section=efficiency')}
                                      sx={{ py: 0.5, minHeight: 30 }}
                                    >
                                      <ListItemText primary="Эффективность" primaryTypographyProps={{ fontSize: 13 }} />
                                    </ListItemButton>
                                  </ListItem>
                                )}
                              </>
                            )}
                          </>
                        )}

                        {canViewMoscowGarageSchedule && (
                          <>
                            <ListItem disablePadding sx={{ pl: 6 }}>
                              <ListItemButton
                                selected={location.pathname === '/operations-preview' && location.search.includes('location=garage_mow')}
                                onClick={() => setIsMoscowGarageSubmenuOpen((prev) => !prev)}
                                sx={{ py: 0.5, minHeight: 32 }}
                              >
                                <ListItemText primary="Гараж" primaryTypographyProps={{ fontSize: 13 }} />
                                {isMoscowGarageSubmenuOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                              </ListItemButton>
                            </ListItem>
                            {isMoscowGarageSubmenuOpen && (
                              <ListItem disablePadding sx={{ pl: 8 }}>
                                <ListItemButton
                                  selected={location.pathname === '/operations-preview' && location.search.includes('location=garage_mow') && location.search.includes('section=mechanics')}
                                  onClick={() => handleNavigate('/operations-preview?location=garage_mow&section=mechanics')}
                                  sx={{ py: 0.5, minHeight: 30 }}
                                >
                                  <ListItemText primary="Автослесарь" primaryTypographyProps={{ fontSize: 13 }} />
                                </ListItemButton>
                              </ListItem>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
                {(isAdmin || isHrScheduleRole) && (
                  <ListItem disablePadding sx={{ pl: 4 }}>
                    <ListItemButton
                      selected={location.pathname === '/operations-preview/reports'}
                      onClick={() => handleNavigate('/operations-preview/reports')}
                      sx={{ py: 0.5, minHeight: 34 }}
                    >
                      <ListItemText primary="Отчеты" primaryTypographyProps={{ fontSize: 14 }} />
                    </ListItemButton>
                  </ListItem>
                )}
              </>
            )}
          </>
        )}
        {canOpenBusinessProcesses && (
          <>
            <ListItem disablePadding>
              <Tooltip title={!isPinnedOpen ? 'Бизнес процесс' : ''} placement="right">
                <ListItemButton
                  selected={location.pathname.startsWith('/business-processes') && location.pathname !== '/business-processes/dashboard'}
                  onClick={() => {
                    const nextOpen = !isBusinessProcessSubmenuOpen;
                    setIsBusinessProcessSubmenuOpen(nextOpen);
                    if (nextOpen && !location.pathname.startsWith('/business-processes')) {
                      handleNavigate(defaultBusinessProcessRoute);
                    }
                  }}
                >
                  <ListItemIcon sx={{ minWidth: isPinnedOpen ? 40 : 0, justifyContent: 'center' }}>
                    <Badge
                      color="error"
                      badgeContent={contractUnreadLabel}
                      invisible={isPinnedOpen || contractUnreadCount <= 0}
                    >
                      <AccountTree />
                    </Badge>
                  </ListItemIcon>
                  {isPinnedOpen && <ListItemText primary="Бизнес процесс" />}
                  {isPinnedOpen && contractUnreadCount > 0 && !isBusinessProcessSubmenuOpen && contractUnreadPill}
                  {isPinnedOpen ? (isBusinessProcessSubmenuOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />) : null}
                </ListItemButton>
              </Tooltip>
            </ListItem>
            {isPinnedOpen && isBusinessProcessSubmenuOpen && (
              <>
                {canOpenContractApproval && (
                  <ListItem disablePadding sx={{ pl: 4 }}>
                    <ListItemButton
                      selected={location.pathname === '/business-processes/contract-approval'}
                      onClick={() => handleNavigate('/business-processes/contract-approval')}
                      sx={{ py: 0.5, minHeight: 34 }}
                    >
                      <ListItemText primary="Согласование договоров" primaryTypographyProps={{ fontSize: 14 }} />
                      {contractUnreadCount > 0 && contractUnreadPill}
                    </ListItemButton>
                  </ListItem>
                )}
                {canOpenCandidateChecks && (
                  <ListItem disablePadding sx={{ pl: 4 }}>
                    <ListItemButton
                      selected={location.pathname === '/business-processes/candidate-checks'}
                      onClick={() => handleNavigate('/business-processes/candidate-checks')}
                      sx={{ py: 0.5, minHeight: 34 }}
                    >
                      <ListItemText primary="Проверка кандидатов" primaryTypographyProps={{ fontSize: 14 }} />
                    </ListItemButton>
                  </ListItem>
                )}
                {canOpenBillOfLading && (
                  <ListItem disablePadding sx={{ pl: 4 }}>
                    <ListItemButton
                      selected={location.pathname === '/business-processes/bill-of-lading'}
                      onClick={() => handleNavigate('/business-processes/bill-of-lading')}
                      sx={{ py: 0.5, minHeight: 34 }}
                    >
                      <ListItemText primary="Коносамент" primaryTypographyProps={{ fontSize: 14 }} />
                    </ListItemButton>
                  </ListItem>
                )}
              </>
            )}
          </>
        )}
        {menuItems.map((item) => (
          <ListItem disablePadding key={item.key}>
            <Tooltip title={!isPinnedOpen ? item.label : ''} placement="right">
              <ListItemButton selected={item.active} onClick={item.onClick}>
                <ListItemIcon sx={{ minWidth: isPinnedOpen ? 40 : 0, justifyContent: 'center' }}>{item.icon}</ListItemIcon>
                {isPinnedOpen && <ListItemText primary={item.label} />}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          {!isTechDashboardRoute && (
            <Typography
              variant="h6"
              noWrap
              onClick={isOperationsPreviewRoute ? undefined : () => handleNavigate(homeRoute)}
              sx={{ flexGrow: 1, cursor: isOperationsPreviewRoute ? 'default' : 'pointer' }}
            >
              {(location.pathname === '/' || location.pathname.includes('/plans') || location.pathname.includes('/operations-preview')) &&
                (canUseWorkSchedule
                  ? (location.pathname === '/operations-preview' && location.search.includes('section=containers')
                      ? 'График работы - Контейнеровозы'
                      : location.pathname === '/operations-preview/reports'
                      ? 'График работы - Отчеты'
                      : location.pathname === '/operations-preview' && location.search.includes('section=auto')
                      ? 'График работы - Автовозы'
                      : location.pathname === '/operations-preview' && location.search.includes('section=dispatchers')
                      ? 'График работы - Диспетчера'
                      : location.pathname === '/operations-preview' && location.search.includes('section=couriers')
                      ? location.search.includes('location=ktk_mow') ? 'График работы - Механики' : 'График работы - Оперативники'
                      : location.pathname === '/operations-preview' && location.search.includes('section=mechanics')
                      ? 'График работы - Автослесарь'
                      : location.pathname === '/operations-preview' && location.search.includes('section=warehouse_staff')
                      ? 'График работы - Сотрудник склада'
                      : location.pathname === '/operations-preview' && location.search.includes('section=guards')
                      ? 'График работы - Сотрудник охраны'
                      : location.pathname === '/operations-preview' && location.search.includes('section=efficiency')
                      ? 'График работы - Эффективность'
                      : location.pathname === '/plans/totals'
                      ? 'Операционный отчет'
                      : (location.pathname === '/' || location.pathname === '/plans'
                          ? 'Ежедневный отчет'
                          : 'Показатели'))
                  : 'Показатели')}
              {location.pathname.includes('/summary-report') && 'Сводный отчет'}
              {location.pathname.includes('/admin') && 'Администрирование'}
              {location.pathname.includes('/business-processes/contract-approval') && 'Согласование договоров'}
              {location.pathname.includes('/business-processes/candidate-checks') && 'Проверка кандидатов'}
              {location.pathname.includes('/business-processes/bill-of-lading') && 'Коносамент'}
              {location.pathname.includes('/business-processes/dashboard') && 'Дашборд'}
              {location.pathname.startsWith('/warehouse') && 'Склад ТС'}
              {location.pathname.includes('/settings') && 'Настройки'}
            </Typography>
          )}
          {isTechDashboardRoute && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 0, mr: 'auto' }}>
              <FormControl size="small" variant="outlined" sx={{ minWidth: 100 }}>
                <Select
                  value={selectedYear}
                  onChange={(event) => handleTechPeriodChange(Number(event.target.value), selectedMonth)}
                  displayEmpty
                  sx={{
                    color: '#fff',
                    height: 36,
                    fontSize: 16,
                    borderRadius: '8px',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.45)' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.75)' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#fff' },
                    '& .MuiSelect-icon': { color: '#fff' },
                  }}
                >
                  {yearOptions.map((yearOption) => (
                    <MenuItem key={yearOption} value={yearOption}>{yearOption}</MenuItem>
                  ))}
                </Select>
                <Typography
                  component="span"
                  sx={{
                    position: 'absolute',
                    top: -10,
                    left: 12,
                    px: 0.5,
                    fontSize: 10,
                    lineHeight: 1,
                    color: 'rgba(255,255,255,0.9)',
                    backgroundColor: 'primary.main',
                    pointerEvents: 'none',
                  }}
                >
                  Год
                </Typography>
              </FormControl>
              <FormControl size="small" variant="outlined" sx={{ minWidth: 136 }}>
                <Select
                  value={selectedMonth}
                  onChange={(event) => handleTechPeriodChange(selectedYear, Number(event.target.value))}
                  sx={{
                    color: '#fff',
                    height: 36,
                    fontSize: 16,
                    borderRadius: '8px',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.45)' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.75)' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#fff' },
                    '& .MuiSelect-icon': { color: '#fff' },
                  }}
                >
                  {monthOptions.map((item) => (
                    <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                  ))}
                </Select>
                <Typography
                  component="span"
                  sx={{
                    position: 'absolute',
                    top: -10,
                    left: 12,
                    px: 0.5,
                    fontSize: 10,
                    lineHeight: 1,
                    color: 'rgba(255,255,255,0.9)',
                    backgroundColor: 'primary.main',
                    pointerEvents: 'none',
                  }}
                >
                  Месяц
                </Typography>
              </FormControl>
            </Box>
          )}
          <Typography variant="body2">{user?.fullName}</Typography>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: isTechDashboardRoute ? { xs: 0, sm: 0 } : { xs: 0.75, sm: 1 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          boxSizing: 'border-box',
          overflowX: isTechDashboardRoute
            ? 'hidden'
            : isWarehouseReceptionRoute
              ? 'visible'
              : 'auto',
          overflowY: isTechDashboardRoute
            ? 'hidden'
            : isWarehouseReceptionRoute
              ? 'visible'
              : 'auto',
        }}
      >
        <Toolbar />
        <Collapse in={serviceHealth.isUnavailable} unmountOnExit>
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            action={(
              <Box display="flex" alignItems="center" gap={1}>
                <Button color="inherit" size="small" onClick={() => serviceHealth.checkNow()}>
                  Повторить
                </Button>
                {isAdmin && (
                  <Button color="inherit" size="small" onClick={() => serviceHealth.checkNow()}>
                    Статус
                  </Button>
                )}
                <IconButton
                  color="inherit"
                  size="small"
                  onClick={() => serviceHealth.setIsUnavailable(false)}
                  aria-label="close"
                >
                  <Close fontSize="small" />
                </IconButton>
              </Box>
            )}
          >
            <Box>
              <Typography variant="body2">{serviceHealth.message}</Typography>
              {isAdmin && serviceHealth.statusText && (
                <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                  {serviceHealth.statusText}
                </Typography>
              )}
            </Box>
          </Alert>
        </Collapse>
        <Outlet />
      </Box>
      <Dialog open={unsavedDialogOpen} onClose={closeUnsavedDialog}>
        <DialogTitle>Несохраненные изменения</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Вы изменили данные и еще не сохранили их. Сохранить перед переходом?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeUnsavedDialog} disabled={processingUnsavedAction}>Отмена</Button>
          <Button onClick={handleDiscardAndContinue} disabled={processingUnsavedAction}>Не сохранять</Button>
          <Button variant="contained" onClick={handleSaveAndContinue} disabled={processingUnsavedAction}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DashboardLayout;
