import { Edit } from '@mui/icons-material';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  correctWarehousePerformedService,
  getWarehousePerformedServices,
  getWarehouseServices,
  performWarehouseService,
  WarehousePerformedService,
  WarehouseServiceDefinition,
  WarehouseVehicle,
} from '../../services/warehouse.api';

const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' });
const unitShort = { operation: 'оп.', liter: 'л', day: 'сут.' };
const nowLocal = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const messageFromError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return 'Не удалось сохранить услугу.';
};

interface Props {
  open: boolean;
  vehicle: WarehouseVehicle | null;
  readOnly?: boolean;
  onClose: () => void;
}

export default function WarehouseServicesDialog({ open, vehicle, readOnly = false, onClose }: Props) {
  const [catalog, setCatalog] = useState<WarehouseServiceDefinition[]>([]);
  const [items, setItems] = useState<WarehousePerformedService[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [performedAt, setPerformedAt] = useState(nowLocal());
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState<WarehousePerformedService | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!vehicle) return;
    try {
      const [catalogResponse, itemsResponse] = await Promise.all([
        getWarehouseServices(performedAt.slice(0, 10)),
        getWarehousePerformedServices(vehicle.id),
      ]);
      setCatalog(catalogResponse.data.filter((service) => service.isOperational && service.isActive));
      setItems(itemsResponse.data);
    } catch (loadError) {
      setError(messageFromError(loadError));
    }
  }, [performedAt, vehicle]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const selected = useMemo(
    () => catalog.find((service) => service.id === serviceId) ?? null,
    [catalog, serviceId],
  );

  const selectService = (id: string) => {
    setServiceId(id);
    const service = catalog.find((item) => item.id === id);
    setQuantity(String(service?.defaultQuantity ?? 1));
  };

  const saveNew = async () => {
    if (!vehicle || !serviceId) return;
    setSaving(true);
    setError(null);
    try {
      await performWarehouseService(vehicle.id, {
        serviceId,
        performedAt: new Date(performedAt).toISOString(),
        quantity: Number(quantity),
        comment,
      });
      setServiceId('');
      setQuantity('1');
      setComment('');
      await load();
    } catch (saveError) {
      setError(messageFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const saveCorrection = async () => {
    if (!vehicle || !editing) return;
    setSaving(true);
    setError(null);
    try {
      await correctWarehousePerformedService(vehicle.id, editing.id, {
        quantity: Number(quantity),
        comment,
      });
      setEditing(null);
      setQuantity('1');
      setComment('');
      await load();
    } catch (saveError) {
      setError(messageFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} fullWidth maxWidth="md">
      <DialogTitle>
        Дополнительные услуги · {vehicle?.warehouseNumber}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
          {!readOnly && vehicle?.status === 'on_site' && !editing && (
            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={600}>Зафиксировать выполнение</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <FormControl fullWidth>
                  <InputLabel>Услуга</InputLabel>
                  <Select
                    label="Услуга"
                    value={serviceId}
                    onChange={(event) => selectService(event.target.value)}
                  >
                    {catalog.map((service) => (
                      <MenuItem
                        key={service.id}
                        value={service.id}
                        disabled={
                          !service.currentTariffs[vehicle?.vehicleType ?? 'passenger']
                          || (service.code === 'refuel' && service.defaultQuantity === null)
                        }
                      >
                        {service.name}
                        {!service.currentTariffs[vehicle?.vehicleType ?? 'passenger'] && ' · тариф не задан'}
                        {service.code === 'refuel' && service.defaultQuantity === null && ' · литры не заданы'}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  type="number"
                  label={`Количество${selected ? `, ${unitShort[selected.unit]}` : ''}`}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  inputProps={{ min: 0.001, step: 0.001 }}
                  sx={{ minWidth: 170 }}
                />
                <TextField
                  type="datetime-local"
                  label="Выполнено"
                  InputLabelProps={{ shrink: true }}
                  value={performedAt}
                  onChange={(event) => setPerformedAt(event.target.value)}
                  sx={{ minWidth: 220 }}
                />
              </Stack>
              {selected?.currentTariffs[vehicle?.vehicleType ?? 'passenger'] && (
                <Alert severity="info">
                  Тариф: {money.format(selected.currentTariffs[vehicle?.vehicleType ?? 'passenger']!.price)}
                  {' '}за {unitShort[selected.unit]}; сумма будет рассчитана автоматически.
                </Alert>
              )}
              <TextField
                label="Комментарий"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                multiline
                minRows={2}
              />
              <Stack direction="row" justifyContent="flex-end">
                <Button
                  variant="contained"
                  onClick={() => void saveNew()}
                  disabled={saving || !serviceId || Number(quantity) <= 0}
                >
                  Добавить услугу
                </Button>
              </Stack>
            </Stack>
          )}

          {editing && (
            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={600}>
                Исправление · {editing.serviceName}
              </Typography>
              <TextField
                type="number"
                label={`Количество, ${unitShort[editing.unit]}`}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputProps={{ min: 0.001, step: 0.001 }}
              />
              <TextField
                label="Комментарий"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                multiline
                minRows={2}
              />
              <Stack direction="row" justifyContent="flex-end" spacing={1}>
                <Button onClick={() => setEditing(null)} disabled={saving}>Отмена</Button>
                <Button variant="contained" onClick={() => void saveCorrection()} disabled={saving}>
                  Сохранить исправление
                </Button>
              </Stack>
            </Stack>
          )}

          <Typography variant="subtitle1" fontWeight={600}>История услуг</Typography>
          {items.length === 0 ? (
            <Alert severity="info">Для этого ТС услуги пока не зафиксированы.</Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Дата</TableCell>
                  <TableCell>Услуга</TableCell>
                  <TableCell align="right">Количество</TableCell>
                  <TableCell align="right">Тариф</TableCell>
                  <TableCell align="right">Сумма</TableCell>
                  <TableCell>Исполнитель</TableCell>
                  {!readOnly && <TableCell />}
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{new Date(item.performedAt).toLocaleString('ru-RU')}</TableCell>
                    <TableCell>
                      {item.serviceName}
                      {item.comment && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {item.comment}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">{item.quantity} {unitShort[item.unit]}</TableCell>
                    <TableCell align="right">{money.format(item.unitPrice)}</TableCell>
                    <TableCell align="right">{money.format(item.totalAmount)}</TableCell>
                    <TableCell>{item.performedByName}</TableCell>
                    {!readOnly && (
                      <TableCell align="right">
                        <Tooltip title="Исправить">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setEditing(item);
                              setQuantity(String(item.quantity));
                              setComment(item.comment ?? '');
                            }}
                          >
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}
