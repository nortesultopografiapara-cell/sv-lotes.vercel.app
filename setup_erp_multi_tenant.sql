-- setup_erp_multi_tenant.sql

DO $$
BEGIN
    -- 1. ADICIONAR COLUNAS (IF NOT EXISTS)
    
    -- SALES
    BEGIN ALTER TABLE public.sales ADD COLUMN broker_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.sales ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.sales ADD COLUMN tenant_id uuid; EXCEPTION WHEN duplicate_column THEN END;

    -- CONTRACTS
    BEGIN ALTER TABLE public.contracts ADD COLUMN broker_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.contracts ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.contracts ADD COLUMN tenant_id uuid; EXCEPTION WHEN duplicate_column THEN END;

    -- FINANCE_RECEIPTS
    BEGIN ALTER TABLE public.finance_receipts ADD COLUMN broker_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.finance_receipts ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.finance_receipts ADD COLUMN tenant_id uuid; EXCEPTION WHEN duplicate_column THEN END;

    -- BLOCKS
    BEGIN ALTER TABLE public.blocks ADD COLUMN broker_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.blocks ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.blocks ADD COLUMN tenant_id uuid; EXCEPTION WHEN duplicate_column THEN END;

    -- RESERVATIONS
    BEGIN ALTER TABLE public.reservations ADD COLUMN broker_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.reservations ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.reservations ADD COLUMN tenant_id uuid; EXCEPTION WHEN duplicate_column THEN END;

    -- RESERVATION_LOGS
    BEGIN ALTER TABLE public.reservation_logs ADD COLUMN broker_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.reservation_logs ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.reservation_logs ADD COLUMN tenant_id uuid; EXCEPTION WHEN duplicate_column THEN END;

    -- BROKER_COMMISSIONS
    BEGIN ALTER TABLE public.broker_commissions ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.broker_commissions ADD COLUMN tenant_id uuid; EXCEPTION WHEN duplicate_column THEN END;

    -- CUSTOMERS
    BEGIN ALTER TABLE public.customers ADD COLUMN broker_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.customers ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.customers ADD COLUMN tenant_id uuid; EXCEPTION WHEN duplicate_column THEN END;

    -- CLIENTS
    BEGIN ALTER TABLE public.clients ADD COLUMN broker_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.clients ADD COLUMN company_id uuid; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.clients ADD COLUMN tenant_id uuid; EXCEPTION WHEN duplicate_column THEN END;
END $$;


-- 2. CRIAR CONSTRAINTS OPCIONAIS (ON DELETE SET NULL)
DO $$
BEGIN
    -- SALES
    BEGIN ALTER TABLE public.sales ADD CONSTRAINT fk_sales_broker FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN END;
    BEGIN ALTER TABLE public.sales ADD CONSTRAINT fk_sales_company FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN END;

    -- CONTRACTS
    BEGIN ALTER TABLE public.contracts ADD CONSTRAINT fk_contracts_broker FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN END;
    BEGIN ALTER TABLE public.contracts ADD CONSTRAINT fk_contracts_company FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN END;

    -- FINANCE_RECEIPTS
    BEGIN ALTER TABLE public.finance_receipts ADD CONSTRAINT fk_finance_receipts_broker FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN END;
    BEGIN ALTER TABLE public.finance_receipts ADD CONSTRAINT fk_finance_receipts_company FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN END;

    -- BLOCKS
    BEGIN ALTER TABLE public.blocks ADD CONSTRAINT fk_blocks_broker FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN END;
    
    -- RESERVATIONS
    BEGIN ALTER TABLE public.reservations ADD CONSTRAINT fk_reservations_broker FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN END;
    
    -- CUSTOMERS
    BEGIN ALTER TABLE public.customers ADD CONSTRAINT fk_customers_broker FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN END;

    -- CLIENTS
    BEGIN ALTER TABLE public.clients ADD CONSTRAINT fk_clients_broker FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN END;
    
    -- BROKER_COMMISSIONS
    BEGIN ALTER TABLE public.broker_commissions ADD CONSTRAINT fk_broker_commissions_broker FOREIGN KEY (broker_id) REFERENCES public.brokers(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN END;

END $$;

-- 3. CRIAR ÍNDICES

-- SALES
CREATE INDEX IF NOT EXISTS idx_sales_broker_id ON public.sales(broker_id);
CREATE INDEX IF NOT EXISTS idx_sales_company_id ON public.sales(company_id);

-- CONTRACTS
CREATE INDEX IF NOT EXISTS idx_contracts_broker_id ON public.contracts(broker_id);
CREATE INDEX IF NOT EXISTS idx_contracts_company_id ON public.contracts(company_id);

-- FINANCE_RECEIPTS
CREATE INDEX IF NOT EXISTS idx_finance_receipts_broker_id ON public.finance_receipts(broker_id);
CREATE INDEX IF NOT EXISTS idx_finance_receipts_company_id ON public.finance_receipts(company_id);

-- BLOCKS
CREATE INDEX IF NOT EXISTS idx_blocks_broker_id ON public.blocks(broker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_company_id ON public.blocks(company_id);

-- RESERVATIONS
CREATE INDEX IF NOT EXISTS idx_reservations_broker_id ON public.reservations(broker_id);
CREATE INDEX IF NOT EXISTS idx_reservations_company_id ON public.reservations(company_id);

-- RESERVATION_LOGS
CREATE INDEX IF NOT EXISTS idx_reservation_logs_broker_id ON public.reservation_logs(broker_id);
CREATE INDEX IF NOT EXISTS idx_reservation_logs_company_id ON public.reservation_logs(company_id);

-- BROKER_COMMISSIONS
CREATE INDEX IF NOT EXISTS idx_broker_commissions_company_id ON public.broker_commissions(company_id);

-- CUSTOMERS
CREATE INDEX IF NOT EXISTS idx_customers_broker_id ON public.customers(broker_id);
CREATE INDEX IF NOT EXISTS idx_customers_company_id ON public.customers(company_id);

-- CLIENTS
CREATE INDEX IF NOT EXISTS idx_clients_broker_id ON public.clients(broker_id);
CREATE INDEX IF NOT EXISTS idx_clients_company_id ON public.clients(company_id);

NOTIFY pgrst, 'reload schema';
