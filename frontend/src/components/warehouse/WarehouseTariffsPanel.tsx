import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
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
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createWarehouseTariff,
  endWarehouseClientTariff,
  getWarehouseClients,
  getWarehouseClientTariffs,
  getWarehouseServices,
  updateWarehouseService,
  WarehouseClient,
  WarehouseClientTariff,
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
const INDIVIDUAL_COLOR = '#1d4ed8';

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

const emptyPrices = () =>
  Object.fromEntries(WAREHOUSE_VEHICLE_TYPES.map((type) => [type, ''])) as Record<WarehouseVehicleType, string>;

interface Props {
  /** базовый прайс: админ, заведующий складом, финансист */
  canManageBase: boolean;
  /** индивидуальные цены клиентов: админ и финансист */
  canManageIndividual: boolean;
}

/**
 * Услуги и тарифы. Переключатель «Прайс» показывает либо базовые цены для всех,
 * либо прайс выбранного клиента: индивидуальные цены выделены, где их нет —
 * серым показана действующая базовая.
 */
export default function WarehouseTariffsPanel({ canManageBase, canManageIndividual }: Props) {
  const [services, setServices] = useState<WarehouseServiceDefinition[]>([]);
  const [clients, setClients] = useState<WarehouseClient[]>([]);
  const [client, setClient] = useState<WarehouseClient | null>(null);
  const [history, setHistory] = useState<WarehouseClientTariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<WarehouseServiceDefinition | null>(null);
  const [validFrom, setValidFrom] = useState(today());
  const [prices, setPrices] = useState<Record<WarehouseVehicleType, string>>(emptyPrices);
  const [defaultQuantity, setDefaultQuantity] = useState('1');
  const [isActive, setIsActive] = useState(true);

  const counterpartyId = client?.counterpartyId ?? null;
  const canEdit = client ? canManageIndividual : canManageBase;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [servicesResponse, historyResponse] = await Promise.all([
        getWarehouseServices(undefined, counterpartyId),
        counterpartyId ? getWarehouseClientTariffs(counterpartyId) : Promise.resolve({ data: [] as WarehouseClientTariff[] }),
      ]);
      setServices(servicesResponse.data);
      setHistory(historyResponse.data);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setLoading(false);
    }
  }, [counterpartyId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    getWarehouseClients(true)
      .then((response) => setClients(response.data))
      .catch(() => undefined);
  }, []);

  const openEdit = (service: WarehouseServiceDefinition) => {
    if (!canEdit) return;
    setEditing(service);
    setValidFrom(today());
    setPrices(
      Object.fromEntries(
        WAREHOUSE_VEHICLE_TYPES.map((type) => {
          const current = service.currentTariffs[type];
          // в прайсе клиента поле заполнено только его индивидуальной ценой
          const value = client ? (current?.isIndividual ? current.price : null) : current?.price;
          return [type, value == null ? '' : String(value)];
        }),
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
      if (!client) {
        await updateWarehouseService(editing.id, {
          defaultQuantity: defaultQuantity === '' ? null : Number(defaultQuantity),
          isActive,
        });
      }
      const tariffRequests = WAREHOUSE_VEHICLE_TYPES
        .filter((type) => {
          if (prices[type] === '') return false;
          const current = editing.currentTariffs[type];
          const currentOwn = client ? (current?.isIndividual ? current.price : undefined) : current?.price;
          return Number(prices[type]) !== currentOwn;
        })
        .map((type) => createWarehouseTariff(editing.id, {
          vehicleType: type,
          price: Number(prices[type]),
          validFrom,
          counterpartyId,
        }));
      await Promise.all(tariffRequests);
      setSuccess(client
        ? `Индивидуальные цены «${editing.name}» для ${client.nameShort || client.nameFull} сохранены.`
        : `Настройки услуги «${editing.name}» сохранены.`);
      setEditing(null);
      await load();
    } catch (saveError) {
      setError(messageFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const resetToBase = async (type: WarehouseVehicleType) => {
    if (!editing || !client) return;
    setSaving(true);
    setError(null);
    try {
      await endWarehouseClientTariff(editing.id, {
        counterpartyId: client.counterpartyId,
        vehicleType: type,
        fromDate: validFrom,
      });
      setPrices((current) => ({ ...current, [type]: '' }));
      setSuccess(`С ${validFrom} для «${warehouseVehicleTypeLabel(type)}» действует базовая цена.`);
      setEditing(null);
      await load();
    } catch (resetError) {
      setError(messageFromError(resetError));
    } finally {
      setSaving(false);
    }
  };

  const clientOptions = useMemo(
    () => [...clients].sort((a, b) => Number(b.isActive) - Number(a.isActive)),
    [clients],
  );

  const renderPrice = (service: WarehouseServiceDefinition, type: WarehouseVehicleType) => {
    const tariff = service.currentTariffs[type];
    if (!tariff) return 'Не задан';
    const text = `${money.format(tariff.price)}${service.unit === 'liter' ? ' / л' : ''}`;
    if (!client) return text;
    if (tariff.isIndividual) {
      const basePrice = service.baseTariffs?.[type]?.price;
      return (
        <Box
          component="span"
          title={`Индивидуальная цена с ${tariff.validFrom}${basePrice != null ? ` · базовая ${money.format(basePrice)}` : ''}`}
          sx={{ color: INDIVIDUAL_COLOR, fontWeight: 700 }}
        >
          {text}
        </Box>
      );
    }
    return <Box component="span" sx={{ color: '#8b93a1' }} title="Базовая цена">{text}</Box>;
  };

  if (loading && services.length === 0) return <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>;

  return (
    <Stack spacing={1}>
      <Paper variant="outlined" sx={{ px: 1, py: 0.75 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
          <Autocomplete
            size="small"
            options={clientOptions}
            value={client}
            onChange={(_event, value) => setClient(value)}
            getOptionLabel={(option) => `${option.nameShort || option.nameFull} — ${option.inn}`}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                  <span style={{ flex: 1 }}>{option.nameShort || option.nameFull}</span>
                  {Boolean(option.individualTariffsCount) && (
                    <Chip size="small" label="инд. цены" sx={{ height: 18, fontSize: 10, color: INDIVIDUAL_COLOR }} />
                  )}
                </Stack>
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} label="Прайс" placeholder="Базовый прайс для всех клиентов" />
            )}
            sx={{ width: { xs: '100%', md: 380 } }}
          />
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1, fontSize: 12 }}>
            {client
              ? 'Синим — индивидуальные цены клиента, серым — действующие базовые. При расчёте цена клиента перекрывает базовую на своих датах.'
              : 'Базовые цены для всех клиентов. Выберите клиента, чтобы посмотреть или задать его индивидуальный прайс.'}
            {!canEdit && ' Режим просмотра.'}
          </Typography>
        </Stack>
      </Paper>

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
              backgroundColor: client ? '#eef4ff' : '#f4f7fb',
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
                title={canEdit
                  ? client ? 'Двойной клик — индивидуальные цены клиента' : 'Двойной клик откроет настройку услуги'
                  : undefined}
                onDoubleClick={() => openEdit(service)}
                sx={{ cursor: canEdit ? 'pointer' : 'default' }}
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
                    {renderPrice(service, type)}
                  </TableCell>
                ))}
                <TableCell>{service.isActive ? 'Активна' : 'Отключена'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {client && (
        <Paper variant="outlined" sx={{ px: 1.5, py: 1 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.5 }}>
            История индивидуальных цен — {client.nameShort || client.nameFull}
          </Typography>
          {history.length === 0 ? (
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              Индивидуальных цен нет — клиент обслуживается по базовому прайсу.
            </Typography>
          ) : (
            <Table size="small" sx={{ '& td, & th': { fontSize: 11, py: 0.4 } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Услуга</TableCell>
                  <TableCell>Тип ТС</TableCell>
                  <TableCell align="right">Цена</TableCell>
                  <TableCell>Действует с</TableCell>
                  <TableCell>по</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.serviceName}</TableCell>
                    <TableCell>{warehouseVehicleTypeLabel(item.vehicleType)}</TableCell>
                    <TableCell align="right">{money.format(item.price)}{item.unit === 'liter' ? ' / л' : ''}</TableCell>
                    <TableCell>{item.validFrom}</TableCell>
                    <TableCell>{item.validTo ?? 'бессрочно'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      )}

      <Dialog open={Boolean(editing)} onClose={() => !saving && setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          {editing?.name}
          {client && (
            <Typography sx={{ fontSize: 13, color: INDIVIDUAL_COLOR }}>
              Индивидуальные цены: {client.nameShort || client.nameFull}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {!client && editing?.unit !== 'liter' && (
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
              label={client ? 'Изменения цен клиента действуют с' : 'Новые цены действуют с'}
              InputLabelProps={{ shrink: true }}
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
              {WAREHOUSE_VEHICLE_TYPES.map((type) => {
                const current = editing?.currentTariffs[type];
                const basePrice = editing?.baseTariffs?.[type]?.price ?? (current?.isIndividual ? undefined : current?.price);
                const hasIndividual = Boolean(client && current?.isIndividual);
                return (
                  <Stack key={type} spacing={0.25}>
                    <TextField
                      fullWidth
                      type="number"
                      label={`${warehouseVehicleTypeLabel(type)}, ${editing?.unit === 'liter' ? '₽/л' : '₽'}`}
                      value={prices[type]}
                      placeholder={client && basePrice != null ? `базовая ${basePrice}` : undefined}
                      InputLabelProps={client ? { shrink: true } : undefined}
                      helperText={client
                        ? basePrice != null ? `Базовая: ${money.format(basePrice)}` : 'Базовая не задана'
                        : undefined}
                      onChange={(event) => setPrices((currentPrices) => ({
                        ...currentPrices,
                        [type]: event.target.value,
                      }))}
                      inputProps={{ min: 0, step: 0.01 }}
                    />
                    {hasIndividual && (
                      <Button
                        size="small"
                        color="inherit"
                        disabled={saving}
                        onClick={() => void resetToBase(type)}
                        sx={{ alignSelf: 'flex-start', fontSize: 11, py: 0 }}
                      >
                        Вернуть базовую с выбранной даты
                      </Button>
                    )}
                  </Stack>
                );
              })}
            </Box>
            {!client && (
              <FormControlLabel
                control={<Switch checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />}
                label="Услуга активна"
              />
            )}
            <Alert severity="info">
              {client
                ? 'Заполните цены, которые отличаются для этого клиента. Пустое поле — действует базовая цена. Уже начисленные услуги и закрытые периоды не пересчитываются.'
                : editing?.unit === 'liter'
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
