import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Divider,
  List,
  ListItem,
  ListItemText,
  IconButton,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
} from '@mui/material';
import { Delete, Add, Edit } from '@mui/icons-material';
import {
  getSmtpConfig,
  saveSmtpConfig,
  testSmtpConfig,
  changePassword,
  getEmailSchedules,
  createEmailSchedule,
  updateEmailSchedule,
  deleteEmailSchedule,
  triggerTestEmail,
  getAppSettings,
  updateAppSettings,
} from '../services/api';
import { useAuthStore } from '../store/auth-store';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const SmtpConfigForm = () => {
  const [config, setConfig] = useState({
    host: '',
    port: 587,
    secure: false,
    user: '',
    password: '',
    from: '',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await getSmtpConfig();
      if (response.data && response.data.host) {
        setConfig(response.data);
      }
    } catch (error) {
      // Конфигурация отсутствует — оставляем значения по умолчанию
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (name === 'port' ? parseInt(value, 10) : value),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await saveSmtpConfig(config);
      setMessage({ type: 'success', text: 'Настройки SMTP сохранены' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Ошибка сохранения' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setMessage(null);
    try {
      const response = await testSmtpConfig();
      setMessage({ type: 'success', text: response.data?.message || 'SMTP соединение успешно установлено' });
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || 'Ошибка подключения';
      setMessage({ type: 'error', text: `Тест не пройден: ${errorMsg}` });
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Настройки SMTP сервера
      </Typography>
      <Typography variant="body2" color="textSecondary" paragraph>
        Укажите параметры SMTP для отправки email‑отчетов.
      </Typography>
      {loading ? (
        <Typography>Загрузка...</Typography>
      ) : (
        <form onSubmit={handleSubmit}>
          <FormControl fullWidth margin="normal" size="small">
            <InputLabel>Провайдер</InputLabel>
            <Select
              label="Провайдер"
              value=""
              onChange={(e) => {
                const provider = e.target.value;
                if (provider === 'gmail') {
                  setConfig(prev => ({
                    ...prev,
                    host: 'smtp.gmail.com',
                    port: 587,
                    secure: true,
                  }));
                } else if (provider === 'yandex') {
                  setConfig(prev => ({
                    ...prev,
                    host: 'smtp.yandex.ru',
                    port: 465,
                    secure: true,
                  }));
                } else if (provider === 'mailru') {
                  setConfig(prev => ({
                    ...prev,
                    host: 'smtp.mail.ru',
                    port: 465,
                    secure: true,
                  }));
                } else if (provider === 'sendgrid') {
                  setConfig(prev => ({
                    ...prev,
                    host: 'smtp.sendgrid.net',
                    port: 587,
                    secure: true,
                  }));
                }
              }}
            >
              <MenuItem value="">Выберите провайдера...</MenuItem>
              <MenuItem value="gmail">Gmail</MenuItem>
              <MenuItem value="yandex">Яндекс.Почта</MenuItem>
              <MenuItem value="mailru">Mail.ru</MenuItem>
              <MenuItem value="sendgrid">SendGrid</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="SMTP сервер"
            name="host"
            value={config.host}
            onChange={handleChange}
            margin="normal"
            size="small"
            placeholder="например, smtp.gmail.com"
            helperText="Адрес SMTP‑сервера вашего почтового провайдера"
          />
          <TextField
            fullWidth
            label="Порт"
            name="port"
            type="number"
            value={config.port}
            onChange={handleChange}
            margin="normal"
            size="small"
          />
          <FormControlLabel
            control={
              <Switch
                name="secure"
                checked={config.secure}
                onChange={handleChange}
              />
            }
            label="Secure (TLS)"
          />
          <TextField
            fullWidth
            label="Пользователь"
            name="user"
            value={config.user}
            onChange={handleChange}
            margin="normal"
            size="small"
          />
          <TextField
            fullWidth
            label="Пароль"
            name="password"
            type="password"
            value={config.password}
            onChange={handleChange}
            margin="normal"
            size="small"
          />
          <TextField
            fullWidth
            label="Отправитель (from)"
            name="from"
            value={config.from}
            onChange={handleChange}
            margin="normal"
            size="small"
          />
          {message && (
            <Alert severity={message.type} sx={{ mt: 2 }}>
              {message.text}
            </Alert>
          )}
          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
            <Button variant="outlined" onClick={handleTest}>
              Тестировать
            </Button>
          </Box>
        </form>
      )}
    </Paper>
  );
};

const SettingsPage = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  
  const [tabValue, setTabValue] = useState(0);
  const [emailSchedules, setEmailSchedules] = useState<any[]>([]);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newSchedule, setNewSchedule] = useState({
    department: 'container_vladivostok',
    frequency: 'daily',
    reportType: 'planning_v2_segment',
    time: '09:00',
    daysOfWeek: [1, 2, 3, 4, 5],
    dayOfMonth: 1,
    recipientsText: '',
  });
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [appTitle, setAppTitle] = useState('Логистика & Отчетность');
  const [appTitleMessage, setAppTitleMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingAppTitle, setSavingAppTitle] = useState(false);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const loadEmailSchedules = async () => {
    if (!isAdmin) return;
    try {
      setEmailLoading(true);
      const response = await getEmailSchedules();
      setEmailSchedules(response.data ?? []);
    } catch {
      setEmailMessage({ type: 'error', text: 'Не удалось загрузить расписания' });
    } finally {
      setEmailLoading(false);
    }
  };

  useEffect(() => {
    loadEmailSchedules();
  }, [isAdmin]);

  useEffect(() => {
    const loadAppSettings = async () => {
      if (!isAdmin) return;
      try {
        const response = await getAppSettings();
        const title = response?.data?.appTitle;
        if (typeof title === 'string' && title.trim()) {
          setAppTitle(title.trim());
        }
      } catch {
        // ignore and keep default
      }
    };
    loadAppSettings();
  }, [isAdmin]);

  const handleSaveAppTitle = async () => {
    const normalized = appTitle.trim();
    if (!normalized) {
      setAppTitleMessage({ type: 'error', text: 'Название системы не может быть пустым' });
      return;
    }
    try {
      setSavingAppTitle(true);
      await updateAppSettings({ appTitle: normalized });
      setAppTitleMessage({ type: 'success', text: 'Название системы сохранено' });
    } catch {
      setAppTitleMessage({ type: 'error', text: 'Не удалось сохранить название системы' });
    } finally {
      setSavingAppTitle(false);
    }
  };

  const handleAddSchedule = async () => {
    const recipients = newSchedule.recipientsText
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      setEmailMessage({ type: 'error', text: 'Укажите хотя бы один email получателя' });
      return;
    }

    try {
      const schedule: any = { time: normalizeTimeToFiveMinutes(newSchedule.time), timezone: SCHEDULER_TIMEZONE };
      schedule.reportType = newSchedule.reportType;
      if (newSchedule.frequency === 'weekly') {
        schedule.daysOfWeek = newSchedule.daysOfWeek;
      }
      if (newSchedule.frequency === 'monthly') {
        schedule.dayOfMonth = newSchedule.dayOfMonth;
      }

      if (editingScheduleId) {
        await updateEmailSchedule(editingScheduleId, {
          department: newSchedule.department,
          frequency: newSchedule.frequency,
          schedule,
          recipients,
        });
        setEmailMessage({ type: 'success', text: 'Расписание обновлено' });
      } else {
        await createEmailSchedule({
          department: newSchedule.department,
          frequency: newSchedule.frequency,
          schedule,
          recipients,
        });
        setEmailMessage({ type: 'success', text: 'Расписание добавлено' });
      }

      setEditingScheduleId(null);
      setNewSchedule((prev) => ({ ...prev, recipientsText: '' }));
      await loadEmailSchedules();
    } catch {
      setEmailMessage({ type: 'error', text: 'Ошибка при создании расписания' });
    }
  };

  const handleEditSchedule = (item: any) => {
    setEditingScheduleId(item.id);
    setNewSchedule({
      department: item.department ?? 'container_vladivostok',
      frequency: item.frequency ?? 'daily',
      reportType: item.schedule?.reportType ?? 'planning_v2_segment',
      time: normalizeTimeToFiveMinutes(item.schedule?.time ?? '09:00'),
      daysOfWeek: item.schedule?.daysOfWeek ?? [1, 2, 3, 4, 5],
      dayOfMonth: item.schedule?.dayOfMonth ?? 1,
      recipientsText: (item.recipients ?? []).join(', '),
    });
  };

  const departmentLabels: Record<string, string> = {
    container_vladivostok: 'КТК Владивосток',
    container_moscow: 'КТК Москва',
    autotruck: 'Отправка авто',
    railway: 'ЖД',
    additional: 'Доп.услуги',
    to_auto: 'ТО авто',
  };

  const frequencyLabels: Record<string, string> = {
    daily: 'Ежедневно',
    weekly: 'Еженедельно',
    monthly: 'Ежемесячно',
  };

  const handleRemoveSchedule = async (id: string) => {
    try {
      await deleteEmailSchedule(id);
      setEmailMessage({ type: 'success', text: 'Расписание удалено' });
      await loadEmailSchedules();
    } catch {
      setEmailMessage({ type: 'error', text: 'Ошибка при удалении расписания' });
    }
  };

  const handleToggleSchedule = async (item: any, isActive: boolean) => {
    try {
      await updateEmailSchedule(item.id, { ...item, isActive });
      await loadEmailSchedules();
    } catch {
      setEmailMessage({ type: 'error', text: 'Ошибка при обновлении расписания' });
    }
  };

  const handleTestSchedule = async (id: string) => {
    try {
      await triggerTestEmail(id);
      setEmailMessage({ type: 'success', text: 'Тестовая отправка выполнена' });
      await loadEmailSchedules();
    } catch {
      setEmailMessage({ type: 'error', text: 'Ошибка тестовой отправки' });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChanging(true);
    setPasswordMessage(null);

    // Validation
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Новый пароль и подтверждение не совпадают' });
      setChanging(false);
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'Новый пароль должен содержать не менее 8 символов' });
      setChanging(false);
      return;
    }

    try {
      await changePassword({ currentPassword, newPassword });
      setPasswordMessage({ type: 'success', text: 'Пароль успешно изменен' });
      // Clear fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || 'Произошла ошибка при смене пароля';
      setPasswordMessage({ type: 'error', text: errorMsg });
    } finally {
      setChanging(false);
    }
  };

  // Динамические вкладки в зависимости от роли
  const tabs = [
    { label: 'Профиль', show: true },
    { label: 'Уведомления', show: isAdmin },
    { label: 'Интеграции', show: isAdmin },
  ];
  
  const visibleTabs = tabs.filter(tab => tab.show);
  
  return (
    <Box>
      <Paper sx={{ mt: 2 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          {visibleTabs.map((tab, index) => (
            <Tab key={index} label={tab.label} />
          ))}
        </Tabs>
        <TabPanel value={tabValue} index={0}>
          <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField label="ФИО" value={user?.fullName ?? ''} fullWidth InputProps={{ readOnly: true }} />
            <TextField label="Email" value={user?.email ?? ''} fullWidth InputProps={{ readOnly: true }} />
            {isAdmin && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Название системы
                </Typography>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <TextField
                    label="Название в меню"
                    value={appTitle}
                    onChange={(e) => setAppTitle(e.target.value)}
                    size="small"
                    sx={{ minWidth: 320, flex: 1 }}
                  />
                  <Button variant="contained" onClick={handleSaveAppTitle} disabled={savingAppTitle}>
                    {savingAppTitle ? 'Сохранение...' : 'Сохранить'}
                  </Button>
                </Box>
                {appTitleMessage && (
                  <Alert severity={appTitleMessage.type} sx={{ mt: 1.5 }}>
                    {appTitleMessage.text}
                  </Alert>
                )}
              </Paper>
            )}
          </Box>

          <Divider sx={{ my: 3 }} />
          <Typography variant="h6" gutterBottom>
            Смена пароля
          </Typography>
          {passwordMessage && (
            <Alert severity={passwordMessage.type} sx={{ mb: 2 }}>
              {passwordMessage.text}
            </Alert>
          )}
          <Box component="form" onSubmit={handleChangePassword} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Текущий пароль"
              type="password"
              fullWidth
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={changing}
            />
            <TextField
              label="Новый пароль"
              type="password"
              fullWidth
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={changing}
            />
            <TextField
              label="Повторите новый пароль"
              type="password"
              fullWidth
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={changing}
            />
            <Button
              variant="contained"
              sx={{ alignSelf: 'start' }}
              type="submit"
              disabled={changing}
            >
              {changing ? 'Изменение...' : 'Изменить пароль'}
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Для безопасности после смены пароля рекомендуется выйти и зайти в систему снова.
          </Typography>
        </TabPanel>
        
        {isAdmin && (
          <>
            <TabPanel value={tabValue} index={1}>
              <Typography variant="h6" gutterBottom>
                Настройка email-рассылки
              </Typography>
              {emailMessage && (
                <Alert severity={emailMessage.type} sx={{ mb: 2 }}>
                  {emailMessage.text}
                </Alert>
              )}
              <List>
                {emailSchedules.map((schedule) => (
                  <ListItem
                    key={schedule.id}
                    sx={{
                      py: 1.5,
                      alignItems: 'flex-start',
                      display: 'flex',
                      gap: 2,
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                    }}
                  >
                    <ListItemText
                      primary={
                        schedule.schedule?.reportType === 'sv_pdf'
                          ? `${frequencyLabels[schedule.frequency] ?? schedule.frequency} • ${schedule.schedule?.time ?? '--:--'} • СВ отчет`
                          : `${frequencyLabels[schedule.frequency] ?? schedule.frequency} • ${schedule.schedule?.time ?? '--:--'} • ${departmentLabels[schedule.department] ?? schedule.department}`
                      }
                      secondary={
                        <>
                          {`Получатели: ${(schedule.recipients ?? []).join(', ')}`}
                          {' • '}
                          {schedule.schedule?.reportType === 'sv_pdf' ? 'Отчет: СВ (Excel из данных)' : 'Отчет: Планирование v2'}
                          {schedule.frequency === 'weekly' && (schedule.schedule?.daysOfWeek ?? []).length > 0
                            ? ` • Дни: ${(schedule.schedule?.daysOfWeek ?? [])
                                .map((d: number) => (['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][d - 1] ?? String(d)))
                                .join(', ')}`
                            : ''}
                        </>
                      }
                      sx={{ mr: 2 }}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                      <FormControlLabel
                        sx={{ m: 0 }}
                        control={
                          <Switch
                            checked={Boolean(schedule.isActive)}
                            onChange={(e) => handleToggleSchedule(schedule, e.target.checked)}
                          />
                        }
                        label="Вкл"
                      />
                      <Button size="small" onClick={() => handleTestSchedule(schedule.id)}>
                        Тест
                      </Button>
                      <IconButton onClick={() => handleEditSchedule(schedule)}>
                        <Edit />
                      </IconButton>
                      <IconButton onClick={() => handleRemoveSchedule(schedule.id)}>
                        <Delete />
                      </IconButton>
                    </Box>
                  </ListItem>
                ))}
                {!emailLoading && emailSchedules.length === 0 && (
                  <ListItem>
                    <ListItemText primary="Расписания пока не созданы" />
                  </ListItem>
                )}
              </List>
              <Paper variant="outlined" sx={{ p: 2, mt: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  {editingScheduleId ? 'Редактирование расписания' : 'Новое расписание'}
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 1.5 }}>
                  <TextField
                    select
                    label="Тип отчета"
                    size="small"
                    value={newSchedule.reportType}
                    onChange={(e) => setNewSchedule((prev) => ({ ...prev, reportType: e.target.value }))}
                  >
                    <MenuItem value="planning_v2_segment">Планирование v2 по сегменту</MenuItem>
                    <MenuItem value="sv_pdf">СВ (Excel из данных системы)</MenuItem>
                  </TextField>
                  <TextField
                    select
                    label="Направление"
                    size="small"
                    value={newSchedule.department}
                    onChange={(e) => setNewSchedule((prev) => ({ ...prev, department: e.target.value }))}
                    disabled={newSchedule.reportType === 'sv_pdf'}
                  >
                    <MenuItem value="container_vladivostok">КТК Владивосток</MenuItem>
                    <MenuItem value="container_moscow">КТК Москва</MenuItem>
                    <MenuItem value="autotruck">Отправка авто</MenuItem>
                    <MenuItem value="railway">ЖД</MenuItem>
                    <MenuItem value="additional">Доп.услуги</MenuItem>
                    <MenuItem value="to_auto">ТО авто</MenuItem>
                  </TextField>
                  <TextField
                    select
                    label="Частота"
                    size="small"
                    value={newSchedule.frequency}
                    onChange={(e) => setNewSchedule((prev) => ({ ...prev, frequency: e.target.value }))}
                  >
                    <MenuItem value="daily">Ежедневно</MenuItem>
                    <MenuItem value="weekly">Еженедельно</MenuItem>
                    <MenuItem value="monthly">Ежемесячно</MenuItem>
                  </TextField>
                  <TextField
                    label="Время"
                    type="time"
                    size="small"
                    value={newSchedule.time}
                    onChange={(e) => setNewSchedule((prev) => ({ ...prev, time: normalizeTimeToFiveMinutes(e.target.value) }))}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ step: 300 }}
                    helperText="Шаг: 5 минут (часовой пояс Владивосток)"
                  />
                  {newSchedule.frequency === 'monthly' && (
                    <TextField
                      label="День месяца"
                      type="number"
                      size="small"
                      value={newSchedule.dayOfMonth}
                      inputProps={{ min: 1, max: 31 }}
                      onChange={(e) =>
                        setNewSchedule((prev) => ({ ...prev, dayOfMonth: Math.min(31, Math.max(1, Number(e.target.value) || 1)) }))
                      }
                    />
                  )}
                  {newSchedule.frequency === 'weekly' && (
                    <TextField
                      select
                      SelectProps={{ multiple: true }}
                      label="Дни недели"
                      size="small"
                      value={newSchedule.daysOfWeek as any}
                      onChange={(e) => {
                        const next = (e.target.value as unknown as Array<string | number>).map((v) => Number(v));
                        setNewSchedule((prev) => ({ ...prev, daysOfWeek: next }));
                      }}
                    >
                      <MenuItem value={1}>Понедельник</MenuItem>
                      <MenuItem value={2}>Вторник</MenuItem>
                      <MenuItem value={3}>Среда</MenuItem>
                      <MenuItem value={4}>Четверг</MenuItem>
                      <MenuItem value={5}>Пятница</MenuItem>
                      <MenuItem value={6}>Суббота</MenuItem>
                      <MenuItem value={7}>Воскресенье</MenuItem>
                    </TextField>
                  )}
                  <TextField
                    label="Получатели (через запятую)"
                    size="small"
                    value={newSchedule.recipientsText}
                    onChange={(e) => setNewSchedule((prev) => ({ ...prev, recipientsText: e.target.value }))}
                    placeholder="a@x.ru, b@x.ru"
                  />
                </Box>
                <Box sx={{ mt: 1.5, display: 'flex', gap: 1 }}>
                  <Button startIcon={editingScheduleId ? <Edit /> : <Add />} onClick={handleAddSchedule}>
                    {editingScheduleId ? 'Сохранить изменения' : 'Добавить расписание'}
                  </Button>
                  {editingScheduleId && (
                    <Button
                      variant="text"
                      onClick={() => {
                        setEditingScheduleId(null);
                        setNewSchedule({
                          department: 'container_vladivostok',
                          frequency: 'daily',
                          reportType: 'planning_v2_segment',
                          time: '09:00',
                          daysOfWeek: [1, 2, 3, 4, 5],
                          dayOfMonth: 1,
                          recipientsText: '',
                        });
                      }}
                    >
                      Отмена
                    </Button>
                  )}
                </Box>
              </Paper>
            </TabPanel>
            <TabPanel value={tabValue} index={2}>
              <Typography variant="body1" paragraph>
                Интеграция с внешними системами.
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle2">Excel импорт/экспорт</Typography>
                <Typography variant="body2" color="textSecondary">
                  Настройки формата файлов.
                </Typography>
                <Button size="small" sx={{ mt: 1 }}>
                  Настроить
                </Button>
              </Paper>
              <SmtpConfigForm />
            </TabPanel>
          </>
        )}
        
      </Paper>
    </Box>
  );
};

export default SettingsPage;
  const SCHEDULER_TIMEZONE = 'Asia/Vladivostok';

  const normalizeTimeToFiveMinutes = (value: string): string => {
    const [hh = '09', mm = '00'] = value.split(':');
    const hour = Math.min(23, Math.max(0, Number(hh) || 0));
    const minuteRaw = Math.min(59, Math.max(0, Number(mm) || 0));
    const minute = Math.floor(minuteRaw / 5) * 5;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };
