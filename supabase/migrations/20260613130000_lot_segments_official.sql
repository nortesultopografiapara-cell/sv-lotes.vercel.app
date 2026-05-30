-- Medidas oficiais por segmento TXT Civil 3D (fonte única para dimensões do lote)

ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS front_segment_index integer;

COMMENT ON COLUMN public.blocks.front_segment_index IS
  'Índice 0-based do segmento TXT que é a frente do lote (após Identificar Frentes).';

CREATE TABLE IF NOT EXISTS public.lot_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  segment_index integer NOT NULL,
  distance numeric,
  bearing numeric,
  north numeric,
  east numeric,
  vertex_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lot_id, segment_index)
);

CREATE INDEX IF NOT EXISTS idx_lot_segments_lot_id ON public.lot_segments(lot_id);

ALTER TABLE public.lot_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY lot_segments_tenant_select ON public.lot_segments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE b.id = lot_segments.lot_id
        AND (
          b.tenant_id = (auth.jwt() ->> 'tenant_id')::text
          OR b.company_id = (auth.jwt() ->> 'tenant_id')::text
          OR (auth.jwt() ->> 'role') = 'SUPER_ADMIN'
        )
    )
  );

CREATE POLICY lot_segments_tenant_insert ON public.lot_segments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE b.id = lot_segments.lot_id
        AND (
          b.tenant_id = (auth.jwt() ->> 'tenant_id')::text
          OR b.company_id = (auth.jwt() ->> 'tenant_id')::text
          OR (auth.jwt() ->> 'role') = 'SUPER_ADMIN'
        )
    )
  );

CREATE POLICY lot_segments_tenant_update ON public.lot_segments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE b.id = lot_segments.lot_id
        AND (
          b.tenant_id = (auth.jwt() ->> 'tenant_id')::text
          OR b.company_id = (auth.jwt() ->> 'tenant_id')::text
          OR (auth.jwt() ->> 'role') = 'SUPER_ADMIN'
        )
    )
  );

CREATE POLICY lot_segments_tenant_delete ON public.lot_segments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE b.id = lot_segments.lot_id
        AND (
          b.tenant_id = (auth.jwt() ->> 'tenant_id')::text
          OR b.company_id = (auth.jwt() ->> 'tenant_id')::text
          OR (auth.jwt() ->> 'role') = 'SUPER_ADMIN'
        )
    )
  );
