-- Migration: remove legacy users.department column (roles-only model)
-- Safe to run once; do not run if already removed.

ALTER TABLE users
  DROP COLUMN IF EXISTS department;

DROP INDEX IF EXISTS idx_users_department;
