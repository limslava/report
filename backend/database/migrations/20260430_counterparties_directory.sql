CREATE TABLE IF NOT EXISTS counterparties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inn VARCHAR(12) NOT NULL UNIQUE,
  name_full VARCHAR(500) NOT NULL,
  name_short VARCHAR(255) NULL,
  counterparty_form VARCHAR(32) NULL,
  ogrn VARCHAR(13) NULL,
  kpp VARCHAR(9) NULL,
  address VARCHAR(500) NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'manual',
  source_payload JSONB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
