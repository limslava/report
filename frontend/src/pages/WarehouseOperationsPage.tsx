import {
  AddCircleOutline,
  DirectionsCar,
  Logout,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Stack,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getWarehouseVehicles,
  WarehouseVehicle,
} from '../services/warehouse.api';

const messageFromError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return error instanceof Error ? error.message : 'Не удалось выполнить операцию.';
};

export default function WarehouseOperationsPage() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<WarehouseVehicle[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadVehicles = useCallback(async () => {
    setError(null);
    try {
      const response = await getWarehouseVehicles({ status: 'on_site' });
      setVehicles(response.data);
    } catch (loadError) {
      setError(messageFromError(loadError));
    }
  }, []);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadVehicles();
    }, 5000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadVehicles();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [loadVehicles]);

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1280, mx: 'auto' }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4" component="h1">Рабочая станция кладовщика</Typography>
          <Typography color="text.secondary">
            Складская площадка · приём, фотофиксация, услуги и выдача ТС
          </Typography>
        </Box>

        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
            gap: 2,
          }}
        >
          <Card variant="outlined">
            <CardActionArea
              onClick={() => navigate('/warehouse/reception')}
              sx={{ height: '100%', minHeight: 150 }}
            >
              <CardContent>
                <AddCircleOutline color="primary" sx={{ fontSize: 42, mb: 1 }} />
                <Typography variant="h6">Принять ТС</Typography>
                <Typography variant="body2" color="text.secondary">
                  Создать карточку, зафиксировать топливо и выполнить фотоосмотр
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>

          <Card variant="outlined">
            <CardActionArea
              onClick={() => navigate('/warehouse/issue')}
              sx={{ height: '100%', minHeight: 150 }}
            >
              <CardContent>
                <Logout color="primary" sx={{ fontSize: 42, mb: 1 }} />
                <Typography variant="h6">Выдать ТС</Typography>
                <Typography variant="body2" color="text.secondary">
                  Найти технику на стоянке и подтвердить выдачу
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>

          <Card variant="outlined">
            <CardActionArea
              onClick={() => navigate('/warehouse/on-site')}
              sx={{ height: '100%', minHeight: 150 }}
            >
              <CardContent>
                <DirectionsCar color="primary" sx={{ fontSize: 42, mb: 1 }} />
                <Typography variant="h6">На стоянке</Typography>
                <Typography variant="h3" sx={{ mt: 0.5 }}>{vehicles.length}</Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Box>
      </Stack>
    </Box>
  );
}
