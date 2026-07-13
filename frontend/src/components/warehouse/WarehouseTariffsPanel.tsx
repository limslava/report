import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import {
  createWarehouseTariff,
  getWarehouseServices,
  updateWarehouseService,
  WarehouseServiceDefinition,
  WarehouseVehicleType,
} from '../../services/warehouse.api';
import {
  WAREHOUSE_VEHICLE_TYPES,
  warehouseVehicleTypeLabel,
} from '../../constants/warehouse';

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' });
const unitLabels = { operation: 'операция', liter: 'литр', day: 'сутки', wheel: 'колесо' };
const tariffColumnWidths: Record<WarehouseVehicleType, number> = {
  passenger: 140,
  light_commercial: 220,
  truck: 120,
  trailer: 128,
  special: 106,
  motorcycle: 106,
};

const messageFromError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return 'Не удалось сохранить тариф.';
};

const tariffValidFromSummary = (service: WarehouseServiceDefinition) => {
  const dates = Array.from(new Set(
    WAREHOUSE_VEHICLE_TYPES
      .map((type) => service.currentTariffs[type]?.validFrom)
      .filter((value): value is string => Boolean(value)),
  ));
  if (dates.length === 0) return '—';
  if (dates.length === 1) return dates[0];
  return 'Разные даты';
};

const tariffValidFromTitle = (service: WarehouseServiceDefinition) => WAREHOUSE_VEHICLE_TYPES
  .map((type) => {
    const date = service.currentTariffs[type]?.validFrom;
    return date ? `${warehouseVehicleTypeLabel(type)}: ${date}` : null;
  })
  .filter((value): value is string => Boolean(value))
  .join('\n');

export default function WarehouseTariffsPanel() {
  const [services, setServices] = useState<WarehouseServiceDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<WarehouseServiceDefinition | null>(null);
  const [validFrom, setValidFrom] = useState(today());
  const [prices, setPrices] = useState<Record<WarehouseVehicleType, string>>(() =>
    Object.fromEntries(WAREHOUSE_VEHICLE_TYPES.map((type) => [type, ''])) as Record<WarehouseVehicleType, string>);
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
    setPrices(
      Object.fromEntries(
        WAREHOUSE_VEHICLE_TYPES.map((type) => [
          type,
          service.currentTariffs[type]?.price?.toString() ?? '',
        ]),
      ) as Record<WarehouseVehicleType, string>,
    );
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
      const tariffRequests = WAREHOUSE_VEHICLE_TYPES
        .filter((type) => prices[type] !== ''
          && Number(prices[type]) !== editing.currentTariffs[type]?.price)
        .map((type) => createWarehouseTariff(editing.id, {
          vehicleType: type,
          price: Number(prices[type]),
          validFrom,
        }));
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
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}
      <TableContainer component={Paper} variant="outlined">
        <Table
          size="small"
          sx={{
            minWidth: 1320,
            tableLayout: 'fixed',
            '& th, & td': {
              borderColor: '#d0d7de',
              borderRight: '1px solid #d0d7de',
              fontSize: '10px',
              lineHeight: 1.25,
              py: '6px',
              px: '8px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
            '& th:last-of-type, & td:last-of-type': {
              borderRight: 0,
            },
            '& thead th': {
              backgroundColor: '#f4f7fb',
              color: '#27364b',
              fontWeight: 700,
              height: 44,
              whiteSpace: 'normal',
              overflow: 'visible',
              textOverflow: 'clip',
              lineHeight: 1.15,
            },
            '& tbody tr:nth-of-type(odd) td': {
              backgroundColor: '#f8fbff',
            },
            '& tbody tr:hover td': {
              backgroundColor: '#eef5ff',
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 300 }}>Услуга</TableCell>
              <TableCell sx={{ width: 72 }}>Единица</TableCell>
              <TableCell sx={{ width: 96 }}>Действует с</TableCell>
              {WAREHOUSE_VEHICLE_TYPES.map((type) => (
                <TableCell key={type} align="right" sx={{ width: tariffColumnWidths[type] }}>
                  {warehouseVehicleTypeLabel(type)}
                </TableCell>
              ))}
              <TableCell sx={{ width: 70 }}>Статус</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {services.map((service) => (
              <TableRow
                key={service.id}
                hover
                title="Двойной клик откроет настройку услуги"
                onDoubleClick={() => openEdit(service)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell sx={{ fontWeight: 600 }}>
                  {service.name}
                </TableCell>
                <TableCell>{unitLabels[service.unit]}</TableCell>
                <TableCell title={tariffValidFromTitle(service)}>
                  {tariffValidFromSummary(service)}
                </TableCell>
                {WAREHOUSE_VEHICLE_TYPES.map((type) => (
                  <TableCell key={type} align="right" sx={{ width: tariffColumnWidths[type] }}>
                    {service.currentTariffs[type]
                      ? `${money.format(service.currentTariffs[type].price)}${service.unit === 'liter' ? ' / л' : ''}`
                      : 'Не задан'}
                  </TableCell>
                ))}
                <TableCell>{service.isActive ? 'Активна' : 'Отключена'}</TableCell>
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
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
              {WAREHOUSE_VEHICLE_TYPES.map((type) => (
                <TextField
                  key={type}
                  fullWidth
                  type="number"
                  label={`${warehouseVehicleTypeLabel(type)}, ${editing?.unit === 'liter' ? '₽/л' : '₽'}`}
                  value={prices[type]}
                  onChange={(event) => setPrices((current) => ({
                    ...current,
                    [type]: event.target.value,
                  }))}
                  inputProps={{ min: 0, step: 0.01 }}
                />
              ))}
            </Box>
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
