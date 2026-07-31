-- Clientes Master Topografia + vínculo client_id nas Ordens de Serviço
-- Fase correção 1B+: seletor de cliente + snapshot. Não reaplicar migrations anteriores.

CREATE TABLE IF NOT EXISTS public.master_topography_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  document text NULL,
  document_normalized text NULL,
  phone text NULL,
  phone_normalized text NULL,
  email text NULL,
  email_normalized text NULL,
  contact_name text NULL,
  address text NULL,
  city text NULL,
  state text NULL,
  notes text NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT master_topography_clients_name_len CHECK (char_length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_topo_clients_document_normalized
  ON public.master_topography_clients (document_normalized)
  WHERE document_normalized IS NOT NULL AND char_length(document_normalized) > 0;

CREATE INDEX IF NOT EXISTS idx_master_topo_clients_name
  ON public.master_topography_clients (name);

CREATE INDEX IF NOT EXISTS idx_master_topo_clients_archived
  ON public.master_topography_clients (is_archived);

CREATE INDEX IF NOT EXISTS idx_master_topo_clients_phone_norm
  ON public.master_topography_clients (phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_master_topo_clients_email_norm
  ON public.master_topography_clients (email_normalized)
  WHERE email_normalized IS NOT NULL;

ALTER TABLE public.master_topography_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_topography_clients_super_admin
  ON public.master_topography_clients;
CREATE POLICY master_topography_clients_super_admin
  ON public.master_topography_clients
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.master_topography_clients IS
  'Clientes da SV Topografia & Projetos (Master) — exclusivo SUPER_ADMIN. Não confundir com customers de loteamento.';

-- Vínculo opcional na OS + contatos do responsável (compartilhamento)
ALTER TABLE public.master_topography_operations
  ADD COLUMN IF NOT EXISTS client_id uuid NULL
    REFERENCES public.master_topography_clients(id) ON DELETE SET NULL;

ALTER TABLE public.master_topography_operations
  ADD COLUMN IF NOT EXISTS responsible_phone text NULL;

ALTER TABLE public.master_topography_operations
  ADD COLUMN IF NOT EXISTS responsible_email text NULL;

CREATE INDEX IF NOT EXISTS idx_master_topo_operations_client
  ON public.master_topography_operations (client_id)
  WHERE client_id IS NOT NULL;

-- Backfill: não altera client_name existente; client_id permanece null até seleção explícita.

NOTIFY pgrst, 'reload schema';
