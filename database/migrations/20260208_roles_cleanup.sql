-- Migration: replace legacy roles with manager_* roles
UPDATE users SET role = 'manager_ktk_vvo' WHERE role = 'container_vladivostok';
UPDATE users SET role = 'manager_ktk_mow' WHERE role = 'container_moscow';
UPDATE users SET role = 'manager_rail' WHERE role = 'railway';
UPDATE users SET role = 'manager_auto' WHERE role = 'autotruck';
UPDATE users SET role = 'manager_extra' WHERE role = 'additional';
UPDATE users SET role = 'manager_to' WHERE role = 'to_auto';
UPDATE users SET role = 'manager_sales' WHERE role = 'sales';
