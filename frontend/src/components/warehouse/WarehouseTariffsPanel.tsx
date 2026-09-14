import { ExpandLess, ExpandMore } from '@mui/icons-material';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
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
  endWarehouseClientPriceList,
  getWarehouseClientPriceLists,
  getWarehouseClients,
  getWarehouseServices,
  saveWarehouseClientPriceList,
  updateWarehouseService,
  WarehouseClient,
  WarehouseClientPriceList,
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
const formatDate = (ymd: string) => ymd.split('-').reverse().join('.');
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

const priceKey = (serviceId: string, type: WarehouseVehicleType) => `${serviceId}:${type}`;

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

const tableSx = (tinted: boolean) => ({
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
    backgroundColor: tinted ? '#eef4ff' : '#f4f7fb',
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
});

interface Props {
  /** базовый прайс: админ, заведующий складом, финансист */
  canManageBase: boolean;
  /** индивидуальные прайсы клиентов: админ и финансист */
  canManageIndividual: boolean;
}

/**
 * Услуги и тарифы. Переключатель «Прайс» показывает базовые цены для всех или
 * прайс выбранного клиента. Ставки клиента заводятся целым прайсом с даты
 * (все позиции, даже неизменные); история прайсов раскрывается по клику.
 */
export default function WarehouseTariffsPanel({ canManageBase, canManageIndividual }: Props) {
  const [services, setServices] = useState<WarehouseServiceDefinition[]>([]);
  const [clients, setClients] = useState<WarehouseClient[]>([]);
  const [client, setClient] = useState<WarehouseClient | null>(null);
  const [priceLists, setPriceLists] = useState<WarehouseClientPriceList[]>([]);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // базовая услуга: правка одной строки
  const [editing, setEditing] = useState<WarehouseServiceDefinition | null>(null);
  const [validFrom, setValidFrom] = useState(today());
  const [prices, setPrices] = useState<Record<WarehouseVehicleType, string>>(() =>
    Object.fromEntries(WAREHOUSE_VEHICLE_TYPES.map((type) => [type, ''])) as Record<WarehouseVehicleType, string>);
  const [defaultQuantity, setDefaultQuantity] = useState('1');
  const [isActive, setIsActive] = useState(true);

  // прайс клиента: весь набор ставок с даты
  const [priceListOpen, setPriceListOpen] = useState(false);
  const [priceListFrom, setPriceListFrom] = useState(today());
  const [priceListValues, setPriceListValues] = useState<Record<string, string>>({});
  const [priceListDirty, setPriceListDirty] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [endFrom, setEndFrom] = useState(today());

  const counterpartyId = client?.counterpartyId ?? null;
  const clientName = client ? client.nameShort || client.nameFull : '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [servicesResponse, priceListsResponse] = await Promise.all([
        getWarehouseServices(undefined, counterpartyId),
        counterpartyId
          ? getWarehouseClientPriceLists(counterpartyId)
          : Promise.resolve({ data: [] as WarehouseClientPriceList[] }),
      ]);
      setServices(servicesResponse.data);
      setPriceLists(priceListsResponse.data);
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

  useEffect(() => { setExpandedVersion(null); }, [counterpartyId]);

  const clientOptions = useMemo(
    () => [...clients].sort((a, b) => Number(b.isActive) - Number(a.isActive)),
    [clients],
  );

  // действующий или будущий прайс клиента — есть что возвращать к базовому
  const hasActiveClientPriceList = Boolean(client) && priceLists.some(
    (version) => !version.validTo || version.validTo >= today(),
  );

  const openBaseEdit = (service: WarehouseServiceDefinition) => {
    if (!canManageBase) return;
    setEditing(service);
    setValidFrom(today());
    setPrices(
      Object.fromEntries(
        WAREHOUSE_VEHICLE_TYPES.map((type) => [type, service.currentTariffs[type]?.price?.toString() ?? '']),
      ) as Record<WarehouseVehicleType, string>,
    );
    setDefaultQuantity(service.defaultQuantity === null ? '' : String(service.defaultQuantity));
    setIsActive(service.isActive);
    setError(null);
  };

  const saveBase = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await updateWarehouseService(editing.id, {
        defaultQuantity: defaultQuantity === '' ? null : Number(defaultQuantity),
        isActive,
      });
      await Promise.all(WAREHOUSE_VEHICLE_TYPES
        .filter((type) => prices[type] !== '' && Number(prices[type]) !== editing.currentTariffs[type]?.price)
        .map((type) => createWarehouseTariff(editing.id, { vehicleType: type, price: Number(prices[type]), validFrom })));
      setSuccess(`Настройки услуги «${editing.name}» сохранены.`);
      setEditing(null);
      await load();
    } catch (saveError) {
      setError(messageFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const priceValuesFrom = (source: WarehouseServiceDefinition[]) => {
    const values: Record<string, string> = {};
    source.forEach((service) => {
      WAREHOUSE_VEHICLE_TYPES.forEach((type) => {
        const price = service.currentTariffs[type]?.price;
        values[priceKey(service.id, type)] = price == null ? '' : String(price);
      });
    });
    return values;
  };

  /** Новый прайс клиента: матрица заполнена действующими ставками (клиента или базовыми). */
  const openPriceList = () => {
    if (!client || !canManageIndividual) return;
    setPriceListValues(priceValuesFrom(services));
    setPriceListFrom(today());
    setPriceListDirty(false);
    setError(null);
    setPriceListOpen(true);
  };

  // пока ставки не правили — при смене даты подставляем действующие на эту дату
  const changePriceListFrom = async (date: string) => {
    setPriceListFrom(date);
    if (!date || priceListDirty || !counterpartyId) return;
    try {
      const response = await getWarehouseServices(date, counterpartyId);
      setPriceListValues(priceValuesFrom(response.data));
    } catch {
      // не удалось получить ставки на дату — оставляем текущее заполнение
    }
  };

  const savePriceList = async () => {
    if (!client) return;
    const payloadPrices = services.flatMap((service) => WAREHOUSE_VEHICLE_TYPES
      .filter((type) => (priceListValues[priceKey(service.id, type)] ?? '').trim() !== '')
      .map((type) => ({
        serviceId: service.id,
        vehicleType: type,
        price: Number(priceListValues[priceKey(service.id, type)]),
      })));
    if (payloadPrices.some((item) => !Number.isFinite(item.price) || item.price < 0)) {
      setError('Проверьте ставки: допустимы только неотрицательные числа.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await saveWarehouseClientPriceList({
        counterpartyId: client.counterpartyId,
        validFrom: priceListFrom,
        prices: payloadPrices,
      });
      setSuccess(`Прайс ${clientName} с ${formatDate(priceListFrom)} сохранён: ${response.data.positions} позиций`
        + `${response.data.closedPrevious ? ', предыдущий прайс закрыт днём раньше' : ''}.`);
      setPriceListOpen(false);
      await load();
    } catch (saveError) {
      setError(messageFromError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const endPriceList = async () => {
    if (!client) return;
    setSaving(true);
    setError(null);
    try {
      await endWarehouseClientPriceList({ counterpartyId: client.counterpartyId, fromDate: endFrom });
      setSuccess(`С ${formatDate(endFrom)} ${clientName} обслуживается по базовому прайсу.`);
      setEndOpen(false);
      await load();
    } catch (endError) {
      setError(messageFromError(endError));
    } finally {
      setSaving(false);
    }
  };

  const renderPrice = (service: WarehouseServiceDefinition, type: WarehouseVehicleType) => {
    const tariff = service.currentTariffs[type];
    if (!tariff) return 'Не задан';
    const text = `${money.format(tariff.price)}${service.unit === 'liter' ? ' / л' : ''}`;
    if (!client) return text;
    if (tariff.isIndividual) {
      return (
        <Box component="span" title={`Прайс клиента с ${formatDate(tariff.validFrom)}`} sx={{ color: INDIVIDUAL_COLOR, fontWeight: 700 }}>
          {text}
        </Box>
      );
    }
    return <Box component="span" sx={{ color: '#8b93a1' }} title="Базовая цена">{text}</Box>;
  };

  const versionMatrix = (version: WarehouseClientPriceList) => {
    const byKey = new Map(version.items.map((item) => [priceKey(item.serviceId, item.vehicleType), item]));
    const serviceRows = services.filter((service) => version.items.some((item) => item.serviceId === service.id));
    return (
      <TableContainer>
        <Table size="small" sx={{ ...tableSx(true), minWidth: 1200 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 300 }}>Услуга</TableCell>
              {WAREHOUSE_VEHICLE_TYPES.map((type) => (
                <TableCell key={type} align="right" sx={{ width: tariffColumnWidths[type] }}>
                  {warehouseVehicleTypeLabel(type)}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {serviceRows.map((service) => (
              <TableRow key={service.id}>
                <TableCell sx={{ fontWeight: 600 }}>{service.name}</TableCell>
                {WAREHOUSE_VEHICLE_TYPES.map((type) => {
                  const item = byKey.get(priceKey(service.id, type));
                  return (
                    <TableCell key={type} align="right" sx={item ? undefined : { color: '#8b93a1' }}>
                      {item ? `${money.format(item.price)}${item.unit === 'liter' ? ' / л' : ''}` : 'базовая'}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
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
                    <Chip size="small" label="свой прайс" sx={{ height: 18, fontSize: 10, color: INDIVIDUAL_COLOR }} />
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
              ? 'Синим — ставки из прайса клиента, серым — базовые (позиции, которых нет в прайсе клиента).'
              : 'Базовые цены для всех клиентов. Выберите клиента, чтобы посмотреть или завести его прайс.'}
            {!(client ? canManageIndividual : canManageBase) && ' Режим просмотра.'}
          </Typography>
          {client && canManageIndividual && (
            <Stack direction="row" spacing={1}>
              {hasActiveClientPriceList && (
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => { setEndFrom(today()); setError(null); setEndOpen(true); }}
                >
                  Вернуть базовый прайс
                </Button>
              )}
              <Button size="small" variant="contained" onClick={openPriceList}>
                Новые ставки клиента
              </Button>
            </Stack>
          )}
        </Stack>
      </Paper>

      {error && !priceListOpen && !endOpen && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" sx={tableSx(Boolean(client))}>
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
            {services.map((service) => {
              const editable = client ? canManageIndividual : canManageBase;
              return (
                <TableRow
                  key={service.id}
                  hover
                  title={editable
                    ? client ? 'Двойной клик — новые ставки клиента' : 'Двойной клик откроет настройку услуги'
                    : undefined}
                  onDoubleClick={() => (client ? openPriceList() : openBaseEdit(service))}
                  sx={{ cursor: editable ? 'pointer' : 'default' }}
                >
                  <TableCell sx={{ fontWeight: 600 }}>{service.name}</TableCell>
                  <TableCell>{unitLabels[service.unit]}</TableCell>
                  <TableCell title={tariffValidFromTitle(service)}>{tariffValidFromSummary(service)}</TableCell>
                  {WAREHOUSE_VEHICLE_TYPES.map((type) => (
                    <TableCell key={type} align="right" sx={{ width: tariffColumnWidths[type] }}>
                      {renderPrice(service, type)}
                    </TableCell>
                  ))}
                  <TableCell>{service.isActive ? 'Активна' : 'Отключена'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {client && (
        <Paper variant="outlined" sx={{ px: 1.5, py: 1 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.5 }}>
            История прайсов — {clientName}
          </Typography>
          {priceLists.length === 0 ? (
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              Своего прайса нет — клиент обслуживается по базовому.
            </Typography>
          ) : (
            <Stack spacing={0.5}>
              {priceLists.map((version) => {
                const isOpen = expandedVersion === version.validFrom;
                const isCurrent = version.validFrom <= today() && (!version.validTo || version.validTo >= today());
                const isFuture = version.validFrom > today();
                return (
                  <Box key={version.validFrom} sx={{ border: '1px solid #e1e4ea', borderRadius: 1 }}>
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      onClick={() => setExpandedVersion(isOpen ? null : version.validFrom)}
                      sx={{ px: 1, py: 0.5, cursor: 'pointer', '&:hover': { backgroundColor: '#f4f7fb' } }}
                    >
                      {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                      <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                        Ставки с {formatDate(version.validFrom)}
                        {version.validTo ? ` по ${formatDate(version.validTo)}` : ' — бессрочно'}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                        · {version.items.length} позиций
                      </Typography>
                      {isCurrent && <Chip size="small" color="primary" label="действует" sx={{ height: 18, fontSize: 10 }} />}
                      {isFuture && <Chip size="small" label="будущий" sx={{ height: 18, fontSize: 10 }} />}
                    </Stack>
                    <Collapse in={isOpen} unmountOnExit>
                      <Box sx={{ px: 1, pb: 1 }}>{versionMatrix(version)}</Box>
                    </Collapse>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Paper>
      )}

      <Dialog open={Boolean(editing)} onClose={() => !saving && setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>{editing?.name}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
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
                  onChange={(event) => setPrices((current) => ({ ...current, [type]: event.target.value }))}
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
          <Button variant="contained" onClick={() => void saveBase()} disabled={saving || !validFrom}>Сохранить</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={priceListOpen} onClose={() => !saving && setPriceListOpen(false)} fullWidth maxWidth="xl">
        <DialogTitle>
          Новые ставки клиента
          <Typography sx={{ fontSize: 13, color: INDIVIDUAL_COLOR }}>{clientName}</Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
              <TextField
                type="date"
                size="small"
                label="Прайс действует с"
                InputLabelProps={{ shrink: true }}
                value={priceListFrom}
                onChange={(event) => void changePriceListFrom(event.target.value)}
                sx={{ width: 200 }}
              />
              <Typography sx={{ fontSize: 12, color: 'text.secondary', flex: 1 }}>
                Заполнено действующими ставками. Измените нужные и сохраните — весь набор станет прайсом клиента
                с выбранной даты, предыдущий прайс закроется днём раньше. Пустая ячейка — по базовому тарифу.
                Начисленные услуги и закрытые периоды не пересчитываются.
              </Typography>
            </Stack>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: '60vh' }}>
              <Table size="small" stickyHeader sx={{ ...tableSx(true), minWidth: 1200, '& td': { py: '2px', px: '4px' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 280 }}>Услуга</TableCell>
                    {WAREHOUSE_VEHICLE_TYPES.map((type) => (
                      <TableCell key={type} align="right" sx={{ width: tariffColumnWidths[type] }}>
                        {warehouseVehicleTypeLabel(type)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {services.map((service) => (
                    <TableRow key={service.id}>
                      <TableCell sx={{ fontWeight: 600, pl: '8px !important' }}>
                        {service.name}
                        <Box component="span" sx={{ color: '#8b93a1', fontWeight: 400 }}> · {unitLabels[service.unit]}</Box>
                      </TableCell>
                      {WAREHOUSE_VEHICLE_TYPES.map((type) => {
                        const key = priceKey(service.id, type);
                        const basePrice = service.baseTariffs?.[type]?.price;
                        return (
                          <TableCell key={type} align="right">
                            <TextField
                              size="small"
                              type="number"
                              value={priceListValues[key] ?? ''}
                              placeholder={basePrice != null ? `база ${basePrice}` : 'не задан'}
                              title={basePrice != null ? `Базовая: ${money.format(basePrice)}` : 'Базовая не задана'}
                              onChange={(event) => {
                                setPriceListDirty(true);
                                setPriceListValues((current) => ({ ...current, [key]: event.target.value }));
                              }}
                              inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right', fontSize: 11, padding: '4px 6px' } }}
                              fullWidth
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPriceListOpen(false)} disabled={saving}>Отмена</Button>
          <Button variant="contained" onClick={() => void savePriceList()} disabled={saving || !priceListFrom}>
            {saving ? 'Сохранение…' : 'Сохранить прайс'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={endOpen} onClose={() => !saving && setEndOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Вернуть базовый прайс</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
            <Typography sx={{ fontSize: 13 }}>
              С выбранной даты {clientName} будет обслуживаться по базовому прайсу. Прайс клиента закроется днём раньше,
              прайсы, заведённые на более поздние даты, удалятся.
            </Typography>
            <TextField
              type="date"
              size="small"
              label="Базовый прайс с"
              InputLabelProps={{ shrink: true }}
              value={endFrom}
              onChange={(event) => setEndFrom(event.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEndOpen(false)} disabled={saving}>Отмена</Button>
          <Button variant="contained" color="warning" onClick={() => void endPriceList()} disabled={saving || !endFrom}>
            Вернуть базовый
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
