ALTER TABLE contract_attachments
  ADD COLUMN IF NOT EXISTS approval_step_id UUID NULL REFERENCES contract_approval_steps(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS uploaded_by_user_id UUID NULL REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS context VARCHAR(40) NOT NULL DEFAULT 'contract';

CREATE INDEX IF NOT EXISTS idx_contract_attachments_step ON contract_attachments(approval_step_id);
