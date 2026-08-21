-- FASE B — SELECT read-only: localizar company_id das empresas de homologação.
-- NÃO alterar dados. Executar no SQL Editor e colar o resultado.

-- 1) SV Topografia (ID já referenciado no código: 5ebfe934-e1ae-4252-b3dd-808390c32551)
SELECT
  id,
  name,
  razao_social,
  fantasy_name,
  cnpj,
  contract_model,
  created_at
FROM public.companies
WHERE id = '5ebfe934-e1ae-4252-b3dd-808390c32551'
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
