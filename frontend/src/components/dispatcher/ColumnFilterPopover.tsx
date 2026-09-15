import { useMemo, useState } from 'react';
import { Box, Button, Checkbox, Divider, Popover, TextField, Typography } from '@mui/material';
import { PushPin, PushPinOutlined } from '@mui/icons-material';

export const EMPTY_FILTER_VALUE = '(Пустые)';

type ColumnFilterPopoverProps = {
  anchorEl: HTMLElement;
  title: string;
  /** Все значения колонки в текущем периоде (уже приведённые к тексту). */
  values: string[];
  /** Скрытые фильтром значения. */
  hidden: string[];
  isPinnedUntilHere: boolean;
  onSort: (direction: 'asc' | 'desc') => void;
  /** своя сортировка по этой колонке — отмечается галочкой */
  sortedDirection?: 'asc' | 'desc' | null;
  /** есть своя сортировка — пункт «вернуть общий порядок» */
  onResetSort?: () => void;
  onApply: (hidden: string[]) => void;
  onTogglePin: () => void;
  onClose: () => void;
};

/**
 * Меню заголовка в стиле google-таблиц: сортировка, фильтр по значениям с
 * поиском и «Выбрать все / Сбросить», закрепление колонок до текущей.
 */
export default function ColumnFilterPopover({
  anchorEl,
  title,
  values,
  hidden,
  isPinnedUntilHere,
  onSort,
  sortedDirection = null,
  onResetSort,
  onApply,
  onTogglePin,
  onClose,
}: ColumnFilterPopoverProps) {
  const [query, setQuery] = useState('');
  const [draftHidden, setDraftHidden] = useState<Set<string>>(() => new Set(hidden));

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    values.forEach((value) => map.set(value, (map.get(value) ?? 0) + 1));
    return map;
  }, [values]);

  const options = useMemo(() => {
    const unique = [...counts.keys()].sort((a, b) => {
      if (a === EMPTY_FILTER_VALUE) return -1;
      if (b === EMPTY_FILTER_VALUE) return 1;
      return a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' });
    });
    // скрытые значения, которых сейчас нет в данных, тоже показываем — чтобы их можно было вернуть
    hidden.forEach((value) => {
      if (!counts.has(value)) unique.push(value);
    });
    const q = query.trim().toLowerCase();
    return q ? unique.filter((value) => value.toLowerCase().includes(q)) : unique;
  }, [counts, hidden, query]);

  const shownCount = options.filter((value) => !draftHidden.has(value)).length;

  return (
    <Popover
      open
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
    >
      <Box sx={{ width: 270, p: 1, fontSize: 13 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 650, color: '#3d4757', px: 0.5, pb: 0.5 }}>{title}</Typography>
        <button type="button" className="dj-menu-item" onClick={() => { onSort('asc'); onClose(); }}>
          Сортировать А → Я{sortedDirection === 'asc' && <span className="dj-menu-check">✓</span>}
        </button>
        <button type="button" className="dj-menu-item" onClick={() => { onSort('desc'); onClose(); }}>
          Сортировать Я → А{sortedDirection === 'desc' && <span className="dj-menu-check">✓</span>}
        </button>
        {onResetSort && (
          <button type="button" className="dj-menu-item" onClick={() => { onResetSort(); onClose(); }}>
            Сбросить сортировку (общий порядок)
          </button>
        )}
        <button type="button" className="dj-menu-item" onClick={() => { onTogglePin(); onClose(); }}>
          {isPinnedUntilHere ? <PushPin sx={{ fontSize: 15 }} /> : <PushPinOutlined sx={{ fontSize: 15 }} />}
          {isPinnedUntilHere ? 'Открепить столбцы' : 'Закрепить столбцы до этого'}
        </button>
        <Divider sx={{ my: 0.75 }} />
        <Typography sx={{ fontSize: 12, fontWeight: 650, color: '#3d4757', px: 0.5 }}>Фильтр по значению</Typography>
        <Box sx={{ display: 'flex', gap: 1, px: 0.5, py: 0.25, fontSize: 12 }}>
          <button
            type="button"
            className="dj-link-btn"
            onClick={() => setDraftHidden((prev) => {
              const next = new Set(prev);
              options.forEach((value) => next.delete(value));
              return next;
            })}
          >
            Выбрать все ({options.length})
          </button>
          <span style={{ color: '#9aa3b0' }}>·</span>
          <button
            type="button"
            className="dj-link-btn"
            onClick={() => setDraftHidden((prev) => new Set([...prev, ...options]))}
          >
            Сбросить
          </button>
          <span style={{ marginLeft: 'auto', color: '#8b93a1' }}>Показано: {shownCount}</span>
        </Box>
        <TextField
          size="small"
          fullWidth
          autoFocus
          placeholder="Поиск"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          sx={{ my: 0.5, '& input': { fontSize: 13, py: 0.75 } }}
        />
        <Box sx={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #eceff3', borderRadius: 1 }}>
          {options.map((value) => (
            <label key={value} className="dj-filter-option">
              <Checkbox
                size="small"
                sx={{ p: 0.25 }}
                checked={!draftHidden.has(value)}
                onChange={() => setDraftHidden((prev) => {
                  const next = new Set(prev);
                  if (next.has(value)) next.delete(value);
                  else next.add(value);
                  return next;
                })}
              />
              <span className="dj-filter-option__text">{value}</span>
              <span className="dj-filter-option__count">{counts.get(value) ?? 0}</span>
            </label>
          ))}
          {!options.length && <Box sx={{ p: 1.5, color: '#8b93a1', fontSize: 12 }}>Нет значений</Box>}
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
          <Button size="small" onClick={onClose}>Отмена</Button>
          <Button
            size="small"
            variant="contained"
            onClick={() => {
              onApply([...draftHidden]);
              onClose();
            }}
          >
            ОК
          </Button>
        </Box>
      </Box>
    </Popover>
  );
}
