-- ============================================================
-- VERIFICAÇÃO READ-ONLY — Equipamentos Fase 1A (pós apply manual)
-- Cole no SQL Editor do Supabase (produção). NÃO altera dados.
-- NÃO reaplicar a migration 20260902120000_master_topography_equipment.sql
-- ============================================================

-- 1) Tabelas
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'master_topography_equipment',
    'master_topography_equipment_counters'
  )
ORDER BY table_name;

-- 2) Colunas principais
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'master_topography_equipment'
ORDER BY ordinal_position;

-- 3) Constraints
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.master_topography_equipment'::regclass
ORDER BY conname;

-- 4) Índices
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'master_topography_equipment',
    'master_topography_equipment_counters'
  )
ORDER BY indexname;

-- 5) RLS enabled
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'master_topography_equipment',
    'master_topography_equipment_counters'
  )
ORDER BY c.relname;

-- 6) Policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'master_topography_equipment',
    'master_topography_equipment_counters'
  )
ORDER BY tablename, policyname;

-- 7) Função + grants
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'generate_next_topography_equipment_code';

SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'generate_next_topography_equipment_code'
ORDER BY grantee, privilege_type;

-- 8) FK cost_center
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'master_topography_equipment'
  AND kcu.column_name = 'cost_center_id';

-- 9) Confirmar is_super_admin nas policies (qual/with_check)
SELECT policyname, qual, with_check
FROM pg_policies
WHERE tablename = 'master_topography_equipment';
-- Esperado: ambas referenciam is_super_admin()
