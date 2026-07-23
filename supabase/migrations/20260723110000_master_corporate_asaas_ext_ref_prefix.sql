-- Fase 7.1b — Prefixo external_reference corporativo exclusivo
-- ASAAS_CORP_AR:{receivable_id}[:suffix] — sem colisão com SaaS/tenant.
-- Aceita legado MCF: apenas para linhas já existentes.

ALTER TABLE public.master_corporate_asaas_charges
  DROP CONSTRAINT IF EXISTS master_corp_asaas_charges_ext_ref_prefix;

ALTER TABLE public.master_corporate_asaas_charges
  ADD CONSTRAINT master_corp_asaas_charges_ext_ref_prefix CHECK (
    external_reference LIKE 'ASAAS_CORP_AR:%'
    OR external_reference LIKE 'MCF:%'
  );

COMMENT ON COLUMN public.master_corporate_asaas_charges.external_reference IS
  'Referência Asaas exclusiva do Financeiro Corporativo: ASAAS_CORP_AR:{receivable_id}[:suffix]. Legado MCF: ainda aceito.';
