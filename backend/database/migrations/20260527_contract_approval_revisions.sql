ALTER TABLE contract_approval_steps
  ADD COLUMN IF NOT EXISTS revision_no INT NOT NULL DEFAULT 1;

ALTER TABLE contract_attachments
  ADD COLUMN IF NOT EXISTS revision_no INT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_contract_steps_contract_revision
  ON contract_approval_steps(contract_id, revision_no);

CREATE INDEX IF NOT EXISTS idx_contract_attachments_contract_revision
  ON contract_attachments(contract_id, revision_no);
