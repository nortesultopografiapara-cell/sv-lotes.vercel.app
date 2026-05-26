-- Permite exclusão física de movimentos de caixa (opcional; fluxo usa estorno por padrão).
CREATE POLICY "Users can delete cash movements in their tenant" ON public.cash_movements
  FOR DELETE USING (
    tenant_id IN (
      SELECT company_id FROM public.users WHERE id = auth.uid()
    )
    OR tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
