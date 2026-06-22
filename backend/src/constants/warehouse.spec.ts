import {
  WAREHOUSE_BILLING_MANAGEMENT_ROLES,
  WAREHOUSE_BILLING_VIEW_ROLES,
  WAREHOUSE_DATE_CORRECTION_ROLES,
  WAREHOUSE_STAFF_ROLES,
  WAREHOUSE_TARIFF_MANAGEMENT_ROLES,
} from './warehouse';

describe('warehouse role matrix', () => {
  it('limits physical warehouse operations to operational roles', () => {
    expect(WAREHOUSE_STAFF_ROLES).toEqual([
      'admin',
      'warehouse_manager',
      'warehouse_keeper',
    ]);
  });

  it('limits date correction to manager and administrator', () => {
    expect(WAREHOUSE_DATE_CORRECTION_ROLES).toEqual([
      'admin',
      'warehouse_manager',
    ]);
  });

  it('keeps financial permissions separate from physical operations', () => {
    expect(WAREHOUSE_TARIFF_MANAGEMENT_ROLES).toContain('financer');
    expect(WAREHOUSE_BILLING_MANAGEMENT_ROLES).toContain('financer');
    expect(WAREHOUSE_BILLING_VIEW_ROLES).toContain('counterparty_user');
    expect(WAREHOUSE_STAFF_ROLES).not.toContain('financer');
    expect(WAREHOUSE_STAFF_ROLES).not.toContain('director');
    expect(WAREHOUSE_STAFF_ROLES).not.toContain('counterparty_user');
  });
});
