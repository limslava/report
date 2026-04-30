-- Contracts base table
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE IF NOT EXISTS contract_type_enum AS ENUM ('expense', 'income');
CREATE TYPE IF NOT EXISTS contract_document_kind_enum AS ENUM ('master', 'addendum');

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number VARCHAR(100) NOT NULL,
  contract_type contract_type_enum NOT NULL,
  counterparty_name VARCHAR(255) NOT NULL,
  counterparty_short_name VARCHAR(255),
  ownership_form VARCHAR(100),
  counterparty_inn VARCHAR(12) NOT NULL,
  document_kind contract_document_kind_enum NOT NULL DEFAULT 'master',
  parent_contract_id UUID NULL REFERENCES contracts(id),
  initiator_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_number ON contracts(contract_number);
CREATE INDEX IF NOT EXISTS idx_contracts_inn ON contracts(counterparty_inn);
CREATE INDEX IF NOT EXISTS idx_contracts_type ON contracts(contract_type);
CREATE INDEX IF NOT EXISTS idx_contracts_parent ON contracts(parent_contract_id);
