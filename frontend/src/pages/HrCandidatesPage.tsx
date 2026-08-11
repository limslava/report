import { DragEvent, FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, MenuItem, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import {
  addHhCandidateEvent,
  createHhCandidate,
  getHhCandidate,
  getHhCandidates,
  getHhVacancies,
  importFarpostResume,
  updateHhCandidate,
  getHiringRequests,
  submitCandidatesToRequest,
  anonymizeHhCandidate,
} from '../services/hh.api';
import type {
  HhCandidateDto,
  HhCandidateEventDto,
  HhCandidateStage,
  HhCandidateStatus,
  HhFarpostImportResult,
  HhHiringRequestDto,
  HhVacancyDto,
} from '../types/hh';
import { useAuthStore } from '../store/auth-store';
import { canManageHrVacancies, canViewHrCandidatePii } from '../utils/rolePermissions';
import { extractApiError } from '../utils/apiError';
import { asArray, normalizePage } from '../utils/paged';
import { REJECTION_REASONS } from '../utils/hrLabels';
import '../styles/hr-cabinet.css';

const PER_PAGE = 50;

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

const statusLabels: Record<HhCandidateStatus, string> = {
  active: 'В работе',
  reserve: 'Кадровый резерв',
  hired: 'Принят',
  rejected: 'Отказ',
};

const emptyForm = {
  fullName: '',
  position: '',
  phone: '',
  email: '',
  city: '',
  desiredSalary: '',
  vacancyId: '',
  skillsText: '',
};

const emptyFarpostForm = {
  rawText: '',
  sourceUrl: '',
  vacancyId: '',
};

const farpostLocations = [
  { value: '', label: 'Все города', path: '/rabota/resume/' },
  { value: 'vladivostok', label: 'Владивосток', path: '/vladivostok/rabota/resume/' },
  { value: 'ussuriisk', label: 'Уссурийск', path: '/ussuriisk/rabota/resume/' },
  { value: 'nahodka', label: 'Находка', path: '/nahodka/rabota/resume/' },
  { value: 'khabarovsk', label: 'Хабаровск', path: '/khabarovsk/rabota/resume/' },
  { value: 'yuzhno-sakhalinsk', label: 'Южно-Сахалинск', path: '/yuzhno-sakhalinsk/rabota/resume/' },
  { value: 'custom', label: 'Свой город', path: '' },
];

const emptyFarpostSearch = {
  query: '',
  location: '',
  customLocation: '',
  salary: '',
};

const eventTypeLabels: Record<HhCandidateEventDto['type'], string> = {
  created: 'Создание',
  stage_changed: 'Этап',
  status_changed: 'Статус',
  comment: 'Комментарий',
  interview_scheduled: 'Интервью',
  email_sent: 'Письмо',
  imported: 'Импорт',
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const nameInitials = (name?: string | null) => (name || '?')
  .trim().split(/\s+/).slice(0, 2)
  .map((word) => word[0]?.toUpperCase() ?? '')
  .join('') || '?';

export default function HrCandidatesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthStore((state) => state.user?.role);
  // Роли отчётности (director, general_director, financer) допущены к воронке,
  // но не к ПДн: сервер обезличивает данные, клиент прячет соответствующий UI.
  const canSeePii = canViewHrCandidatePii(role);
  const canManage = canManageHrVacancies(role);
  const [items, setItems] = useState<HhCandidateDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [vacancies, setVacancies] = useState<HhVacancyDto[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [farpostForm, setFarpostForm] = useState(emptyFarpostForm);
  const [farpostSearch, setFarpostSearch] = useState(emptyFarpostSearch);
  const [farpostOpen, setFarpostOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  // Отказ всегда через диалог: причина из справочника обязательна.
  const [rejectDialog, setRejectDialog] = useState<{ candidateId: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectComment, setRejectComment] = useState('');
  const [farpostResult, setFarpostResult] = useState<HhFarpostImportResult | null>(null);
  const [farpostLoading, setFarpostLoading] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedCandidateDetails, setSelectedCandidateDetails] = useState<HhCandidateDto | null>(null);
  const [candidateDetailsLoading, setCandidateDetailsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [interviewForm, setInterviewForm] = useState({ dueAt: '', comment: '' });
  const [requests, setRequests] = useState<HhHiringRequestDto[]>([]);
  const [submitForm, setSubmitForm] = useState({ requestId: '', note: '' });
  const [submitInfo, setSubmitInfo] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<HhCandidateStage | ''>('');
  const [vacancyFilter, setVacancyFilter] = useState('');
  // Вид списка: таблица или канбан-доска. Выбор запоминаем на устройстве.
  const [view, setView] = useState<'table' | 'board'>(
    () => (localStorage.getItem('hr-candidates-view') === 'board' ? 'board' : 'table'),
  );
  const [dragOverStage, setDragOverStage] = useState<HhCandidateStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (nextPage = page, overrides?: { stage?: HhCandidateStage | ''; vacancyId?: string }) => {
    setIsLoading(true);
    Promise.all([
      getHhCandidates({
        q: q || undefined,
        stage: overrides?.stage ?? stage,
        vacancyId: (overrides?.vacancyId ?? vacancyFilter) || undefined,
        page: nextPage,
        perPage: PER_PAGE,
      }),
      getHhVacancies({ status: 'open', perPage: 200 }),
    ])
      .then(([candidatesResponse, vacanciesResponse]) => {
        const candidatesPage = normalizePage(candidatesResponse.data, PER_PAGE);
        setItems(candidatesPage.items);
        setTotal(candidatesPage.total);
        setPage(candidatesPage.page);
        setVacancies(normalizePage(vacanciesResponse.data, 200).items);
      })
      .catch((err) => setError(extractApiError(err, 'Не удалось загрузить кандидатов')))
      .finally(() => setIsLoading(false));
  };

  // Открытые заявки нужны, чтобы отправить кандидата автору заявки.
  useEffect(() => {
    if (!canManage) return;
    getHiringRequests()
      .then((response) => setRequests(
        asArray(response.data).filter((item) => item.status === 'new' || item.status === 'in_progress'),
      ))
      .catch(() => setRequests([]));
  }, [canManage]);

  useEffect(() => {
    load(0);
  }, []);

  // Deep link на фильтры с дашборда: /hr/candidates?vacancyId=...&stage=...
  useEffect(() => {
    const vacancyId = searchParams.get('vacancyId');
    const stageParam = searchParams.get('stage');
    if (!vacancyId && !stageParam) return;
    const nextStage: HhCandidateStage | '' = stageParam && stageParam in stageLabels
      ? stageParam as HhCandidateStage
      : '';
    setVacancyFilter(vacancyId ?? '');
    if (stageParam) setStage(nextStage);
    const next = new URLSearchParams(searchParams);
    next.delete('vacancyId');
    next.delete('stage');
    setSearchParams(next, { replace: true });
    load(0, { vacancyId: vacancyId ?? '', stage: stageParam ? nextStage : undefined });
  }, [searchParams, setSearchParams]);

  // Deep link на карточку кандидата: /hr/candidates?candidateId=...
  useEffect(() => {
    const candidateId = searchParams.get('candidateId');
    if (!candidateId) return;
    setSelectedCandidateId(candidateId);
    const next = new URLSearchParams(searchParams);
    next.delete('candidateId');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedCandidateId) {
      setSelectedCandidateDetails(null);
      return;
    }
    setCandidateDetailsLoading(true);
    getHhCandidate(selectedCandidateId)
      .then((response) => setSelectedCandidateDetails(response.data))
      .catch((err) => setError(extractApiError(err, 'Не удалось загрузить карточку кандидата')))
      .finally(() => setCandidateDetailsLoading(false));
  }, [selectedCandidateId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await createHhCandidate({
        fullName: form.fullName,
        position: form.position || null,
        phone: form.phone || null,
        email: form.email || null,
        city: form.city || null,
        desiredSalary: form.desiredSalary ? Number(form.desiredSalary) : null,
        vacancyId: form.vacancyId || null,
        skillsText: form.skillsText || null,
        currentStage: 'new',
        status: 'active',
        source: 'manual',
      });
      setForm(emptyForm);
      setCreateOpen(false);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось создать кандидата'));
    }
  };

  const importFarpost = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFarpostResult(null);
    setFarpostLoading(true);
    try {
      const response = await importFarpostResume({
        rawText: farpostForm.rawText,
        sourceUrl: farpostForm.sourceUrl || null,
        vacancyId: farpostForm.vacancyId || null,
      });
      setFarpostResult(response.data);
      setFarpostForm(emptyFarpostForm);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось импортировать резюме FarPost'));
    } finally {
      setFarpostLoading(false);
    }
  };

  const buildFarpostSearchUrl = () => {
    const selectedLocation = farpostLocations.find((location) => location.value === farpostSearch.location) ?? farpostLocations[0];
    const customPath = farpostSearch.customLocation
      ? `/${farpostSearch.customLocation.trim().replace(/^\/+|\/+$/g, '')}/rabota/resume/`
      : selectedLocation.path;
    const path = selectedLocation.value === 'custom' ? customPath : selectedLocation.path;
    const url = new URL(path || '/rabota/resume/', 'https://www.farpost.ru');
    if (farpostSearch.query.trim()) url.searchParams.set('query', farpostSearch.query.trim());
    return url.toString();
  };

  const openFarpostSearch = () => {
    window.open(buildFarpostSearchUrl(), '_blank', 'noopener,noreferrer');
  };

  const getCandidateVacancyOptions = (candidate: HhCandidateDto) => {
    if (!candidate.vacancyId || vacancies.some((vacancy) => vacancy.id === candidate.vacancyId)) return vacancies;
    return [
      ...vacancies,
      {
        id: candidate.vacancyId,
        title: candidate.vacancyTitle || 'Текущая вакансия',
      } as HhVacancyDto,
    ];
  };

  const changeCandidate = async (
    id: string,
    patch: { currentStage?: HhCandidateStage; status?: HhCandidateStatus; vacancyId?: string | null },
  ) => {
    setError(null);
    try {
      const response = await updateHhCandidate(id, patch);
      if (selectedCandidateId === id) {
        setSelectedCandidateDetails(response.data);
      }
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось обновить кандидата'));
    }
  };

  const addComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCandidateId || !commentText.trim()) return;
    setError(null);
    try {
      await addHhCandidateEvent(selectedCandidateId, {
        type: 'comment',
        title: 'Комментарий HR',
        comment: commentText.trim(),
      });
      setCommentText('');
      const response = await getHhCandidate(selectedCandidateId);
      setSelectedCandidateDetails(response.data);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось сохранить комментарий'));
    }
  };

  const scheduleInterview = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCandidateId || !interviewForm.dueAt) return;
    setError(null);
    try {
      await addHhCandidateEvent(selectedCandidateId, {
        type: 'interview_scheduled',
        title: 'Запланировано интервью',
        comment: interviewForm.comment || null,
        dueAt: new Date(interviewForm.dueAt).toISOString(),
      });
      setInterviewForm({ dueAt: '', comment: '' });
      const response = await getHhCandidate(selectedCandidateId);
      setSelectedCandidateDetails(response.data);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось запланировать интервью'));
    }
  };

  const switchView = (next: 'table' | 'board' | null) => {
    if (!next) return;
    setView(next);
    localStorage.setItem('hr-candidates-view', next);
  };

  /** Drop карточки на колонку доски: смена этапа; «Отказ» — только через диалог с причиной. */
  const onBoardDrop = (event: DragEvent<HTMLDivElement>, targetStage: HhCandidateStage) => {
    event.preventDefault();
    setDragOverStage(null);
    if (!canManage) return;
    const candidateId = event.dataTransfer.getData('text/plain');
    if (!candidateId) return;
    const candidate = items.find((item) => item.id === candidateId);
    if (!candidate || candidate.currentStage === targetStage) return;
    if (targetStage === 'rejected') {
      openRejectDialog(candidateId);
      return;
    }
    void changeCandidate(candidateId, { currentStage: targetStage });
  };

  const openRejectDialog = (candidateId: string) => {
    setRejectReason('');
    setRejectComment('');
    setRejectDialog({ candidateId });
  };

  const confirmReject = async () => {
    if (!rejectDialog || !rejectReason) return;
    setError(null);
    try {
      const response = await updateHhCandidate(rejectDialog.candidateId, {
        status: 'rejected',
        rejectionReasonCode: rejectReason,
        rejectionComment: rejectComment || null,
      });
      if (selectedCandidateId === rejectDialog.candidateId) {
        setSelectedCandidateDetails(response.data);
      }
      setRejectDialog(null);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось оформить отказ'));
    }
  };

  const saveReserveConsent = async (candidateId: string, value: string) => {
    setError(null);
    try {
      const response = await updateHhCandidate(candidateId, { reserveConsentUntil: value || null });
      setSelectedCandidateDetails(response.data);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось сохранить дату согласия'));
    }
  };

  const anonymizeNow = async (candidateId: string) => {
    if (!window.confirm('Обезличить кандидата? ФИО, контакты и тексты резюме будут удалены безвозвратно; этапы и статистика останутся.')) return;
    setError(null);
    try {
      const response = await anonymizeHhCandidate(candidateId);
      setSelectedCandidateDetails(response.data);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось обезличить кандидата'));
    }
  };

  const sendToRequestAuthor = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCandidateId || !submitForm.requestId) return;
    setError(null);
    setSubmitInfo(null);
    try {
      const response = await submitCandidatesToRequest(submitForm.requestId, {
        candidateIds: [selectedCandidateId],
        recruiterNote: submitForm.note || null,
      });
      setSubmitInfo(response.data.submitted > 0
        ? 'Кандидат отправлен автору заявки на рассмотрение'
        : 'Этот кандидат уже был отправлен по выбранной заявке');
      setSubmitForm({ requestId: '', note: '' });
      const refreshed = await getHhCandidate(selectedCandidateId);
      setSelectedCandidateDetails(refreshed.data);
    } catch (err) {
      setError(extractApiError(err, 'Не удалось отправить кандидата автору заявки'));
    }
  };

  const selectedCandidate = selectedCandidateDetails ?? items.find((item) => item.id === selectedCandidateId) ?? null;

  return (
    <div className="hr-page">
      <section className="hr-page__header">
        <div>
          <h1 className="hr-page__title">Кандидаты</h1>
        </div>
        {canManage && (
          <Button variant="contained" onClick={() => setCreateOpen((value) => !value)}>
            {createOpen ? 'Скрыть форму' : 'Добавить кандидата'}
          </Button>
        )}
      </section>
      {error && <Alert severity="warning">{error}</Alert>}
      {canManage && (
      <section className="hr-import">
        <div className="hr-import__summary">
          <div>
            <strong>FarPost</strong>
            <span>Быстрый поиск кандидатов на FarPost с сохранением найденного резюме в Report.</span>
          </div>
          <Button variant={farpostOpen ? 'contained' : 'outlined'} onClick={() => setFarpostOpen((value) => !value)}>
            {farpostOpen ? 'Свернуть' : 'Найти'}
          </Button>
        </div>
        {farpostOpen && (
          <div className="hr-import__workspace">
            <div className="hr-import__panel hr-import__panel--primary">
              <div className="hr-import__step">1</div>
              <div className="hr-import__panel-title">Найти кандидата на FarPost</div>
              <div className="hr-import__hint">Заполните параметры и откройте FarPost. Поиск откроется в новой вкладке.</div>
              <div className="hr-import__search-grid">
                <TextField
                  label="Кого ищем"
                  size="small"
                  value={farpostSearch.query}
                  onChange={(e) => setFarpostSearch({ ...farpostSearch, query: e.target.value })}
                  placeholder="водитель, кладовщик..."
                />
                <TextField
                  select
                  label="География"
                  size="small"
                  value={farpostSearch.location}
                  onChange={(e) => setFarpostSearch({ ...farpostSearch, location: e.target.value })}
                >
                  {farpostLocations.map((location) => <MenuItem key={location.label} value={location.value}>{location.label}</MenuItem>)}
                </TextField>
                <TextField
                  label="Ориентир ЗП"
                  size="small"
                  type="number"
                  value={farpostSearch.salary}
                  onChange={(e) => setFarpostSearch({ ...farpostSearch, salary: e.target.value })}
                  placeholder="для заметки"
                />
              </div>
              {farpostSearch.location === 'custom' && (
                <TextField
                  label="Адрес города в FarPost"
                  size="small"
                  value={farpostSearch.customLocation}
                  onChange={(e) => setFarpostSearch({ ...farpostSearch, customLocation: e.target.value })}
                  placeholder="например: khabarovsk"
                />
              )}
              <div className="hr-import__url">{buildFarpostSearchUrl()}</div>
              <Button variant="contained" onClick={openFarpostSearch}>Открыть FarPost</Button>
            </div>
            <div className="hr-import__panel hr-import__panel--primary">
              <div className="hr-import__step">2</div>
              <div className="hr-import__panel-title">Установить расширение Chrome</div>
              <div className="hr-import__hint">
                Один раз загрузите расширение Report FarPost Import и войдите в Report через его иконку.
              </div>
              <div className="hr-import__install-box">
                <code>browser-extensions/farpost-report-import</code>
                <span>Chrome → Extensions → Developer mode → Load unpacked → выбрать эту папку.</span>
              </div>
            </div>
            <div className="hr-import__panel hr-import__panel--primary">
              <div className="hr-import__step">3</div>
              <div className="hr-import__panel-title">Сохранить найденного</div>
              <div className="hr-import__hint">
                На FarPost откройте конкретное резюме. Расширение покажет кнопку "Сохранить в Report" внизу справа. Нажмите её и обновите список.
              </div>
              <Button variant="outlined" onClick={() => load(0)}>Обновить список</Button>
            </div>
            <div className="hr-import__note">
              Не храним логин и пароль FarPost: рекрутер работает в своем браузере, а Report забирает только выбранное резюме.
            </div>
            <details className="hr-import__manual">
              <summary>Ручной импорт, если кнопка браузера не сработала</summary>
              <form className="hr-import__manual-form" onSubmit={importFarpost}>
                <div className="hr-import__search-grid">
                  <TextField
                    select
                    label="Вакансия"
                    size="small"
                    value={farpostForm.vacancyId}
                    onChange={(e) => setFarpostForm({ ...farpostForm, vacancyId: e.target.value })}
                  >
                    <MenuItem value="">Без вакансии</MenuItem>
                    {vacancies.map((vacancy) => <MenuItem key={vacancy.id} value={vacancy.id}>{vacancy.title}</MenuItem>)}
                  </TextField>
                  <TextField
                    label="Ссылка на резюме"
                    size="small"
                    value={farpostForm.sourceUrl}
                    onChange={(e) => setFarpostForm({ ...farpostForm, sourceUrl: e.target.value })}
                    placeholder="https://www.farpost.ru/..."
                  />
                </div>
                <TextField
                  className="hr-import__text"
                  label="Данные страницы резюме"
                  size="small"
                  multiline
                  minRows={4}
                  value={farpostForm.rawText}
                  onChange={(e) => setFarpostForm({ ...farpostForm, rawText: e.target.value })}
                  placeholder="Скопируйте текст страницы резюме"
                  required
                />
                <div className="hr-import__footer">
                  <span>Report распознает поля, проверит дубли и сохранит источник в истории.</span>
                  <Button type="submit" variant="contained" disabled={farpostLoading}>
                    {farpostLoading ? 'Сохраняю...' : 'Импортировать'}
                  </Button>
                </div>
              </form>
            </details>
          </div>
        )}
        {farpostResult && (
          <div className="hr-import__result">
            <strong>{farpostResult.candidate.fullName}</strong>
            <span>
              {farpostResult.parsed.position || 'Должность не распознана'}
              {farpostResult.parsed.city ? `, ${farpostResult.parsed.city}` : ''}
            </span>
            {farpostResult.duplicates.length > 0 && (
              <small>Возможные дубли: {farpostResult.duplicates.map((candidate) => candidate.fullName).join(', ')}</small>
            )}
          </div>
        )}
      </section>
      )}
      {canManage && createOpen && (
      <form className="hr-page__form" onSubmit={submit}>
        <TextField label="ФИО" size="small" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        <TextField label="Должность" size="small" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
        <TextField label="Телефон" size="small" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <TextField label="Email" size="small" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <TextField label="Город" size="small" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <TextField label="Желаемая ЗП" size="small" type="number" value={form.desiredSalary} onChange={(e) => setForm({ ...form, desiredSalary: e.target.value })} />
        <TextField select label="Вакансия" size="small" value={form.vacancyId} onChange={(e) => setForm({ ...form, vacancyId: e.target.value })}>
          <MenuItem value="">Без вакансии</MenuItem>
          {vacancies.map((vacancy) => <MenuItem key={vacancy.id} value={vacancy.id}>{vacancy.title}</MenuItem>)}
        </TextField>
        <TextField className="hr-page__form-wide" label="Навыки" size="small" value={form.skillsText} onChange={(e) => setForm({ ...form, skillsText: e.target.value })} />
        <Button type="submit" variant="contained">Добавить</Button>
      </form>
      )}
      <section className="hr-page__filters">
        <TextField label="Поиск" size="small" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(0); }} />
        <TextField select label="Этап" size="small" value={stage} onChange={(e) => setStage(e.target.value as HhCandidateStage | '')}>
          <MenuItem value="">Все</MenuItem>
          {Object.entries(stageLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <TextField select label="Вакансия" size="small" value={vacancyFilter} sx={{ minWidth: 200 }}
          onChange={(e) => setVacancyFilter(e.target.value)}>
          <MenuItem value="">Все</MenuItem>
          {vacancies.map((vacancy) => <MenuItem key={vacancy.id} value={vacancy.id}>{vacancy.title}</MenuItem>)}
        </TextField>
        <Button variant="outlined" onClick={() => load(0)}>Применить</Button>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={view}
          onChange={(_, next) => switchView(next)}
          aria-label="Вид списка"
          sx={{ ml: 'auto' }}
        >
          <ToggleButton value="table">Таблица</ToggleButton>
          <ToggleButton value="board">Доска</ToggleButton>
        </ToggleButtonGroup>
      </section>
      {view === 'board' && (
        <section className="hr-board" aria-label="Канбан-доска кандидатов">
          {(Object.entries(stageLabels) as Array<[HhCandidateStage, string]>).map(([stageKey, label]) => {
            const columnItems = items.filter((candidate) => candidate.currentStage === stageKey);
            return (
              <div
                key={stageKey}
                className={`hr-board__col${dragOverStage === stageKey ? ' hr-board__col--over' : ''}${stageKey === 'rejected' ? ' hr-board__col--rejected' : ''}`}
                onDragOver={(e) => { if (canManage) { e.preventDefault(); setDragOverStage(stageKey); } }}
                onDragLeave={() => setDragOverStage((prev) => (prev === stageKey ? null : prev))}
                onDrop={(e) => onBoardDrop(e, stageKey)}
              >
                <header className="hr-board__head">
                  <span><i className={`hr-dot hr-stage--${stageKey}`} aria-hidden="true" /> {label}</span>
                  <strong>{columnItems.length}</strong>
                </header>
                <div className="hr-board__cards">
                  {columnItems.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="hr-board__card"
                      draggable={canManage && !candidate.isAnonymized}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', candidate.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => setSelectedCandidateId(candidate.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') setSelectedCandidateId(candidate.id); }}
                      title={canManage ? 'Перетащите на другой этап или откройте карточку' : 'Открыть карточку'}
                    >
                      <div className="hr-board__cardhead">
                        <span className="hr-avatar" aria-hidden="true">{nameInitials(candidate.fullName)}</span>
                        <strong>{candidate.fullName}</strong>
                      </div>
                      <span>{candidate.position || candidate.vacancyTitle || 'Должность не указана'}</span>
                      <small>
                        {[candidate.city, candidate.desiredSalary ? `${candidate.desiredSalary} \u20BD` : null]
                          .filter(Boolean).join(' \u00b7 ') || '\u2014'}
                      </small>
                    </div>
                  ))}
                  {columnItems.length === 0 && (
                    <div className="hr-board__placeholder">{canManage ? 'Перетащите сюда' : 'Пусто'}</div>
                  )}
                </div>
              </div>
            );
          })}
          {isLoading && items.length === 0 && <span className="hr-page__empty">Загрузка...</span>}
        </section>
      )}
      {view === 'table' && (
      <section className="hr-page__table-shell">
        <table className="hr-page__table">
          <thead>
            <tr>
              <th>Кандидат</th>
              <th>Источник</th>
              {canSeePii && <th>Контакты</th>}
              <th>Вакансия</th>
              <th>Город</th>
              <th>ЗП</th>
              <th>Этап</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={selectedCandidateId === item.id ? 'hr-page__table-row--selected' : undefined}
                onDoubleClick={() => setSelectedCandidateId(item.id)}
              >
                <td><strong>{item.fullName}</strong><small>{item.position || 'Должность не указана'}</small></td>
                <td>{item.source === 'farpost' ? 'FarPost' : item.source === 'hh' ? 'hh.ru' : 'Вручную'}</td>
                {canSeePii && <td><span>{item.phone || '—'}</span><small>{item.email || ''}</small></td>}
                <td>{item.vacancyTitle || '—'}</td>
                <td>{item.city || '—'}</td>
                <td>{item.desiredSalary ? `${item.desiredSalary} \u20BD` : '—'}</td>
                <td><span className={`hr-stage hr-stage--${item.currentStage}`}>{stageLabels[item.currentStage]}</span></td>
                <td>{item.status === 'active' ? '—' : <span className={`hr-status hr-status--${item.status}`}>{statusLabels[item.status]}</span>}</td>
                <td>
                  <Button
                    size="small"
                    variant={selectedCandidateId === item.id ? 'contained' : 'text'}
                    onClick={() => setSelectedCandidateId(item.id)}
                  >
                    Открыть
                  </Button>
                </td>
              </tr>
            ))}
            {isLoading && items.length === 0 && (
              <tr><td colSpan={canSeePii ? 9 : 8} className="hr-page__empty">Загрузка...</td></tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={canSeePii ? 9 : 8} className="hr-page__empty">Кандидатов пока нет.</td></tr>
            )}
          </tbody>
        </table>
      </section>
      )}
      <section className="hr-page__paging">
        <span>Всего: {total}</span>
        <Button size="small" variant="outlined" disabled={page <= 0 || isLoading} onClick={() => load(page - 1)}>Назад</Button>
        <span>{page + 1} / {Math.max(1, Math.ceil(total / PER_PAGE))}</span>
        <Button
          size="small"
          variant="outlined"
          disabled={page + 1 >= Math.max(1, Math.ceil(total / PER_PAGE)) || isLoading}
          onClick={() => load(page + 1)}
        >
          Вперёд
        </Button>
      </section>
      {selectedCandidate && <button className="hr-resume-drawer__outside" type="button" aria-label="Закрыть резюме" onClick={() => setSelectedCandidateId(null)} />}
      <aside className={`hr-resume-drawer${selectedCandidate ? ' hr-resume-drawer--open' : ''}`} role="dialog" aria-modal="false">
        {selectedCandidate && (
          <>
            <div className="hr-resume-drawer__header">
              <div>
                <strong>{selectedCandidate.fullName}</strong>
                <span>{selectedCandidate.position || 'Должность не указана'}</span>
              </div>
              <Button variant="text" onClick={() => setSelectedCandidateId(null)}>Закрыть</Button>
            </div>
            {selectedCandidate.status === 'rejected' && selectedCandidate.rejectionReasonLabel && (
              <div className="hr-reject-chip" title="Причина отказа из справочника">
                Отказ: {selectedCandidate.rejectionReasonLabel}
              </div>
            )}
            <div className="hr-resume-drawer__meta">
              <span>{selectedCandidate.source === 'farpost' ? 'FarPost' : selectedCandidate.source === 'hh' ? 'hh.ru' : 'Вручную'}</span>
              <span>{selectedCandidate.city || 'Город не указан'}</span>
              <span>{selectedCandidate.desiredSalary ? `${selectedCandidate.desiredSalary} \u20BD` : 'ЗП не указана'}</span>
              {canSeePii
                ? <span>{selectedCandidate.phone || selectedCandidate.email ? [selectedCandidate.phone, selectedCandidate.email].filter(Boolean).join(' · ') : 'Контакты не открыты'}</span>
                : <span>Персональные данные скрыты для вашей роли</span>}
            </div>
            {canManage && !selectedCandidate.isAnonymized && (
              <div className="hr-stage-strip" aria-label="Этапы воронки">
                {(Object.entries(stageLabels) as Array<[HhCandidateStage, string]>).map(([value, label]) => {
                  const isCurrent = selectedCandidate.currentStage === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`hr-stage-strip__step${isCurrent ? ' hr-stage-strip__step--current' : ''}`}
                      disabled={isCurrent}
                      onClick={() => (value === 'rejected'
                        ? openRejectDialog(selectedCandidate.id)
                        : changeCandidate(selectedCandidate.id, { currentStage: value }))}
                      title={isCurrent ? 'Текущий этап' : `Перевести на этап «${label}»`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            {canManage && !selectedCandidate.isAnonymized && (
              <div className="hr-candidate-controls">
                <TextField select size="small" label="Статус" value={selectedCandidate.status}
                  onChange={(e) => (e.target.value === 'rejected'
                    ? openRejectDialog(selectedCandidate.id)
                    : changeCandidate(selectedCandidate.id, { status: e.target.value as HhCandidateStatus }))}
                  sx={{ minWidth: 170 }}>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <MenuItem key={value} value={value}>{label}</MenuItem>
                  ))}
                </TextField>
                <TextField select size="small" label="Вакансия" value={selectedCandidate.vacancyId || ''}
                  onChange={(e) => changeCandidate(selectedCandidate.id, { vacancyId: e.target.value || null })}
                  sx={{ minWidth: 220 }}>
                  <MenuItem value="">Без вакансии</MenuItem>
                  {getCandidateVacancyOptions(selectedCandidate).map((vacancy) => (
                    <MenuItem key={vacancy.id} value={vacancy.id}>{vacancy.title}</MenuItem>
                  ))}
                </TextField>
              </div>
            )}
            {selectedCandidate.isAnonymized && (
              <Alert severity="info">Кандидат обезличен: срок хранения персональных данных истёк либо выполнен запрос субъекта. Запись доступна только для чтения.</Alert>
            )}
            {!selectedCandidate.isAnonymized && selectedCandidate.retentionUntil && (
              <Alert severity={selectedCandidate.status === 'reserve' && selectedCandidate.reserveConsentUntil ? 'info' : 'warning'}>
                Персональные данные будут обезличены {new Date(selectedCandidate.retentionUntil).toLocaleDateString('ru-RU')}
                {selectedCandidate.status === 'reserve' && !selectedCandidate.reserveConsentUntil
                  ? ' — согласие на кадровый резерв не записано, действует срок 30 дней. Укажите дату согласия ниже.'
                  : selectedCandidate.status === 'rejected'
                    ? ' (30 дней после отказа, ст. 21 152-ФЗ).'
                    : '.'}
              </Alert>
            )}
            {canManage && !selectedCandidate.isAnonymized && selectedCandidate.status === 'reserve' && (
              <div className="hr-retention-consent">
                <TextField
                  size="small"
                  type="date"
                  label="Согласие на резерв до"
                  InputLabelProps={{ shrink: true }}
                  defaultValue={selectedCandidate.reserveConsentUntil?.slice(0, 10) ?? ''}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (value !== (selectedCandidate.reserveConsentUntil?.slice(0, 10) ?? '')) {
                      saveReserveConsent(selectedCandidate.id, value);
                    }
                  }}
                />
                <span className="hr-submission__contacts">Хранение в резерве законно только при согласии кандидата с указанным сроком.</span>
              </div>
            )}
            <div className="hr-resume-drawer__body">
              {candidateDetailsLoading && <div className="hr-page__empty">Загрузка карточки...</div>}
              <section>
                <h2>Опыт</h2>
                <pre>{selectedCandidate.experienceText || 'Нет данных'}</pre>
              </section>
              <section>
                <h2>Образование</h2>
                <pre>{selectedCandidate.educationText || 'Нет данных'}</pre>
              </section>
              <section>
                <h2>Навыки</h2>
                {selectedCandidate.skillsText ? (
                  <div className="hr-skill-chips">
                    {selectedCandidate.skillsText.split(/[,;\u2022\n]+/)
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .slice(0, 40)
                      .map((skill, index) => (
                        <span key={`${skill}-${index}`} className="hr-skill-chip">{skill}</span>
                      ))}
                  </div>
                ) : <pre>Нет данных</pre>}
              </section>
              <section>
                <h2>Комментарий</h2>
                <form className="hr-candidate-action" onSubmit={addComment}>
                  <TextField
                    size="small"
                    multiline
                    minRows={3}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Комментарий по кандидату, результат звонка, причина отказа..."
                  />
                  <Button type="submit" variant="contained" disabled={!commentText.trim()}>Добавить</Button>
                </form>
              </section>
              {canManage && (
                <section>
                  <h2>Отправить заказчику</h2>
                  {requests.length === 0 ? (
                    <p className="hr-page__empty">Открытых заявок на подбор нет.</p>
                  ) : (
                    <form className="hr-candidate-action" onSubmit={sendToRequestAuthor}>
                      <TextField
                        select
                        size="small"
                        label="Заявка на подбор"
                        value={submitForm.requestId}
                        onChange={(e) => setSubmitForm({ ...submitForm, requestId: e.target.value })}
                      >
                        {requests.map((request) => (
                          <MenuItem key={request.id} value={request.id}>
                            {request.position}
                            {request.createdByName ? ` — ${request.createdByName}` : ''}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        size="small"
                        label="Почему этот кандидат"
                        value={submitForm.note}
                        onChange={(e) => setSubmitForm({ ...submitForm, note: e.target.value })}
                      />
                      <Button type="submit" variant="contained" disabled={!submitForm.requestId}>
                        Отправить на рассмотрение
                      </Button>
                    </form>
                  )}
                  {submitInfo && <Alert severity="success" onClose={() => setSubmitInfo(null)}>{submitInfo}</Alert>}
                  <p className="hr-submission__contacts">
                    Автор заявки увидит ФИО, фото, возраст и профессиональную часть резюме.
                    Контакты кандидата останутся только у вас.
                  </p>
                </section>
              )}
              {canManage && !selectedCandidate.isAnonymized && (
                <section>
                  <h2>Персональные данные</h2>
                  <Button size="small" variant="outlined" color="error" onClick={() => anonymizeNow(selectedCandidate.id)}>
                    Обезличить сейчас
                  </Button>
                  <p className="hr-submission__contacts">
                    Для запроса кандидата на удаление данных (срок по закону — 7 рабочих дней).
                  </p>
                </section>
              )}
              <section>
                <h2>Интервью</h2>
                <form className="hr-candidate-action" onSubmit={scheduleInterview}>
                  <TextField
                    size="small"
                    type="datetime-local"
                    label="Дата и время"
                    InputLabelProps={{ shrink: true }}
                    value={interviewForm.dueAt}
                    onChange={(e) => setInterviewForm({ ...interviewForm, dueAt: e.target.value })}
                  />
                  <TextField
                    size="small"
                    value={interviewForm.comment}
                    onChange={(e) => setInterviewForm({ ...interviewForm, comment: e.target.value })}
                    placeholder="Формат, участники, ссылка на звонок"
                  />
                  <Button type="submit" variant="outlined" disabled={!interviewForm.dueAt}>Запланировать</Button>
                </form>
              </section>
              <section>
                <h2>История</h2>
                <div className="hr-timeline">
                  {(selectedCandidate.events ?? []).length > 0 ? selectedCandidate.events?.map((event) => (
                    <article key={event.id} className={`hr-timeline__item hr-timeline__item--${event.type}`}>
                      <span className="hr-timeline__dot" aria-hidden="true" />
                      <div className="hr-timeline__body">
                        <header>
                          <strong>{event.title}</strong>
                          <time>{formatDateTime(event.createdAt)}</time>
                        </header>
                        <small>{eventTypeLabels[event.type]}{event.createdByName ? ` \u00b7 ${event.createdByName}` : ''}</small>
                        {event.fromStage && event.toStage && (
                          <small>{stageLabels[event.fromStage]} → {stageLabels[event.toStage]}</small>
                        )}
                        {event.dueAt && <small>Запланировано: {formatDateTime(event.dueAt)}</small>}
                        {event.comment && <p>{event.comment}</p>}
                      </div>
                    </article>
                  )) : <div className="hr-page__empty">История пока пуста: события появятся после импорта, смены этапов и комментариев.</div>}
                </div>
              </section>
            </div>
          </>
        )}
      </aside>
      {rejectDialog && (
        <>
          <button className="hr-resume-drawer__outside" type="button" aria-label="Отмена" onClick={() => setRejectDialog(null)} />
          <div className="hr-reject-dialog" role="dialog" aria-modal="true">
            <strong>Отказ кандидату</strong>
            <TextField select size="small" label="Причина" value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}>
              {REJECTION_REASONS.map((reason) => (
                <MenuItem key={reason.code} value={reason.code}>{reason.label}</MenuItem>
              ))}
            </TextField>
            <TextField size="small" label={rejectReason === 'other' ? 'Комментарий (обязателен)' : 'Комментарий'}
              multiline minRows={2} value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)} />
            <div className="hr-reject-dialog__actions">
              <Button size="small" variant="contained" color="error"
                disabled={!rejectReason || (rejectReason === 'other' && !rejectComment.trim())}
                onClick={confirmReject}>
                Оформить отказ
              </Button>
              <Button size="small" variant="outlined" onClick={() => setRejectDialog(null)}>Отмена</Button>
            </div>
            <p className="hr-submission__contacts">
              После отказа запустится 30-дневный отсчёт хранения персональных данных.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
