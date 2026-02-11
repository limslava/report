import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Collapse,
  IconButton,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { useAuthStore } from '../store/auth-store';
import type { User } from '../store/auth-store';
import { login } from '../services/api';
import { useServiceHealth } from '../hooks/useServiceHealth';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryAfterSec, setRetryAfterSec] = useState<number | null>(null);
  const retryUntilKey = 'login-retry-until';
  const navigate = useNavigate();
  const { login: setAuth } = useAuthStore();
  const serviceHealth = useServiceHealth();

  useEffect(() => {
    const stored = localStorage.getItem(retryUntilKey);
    if (stored) {
      const retryUntil = Number(stored);
      if (Number.isFinite(retryUntil) && retryUntil > Date.now()) {
        const remaining = Math.ceil((retryUntil - Date.now()) / 1000);
        if (remaining > 0) {
          setRetryAfterSec(remaining);
        }
      } else {
        localStorage.removeItem(retryUntilKey);
      }
    }
  }, []);

  useEffect(() => {
    if (!retryAfterSec || retryAfterSec <= 0) {
      if (error.startsWith('Слишком много попыток входа.')) {
        setError('');
      }
      return;
    }
    const timer = window.setInterval(() => {
      setRetryAfterSec((prev) => {
        if (!prev || prev <= 1) {
          localStorage.removeItem(retryUntilKey);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAfterSec, error]);

  const formatRetryAfter = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    if (min > 0) {
      return `${min}м ${String(sec).padStart(2, '0')}с`;
    }
    return `${sec}с`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await login({ email, password });
      const { token, user } = response.data;
      
      if (!token || !user) {
        throw new Error('Неверный ответ сервера: отсутствует токен или данные пользователя');
      }

      // Проверяем, что user соответствует типу User
      if (!user.id || !user.email) {
        throw new Error('Неверная структура данных пользователя');
      }

      localStorage.removeItem(retryUntilKey);
      setRetryAfterSec(null);
      setAuth(token, user as User);
      navigate('/');
    } catch (err: unknown) {
      let errorMessage = 'Логин или пароль неверный';
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const axiosError = err as any;
        const status = axiosError.response?.status;
        if (status === 400 || status === 401 || status === 403) {
          errorMessage = 'Логин или пароль неверный';
        } else if (status === 429) {
          const retry = Number(
            axiosError.response?.data?.retryAfterSec
              ?? axiosError.response?.headers?.['retry-after']
          );
          if (Number.isFinite(retry) && retry > 0) {
            const retrySeconds = Math.ceil(retry);
            setRetryAfterSec(retrySeconds);
            localStorage.setItem(retryUntilKey, String(Date.now() + retrySeconds * 1000));
            errorMessage = `Слишком много попыток входа. Попробуйте снова через ${formatRetryAfter(Math.ceil(retry))}.`;
          } else {
            errorMessage = 'Слишком много попыток входа. Попробуйте снова позже.';
          }
        } else {
          errorMessage = axiosError.response?.data?.error || errorMessage;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message || errorMessage;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Collapse in={serviceHealth.isUnavailable}>
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={(
            <Box display="flex" alignItems="center" gap={1}>
              <Button color="inherit" size="small" onClick={() => serviceHealth.checkNow()}>
                Повторить
              </Button>
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
          {serviceHealth.message}
        </Alert>
      </Collapse>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" align="center" gutterBottom>
          Вход в систему
        </Typography>
        <Typography variant="body2" align="center" color="textSecondary" sx={{ mb: 3 }}>
          Система управления логистикой и отчетности
        </Typography>

        <form onSubmit={handleSubmit}>
          <TextField
            label="Email"
            type="email"
            fullWidth
            margin="normal"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <TextField
            label="Пароль"
            type="password"
            fullWidth
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={Boolean(error)}
            helperText={retryAfterSec && retryAfterSec > 0
              ? `Слишком много попыток входа. Попробуйте снова через ${formatRetryAfter(retryAfterSec)}.`
              : error || ' '}
            required
          />
          <Box sx={{ mt: 3 }}>
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading || Boolean(retryAfterSec && retryAfterSec > 0)}
            >
              {loading ? 'Вход...' : 'Войти'}
            </Button>
          </Box>
        </form>

        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="text"
            size="small"
            onClick={() => navigate('/forgot-password')}
          >
            Забыли пароль?
          </Button>
        </Box>

        <Typography variant="body2" align="center" sx={{ mt: 3 }}>
          Для доступа обратитесь к администратору
        </Typography>
      </Paper>
    </Container>
  );
};

export default LoginPage;
