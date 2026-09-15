import { useMemo, useState } from 'react';
import { Box, Button, Checkbox, Divider, MenuItem, Popover, TextField, Typography } from '@mui/material';
import { ExpandMore, ChevronRight, PushPin, PushPinOutlined } from '@mui/icons-material';
import { isConditionActive, NO_COLOR_KEY, type ColumnCondition } from './dispatcherJournalUtils';

export const EMPTY_FILTER_VALUE = '(Пустые)';

/** Цвет, который встречается в столбце: для «Фильтровать по цвету». */
export type ColumnColorOption = { key: string; background: string | null; color: string; label: string; count: number };

export type ColumnFilterValue = { hidden: string[]; condition: ColumnCondition | null; color: string | null };

type ConditionType = ColumnCondition['type'] | 'none';

type ColumnFilterPopoverProps = {
  anchorEl: HTMLElement;
  title: string;
  /** Все значения колонки в текущем периоде (уже приведённые к тексту). */
  values: string[];
  /** Скрытые фильтром значения. */
  hidden: string[];
  /** 'date' — условие «дата с … по …»; 'text' — пусто / не пусто / содержит; 'none' — без условий (галочки) */
  conditionKind: 'date' | 'text' | 'none';
  condition: ColumnCondition | null;
  /** цвета значений столбца (статусы, справочники); пусто — раздела цвета нет */
  colorOptions: ColumnColorOption[];
  color: string | null;
  isPinnedUntilHere: boolean;
  /** сортировка меняет общий порядок строк; нет — у пользователя только просмотр */
  onSort?: (direction: 'asc' | 'desc') => void;
  onApply: (value: ColumnFilterValue) => void;
  onTogglePin: () => void;
  onClose: () => void;
};

/**
 * Меню заголовка в стиле google-таблиц: сортировка, закрепление колонок до текущей
 * и фильтры — по цвету (статусы, справочники), по условию (пусто / не пусто /
 * содержит, для даты — «с … по …») и по значениям (галочки с поиском).
 * Все три действуют вместе, «ОК» применяет их разом.
 */
export default function ColumnFilterPopover({
  anchorEl,
  title,
  values,
  hidden,
  conditionKind,
  condition,
  colorOptions,
  color,
  isPinnedUntilHere,
  onSort,
  onApply,
  onTogglePin,
  onClose,
}: ColumnFilterPopoverProps) {
  const [query, setQuery] = useState('');
  const [draftHidden, setDraftHidden] = useState<Set<string>>(() => new Set(hidden));
  const [conditionType, setConditionType] = useState<ConditionType>(() => (isConditionActive(condition) ? condition.type : 'none'));
  const [conditionText, setConditionText] = useState(
    condition && (condition.type === 'contains' || condition.type === 'notContains') ? condition.value : '',
  );
  const [dateFrom, setDateFrom] = useState(condition?.type === 'dateRange' ? condition.from : '');
  const [dateTo, setDateTo] = useState(condition?.type === 'dateRange' ? condition.to : '');
  const [draftColor, setDraftColor] = useState<string | null>(color);
  const hasColors = colorOptions.some((option) => option.key !== NO_COLOR_KEY);
  // разделы как в google: открыт тот, где уже стоит фильтр; иначе — по значениям
  const [openSection, setOpenSection] = useState<'color' | 'condition' | 'values'>(
    color ? 'color' : isConditionActive(condition) ? 'condition' : 'values',
  );

  const draftCondition = (): ColumnCondition | null => {
    switch (conditionType) {
      case 'empty': return { type: 'empty' };
      case 'notEmpty': return { type: 'notEmpty' };
      case 'contains': return { type: 'contains', value: conditionText };
      case 'notContains': return { type: 'notContains', value: conditionText };
      case 'dateRange': return { type: 'dateRange', from: dateFrom, to: dateTo };
      default: return null;
    }
  };

  const sectionHeader = (key: 'color' | 'condition' | 'values', label: string, active: boolean) => (
    <button type="button" className="dj-filter-section" onClick={() => setOpenSection(key)}>
      {openSection === key ? <ExpandMore sx={{ fontSize: 16 }} /> : <ChevronRight sx={{ fontSize: 16 }} />}
      <span>{label}</span>
      {active && <span className="dj-filter-section__dot" aria-label="фильтр включён" />}
    </button>
  );

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
        {onSort && (
          <>
            <button type="button" className="dj-menu-item" onClick={() => { onSort('asc'); onClose(); }}>
              Сортировать А → Я
            </button>
            <button type="button" className="dj-menu-item" onClick={() => { onSort('desc'); onClose(); }}>
              Сортировать Я → А
            </button>
          </>
        )}
        <button type="button" className="dj-menu-item" onClick={() => { onTogglePin(); onClose(); }}>
          {isPinnedUntilHere ? <PushPin sx={{ fontSize: 15 }} /> : <PushPinOutlined sx={{ fontSize: 15 }} />}
          {isPinnedUntilHere ? 'Открепить столбцы' : 'Закрепить столбцы до этого'}
        </button>
        <Divider sx={{ my: 0.75 }} />
        {hasColors && (
          <>
            {sectionHeader('color', 'Фильтровать по цвету', Boolean(draftColor))}
            {openSection === 'color' && (
              <Box className="dj-color-filter">
                {colorOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`dj-color-filter__item${draftColor === option.key ? ' is-selected' : ''}`}
                    onClick={() => setDraftColor((prev) => (prev === option.key ? null : option.key))}
                  >
                    <span
                      className="dj-color-filter__chip"
                      style={option.background ? { background: option.background, color: option.color } : undefined}
                    >
                      {option.label}
                    </span>
                    <span className="dj-filter-option__count">{option.count}</span>
                  </button>
                ))}
              </Box>
            )}
          </>
        )}
        {conditionKind !== 'none' && (
          <>
            {sectionHeader('condition', 'Фильтровать по условию', conditionType !== 'none')}
            {openSection === 'condition' && (
              <Box sx={{ px: 0.5, pb: 0.75, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <TextField
                  select
                  size="small"
                  value={conditionType}
                  onChange={(event) => setConditionType(event.target.value as ConditionType)}
                  sx={{ '& .MuiSelect-select': { fontSize: 13, py: 0.75 } }}
                >
                  <MenuItem value="none">Нет</MenuItem>
                  {conditionKind === 'date' ? (
                    <MenuItem value="dateRange">Дата с … по …</MenuItem>
                  ) : [
                    <MenuItem key="empty" value="empty">Пусто</MenuItem>,
                    <MenuItem key="notEmpty" value="notEmpty">Не пусто</MenuItem>,
                    <MenuItem key="contains" value="contains">Текст содержит</MenuItem>,
                    <MenuItem key="notContains" value="notContains">Текст не содержит</MenuItem>,
                  ]}
                </TextField>
                {(conditionType === 'contains' || conditionType === 'notContains') && (
                  <TextField
                    size="small"
                    autoFocus
                    placeholder="Значение"
                    value={conditionText}
                    onChange={(event) => setConditionText(event.target.value)}
                    sx={{ '& input': { fontSize: 13, py: 0.75 } }}
                  />
                )}
                {conditionType === 'dateRange' && (
                  <Box sx={{ display: 'flex', gap: 0.75 }}>
                    <TextField
                      size="small"
                      type="date"
                      label="с"
                      value={dateFrom}
                      onChange={(event) => setDateFrom(event.target.value)}
                      InputLabelProps={{ shrink: true }}
                      sx={{ flex: 1, '& input': { fontSize: 13, py: 0.75 } }}
                    />
                    <TextField
                      size="small"
                      type="date"
                      label="по"
                      value={dateTo}
                      onChange={(event) => setDateTo(event.target.value)}
                      InputLabelProps={{ shrink: true }}
                      sx={{ flex: 1, '& input': { fontSize: 13, py: 0.75 } }}
                    />
                  </Box>
                )}
              </Box>
            )}
          </>
        )}
        {sectionHeader('values', 'Фильтровать по значению', draftHidden.size > 0)}
        {openSection === 'values' && (<>
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
        </>)}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
          <Button size="small" onClick={onClose}>Отмена</Button>
          <Button
            size="small"
            variant="contained"
            onClick={() => {
              onApply({ hidden: [...draftHidden], condition: draftCondition(), color: draftColor });
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
