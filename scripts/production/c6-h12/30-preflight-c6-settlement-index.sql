-- Somente leitura. Não executar junto com a migration.
-- Conferir duplicidade antes de criar idx_cash_movements_c6_charge_unique.

SELECT company_id,
       metadata->>'bank_charge_id' AS bank_charge_id,
       count(*) AS active_rows
FROM public.cash_movements
WHERE type = 'entrada'
  AND COALESCE(status, 'ativo') = 'ativo'
  AND metadata->>'provider' = 'C6'
  AND COALESCE(metadata->>'bank_charge_id', '') <> ''
GROUP BY company_id, metadata->>'bank_charge_id'
HAVING count(*) > 1;

SELECT count(*) AS estornados_c6
FROM public.cash_movements
WHERE COALESCE(status, '') = 'estornado'
  AND metadata->>'provider' = 'C6';
