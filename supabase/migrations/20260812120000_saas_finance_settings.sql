-- Configurações do Financeiro SaaS Master (marco inicial do caixa, etc.)
CREATE TABLE IF NOT EXISTS public.saas_finance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS idx_saas_finance_settings_key
  ON public.saas_finance_settings(key);

COMMENT ON TABLE public.saas_finance_settings IS
  'Configurações do painel Financeiro SaaS Master';

COMMENT ON COLUMN public.saas_finance_settings.key IS
  'Chave da configuração (ex.: saas_cash_start_at)';

COMMENT ON COLUMN public.saas_finance_settings.value IS
  'Valor JSON da configuração';

ALTER TABLE public.saas_finance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saas_finance_settings_super_admin ON public.saas_finance_settings;
CREATE POLICY saas_finance_settings_super_admin ON public.saas_finance_settings
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

NOTIFY pgrst, 'reload schema';
