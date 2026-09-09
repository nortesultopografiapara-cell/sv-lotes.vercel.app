-- Foto do corretor (Etapa E).
-- Aditivo e idempotente. Não altera comissão, vendas, reservas, contratos ou financeiro.
-- Não reutiliza 20260520_upgrade_brokers_table / 20260520_add_broker_fields.

ALTER TABLE public.brokers
ADD COLUMN IF NOT EXISTS avatar_url text;

NOTIFY pgrst, 'reload schema';
