import { Edit } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import {
  createWarehouseTariff,
  getWarehouseServices,
  updateWarehouseService,
  WarehouseServiceDefinition,
} from '../../services/warehouse.api';

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' });
const unitLabels = { operation: 'операция', liter: 'литр', day: 'сутки' };

const messageFromError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return 'Не удалось сохранить тариф.';
};

export default function WarehouseTariffsPanel() {
  const [services, setServices] = useState<WarehouseServiceDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<WarehouseServiceDefinition | null>(null);
  const [validFrom, setValidFrom] = useState(today());
  const [passengerPrice, setPassengerPrice] = useState('');
  const [truckPrice, setTruckPrice] = useState('');
  const [defaultQuantity, setDefaultQuantity] = useState('1');
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getWarehouseServices();
      setServices(response.data);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openEdit = (service: WarehouseServiceDefinition) => {
    setEditing(service);
    setValidFrom(today());
    setPassengerPrice(service.currentTariffs.passenger?.price?.toString() ?? '');
    setTruckPrice(service.currentTariffs.truck?.price?.toString() ?? '');
    setDefaultQuantity(service.defaultQuantity === null ? '' : String(service.defaultQuantity));
    setIsActive(service.isActive);
    setError(null);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await updateWarehouseService(editing.id, {
        defaultQuantity: defaultQuantity === '' ? null : Number(defaultQuantity),
        isActive,
      });
      const tariffRequests = [];
      if (
        passengerPrice !== ''
        && Number(passengerPrice) !== editing.currentTariffs.passenger?.price
      ) {
        tariffRequests.push(createWarehouseTariff(editing.id, {
          vehicleType: 'passenger',
          price: Number(passengerPrice),
          validFrom,
        }));
      }
      if (
        truckPrice !== ''
        && Number(truckPrice) !== editing.currentTariffs.truck?.price
      ) {
        tariffRequests.push(createWarehouseTariff(editing.id, {
          vehicleType: 'truck',
          price: Number(truckPrice),
          validFrom,
        }));
      }
      await Promise.all(tariffRequests);
      setSuccess(`Настройки услуги «${editing.name}» сохранены.`);
      setEditing(null);
      await load();
    } catch (saveError) {
      setError(messageFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6">Услуги и тарифы</Typography>
        <Typography variant="body2" color="text.secondary">
          Цены задаются отдельно для легковых и грузовых ТС. Новая цена действует с указанной даты.
        </Typography>
      </Box>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Услуга</TableCell>
              <TableCell>Единица</TableCell>
              <TableCell align="right">Легковой</TableCell>
              <TableCell align="right">Грузовой</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell align="right">Настройка</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {services.map((service) => (
              <TableRow key={service.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{service.name}</Typography>
                  {!service.isOperational && (
                    <Typography variant="caption" color="text.secondary">
                      Рассчитывается автоматически по календарным суткам
                    </Typography>
                  )}
                  {(service.code === 'vehicle_acceptance' || service.code === 'vehicle_issue') && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Начисляется автоматически по факту складской операции
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{unitLabels[service.unit]}</TableCell>
                <TableCell align="right">
                  {service.currentTariffs.passenger
                    ? `${money.format(service.currentTariffs.passenger.price)}${service.unit === 'liter' ? ' / л' : ''}`
                    : 'Не задан'}
                </TableCell>
                <TableCell align="right">
                  {service.currentTariffs.truck
                    ? `${money.format(service.currentTariffs.truck.price)}${service.unit === 'liter' ? ' / л' : ''}`
                    : 'Не задан'}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={service.isActive ? 'success' : 'default'}
                    label={service.isActive ? 'Активна' : 'Отключена'}
                  />
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Настроить">
                    <IconButton size="small" onClick={() => openEdit(service)}>
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(editing)} onClose={() => !saving && setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>{editing?.name}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {editing?.unit !== 'liter' && (
              <TextField
                type="number"
                label="Количество по умолчанию"
                value={defaultQuantity}
                onChange={(event) => setDefaultQuantity(event.target.value)}
                inputProps={{ min: 0.001, step: 0.001 }}
              />
            )}
            <TextField
              type="date"
              label="Новые цены действуют с"
              InputLabelProps={{ shrink: true }}
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                type="number"
                label={editing?.unit === 'liter' ? 'Легковой, ₽/л' : 'Легковой, ₽'}
                value={passengerPrice}
                onChange={(event) => setPassengerPrice(event.target.value)}
                inputProps={{ min: 0, step: 0.01 }}
              />
              <TextField
                fullWidth
                type="number"
                label={editing?.unit === 'liter' ? 'Грузовой, ₽/л' : 'Грузовой, ₽'}
                value={truckPrice}
                onChange={(event) => setTruckPrice(event.target.value)}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Stack>
            <FormControlLabel
              control={<Switch checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />}
              label="Услуга активна"
            />
            <Alert severity="info">
              {editing?.unit === 'liter'
                ? 'Здесь задаётся стоимость одного литра. Фактическое количество вводит кладовщик.'
                : 'Если цена не изменилась, новая версия тарифа не создаётся.'}
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)} disabled={saving}>Отмена</Button>
          <Button
            variant="contained"
            onClick={() => void save()}
            disabled={saving || !validFrom}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
