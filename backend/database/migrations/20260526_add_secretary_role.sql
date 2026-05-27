-- Add the secretary role used for physical contract signing handoff.
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
    'manager_auto',
    'manager_rail',
    'manager_extra',
    'manager_to'
  ));
