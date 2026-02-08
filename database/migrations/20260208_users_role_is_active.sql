-- Migration: widen users.role length and add is_active
ALTER TABLE users
  ALTER COLUMN role TYPE VARCHAR(50);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
