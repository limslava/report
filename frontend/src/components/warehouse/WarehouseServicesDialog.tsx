import { Edit } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
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
import { warehouseVehicleTypeLabel } from '../../constants/warehouse';

const unitShort = { operation: 'оп.', liter: 'л', day: 'сут.', wheel: 'кол.' };
const unitLabel = {
  operation: 'операция',
  liter: 'литр',
  day: 'сутки',
  wheel: 'колесо',
};
const AUTOMATIC_OPERATION_CODES = new Set(['vehicle_acceptance', 'vehicle_issue']);
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
      setCatalog(catalogResponse.data.filter(
        (service) => service.isOperational
          && service.isActive
          && !AUTOMATIC_OPERATION_CODES.has(service.code),
      ));
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

  const serviceStats = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    return new Map(catalog.map((service) => {
      const performed = items.filter((item) => item.serviceId === service.id);
      const performedToday = performed.filter(
        (item) => new Date(item.performedAt).toLocaleDateString('en-CA') === today,
      );
      return [service.id, { total: performed.length, today: performedToday.length }];
    }));
  }, [catalog, items]);

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
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <span>Дополнительные услуги · {vehicle?.warehouseNumber}</span>
          {vehicle && (
            <Chip
              size="small"
              variant="outlined"
              label={warehouseVehicleTypeLabel(vehicle.vehicleType)}
            />
          )}
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
          {!readOnly && vehicle?.status === 'on_site' && !editing && (
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>Быстрые услуги</Typography>
                <Typography variant="body2" color="text.secondary">
                  Нажмите на услугу, проверьте данные и подтвердите выполнение.
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                  gap: 1.25,
                }}
              >
                {catalog.map((service) => {
                  const stats = serviceStats.get(service.id) ?? { total: 0, today: 0 };
                  const isSelected = service.id === serviceId;
                  return (
                    <Paper
                      key={service.id}
                      variant="outlined"
                      component="button"
                      type="button"
                      disabled={saving}
                      onClick={() => selectService(service.id)}
                      sx={{
                        p: 1.25,
                        textAlign: 'left',
                        cursor: saving ? 'wait' : 'pointer',
                        borderColor: isSelected ? 'primary.main' : 'divider',
                        bgcolor: isSelected ? 'action.selected' : 'background.paper',
                        font: 'inherit',
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="flex-start">
                        <Checkbox checked={isSelected} tabIndex={-1} disableRipple sx={{ p: 0.25 }} />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" fontWeight={600}>{service.name}</Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Единица учёта: {unitLabel[service.unit]}
                          </Typography>
                          {stats.total > 0 && (
                            <Stack direction="row" spacing={0.75} mt={0.75} flexWrap="wrap">
                              {stats.today > 0 && (
                                <Chip size="small" color="success" label={`Сегодня × ${stats.today}`} />
                              )}
                              <Chip size="small" variant="outlined" label={`Всего × ${stats.total}`} />
                            </Stack>
                          )}
                        </Box>
                      </Stack>
                    </Paper>
                  );
                })}
              </Box>

              {selected && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={2}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      Подтверждение · {selected.name}
                    </Typography>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                      <TextField
                        type="number"
                        label={selected.unit === 'liter'
                        ? 'Фактически залито, л'
                          : `Количество, ${unitShort[selected.unit]}`}
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                        inputProps={{ min: 0.001, step: 0.001 }}
                        fullWidth
                      />
                      <TextField
                        type="datetime-local"
                        label="Выполнено"
                        InputLabelProps={{ shrink: true }}
                        value={performedAt}
                        onChange={(event) => setPerformedAt(event.target.value)}
                        fullWidth
                      />
                    </Stack>
                    <Alert severity="info">
                      Будет зафиксирован факт выполнения услуги. Стоимость рассчитает финансовый блок по действующим тарифам.
                    </Alert>
                    <TextField
                      label="Комментарий"
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      multiline
                      minRows={2}
                    />
                    <Stack direction="row" justifyContent="flex-end" spacing={1}>
                      <Button
                        onClick={() => {
                          setServiceId('');
                          setQuantity('1');
                          setComment('');
                        }}
                        disabled={saving}
                      >
                        Отмена
                      </Button>
                      <Button
                        variant="contained"
                        onClick={() => void saveNew()}
                        disabled={saving || Number(quantity) <= 0}
                      >
                        Подтвердить выполнение
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              )}
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
