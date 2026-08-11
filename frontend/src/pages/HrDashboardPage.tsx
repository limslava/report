import { useEffect, useState } from 'react';
import { Alert, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { getHhDashboard } from '../services/hh.api';
import type { HhCandidateStage, HhDashboardDto, HhVacancyStatus } from '../types/hh';
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

/** Колонки матрицы: смежные этапы схлопнуты, как в референсе. */
const MATRIX_COLUMNS: Array<{ key: string; label: string; stages: HhCandidateStage[] }> = [
  { key: 'new', label: 'Новые', stages: ['new'] },
  { key: 'screening', label: 'Скрининг', stages: ['screening', 'phone_interview'] },
  { key: 'manager', label: 'У заказчика', stages: ['submitted_to_manager', 'manager_interview'] },
  { key: 'offer', label: 'Оффер', stages: ['offer'] },
  { key: 'hired', label: 'Принят', stages: ['hired'] },
];

/** Сегменты пончика и легенда — в той же семантике статусов, что и плашки
    вакансий: открыта=зелёный, пауза=янтарный, закрыта=красный, черновик/архив=серый. */
const VACANCY_STATUS_META: Record<HhVacancyStatus, { label: string; color: string }> = {
  open: { label: 'Открытые', color: '#86c99b' },
  paused: { label: 'На паузе', color: '#f2d17a' },
  draft: { label: 'Черновики', color: '#c6cdd4' },
  closed: { label: 'Закрытые', color: '#ef9a9a' },
  archived: { label: 'Архив', color: '#dfe4e8' },
};

const nameInitials = (name?: string | null) => (name || '?')
  .trim().split(/\s+/).slice(0, 2)
  .map((word) => word[0]?.toUpperCase() ?? '')
  .join('') || '?';

type TaskRow = {
  key: string;
  kind: 'req' | 'wait' | 'int';
  time: string | null;
  title: string;
  sub: string | null;
  to: string;
};

export default function HrDashboardPage() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<HhDashboardDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    getHhDashboard()
      .then((response) => setDashboard(response.data))
      .catch((err) => setError(err?.response?.data?.message || err?.message || 'Не удалось загрузить кабинет HR'))
      .finally(() => setIsLoading(false));
  }, []);

  const tasks = dashboard?.tasks;
  const taskRows: TaskRow[] = [];
  if (tasks) {
    tasks.newRequests.items.forEach((request) => taskRows.push({
      key: `req-${request.id}`,
      kind: 'req',
      time: null,
      title: `Новая заявка — ${request.position}`,
      sub: request.createdByName,
      to: `/hr/requests?requestId=${request.id}`,
    }));
    tasks.pendingDecisions.items.forEach((row) => taskRows.push({
      key: `wait-${row.requestId}`,
      kind: 'wait',
      time: null,
      title: `${row.position} — ${row.pending} ждут решения заказчика`,
      sub: null,
      to: `/hr/requests?requestId=${row.requestId}`,
    }));
    tasks.interviewsToday.forEach((interview) => taskRows.push({
      key: `int-${interview.candidateId}-${interview.dueAt}`,
      kind: 'int',
      time: new Date(interview.dueAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      title: `Интервью — ${interview.candidateName}`,
      sub: interview.vacancyTitle,
      to: `/hr/candidates?candidateId=${interview.candidateId}`,
    }));
  }

  const pipeline = dashboard?.pipeline ?? [];
  const summary = dashboard?.vacancySummary ?? [];
  const summaryTotal = summary.reduce((sum, row) => sum + row.count, 0);
  let acc = 0;
  const donutStops = summary.map((row) => {
    const from = (acc / Math.max(1, summaryTotal)) * 360;
    acc += row.count;
    const to = (acc / Math.max(1, summaryTotal)) * 360;
    return `${VACANCY_STATUS_META[row.status].color} ${from}deg ${to}deg`;
  }).join(', ');

  const funnelStages = dashboard?.stages ?? [];
  const funnelMax = Math.max(1, ...funnelStages.map((item) => item.count));

  return (
    <div className="hr-page hr-page--ref">
      {error && <Alert severity="warning">{error}</Alert>}

      <div className="hr-dash">
        <div className="hr-dash__main">
          {/* «Hiring» — матрица подбора */}
          <section className="hr-page__card hr-hiring">
            <header className="hr-card-head">
              <div className="hr-card-head__title">
                <h2>Подбор</h2>
                {!isLoading && <span className="hr-caps">Открытых вакансий: {dashboard?.metrics.openVacancies ?? 0}</span>}
              </div>
              <Button variant="outlined" size="small" onClick={() => navigate('/hr/vacancies')}>Все вакансии →</Button>
            </header>
            {pipeline.length > 0 ? (
              <div className="hr-matrix__table-wrap">
                <table className="hr-matrix__table">
                  <thead>
                    <tr>
                      <th>Вакансии</th>
                      {MATRIX_COLUMNS.map((column) => <th key={column.key}>{column.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {pipeline.map((row) => (
                      <tr key={row.vacancyId}>
                        <td>
                          <button
                            type="button"
                            className="hr-matrix__vacancy"
                            onClick={() => navigate(`/hr/candidates?vacancyId=${row.vacancyId}`)}
                          >
                            <strong>{row.vacancyTitle}</strong>
                            <span className="hr-caps">в работе {row.total}</span>
                          </button>
                        </td>
                        {MATRIX_COLUMNS.map((column) => {
                          const count = column.stages.reduce((sum, stage) => sum + (row.stages[stage] ?? 0), 0);
                          if (count === 0) {
                            return <td key={column.key}><span className="hr-matrix__cell hr-matrix__cell--empty" /></td>;
                          }
                          const stageQuery = column.stages.length === 1 ? `&stage=${column.stages[0]}` : '';
                          return (
                            <td key={column.key}>
                              <button
                                type="button"
                                className={`hr-matrix__cell hr-matrix__cell--col-${column.key}`}
                                onClick={() => navigate(`/hr/candidates?vacancyId=${row.vacancyId}${stageQuery}`)}
                              >
                                {count} канд.
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="hr-page__empty">
                {isLoading ? 'Загрузка...' : 'Сетка появится, когда у кандидатов будет указана вакансия.'}
              </p>
            )}
          </section>

          {/* «My Task» — задачи */}
          <section className="hr-page__card hr-mytask">
            <header className="hr-card-head">
              <div className="hr-card-head__title">
                <h2>Задачи</h2>
                {!isLoading && (
                  <span className="hr-caps">
                    {taskRows.length > 0 ? `Сегодня: ${taskRows.length}` : 'Всё разобрано'}
                  </span>
                )}
              </div>
              <Button variant="outlined" size="small" onClick={() => navigate('/hr/requests')}>Заявки →</Button>
            </header>
            <div className="hr-taskrows">
              {taskRows.map((row) => (
                <button key={row.key} type="button" className={`hr-taskrow hr-taskrow--${row.kind}`} onClick={() => navigate(row.to)}>
                  <span className="hr-taskrow__bar" aria-hidden="true" />
                  {row.time && <span className="hr-taskrow__time">{row.time}</span>}
                  <span className="hr-taskrow__text">
                    {row.title}
                    {row.sub && <small>{row.sub}</small>}
                  </span>
                  <span className="hr-taskrow__go" aria-hidden="true">›</span>
                </button>
              ))}
              {!isLoading && taskRows.length === 0 && (
                <p className="hr-page__empty">Новых заявок, ожидающих решений и интервью на сегодня нет.</p>
              )}
            </div>
          </section>
        </div>

        <div className="hr-dash__side">
          {/* «Jobs Summary» — сводка по вакансиям */}
          <section className="hr-page__card hr-summary">
            <header className="hr-card-head">
              <div className="hr-card-head__title"><h2>Сводка</h2></div>
            </header>
            <div className="hr-donut__center">
              <div
                className={`hr-donut${summaryTotal === 0 ? ' hr-donut--empty' : ''}`}
                style={summaryTotal > 0 ? { background: `conic-gradient(${donutStops})` } : undefined}
              >
                <div className="hr-donut__hole">
                  <strong>{summaryTotal}</strong>
                  <span className="hr-caps">всего вакансий</span>
                </div>
              </div>
            </div>
            <div className="hr-legend">
              {summary.map((row) => (
                <span className="hr-legend__item" key={row.status}>
                  <i style={{ background: VACANCY_STATUS_META[row.status].color }} />
                  <strong>{row.count}</strong>
                  <em className="hr-caps">{VACANCY_STATUS_META[row.status].label}</em>
                </span>
              ))}
              {summary.length === 0 && !isLoading && <span className="hr-page__empty">Вакансий пока нет.</span>}
            </div>
          </section>

          {/* Кандидаты — как Employee в референсе */}
          <section className="hr-page__card hr-people">
            <header className="hr-card-head">
              <div className="hr-card-head__title"><h2>Кандидаты</h2></div>
              <Button variant="outlined" size="small" onClick={() => navigate('/hr/candidates')}>Все →</Button>
            </header>
            <div className="hr-people__list">
              {(dashboard?.recentCandidates ?? []).map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className="hr-people__row"
                  onClick={() => navigate(`/hr/candidates?candidateId=${candidate.id}`)}
                >
                  <i className="hr-avatar" aria-hidden="true">{nameInitials(candidate.fullName)}</i>
                  <span className="hr-people__name">
                    {candidate.fullName}
                    {candidate.vacancyTitle && <small>{candidate.vacancyTitle}</small>}
                  </span>
                  <span className={`hr-chip hr-stage--${candidate.currentStage}`}>
                    {stageLabels[candidate.currentStage]}
                  </span>
                </button>
              ))}
              {!isLoading && (dashboard?.recentCandidates ?? []).length === 0 && (
                <p className="hr-page__empty">Импортируйте первое резюме с FarPost или добавьте кандидата вручную.</p>
              )}
            </div>
          </section>

          {/* Воронка */}
          <section className="hr-page__card">
            <header className="hr-card-head">
              <div className="hr-card-head__title"><h2>Воронка</h2></div>
            </header>
            <div className="hr-funnel">
              {funnelStages.map((item) => (
                <div className="hr-funnel__row" key={item.stage}>
                  <span className="hr-funnel__label">{item.label}</span>
                  <span className="hr-funnel__bar">
                    <i
                      className={`hr-funnel__fill hr-stage-fill--${item.stage}`}
                      style={{ width: `${Math.max(6, Math.round((item.count / funnelMax) * 100))}%` }}
                    />
                  </span>
                  <strong>{item.count}</strong>
                </div>
              ))}
              {!isLoading && funnelStages.length === 0 && <p className="hr-page__empty">Пока нет кандидатов в работе.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
