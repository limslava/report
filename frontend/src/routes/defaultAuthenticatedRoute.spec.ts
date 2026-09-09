import { describe, expect, it } from 'vitest';
import { getDefaultAuthenticatedRoute } from './defaultAuthenticatedRoute';

describe('getDefaultAuthenticatedRoute', () => {
  it.each([
    ['admin', '/sw-tech-dashboard'],
    ['director', '/sw-tech-dashboard'],
    ['head_sales', '/sw-tech-dashboard'],
    ['manager_sales', '/plans'],
    ['security', '/operations-preview?location=security_vvo&section=guards'],
    ['garage_head_vvo', '/operations-preview?location=garage_vvo&section=mechanics'],
    ['warehouse_manager_vvo', '/operations-preview?location=garage_vvo&section=warehouse_staff'],
    ['head_hr', '/operations-preview?location=ktk_vvo&section=containers'],
    ['hr_specialist', '/operations-preview?location=ktk_vvo&section=containers'],
    ['hr_recruiter', '/business-processes/dashboard'],
    ['warehouse_keeper', '/warehouse/operations'],
    ['counterparty_user', '/warehouse'],
    ['unknown_role', '/plans'],
  ])('routes %s to %s', (role, expectedRoute) => {
    expect(getDefaultAuthenticatedRoute(role)).toBe(expectedRoute);
  });
});
