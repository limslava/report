import { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material';
import { getHhSettings, updateHhSettings } from '../../services/hh.api';
import type { HhConnectionDto } from '../../types/hh';

export default function HhConnectionPanel() {
  const [settings, setSettings] = useState<HhConnectionDto | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [userAgent, setUserAgent] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    const response = await getHhSettings();
    const data = response.data;
    setSettings(data);
    setClientId(data.clientId ?? '');
    setRedirectUri(data.redirectUri ?? '');
    setUserAgent(data.userAgent ?? '');
  };

  useEffect(() => {
    load().catch((error) => {
      setMessage({ type: 'error', text: error?.response?.data?.message || error?.message || 'Не удалось загрузить настройки hh.ru' });
    });
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const response = await updateHhSettings({
        clientId,
        clientSecret: clientSecret || undefined,
        redirectUri,
        userAgent,
      });
      setSettings(response.data);
      setClientSecret('');
      setMessage({ type: 'success', text: 'Настройки hh.ru сохранены' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.response?.data?.message || error?.message || 'Не удалось сохранить настройки hh.ru' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography variant="h6">Интеграция hh.ru</Typography>
        <Typography variant="body2" color="text.secondary">
          Подключение работодателя через OAuth 2.0 и подготовка вебхуков модуля HR.
        </Typography>
      </Box>

      {message && <Alert severity={message.type}>{message.text}</Alert>}
      {!settings?.configured && (
        <Alert severity="info">
          Укажите параметры приложения hh.ru. Для сохранения secret на backend должен быть задан `HH_CRYPTO_KEY`.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 1.5 }}>
        <TextField label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} size="small" />
        <TextField
          label="Client Secret"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          type="password"
          size="small"
          placeholder={settings?.clientSecretMask ?? ''}
          helperText={settings?.clientSecretMask ? 'Оставьте пустым, чтобы не менять secret' : 'Будет сохранён зашифрованно'}
        />
        <TextField label="Redirect URI" value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} size="small" />
        <TextField label="User-Agent" value={userAgent} onChange={(e) => setUserAgent(e.target.value)} size="small" placeholder="ReportHR/1.0 (it@example.ru)" />
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Статус подключения</Typography>
        <Typography variant="body2" color="text.secondary">Статус: {settings?.status ?? 'disconnected'}</Typography>
        <Typography variant="body2" color="text.secondary">Работодатель: {settings?.employer?.name ?? 'не подключён'}</Typography>
        <Typography variant="body2" color="text.secondary">Менеджер: {settings?.manager?.name ?? 'не подключён'}</Typography>
        <Typography variant="body2" color="text.secondary">Webhook secret: {settings?.webhookSecretMask ?? 'не создан'}</Typography>
      </Paper>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Сохранение...' : 'Сохранить настройки'}
        </Button>
        <Button variant="outlined" disabled>
          Подключить аккаунт hh
        </Button>
      </Box>
    </Box>
  );
}
