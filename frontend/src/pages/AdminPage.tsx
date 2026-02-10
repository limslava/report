import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Alert,
  Collapse,
  Typography,
  Paper,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  FormHelperText,
  Tooltip,
} from '@mui/material';
import { Add, Edit, Delete, LockReset, SwapHoriz, PowerSettingsNew, Close } from '@mui/icons-material';
import {
  getUsers,
  inviteUser,
  updateUser,
  deleteUser,
  getSystemStats,
  getAuditLog,
  resetUserPasswordByAdmin,
  reassignAndDeleteUserByAdmin,
} from '../services/api';

const AdminPage = () => {
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [tabValue, setTabValue] = useState(0);

  const [users, setUsers] = useState<any[]>([]);
  const [_loading, setLoading] = useState(false);
  const [_error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [dbMetrics, setDbMetrics] = useState<any>(null);
  const [redisStatus, setRedisStatus] = useState<string | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [dbAlertOpen, setDbAlertOpen] = useState(false);
  const [dbAlertMessage, setDbAlertMessage] = useState('');
  const prevDbErrorsRef = useRef<number | null>(null);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<any>(null);
  const [targetUserId, setTargetUserId] = useState('');
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditFilters, setAuditFilters] = useState({
    userId: '',
    action: '',
    startDate: '',
    endDate: '',
    limit: '200',
  });
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    role: '',
  });

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [usersRes, statsRes] = await Promise.all([
          getUsers(),
          getSystemStats(),
        ]);
        setUsers(usersRes.data);
        setStats(statsRes.data);
      } catch (err: any) {
        setError(err.message || 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    let stopped = false;
    const loadDbMetrics = async () => {
      try {
        const response = await fetch('/health/db/metrics', { cache: 'no-store' });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (!stopped) {
          const messages: string[] = [];
          const prevErrors = prevDbErrorsRef.current;
          if (typeof data?.totalErrors === 'number') {
            if (prevErrors !== null && data.totalErrors > prevErrors) {
              messages.push(`DB ошибки увеличились: +${data.totalErrors - prevErrors}`);
            }
            prevDbErrorsRef.current = data.totalErrors;
          }
          if (typeof data?.avgLatencyMs === 'number' && data.avgLatencyMs > 800) {
            messages.push(`Высокая средняя задержка БД: ${data.avgLatencyMs} ms`);
          }
          if (messages.length > 0) {
            setDbAlertMessage(messages.join(' • '));
            setDbAlertOpen(true);
          }
          setDbMetrics(data);
        }
      } catch {
        // ignore
      }
    };

    loadDbMetrics();
    const timer = window.setInterval(loadDbMetrics, 30000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    const loadHealth = async () => {
      try {
        const [redisRes, schedulerRes] = await Promise.all([
          fetch('/health/redis', { cache: 'no-store' }),
          fetch('/health/scheduler', { cache: 'no-store' }),
        ]);

        if (!stopped) {
          const redisData = await redisRes.json().catch(() => ({}));
          setRedisStatus(redisData?.status ?? (redisRes.ok ? 'OK' : 'DOWN'));

          const schedulerData = await schedulerRes.json().catch(() => ({}));
          setSchedulerStatus({ status: schedulerRes.ok ? 'OK' : 'DOWN', ...schedulerData });
        }
      } catch {
        if (!stopped) {
          setRedisStatus('DOWN');
          setSchedulerStatus({ status: 'DOWN' });
        }
      }
    };

    loadHealth();
    const timer = window.setInterval(loadHealth, 30000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  const roleLabels: Record<string, string> = {
    manager_ktk_vvo: 'Менеджер КТК Владивосток',
    manager_ktk_mow: 'Менеджер КТК Москва',
    manager_auto: 'Менеджер отправки авто',
    manager_rail: 'Менеджер ЖД',
    manager_extra: 'Менеджер доп.услуг',
    manager_to: 'Менеджер ТО авто',
    manager_sales: 'Менеджер по продажам',
    director: 'Директор',
    admin: 'Администратор',
    financer: 'Финансист',
  };

  const auditActions = [
    { value: '', label: 'Все действия' },
    { value: 'LOGIN', label: 'LOGIN' },
    { value: 'DAILY_REPORT_SAVED', label: 'DAILY_REPORT_SAVED' },
    { value: 'OPERATIONAL_PLAN_SAVED', label: 'OPERATIONAL_PLAN_SAVED' },
    { value: 'FIN_RESULT_UPDATED', label: 'FIN_RESULT_UPDATED' },
    { value: 'USER_INVITED', label: 'USER_INVITED' },
    { value: 'USER_UPDATED', label: 'USER_UPDATED' },
    { value: 'USER_PASSWORD_RESET', label: 'USER_PASSWORD_RESET' },
    { value: 'USER_REASSIGN_DELETE', label: 'USER_REASSIGN_DELETE' },
    { value: 'USER_DELETED', label: 'USER_DELETED' },
  ];

  const roles = [
    { value: 'manager_ktk_vvo', label: 'Менеджер КТК Владивосток' },
    { value: 'manager_ktk_mow', label: 'Менеджер КТК Москва' },
    { value: 'manager_auto', label: 'Менеджер отправки авто' },
    { value: 'manager_rail', label: 'Менеджер ЖД' },
    { value: 'manager_extra', label: 'Менеджер доп.услуг' },
    { value: 'manager_to', label: 'Менеджер ТО авто' },
    { value: 'manager_sales', label: 'Менеджер по продажам' },
    { value: 'director', label: 'Директор' },
    { value: 'admin', label: 'Администратор' },
    { value: 'financer', label: 'Финансист' },
  ];

  const userNameById = users.reduce<Record<string, string>>((acc, user) => {
    acc[user.id] = user.fullName || user.email || user.id;
    return acc;
  }, {});

  const formatLocalDateTime = (value?: string | null) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  };

  const formatUptime = (seconds?: number | null) => {
    if (seconds == null) return '—';
    const total = Math.max(0, Math.floor(seconds));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (days > 0) return `${days}д ${hours}ч ${minutes}м`;
    if (hours > 0) return `${hours}ч ${minutes}м`;
    return `${minutes}м`;
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const loadAuditLogs = async () => {
    if (!auditFilters.startDate || !auditFilters.endDate) {
      setAuditError('Выберите "Дата с" и "Дата по", затем нажмите "Обновить".');
      return;
    }
    try {
      setAuditLoading(true);
      setAuditError(null);
      const params: Record<string, any> = {};
      if (auditFilters.userId) params.userId = auditFilters.userId;
      if (auditFilters.action) params.action = auditFilters.action;
      if (auditFilters.startDate) params.startDate = auditFilters.startDate;
      if (auditFilters.endDate) params.endDate = auditFilters.endDate;
      if (auditFilters.limit) params.limit = auditFilters.limit;
      params.tzOffsetMinutes = new Date().getTimezoneOffset();
      const response = await getAuditLog(params);
      setAuditLogs(Array.isArray(response.data) ? response.data : []);
    } catch (err: any) {
      setAuditError(err?.message || 'Не удалось загрузить журнал действий');
    } finally {
      setAuditLoading(false);
    }
  };

  const statsRows = [
    { label: 'Всего пользователей', value: stats?.users ?? '—' },
    { label: 'Активные сессии', value: stats?.activeSessions ?? '—' },
    { label: 'Отчетов сегодня', value: stats?.dailyReports ?? '—' },
    { label: 'Отчетов за месяц', value: stats?.monthlyReports ?? '—' },
    { label: 'DB latency (avg)', value: dbMetrics?.avgLatencyMs != null ? `${dbMetrics.avgLatencyMs} ms` : '—' },
    { label: 'DB ошибки', value: dbMetrics?.totalErrors ?? '—' },
    { label: 'Redis', value: redisStatus ?? '—', chip: true },
    { label: 'Scheduler', value: schedulerStatus?.status ?? '—', chip: true },
    { label: 'Scheduler last run', value: formatLocalDateTime(schedulerStatus?.lastRunAt) },
    { label: 'Последняя ошибка БД', value: dbMetrics?.lastError ? `${dbMetrics.lastError} (${dbMetrics.lastErrorAt ?? '—'})` : '—' },
    { label: 'Последний бэкап', value: stats?.lastBackup ?? '—' },
    { label: 'Uptime', value: formatUptime(stats?.uptime) },
  ];

  const handleOpenDialog = (user: any = null) => {
    setSelectedUser(user);
    if (user) {
      setFormData({
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      });
    } else {
      setFormData({
        email: '',
        fullName: '',
        role: '',
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedUser(null);
    setFormData({
      email: '',
      fullName: '',
      role: '',
    });
  };

  const handleSaveUser = async () => {
    if (isSavingUser) {
      return;
    }

    const { email, fullName, role } = formData;
    if (!email || !fullName || !role) {
      alert('Заполните все поля');
      return;
    }

    try {
      setIsSavingUser(true);
      if (selectedUser) {
        await updateUser(selectedUser.id, { email, fullName, role });
        alert('Пользователь обновлен');
      } else {
        await inviteUser({ email, fullName, role });
        alert('Пользователь добавлен, приглашение отправлено');
      }
      
      // Перезагружаем список
      const usersRes = await getUsers();
      setUsers(usersRes.data);
      handleCloseDialog();
    } catch (error: any) {
      alert(`Ошибка: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Удалить пользователя?')) return;
    try {
      await deleteUser(id);
      // Обновляем список
      const usersRes = await getUsers();
      setUsers(usersRes.data);
      alert('Пользователь удален');
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message;
      alert(`Ошибка удаления: ${errorMessage}`);
    }
  };

  const handleToggleActive = async (user: any) => {
    try {
      await updateUser(user.id, { isActive: !user.isActive });
      const usersRes = await getUsers();
      setUsers(usersRes.data);
    } catch (error: any) {
      alert(`Ошибка изменения статуса: ${error.response?.data?.message || error.message}`);
    }
  };

  const openReassignDeleteDialog = (user: any) => {
    setDeletingUser(user);
    setTargetUserId('');
    setReassignDialogOpen(true);
  };

  const closeReassignDeleteDialog = () => {
    setReassignDialogOpen(false);
    setDeletingUser(null);
    setTargetUserId('');
  };

  const handleReassignDelete = async () => {
    if (!deletingUser || !targetUserId) return;
    try {
      await reassignAndDeleteUserByAdmin(deletingUser.id, targetUserId);
      const usersRes = await getUsers();
      setUsers(usersRes.data);
      closeReassignDeleteDialog();
      alert('Пользователь удален, записи переназначены');
    } catch (error: any) {
      const details = error.response?.data?.details;
      const detailsText = Array.isArray(details) ? details.map((d: any) => `${d.field}: ${d.message}`).join(', ') : '';
      alert(`Ошибка: ${error.response?.data?.message || error.response?.data?.error || error.message}${detailsText ? ` (${detailsText})` : ''}`);
    }
  };

  const handleResetPassword = async (id: string) => {
    if (!confirm('Сбросить пароль пользователя?')) return;
    try {
      const response = await resetUserPasswordByAdmin(id);
      const tempPassword = response.data?.temporaryPassword;
      alert(`Пароль сброшен.${tempPassword ? ` Временный пароль: ${tempPassword}` : ''}`);
    } catch (error: any) {
      alert(`Ошибка сброса пароля: ${error.response?.data?.message || error.message}`);
    }
  };

  return (
    <Box>
      <Collapse in={dbAlertOpen}>
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={(
            <IconButton color="inherit" size="small" onClick={() => setDbAlertOpen(false)}>
              <Close fontSize="small" />
            </IconButton>
          )}
        >
          {dbAlertMessage}
        </Alert>
      </Collapse>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="Пользователи системы" />
          <Tab label="Статистика" />
          <Tab label="Журнал действий" />
        </Tabs>

        {tabValue === 0 && (
          <Box sx={{ pt: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="h6">Пользователи системы</Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => handleOpenDialog()}
              >
                Добавить пользователя
              </Button>
            </Box>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>ФИО</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Роль</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell>Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.fullName}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Chip
                          label={roleLabels[user.role] || user.role}
                          size="small"
                          color={user.role === 'admin' ? 'error' : user.role === 'director' ? 'warning' : 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={user.isActive ? 'Активен' : 'Отключен'}
                          color={user.isActive ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Редактировать">
                          <IconButton size="small" onClick={() => handleOpenDialog(user)}>
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Сбросить пароль">
                          <IconButton size="small" onClick={() => handleResetPassword(user.id)}>
                            <LockReset fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={user.isActive ? 'Деактивировать' : 'Активировать'}>
                          <IconButton size="small" onClick={() => handleToggleActive(user)}>
                            <PowerSettingsNew fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Переназначить и удалить">
                          <IconButton size="small" onClick={() => openReassignDeleteDialog(user)}>
                            <SwapHoriz fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Удалить">
                          <IconButton size="small" onClick={() => handleDeleteUser(user.id)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {tabValue === 1 && (
          <Box sx={{ pt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Статистика
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                gap: 2,
              }}
            >
              {statsRows.map((row) => (
                <Paper key={row.label} variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    {row.label}
                  </Typography>
                  <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    {row.chip ? (
                      <Chip
                        label={row.value ?? '—'}
                        size="small"
                        color={row.value === 'OK' ? 'success' : row.value === 'DOWN' ? 'error' : 'default'}
                        sx={{ fontSize: '0.75rem', height: 22 }}
                      />
                    ) : (
                      <Typography sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                        {row.value ?? '—'}
                      </Typography>
                    )}
                  </Box>
                </Paper>
              ))}
            </Box>
          </Box>
        )}

        {tabValue === 2 && (
          <Box sx={{ pt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Журнал действий
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end', mb: 2 }}>
              <TextField
                label="Дата с"
                type="date"
                size="small"
                InputLabelProps={{ shrink: true }}
                value={auditFilters.startDate}
                onChange={(e) => setAuditFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              />
              <TextField
                label="Дата по"
                type="date"
                size="small"
                InputLabelProps={{ shrink: true }}
                value={auditFilters.endDate}
                onChange={(e) => setAuditFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              />
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel shrink>Пользователь</InputLabel>
                <Select
                  label="Пользователь"
                  value={auditFilters.userId}
                  displayEmpty
                  renderValue={(selected) => {
                    if (!selected) return 'Все пользователи';
                    return userNameById[String(selected)] || String(selected);
                  }}
                  onChange={(e) => setAuditFilters((prev) => ({ ...prev, userId: String(e.target.value) }))}
                >
                  <MenuItem value="">Все пользователи</MenuItem>
                  {users.map((user) => (
                    <MenuItem key={user.id} value={user.id}>
                      {user.fullName} ({user.email})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel>Действие</InputLabel>
                <Select
                  label="Действие"
                  value={auditFilters.action}
                  onChange={(e) => setAuditFilters((prev) => ({ ...prev, action: String(e.target.value) }))}
                >
                  {auditActions.map((action) => (
                    <MenuItem key={action.value} value={action.value}>
                      {action.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Лимит"
                type="number"
                size="small"
                value={auditFilters.limit}
                onChange={(e) => setAuditFilters((prev) => ({ ...prev, limit: e.target.value }))}
                sx={{ width: 120 }}
              />
              <Button variant="contained" onClick={loadAuditLogs} disabled={auditLoading}>
                {auditLoading ? 'Загрузка...' : 'Обновить'}
              </Button>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Для загрузки журнала выберите период и нажмите «Обновить».
            </Typography>

            {auditError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {auditError}
              </Alert>
            )}

            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Дата</TableCell>
                    <TableCell>Пользователь</TableCell>
                    <TableCell>Действие</TableCell>
                    <TableCell>Объект</TableCell>
                    <TableCell>Детали</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{formatLocalDateTime(log.createdAt)}</TableCell>
                      <TableCell>{log.userId ? userNameById[log.userId] || log.userId : '—'}</TableCell>
                      <TableCell>{log.action}</TableCell>
                      <TableCell sx={{ maxWidth: 220, wordBreak: 'break-word' }}>
                        {log.entityType ? `${log.entityType}${log.entityId ? `:${log.entityId}` : ''}` : '—'}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 320, wordBreak: 'break-word' }}>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {log.details ? JSON.stringify(log.details) : '—'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                  {auditLogs.length === 0 && !auditLoading && (
                    <TableRow>
                      <TableCell colSpan={5}>Нет записей</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Paper>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedUser ? 'Редактирование пользователя' : 'Новый пользователь'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              fullWidth
            />
            <TextField
              label="ФИО"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Роль</InputLabel>
              <Select
                label="Роль"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                {roles.map((role) => (
                  <MenuItem key={role.value} value={role.value}>{role.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={isSavingUser}>
            Отмена
          </Button>
          <Button variant="contained" onClick={handleSaveUser} disabled={isSavingUser}>
            {isSavingUser ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={reassignDialogOpen} onClose={closeReassignDeleteDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Переназначить и удалить пользователя</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Удаляемый пользователь"
              value={deletingUser ? `${deletingUser.fullName} (${deletingUser.email})` : ''}
              fullWidth
              InputProps={{ readOnly: true }}
            />
            <FormControl fullWidth>
              <InputLabel>Кому переназначить записи</InputLabel>
              <Select
                label="Кому переназначить записи"
                value={targetUserId}
                onChange={(e) => setTargetUserId(String(e.target.value))}
              >
                {users
                  .filter((u) => u.id !== deletingUser?.id)
                  .map((u) => (
                    <MenuItem key={u.id} value={u.id}>
                      {u.fullName} ({u.email})
                    </MenuItem>
                  ))}
              </Select>
              <FormHelperText>Исторические записи будут перенесены на выбранного пользователя</FormHelperText>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReassignDeleteDialog}>Отмена</Button>
          <Button variant="contained" color="error" disabled={!targetUserId} onClick={handleReassignDelete}>
            Переназначить и удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminPage;
