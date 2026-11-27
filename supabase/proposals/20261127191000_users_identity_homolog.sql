-- Homologação prática da proteção de identidade. NÃO EXECUTAR nesta etapa.
-- Fora de supabase/migrations. Não cria usuário enquanto esta etapa estiver vigente.
-- Cada bloco é uma transação própria. Não colar os blocos em sequência.
-- Se um bloco levantar erro, executar ROLLBACK antes do próximo.
-- Ausência de linha não é proteção: o bloco precisa ver a linha antes da tentativa.
-- Empresas e pessoas abaixo são sintéticas. Não usar empresa real.

-- Identificadores reservados para a execução futura, somente no Develop:
-- empresa A  11111111-1111-4111-8111-111111111111
-- empresa B  22222222-2222-4222-8222-222222222222
-- comum      33333333-3333-4333-8333-333333333333
-- corretor   44444444-4444-4444-8444-444444444444
-- admin A    55555555-5555-4555-8555-555555555555
-- proprietário 66666666-6666-4666-8666-666666666666
-- super      77777777-7777-4777-8777-777777777777
-- alvo admin 88888888-8888-4888-8888-888888888888

-- Classificação esperada de cada resultado:
-- trigger: SQLSTATE 42501 e mensagem USERS_IDENTITY:*
-- rls: comando conclui com 0 linhas, depois de a mesma sessão ter visto a linha
-- constraint: SQLSTATE 23514 ou 23503, sem código USERS_IDENTITY
-- ausente: SELECT prévio também devolve 0 linhas; resultado inconclusivo

-- Limpeza, também em transação própria, somente com os ids acima.
-- Ordem: owner_project_access, public.users, auth.identities, auth.users,
-- companies. Conferir contagem antes e depois. ROLLBACK se a contagem
-- não for exatamente a dos ids sintéticos.

-- Bloco 0 — preparação isolada. Permanece em ROLLBACK até autorização expressa.
-- Na execução autorizada, conferir o SELECT e só então trocar por COMMIT.
BEGIN;
INSERT INTO public.companies (id, name)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'HOMOLOG-SINTETICA-A'),
  ('22222222-2222-4222-8222-222222222222', 'HOMOLOG-SINTETICA-B');
-- Inserir auth.users e public.users somente se o catálogo local exigir
-- a chave de auth.users. Usar e-mail @example.invalid. Não copiar senha real.
-- Papéis: USER, BROKER, ADMIN, OWNER, SUPER_ADMIN e um ADMIN alvo da exclusão.
SELECT id, role, tenant_id
FROM public.users
WHERE id IN (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888'
);
ROLLBACK;

-- Bloco 1 — usuário comum tenta virar SUPER_ADMIN. Esperado: trigger SELF_ROLE.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT id, role FROM public.users
WHERE id = '33333333-3333-4333-8333-333333333333';
UPDATE public.users
SET role = 'SUPER_ADMIN'
WHERE id = '33333333-3333-4333-8333-333333333333';
ROLLBACK;

-- Bloco 2 — corretor tenta trocar a própria empresa. Esperado: trigger TENANT_DENIED.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT id, tenant_id FROM public.users
WHERE id = '44444444-4444-4444-8444-444444444444';
UPDATE public.users
SET tenant_id = '22222222-2222-4222-8222-222222222222'
WHERE id = '44444444-4444-4444-8444-444444444444';
ROLLBACK;

-- Bloco 3 — admin da empresa A tenta promover usuário da empresa B.
-- Esperado: trigger ou RLS. Se o SELECT prévio vier vazio, marcar inconclusivo.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT id FROM public.users
WHERE id = '44444444-4444-4444-8444-444444444444'
  AND tenant_id = '22222222-2222-4222-8222-222222222222';
UPDATE public.users
SET role = 'ADMIN'
WHERE id = '44444444-4444-4444-8444-444444444444'
  AND tenant_id = '22222222-2222-4222-8222-222222222222';
ROLLBACK;

-- Bloco 4 — admin da empresa A cria USER na própria empresa.
-- Esperado: sucesso dentro da transação e ausência da linha depois do ROLLBACK.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
INSERT INTO public.users (id, role, tenant_id, full_name, email, status)
VALUES (
  '99999999-9999-4999-8999-999999999999',
  'USER',
  '11111111-1111-4111-8111-111111111111',
  'Homolog comum extra',
  'homolog-extra@example.invalid',
  'ACTIVE'
);
ROLLBACK;

-- Bloco 5 — admin da empresa A tenta criar SUPER_ADMIN. Esperado: ROLE_DENIED.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
INSERT INTO public.users (id, role, tenant_id, full_name, email, status)
VALUES (
  '99999999-9999-4999-8999-999999999991',
  'SUPER_ADMIN',
  '11111111-1111-4111-8111-111111111111',
  'Homolog privilegiado indevido',
  'homolog-privilegiado@example.invalid',
  'ACTIVE'
);
ROLLBACK;

-- Bloco 6 — proprietário altera o próprio papel. Esperado: SELF_ROLE.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT id, role FROM public.users
WHERE id = '66666666-6666-4666-8666-666666666666';
UPDATE public.users
SET role = 'ADMIN'
WHERE id = '66666666-6666-4666-8666-666666666666';
ROLLBACK;

-- Bloco 7 — SUPER_ADMIN sintético, somente neste ambiente isolado.
-- Esperado: a alteração de papel de um USER sintético conclui e o ROLLBACK desfaz.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT id, role FROM public.users
WHERE id = '33333333-3333-4333-8333-333333333333';
UPDATE public.users
SET role = 'MANAGER'
WHERE id = '33333333-3333-4333-8333-333333333333';
ROLLBACK;

-- Bloco 8 — exclusão do admin alvo sintético por usuário comum.
-- Esperado: erro de permissão ou 0 linhas com a linha visível antes.
-- Não usar um administrador real como alvo.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT id, role FROM public.users
WHERE id = '88888888-8888-4888-8888-888888888888';
DELETE FROM public.users
WHERE id = '88888888-8888-4888-8888-888888888888';
ROLLBACK;

-- Bloco 9 — limpeza exata, somente depois da homologação e em transação própria.
BEGIN;
DELETE FROM public.owner_project_access
WHERE user_id IN (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888',
  '99999999-9999-4999-8999-999999999999',
  '99999999-9999-4999-8999-999999999991'
);
DELETE FROM public.users
WHERE id IN (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888',
  '99999999-9999-4999-8999-999999999999',
  '99999999-9999-4999-8999-999999999991'
);
DELETE FROM auth.identities
WHERE user_id IN (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888'
);
DELETE FROM auth.users
WHERE id IN (
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888'
);
DELETE FROM public.companies
WHERE id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
)
AND name IN ('HOMOLOG-SINTETICA-A', 'HOMOLOG-SINTETICA-B');
-- Conferir que as contagens voltaram a zero antes do COMMIT.
ROLLBACK;
