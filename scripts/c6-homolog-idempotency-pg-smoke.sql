-- Smoke PostgreSQL descartavel para c6_homolog_idempotency.
-- NAO executar no Supabase Develop/Production.
-- Fase 3B.4 (2026-10-26): validado em PostgreSQL 18.4 embarcado local
-- (embedded-postgres, 127.0.0.1:55432, persistent=false). 46/46 testes SQL OK.
-- Cluster descartado ao final. Sem Develop, Production, C6 ou credenciais bancarias.

-- 1) Criar stubs minimos + aplicar supabase/migrations/20261026200000_c6_homolog_idempotency.sql
-- 2) Rodar o bloco abaixo em duas sessoes para concorrencia (A e B).

-- Fingerprint invalido:
-- SELECT public.reserve_c6_homolog_idempotency(
--   '<company>'::uuid, '<integration>'::uuid, 'B01A000099', 'SANDBOX', 'B_01', NULL, NULL
-- );
-- Esperado: acquired=false, reason=invalid_fingerprint.

-- Sessao A e B, mesmo key e mesmo fingerprint:
-- SELECT public.reserve_c6_homolog_idempotency(
--   '<company>'::uuid, '<integration>'::uuid, 'B01A000099', 'SANDBOX', 'B_01', repeat('a', 64), NULL
-- );
-- Esperado: uma acquired=true, a outra in_flight.

-- Mesma referencia, fingerprint diferente:
-- SELECT public.reserve_c6_homolog_idempotency(
--   '<company>'::uuid, '<integration>'::uuid, 'B01A000099', 'SANDBOX', 'B_01', repeat('b', 64), NULL
-- );
-- Esperado: payload_mismatch.

-- mark_processing com tentativa antiga:
-- SELECT public.mark_c6_homolog_idempotency_processing(
--   '<company>'::uuid, '<integration>'::uuid, 'B01A000099', 99
-- );
-- Esperado: acquired=false, reason=invalid_transition.

-- Transicao invalida:
-- SELECT public.complete_c6_homolog_idempotency(
--   '<company>'::uuid, '<integration>'::uuid, 'B01A000099', 'SUCCEEDED', 99, 201, NULL, NULL, 'slip'
-- );
-- Esperado: acquired=false, reason=invalid_transition.

-- Reconciliacao segura (UNKNOWN permanece UNKNOWN; sem reemissao):
-- SELECT public.reconcile_c6_homolog_idempotency(
--   '<company>'::uuid, '<integration>'::uuid, 'B01A000099',
--   'RECONCILIAR_B01_SANDBOX', 'nota do operador; JSON do cliente nao e prova'
-- );
-- Esperado: acquired=false, reason=needs_bank_confirmation, status=UNKNOWN.
