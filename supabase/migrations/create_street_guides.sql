CREATE TABLE IF NOT EXISTS public.street_guides (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
    project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
    name text,
    geometry_geojson jsonb NOT NULL,
    visible boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.street_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin pode tudo na street_guides"
    ON public.street_guides FOR ALL
    USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'SUPER_ADMIN'
        OR 
        (SELECT email FROM public.users WHERE id = auth.uid()) = 'nortesultopografiapara@gmail.com'
    );

CREATE POLICY "Usuários veem as street_guides de seu tenant"
    ON public.street_guides FOR SELECT
    USING (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    );

CREATE POLICY "Administradores do tenant podem gerenciar street_guides"
    ON public.street_guides FOR ALL
    USING (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
        AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
    );
