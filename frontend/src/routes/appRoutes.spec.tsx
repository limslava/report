import { describe, expect, it } from 'vitest';
import { authenticatedRoutes } from './appRoutes';

const routeByPath = new Map(authenticatedRoutes.map((route) => [route.path, route]));

describe('warehouse route access', () => {
  it.each([
    ['warehouse', 'warehouse_keeper', true],
    ['warehouse', 'warehouse_manager', true],
    ['warehouse', 'counterparty_user', true],
    ['warehouse', 'financer', true],
    ['warehouse/operations', 'warehouse_keeper', true],
    ['warehouse/operations', 'warehouse_manager', true],
    ['warehouse/operations', 'counterparty_user', false],
    ['warehouse/operations', 'financer', false],
    ['warehouse/on-site', 'warehouse_keeper', true],
    ['warehouse/on-site', 'counterparty_user', false],
    ['warehouse/reception', 'warehouse_keeper', true],
    ['warehouse/reception', 'counterparty_user', false],
    ['warehouse/issue', 'warehouse_keeper', true],
    ['warehouse/issue', 'counterparty_user', false],
  ])('%s access for %s is %s', (path, role, expected) => {
    const route = routeByPath.get(path);

    expect(route, `missing route ${path}`).toBeDefined();
    expect(route!.allow(role)).toBe(expected);
  });
});
