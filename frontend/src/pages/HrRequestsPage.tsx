import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, MenuItem, TextField } from '@mui/material';
import {
  convertRequestToVacancy,
  createHiringRequest,
  decideOnSubmission,
  getHiringRequest,
  getHiringRequests,
  getHhCandidates,
  getHhVacancies,
  submitCandidatesToRequest,
  updateHiringRequest,
} from '../services/hh.api';
import type {
  HhCandidateDto,
  HhHiringRequestDto,
  HhHiringRequestStatus,
  HhSubmissionDto,
  HhVacancyDto,
} from '../types/hh';
import { useAuthStore } from '../store/auth-store';
import { canCreateHiringRequest, canRunHrRecruiting } from '../utils/rolePermissions';
import { extractApiError } from '../utils/apiError';
import { asArray } from '../utils/paged';
import { REJECTION_REASONS } from '../utils/hrLabels';
import '../styles/hr-cabinet.css';

const statusLabels: Record<HhHiringRequestStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  closed: 'Закрыта',
  cancelled: 'Отменена',
};

const decisionLabels = {
  pending: 'На рассмотрении',
  approved: 'Берём в работу',
  rejected: 'Не подходит',
} as const;

const emptyForm = {
  position: '',
  department: '',
  city: '',
  headcount: '1',
  reason: '',
  requirements: '',
  responsibilities: '',
  salaryFrom: '',
  salaryTo: '',
  neededBy: '',
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
};

/** Сколько дней кандидаты ждут решения (для SLA-подсветки). */
const waitingDays = (iso?: string | null): number | null => {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days < 0 ? 0 : days;
};

export default function HrRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [compareOpen, setCompareOpen] = useState(false);
  const role = useAuthStore((state) => state.user?.role);
  const isRecruiter = canRunHrRecruiting(role);
  const canCreate = canCreateHiringRequest(role);

  const [items, setItems] = useState<HhHiringRequestDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<HhHiringRequestStatus | ''>('');
  const [form, setForm] = useState(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<HhHiringRequestDto | null>(null);
  const [decisionComment, setDecisionComment] = useState<Record<string, string>>({});
  const [decisionReason, setDecisionReason] = useState<Record<string, string>>({});
  const [vacancies, setVacancies] = useState<HhVacancyDto[]>([]);
  const [linkVacancyId, setLinkVacancyId] = useState('');
  // Подбор кандидатов прямо из заявки: заявка — рабочий стол рекрутера.
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerCandidates, setPickerCandidates] = useState<HhCandidateDto[]>([]);
  const [pickerSelected, setPickerSelected] = useState<string[]>([]);
  const [pickerNote, setPickerNote] = useState('');

  const load = () => {
    setIsLoading(true);
    getHiringRequests(status ? { status } : undefined)
      .then((response) => setItems(asArray(response.data)))
      .catch((err) => setError(extractApiError(err, 'Не удалось загрузить заявки на подбор')))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Открытые вакансии — для привязки существующей вакансии к заявке.
  useEffect(() => {
    if (!isRecruiter) return;
    getHhVacancies({ status: 'open', perPage: 200 })
      .then((response) => {
        const data = response.data as unknown as { items?: HhVacancyDto[] } | HhVacancyDto[];
        setVacancies(Array.isArray(data) ? data : (data.items ?? []));
      })
      .catch(() => setVacancies([]));
  }, [isRecruiter]);

  // Кандидаты для подбора в открытой заявке (активные, поиск по имени/должности).
  const loadPickerCandidates = (query: string) => {
    if (!isRecruiter) return;
    getHhCandidates({ q: query || undefined, status: 'active', perPage: 20 })
      .then((response) => setPickerCandidates(response.data.items ?? []))
      .catch(() => setPickerCandidates([]));
  };

  useEffect(() => {
    if (selectedId && isRecruiter) {
      setPickerSelected([]);
      setPickerNote('');
      setPickerQuery('');
      loadPickerCandidates('');
    }
  }, [selectedId, isRecruiter]);

  // Deep link из письма-уведомления: /hr/requests?requestId=...
  useEffect(() => {
    const requestId = searchParams.get('requestId');
    if (!requestId) return;
    setSelectedId(requestId);
    const next = new URLSearchParams(searchParams);
    next.delete('requestId');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    getHiringRequest(selectedId)
      .then((response) => setSelected(response.data))
      .catch((err) => setError(extractApiError(err, 'Не удалось открыть заявку')));
  }, [selectedId]);

  const submitForm = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await createHiringRequest({
        position: form.position,
        department: form.department || null,
        city: form.city || null,
        headcount: form.headcount ? Number(form.headcount) : 1,
        reason: form.reason || null,
        requirements: form.requirements || null,
        responsibilities: form.responsibilities || null,
        salaryFrom: form.salaryFrom ? Number(form.salaryFrom) : null,
        salaryTo: form.salaryTo ? Number(form.salaryTo) : null,
        neededBy: form.neededBy || null,
      });
      setForm(emptyForm);
      setFormOpen(false);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось создать заявку'));
    }
  };

  const changeStatus = async (id: string, next: HhHiringRequestStatus) => {
    setError(null);
    try {
      await updateHiringRequest(id, { status: next });
      load();
      if (selectedId === id) {
        const response = await getHiringRequest(id);
        setSelected(response.data);
      }
    } catch (err) {
      setError(extractApiError(err, 'Не удалось изменить статус заявки'));
    }
  };

  const makeVacancy = async () => {
    if (!selectedId) return;
    setError(null);
    try {
      const response = await convertRequestToVacancy(selectedId);
      setSelected(response.data);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось создать вакансию по заявке'));
    }
  };

  const linkVacancy = async () => {
    if (!selectedId || !linkVacancyId) return;
    setError(null);
    try {
      const response = await updateHiringRequest(selectedId, { vacancyId: linkVacancyId });
      setSelected(response.data);
      setLinkVacancyId('');
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось привязать вакансию к заявке'));
    }
  };

  const togglePicked = (candidateId: string) => {
    setPickerSelected((prev) => prev.includes(candidateId)
      ? prev.filter((id) => id !== candidateId)
      : [...prev, candidateId]);
  };

  const sendPicked = async () => {
    if (!selectedId || pickerSelected.length === 0) return;
    setError(null);
    try {
      const response = await submitCandidatesToRequest(selectedId, {
        candidateIds: pickerSelected,
        recruiterNote: pickerNote || null,
      });
      setSelected(response.data.request);
      setPickerSelected([]);
      setPickerNote('');
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось отправить кандидатов'));
    }
  };

  const decide = async (submission: HhSubmissionDto, decision: 'approved' | 'rejected') => {
    setError(null);
    const comment = decisionComment[submission.id]?.trim() || '';
    const reasonCode = decisionReason[submission.id] || '';
    if (decision === 'rejected' && !reasonCode) {
      setError('Выберите причину отказа из списка — на кодах причин строится отчётность');
      return;
    }
    if (decision === 'rejected' && reasonCode === 'other' && !comment) {
      setError('Для причины «Другое» комментарий обязателен');
      return;
    }
    try {
      const response = await decideOnSubmission(submission.id, {
        decision,
        reasonCode: decision === 'rejected' ? reasonCode : null,
        comment: comment || null,
      });
      setSelected(response.data);
      setDecisionComment((prev) => ({ ...prev, [submission.id]: '' }));
      setDecisionReason((prev) => ({ ...prev, [submission.id]: '' }));
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось сохранить решение'));
    }
  };

  const pendingTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.submissionsPending, 0),
    [items],
  );

  return (
    <div className="hr-page">
      <section className="hr-page__header">
        <div>
          <h1 className="hr-page__title">Заявки на подбор</h1>
        </div>
        {canCreate && (
          <Button variant="contained" onClick={() => setFormOpen((prev) => !prev)}>
            {formOpen ? 'Скрыть форму' : 'Создать заявку'}
          </Button>
        )}
      </section>

      {error && <Alert severity="warning" onClose={() => setError(null)}>{error}</Alert>}
      {!isRecruiter && pendingTotal > 0 && (
        <Alert severity="info">Кандидатов ждут вашего решения: {pendingTotal}</Alert>
      )}

      {canCreate && formOpen && (
        <form className="hr-page__form" onSubmit={submitForm}>
          <TextField label="Кого ищем" size="small" required value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })} />
          <TextField label="Подразделение" size="small" value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })} />
          <TextField label="Город" size="small" value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <TextField label="Человек" size="small" type="number" inputProps={{ min: 1 }} value={form.headcount}
            onChange={(e) => setForm({ ...form, headcount: e.target.value })} />
          <TextField label="ЗП от" size="small" type="number" value={form.salaryFrom}
            onChange={(e) => setForm({ ...form, salaryFrom: e.target.value })} />
          <TextField label="ЗП до" size="small" type="number" value={form.salaryTo}
            onChange={(e) => setForm({ ...form, salaryTo: e.target.value })} />
          <TextField label="Нужен к дате" size="small" type="date" InputLabelProps={{ shrink: true }}
            value={form.neededBy} onChange={(e) => setForm({ ...form, neededBy: e.target.value })} />
          <TextField className="hr-page__form-wide" label="Причина (замена, расширение штата)" size="small"
            value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <TextField className="hr-page__form-wide" label="Требования" size="small" multiline minRows={2}
            value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} />
          <TextField className="hr-page__form-wide" label="Обязанности" size="small" multiline minRows={2}
            value={form.responsibilities} onChange={(e) => setForm({ ...form, responsibilities: e.target.value })} />
          <Button type="submit" variant="contained">Отправить заявку</Button>
        </form>
      )}

      <section className="hr-page__filters">
        <TextField select label="Статус" size="small" value={status}
          onChange={(e) => setStatus(e.target.value as HhHiringRequestStatus | '')}>
          <MenuItem value="">Все</MenuItem>
          {Object.entries(statusLabels).map(([value, label]) => (
            <MenuItem key={value} value={value}>{label}</MenuItem>
          ))}
        </TextField>
        <Button variant="outlined" onClick={load}>Применить</Button>
      </section>

      {!isRecruiter && (
        <section className="hr-request-cards">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="hr-request-card"
              onClick={() => setSelectedId(item.id)}
            >
              <div className="hr-request-card__top">
                <strong>{item.position}</strong>
                <span className="hr-page__status">{statusLabels[item.status]}</span>
              </div>
              <span className="hr-request-card__meta">
                {[item.department, item.city, `${item.headcount} чел.`, item.neededBy ? `к ${formatDate(item.neededBy)}` : null]
                  .filter(Boolean).join(' · ')}
              </span>
              {item.submissionsPending > 0 ? (() => {
                const wd = waitingDays(item.pendingSince);
                return (
                  <span className={`hr-request-card__pending${(wd ?? 0) >= 3 ? ' hr-request-card__pending--overdue' : ''}`}>
                    {item.submissionsPending} {item.submissionsPending === 1 ? 'кандидат ждёт' : 'кандидата ждут'} вашего решения
                    {wd != null && wd >= 1 ? ` · уже ${wd} дн.` : ''}
                  </span>
                );
              })() : item.submissionsTotal > 0 ? (
                <span className="hr-request-card__done">
                  Рассмотрено: {item.submissionsTotal}, одобрено: {item.submissionsApproved}
                </span>
              ) : (
                <span className="hr-request-card__empty">Рекрутер подбирает кандидатов</span>
              )}
            </button>
          ))}
          {isLoading && items.length === 0 && <span className="hr-page__empty">Загрузка...</span>}
          {!isLoading && items.length === 0 && (
            <span className="hr-page__empty">Заявок пока нет. Опишите, кого нужно найти, — кнопка «Создать заявку».</span>
          )}
        </section>
      )}
      {isRecruiter && (
      <section className="hr-page__table-shell">
        <table className="hr-page__table">
          <thead>
            <tr>
              <th>Должность</th>
              <th>Подразделение</th>
              <th>Город</th>
              <th>Чел.</th>
              <th>Нужен к</th>
              {isRecruiter && <th>Автор</th>}
              <th>Кандидаты</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={selectedId === item.id ? 'hr-page__table-row--selected' : undefined}
                onDoubleClick={() => setSelectedId(item.id)}
              >
                <td><strong>{item.position}</strong>{item.vacancyTitle ? <small>Вакансия: {item.vacancyTitle}</small> : null}</td>
                <td>{item.department || '—'}</td>
                <td>{item.city || '—'}</td>
                <td>{item.headcount}</td>
                <td>{formatDate(item.neededBy)}</td>
                {isRecruiter && <td>{item.createdByName || '—'}</td>}
                <td>
                  {item.submissionsTotal === 0 ? '—' : (
                    <span className={item.submissionsPending > 0 ? 'hr-page__days hr-page__days--soon' : 'hr-page__days'}>
                      {item.submissionsPending > 0
                        ? `${item.submissionsPending} на решении`
                        : `${item.submissionsApproved} из ${item.submissionsTotal}`}
                    </span>
                  )}
                </td>
                <td>
                  {/* Read-only плашка; смена статуса — в карточке заявки. */}
                  <span className={`hr-status hr-status--${item.status}`}>{statusLabels[item.status]}</span>
                </td>
                <td>
                  <Button size="small" variant={selectedId === item.id ? 'contained' : 'text'} onClick={() => setSelectedId(item.id)}>
                    Открыть
                  </Button>
                </td>
              </tr>
            ))}
            {isLoading && items.length === 0 && (
              <tr><td colSpan={isRecruiter ? 9 : 8} className="hr-page__empty">Загрузка...</td></tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={isRecruiter ? 9 : 8} className="hr-page__empty">
                {canCreate ? 'Заявок пока нет. Создайте первую.' : 'Заявок пока нет.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </section>
      )}

      {selected && <button className="hr-resume-drawer__outside" type="button" aria-label="Закрыть заявку" onClick={() => setSelectedId(null)} />}
      <aside className={`hr-resume-drawer${selected ? ' hr-resume-drawer--open' : ''}`} role="dialog" aria-modal="false">
        {selected && (
          <>
            <div className="hr-resume-drawer__header">
              <div>
                <strong>{selected.position}</strong>
                <span>{selected.department || 'Подразделение не указано'} · {statusLabels[selected.status]}</span>
              </div>
              <Button variant="text" onClick={() => setSelectedId(null)}>Закрыть</Button>
            </div>
            <div className="hr-resume-drawer__meta">
              <span>{selected.city || 'Город не указан'}</span>
              <span>{selected.headcount} чел.</span>
              <span>{selected.salaryFrom || selected.salaryTo
                ? `${selected.salaryFrom ?? '...'}–${selected.salaryTo ?? '...'} ₽`
                : 'ЗП не указана'}</span>
              <span>Нужен к {formatDate(selected.neededBy)}</span>
            </div>
            <div className="hr-resume-drawer__body">
              {isRecruiter && (
                <section className="hr-request-status">
                  <TextField select size="small" label="Статус заявки" value={selected.status}
                    onChange={(e) => changeStatus(selected.id, e.target.value as HhHiringRequestStatus)}
                    sx={{ minWidth: 200 }}>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <MenuItem key={value} value={value}>{label}</MenuItem>
                    ))}
                  </TextField>
                </section>
              )}
              {isRecruiter && (
                <section className="hr-request-vacancy">
                  {selected.vacancyId ? (
                    <p className="hr-submission__note">Вакансия по заявке: <strong>{selected.vacancyTitle || 'создана'}</strong></p>
                  ) : (
                    <div className="hr-request-vacancy__actions">
                      <Button size="small" variant="contained" onClick={makeVacancy}>
                        Создать вакансию по заявке
                      </Button>
                      {vacancies.length > 0 && (
                        <>
                          <span className="hr-submission__contacts">или привязать существующую:</span>
                          <TextField select size="small" label="Вакансия" value={linkVacancyId}
                            onChange={(e) => setLinkVacancyId(e.target.value)} sx={{ minWidth: 220 }}>
                            {vacancies.map((vacancy) => (
                              <MenuItem key={vacancy.id} value={vacancy.id}>{vacancy.title}</MenuItem>
                            ))}
                          </TextField>
                          <Button size="small" variant="outlined" disabled={!linkVacancyId} onClick={linkVacancy}>
                            Привязать
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </section>
              )}
              {selected.reason && <section><h2>Причина</h2><p>{selected.reason}</p></section>}
              {selected.requirements && <section><h2>Требования</h2><pre>{selected.requirements}</pre></section>}
              {selected.responsibilities && <section><h2>Обязанности</h2><pre>{selected.responsibilities}</pre></section>}
              {selected.recruiterComment && (
                <section><h2>Комментарий рекрутера</h2><p>{selected.recruiterComment}</p></section>
              )}

              {isRecruiter && selected.status !== 'closed' && selected.status !== 'cancelled' && (
                <section className="hr-picker">
                  <h2>Подобрать кандидатов</h2>
                  <div className="hr-picker__search">
                    <TextField size="small" label="Поиск по базе кандидатов" value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') loadPickerCandidates(pickerQuery); }} />
                    <Button size="small" variant="outlined" onClick={() => loadPickerCandidates(pickerQuery)}>Найти</Button>
                  </div>
                  <div className="hr-picker__list">
                    {pickerCandidates
                      .filter((candidate) => !(selected.submissions ?? []).some((sub) => sub.candidate?.candidateId === candidate.id))
                      .map((candidate) => (
                        <label key={candidate.id} className="hr-picker__item">
                          <input type="checkbox" checked={pickerSelected.includes(candidate.id)}
                            onChange={() => togglePicked(candidate.id)} />
                          <span className="hr-picker__name">{candidate.fullName}</span>
                          <span className="hr-picker__meta">{candidate.position || 'должность не указана'}{candidate.city ? ` · ${candidate.city}` : ''}</span>
                        </label>
                      ))}
                    {pickerCandidates.length === 0 && (
                      <span className="hr-page__empty">Никого не нашлось. Импортируйте резюме в разделе «Кандидаты».</span>
                    )}
                  </div>
                  <div className="hr-picker__actions">
                    <TextField size="small" label="Комментарий заказчику" value={pickerNote}
                      onChange={(e) => setPickerNote(e.target.value)} sx={{ flex: 1, minWidth: 200 }} />
                    <Button size="small" variant="contained" disabled={pickerSelected.length === 0} onClick={sendPicked}>
                      Отправить ({pickerSelected.length})
                    </Button>
                  </div>
                </section>
              )}
              <section>
                <div className="hr-submissions__head">
                  <h2>Кандидаты на рассмотрение ({selected.submissions?.length ?? 0})</h2>
                  {(selected.submissions ?? []).filter((sub) => sub.decision === 'pending').length >= 2 && (
                    <Button size="small" variant="outlined" onClick={() => setCompareOpen(true)}>
                      Сравнить кандидатов
                    </Button>
                  )}
                </div>
                {(!selected.submissions || selected.submissions.length === 0) && (
                  <p className="hr-page__empty">
                    Рекрутер пока не присылал кандидатов по этой заявке.
                  </p>
                )}
                {selected.submissions?.map((submission) => {
                  const candidate = submission.candidate;
                  return (
                    <article key={submission.id} className="hr-submission">
                      <header className="hr-submission__header">
                        <div>
                          <strong>
                            {candidate?.fullName || submission.candidateName || candidate?.label || 'Кандидат'}
                          </strong>
                          <span>{candidate?.position || 'Должность не указана'}</span>
                        </div>
                        <span className={`hr-page__status${submission.decision === 'approved' ? ' hr-submission__status--ok' : ''}`}>
                          {decisionLabels[submission.decision]}
                        </span>
                      </header>
                      <div className="hr-submission__meta">
                        {candidate?.photoUrl && (
                          <img className="hr-submission__photo" src={candidate.photoUrl} alt="" />
                        )}
                        <span>{candidate?.city || 'Город не указан'}</span>
                        {candidate?.age ? <span>{candidate.age} лет</span> : null}
                        <span>{candidate?.desiredSalary ? `${candidate.desiredSalary} ₽` : 'ЗП не указана'}</span>
                      </div>
                      {submission.recruiterNote && (
                        <p className="hr-submission__note">Рекрутер: {submission.recruiterNote}</p>
                      )}
                      {candidate?.experienceText && (
                        <details><summary>Опыт</summary><pre>{candidate.experienceText}</pre></details>
                      )}
                      {candidate?.skillsText && (
                        <details><summary>Навыки</summary><pre>{candidate.skillsText}</pre></details>
                      )}
                      {candidate?.educationText && (
                        <details><summary>Образование</summary><pre>{candidate.educationText}</pre></details>
                      )}
                      {submission.decision === 'pending' ? (
                        <div className="hr-submission__actions">
                          <TextField
                            select
                            size="small"
                            label="Причина (при отказе)"
                            value={decisionReason[submission.id] ?? ''}
                            onChange={(e) => setDecisionReason((prev) => ({ ...prev, [submission.id]: e.target.value }))}
                            sx={{ minWidth: 210 }}
                          >
                            {REJECTION_REASONS.map((reason) => (
                              <MenuItem key={reason.code} value={reason.code}>{reason.label}</MenuItem>
                            ))}
                          </TextField>
                          <TextField
                            size="small"
                            label="Комментарий"
                            value={decisionComment[submission.id] ?? ''}
                            onChange={(e) => setDecisionComment((prev) => ({ ...prev, [submission.id]: e.target.value }))}
                          />
                          <Button size="small" variant="contained" onClick={() => decide(submission, 'approved')}>
                            Берём в работу
                          </Button>
                          <Button size="small" variant="outlined" color="error" onClick={() => decide(submission, 'rejected')}>
                            Не подходит
                          </Button>
                        </div>
                      ) : (
                        <p className="hr-submission__note">
                          {decisionLabels[submission.decision]}
                          {submission.decisionReasonLabel ? ` (${submission.decisionReasonLabel})` : ''}
                          {submission.decisionComment ? `: ${submission.decisionComment}` : ''}
                          {submission.decidedByName ? ` — ${submission.decidedByName}` : ''}
                        </p>
                      )}
                      <p className="hr-submission__contacts">
                        Контакты кандидата ведёт рекрутер — связь и приглашение на интервью через него.
                      </p>
                    </article>
                  );
                })}
              </section>
            </div>
          </>
        )}
      </aside>
      {compareOpen && selected && (() => {
        const compareSubs = (selected.submissions ?? []).filter((sub) => sub.decision === 'pending').slice(0, 4);
        if (compareSubs.length < 2) return null;
        const rows: Array<{ label: string; render: (sub: HhSubmissionDto) => JSX.Element | string }> = [
          {
            label: 'Возраст',
            render: (sub) => (sub.candidate?.age ? `${sub.candidate.age} лет` : '—'),
          },
          { label: 'Город', render: (sub) => sub.candidate?.city || '—' },
          {
            label: 'Ожидания по ЗП',
            render: (sub) => (sub.candidate?.desiredSalary ? `${sub.candidate.desiredSalary} ₽` : '—'),
          },
          {
            label: 'Опыт',
            render: (sub) => <pre className="hr-compare__text">{sub.candidate?.experienceText || '—'}</pre>,
          },
          {
            label: 'Навыки',
            render: (sub) => <pre className="hr-compare__text">{sub.candidate?.skillsText || '—'}</pre>,
          },
          {
            label: 'Образование',
            render: (sub) => <pre className="hr-compare__text">{sub.candidate?.educationText || '—'}</pre>,
          },
          { label: 'Комментарий рекрутера', render: (sub) => sub.recruiterNote || '—' },
        ];
        return (
          <>
            <button className="hr-resume-drawer__outside" type="button" aria-label="Закрыть сравнение" onClick={() => setCompareOpen(false)} />
            <div className="hr-compare" role="dialog" aria-modal="true" aria-label="Сравнение кандидатов">
              <header className="hr-compare__head">
                <strong>Сравнение кандидатов — {selected.position}</strong>
                <Button size="small" onClick={() => setCompareOpen(false)}>Закрыть</Button>
              </header>
              <div className="hr-compare__scroll">
                <table className="hr-compare__table">
                  <thead>
                    <tr>
                      <th aria-label="Характеристика" />
                      {compareSubs.map((sub) => (
                        <th key={sub.id}>
                          <div className="hr-compare__person">
                            {sub.candidate?.photoUrl
                              ? <img src={sub.candidate.photoUrl} alt="" />
                              : <span className="hr-compare__no-photo" aria-hidden="true">{(sub.candidate?.fullName || sub.candidateName || '?').slice(0, 1)}</span>}
                            <strong>{sub.candidate?.fullName || sub.candidateName || sub.candidate?.label || 'Кандидат'}</strong>
                            <span>{sub.candidate?.position || 'Должность не указана'}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        {compareSubs.map((sub) => <td key={sub.id}>{row.render(sub)}</td>)}
                      </tr>
                    ))}
                    <tr className="hr-compare__decision">
                      <th scope="row">Решение</th>
                      {compareSubs.map((sub) => (
                        <td key={sub.id}>
                          <div className="hr-compare__actions">
                            <Button size="small" variant="contained" onClick={() => { void decide(sub, 'approved'); }}>
                              Подходит
                            </Button>
                            <TextField
                              select
                              size="small"
                              label="Причина отказа"
                              value={decisionReason[sub.id] ?? ''}
                              onChange={(e) => setDecisionReason((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                            >
                              {REJECTION_REASONS.map((reason) => (
                                <MenuItem key={reason.code} value={reason.code}>{reason.label}</MenuItem>
                              ))}
                            </TextField>
                            <Button size="small" variant="outlined" color="error" onClick={() => { void decide(sub, 'rejected'); }}>
                              Не подходит
                            </Button>
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="hr-submission__contacts">
                Контакты кандидатов не показываются: связь — через рекрутера. Для причины «Другое» добавьте комментарий в карточке кандидата ниже.
              </p>
            </div>
          </>
        );
      })()}
    </div>
  );
}
