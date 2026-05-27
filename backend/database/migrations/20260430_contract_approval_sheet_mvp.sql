CREATE TYPE IF NOT EXISTS contract_template_kind_enum AS ENUM ('typical', 'non_typical');
CREATE TYPE IF NOT EXISTS contract_income_subtype_enum AS ENUM ('standard', 'with_psr');
CREATE TYPE IF NOT EXISTS contract_signing_method_enum AS ENUM ('edo', 'post');
CREATE TYPE IF NOT EXISTS contract_status_enum AS ENUM ('draft', 'in_approval', 'rework', 'approved', 'rejected');
CREATE TYPE IF NOT EXISTS contract_approval_decision_enum AS ENUM ('approve', 'rework', 'reject');

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS income_subtype contract_income_subtype_enum NULL,
  ADD COLUMN IF NOT EXISTS template_kind contract_template_kind_enum NOT NULL DEFAULT 'typical',
  ADD COLUMN IF NOT EXISTS subject VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS counterparty_form VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS contract_date DATE NULL,
  ADD COLUMN IF NOT EXISTS psr_flag BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS signing_method contract_signing_method_enum NOT NULL DEFAULT 'post',
  ADD COLUMN IF NOT EXISTS status contract_status_enum NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS assigned_general_director_id UUID NULL REFERENCES users(id);

CREATE TABLE IF NOT EXISTS contract_approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  role_code VARCHAR(64) NOT NULL,
  approver_user_id UUID NOT NULL REFERENCES users(id),
  order_no INT NOT NULL,
  accepted_at TIMESTAMP NULL,
  signed_at TIMESTAMP NULL,
  decision contract_approval_decision_enum NULL,
  comment TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_steps_contract ON contract_approval_steps(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_steps_contract_order ON contract_approval_steps(contract_id, order_no);
