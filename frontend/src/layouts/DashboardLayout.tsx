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
} from '@mui/material';
import {
  Menu as MenuIcon,
  Assignment,
  People,
  Settings,
  Logout,
  TableChart,
  ChevronLeft,
  ChevronRight,
  Close,
} from '@mui/icons-material';
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth-store';
import { canAccessAdmin, canViewFinancialPlan, canViewSummary, canViewTotalsInPlans } from '../utils/rolePermissions';
import { getHasUnsavedChanges, getUnsavedHandlers, setHasUnsavedChanges } from '../store/unsavedChanges';
import { getRuntimeAppSettings } from '../services/api';
import { useServiceHealth } from '../hooks/useServiceHealth';

const expandedDrawerWidth = 280;
const collapsedDrawerWidth = 86;

const DashboardLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [processingUnsavedAction, setProcessingUnsavedAction] = useState(false);
  const [isPinnedOpen, setIsPinnedOpen] = useState<boolean>(() => {
    const raw = localStorage.getItem('sidebar-pinned-open');
    return raw !== 'false';
  });
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [appTitle, setAppTitle] = useState('Логистика & Отчетность');
  const drawerWidth = isPinnedOpen ? expandedDrawerWidth : collapsedDrawerWidth;
  const canViewTotals = canViewTotalsInPlans(user?.role);
  const canViewFinancial = canViewFinancialPlan(user?.role);
  const isAdmin = user?.role === 'admin';
  const serviceHealth = useServiceHealth();

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

  const handleLogout = () => {
    runOrConfirmUnsaved(() => {
      logout();
      navigate('/login');
    });
  };

  const togglePinnedSidebar = () => {
    setIsPinnedOpen((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-pinned-open', String(next));
      return next;
    });
  };

  const menuItems = [
    canViewSummary(user?.role)
      ? { key: 'summary', label: 'Сводный отчет', icon: <Assignment />, onClick: () => handleNavigate('/summary-report'), active: location.pathname.includes('/summary') }
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
        {isPinnedOpen ? (
          <Typography variant="h6" noWrap>
            {appTitle}
          </Typography>
        ) : (
          <Typography variant="h6" noWrap>
            ЛО
          </Typography>
        )}
        <IconButton onClick={togglePinnedSidebar} size="small" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
          {isPinnedOpen ? <ChevronLeft /> : <ChevronRight />}
        </IconButton>
      </Toolbar>
      <Divider />
      <List>
        <ListItem disablePadding key="plans">
          <Tooltip title={!isPinnedOpen ? 'Показатели' : ''} placement="right">
            <ListItemButton selected={location.pathname.includes('/plans') || location.pathname === '/'} onClick={() => handleNavigate('/plans')}>
              <ListItemIcon sx={{ minWidth: isPinnedOpen ? 40 : 0, justifyContent: 'center' }}>
                <TableChart />
              </ListItemIcon>
              {isPinnedOpen && <ListItemText primary="Показатели" />}
            </ListItemButton>
          </Tooltip>
        </ListItem>
        {isPinnedOpen && (
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
            {canViewFinancial && (
              <ListItem disablePadding sx={{ pl: 4 }}>
                <ListItemButton
                  selected={location.pathname === '/plans/financial'}
                  onClick={() => handleNavigate('/plans/financial')}
                  sx={{ py: 0.5, minHeight: 34 }}
                >
                  <ListItemText primary="Фин.рез. план" primaryTypographyProps={{ fontSize: 14 }} />
                </ListItemButton>
              </ListItem>
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
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
            {(location.pathname === '/' || location.pathname.includes('/plans')) && 'Показатели'}
            {location.pathname.includes('/summary-report') && 'Сводный отчет'}
            {location.pathname.includes('/admin') && 'Администрирование'}
            {location.pathname.includes('/settings') && 'Настройки'}
          </Typography>
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
          p: { xs: 1.5, sm: 2 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: 8,
        }}
      >
        <Collapse in={serviceHealth.isUnavailable}>
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
