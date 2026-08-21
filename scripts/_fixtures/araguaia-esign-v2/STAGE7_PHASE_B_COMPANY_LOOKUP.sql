-- FASE B — SELECT read-only: localizar company_id das empresas de homologação.
-- NÃO alterar dados. Executar no SQL Editor e colar o resultado.

-- 1) Empresa de teste homologação V2 (confirmada FASE C.1):
--    f26f2331-1885-4ac6-8d0e-4131cc8a8014 = S.V TOPOGRAFIA E PROJETO LTDA
--    NÃO usar 5ebfe934… (TOPOGRAFIA_COMPANY_ID legado / inexistente neste banco)
SELECT
  id,
  name,
  razao_social,
  fantasy_name,
  cnpj,
  contract_model,
  created_at
FROM public.companies
WHERE id = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014'
   OR name ILIKE '%Topografia%'
   OR razao_social ILIKE '%Topografia%'
ORDER BY name;

-- 2) R R NEGÓCIOS & SERVIÇOS LTDA (UUID ainda NÃO confirmado no repositório)
SELECT
  id,
  name,
  razao_social,
  fantasy_name,
  cnpj,
  contract_model,
  created_at
FROM public.companies
WHERE name ILIKE '%R R%'
   OR name ILIKE '%NEGÓCIOS%'
   OR name ILIKE '%NEGOCIOS%'
   OR razao_social ILIKE '%R R%'
   OR razao_social ILIKE '%NEGÓCIOS%'
   OR razao_social ILIKE '%NEGOCIOS%'
   OR regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') LIKE '%57590706%'
ORDER BY name;

-- 3) Onde o company_id entra no fluxo de assinatura (somente leitura)
-- contracts.company_id / contracts.tenant_id → createSignaturePartiesAfterSend
SELECT
  c.id AS contract_id,
  c.contract_number,
  c.company_id,
  c.tenant_id,
  c.contract_model,
  c.status,
  c.signature_status
FROM public.contracts c
WHERE c.company_id IN (
  SELECT id FROM public.companies
  WHERE name ILIKE '%R R%'
     OR name ILIKE '%Topografia%'
     OR razao_social ILIKE '%R R%'
     OR razao_social ILIKE '%Topografia%'
     OR regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') LIKE '%57590706%'
)
ORDER BY c.created_at DESC
LIMIT 20;
