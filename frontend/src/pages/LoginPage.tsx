import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
} from '@mui/material';
import { useAuthStore } from '../store/auth-store';
import type { User } from '../store/auth-store';
import { login } from '../services/api';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login: setAuth } = useAuthStore();

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

      setAuth(token, user as User);
      navigate('/');
    } catch (err: unknown) {
      let errorMessage = 'Логин или пароль неверный';
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const axiosError = err as any;
        const status = axiosError.response?.status;
        if (status === 400 || status === 401 || status === 403) {
          errorMessage = 'Логин или пароль неверный';
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
            helperText={error || ' '}
            required
          />
          <Box sx={{ mt: 3 }}>
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
            >
              {loading ? 'Вход...' : 'Войти'}
            </Button>
          </Box>
        </form>

        <Typography variant="body2" align="center" sx={{ mt: 3 }}>
          Для доступа обратитесь к администратору
        </Typography>
      </Paper>
    </Container>
  );
};

export default LoginPage;
