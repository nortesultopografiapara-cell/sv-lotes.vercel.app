-- Drop existing policies
DROP POLICY IF EXISTS "Super admin pode tudo na street_guides" ON public.street_guides;
DROP POLICY IF EXISTS "Usuários veem as street_guides de seu tenant" ON public.street_guides;
DROP POLICY IF EXISTS "Administradores do tenant podem gerenciar street_guides" ON public.street_guides;

-- SELECT: everyone can see lines from their tenant or everything if super admin
CREATE POLICY "Ver street_guides"
    ON public.street_guides FOR SELECT
    USING (
        public.is_super_admin() OR tenant_id = public.current_tenant_id()
    );

-- INSERT: allow if creating data for own tenant, or if super admin
CREATE POLICY "Inserir street_guides"
    ON public.street_guides FOR INSERT
    WITH CHECK (
        public.is_super_admin() OR tenant_id = public.current_tenant_id()
    );

-- UPDATE
CREATE POLICY "Atualizar street_guides"
    ON public.street_guides FOR UPDATE
    USING (
        public.is_super_admin() OR tenant_id = public.current_tenant_id()
    )
    WITH CHECK (
        public.is_super_admin() OR tenant_id = public.current_tenant_id()
    );

-- DELETE
CREATE POLICY "Deletar street_guides"
    ON public.street_guides FOR DELETE
    USING (
        public.is_super_admin() OR tenant_id = public.current_tenant_id()
    );
