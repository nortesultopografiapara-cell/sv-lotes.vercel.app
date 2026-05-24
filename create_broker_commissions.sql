CREATE TABLE IF NOT EXISTS public.broker_commissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    broker_id UUID REFERENCES public.brokers(id) ON DELETE SET NULL,
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    tenant_id UUID,
    company_id UUID,
    sale_value NUMERIC NOT NULL DEFAULT 0,
    commission_percent NUMERIC NOT NULL DEFAULT 0,
    commission_value NUMERIC NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'PENDENTE', -- PENDENTE, PAGO, CANCELADO
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE
);

NOTIFY pgrst, 'reload schema';
