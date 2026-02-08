import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Alert,
  Collapse,
  Typography,
  Paper,
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
  resetUserPasswordByAdmin,
  reassignAndDeleteUserByAdmin,
} from '../services/api';

const AdminPage = () => {
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

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
    container_vladivostok: 'Менеджер КТК Владивосток',
    container_moscow: 'Менеджер КТК Москва',
    railway: 'Менеджер ЖД',
    autotruck: 'Менеджер отправки авто',
    additional: 'Менеджер доп.услуг',
    to_auto: 'Менеджер ТО авто',
    manager_to: 'Менеджер ТО авто',
    manager_ktk_vvo: 'Менеджер КТК Владивосток',
    manager_ktk_mow: 'Менеджер КТК Москва',
    manager_auto: 'Менеджер отправки авто',
    manager_rail: 'Менеджер ЖД',
    manager_extra: 'Менеджер доп.услуг',
    sales: 'Менеджер по продажам',
    manager_sales: 'Менеджер по продажам',
    director: 'Директор',
    admin: 'Администратор',
    financer: 'Финансист',
  };

  const roles = [
    { value: 'container_vladivostok', label: 'КТК Владивосток' },
    { value: 'container_moscow', label: 'КТК Москва' },
    { value: 'railway', label: 'ЖД' },
    { value: 'autotruck', label: 'Отправка авто' },
    { value: 'additional', label: 'Доп.услуги' },
    { value: 'to_auto', label: 'ТО авто' },
    { value: 'manager_ktk_vvo', label: 'Менеджер КТК Владивосток' },
    { value: 'manager_ktk_mow', label: 'Менеджер КТК Москва' },
    { value: 'manager_auto', label: 'Менеджер отправки авто' },
    { value: 'manager_rail', label: 'Менеджер ЖД' },
    { value: 'manager_extra', label: 'Менеджер доп.услуг' },
    { value: 'manager_to', label: 'Менеджер ТО авто' },
    { value: 'manager_sales', label: 'Менеджер по продажам' },
    { value: 'sales', label: 'Менеджер по продажам' },
    { value: 'director', label: 'Директор' },
    { value: 'admin', label: 'Администратор' },
    { value: 'financer', label: 'Финансист' },
  ];

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
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Статистика
        </Typography>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="body2" color="textSecondary">Всего пользователей</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{stats?.users ?? '—'}</Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="textSecondary">Активные сессии</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{stats?.activeSessions ?? '—'}</Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="textSecondary">За сегодня</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{stats?.dailyReports ?? '—'}</Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="textSecondary">DB latency (avg)</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {dbMetrics?.avgLatencyMs != null ? `${dbMetrics.avgLatencyMs} ms` : '—'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="textSecondary">DB ошибки</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{dbMetrics?.totalErrors ?? '—'}</Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="textSecondary">Redis</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{redisStatus ?? '—'}</Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="textSecondary">Scheduler</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{schedulerStatus?.status ?? '—'}</Typography>
          </Box>
          <Box sx={{ minWidth: 220 }}>
            <Typography variant="body2" color="textSecondary">Scheduler last run</Typography>
            <Typography variant="body2">
              {formatLocalDateTime(schedulerStatus?.lastRunAt)}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 220 }}>
            <Typography variant="body2" color="textSecondary">Последняя ошибка</Typography>
            <Typography variant="body2">
              {dbMetrics?.lastError ? `${dbMetrics.lastError} (${dbMetrics.lastErrorAt ?? '—'})` : '—'}
            </Typography>
          </Box>
        </Box>
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
