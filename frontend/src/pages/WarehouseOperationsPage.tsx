import {
  AddCircleOutline,
  DirectionsCar,
  Logout,
  MiscellaneousServices,
  PhotoCamera,
  Search,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getWarehouseVehicles,
  WarehouseVehicle,
} from '../services/warehouse.api';
import WarehousePhotoDialog from '../components/warehouse/WarehousePhotoDialog';
import WarehouseServicesDialog from '../components/warehouse/WarehouseServicesDialog';

const formatOperationDateTime = (value: string) => new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Vladivostok',
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value));

const messageFromError = (error: unknown): string => {
  if (
    typeof error === 'object'
    && error !== null
    && 'response' in error
  ) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return error instanceof Error ? error.message : 'Не удалось выполнить операцию.';
};

export default function WarehouseOperationsPage() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<WarehouseVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [photoVehicle, setPhotoVehicle] = useState<WarehouseVehicle | null>(null);
  const [servicesVehicle, setServicesVehicle] = useState<WarehouseVehicle | null>(null);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getWarehouseVehicles({ status: 'on_site' });
      setVehicles(response.data);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  const filteredVehicles = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return vehicles;
    return vehicles.filter((vehicle) => [
      vehicle.warehouseNumber,
      vehicle.vin,
      vehicle.registrationNumber,
      vehicle.brand,
      vehicle.model,
      vehicle.counterparty.nameShort,
      vehicle.counterparty.nameFull,
    ].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [search, vehicles]);

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
            <CardContent sx={{ minHeight: 150 }}>
              <DirectionsCar color="primary" sx={{ fontSize: 42, mb: 1 }} />
              <Typography variant="h6">На стоянке</Typography>
              <Typography variant="h3" sx={{ mt: 0.5 }}>{vehicles.length}</Typography>
            </CardContent>
          </Card>
        </Box>

        <Box id="warehouse-on-site">
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
            gap={1.5}
            mb={1.5}
          >
            <Typography variant="h6">Техника на стоянке</Typography>
            <TextField
              size="small"
              placeholder="Складской номер, VIN, госномер"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && filteredVehicles.length === 1) {
                  setServicesVehicle(filteredVehicles[0]);
                }
              }}
              sx={{ minWidth: { sm: 360 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>
                ),
              }}
              helperText={
                search.trim() && filteredVehicles.length === 1
                  ? 'Нажмите Enter, чтобы открыть услуги найденного ТС'
                  : 'Поиск по складскому номеру, VIN, госномеру, марке или контрагенту'
              }
            />
            <Button
              variant="contained"
              startIcon={<MiscellaneousServices />}
              disabled={filteredVehicles.length !== 1}
              onClick={() => setServicesVehicle(filteredVehicles[0])}
            >
              Открыть услуги
            </Button>
          </Stack>

          {loading ? (
            <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>
          ) : filteredVehicles.length === 0 ? (
            <Alert severity="info">На стоянке нет подходящих ТС.</Alert>
          ) : (
            <Stack spacing={1.5}>
              {filteredVehicles.map((vehicle) => (
                <Card key={vehicle.id} variant="outlined">
                  <CardContent>
                    <Stack
                      direction={{ xs: 'column', md: 'row' }}
                      alignItems={{ xs: 'stretch', md: 'center' }}
                      justifyContent="space-between"
                      gap={2}
                    >
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography variant="h6">{vehicle.warehouseNumber}</Typography>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={vehicle.vehicleType === 'truck' ? 'Грузовой' : 'Легковой'}
                          />
                          <Chip size="small" color="success" label={`${vehicle.storageDays} сут.`} />
                        </Stack>
                        <Typography>{vehicle.brand} {vehicle.model}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {vehicle.vin || 'VIN не указан'} · {vehicle.registrationNumber || 'без госномера'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {vehicle.counterparty.nameShort || vehicle.counterparty.nameFull}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Принято: {formatOperationDateTime(vehicle.receivedAt)}
                        </Typography>
                      </Box>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <Button
                          variant="outlined"
                          startIcon={<MiscellaneousServices />}
                          onClick={() => setServicesVehicle(vehicle)}
                        >
                          Услуги
                        </Button>
                        <Button
                          variant="outlined"
                          startIcon={<PhotoCamera />}
                          onClick={() => setPhotoVehicle(vehicle)}
                        >
                          Фото
                        </Button>
                        <Button
                          variant="contained"
                          startIcon={<Logout />}
                          onClick={() => navigate(`/warehouse/issue?vehicleId=${vehicle.id}`)}
                        >
                          Выдать
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>

      <WarehousePhotoDialog
        open={Boolean(photoVehicle)}
        vehicle={photoVehicle}
        onClose={() => setPhotoVehicle(null)}
      />
      <WarehouseServicesDialog
        open={Boolean(servicesVehicle)}
        vehicle={servicesVehicle}
        onClose={() => setServicesVehicle(null)}
      />
    </Box>
  );
}
