import {
  canSeeDispatcherFinance,
  dispatcherJournalAccess,
  forbiddenDispatcherPatchFields,
} from './dispatcher-journal-access';

describe('доступ к реестру диспетчерского отдела', () => {
  it('раскладывает роли по уровням', () => {
    expect(dispatcherJournalAccess('admin')).toBe('full');
    expect(dispatcherJournalAccess('manager_ktk_vvo')).toBe('full');
    expect(dispatcherJournalAccess('doc_manager_vvo')).toBe('fields');
    expect(dispatcherJournalAccess('secretary')).toBe('view');
    expect(dispatcherJournalAccess('hr_specialist')).toBe('view');
    expect(dispatcherJournalAccess('director')).toBeNull();
  });

  it('менеджер док. отдела правит только свои 12 полей, без даты и порядка строк', () => {
    expect(forbiddenDispatcherPatchFields('doc_manager_vvo', ['clientRate', 'invoiceSent', 'driverRemarks'])).toEqual([]);
    expect(forbiddenDispatcherPatchFields('doc_manager_vvo', ['status', 'position', 'orderDate', 'seal'])).toEqual(['status', 'position', 'orderDate']);
    expect(forbiddenDispatcherPatchFields('head_hr', ['seal'])).toEqual(['seal']);
    expect(forbiddenDispatcherPatchFields('head_ktk_vvo', ['position'])).toEqual([]);
  });

  it('деньги не видят только роли просмотра', () => {
    expect(canSeeDispatcherFinance('doc_manager_vvo')).toBe(true);
    expect(canSeeDispatcherFinance('manager_ktk_vvo')).toBe(true);
    expect(canSeeDispatcherFinance('secretary')).toBe(false);
    expect(canSeeDispatcherFinance('head_hr')).toBe(false);
  });
});
