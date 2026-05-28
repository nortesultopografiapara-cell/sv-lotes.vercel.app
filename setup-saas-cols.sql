DO $$ 
BEGIN
  -- Tabela: companies
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS project_limit INTEGER DEFAULT -1;
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS broker_limit INTEGER DEFAULT -1;
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan_type VARCHAR(50) DEFAULT 'Básico';
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS status_operacional VARCHAR(50) DEFAULT 'Ativa';
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS custom_monthly_price NUMERIC(10, 2);
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS custom_price_enabled BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS custom_price_badge TEXT;
END $$;

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES users(id),
    company_id UUID,
    action TEXT,
    ip TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
