import { describe, expect, it } from 'vitest';
import { getDefaultAuthenticatedRoute } from './defaultAuthenticatedRoute';

describe('getDefaultAuthenticatedRoute', () => {
  it.each([
    ['admin', '/sw-tech-dashboard'],
    ['director', '/sw-tech-dashboard'],
    ['head_sales', '/sw-tech-dashboard'],
    ['manager_sales', '/plans'],
    ['security', '/business-processes/dashboard'],
    ['garage_head', '/operations-preview?location=garage_vvo&section=mechanics'],
    ['warehouse_manager_vvo', '/operations-preview?location=garage_vvo&section=warehouse_staff'],
    ['head_hr', '/operations-preview?location=ktk_vvo&section=containers'],
    ['warehouse_keeper', '/warehouse/operations'],
    ['warehouse_manager', '/warehouse'],
    ['counterparty_user', '/warehouse'],
    ['unknown_role', '/plans'],
  ])('routes %s to %s', (role, expectedRoute) => {
    expect(getDefaultAuthenticatedRoute(role)).toBe(expectedRoute);
  });
});
