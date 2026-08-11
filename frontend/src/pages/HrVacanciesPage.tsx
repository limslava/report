import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, MenuItem, TextField } from '@mui/material';
import { createHhVacancy, getHhVacancies, updateHhVacancy } from '../services/hh.api';
import type { HhVacancyDto, HhVacancyStatus } from '../types/hh';
import { useAuthStore } from '../store/auth-store';
import { canManageHrVacancies } from '../utils/rolePermissions';
import { extractApiError } from '../utils/apiError';
import { normalizePage } from '../utils/paged';
import '../styles/hr-cabinet.css';

const PER_PAGE = 50;

const statusLabels: Record<HhVacancyStatus, string> = {
  draft: 'Черновик',
  open: 'Открыта',
  paused: 'Пауза',
  closed: 'Закрыта',
  archived: 'Архив',
};

const emptyForm = {
  title: '',
  department: '',
  city: '',
  salaryFrom: '',
  salaryTo: '',
  targetCloseAt: '',
  requirements: '',
  responsibilities: '',
  benefits: '',
  status: 'open' as HhVacancyStatus,
};

export default function HrVacanciesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthStore((state) => state.user?.role);
  const canManage = canManageHrVacancies(role);
  const [items, setItems] = useState<HhVacancyDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [selectedVacancyId, setSelectedVacancyId] = useState<string | null>(null);
  const [status, setStatus] = useState<HhVacancyStatus | ''>('');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = (nextPage = page) => {
    setIsLoading(true);
    getHhVacancies({ q: q || undefined, status, page: nextPage, perPage: PER_PAGE })
      .then((response) => {
        const page = normalizePage(response.data, PER_PAGE);
        setItems(page.items);
        setTotal(page.total);
        setPage(page.page);
      })
      .catch((err) => setError(extractApiError(err, 'Не удалось загрузить вакансии')))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load(0);
  }, []);

  // Deep link на карточку вакансии: /hr/vacancies?vacancyId=...
  useEffect(() => {
    const vacancyId = searchParams.get('vacancyId');
    if (!vacancyId || !items.length) return;
    const vacancy = items.find((item) => item.id === vacancyId);
    if (vacancy) {
      openEdit(vacancy);
      const next = new URLSearchParams(searchParams);
      next.delete('vacancyId');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, items]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await createHhVacancy({
        title: form.title,
        department: form.department || null,
        city: form.city || null,
        salaryFrom: form.salaryFrom ? Number(form.salaryFrom) : null,
        salaryTo: form.salaryTo ? Number(form.salaryTo) : null,
        targetCloseAt: form.targetCloseAt || null,
        requirements: form.requirements || null,
        responsibilities: form.responsibilities || null,
        benefits: form.benefits || null,
        status: form.status,
        source: 'manual',
      });
      setForm(emptyForm);
      setCreateOpen(false);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось создать вакансию'));
    }
  };

  const openEdit = (vacancy: HhVacancyDto) => {
    setSelectedVacancyId(vacancy.id);
    setEditForm({
      title: vacancy.title,
      department: vacancy.department || '',
      city: vacancy.city || '',
      salaryFrom: vacancy.salaryFrom ? String(vacancy.salaryFrom) : '',
      salaryTo: vacancy.salaryTo ? String(vacancy.salaryTo) : '',
      targetCloseAt: vacancy.targetCloseAt ? vacancy.targetCloseAt.slice(0, 10) : '',
      requirements: vacancy.requirements || '',
      responsibilities: vacancy.responsibilities || '',
      benefits: vacancy.benefits || '',
      status: vacancy.status,
    });
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedVacancyId) return;
    setError(null);
    try {
      await updateHhVacancy(selectedVacancyId, {
        title: editForm.title,
        department: editForm.department || null,
        city: editForm.city || null,
        salaryFrom: editForm.salaryFrom ? Number(editForm.salaryFrom) : null,
        salaryTo: editForm.salaryTo ? Number(editForm.salaryTo) : null,
        targetCloseAt: editForm.targetCloseAt || null,
        requirements: editForm.requirements || null,
        responsibilities: editForm.responsibilities || null,
        benefits: editForm.benefits || null,
        status: editForm.status,
      });
      setSelectedVacancyId(null);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось сохранить вакансию'));
    }
  };

  const selectedVacancy = items.find((item) => item.id === selectedVacancyId) ?? null;
  const pagesTotal = Math.max(1, Math.ceil(total / PER_PAGE));

  /** Дней до планового срока закрытия; отрицательное значение — просрочка. */
  const daysLeft = (vacancy: HhVacancyDto): number | null => {
    if (!vacancy.targetCloseAt) return null;
    const target = new Date(`${vacancy.targetCloseAt.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(target.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  };

  return (
    <div className="hr-page">
      <section className="hr-page__header">
        <div>
          <h1 className="hr-page__title">Вакансии</h1>
        </div>
        {canManage && (
          <Button variant="contained" onClick={() => setCreateOpen((value) => !value)}>
            {createOpen ? 'Скрыть форму' : 'Добавить вакансию'}
          </Button>
        )}
      </section>
      {error && <Alert severity="warning">{error}</Alert>}
      {canManage && createOpen && (
      <form className="hr-page__form" onSubmit={submit}>
        <TextField label="Название" size="small" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <TextField label="Подразделение" size="small" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        <TextField label="Город" size="small" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <TextField label="ЗП от" size="small" type="number" value={form.salaryFrom} onChange={(e) => setForm({ ...form, salaryFrom: e.target.value })} />
        <TextField label="ЗП до" size="small" type="number" value={form.salaryTo} onChange={(e) => setForm({ ...form, salaryTo: e.target.value })} />
        <TextField label="Срок закрытия" size="small" type="date" InputLabelProps={{ shrink: true }} value={form.targetCloseAt} onChange={(e) => setForm({ ...form, targetCloseAt: e.target.value })} />
        <TextField select label="Статус" size="small" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as HhVacancyStatus })}>
          {Object.entries(statusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <TextField className="hr-page__form-wide" label="Требования" size="small" value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} />
        <TextField className="hr-page__form-wide" label="Обязанности" size="small" value={form.responsibilities} onChange={(e) => setForm({ ...form, responsibilities: e.target.value })} />
        <TextField className="hr-page__form-wide" label="Преимущества" size="small" value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} />
        <Button type="submit" variant="contained">Добавить</Button>
      </form>
      )}
      <section className="hr-page__filters">
        <TextField label="Поиск" size="small" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(0); }} />
        <TextField select label="Статус" size="small" value={status} onChange={(e) => setStatus(e.target.value as HhVacancyStatus | '')}>
          <MenuItem value="">Все</MenuItem>
          {Object.entries(statusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <Button variant="outlined" onClick={() => load(0)}>Применить</Button>
      </section>
      <section className="hr-page__table-shell">
        <table className="hr-page__table">
          <thead>
            <tr>
              <th>Вакансия</th>
              <th>Подразделение</th>
              <th>Город</th>
              <th>Зарплата</th>
              <th>Кандидаты</th>
              <th>Срок</th>
              <th>Осталось</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const left = daysLeft(item);
              const isActiveStatus = item.status === 'open' || item.status === 'draft';
              return (
              <tr
                key={item.id}
                className={selectedVacancyId === item.id ? 'hr-page__table-row--selected' : undefined}
                onDoubleClick={() => openEdit(item)}
              >
                <td><strong>{item.title}</strong><small>{item.source === 'manual' ? 'Вручную' : item.source}</small></td>
                <td>{item.department || '—'}</td>
                <td>{item.city || '—'}</td>
                <td>{item.salaryFrom || item.salaryTo ? `${item.salaryFrom ?? '...'}–${item.salaryTo ?? '...'} ${item.currency}` : '—'}</td>
                <td>{item.activeCandidatesCount} / {item.candidatesCount}</td>
                <td>{item.targetCloseAt || '—'}</td>
                <td>
                  {left === null || !isActiveStatus ? '—' : (
                    <span className={left < 0
                      ? 'hr-page__days hr-page__days--overdue'
                      : left <= 3 ? 'hr-page__days hr-page__days--soon' : 'hr-page__days'}
                    >
                      {left < 0 ? `просрочено ${Math.abs(left)} дн.` : `${left} дн.`}
                    </span>
                  )}
                </td>
                <td>
                  {/* Статус — read-only плашка; смена статуса живёт в карточке «Править»
                      (единый с кандидатами принцип: опасных инлайн-селектов в строках нет). */}
                  <span className={`hr-status hr-status--${item.status}`}>{statusLabels[item.status]}</span>
                </td>
                <td>
                  <Button size="small" variant={selectedVacancyId === item.id ? 'contained' : 'text'} onClick={() => openEdit(item)}>
                    {canManage ? 'Править' : 'Открыть'}
                  </Button>
                </td>
              </tr>
              );
            })}
            {isLoading && items.length === 0 && <tr><td colSpan={9} className="hr-page__empty">Загрузка...</td></tr>}
            {!isLoading && items.length === 0 && <tr><td colSpan={9} className="hr-page__empty">Вакансий пока нет.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="hr-page__paging">
        <span>Всего: {total}</span>
        <Button size="small" variant="outlined" disabled={page <= 0 || isLoading} onClick={() => load(page - 1)}>Назад</Button>
        <span>{page + 1} / {pagesTotal}</span>
        <Button size="small" variant="outlined" disabled={page + 1 >= pagesTotal || isLoading} onClick={() => load(page + 1)}>Вперёд</Button>
      </section>
      {selectedVacancy && <button className="hr-resume-drawer__outside" type="button" aria-label="Закрыть вакансию" onClick={() => setSelectedVacancyId(null)} />}
      <aside className={`hr-resume-drawer${selectedVacancy ? ' hr-resume-drawer--open' : ''}`} role="dialog" aria-modal="false">
        {selectedVacancy && (
          <>
            <div className="hr-resume-drawer__header">
              <div>
                <strong>{selectedVacancy.title}</strong>
                <span>{selectedVacancy.department || 'Подразделение не указано'}</span>
              </div>
              <Button variant="text" onClick={() => setSelectedVacancyId(null)}>Закрыть</Button>
            </div>
            <form className="hr-resume-drawer__body hr-vacancy-edit" onSubmit={submitEdit}>
              <TextField label="Название" size="small" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} required />
              <TextField label="Подразделение" size="small" value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} />
              <TextField label="Город" size="small" value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
              <div className="hr-vacancy-edit__row">
                <TextField label="ЗП от" size="small" type="number" value={editForm.salaryFrom} onChange={(e) => setEditForm({ ...editForm, salaryFrom: e.target.value })} />
                <TextField label="ЗП до" size="small" type="number" value={editForm.salaryTo} onChange={(e) => setEditForm({ ...editForm, salaryTo: e.target.value })} />
              </div>
              <div className="hr-vacancy-edit__row">
                <TextField label="Срок закрытия" size="small" type="date" InputLabelProps={{ shrink: true }} value={editForm.targetCloseAt} onChange={(e) => setEditForm({ ...editForm, targetCloseAt: e.target.value })} />
                <TextField select label="Статус" size="small" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as HhVacancyStatus })}>
                  {Object.entries(statusLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                </TextField>
              </div>
              <TextField label="Требования" size="small" multiline minRows={4} value={editForm.requirements} onChange={(e) => setEditForm({ ...editForm, requirements: e.target.value })} />
              <TextField label="Обязанности" size="small" multiline minRows={4} value={editForm.responsibilities} onChange={(e) => setEditForm({ ...editForm, responsibilities: e.target.value })} />
              <TextField label="Преимущества" size="small" multiline minRows={3} value={editForm.benefits} onChange={(e) => setEditForm({ ...editForm, benefits: e.target.value })} />
              <div className="hr-vacancy-edit__actions">
                <Button type="submit" variant="contained">Сохранить</Button>
                <Button type="button" variant="outlined" onClick={() => setSelectedVacancyId(null)}>Отмена</Button>
              </div>
            </form>
          </>
        )}
      </aside>
    </div>
  );
}
