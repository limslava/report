import { useEffect, useRef, useState } from 'react';
import { Popover } from '@mui/material';
import { AccessTime } from '@mui/icons-material';
import { isStrictTime, normalizeTimeInput } from './dispatcherJournalUtils';

type TimeCellProps = {
  value: string | null;
  onSave: (value: string) => void;
};

const HOURS = Array.from({ length: 24 }, (_item, index) => String(index).padStart(2, '0'));
const MINUTES = ['00', '10', '15', '20', '30', '40', '45', '50'];

/**
 * Время подачи: ввод с клавиатуры («8», «830», «8.30» → 08:00 / 08:30) или
 * выбор часов и минут по кнопке-часикам. Нестандартный текст («к 10») не
 * ломается — остаётся как написан и подсвечивается, что это не время.
 */
export default function TimeCell({ value, onSave }: TimeCellProps) {
  const [draft, setDraft] = useState(value ?? '');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [hour, setHour] = useState<string | null>(null);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(value ?? '');
  }, [value]);

  const commit = (next: string) => {
    const normalized = normalizeTimeInput(next);
    setDraft(normalized);
    if (normalized !== (value ?? '')) onSave(normalized);
  };

  const notTime = Boolean(draft.trim()) && !isStrictTime(draft);

  return (
    <div className="dj-time-cell">
      <input
        className={`dj-cell-input${notTime ? ' dj-cell-input--warn' : ''}`}
        value={draft}
        placeholder="чч:мм"
        title={notTime ? 'Не похоже на время — проверьте' : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => { focusedRef.current = true; }}
        onBlur={() => {
          focusedRef.current = false;
          commit(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
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
