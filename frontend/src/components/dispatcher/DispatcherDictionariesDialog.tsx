import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DeleteOutline, KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import {
  createDispatcherDictionaryEntry,
  createDispatcherStatusEntry,
  deleteDispatcherDictionaryEntry,
  deleteDispatcherStatusEntry,
  getDispatcherDictionaries,
  reorderDispatcherDictionary,
  updateDispatcherDictionaryEntry,
  updateDispatcherStatusEntry,
  type DispatcherDictionaryEntry,
  type DispatcherDictionaryKind,
  type DispatcherStatusEntry,
} from '../../services/dispatcher-journal.api';
import { textColorFor } from './dispatcherJournalUtils';
import ColorPickerButton, { type ChipColors } from './ColorPickerButton';
import ConfirmDialog, { type ConfirmRequest } from './ConfirmDialog';

type TabKey = 'status' | DispatcherDictionaryKind;

const TABS: Array<{ key: TabKey; label: string; hint: string }> = [
  { key: 'status', label: 'Статусы', hint: 'Цвет — заливка статуса в реестре (фон и текст). Переименование меняет статус и в заявках.' },
  { key: 'client', label: 'Клиенты', hint: 'Выпадающий список колонки «Клиент» — можно писать и своё. Цвет — заливка значения в реестре (необязательно), можно задать и цвет текста.' },
  { key: 'ktk_type', label: 'Типы КТК', hint: 'Порядок здесь = порядок в выпадающем списке и при сортировке колонки. Цвет — заливка значения в реестре (необязательно), можно задать и цвет текста.' },
  { key: 'vat', label: 'НДС', hint: 'Процент в названии («НДС22%») используется в расчёте колонки «Без НДС»; без процента — сумма без вычета. Цвет — заливка значения в реестре (необязательно), можно задать и цвет текста.' },
  { key: 'operation', label: 'Операции', hint: 'Подсказки для колонки «Операция» — можно писать и своё. Цвет — заливка значения в реестре (необязательно), можно задать и цвет текста.' },
  { key: 'terminal_from', label: 'Терминалы постановки', hint: 'Выпадающий список колонки «Терминал постановки» — можно писать и своё. Цвет — заливка значения в реестре (необязательно), можно задать и цвет текста.' },
  { key: 'terminal_to', label: 'Терминалы снятия', hint: 'Выпадающий список колонки «Терминал снятия» — можно писать и своё. Цвет — заливка значения в реестре (необязательно), можно задать и цвет текста.' },
];

type Row = { id: string; name: string; color: string | null; textColor: string | null; isActive: boolean };



const errorText = (error: unknown): string =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Не удалось сохранить';

type Props = {
  open: boolean;
  canEdit: boolean;
  /** цвета значений может выбирать и диспетчер — без права менять сами справочники */
  canEditColors?: boolean;
  onClose: () => void;
  /** справочники изменились — реестр перечитывает подсказки и статусы */
  onChanged: () => void;
};

/** Ведение справочников реестра: статусы, типы КТК, варианты НДС, операции. */
export default function DispatcherDictionariesDialog({ open, canEdit, canEditColors = canEdit, onClose, onChanged }: Props) {
  const [tab, setTab] = useState<TabKey>('status');
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [statuses, setStatuses] = useState<DispatcherStatusEntry[]>([]);
  const [items, setItems] = useState<DispatcherDictionaryEntry[]>([]);
  const [newName, setNewName] = useState('');
  const [newColors, setNewColors] = useState<ChipColors>({ color: '#d4edbc', textColor: '#11734b' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await getDispatcherDictionaries();
      setStatuses(data.statuses);
      setItems(data.items);
    } catch (loadError) {
      setError(errorText(loadError));
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const rows: Row[] = tab === 'status'
    ? statuses
    : items.filter((item) => item.kind === tab);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await load();
      onChanged();
    } catch (actionError) {
      setError(errorText(actionError));
      await load();
    }
  };

  const rename = (row: Row, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === row.name) return;
    void run(() => (tab === 'status'
      ? updateDispatcherStatusEntry(row.id, { name: trimmed })
      : updateDispatcherDictionaryEntry(row.id, { name: trimmed })));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const ids = rows.map((row) => row.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => reorderDispatcherDictionary(tab === 'status' ? 'status' : 'item', ids));
  };

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    void run(async () => {
      if (tab === 'status') {
        await createDispatcherStatusEntry({ name, color: newColors.color ?? '#e8eaed', textColor: newColors.textColor });
      } else {
        await createDispatcherDictionaryEntry({ kind: tab, name, ...newColors });
      }
      setNewName('');
    });
  };

  const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 0 }}>Справочники реестра</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Tabs
          value={tab}
          onChange={(_event, next: TabKey) => {
            setTab(next);
            setNewName('');
            // новому статусу нужен цвет, значениям справочников по умолчанию — без заливки
            setNewColors(next === 'status' ? { color: '#d4edbc', textColor: '#11734b' } : { color: null, textColor: null });
            setError(null);
          }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 36,
            // невидимая кнопка прокрутки слева занимала место — вкладки начинались правее списка
            '& .MuiTabs-scrollButtons.Mui-disabled': { display: 'none' },
            '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontSize: 13, px: 1.5, minWidth: 0 },
          }}
        >
          {TABS.map((item) => <Tab key={item.key} value={item.key} label={item.label} />)}
        </Tabs>
        <Typography sx={{ fontSize: 12, color: '#6b7280', my: 1 }}>
          {activeTab.hint}{!canEdit && (canEditColors
            ? ' Цвет значения можно выбрать кружком слева; добавлять и переименовывать значения может руководитель КТК.'
            : ' Изменять справочники может руководитель КТК.')}
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 1, py: 0 }} onClose={() => setError(null)}>{error}</Alert>}
        <Box sx={{ maxHeight: 420, overflowY: 'auto', border: '1px solid #eceff3', borderRadius: 1 }}>
          {rows.map((row, index) => (
            <Box
              key={row.id}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.25,
                borderBottom: '1px solid #f2f4f7', opacity: row.isActive ? 1 : 0.55,
              }}
            >
              <ColorPickerButton
                value={{ color: row.color, textColor: row.textColor }}
                previewLabel={row.name}
                disabled={!canEditColors}
                requireBackground={tab === 'status'}
                onChange={(next) => {
                  if (next.color === row.color && next.textColor === row.textColor) return;
                  void run(() => (tab === 'status'
                    ? updateDispatcherStatusEntry(row.id, { color: next.color ?? '#e8eaed', textColor: next.textColor })
                    : updateDispatcherDictionaryEntry(row.id, next)));
                }}
              />
              <input
                key={`${row.id}:${row.name}`}
                className="dj-dict-name"
                style={row.color || row.textColor
                  ? {
                    background: row.color ?? undefined,
                    color: row.textColor ?? (row.color ? textColorFor(row.color) : undefined),
                    fontWeight: 600,
                  }
                  : undefined}
                defaultValue={row.name}
                disabled={!canEdit}
                onBlur={(event) => rename(row, event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
              />
              {canEdit && (
                <>
                  <Tooltip title={row.isActive ? 'Показывается в реестре' : 'Скрыт из выбора'}>
                    <Switch
                      size="small"
                      checked={row.isActive}
                      onChange={(event) => void run(() => (tab === 'status'
                        ? updateDispatcherStatusEntry(row.id, { isActive: event.target.checked })
                        : updateDispatcherDictionaryEntry(row.id, { isActive: event.target.checked })))}
                    />
                  </Tooltip>
                  <IconButton size="small" sx={{ p: 0.25 }} disabled={index === 0} onClick={() => move(index, -1)}>
                    <KeyboardArrowUp sx={{ fontSize: 17 }} />
                  </IconButton>
                  <IconButton size="small" sx={{ p: 0.25 }} disabled={index === rows.length - 1} onClick={() => move(index, 1)}>
                    <KeyboardArrowDown sx={{ fontSize: 17 }} />
                  </IconButton>
                  <Tooltip title="Удалить">
                    <IconButton
                      size="small"
                      sx={{ p: 0.25 }}
                      onClick={() => setConfirmRequest({
                        title: `Удалить «${row.name}»?`,
                        confirmLabel: 'Удалить',
                        danger: true,
                        onConfirm: () => void run(() => (tab === 'status' ? deleteDispatcherStatusEntry(row.id) : deleteDispatcherDictionaryEntry(row.id))),
                      })}
                    >
                      <DeleteOutline sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Box>
          ))}
          {!rows.length && <Box sx={{ p: 2, color: '#8b93a1', fontSize: 13 }}>Пусто</Box>}
        </Box>
        {canEdit && (
          <Box sx={{ display: 'flex', gap: 1, mt: 1.25, alignItems: 'center' }}>
            <ColorPickerButton
              value={newColors}
              previewLabel={newName.trim()}
              requireBackground={tab === 'status'}
              onChange={setNewColors}
            />
            <TextField
              size="small"
              fullWidth
              placeholder={tab === 'status' ? 'Новый статус' : 'Новое значение'}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') add(); }}
              sx={{ '& input': { fontSize: 13 } }}
            />
            <Button variant="contained" size="small" onClick={add} disabled={!newName.trim()}>
              Добавить
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
    </Dialog>
  );
}
