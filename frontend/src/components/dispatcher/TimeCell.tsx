import { useEffect, useRef, useState } from 'react';
import { Popover } from '@mui/material';
import { AccessTime } from '@mui/icons-material';
import { isStrictTime, normalizeTimeInput } from './dispatcherJournalUtils';
import { isPrintableKey, navDirectionOf, requestCellNav } from './cellKeys';

type TimeCellProps = {
  value: string | null;
  onSave: (value: string) => void;
  readOnly?: boolean;
};

const HOURS = Array.from({ length: 24 }, (_item, index) => String(index).padStart(2, '0'));
const MINUTES = ['00', '10', '15', '20', '30', '40', '45', '50'];

/**
 * Время подачи: ввод с клавиатуры («8», «830», «8.30» → 08:00 / 08:30) или
 * выбор часов и минут по кнопке-часикам. Нестандартный текст («к 10») не
 * ломается — остаётся как написан и подсвечивается, что это не время.
 */
export default function TimeCell({ value, onSave, readOnly }: TimeCellProps) {
  const [draft, setDraft] = useState(value ?? '');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [hour, setHour] = useState<string | null>(null);
  // как в google: клик выделяет, двойной клик / Enter / ввод цифры — правка
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);

  useEffect(() => {
    if (!editingRef.current) setDraft(value ?? '');
  }, [value]);

  const startEdit = (initial?: string) => {
    if (readOnly) return;
    if (initial !== undefined) setDraft(initial);
    editingRef.current = true;
    setEditing(true);
  };
  const stopEdit = () => {
    editingRef.current = false;
    setEditing(false);
  };

  const commit = (next: string) => {
    const normalized = normalizeTimeInput(next);
    setDraft(normalized);
    if (normalized !== (value ?? '')) onSave(normalized);
  };

  const notTime = Boolean(draft.trim()) && !isStrictTime(draft);

  return (
    <div className="dj-time-cell">
      <input
        className={`dj-cell-input${notTime ? ' dj-cell-input--warn' : ''}${editing ? ' is-editing' : ''}`}
        value={draft}
        readOnly={!editing}
        placeholder="чч:мм"
        title={notTime ? 'Не похоже на время — проверьте' : undefined}
        onChange={(event) => {
          if (editingRef.current) setDraft(event.target.value);
        }}
        onDoubleClick={() => {
          if (!editingRef.current) startEdit();
        }}
        onBlur={() => {
          if (!editingRef.current) return;
          stopEdit();
          commit(draft);
        }}
        onKeyDown={(event) => {
          const element = event.currentTarget;
          if (!editingRef.current) {
            if (isPrintableKey(event)) {
              event.preventDefault();
              startEdit(event.key);
            } else if (event.key === 'Enter' || event.key === 'F2') {
              event.preventDefault();
              startEdit();
            } else if (event.key === 'Backspace' || event.key === 'Delete') {
              event.preventDefault();
              if (!readOnly) commit('');
            } else {
              const direction = navDirectionOf(event);
              if (direction) {
                event.preventDefault();
                requestCellNav(element, direction, event.shiftKey);
              }
            }
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            stopEdit();
            setDraft(value ?? '');
          } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            stopEdit();
            commit(draft);
            requestCellNav(element, event.key === 'Enter' ? 'down' : event.shiftKey ? 'prev' : 'next');
          }
        }}
      />
      <button
        type="button"
        className="dj-time-btn"
        title="Выбрать время"
        onClick={(event) => {
          setHour(isStrictTime(draft) ? draft.slice(0, 2) : null);
          setAnchor(event.currentTarget);
        }}
      >
        <AccessTime sx={{ fontSize: 13 }} />
      </button>
      {anchor && (
        <Popover
          open
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <div className="dj-time-picker">
            <div className="dj-time-picker__title">Часы</div>
            <div className="dj-time-picker__grid dj-time-picker__grid--hours">
              {HOURS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={item === hour ? 'is-active' : undefined}
                  onClick={() => setHour(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="dj-time-picker__title">Минуты</div>
            <div className="dj-time-picker__grid dj-time-picker__grid--minutes">
              {MINUTES.map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={!hour}
                  onClick={() => {
                    if (!hour) return;
                    commit(`${hour}:${item}`);
                    setAnchor(null);
                  }}
                >
                  :{item}
                </button>
              ))}
            </div>
          </div>
        </Popover>
      )}
    </div>
  );
}
