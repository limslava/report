import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isPrintableKey, navDirectionOf, requestCellNav } from './cellKeys';

type EditableCellProps = {
  value: string | null;
  multiline?: boolean;
  /** Как показывать значение вне правки (например, формат «Финансы»); при правке — как введено. */
  format?: (value: string) => string;
  onSave: (value: string) => void;
};

/**
 * 'view' — ячейка выделена, но не правится (как в google: клик выделяет);
 * 'caret' — правка с курсором (двойной клик, Enter, F2): стрелки двигают курсор;
 * 'typed' — начали печатать поверх: стрелки сохраняют и переходят к соседней ячейке.
 */
type Mode = 'view' | 'caret' | 'typed';

export default function EditableCell({ value, multiline, format, onSave }: EditableCellProps) {
  const [draft, setDraft] = useState(value ?? '');
  const [mode, setMode] = useState<Mode>('view');
  // режим в ref — blur, пришедший сразу после Enter/Tab, не должен сохранять второй раз
  const modeRef = useRef<Mode>('view');
  const caretToEndRef = useRef(false);
  // многострочная ячейка: вне правки — однострочное поле с «…», в правке — раскрытое поле поверх таблицы.
  // Поле меняется на лету, поэтому фокус переносим сами
  const refocusRef = useRef(false);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const editing = mode !== 'view';

  useEffect(() => {
    if (modeRef.current === 'view') setDraft(value ?? '');
  }, [value]);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    if (multiline && (editing || refocusRef.current) && document.activeElement !== field) {
      refocusRef.current = false;
      field.focus({ preventScroll: true });
    }
    if (!editing || !caretToEndRef.current) return;
    caretToEndRef.current = false;
    const end = field.value.length;
    field.setSelectionRange(end, end);
  }, [editing, mode, multiline]);

  const startEdit = (next: Exclude<Mode, 'view'>, initial?: string) => {
    if (initial !== undefined) setDraft(initial);
    caretToEndRef.current = true;
    modeRef.current = next;
    setMode(next);
  };

  const finish = (save: boolean) => {
    if (modeRef.current === 'view') return;
    modeRef.current = 'view';
    setMode('view');
    if (!save) {
      setDraft(value ?? '');
      return;
    }
    if (draft !== (value ?? '')) onSave(draft);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    if (modeRef.current === 'view') {
      if (isPrintableKey(event)) {
        event.preventDefault();
        startEdit('typed', event.key);
        return;
      }
      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        startEdit('caret');
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        setDraft('');
        if (value) onSave('');
        return;
      }
      const direction = navDirectionOf(event);
      if (direction) {
        event.preventDefault();
        requestCellNav(element, direction);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      refocusRef.current = true;
      finish(false);
      return;
    }
    // Enter — сохранить и вниз; перенос строки в многострочной ячейке — Shift/Alt+Enter
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      finish(true);
      requestCellNav(element, 'down');
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      finish(true);
      requestCellNav(element, event.shiftKey ? 'prev' : 'next');
      return;
    }
    if (modeRef.current === 'typed') {
      const direction = navDirectionOf(event);
      if (direction) {
        event.preventDefault();
        finish(true);
        requestCellNav(element, direction);
      }
    }
  };

  // вне правки переносы строк показываем пробелом: ячейка однострочная, полный текст — в строке значения
  const shown = editing ? draft : (format ? format(draft) : draft.replace(/\s*\n\s*/g, ' '));
  const common = {
    value: shown,
    readOnly: !editing,
    title: !editing && draft.length > 14 ? draft : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (modeRef.current !== 'view') setDraft(event.target.value);
    },
    onDoubleClick: () => {
      if (modeRef.current === 'view') startEdit('caret');
    },
    onBlur: () => finish(true),
    onKeyDown,
  };

  if (multiline && editing) {
    return (
      <span className="dj-multi-edit">
        <textarea
          ref={fieldRef}
          className="dj-cell-textarea is-editing"
          rows={3}
          {...common}
        />
      </span>
    );
  }
  return <input ref={fieldRef} className={`dj-cell-input${editing ? ' is-editing' : ''}`} {...common} />;
}
