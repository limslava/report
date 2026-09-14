import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
 * не держит поппер на каждую строку: список рисуется порталом только у ячейки
 * в фокусе, поэтому таблица на тысячи строк не тормозит. Свободный ввод разрешён.
 */
export default function ListCell({ value, options, colorOf, normalize, placeholder, strict, onSave }: ListCellProps) {
  const [draft, setDraft] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  // выбор из списка уже сохранил значение — blur не должен повторно сохранять старый черновик
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(value ?? '');
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
    skipBlurCommitRef.current = true;
    setOpen(false);
    inputRef.current?.blur();
  };

  const cellStyle = colorOf && draft ? colorOf(draft) : undefined;

  return (
    <>
      <input
        ref={inputRef}
        className={`dj-cell-input${cellStyle?.background ? ' dj-cell-input--chip' : ''}`}
        style={cellStyle}
        value={draft}
        title={draft.length > 14 ? draft : undefined}
        placeholder={placeholder}
        onChange={(event) => {
          setDraft(event.target.value);
          setTyped(true);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => {
          focusedRef.current = true;
          setTyped(false);
          setHighlight(Math.max(0, options.indexOf(draft)));
          setOpen(true);
        }}
        onBlur={() => {
          focusedRef.current = false;
          setOpen(false);
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
          }
          commit(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setHighlight((prev) => Math.min(prev + 1, filtered.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlight((prev) => Math.max(prev - 1, 0));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (open && typed && filtered[highlight]) choose(filtered[highlight]);
            else inputRef.current?.blur();
          } else if (event.key === 'Escape') {
            setDraft(value ?? '');
            setOpen(false);
          }
        }}
      />
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
    </>
  );
}
