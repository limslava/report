import { Navigate, useParams } from 'react-router-dom';

/**
 * Отдельной страницы карточки вакансии пока нет: карточка открывается панелью
 * в реестре. Маршрут /hr/vacancies/:id сохранён для внешних ссылок и
 * перенаправляет в реестр с открытой карточкой.
 */
export default function HrVacancyCardPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <Navigate to="/hr/vacancies" replace />;
  }
  return <Navigate to={`/hr/vacancies?vacancyId=${encodeURIComponent(id)}`} replace />;
}
