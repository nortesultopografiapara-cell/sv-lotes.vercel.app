-- FASE C.1 — verificar empresa de teste real (somente SELECT).
-- S.V TOPOGRAFIA E PROJETO LTDA
-- companies.id = f26f2331-1885-4ac6-8d0e-4131cc8a8014
-- NÃO usar 5ebfe934-e1ae-4252-b3dd-808390c32551 (inexistente neste banco).

SELECT id, name, razao_social, fantasy_name, cnpj, contract_model,
       is_test_company, is_demo_sandbox, active, status
FROM public.companies
WHERE id = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';

-- UUID legado (deve retornar 0 rows):
SELECT id, name
FROM public.companies
WHERE id = '5ebfe934-e1ae-4252-b3dd-808390c32551';

SELECT
  count(*)::int AS contracts_count,
  count(*) FILTER (WHERE coalesce(contract_model, '') ILIKE '%ARAGUAIA%')::int AS araguaia_contracts
FROM public.contracts
WHERE company_id = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014'
   OR tenant_id = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
