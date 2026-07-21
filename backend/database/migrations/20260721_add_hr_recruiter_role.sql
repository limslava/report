-- Add a separate HR recruiter role for candidate checks.
-- head_hr/hr_specialist remain schedule roles for the personnel department.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN (
    'admin',
    'director',
    'general_director',
    'financer',
    'chief_accountant',
    'lawyer',
    'security',
    'secretary',
    'manager_sales',
    'head_sales',
    'manager_ktk_vvo',
    'head_ktk_vvo',
    'manager_ktk_mow',
    'head_ktk_mow',
    'head_hr',
    'hr_specialist',
    'hr_recruiter',
    'garage_head_vvo',
    'garage_head',
    'manager_auto',
    'manager_rail',
    'manager_extra',
    'manager_to',
    'warehouse_manager_vvo',
    'warehouse_manager',
    'warehouse_keeper',
    'counterparty_user'
  ));
