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
import WarehousePageTitle from '../components/warehouse/WarehousePageTitle';
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
        <WarehousePageTitle
          title="Рабочая станция кладовщика"
          subtitle="Складская площадка · приём, фотофиксация, услуги и выдача ТС"
        />

        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

        {/* Мобильный сценарий: два главных действия — большими кнопками
            в столбик, счётчик стоянки — карточкой-ссылкой. На десктопе —
            прежняя сетка в три колонки. */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
            gap: { xs: 1.5, sm: 2 },
          }}
        >
          <Card
            sx={{
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              borderRadius: 3,
            }}
          >
            <CardActionArea
              onClick={() => navigate('/warehouse/reception')}
              sx={{ height: '100%', minHeight: { xs: 108, sm: 150 } }}
            >
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
                <AddCircleOutline sx={{ fontSize: { xs: 44, sm: 42 } }} />
                <Box>
                  <Typography sx={{ fontSize: { xs: 22, sm: 20 }, fontWeight: 800, lineHeight: 1.2 }}>
                    Принять ТС
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.85, display: { xs: 'none', sm: 'block' } }}>
                    Карточка, фотоосмотр, повреждения
                  </Typography>
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>

          <Card
            variant="outlined"
            sx={{ borderRadius: 3, borderWidth: 2, borderColor: 'primary.main' }}
          >
            <CardActionArea
              onClick={() => navigate('/warehouse/issue')}
              sx={{ height: '100%', minHeight: { xs: 108, sm: 150 } }}
            >
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
                <Logout color="primary" sx={{ fontSize: { xs: 44, sm: 42 } }} />
                <Box>
                  <Typography color="primary" sx={{ fontSize: { xs: 22, sm: 20 }, fontWeight: 800, lineHeight: 1.2 }}>
                    Выдать ТС
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                    Найти на стоянке и подтвердить выдачу
                  </Typography>
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardActionArea
              onClick={() => navigate('/warehouse/on-site')}
              sx={{ height: '100%', minHeight: { xs: 88, sm: 150 } }}
            >
              <CardContent
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  height: '100%',
                  justifyContent: { xs: 'space-between', sm: 'flex-start' },
                }}
              >
                <Stack direction="row" alignItems="center" gap={2}>
                  <DirectionsCar color="primary" sx={{ fontSize: { xs: 40, sm: 42 } }} />
                  <Typography sx={{ fontSize: { xs: 18, sm: 20 }, fontWeight: 700 }}>
                    На стоянке
                  </Typography>
                </Stack>
                <Typography sx={{ fontSize: { xs: 34, sm: 44 }, fontWeight: 800, color: 'primary.main' }}>
                  {vehicles.length}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Box>
      </Stack>
    </Box>
  );
}
