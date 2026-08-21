-- FASE C — confirmar que TOPOGRAFIA_COMPANY_ID é o tenant de contratos SV Topografia.
-- SOMENTE SELECT. Não alterar dados.
-- UUID canônico do código: 5ebfe934-e1ae-4252-b3dd-808390c32551

SELECT id, name, razao_social, fantasy_name, cnpj, contract_model
FROM public.companies
WHERE id = '5ebfe934-e1ae-4252-b3dd-808390c32551';

SELECT
  count(*)::int AS contracts_count,
  count(*) FILTER (WHERE coalesce(contract_model, '') ILIKE '%ARAGUAIA%')::int AS araguaia_contracts
FROM public.contracts
WHERE company_id = '5ebfe934-e1ae-4252-b3dd-808390c32551'
   OR tenant_id = '5ebfe934-e1ae-4252-b3dd-808390c32551';
