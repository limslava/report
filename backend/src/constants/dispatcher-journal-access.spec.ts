import {
  canSeeDispatcherFinance,
  dispatcherJournalAccess,
  forbiddenDispatcherPatchFields,
} from './dispatcher-journal-access';

describe('доступ к реестру диспетчерского отдела', () => {
  it('раскладывает роли по уровням', () => {
    expect(dispatcherJournalAccess('admin')).toBe('full');
    expect(dispatcherJournalAccess('manager_ktk_vvo')).toBe('full');
    expect(dispatcherJournalAccess('manager_sales')).toBe('full');
    expect(dispatcherJournalAccess('head_sales')).toBe('full');
    expect(dispatcherJournalAccess('doc_manager_vvo')).toBe('full');
    expect(dispatcherJournalAccess('bdd_specialist_vvo')).toBe('view');
    expect(dispatcherJournalAccess('secretary')).toBe('view');
    expect(dispatcherJournalAccess('hr_specialist')).toBe('view');
    expect(dispatcherJournalAccess('director')).toBeNull();
  });

  it('роли просмотра ничего не правят, ведущие реестр — всё', () => {
    expect(forbiddenDispatcherPatchFields('head_hr', ['seal'])).toEqual(['seal']);
    expect(forbiddenDispatcherPatchFields('bdd_specialist_vvo', ['seal'])).toEqual(['seal']);
    expect(forbiddenDispatcherPatchFields('doc_manager_vvo', ['status', 'position'])).toEqual([]);
    expect(forbiddenDispatcherPatchFields('head_ktk_vvo', ['position'])).toEqual([]);
  });

  it('деньги не видят только роли просмотра', () => {
    expect(canSeeDispatcherFinance('doc_manager_vvo')).toBe(true);
    expect(canSeeDispatcherFinance('bdd_specialist_vvo')).toBe(false);
    expect(canSeeDispatcherFinance('manager_ktk_vvo')).toBe(true);
    expect(canSeeDispatcherFinance('secretary')).toBe(false);
    expect(canSeeDispatcherFinance('head_hr')).toBe(false);
  });
});
