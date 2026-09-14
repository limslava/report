import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import {
  getDispatcherHistory,
  type DispatcherHistoryItem,
  type DispatcherHistoryQuery,
} from '../../services/dispatcher-journal.api';

type Props = {
  open: boolean;
  onClose: () => void;
  /** история одной заявки (из меню строки); без него — весь реестр */
  orderId?: string | null;
  /** подпись для истории одной заявки, например «14.09 · GATU1286330» */
  orderLabel?: string;
  /** названия полей реестра: ktkNumber → «№ КТК» */
  fieldTitles: Record<string, string>;
};

const pad2 = (value: number): string => String(value).padStart(2, '0');
const ymd = (date: Date): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const formatOrderDate = (value: string | null): string => (value ? value.split('-').reverse().join('.') : '');

const errorText = (error: unknown): string =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Не удалось загрузить историю';

/**
 * История изменений реестра: кто, когда, что поменял (было → стало). Для
 * всего реестра — с фильтром по периоду, сотруднику и КТК/клиенту; для
 * одной заявки — все её изменения.
 */
export default function DispatcherHistoryDialog({ open, onClose, orderId, orderLabel, fieldTitles }: Props) {
  const today = ymd(new Date());
  const weekAgo = ymd(new Date(Date.now() - 6 * 86_400_000));
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [userId, setUserId] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<DispatcherHistoryItem[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // сотрудники для фильтра — копятся из загруженных записей
  const [knownUsers, setKnownUsers] = useState<Map<string, string>>(new Map());

  const buildQuery = useCallback((before?: string): DispatcherHistoryQuery => (
    orderId
      ? { orderId, before, limit: 300 }
      : { from, to, userId: userId || undefined, q: query.trim() || undefined, before, limit: 200 }
  ), [from, orderId, query, to, userId]);

  const load = useCallback(async (append = false, before?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getDispatcherHistory(buildQuery(before));
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
      setNextBefore(data.nextBefore);
      setKnownUsers((prev) => {
        const next = new Map(prev);
        data.items.forEach((item) => {
          if (item.userId && item.userName) next.set(item.userId, item.userName);
        });
        return next;
      });
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    if (!open) return undefined;
    // поиск по КТК печатается — запрос с небольшой паузой
    const timer = window.setTimeout(() => void load(), query ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [open, load, query]);

  const describe = (item: DispatcherHistoryItem): { what: string; before: string; after: string } => {
    switch (item.action) {
      case 'create': return { what: 'Создана заявка', before: '', after: '' };
      case 'delete': return { what: 'Удалена заявка', before: '', after: '' };
      case 'move': return { what: 'Строка перемещена', before: '', after: '' };
      case 'import': return { what: 'Импорт из Google-таблицы', before: item.oldValue ?? '', after: item.newValue ?? '' };
      default: {
        const title = item.field ? fieldTitles[item.field] ?? item.field : 'Поле';
        const value = (raw: string | null) => (item.field === 'orderDate' ? formatOrderDate(raw) : raw ?? '');
        return { what: title, before: value(item.oldValue), after: value(item.newValue) };
      }
    }
  };

  const userOptions = useMemo(
    () => [...knownUsers.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ru')),
    [knownUsers],
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        {orderId ? `История строки${orderLabel ? ` — ${orderLabel}` : ''}` : 'История изменений реестра'}
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        {!orderId && (
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 1.5, pt: 1 }}>
            <TextField
              size="small"
              type="date"
              label="С"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 160 }}
            />
            <TextField
              size="small"
              type="date"
              label="По"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 160 }}
            />
            <TextField
              size="small"
              select
              label="Сотрудник"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              sx={{ width: 220 }}
            >
              <MenuItem value="">Все</MenuItem>
              {userOptions.map(([id, name]) => <MenuItem key={id} value={id}>{name}</MenuItem>)}
            </TextField>
            <TextField
              size="small"
              label="№ КТК или клиент"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              sx={{ width: 220 }}
            />
            {loading && <Typography sx={{ fontSize: 12, color: '#8b93a1' }}>Загрузка…</Typography>}
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        <Box className="dj-history">
          <table>
            <thead>
              <tr>
                <th style={{ width: 128 }}>Когда</th>
                <th style={{ width: 170 }}>Кто</th>
                {!orderId && <th style={{ width: 210 }}>Заявка</th>}
                <th style={{ width: 170 }}>Что</th>
                <th>Было</th>
                <th>Стало</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const { what, before, after } = describe(item);
                return (
                  <tr key={item.id} className={`dj-history__row dj-history__row--${item.action}`}>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>{item.userName ?? '—'}</td>
                    {!orderId && (
                      <td>{[formatOrderDate(item.orderDate), item.ktkNumber, item.client].filter(Boolean).join(' · ') || '—'}</td>
                    )}
                    <td className="dj-history__what">{what}</td>
                    <td className="dj-history__old">{before}</td>
                    <td className="dj-history__new">{after}</td>
                  </tr>
                );
              })}
              {!items.length && !loading && (
                <tr><td colSpan={orderId ? 5 : 6} className="dj-history__empty">Изменений не найдено</td></tr>
              )}
            </tbody>
          </table>
        </Box>
        {nextBefore && (
          <Box sx={{ textAlign: 'center', mt: 1 }}>
            <Button size="small" disabled={loading} onClick={() => void load(true, nextBefore)}>Показать ещё</Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}
