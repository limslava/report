import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isPrintableKey, navDirectionOf, requestCellNav } from './cellKeys';

type ListCellProps = {
  value: string | null;
  options: string[];
  /** Цвета значения из справочника (фон и текст): ячейка и пункт списка окрашиваются ими. */
  colorOf?: (value: string) => { background?: string; color: string } | undefined;
  /** Преобразование при сохранении (например, ФИО → фамилия с инициалами). */
  normalize?: (value: string) => string;
  placeholder?: string;
  /** только значения из списка (статус): чужой текст не сохраняется, регистр подправляется */
  strict?: boolean;
  onSave: (value: string) => void;
};

const MAX_VISIBLE = 60;

/**
 * Лёгкая ячейка «ввод + подсказки из справочника». В отличие от MUI Autocomplete
 * не держит поппер на каждую строку: список рисуется порталом только у открытой
 * ячейки, поэтому таблица на тысячи строк не тормозит. Свободный ввод разрешён.
 *
 * Как в google-таблицах: клик только выделяет ячейку (видна «ручка» протягивания,
 * стрелки переходят к соседним). Список открывают стрелка ▾, двойной клик, Enter,
 * F2, Alt+↓ или начало ввода; Delete/Backspace очищают ячейку.
 */
export default function ListCell({ value, options, colorOf, normalize, placeholder, strict, onSave }: ListCellProps) {
  const [draft, setDraft] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [navigated, setNavigated] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // открыт ли список (правка) — в ref, чтобы blur после выбора не сохранял второй раз
  const openRef = useRef(false);

  useEffect(() => {
    if (!openRef.current) setDraft(value ?? '');
  }, [value]);

  // пока пользователь не начал печатать — показываем весь справочник
  const filtered = useMemo(() => {
    const query = draft.trim().toLowerCase();
    const list = !typed || !query ? options : options.filter((option) => option.toLowerCase().includes(query));
    return list.slice(0, MAX_VISIBLE);
  }, [draft, options, typed]);

  useLayoutEffect(() => {
    if (!open || !inputRef.current) return undefined;
    const update = () => setRect(inputRef.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!open || !input || document.activeElement !== input) return;
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, [open, typed]);

  const openList = (initial?: string) => {
    openRef.current = true;
    setOpen(true);
    setNavigated(false);
    if (initial !== undefined) {
      setDraft(initial);
      setTyped(true);
      setHighlight(0);
    } else {
      setTyped(false);
      setHighlight(Math.max(0, options.indexOf(draft)));
    }
  };

  const closeList = () => {
    openRef.current = false;
    setOpen(false);
    setTyped(false);
  };

  const commit = (next: string) => {
    let normalized = normalize ? normalize(next) : next.trim();
    if (strict && normalized) {
      const match = options.find((option) => option.toLowerCase() === normalized.toLowerCase());
      if (!match) {
        setDraft(value ?? '');
        return;
      }
      normalized = match;
    }
    setDraft(normalized);
    if (normalized !== (value ?? '')) onSave(normalized);
  };

  const choose = (option: string) => {
    commit(option);
    closeList();
  };

  const finishTyping = () => {
    if (!openRef.current) return;
    if (typed) commit(draft);
    else setDraft(value ?? '');
    closeList();
  };

  const cellStyle = colorOf && draft && !open ? colorOf(draft) : undefined;

  return (
    <span className="dj-list-cell">
      <input
        ref={inputRef}
        className={`dj-cell-input${cellStyle?.background ? ' dj-cell-input--chip' : ''}${open ? ' is-editing' : ''}`}
        style={cellStyle}
        value={draft}
        readOnly={!open}
        title={!open && draft.length > 14 ? draft : undefined}
        placeholder={placeholder}
        onChange={(event) => {
          if (!openRef.current) return;
          setDraft(event.target.value);
          setTyped(true);
          setHighlight(0);
        }}
        onDoubleClick={() => {
          if (!openRef.current) openList();
        }}
        onBlur={finishTyping}
        onKeyDown={(event) => {
          const element = event.currentTarget;
          if (!openRef.current) {
            if (isPrintableKey(event)) {
              event.preventDefault();
              openList(event.key);
              return;
            }
            if (event.key === 'Enter' || event.key === 'F2' || (event.key === 'ArrowDown' && event.altKey)) {
              event.preventDefault();
              openList();
              return;
            }
            if (event.key === 'Backspace' || event.key === 'Delete') {
              event.preventDefault();
              if (value) {
                setDraft('');
                onSave('');
              }
              return;
            }
            const direction = navDirectionOf(event);
            if (direction) {
              event.preventDefault();
              requestCellNav(element, direction);
            }
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setNavigated(true);
            setHighlight((prev) => Math.min(prev + 1, filtered.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setNavigated(true);
            setHighlight((prev) => Math.max(prev - 1, 0));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if ((typed || navigated) && filtered[highlight]) choose(filtered[highlight]);
            else if (typed) {
              commit(draft);
              closeList();
            } else closeList();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setDraft(value ?? '');
            closeList();
          } else if (event.key === 'Tab') {
            event.preventDefault();
            finishTyping();
            requestCellNav(element, event.shiftKey ? 'prev' : 'next');
          }
        }}
      />
      <span
        className="dj-list-caret"
        aria-hidden="true"
        onMouseDown={(event) => {
          event.preventDefault();
          if (document.activeElement !== inputRef.current) inputRef.current?.focus();
          if (openRef.current) finishTyping();
          else openList();
        }}
      >
        ▾
      </span>
      {open && rect && filtered.length > 0 && createPortal(
        <div
          className="dj-list-popup"
          style={{ left: rect.left, top: rect.bottom + 2, minWidth: Math.max(rect.width, 120) }}
          // mousedown, а не click: иначе blur инпута закроет список раньше выбора
          onMouseDown={(event) => event.preventDefault()}
        >
          {filtered.map((option, index) => (
            <div
              key={option}
              className={`dj-list-option${index === highlight ? ' is-active' : ''}${option === value ? ' is-selected' : ''}`}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => choose(option)}
            >
              {colorOf?.(option) ? (
                <span className="dj-status-chip dj-list-chip" style={colorOf(option)}>
                  {option}
                </span>
              ) : option}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </span>
  );
}
