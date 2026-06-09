-- Histórico operacional completo por lote (venda, contrato, GIS, financeiro).

CREATE TABLE IF NOT EXISTS public.lot_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  project_id uuid,
  block_id uuid,
  lot_id uuid,
  sale_id uuid,
  contract_id uuid,
  user_id uuid,
  action text NOT NULL,
  title text NOT NULL,
  description text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL
);

CREATE INDEX IF NOT EXISTS lot_audit_logs_project_id_idx
  ON public.lot_audit_logs(project_id);

CREATE INDEX IF NOT EXISTS lot_audit_logs_block_id_idx
  ON public.lot_audit_logs(block_id);

CREATE INDEX IF NOT EXISTS lot_audit_logs_lot_id_idx
  ON public.lot_audit_logs(lot_id);

CREATE INDEX IF NOT EXISTS lot_audit_logs_sale_id_idx
  ON public.lot_audit_logs(sale_id);

CREATE INDEX IF NOT EXISTS lot_audit_logs_contract_id_idx
  ON public.lot_audit_logs(contract_id);

CREATE INDEX IF NOT EXISTS lot_audit_logs_created_at_idx
  ON public.lot_audit_logs(created_at DESC);

COMMENT ON TABLE public.lot_audit_logs IS
  'Linha do tempo operacional do lote: venda, contrato, GIS, financeiro e cadastro';

ALTER TABLE public.lot_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY lot_audit_logs_authenticated_select ON public.lot_audit_logs
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY lot_audit_logs_authenticated_insert ON public.lot_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
