-- =============================================================================
-- C6 homolog — CORRETIVO MÍNIMO de EXECUTE (somente as 4 RPCs)
-- Executar no SQL Editor do Develop SOMENTE se o diagnóstico tiver verdict INDEVIDO.
-- Projeto: hoynysmynxncdlptuzub
-- NÃO executar em Production. Não altera outras funções, tabelas ou integrações.
-- =============================================================================

REVOKE ALL ON FUNCTION public.reserve_c6_homolog_idempotency(uuid, uuid, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_c6_homolog_idempotency(uuid, uuid, text, text, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_c6_homolog_idempotency(uuid, uuid, text, text, text, text, uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.mark_c6_homolog_idempotency_processing(uuid, uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_c6_homolog_idempotency_processing(uuid, uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.mark_c6_homolog_idempotency_processing(uuid, uuid, text, integer) FROM authenticated;

REVOKE ALL ON FUNCTION public.complete_c6_homolog_idempotency(uuid, uuid, text, text, integer, integer, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_c6_homolog_idempotency(uuid, uuid, text, text, integer, integer, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.complete_c6_homolog_idempotency(uuid, uuid, text, text, integer, integer, text, text, text) FROM authenticated;

REVOKE ALL ON FUNCTION public.reconcile_c6_homolog_idempotency(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_c6_homolog_idempotency(uuid, uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_c6_homolog_idempotency(uuid, uuid, text, text, text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_c6_homolog_idempotency(uuid, uuid, text, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_c6_homolog_idempotency_processing(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_c6_homolog_idempotency(uuid, uuid, text, text, integer, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_c6_homolog_idempotency(uuid, uuid, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
