import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { resetPassword } from '../services/api';

function useQueryParam(key: string): string | null {
  const location = useLocation();
  return useMemo(() => new URLSearchParams(location.search).get(key), [location.search, key]);
}

const ResetPasswordPage = () => {
  const token = useQueryParam('token');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!token) {
      setMessage({ type: 'error', text: 'Токен сброса пароля не найден.' });
      return;
    }
    if (password.length < 8) {
      setMessage({ type: 'error', text: 'Пароль должен быть не короче 8 символов.' });
      return;
    }
    if (password !== confirm) {
      setMessage({ type: 'error', text: 'Пароли не совпадают.' });
      return;
    }

    try {
      setLoading(true);
      await resetPassword({ token, password });
      setMessage({ type: 'success', text: 'Пароль успешно изменён. Теперь можно войти.' });
      setTimeout(() => navigate('/login'), 1500);
    } catch (err: any) {
      const errorText = err?.message || 'Не удалось изменить пароль. Попробуйте позже.';
      setMessage({ type: 'error', text: errorText });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" align="center" gutterBottom>
          Сброс пароля
        </Typography>
        <Typography variant="body2" align="center" color="textSecondary" sx={{ mb: 3 }}>
          Введите новый пароль для вашей учетной записи
        </Typography>

        {message && (
          <Alert severity={message.type} sx={{ mb: 2 }}>
            {message.text}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <TextField
            label="Новый пароль"
            type="password"
            fullWidth
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <TextField
            label="Повторите пароль"
            type="password"
            fullWidth
            margin="normal"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
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
              {loading ? 'Сохранение...' : 'Сохранить пароль'}
            </Button>
          </Box>
        </form>
      </Paper>
    </Container>
  );
};

export default ResetPasswordPage;
