-- GIS-004: frente oficial vinculada ao logradouro (street_guides)
-- front_street_id = UUID da linha em street_guides (equiv. front_street_guide_id no app)

ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS front_street_id uuid,
  ADD COLUMN IF NOT EXISTS front_street_name text,
  ADD COLUMN IF NOT EXISTS front_street_type text;

COMMENT ON COLUMN public.blocks.front_street_id IS
  'street_guides.id da rua da frente oficial (front_street_guide_id no app)';
COMMENT ON COLUMN public.blocks.front_street_name IS
  'Nome exibido do logradouro da frente (ex.: RUA CENTRAL 01)';

NOTIFY pgrst, 'reload schema';
