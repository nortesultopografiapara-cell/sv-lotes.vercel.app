-- =============================================================================
-- C6 homolog — testes transacionais no Develop (ROLLBACK)
-- SQL Editor do projeto hoynysmynxncdlptuzub SOMENTE.
-- NÃO executar em Production. Sem HTTP ao C6. Sem boleto. Sem persistir.
--
-- Integração exclusiva (informada pelo operador):
--   Empresa: S.V TOPOGRAFIA E PROJETO LTDA
--   company_id:      f26f2331-1885-4ac6-8d0e-4131cc8a8014
--   integration_id:  e4d0e3c1-29c3-47a1-a04d-156e45fa4b25
--   provider: C6 / environment: SANDBOX / status: DRAFT / active: true
--
-- DRAFT é aceito: c6_homolog_assert_sandbox_integration só exige
-- provider='C6' e environment SANDBOX. Não consulta status nem active.
-- =============================================================================

-- A) Permissões das 4 RPCs (somente leitura). Esperado: 4 linhas verdict=OK
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  has_function_privilege('anon'::regrole, p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated'::regrole, p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role'::regrole, p.oid, 'EXECUTE') AS service_role_execute,
  EXISTS (
    SELECT 1
    FROM aclexplode(COALESCE(p.proacl, acldefault('f'::"char", p.proowner))) AS a
    WHERE a.grantee = 0
      AND a.privilege_type = 'EXECUTE'
  ) AS public_execute,
  CASE
    WHEN has_function_privilege('anon'::regrole, p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated'::regrole, p.oid, 'EXECUTE')
      OR EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(p.proacl, acldefault('f'::"char", p.proowner))) AS a
        WHERE a.grantee = 0
          AND a.privilege_type = 'EXECUTE'
      )
      THEN 'INDEVIDO'
    WHEN NOT has_function_privilege('service_role'::regrole, p.oid, 'EXECUTE')
      THEN 'FALTA_SERVICE_ROLE'
    ELSE 'OK'
  END AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'reserve_c6_homolog_idempotency',
    'mark_c6_homolog_idempotency_processing',
    'complete_c6_homolog_idempotency',
    'reconcile_c6_homolog_idempotency'
  )
ORDER BY p.proname, identity_args;

-- B) Integração exclusiva + DRAFT aceito? (somente leitura; sem secrets)
SELECT
  bi.id AS integration_id,
  bi.company_id,
  c.name AS company_name,
  bi.provider,
  bi.environment,
  bi.status,
  bi.active,
  public.c6_homolog_assert_sandbox_integration(bi.company_id, bi.id) AS sandbox_fn_accepts_draft
FROM public.bank_integrations AS bi
LEFT JOIN public.companies AS c ON c.id = bi.company_id
WHERE bi.id = 'e4d0e3c1-29c3-47a1-a04d-156e45fa4b25'::uuid
  AND bi.company_id = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014'::uuid;

BEGIN;

DO $$
DECLARE
  v_company uuid := 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
  v_integration uuid := 'e4d0e3c1-29c3-47a1-a04d-156e45fa4b25';
  v_company_name text;
  v_provider text;
  v_environment text;
  v_status text;
  v_active boolean;
  v_ok_grants integer := 0;
  v_rpc_count integer := 0;
  v_fp_a text := repeat('a', 64);
  v_fp_b text := repeat('b', 64);
  v_ref text := 'T3B6D0001';
  v_res jsonb;
  v_attempt integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE verdict = 'OK')
    INTO v_rpc_count, v_ok_grants
  FROM (
    SELECT
      CASE
        WHEN has_function_privilege('anon'::regrole, p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated'::regrole, p.oid, 'EXECUTE')
          OR EXISTS (
            SELECT 1
            FROM aclexplode(COALESCE(p.proacl, acldefault('f'::"char", p.proowner))) AS a
            WHERE a.grantee = 0
              AND a.privilege_type = 'EXECUTE'
          )
          THEN 'INDEVIDO'
        WHEN NOT has_function_privilege('service_role'::regrole, p.oid, 'EXECUTE')
          THEN 'FALTA_SERVICE_ROLE'
        ELSE 'OK'
      END AS verdict
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'reserve_c6_homolog_idempotency',
        'mark_c6_homolog_idempotency_processing',
        'complete_c6_homolog_idempotency',
        'reconcile_c6_homolog_idempotency'
      )
  ) AS g;
  IF v_rpc_count <> 4 OR v_ok_grants <> 4 THEN
    RAISE EXCEPTION
      'FAIL grants: esperado 4 RPCs com verdict OK; rpc_count=% ok_grants=%. Rode c6-homolog-rpc-grants-revoke.sql e o diagnostico.',
      v_rpc_count, v_ok_grants;
  END IF;
  RAISE NOTICE 'PASS grants 4/4 OK';

  SELECT c.name, bi.provider, bi.environment, bi.status, bi.active
    INTO v_company_name, v_provider, v_environment, v_status, v_active
  FROM public.bank_integrations AS bi
  LEFT JOIN public.companies AS c ON c.id = bi.company_id
  WHERE bi.id = v_integration
    AND bi.company_id = v_company;

  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'FAIL identify: integração exclusiva não encontrada';
  END IF;
  IF v_provider IS DISTINCT FROM 'C6' OR upper(v_environment) IS DISTINCT FROM 'SANDBOX' THEN
    RAISE EXCEPTION 'FAIL identify: esperado C6 SANDBOX, obtido % %', v_provider, v_environment;
  END IF;
  IF v_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL identify: integração inativa';
  END IF;
  IF NOT public.c6_homolog_assert_sandbox_integration(v_company, v_integration) THEN
    RAISE EXCEPTION 'FAIL draft: sandbox_fn recusou company=% integration=% status=%',
      v_company, v_integration, v_status;
  END IF;
  RAISE NOTICE 'PASS identify company=% (%) integration=% status=% (DRAFT aceito) active=%',
    v_company, coalesce(v_company_name, '?'), v_integration, v_status, v_active;

  -- 1) Production blocked
  v_res := public.reserve_c6_homolog_idempotency(
    v_company, v_integration, v_ref, 'PRODUCTION', 'B_01', v_fp_a, NULL
  );
  IF coalesce(v_res->>'acquired', 'true') <> 'false'
     OR v_res->>'reason' <> 'production_blocked' THEN
    RAISE EXCEPTION 'FAIL production_blocked: %', v_res;
  END IF;
  RAISE NOTICE 'PASS production_blocked';

  -- 2) Fingerprint inválido
  v_res := public.reserve_c6_homolog_idempotency(
    v_company, v_integration, v_ref, 'SANDBOX', 'B_01', 'not-a-sha256', NULL
  );
  IF coalesce(v_res->>'acquired', 'true') <> 'false'
     OR v_res->>'reason' <> 'invalid_fingerprint' THEN
    RAISE EXCEPTION 'FAIL invalid_fingerprint: %', v_res;
  END IF;
  RAISE NOTICE 'PASS invalid_fingerprint';

  -- 3) Reserva atômica
  v_res := public.reserve_c6_homolog_idempotency(
    v_company, v_integration, v_ref, 'SANDBOX', 'B_01', v_fp_a, NULL
  );
  IF coalesce(v_res->>'acquired', 'false') <> 'true'
     OR v_res#>>'{row,status}' <> 'RESERVED'
     OR coalesce((v_res#>>'{row,attempt_count}')::integer, 0) <> 1 THEN
    RAISE EXCEPTION 'FAIL reserve_acquired: %', v_res;
  END IF;
  v_attempt := (v_res#>>'{row,attempt_count}')::integer;
  RAISE NOTICE 'PASS reserve_acquired attempt=%', v_attempt;

  -- 4) Concorrência (mesma sessão / mesmo lock): segunda reserva = in_flight
  v_res := public.reserve_c6_homolog_idempotency(
    v_company, v_integration, v_ref, 'SANDBOX', 'B_01', v_fp_a, NULL
  );
  IF coalesce(v_res->>'acquired', 'true') <> 'false'
     OR v_res->>'reason' <> 'in_flight' THEN
    RAISE EXCEPTION 'FAIL concurrency_in_flight: %', v_res;
  END IF;
  RAISE NOTICE 'PASS concurrency_in_flight';

  -- 5) payload_mismatch
  v_res := public.reserve_c6_homolog_idempotency(
    v_company, v_integration, v_ref, 'SANDBOX', 'B_01', v_fp_b, NULL
  );
  IF coalesce(v_res->>'acquired', 'true') <> 'false'
     OR v_res->>'reason' <> 'payload_mismatch' THEN
    RAISE EXCEPTION 'FAIL payload_mismatch: %', v_res;
  END IF;
  RAISE NOTICE 'PASS payload_mismatch';

  -- 6) attempt_count antigo no mark
  v_res := public.mark_c6_homolog_idempotency_processing(
    v_company, v_integration, v_ref, 99
  );
  IF coalesce(v_res->>'acquired', 'true') <> 'false'
     OR v_res->>'reason' <> 'invalid_transition'
     OR v_res#>>'{row,status}' <> 'RESERVED' THEN
    RAISE EXCEPTION 'FAIL attempt_count_stale_mark: %', v_res;
  END IF;
  RAISE NOTICE 'PASS attempt_count_stale_mark';

  -- 7) mark PROCESSING com attempt correto
  v_res := public.mark_c6_homolog_idempotency_processing(
    v_company, v_integration, v_ref, v_attempt
  );
  IF coalesce(v_res->>'acquired', 'false') <> 'true'
     OR v_res#>>'{row,status}' <> 'PROCESSING' THEN
    RAISE EXCEPTION 'FAIL mark_processing: %', v_res;
  END IF;
  RAISE NOTICE 'PASS mark_processing';

  -- 8) complete com attempt_count antigo
  v_res := public.complete_c6_homolog_idempotency(
    v_company, v_integration, v_ref, 'FAILED', 99, 409, 'STALE', 'stale', NULL
  );
  IF coalesce(v_res->>'acquired', 'true') <> 'false'
     OR v_res->>'reason' <> 'invalid_transition' THEN
    RAISE EXCEPTION 'FAIL attempt_count_stale_complete: %', v_res;
  END IF;
  RAISE NOTICE 'PASS attempt_count_stale_complete';

  -- 9) UNKNOWN + bloqueio de retry
  v_res := public.complete_c6_homolog_idempotency(
    v_company, v_integration, v_ref, 'UNKNOWN', v_attempt, NULL, 'TIMEOUT', 'isolated timeout', NULL
  );
  IF coalesce(v_res->>'acquired', 'false') <> 'true'
     OR v_res#>>'{row,status}' <> 'UNKNOWN' THEN
    RAISE EXCEPTION 'FAIL complete_unknown: %', v_res;
  END IF;
  RAISE NOTICE 'PASS complete_unknown';

  v_res := public.reserve_c6_homolog_idempotency(
    v_company, v_integration, v_ref, 'SANDBOX', 'B_01', v_fp_a, NULL
  );
  IF coalesce(v_res->>'acquired', 'true') <> 'false'
     OR v_res->>'reason' <> 'needs_reconciliation' THEN
    RAISE EXCEPTION 'FAIL unknown_blocks_retry: %', v_res;
  END IF;
  RAISE NOTICE 'PASS unknown_blocks_retry';

  -- 10) reconcile não reemite e não muda UNKNOWN
  v_res := public.reconcile_c6_homolog_idempotency(
    v_company,
    v_integration,
    v_ref,
    'RECONCILIAR_B01_SANDBOX',
    'nota isolada; JSON do cliente nao e prova'
  );
  IF coalesce(v_res->>'acquired', 'true') <> 'false'
     OR v_res->>'reason' <> 'needs_bank_confirmation'
     OR v_res#>>'{row,status}' <> 'UNKNOWN' THEN
    RAISE EXCEPTION 'FAIL unknown_stays_unknown: %', v_res;
  END IF;
  RAISE NOTICE 'PASS unknown_stays_unknown';

  RAISE NOTICE 'ALL C6 DEVELOP IDEMPOTENCY TESTS PASSED (pending ROLLBACK)';
END $$;

ROLLBACK;
