import { Fragment, useEffect, useMemo, useState } from 'react';
import '../styles/operations-preview.css';

type ViewMode = 'matrix' | 'calendar' | 'summary';

const VIEW_TABS: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'matrix', label: 'Таблица (как сейчас)', hint: 'Excel‑стиль' },
  { id: 'calendar', label: 'Календарь месяца', hint: 'Дни с машинами' },
  { id: 'summary', label: 'Сводка', hint: 'Итоги по отделам' },
];

const MONTH_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAY_BY_DAY = MONTH_DAYS.map((day) => WEEKDAYS[(day + 0) % 7]);

type PersonRow = {
  id: string;
  name: string;
  secondName?: string;
  plate: string;
  note?: string;
  secondNote?: string;
  department: 'Контейнеры' | 'Авто';
};

const PREVIEW_PEOPLE: PersonRow[] = [
  { id: 'p1', name: 'Гилев', plate: 'Н1098СВ', department: 'Контейнеры' },
  { id: 'p2', name: 'Иваненко', plate: 'А590ХР', department: 'Контейнеры' },
  { id: 'p3', name: 'Ким', plate: 'М1604ХР', department: 'Контейнеры' },
  { id: 'p4', name: 'Адамюк Р.', plate: 'М1560ХР', department: 'Контейнеры' },
  { id: 'p5', name: 'Анисимов', plate: 'Т216РА', department: 'Контейнеры' },
  { id: 'p6', name: 'Туркин Михаил', plate: 'Т216РА', department: 'Авто' },
  { id: 'p7', name: 'Подгайко Константин', plate: 'Е617ХР', department: 'Авто' },
  { id: 'p8', name: 'Бояров Петр', plate: 'С357ХТ', department: 'Авто' },
  { id: 'p9', name: 'Кузьменко Александр', plate: 'Н103СВ', department: 'Авто' },
  { id: 'p10', name: 'Марутов Евгений', plate: 'Н106СВ', department: 'Авто' },
  { id: 'p11', name: 'Петровский Юрий', plate: 'Х795РА', department: 'Авто' },
  { id: 'p12', name: 'Ахматшин Сергей', plate: 'Н105СВ', department: 'Авто' },
];

type CellCode = 'W' | 'O' | 'B' | 'H' | 'R' | 'M' | 'N';

const CELL_META: Record<CellCode, { code: string; label: string; css: string }> = {
  W: { code: '1', label: 'на линии', css: 'work' },
  O: { code: 'В', label: 'выходной', css: 'off' },
  B: { code: 'Б', label: 'больничный', css: 'sick' },
  H: { code: 'П', label: 'пол дня', css: 'half' },
  R: { code: 'Р', label: 'ремонт', css: 'repair' },
  M: { code: 'М', label: 'мойка/освб', css: 'wash' },
  N: { code: 'Н', label: 'нет работы', css: 'idle' },
};

const getMonthlyCell = (rowIndex: number, day: number): CellCode => {
  if (day % 13 === 0) return 'R';
  if ((rowIndex + day) % 9 === 0) return 'B';
  if ((rowIndex + day) % 7 === 0) return 'O';
  if ((rowIndex + day) % 6 === 0) return 'H';
  if ((rowIndex + day) % 11 === 0) return 'M';
  if ((rowIndex + day) % 5 === 0) return 'N';
  return 'W';
};

export default function OperationsPreview() {
  const [filter, setFilter] = useState<'Все' | 'Контейнеры' | 'Авто'>('Все');
  const [view, setView] = useState<ViewMode>('matrix');
  const [summaryDay, setSummaryDay] = useState(9);
  const [overrides, setOverrides] = useState<Record<string, CellCode>>({});
  const [activeCell, setActiveCell] = useState<{
    key: string;
    personName: string;
    day: number;
    value: CellCode;
  } | null>(null);
  const [selectedCell, setSelectedCell] = useState<{
    key: string;
    personName: string;
    day: number;
    value: CellCode;
    personId: string;
    lane: '1' | '2';
  } | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [paintCode, setPaintCode] = useState<CellCode>('W');
  const [lastPaintKeyAt, setLastPaintKeyAt] = useState<number | null>(null);
  const [paintRow, setPaintRow] = useState<{ personId: string; lane: '1' | '2' } | null>(null);
  const [clipboardCell, setClipboardCell] = useState<CellCode | null>(null);
  const [editPerson, setEditPerson] = useState<PersonRow | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    person: PersonRow;
  } | null>(null);
  const [clipboardPerson, setClipboardPerson] = useState<PersonRow | null>(null);
  const [noteEdit, setNoteEdit] = useState<{
    personId: string;
    lane: '1' | '2';
    value: string;
  } | null>(null);

  const [peopleState, setPeopleState] = useState<PersonRow[]>(PREVIEW_PEOPLE);
  const [addOpen, setAddOpen] = useState(false);
  const [newPerson, setNewPerson] = useState<{
    name: string;
    secondName: string;
    plate: string;
    note: string;
    secondNote: string;
    department: 'Контейнеры' | 'Авто';
  }>({
    name: '',
    secondName: '',
    plate: '',
    note: '',
    secondNote: '',
    department: 'Контейнеры',
  });

  const people = useMemo(() => {
    if (filter === 'Все') return peopleState;
    return peopleState.filter((person) => person.department === filter);
  }, [filter, peopleState]);

  const peopleWithIndex = useMemo(
    () => people.map((person, index) => ({ ...person, rowIndex: index })),
    [people]
  );

  const getCellCode = (rowIndex: number, day: number, personId: string, lane: '1' | '2' = '1') => {
    const key = `${personId}-${lane}-${day}`;
    return overrides[key] ?? getMonthlyCell(rowIndex, day);
  };

  const summaryStats = useMemo(() => {
    const empty = { work: 0, off: 0, repair: 0, sick: 0, half: 0, wash: 0, idle: 0 };
    const stats = { containers: { ...empty }, auto: { ...empty } };
    peopleWithIndex.forEach((person) => {
      const cell = getCellCode(person.rowIndex, summaryDay, person.id, '1');
      const bucket = person.department === 'Контейнеры' ? stats.containers : stats.auto;
      if (cell === 'W') bucket.work += 1;
      if (cell === 'O') bucket.off += 1;
      if (cell === 'R') bucket.repair += 1;
      if (cell === 'B') bucket.sick += 1;
      if (cell === 'H') bucket.half += 1;
      if (cell === 'M') bucket.wash += 1;
      if (cell === 'N') bucket.idle += 1;

      if (person.secondName) {
        const cell2 = getCellCode(person.rowIndex + 50, summaryDay, person.id, '2');
        if (cell2 === 'W') bucket.work += 1;
        if (cell2 === 'O') bucket.off += 1;
        if (cell2 === 'R') bucket.repair += 1;
        if (cell2 === 'B') bucket.sick += 1;
        if (cell2 === 'H') bucket.half += 1;
        if (cell2 === 'M') bucket.wash += 1;
        if (cell2 === 'N') bucket.idle += 1;
      }
    });
    return stats;
  }, [peopleWithIndex, summaryDay, overrides]);

  const calendarAssignments = (day: number) => {
    return peopleWithIndex
      .filter((_, index) => (index + day) % 2 === 0)
      .map((person) => {
        const cell = getCellCode(person.rowIndex, day, person.id, '1');
        const meta = CELL_META[cell];
        return {
          vehicle: person.plate,
          status: meta.css,
          label: meta.label,
          code: meta.code,
        };
      });
  };

  const handleDeletePerson = (personId: string) => {
    setPeopleState((prev) => prev.filter((item) => item.id !== personId));
    setOverrides((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`${personId}-`)) delete next[key];
      });
      return next;
    });
  };

  const handlePastePerson = (targetDepartment: 'Контейнеры' | 'Авто') => {
    if (!clipboardPerson) return;
    setPeopleState((prev) => [
      ...prev,
      {
        ...clipboardPerson,
        id: `p-${Date.now()}`,
        department: targetDepartment,
      },
    ]);
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!selectedCell || view !== 'matrix') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        const rows: { personId: string; lane: '1' | '2'; personName: string; rowIndex: number }[] = [];
        const visiblePeople =
          filter === 'Все' ? peopleWithIndex : peopleWithIndex.filter((person) => person.department === filter);
        visiblePeople.forEach((person) => {
          rows.push({ personId: person.id, lane: '1', personName: person.name, rowIndex: person.rowIndex });
          if (person.secondName) {
            rows.push({
              personId: person.id,
              lane: '2',
              personName: person.secondName ?? '',
              rowIndex: person.rowIndex + 50,
            });
          }
        });
        const currentIndex = rows.findIndex(
          (row) => row.personId === selectedCell.personId && row.lane === selectedCell.lane
        );
        if (currentIndex === -1) return;
        let nextRowIndex = currentIndex;
        let nextDay = selectedCell.day;
        if (event.key === 'ArrowLeft') nextDay = Math.max(1, selectedCell.day - 1);
        if (event.key === 'ArrowRight') nextDay = Math.min(31, selectedCell.day + 1);
        if (event.key === 'ArrowUp') nextRowIndex = Math.max(0, currentIndex - 1);
        if (event.key === 'ArrowDown') nextRowIndex = Math.min(rows.length - 1, currentIndex + 1);
        const nextRow = rows[nextRowIndex];
        const nextKey = `${nextRow.personId}-${nextRow.lane}-${nextDay}`;
        const nextValue = overrides[nextKey] ?? getMonthlyCell(nextRow.rowIndex, nextDay);
        setSelectedCell({
          key: nextKey,
          personName: nextRow.personName,
          day: nextDay,
          value: nextValue,
          personId: nextRow.personId,
          lane: nextRow.lane,
        });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        setClipboardCell(selectedCell.value);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        if (!clipboardCell) return;
        event.preventDefault();
        setOverrides((prev) => ({ ...prev, [selectedCell.key]: clipboardCell }));
        setSelectedCell((prev) => (prev ? { ...prev, value: clipboardCell } : prev));
        setPaintCode(clipboardCell);
        setLastPaintKeyAt(Date.now());
        return;
      }
      const raw = event.key;
      const key = raw.length === 1 ? raw.toLowerCase() : raw;
      const keyMap: Record<string, CellCode> = {
        '1': 'W',
        'в': 'O',
        'b': 'B',
        'б': 'B',
        'н': 'N',
        'h': 'N',
        'п': 'H',
        'g': 'H',
        'р': 'R',
        'p': 'R',
        'м': 'M',
        'v': 'M',
      };
      const code = keyMap[key];
      if (!code) return;
      event.preventDefault();
      setOverrides((prev) => ({ ...prev, [selectedCell.key]: code }));
      setSelectedCell((prev) => (prev ? { ...prev, value: code } : prev));
      setPaintCode(code);
      setLastPaintKeyAt(Date.now());
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedCell, filter, view, peopleWithIndex, overrides, clipboardCell]);

  useEffect(() => {
    const handleMouseUp = () => {
      setIsPainting(false);
      setPaintRow(null);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const startNoteEdit = (person: PersonRow, lane: '1' | '2') => {
    setContextMenu(null);
    setActiveCell(null);
    setEditPerson(null);
    setNoteEdit({
      personId: person.id,
      lane,
      value: lane === '1' ? person.note ?? '' : person.secondNote ?? '',
    });
  };

  const commitNoteEdit = () => {
    if (!noteEdit) return;
    setPeopleState((prev) =>
      prev.map((item) => {
        if (item.id !== noteEdit.personId) return item;
        if (noteEdit.lane === '1') {
          return { ...item, note: noteEdit.value.trim() ? noteEdit.value : undefined };
        }
        return { ...item, secondNote: noteEdit.value.trim() ? noteEdit.value : undefined };
      })
    );
    setNoteEdit(null);
  };

  return (
    <div className="ops-preview">
      <header className="ops-preview__header">
        <div>
          <div className="ops-preview__title">Ежемесячный обзор по водителям и ТС</div>
          <div className="ops-preview__subtitle">
            Превью интерфейса. Показываем месяц тремя разными форматами.
          </div>
        </div>
        <div className="ops-preview__actions">
          <button type="button" className="ops-btn">Импорт Excel</button>
          <button type="button" className="ops-btn ghost">Экспорт</button>
        </div>
      </header>

      <section className="ops-preview__controls">
        <label className="ops-control">
          <span>Месяц</span>
          <input type="month" value="2026-04" readOnly />
        </label>
        <label className="ops-control">
          <span>Тип работы</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value as 'Все' | 'Контейнеры' | 'Авто')}>
            <option>Все</option>
            <option>Контейнеры</option>
            <option>Авто</option>
          </select>
        </label>
        <div className="ops-preview__view-toggle">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`ops-view-tab${view === tab.id ? ' active' : ''}`}
              onClick={() => setView(tab.id)}
            >
              <span>{tab.label}</span>
              <small>{tab.hint}</small>
            </button>
          ))}
        </div>
      </section>

      {view === 'matrix' && (
        <section className="ops-preview__matrix">
          <div className="ops-preview__matrix-toolbar">
            <div className="ops-preview__matrix-tabs">
              {(['Контейнеры', 'Авто'] as const).map((section) => (
                <button
                  key={section}
                  type="button"
                  className={`ops-matrix-tab${filter === section ? ' active' : ''}`}
                  onClick={() => setFilter(section)}
                >
                  {section === 'Авто' ? 'Автовозы' : 'Контейнеровозы'}
                </button>
              ))}
            </div>
            <button type="button" className="ops-btn" onClick={() => setAddOpen(true)}>
              Добавить водителя / ТС
            </button>
          </div>
          <div className="ops-matrix">
            <div className="ops-matrix__row ops-matrix__head ops-matrix__head--days">
              <div className="ops-matrix__cell ops-matrix__cell--sticky">ФИО</div>
              <div className="ops-matrix__cell ops-matrix__cell--sticky-second">Г/Н ТС</div>
              <div className="ops-matrix__cell ops-matrix__cell--sticky-third">Примечание</div>
              {MONTH_DAYS.map((day) => (
                <div key={`head-${day}`} className="ops-matrix__cell ops-matrix__cell--head">{day}</div>
              ))}
              <div className="ops-matrix__cell ops-matrix__cell--head">Кол‑во смен</div>
            </div>
            <div className="ops-matrix__row ops-matrix__head ops-matrix__head--weekdays">
              <div className="ops-matrix__cell ops-matrix__cell--sticky"> </div>
              <div className="ops-matrix__cell ops-matrix__cell--sticky-second"> </div>
              <div className="ops-matrix__cell ops-matrix__cell--sticky-third"> </div>
              {WEEKDAY_BY_DAY.map((day, index) => (
                <div key={`weekday-${index}`} className={`ops-matrix__cell ops-matrix__cell--weekday ${day === 'Сб' || day === 'Вс' ? 'weekend' : ''}`}>
                  {day}
                </div>
              ))}
              <div className="ops-matrix__cell ops-matrix__cell--weekday"> </div>
            </div>

            {(['Контейнеры', 'Авто'] as const).map((section) => {
              if (filter !== 'Все' && filter !== section) return null;
              const sectionPeople = peopleWithIndex.filter((person) => person.department === section);
              return (
                <div
                  key={`section-${section}`}
                  className="ops-matrix__section"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (!draggingId) return;
                    setPeopleState((prev) =>
                      prev.map((person) =>
                        person.id === draggingId ? { ...person, department: section } : person
                      )
                    );
                    setDraggingId(null);
                  }}
                >
                  <div className="ops-matrix__row ops-matrix__section-row">
                    <div className="ops-matrix__cell ops-matrix__cell--sticky ops-matrix__section-title">{section === 'Авто' ? 'АВТОВОЗЫ' : 'КОНТЕЙНЕРОВОЗЫ'}</div>
                    <div className="ops-matrix__cell ops-matrix__cell--sticky-second"> </div>
                    <div className="ops-matrix__cell ops-matrix__cell--sticky-third"> </div>
                    {MONTH_DAYS.map((day) => (
                      <div key={`section-${section}-${day}`} className="ops-matrix__cell ops-matrix__section-fill" />
                    ))}
                    <div className="ops-matrix__cell ops-matrix__section-fill" />
                  </div>

                  {sectionPeople.map((person) => {
                    const workCount = MONTH_DAYS.reduce((acc, day) => {
                      const code = getCellCode(person.rowIndex, day, person.id, '1');
                      return code === 'W' ? acc + 1 : acc;
                    }, 0);
                    const workCountSecond = person.secondName
                      ? MONTH_DAYS.reduce((acc, day) => {
                        const code = getCellCode(person.rowIndex + 50, day, person.id, '2');
                        return code === 'W' ? acc + 1 : acc;
                      }, 0)
                      : 0;

                    const Row = ({ lane }: { lane: '1' | '2' }) => {
                      const isSecond = lane === '2';
                      const name = isSecond ? person.secondName : person.name;
                      const rowIndex = isSecond ? person.rowIndex + 50 : person.rowIndex;
                      const workCountValue = isSecond ? workCountSecond : workCount;
                      return (
                        <div
                          className={`ops-matrix__row ops-matrix__row--draggable${person.secondName ? ' ops-matrix__row--split' : ''}`}
                          draggable={!isSecond}
                          onDragStart={(event) => {
                            if (isPainting) {
                              event.preventDefault();
                              return;
                            }
                            if (!isSecond) setDraggingId(person.id);
                          }}
                          onDragEnd={() => !isSecond && setDraggingId(null)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setContextMenu({
                              x: event.clientX,
                              y: event.clientY,
                              person,
                            });
                          }}
                        >
                          <div className="ops-matrix__cell ops-matrix__cell--sticky ops-matrix__cell--name">
                            <div className="ops-matrix__name">
                              <span
                                onDoubleClick={() => setEditPerson(person)}
                                title="Двойной щелчок для редактирования"
                              >
                                {name ?? ''}
                              </span>
                            </div>
                          </div>
                          <div
                            className={`ops-matrix__cell ops-matrix__cell--sticky-second${isSecond ? ' ops-matrix__cell--placeholder' : ''}`}
                          >
                            {!isSecond && (
                              <div className="ops-matrix__plate">
                                <span
                                  onDoubleClick={() => setEditPerson(person)}
                                  title="Двойной щелчок для редактирования"
                                >
                                  {person.plate}
                                </span>
                                <span className="ops-matrix__drag-hint" title="Перетащите строку в другую вкладку">↕</span>
                              </div>
                            )}
                          </div>
                          <div
                            className="ops-matrix__cell ops-matrix__cell--sticky-third ops-matrix__note-cell"
                            onDoubleClick={() => startNoteEdit(person, isSecond ? '2' : '1')}
                            title="Двойной щелчок для редактирования"
                          >
                            <div className="ops-matrix__note">
                              {noteEdit?.personId === person.id && noteEdit.lane === (isSecond ? '2' : '1') ? (
                                <input
                                  className="ops-matrix__note-input"
                                  value={noteEdit.value}
                                  autoFocus
                                  onChange={(event) =>
                                    setNoteEdit((current) =>
                                      current ? { ...current, value: event.target.value } : current
                                    )
                                  }
                                  onBlur={commitNoteEdit}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') commitNoteEdit();
                                    if (event.key === 'Escape') setNoteEdit(null);
                                  }}
                                />
                              ) : (
                                <span title={isSecond ? person.secondNote ?? '' : person.note ?? ''}>
                                  {isSecond ? person.secondNote ?? '' : person.note ?? ''}
                                </span>
                              )}
                            </div>
                          </div>
                          {MONTH_DAYS.map((day) => {
                            const cell = getCellCode(rowIndex, day, person.id, lane);
                            const meta = CELL_META[cell];
                            return (
                              <div
                                key={`${person.id}-${lane}-${day}`}
                                className={`ops-matrix__cell ops-matrix__cell--${meta.css} ops-matrix__cell--editable${selectedCell?.key === `${person.id}-${lane}-${day}` ? ' ops-matrix__cell--selected' : ''}`}
                                title={`${name}: ${meta.label}`}
                                role="button"
                                tabIndex={0}
                                onMouseDown={(event) => {
                                  if (event.button !== 0) return;
                                  event.preventDefault();
                                  const key = `${person.id}-${lane}-${day}`;
                                  const now = Date.now();
                                  if (!lastPaintKeyAt || now - lastPaintKeyAt > 1500) {
                                    setPaintCode(cell);
                                  }
                                  setSelectedCell({
                                    key,
                                    personName: name ?? '',
                                    day,
                                    value: cell,
                                    personId: person.id,
                                    lane,
                                  });
                                  setIsPainting(true);
                                  setPaintRow({ personId: person.id, lane });
                                  setOverrides((prev) => ({ ...prev, [key]: cell }));
                                }}
                                onMouseEnter={() => {
                                  if (!isPainting) return;
                                  if (!paintRow || paintRow.personId !== person.id || paintRow.lane !== lane) return;
                                  const key = `${person.id}-${lane}-${day}`;
                                  setOverrides((prev) => ({ ...prev, [key]: paintCode }));
                                  setSelectedCell({
                                    key,
                                    personName: name ?? '',
                                    day,
                                    value: paintCode,
                                    personId: person.id,
                                    lane,
                                  });
                                }}
                                onClick={() =>
                                  setSelectedCell({
                                    key: `${person.id}-${lane}-${day}`,
                                    personName: name ?? '',
                                    day,
                                    value: cell,
                                    personId: person.id,
                                    lane,
                                  })
                                }
                                onDoubleClick={() => setActiveCell({ key: `${person.id}-${lane}-${day}`, personName: name ?? '', day, value: cell })}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    setActiveCell({ key: `${person.id}-${lane}-${day}`, personName: name ?? '', day, value: cell });
                                  }
                                }}
                              >
                                {meta.code}
                              </div>
                            );
                          })}
                          <div className="ops-matrix__cell ops-matrix__cell--count">{workCountValue}</div>
                        </div>
                      );
                    };

                    return (
                      <div key={person.id} className="ops-matrix__person">
                        {!person.secondName && <Row lane="1" />}
                        {person.secondName && (
                          <div
                            className="ops-matrix__person-grid"
                            draggable
                            onDragStart={(event) => {
                              if (isPainting) {
                                event.preventDefault();
                                return;
                              }
                              setDraggingId(person.id);
                            }}
                            onDragEnd={() => setDraggingId(null)}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              setContextMenu({ x: event.clientX, y: event.clientY, person });
                            }}
                          >
                            <div className="ops-matrix__cell ops-matrix__cell--name ops-matrix__cell--sticky" style={{ gridColumn: 1, gridRow: 1 }}>
                              <div className="ops-matrix__name">
                                <span
                                  onDoubleClick={() => setEditPerson(person)}
                                  title="Двойной щелчок для редактирования"
                                >
                                  {person.name}
                                </span>
                              </div>
                            </div>
                            <div className="ops-matrix__cell ops-matrix__cell--name ops-matrix__cell--row2 ops-matrix__cell--name-left ops-matrix__cell--sticky" style={{ gridColumn: 1, gridRow: 2 }}>
                              <div className="ops-matrix__name">
                                <span
                                  onDoubleClick={() => setEditPerson(person)}
                                  title="Двойной щелчок для редактирования"
                                >
                                  {person.secondName}
                                </span>
                              </div>
                            </div>
                            <div
                              className="ops-matrix__cell ops-matrix__cell--merged ops-matrix__cell--sticky-second"
                              style={{ gridColumn: 2, gridRow: '1 / span 2' }}
                            >
                              <div className="ops-matrix__plate">
                                <span
                                  onDoubleClick={() => setEditPerson(person)}
                                  title="Двойной щелчок для редактирования"
                                >
                                  {person.plate}
                                </span>
                                <span className="ops-matrix__drag-hint" title="Перетащите строку в другую вкладку">↕</span>
                              </div>
                            </div>
                            <div
                              className="ops-matrix__cell ops-matrix__note-cell ops-matrix__cell--sticky-third"
                              style={{ gridColumn: 3, gridRow: 1 }}
                              onDoubleClick={() => startNoteEdit(person, '1')}
                            >
                              <div className="ops-matrix__note">
                                {noteEdit?.personId === person.id && noteEdit.lane === '1' ? (
                                  <input
                                    className="ops-matrix__note-input"
                                    value={noteEdit.value}
                                    autoFocus
                                    onChange={(event) =>
                                      setNoteEdit((current) =>
                                        current ? { ...current, value: event.target.value } : current
                                      )
                                    }
                                    onBlur={commitNoteEdit}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') commitNoteEdit();
                                      if (event.key === 'Escape') setNoteEdit(null);
                                    }}
                                  />
                                ) : (
                                  <span title={person.note ?? ''}>{person.note ?? ''}</span>
                                )}
                              </div>
                            </div>
                            <div
                              className="ops-matrix__cell ops-matrix__cell--row2 ops-matrix__note-cell ops-matrix__cell--sticky-third"
                              style={{ gridColumn: 3, gridRow: 2 }}
                              onDoubleClick={() => startNoteEdit(person, '2')}
                            >
                              <div className="ops-matrix__note">
                                {noteEdit?.personId === person.id && noteEdit.lane === '2' ? (
                                  <input
                                    className="ops-matrix__note-input"
                                    value={noteEdit.value}
                                    autoFocus
                                    onChange={(event) =>
                                      setNoteEdit((current) =>
                                        current ? { ...current, value: event.target.value } : current
                                      )
                                    }
                                    onBlur={commitNoteEdit}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') commitNoteEdit();
                                      if (event.key === 'Escape') setNoteEdit(null);
                                    }}
                                  />
                                ) : (
                                  <span title={person.secondNote ?? ''}>{person.secondNote ?? ''}</span>
                                )}
                              </div>
                            </div>
                            {MONTH_DAYS.map((day, idx) => {
                              const col = 4 + idx;
                              const cell1 = getCellCode(person.rowIndex, day, person.id, '1');
                              const meta1 = CELL_META[cell1];
                              const cell2 = getCellCode(person.rowIndex + 50, day, person.id, '2');
                              const meta2 = CELL_META[cell2];
                              return (
                                <Fragment key={`grid-${person.id}-${day}`}>
                                  <div
                                    className={`ops-matrix__cell ops-matrix__cell--${meta1.css} ops-matrix__cell--editable${selectedCell?.key === `${person.id}-1-${day}` ? ' ops-matrix__cell--selected' : ''}`}
                                    style={{ gridColumn: col, gridRow: 1 }}
                                    title={`${person.name}: ${meta1.label}`}
                                    role="button"
                                    tabIndex={0}
                                    onMouseDown={(event) => {
                                      if (event.button !== 0) return;
                                      event.preventDefault();
                                    const key = `${person.id}-1-${day}`;
                                    const now = Date.now();
                                    if (!lastPaintKeyAt || now - lastPaintKeyAt > 1500) {
                                      setPaintCode(cell1);
                                    }
                                    setSelectedCell({
                                      key,
                                      personName: person.name,
                                      day,
                                      value: cell1,
                                      personId: person.id,
                                      lane: '1',
                                    });
                                    setIsPainting(true);
                                    setPaintRow({ personId: person.id, lane: '1' });
                                    setOverrides((prev) => ({ ...prev, [key]: cell1 }));
                                  }}
                                  onMouseEnter={() => {
                                    if (!isPainting) return;
                                    if (!paintRow || paintRow.personId !== person.id || paintRow.lane !== '1') return;
                                    const key = `${person.id}-1-${day}`;
                                    setOverrides((prev) => ({ ...prev, [key]: paintCode }));
                                      setSelectedCell({
                                        key,
                                        personName: person.name,
                                        day,
                                        value: paintCode,
                                        personId: person.id,
                                        lane: '1',
                                      });
                                    }}
                                    onClick={() =>
                                      setSelectedCell({
                                        key: `${person.id}-1-${day}`,
                                        personName: person.name,
                                        day,
                                        value: cell1,
                                        personId: person.id,
                                        lane: '1',
                                      })
                                    }
                                    onDoubleClick={() => setActiveCell({ key: `${person.id}-1-${day}`, personName: person.name, day, value: cell1 })}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') {
                                        setActiveCell({ key: `${person.id}-1-${day}`, personName: person.name, day, value: cell1 });
                                      }
                                    }}
                                  >
                                    {meta1.code}
                                  </div>
                                  <div
                                    className={`ops-matrix__cell ops-matrix__cell--${meta2.css} ops-matrix__cell--editable ops-matrix__cell--row2${selectedCell?.key === `${person.id}-2-${day}` ? ' ops-matrix__cell--selected' : ''}`}
                                    style={{ gridColumn: col, gridRow: 2 }}
                                    title={`${person.secondName}: ${meta2.label}`}
                                    role="button"
                                    tabIndex={0}
                                    onMouseDown={(event) => {
                                      if (event.button !== 0) return;
                                      event.preventDefault();
                                    const key = `${person.id}-2-${day}`;
                                    const now = Date.now();
                                    if (!lastPaintKeyAt || now - lastPaintKeyAt > 1500) {
                                      setPaintCode(cell2);
                                    }
                                    setSelectedCell({
                                      key,
                                      personName: person.secondName ?? '',
                                      day,
                                      value: cell2,
                                      personId: person.id,
                                      lane: '2',
                                    });
                                    setIsPainting(true);
                                    setPaintRow({ personId: person.id, lane: '2' });
                                    setOverrides((prev) => ({ ...prev, [key]: cell2 }));
                                  }}
                                  onMouseEnter={() => {
                                    if (!isPainting) return;
                                    if (!paintRow || paintRow.personId !== person.id || paintRow.lane !== '2') return;
                                    const key = `${person.id}-2-${day}`;
                                    setOverrides((prev) => ({ ...prev, [key]: paintCode }));
                                      setSelectedCell({
                                        key,
                                        personName: person.secondName ?? '',
                                        day,
                                        value: paintCode,
                                        personId: person.id,
                                        lane: '2',
                                      });
                                    }}
                                    onClick={() =>
                                      setSelectedCell({
                                        key: `${person.id}-2-${day}`,
                                        personName: person.secondName ?? '',
                                        day,
                                        value: cell2,
                                        personId: person.id,
                                        lane: '2',
                                      })
                                    }
                                    onDoubleClick={() => setActiveCell({ key: `${person.id}-2-${day}`, personName: person.secondName ?? '', day, value: cell2 })}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') {
                                        setActiveCell({ key: `${person.id}-2-${day}`, personName: person.secondName ?? '', day, value: cell2 });
                                      }
                                    }}
                                  >
                                    {meta2.code}
                                  </div>
                                </Fragment>
                              );
                            })}
                            <div className="ops-matrix__cell ops-matrix__cell--count" style={{ gridColumn: 35, gridRow: 1 }}>{workCount}</div>
                            <div className="ops-matrix__cell ops-matrix__cell--count ops-matrix__cell--row2" style={{ gridColumn: 35, gridRow: 2 }}>{workCountSecond}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="ops-matrix__row ops-matrix__footer">
                    <div className="ops-matrix__cell ops-matrix__cell--sticky">Итого {section === 'Авто' ? 'авто' : 'контейнеровозов'} в сутки</div>
                    <div className="ops-matrix__cell ops-matrix__cell--sticky-second"> </div>
                    <div className="ops-matrix__cell ops-matrix__cell--sticky-third"> </div>
                    {MONTH_DAYS.map((day) => {
                      const total = sectionPeople.reduce((acc, person) => {
                        const code = getCellCode(person.rowIndex, day, person.id, '1');
                        const next = code === 'W' ? acc + 1 : acc;
                        if (person.secondName) {
                          const code2 = getCellCode(person.rowIndex + 50, day, person.id, '2');
                          return code2 === 'W' ? next + 1 : next;
                        }
                        return next;
                      }, 0);
                      return (
                        <div key={`total-${section}-${day}`} className="ops-matrix__cell ops-matrix__cell--total">{total}</div>
                      );
                    })}
                    <div className="ops-matrix__cell ops-matrix__cell--count"> </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="ops-matrix__legend">
            {Object.values(CELL_META).map((meta) => (
              <span key={meta.css} className={`legend-item ${meta.css}`}>{meta.code} — {meta.label}</span>
            ))}
          </div>
        </section>
      )}

      {view === 'calendar' && (
        <section className="ops-preview__calendar">
          <div className="ops-calendar__weekdays">
            {WEEKDAYS.map((day) => (
              <div key={day} className="ops-calendar__weekday">{day}</div>
            ))}
          </div>
          <div className="ops-calendar">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={`empty-${index}`} className="ops-calendar__day ops-calendar__day--empty" />
            ))}
            {MONTH_DAYS.map((day) => {
              const assignments = calendarAssignments(day);
              const visible = assignments.slice(0, 4);
              const hiddenCount = assignments.length - visible.length;
              return (
                <div key={`day-${day}`} className="ops-calendar__day">
                  <div className="ops-calendar__day-number">{day}</div>
                  <div className="ops-calendar__list">
                    {visible.map((item) => (
                      <div key={`${item.vehicle}-${day}`} className={`ops-calendar__chip ${item.status}`}>
                        <span>{item.vehicle}</span>
                        <em>{item.code}</em>
                      </div>
                    ))}
                    {hiddenCount > 0 && (
                      <div className="ops-calendar__more">+{hiddenCount} ещё</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {view === 'summary' && (
        <section className="ops-preview__summary">
          <div className="ops-summary__header">
            <div>
              <div className="ops-summary__title">Сводка по отделам</div>
              <div className="ops-summary__subtitle">День месяца можно выбрать для детализации.</div>
            </div>
            <label className="ops-control ops-control--inline">
              <span>День</span>
              <select value={summaryDay} onChange={(event) => setSummaryDay(Number(event.target.value))}>
                {MONTH_DAYS.map((day) => (
                  <option key={`summary-${day}`} value={day}>{day}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="ops-summary__grid">
            {[
              { title: 'Контейнеры', data: summaryStats.containers },
              { title: 'Авто', data: summaryStats.auto },
            ].map((block) => (
              <div key={block.title} className="ops-summary__card">
                <div className="ops-summary__card-title">{block.title}</div>
                <div className="ops-summary__stats">
                  <div className="stat work">Работа: {block.data.work}</div>
                  <div className="stat half">Полдня: {block.data.half}</div>
                  <div className="stat repair">Ремонт: {block.data.repair}</div>
                  <div className="stat off">Выходной: {block.data.off}</div>
                  <div className="stat sick">Больничный: {block.data.sick}</div>
                  <div className="stat wash">Мойка: {block.data.wash}</div>
                  <div className="stat idle">Нет работы: {block.data.idle}</div>
                </div>
                <div className="ops-summary__list">
                  {peopleWithIndex
                    .filter((person) => person.department === block.title)
                    .slice(0, 4)
                    .map((person) => {
                      const cell = getCellCode(person.rowIndex, summaryDay, person.id);
                      const meta = CELL_META[cell];
                      return (
                        <div key={`${block.title}-${person.id}`} className={`ops-summary__row ${meta.css}`}>
                          <span>{person.plate}</span>
                          <em>{meta.label}</em>
                        </div>
                      );
                    })}
                  {peopleWithIndex.filter((person) => person.department === block.title).length > 4 && (
                    <div className="ops-summary__row muted">
                      + ещё {peopleWithIndex.filter((person) => person.department === block.title).length - 4} машин
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="ops-preview__footnotes">
        <div className="ops-preview__card">
          <div className="ops-preview__card-title">Как смотреть</div>
          <ul>
            <li>Матрица — быстро показывает пустоты и проблемы по всему месяцу.</li>
            <li>Календарь — удобен для ежедневного планирования.</li>
            <li>Сводка — для руководства и контроля по отделам.</li>
          </ul>
        </div>
        <div className="ops-preview__card">
          <div className="ops-preview__card-title">Дальше</div>
          <ul>
            <li>Можно добавить фильтры по водителям и статусам.</li>
            <li>По клику на день открывается детальный ввод смен.</li>
          </ul>
        </div>
      </section>
      {activeCell && (
        <div className="ops-modal">
          <div className="ops-modal__content">
            <div className="ops-modal__title">Заполнение ячейки</div>
            <div className="ops-modal__subtitle">
              {activeCell.personName} · День {activeCell.day}
            </div>
            <label className="ops-control">
              <span>Статус</span>
              <select
                value={activeCell.value}
                onChange={(event) =>
                  setActiveCell((current) =>
                    current ? { ...current, value: event.target.value as CellCode } : current
                  )
                }
              >
                {Object.entries(CELL_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.code} — {meta.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="ops-modal__actions">
              <button type="button" className="ops-btn ghost" onClick={() => setActiveCell(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="ops-btn"
                onClick={() => {
                  setOverrides((prev) => ({ ...prev, [activeCell.key]: activeCell.value }));
                  setActiveCell(null);
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
      {addOpen && (
        <div className="ops-modal">
          <div className="ops-modal__content">
            <div className="ops-modal__title">Добавить водителя / ТС</div>
            <div className="ops-modal__subtitle">Превью добавления строки в таблицу.</div>
            <label className="ops-control">
              <span>ФИО</span>
              <input
                type="text"
                value={newPerson.name}
                onChange={(event) => setNewPerson((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Иванов Иван"
              />
            </label>
            <label className="ops-control">
              <span>Второй водитель (опц.)</span>
              <input
                type="text"
                value={newPerson.secondName}
                onChange={(event) => setNewPerson((prev) => ({ ...prev, secondName: event.target.value }))}
                placeholder="Петров Петр"
              />
            </label>
            <label className="ops-control">
              <span>Г/Н ТС</span>
              <input
                type="text"
                value={newPerson.plate}
                onChange={(event) => setNewPerson((prev) => ({ ...prev, plate: event.target.value }))}
                placeholder="А123ВС"
              />
            </label>
            <label className="ops-control">
              <span>Отдел</span>
              <select
                value={newPerson.department}
                onChange={(event) =>
                  setNewPerson((prev) => ({ ...prev, department: event.target.value as 'Контейнеры' | 'Авто' }))
                }
              >
                <option value="Контейнеры">Контейнеровозы</option>
                <option value="Авто">Автовозы</option>
              </select>
            </label>
            <label className="ops-control">
              <span>Примечание</span>
              <input
                type="text"
                value={newPerson.note}
                onChange={(event) => setNewPerson((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="например: ремонт / автовоз"
              />
            </label>
            <label className="ops-control">
              <span>Примечание 2 (опц.)</span>
              <input
                type="text"
                value={newPerson.secondNote}
                onChange={(event) => setNewPerson((prev) => ({ ...prev, secondNote: event.target.value }))}
                placeholder="для второго водителя"
              />
            </label>
            <div className="ops-modal__actions">
              <button type="button" className="ops-btn ghost" onClick={() => setAddOpen(false)}>
                Отмена
              </button>
              <button
                type="button"
                className="ops-btn"
                onClick={() => {
                  if (!newPerson.name || !newPerson.plate) return;
                  setPeopleState((prev) => [
                    ...prev,
                    {
                      id: `p-${Date.now()}`,
                      name: newPerson.name,
                      secondName: newPerson.secondName || undefined,
                      plate: newPerson.plate,
                      note: newPerson.note || undefined,
                      secondNote: newPerson.secondNote || undefined,
                      department: newPerson.department,
                    },
                  ]);
                  setNewPerson({ name: '', secondName: '', plate: '', note: '', secondNote: '', department: newPerson.department });
                  setAddOpen(false);
                }}
              >
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}
      {editPerson && (
        <div className="ops-modal">
          <div className="ops-modal__content">
            <div className="ops-modal__title">Редактировать строку</div>
            <div className="ops-modal__subtitle">Изменения только в превью.</div>
            <label className="ops-control">
              <span>Первый водитель</span>
              <input
                type="text"
                value={editPerson.name}
                onChange={(event) => setEditPerson((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
              />
            </label>
            <label className="ops-control">
              <span>Второй водитель</span>
              <input
                type="text"
                value={editPerson.secondName ?? ''}
                onChange={(event) =>
                  setEditPerson((prev) => (prev ? { ...prev, secondName: event.target.value || undefined } : prev))
                }
              />
            </label>
            <label className="ops-control">
              <span>Г/Н ТС</span>
              <input
                type="text"
                value={editPerson.plate}
                onChange={(event) => setEditPerson((prev) => (prev ? { ...prev, plate: event.target.value } : prev))}
              />
            </label>
            <label className="ops-control">
              <span>Отдел</span>
              <select
                value={editPerson.department}
                onChange={(event) =>
                  setEditPerson((prev) =>
                    prev ? { ...prev, department: event.target.value as 'Контейнеры' | 'Авто' } : prev
                  )
                }
              >
                <option value="Контейнеры">Контейнеровозы</option>
                <option value="Авто">Автовозы</option>
              </select>
            </label>
            <div className="ops-modal__actions">
              <button type="button" className="ops-btn ghost" onClick={() => setEditPerson(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="ops-btn"
                onClick={() => {
                  setPeopleState((prev) => prev.map((item) => (item.id === editPerson.id ? editPerson : item)));
                  setEditPerson(null);
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
      {contextMenu && (
        <div
          className="ops-context-overlay"
          onClick={() => setContextMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenu(null);
          }}
        >
          <div
            className="ops-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="ops-context-item"
              onClick={() => {
                setClipboardPerson(contextMenu.person);
                setContextMenu(null);
              }}
            >
              Копировать
            </button>
            <button
              type="button"
              className={`ops-context-item${clipboardPerson ? '' : ' disabled'}`}
              disabled={!clipboardPerson}
              onClick={() => {
                if (!clipboardPerson) return;
                handlePastePerson(contextMenu.person.department);
                setContextMenu(null);
              }}
            >
              Вставить
            </button>
            <button
              type="button"
              className="ops-context-item"
              onClick={() => {
                setEditPerson(contextMenu.person);
                setContextMenu(null);
              }}
            >
              Редактировать
            </button>
            <button
              type="button"
              className="ops-context-item danger"
              onClick={() => {
                handleDeletePerson(contextMenu.person.id);
                setContextMenu(null);
              }}
            >
              Удалить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
