-- Auditoria de alterações cadastrais do cliente (RG, profissão, endereço, etc.)

CREATE TABLE IF NOT EXISTS public.customer_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL
);

CREATE INDEX IF NOT EXISTS customer_audit_logs_customer_id_idx
  ON public.customer_audit_logs(customer_id);

CREATE INDEX IF NOT EXISTS customer_audit_logs_changed_at_idx
  ON public.customer_audit_logs(changed_at DESC);

COMMENT ON TABLE public.customer_audit_logs IS
  'Histórico de alterações cadastrais do cliente para rastreabilidade contratual';

NOTIFY pgrst, 'reload schema';
