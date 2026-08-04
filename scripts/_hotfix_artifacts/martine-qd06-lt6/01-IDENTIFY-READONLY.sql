-- =============================================================================
-- SELECT READONLY — Martine III / QD 06 / Lote 6
-- Rodar no SQL Editor (produção) antes de classificar no editor de lados.
-- Alternativa com env válido: npx tsx scripts/identify-martine-qd06-lt6.ts
--
-- Após o SELECT: no GIS (ADMIN/SUPER_ADMIN) → Resumo → Editar lados do lote
-- → atribuir Frente/Fundo/Dir/Esq por segmento → Salvar (só official_side).
-- NÃO aplicar UPDATE SQL automático sem confirmação visual.
-- =============================================================================

SELECT
  c.id AS company_id,
  c.name AS company_name,
  p.id AS project_id,
  p.name AS project_name,
  b.id AS lot_id,
  b.number,
  b.block_name,
  b.front_segment_index,
  b.front_street_name,
  b.updated_at,
  b.area,
  jsonb_array_length(COALESCE(b.segments_json::jsonb, '[]'::jsonb)) AS segment_count,
  b.segments_json
FROM public.blocks b
JOIN public.projects p ON p.id = b.project_id
JOIN public.companies c ON c.id = COALESCE(b.company_id, p.company_id)
WHERE p.name ILIKE '%MARTINE%'
  AND regexp_replace(COALESCE(b.number::text, ''), '^0+', '') = '6'
  AND (
    regexp_replace(COALESCE(b.block_name, b.name, ''), '[^0-9]', '', 'g') IN ('6', '06')
    OR COALESCE(b.block_name, b.name, '') ILIKE '%06%'
  );

-- Detalhe por segmento:
WITH lot AS (
  SELECT b.*
  FROM public.blocks b
  JOIN public.projects p ON p.id = b.project_id
  WHERE p.name ILIKE '%MARTINE%'
    AND regexp_replace(COALESCE(b.number::text, ''), '^0+', '') = '6'
    AND (
      regexp_replace(COALESCE(b.block_name, b.name, ''), '[^0-9]', '', 'g') IN ('6', '06')
      OR COALESCE(b.block_name, b.name, '') ILIKE '%06%'
    )
)
SELECT
  (e->>'segment_index')::int AS indice,
  COALESCE(e->>'distance', e->>'length', e->>'storedLength') AS comprimento,
  e->>'official_side' AS official_side_atual,
  e->>'confrontant' AS confrontant
FROM lot,
LATERAL jsonb_array_elements(lot.segments_json::jsonb) e
ORDER BY 1;
