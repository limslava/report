UPDATE contract_sla_rules
SET sla_workdays = CASE
  WHEN role_code = 'secretary' THEN 1
  WHEN role_code IN ('security', 'lawyer', 'chief_accountant', 'financer') THEN 2
  ELSE sla_workdays
END,
updated_at = NOW()
WHERE role_code IN ('security', 'lawyer', 'chief_accountant', 'financer', 'secretary');

-- Routes may already contain unprocessed steps copied from the previous SLA.
-- Updating them makes future assignments in existing routes use the new duration.
UPDATE contract_approval_steps
SET sla_workdays = CASE
  WHEN role_code = 'secretary' THEN 1
  WHEN role_code IN ('security', 'lawyer', 'chief_accountant', 'financer') THEN 2
  ELSE sla_workdays
END,
updated_at = NOW()
WHERE decision IS NULL
  AND role_code IN ('security', 'lawyer', 'chief_accountant', 'financer', 'secretary');
