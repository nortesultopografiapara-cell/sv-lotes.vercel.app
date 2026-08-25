-- Fase 3B — camada documental do termo de desistência.
-- Aditivo. NÃO aplicar automaticamente. DEVELOP somente após autorização.
-- Reutiliza sale_release_settlements.termination_document_snapshot e document_id.

ALTER TABLE public.sale_release_settlements
  ADD COLUMN IF NOT EXISTS document_number text NULL;

ALTER TABLE public.sale_release_settlements
  ADD COLUMN IF NOT EXISTS document_status text NULL;

ALTER TABLE public.sale_release_settlements
  ADD COLUMN IF NOT EXISTS document_generated_at timestamptz NULL;

ALTER TABLE public.sale_release_settlements
  ADD COLUMN IF NOT EXISTS document_generated_by uuid NULL;

ALTER TABLE public.sale_release_settlements
  ADD COLUMN IF NOT EXISTS document_hash text NULL;

COMMENT ON COLUMN public.sale_release_settlements.document_number IS
  'Número auditável do termo (ex.: TD-000000001/2026). Imutável após o freeze.';

COMMENT ON COLUMN public.sale_release_settlements.document_status IS
  'PENDING | GENERATED | SIGNED | FAILED — separado do status EXECUTED do acerto.';

COMMENT ON COLUMN public.sale_release_settlements.document_hash IS
  'SHA-256 do HTML congelado em termination_document_snapshot.';

DO $$
BEGIN
  ALTER TABLE public.sale_release_settlements
    ADD CONSTRAINT sale_release_settlements_document_status_check
    CHECK (
      document_status IS NULL
      OR document_status IN ('PENDING', 'GENERATED', 'SIGNED', 'FAILED')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sale_release_settlements_document_number_uidx
  ON public.sale_release_settlements (company_id, document_number)
  WHERE document_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS sale_release_settlements_document_status_idx
  ON public.sale_release_settlements (company_id, document_status, created_at DESC)
  WHERE document_status IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sale_operation_document_counters (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  year integer NOT NULL,
  last_seq integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, prefix, year),
  CONSTRAINT sale_operation_document_counters_prefix_check
    CHECK (prefix ~ '^[A-Z]{2}$'),
  CONSTRAINT sale_operation_document_counters_year_check
    CHECK (year >= 2000 AND year <= 2100),
  CONSTRAINT sale_operation_document_counters_seq_check
    CHECK (last_seq >= 0)
);

COMMENT ON TABLE public.sale_operation_document_counters IS
  'Contador atômico de numeração de termos de operação (TD/ID/… por empresa e ano).';

ALTER TABLE public.sale_operation_document_counters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sale_operation_document_counters'
      AND policyname = 'sale_operation_document_counters_tenant_all'
  ) THEN
    CREATE POLICY sale_operation_document_counters_tenant_all
      ON public.sale_operation_document_counters
      FOR ALL
      USING (public.is_super_admin() OR company_id = public.current_tenant_id())
      WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.sale_operation_document_counters TO authenticated;
GRANT ALL ON TABLE public.sale_operation_document_counters TO service_role;

CREATE OR REPLACE FUNCTION public.next_sale_operation_document_number(
  p_company_id uuid,
  p_prefix text,
  p_year integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer;
  v_seq integer;
  v_prefix text;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id obrigatório';
  END IF;
  IF auth.uid() IS NOT NULL
     AND NOT public.is_super_admin()
     AND p_company_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;
  v_prefix := upper(btrim(coalesce(p_prefix, 'TD')));
  IF v_prefix !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'prefixo inválido';
  END IF;
  v_year := coalesce(
    p_year,
    extract(year from timezone('America/Sao_Paulo', now()))::integer
  );

  INSERT INTO public.sale_operation_document_counters (company_id, prefix, year, last_seq)
  VALUES (p_company_id, v_prefix, v_year, 1)
  ON CONFLICT (company_id, prefix, year)
  DO UPDATE SET
    last_seq = public.sale_operation_document_counters.last_seq + 1,
    updated_at = now()
  RETURNING last_seq INTO v_seq;

  RETURN v_prefix || '-' || lpad(v_seq::text, 9, '0') || '/' || v_year::text;
END;
$$;

REVOKE ALL ON FUNCTION public.next_sale_operation_document_number(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_sale_operation_document_number(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_sale_operation_document_number(uuid, text, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
