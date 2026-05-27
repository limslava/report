CREATE TABLE IF NOT EXISTS contract_approval_decision_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  approval_step_id UUID NOT NULL REFERENCES contract_approval_steps(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id),
  role_code VARCHAR(64) NOT NULL,
  revision_no INT NOT NULL DEFAULT 1,
  previous_decision VARCHAR(32) NULL,
  new_decision VARCHAR(32) NOT NULL,
  previous_comment TEXT NULL,
  new_comment TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_decision_events_contract
  ON contract_approval_decision_events(contract_id, created_at);
