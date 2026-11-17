-- Rollback da rotina. Não revoga parcelas já regularizadas: o histórico precisa permanecer.
-- Não executar em Production. Se a tabela tiver linhas, a função é removida e a tabela fica.

DROP FUNCTION IF EXISTS public.execute_legacy_signal_regularization(uuid, uuid, uuid, integer, jsonb, text, text, boolean);

DO $$
BEGIN
  IF to_regclass('public.legacy_signal_regularizations') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.legacy_signal_regularizations) THEN
    RAISE NOTICE 'A auditoria tem registros e foi preservada.';
    RETURN;
  END IF;
  DROP TABLE public.legacy_signal_regularizations;
END $$;
