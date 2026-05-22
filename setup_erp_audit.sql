-- setup_erp_audit.sql

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid,
    action text NOT NULL,
    module text NOT NULL,
    reference_id uuid,
    description text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- CREATE INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON public.audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_sales_broker_tenant_company ON public.sales(broker_id, tenant_id, company_id);
CREATE INDEX IF NOT EXISTS idx_finance_receipts_filters ON public.finance_receipts(due_date, status, contract_id);
CREATE INDEX IF NOT EXISTS idx_contracts_customer_broker ON public.contracts(customer_id, broker_id);
CREATE INDEX IF NOT EXISTS idx_broker_commissions_lookup ON public.broker_commissions(broker_id, sale_id, status);

NOTIFY pgrst, 'reload schema';
