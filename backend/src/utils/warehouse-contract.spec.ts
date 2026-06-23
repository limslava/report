import { getWarehouseContractState } from './warehouse-contract';

describe('getWarehouseContractState', () => {
  const now = new Date('2026-06-23T00:00:00.000Z');

  it('returns not_set without an end date', () => {
    expect(getWarehouseContractState(null, now)).toEqual({
      contractStatus: 'not_set',
      contractDaysRemaining: null,
    });
  });

  it('warns during the final 30 calendar days', () => {
    expect(getWarehouseContractState('2026-07-23', now)).toEqual({
      contractStatus: 'expiring',
      contractDaysRemaining: 30,
    });
  });

  it('marks a past date as expired', () => {
    expect(getWarehouseContractState('2026-06-22', now)).toEqual({
      contractStatus: 'expired',
      contractDaysRemaining: -1,
    });
  });

  it('keeps a later contract active', () => {
    expect(getWarehouseContractState('2026-07-24', now)).toEqual({
      contractStatus: 'active',
      contractDaysRemaining: 31,
    });
  });
});
