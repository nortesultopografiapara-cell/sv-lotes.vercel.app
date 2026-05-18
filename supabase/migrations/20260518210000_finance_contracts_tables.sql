CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES auth.users(id),
    project_id UUID REFERENCES projects(id),
    lot_id UUID REFERENCES blocks(id),
    customer_id UUID REFERENCES customers(id),
    company_id UUID REFERENCES companies(id),
    template_id UUID REFERENCES contract_templates(id),
    valor_total DECIMAL(10, 2),
    entrada DECIMAL(10, 2),
    parcelas INTEGER,
    forma_pagamento VARCHAR(50),
    vencimento_inicial DATE,
    status VARCHAR(50) DEFAULT 'ativo',
    generated_html TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES auth.users(id),
    project_id UUID REFERENCES projects(id),
    lot_id UUID REFERENCES blocks(id),
    customer_id UUID REFERENCES customers(id),
    contract_id UUID REFERENCES contracts(id),
    parcela_numero INTEGER,
    parcela_total INTEGER,
    valor DECIMAL(10, 2),
    vencimento DATE,
    status VARCHAR(50) DEFAULT 'pendente',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for contracts" ON contracts FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant isolation for finance_receipts" ON finance_receipts FOR ALL USING (tenant_id = auth.uid());
