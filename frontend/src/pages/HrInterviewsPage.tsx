import { useEffect, useMemo, useState } from 'react';
import { Alert, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { getHhInterviews } from '../services/hh.api';
import type { HhCandidateStage, HhInterviewDto } from '../types/hh';
import { extractApiError } from '../utils/apiError';
import { normalizePage } from '../utils/paged';
import '../styles/hr-cabinet.css';

const stageLabels: Record<HhCandidateStage, string> = {
  new: 'Новый отклик',
  screening: 'Скрининг',
  phone_interview: 'Телефонное интервью',
  submitted_to_manager: 'У руководителя',
  manager_interview: 'Интервью с заказчиком',
  offer: 'Оффер',
  hired: 'Принят',
  rejected: 'Отказ',
};

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Понедельник недели, содержащей переданную дату (локальное время пользователя). */
function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const shift = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - shift);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const dayKey = (value: Date) => `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;

const formatTime = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

export default function HrInterviewsPage() {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [items, setItems] = useState<HhInterviewDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  useEffect(() => {
    setIsLoading(true);
    getHhInterviews({ from: weekStart.toISOString(), to: weekEnd.toISOString(), perPage: 200 })
      .then((response) => setItems(normalizePage(response.data, 200).items))
      .catch((err) => setError(extractApiError(err, 'Не удалось загрузить интервью')))
      .finally(() => setIsLoading(false));
  }, [weekStart, weekEnd]);

  const byDay = useMemo(() => {
    const map = new Map<string, HhInterviewDto[]>();
    for (const item of items) {
      if (!item.dueAt) continue;
      const key = dayKey(new Date(item.dueAt));
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [items]);

  const todayKey = dayKey(new Date());
  const weekTitle = `${weekStart.toLocaleDateString('ru-RU')} — ${addDays(weekStart, 6).toLocaleDateString('ru-RU')}`;

  return (
    <div className="hr-page">
      <section className="hr-page__header">
        <div>
          <h1 className="hr-page__title">Интервью</h1>
        </div>
      </section>
      {error && <Alert severity="warning">{error}</Alert>}

      <section className="hr-week__toolbar">
        <Button size="small" variant="outlined" onClick={() => setWeekStart(addDays(weekStart, -7))}>Предыдущая</Button>
        <strong>{weekTitle}</strong>
        <Button size="small" variant="outlined" onClick={() => setWeekStart(startOfWeek(new Date()))}>Текущая неделя</Button>
        <Button size="small" variant="outlined" onClick={() => setWeekStart(addDays(weekStart, 7))}>Следующая</Button>
        <span className="hr-week__count">{isLoading ? 'Загрузка...' : `Интервью на неделе: ${items.length}`}</span>
      </section>

      <section className="hr-week">
        {days.map((day) => {
          const dayItems = byDay.get(dayKey(day)) ?? [];
          const isToday = dayKey(day) === todayKey;
          return (
            <div key={dayKey(day)} className={`hr-week__day${isToday ? ' hr-week__day--today' : ''}`}>
              <header>
                <span>{WEEKDAYS[(day.getDay() + 6) % 7]}</span>
                <strong>{day.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</strong>
              </header>
              <div className="hr-week__slots">
                {dayItems.length === 0 && <span className="hr-week__empty">—</span>}
                {dayItems.map((item) => (
                  <button
                    key={item.eventId}
                    type="button"
                    className="hr-week__slot"
                    title={item.comment || 'Открыть кандидата'}
                    onClick={() => navigate(`/hr/candidates?candidateId=${item.candidateId}`)}
                  >
                    <span className="hr-week__slot-time">{formatTime(item.dueAt)}</span>
                    <span className="hr-week__slot-name">{item.candidateName}</span>
                    <span className="hr-week__slot-meta">{item.vacancyTitle || 'Без вакансии'}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="hr-page__table-shell">
        <table className="hr-page__table">
          <thead>
            <tr>
              <th>Когда</th>
              <th>Кандидат</th>
              <th>Вакансия</th>
              <th>Этап</th>
              <th>Назначил</th>
              <th>Комментарий</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.eventId} onDoubleClick={() => navigate(`/hr/candidates?candidateId=${item.candidateId}`)}>
                <td>{formatDateTime(item.dueAt)}</td>
                <td><strong>{item.candidateName}</strong><small>{item.candidatePosition || 'Должность не указана'}</small></td>
                <td>{item.vacancyTitle || '—'}</td>
                <td><span className={`hr-stage hr-stage--${item.candidateStage}`}>{stageLabels[item.candidateStage]}</span></td>
                <td>{item.createdByName || '—'}</td>
                <td>{item.comment || '—'}</td>
                <td>
                  <Button size="small" variant="text" onClick={() => navigate(`/hr/candidates?candidateId=${item.candidateId}`)}>
                    Открыть
                  </Button>
                </td>
              </tr>
            ))}
            {isLoading && items.length === 0 && <tr><td colSpan={7} className="hr-page__empty">Загрузка...</td></tr>}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={7} className="hr-page__empty">На этой неделе интервью не запланировано. Интервью назначается в карточке кандидата.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
