import {
  canAccessContractApproval,
  canViewBPDashboard,
  canViewPlans,
  canViewTechDashboard,
} from '../utils/rolePermissions';

export function getDefaultAuthenticatedRoute(role?: string | null): string {
  if (role === 'warehouse_keeper') return '/warehouse/operations';
  if (role === 'warehouse_manager' || role === 'counterparty_user') return '/warehouse';
  if (canViewTechDashboard(role)) return '/sw-tech-dashboard';
  if (role === 'garage_head' || role === 'garage_head_vvo') {
    return '/operations-preview?location=garage_vvo&section=mechanics';
  }
  if (role === 'warehouse_manager_vvo' || role === 'manager_to') {
    return '/operations-preview?location=garage_vvo&section=warehouse_staff';
  }
  if (canViewPlans(role)) return '/plans';
  if (canViewBPDashboard(role)) return '/business-processes/dashboard';
  if (canAccessContractApproval(role)) return '/business-processes/contract-approval';
  if (role === 'security') {
    return '/operations-preview?location=security_vvo&section=guards';
  }
  if (role === 'head_hr' || role === 'hr_specialist') {
    return '/operations-preview?location=ktk_vvo&section=containers';
  }
  return '/plans';
}
