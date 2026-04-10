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
  Chip,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
} from '@mui/material';
import { Delete, Add, Edit, ExpandMore } from '@mui/icons-material';
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
import { financialPlanApi } from '../services/financial-plan.api';
import { FinancialVatRate } from '../types/financial-plan.types';
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

const SCHEDULER_TIMEZONE = 'Asia/Vladivostok';

const normalizeTimeToFiveMinutes = (value: string): string => {
  const [hh = '09', mm = '00'] = value.split(':');
  const hour = Math.min(23, Math.max(0, Number(hh) || 0));
  const minuteRaw = Math.min(59, Math.max(0, Number(mm) || 0));
  const minute = Math.floor(minuteRaw / 5) * 5;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const TIME_OPTIONS_5_MINUTES = Array.from({ length: 24 * 12 }, (_, index) => {
  const hour = Math.floor(index / 12);
  const minute = (index % 12) * 5;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
});

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
  const [editSchedule, setEditSchedule] = useState<typeof newSchedule | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [expandedScheduleId, setExpandedScheduleId] = useState<string | false>(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [appTitle, setAppTitle] = useState('Логистика & Отчетность');
  const [appTitleMessage, setAppTitleMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingAppTitle, setSavingAppTitle] = useState(false);
  const currentYear = new Date().getFullYear();
  const [vatYear, setVatYear] = useState(currentYear);
  const [vatRates, setVatRates] = useState<FinancialVatRate[]>([]);
  const [vatWarning, setVatWarning] = useState(false);
  const [vatLoading, setVatLoading] = useState(false);
  const [vatMessage, setVatMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [vatDate, setVatDate] = useState('');
  const [vatRate, setVatRate] = useState('');
  const [vatSaving, setVatSaving] = useState(false);
  const [vatShowAll, setVatShowAll] = useState(false);

  const renderRecipients = (recipients: string[] = []) => {
    const visible = recipients.slice(0, 3);
    const hidden = recipients.slice(3);
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {visible.map((email) => (
          <Chip key={email} size="small" label={email} variant="outlined" />
        ))}
        {hidden.length > 0 && (
          <Tooltip title={hidden.join(', ')}>
            <Chip size="small" label={`+${hidden.length}`} variant="outlined" />
          </Tooltip>
        )}
      </Box>
    );
  };

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

  const loadVatRates = async (yearValue: number = vatYear) => {
    if (!isAdmin) return;
    try {
      setVatLoading(true);
      setVatMessage(null);
      const response = await financialPlanApi.getVatRates(yearValue);
      setVatRates(response.rates ?? []);
      setVatWarning(Boolean(response.warning));
    } catch {
      setVatMessage({ type: 'error', text: 'Не удалось загрузить ставки НДС' });
    } finally {
      setVatLoading(false);
    }
  };

  useEffect(() => {
    loadVatRates();
  }, [isAdmin, vatYear]);

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

      await createEmailSchedule({
        department: newSchedule.department,
        frequency: newSchedule.frequency,
        schedule,
        recipients,
      });
      setEmailMessage({ type: 'success', text: 'Расписание добавлено' });
      setNewSchedule((prev) => ({ ...prev, recipientsText: '' }));
      await loadEmailSchedules();
    } catch {
      setEmailMessage({ type: 'error', text: 'Ошибка при создании расписания' });
    }
  };

  const handleEditSchedule = (item: any) => {
    setEditingScheduleId(item.id);
    setEditSchedule({
      department: item.department ?? 'container_vladivostok',
      frequency: item.frequency ?? 'daily',
      reportType: item.schedule?.reportType ?? 'planning_v2_segment',
      time: normalizeTimeToFiveMinutes(item.schedule?.time ?? '09:00'),
      daysOfWeek: item.schedule?.daysOfWeek ?? [1, 2, 3, 4, 5],
      dayOfMonth: item.schedule?.dayOfMonth ?? 1,
      recipientsText: (item.recipients ?? []).join(', '),
    });
    setEditDialogOpen(true);
  };

  const handleSaveEditSchedule = async () => {
    if (!editingScheduleId || !editSchedule) return;
    const recipients = editSchedule.recipientsText
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      setEmailMessage({ type: 'error', text: 'Укажите хотя бы один email получателя' });
      return;
    }

    try {
      const schedule: any = { time: normalizeTimeToFiveMinutes(editSchedule.time), timezone: SCHEDULER_TIMEZONE };
      schedule.reportType = editSchedule.reportType;
      if (editSchedule.frequency === 'weekly') {
        schedule.daysOfWeek = editSchedule.daysOfWeek;
      }
      if (editSchedule.frequency === 'monthly') {
        schedule.dayOfMonth = editSchedule.dayOfMonth;
      }

      await updateEmailSchedule(editingScheduleId, {
        department: editSchedule.department,
        frequency: editSchedule.frequency,
        schedule,
        recipients,
      });
      setEmailMessage({ type: 'success', text: 'Расписание обновлено' });
      setEditDialogOpen(false);
      setEditingScheduleId(null);
      setEditSchedule(null);
      await loadEmailSchedules();
    } catch {
      setEmailMessage({ type: 'error', text: 'Ошибка при обновлении расписания' });
    }
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

  const handleAddVatRate = async () => {
    if (!isAdmin || !vatDate || !vatRate) return;
    const rateValue = Number(vatRate.replace(',', '.'));
    if (!Number.isFinite(rateValue)) {
      setVatMessage({ type: 'error', text: 'Некорректная ставка НДС' });
      return;
    }

    try {
      setVatSaving(true);
      setVatMessage(null);
      await financialPlanApi.addVatRate({ effectiveFrom: vatDate, rate: rateValue });
      setVatDate('');
      setVatRate('');
      setVatMessage({ type: 'success', text: 'Ставка НДС сохранена' });
      await loadVatRates();
    } catch {
      setVatMessage({ type: 'error', text: 'Не удалось сохранить ставку НДС' });
    } finally {
      setVatSaving(false);
    }
  };

  // Динамические вкладки в зависимости от роли
  const tabs = [
    { label: 'Профиль', show: true },
    { label: 'Уведомления', show: isAdmin },
    { label: 'Почта', show: isAdmin },
    { label: 'НДС', show: isAdmin },
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1 }}>
                <Typography variant="h6">Настройка email-рассылки</Typography>
                <Button variant="contained" startIcon={<Add />} onClick={() => setAddDialogOpen(true)}>
                  Добавить расписание
                </Button>
              </Box>
              {emailMessage && (
                <Alert severity={emailMessage.type} sx={{ mb: 2 }}>
                  {emailMessage.text}
                </Alert>
              )}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {emailSchedules.map((schedule) => {
                  const title =
                    schedule.schedule?.reportType === 'sv_pdf'
                      ? `${frequencyLabels[schedule.frequency] ?? schedule.frequency} • ${schedule.schedule?.time ?? '--:--'} • СВ отчет`
                      : schedule.schedule?.reportType === 'monthly_final'
                        ? `${frequencyLabels[schedule.frequency] ?? schedule.frequency} • ${schedule.schedule?.time ?? '--:--'} • СВ за месяц`
                        : `${frequencyLabels[schedule.frequency] ?? schedule.frequency} • ${schedule.schedule?.time ?? '--:--'} • ${departmentLabels[schedule.department] ?? schedule.department}`;
                  return (
                    <Accordion
                      key={schedule.id}
                      variant="outlined"
                      disableGutters
                      expanded={expandedScheduleId === schedule.id}
                      onChange={(_event, isExpanded) =>
                        setExpandedScheduleId(isExpanded ? schedule.id : false)
                      }
                    >
                      <AccordionSummary expandIcon={<ExpandMore />}>
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                          <Typography variant="subtitle1">{title}</Typography>
                          {expandedScheduleId !== schedule.id && (
                            <Typography variant="caption" color="text.secondary">
                              Получатели: {(schedule.recipients ?? []).slice(0, 3).join(', ')}
                              {(schedule.recipients ?? []).length > 3
                                ? ` +${(schedule.recipients ?? []).length - 3}`
                                : ''}
                            </Typography>
                          )}
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
                            <Typography variant="caption" color="text.secondary">
                              Получатели:
                            </Typography>
                            {renderRecipients(schedule.recipients ?? [])}
                          </Box>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: 1,
                            }}
                          >
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                                {schedule.schedule?.reportType === 'sv_pdf'
                                  ? 'Отчет: СВ (Excel из данных)'
                                  : schedule.schedule?.reportType === 'monthly_final'
                                    ? 'Отчет: СВ за месяц (итоговый)'
                                    : 'Отчет: Планирование v2'}
                              </Typography>
                              {schedule.frequency === 'weekly' && (schedule.schedule?.daysOfWeek ?? []).length > 0 ? (
                                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                                  {`Дни: ${(schedule.schedule?.daysOfWeek ?? [])
                                    .map((d: number) => (['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][d - 1] ?? String(d)))
                                    .join(', ')}`}
                                </Typography>
                              ) : null}
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              <FormControlLabel
                                sx={{ m: 0, alignItems: 'center' }}
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
                          </Box>
                        </Box>
                      </AccordionDetails>
                    </Accordion>
                  );
                })}
                {!emailLoading && emailSchedules.length === 0 && (
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2">Расписания пока не созданы</Typography>
                  </Paper>
                )}
              </Box>
              <Dialog
                open={addDialogOpen}
                onClose={() => setAddDialogOpen(false)}
                fullWidth
                maxWidth="md"
              >
                <DialogTitle>Новое расписание</DialogTitle>
                <DialogContent sx={{ pt: 1 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 1.5, mt: 1 }}>
                    <TextField
                      select
                      label="Тип отчета"
                      size="small"
                      value={newSchedule.reportType}
                      onChange={(e) =>
                        setNewSchedule((prev) => ({
                          ...prev,
                          reportType: e.target.value,
                          frequency: e.target.value === 'monthly_final' ? 'monthly' : prev.frequency,
                        }))
                      }
                    >
                      <MenuItem value="planning_v2_segment">Планирование v2 по сегменту</MenuItem>
                      <MenuItem value="sv_pdf">СВ (Excel из данных системы)</MenuItem>
                      <MenuItem value="monthly_final">СВ за месяц (итоговый)</MenuItem>
                    </TextField>
                    <TextField
                      select
                      label="Направление"
                      size="small"
                      value={newSchedule.department}
                      onChange={(e) => setNewSchedule((prev) => ({ ...prev, department: e.target.value }))}
                      disabled={newSchedule.reportType !== 'planning_v2_segment'}
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
                      disabled={newSchedule.reportType === 'monthly_final'}
                    >
                      <MenuItem value="daily">Ежедневно</MenuItem>
                      <MenuItem value="weekly">Еженедельно</MenuItem>
                      <MenuItem value="monthly">Ежемесячно</MenuItem>
                    </TextField>
                    <TextField
                      select
                      label="Время"
                      size="small"
                      value={normalizeTimeToFiveMinutes(newSchedule.time)}
                      onChange={(e) => setNewSchedule((prev) => ({ ...prev, time: e.target.value }))}
                      helperText="Время по Владивостоку (UTC+10)"
                    >
                      {TIME_OPTIONS_5_MINUTES.map((time) => (
                        <MenuItem key={time} value={time}>
                          {time}
                        </MenuItem>
                      ))}
                    </TextField>
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
                </DialogContent>
                <DialogActions sx={{ pr: 3, pb: 2 }}>
                  <Button onClick={() => setAddDialogOpen(false)} variant="text">
                    Отмена
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={async () => {
                      await handleAddSchedule();
                      setAddDialogOpen(false);
                    }}
                  >
                    Добавить
                  </Button>
                </DialogActions>
              </Dialog>
              <Dialog
                open={editDialogOpen}
                onClose={() => {
                  setEditDialogOpen(false);
                  setEditingScheduleId(null);
                  setEditSchedule(null);
                }}
                fullWidth
                maxWidth="md"
              >
                <DialogTitle>Редактирование расписания</DialogTitle>
                <DialogContent sx={{ pt: 1 }}>
                  {editSchedule && (
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 1.5, mt: 1 }}>
                      <TextField
                        select
                        label="Тип отчета"
                        size="small"
                        value={editSchedule.reportType}
                        onChange={(e) =>
                          setEditSchedule((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  reportType: e.target.value,
                                  frequency: e.target.value === 'monthly_final' ? 'monthly' : prev.frequency,
                                }
                              : prev
                          )
                        }
                      >
                        <MenuItem value="planning_v2_segment">Планирование v2 по сегменту</MenuItem>
                        <MenuItem value="sv_pdf">СВ (Excel из данных системы)</MenuItem>
                        <MenuItem value="monthly_final">СВ за месяц (итоговый)</MenuItem>
                      </TextField>
                      <TextField
                        select
                        label="Направление"
                        size="small"
                        value={editSchedule.department}
                        onChange={(e) =>
                          setEditSchedule((prev) => (prev ? { ...prev, department: e.target.value } : prev))
                        }
                        disabled={editSchedule.reportType !== 'planning_v2_segment'}
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
                        value={editSchedule.frequency}
                        onChange={(e) => setEditSchedule((prev) => (prev ? { ...prev, frequency: e.target.value } : prev))}
                        disabled={editSchedule.reportType === 'monthly_final'}
                      >
                        <MenuItem value="daily">Ежедневно</MenuItem>
                        <MenuItem value="weekly">Еженедельно</MenuItem>
                        <MenuItem value="monthly">Ежемесячно</MenuItem>
                      </TextField>
                      <TextField
                        select
                        label="Время"
                        size="small"
                        value={normalizeTimeToFiveMinutes(editSchedule.time)}
                        onChange={(e) => setEditSchedule((prev) => (prev ? { ...prev, time: e.target.value } : prev))}
                        helperText="Время по Владивостоку (UTC+10)"
                      >
                        {TIME_OPTIONS_5_MINUTES.map((time) => (
                          <MenuItem key={time} value={time}>
                            {time}
                          </MenuItem>
                        ))}
                      </TextField>
                      {editSchedule.frequency === 'monthly' && (
                        <TextField
                          label="День месяца"
                          type="number"
                          size="small"
                          value={editSchedule.dayOfMonth}
                          inputProps={{ min: 1, max: 31 }}
                          onChange={(e) =>
                            setEditSchedule((prev) =>
                              prev
                                ? { ...prev, dayOfMonth: Math.min(31, Math.max(1, Number(e.target.value) || 1)) }
                                : prev
                            )
                          }
                        />
                      )}
                      {editSchedule.frequency === 'weekly' && (
                        <TextField
                          select
                          SelectProps={{ multiple: true }}
                          label="Дни недели"
                          size="small"
                          value={editSchedule.daysOfWeek as any}
                          onChange={(e) => {
                            const next = (e.target.value as unknown as Array<string | number>).map((v) => Number(v));
                            setEditSchedule((prev) => (prev ? { ...prev, daysOfWeek: next } : prev));
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
                        value={editSchedule.recipientsText}
                        onChange={(e) => setEditSchedule((prev) => (prev ? { ...prev, recipientsText: e.target.value } : prev))}
                        placeholder="a@x.ru, b@x.ru"
                      />
                    </Box>
                  )}
                </DialogContent>
                <DialogActions sx={{ pr: 3, pb: 2 }}>
                  <Button
                    variant="text"
                    onClick={() => {
                      setEditDialogOpen(false);
                      setEditingScheduleId(null);
                      setEditSchedule(null);
                    }}
                  >
                    Отмена
                  </Button>
                  <Button variant="contained" startIcon={<Edit />} onClick={handleSaveEditSchedule}>
                    Сохранить
                  </Button>
                </DialogActions>
              </Dialog>
            </TabPanel>
            <TabPanel value={tabValue} index={2}>
              <SmtpConfigForm />
            </TabPanel>
            <TabPanel value={tabValue} index={3}>
              <Typography variant="h6" gutterBottom>
                НДС
              </Typography>
              {vatMessage && (
                <Alert severity={vatMessage.type} sx={{ mb: 2 }}>
                  {vatMessage.text}
                </Alert>
              )}
              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-end' }}>
                  <TextField
                    label="Год"
                    type="number"
                    size="small"
                    inputProps={{ min: 2020, max: 2100 }}
                    value={vatYear}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (Number.isInteger(next) && next >= 2020 && next <= 2100) {
                        setVatYear(next);
                      }
                    }}
                    sx={{ width: 120 }}
                  />
                  <TextField
                    label="Дата начала"
                    type="date"
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    value={vatDate}
                    onChange={(e) => setVatDate(e.target.value)}
                  />
                  <TextField
                    label="Ставка, %"
                    type="number"
                    size="small"
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    sx={{ width: 140 }}
                  />
                  <Button variant="outlined" onClick={handleAddVatRate} disabled={vatSaving || !vatDate || !vatRate}>
                    {vatSaving ? 'Сохранение...' : 'Добавить'}
                  </Button>
                </Box>
                {vatWarning && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    Нужно указать НДС
                  </Alert>
                )}
              </Paper>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle1">История ставок</Typography>
                  <Button size="small" onClick={() => setVatShowAll((prev) => !prev)}>
                    {vatShowAll ? 'Скрыть' : 'Показать все'}
                  </Button>
                </Box>
                {vatLoading ? (
                  <Typography variant="body2" color="text.secondary">Загрузка...</Typography>
                ) : vatRates.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">Нет данных</Typography>
                ) : (
                  <List dense sx={{ maxHeight: 260, overflowY: 'auto' }}>
                    {(vatShowAll ? vatRates : vatRates.slice(-5)).map((rate) => (
                      <ListItem key={rate.id} sx={{ py: 0.5 }}>
                        <ListItemText primary={`${rate.effectiveFrom} — ${rate.rate}%`} />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Paper>
            </TabPanel>
          </>
        )}
        
      </Paper>
    </Box>
  );
};

export default SettingsPage;
