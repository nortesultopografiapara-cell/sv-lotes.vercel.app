/**
 * Roteiro da homologação coordenada no Develop. Não abre conexão.
 */

import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '@/lib/security/financeReceiptAccessPolicy';

export const SECURITY_LOCKDOWN_SQL = 'supabase/proposals/20261105190000_security_lockdown_coordinated.sql';
export const SECURITY_HOMOLOG_PRECHECK = 'supabase/proposals/20261105191000_security_homolog_precheck_readonly.sql';

export const USERS_POLICY_ALLOWLIST = [
  'Usuário atualiza próprio perfil',
  'Tenant admin gerencia usuários locais',
  'Usuário vê a si próprio',
  'Todos os usuários para SUPER_ADMIN',
  'tenant_isolation_users',
] as const;

export const USERS_POLICIES_REMOVED = [
  'Enable insert for authenticated users only',
  'Enable read access for all users',
] as const;

export const FINANCE_POLICY_ALLOWLIST = [
  'tenant_isolation_finance_receipts',
  'owner_readonly_no_insert',
  'owner_readonly_no_update',
  'owner_readonly_no_delete',
] as const;

export const FINANCE_POLICIES_REMOVED = [
  'Allow select finance_receipts',
  'Allow insert finance_receipts',
  'Allow update finance_receipts',
  'Allow delete finance_receipts for authenticated users',
] as const;

export type SecurityHomologStep = {
  id: string;
  kind: 'read' | 'publish' | 'sql' | 'prove' | 'stop';
  text: string;
};

export const SECURITY_HOMOLOG_STEPS: SecurityHomologStep[] = [
  {
    id: 'project-ref',
    kind: 'read',
    text: 'Confirmar na URL do SQL Editor o projeto hoynysmynxncdlptuzub e registrar a URL da consulta que mostrou 12.371 e, se ainda existir, a que mostrou 26.178.',
  },
  {
    id: 'branch',
    kind: 'publish',
    text: 'Publicar somente a branch security/finance-receipts-rls-audit, com o commit desta fase, em Preview apontando para o Develop.',
  },
  {
    id: 'preview-target',
    kind: 'read',
    text: 'Conferir que NEXT_PUBLIC_SUPABASE_URL do Preview contém hoynysmynxncdlptuzub e não aezktedncttwpqeunjej.',
  },
  {
    id: 'precheck',
    kind: 'read',
    text: 'Executar os três inventários somente leitura. Interromper se aparecer policy fora da lista permitida ou da lista removida.',
  },
  {
    id: 'counts',
    kind: 'stop',
    text: 'Interromper a escrita se receipts_exact divergir de 12.371 sem explicação por estimativa, outra tabela ou outro projeto.',
  },
  {
    id: 'api-first',
    kind: 'publish',
    text: 'Publicar as APIs desta branch antes do SQL, para o service_role já exigir sessão.',
  },
  {
    id: 'one-transaction',
    kind: 'sql',
    text: 'Aplicar apenas o SQL coordenado, numa única transação. Não executar os dois lock­downs separados.',
  },
  {
    id: 'two-companies',
    kind: 'prove',
    text: 'Com usuários de teste de duas empresas, negar papel, empresa, leitura e escrita cruzada de recebíveis.',
  },
  {
    id: 'legitimate',
    kind: 'prove',
    text: 'Confirmar perfil, ativação, corretor da própria empresa, OWNER somente leitura, SUPER_ADMIN e saída do modo empresa.',
  },
  {
    id: 'finance-regression',
    kind: 'prove',
    text: 'Abrir venda, contrato, fluxo, relatório, baixa manual, Asaas e Inter de teste, sem cobrança nem pagamento real.',
  },
];

export function securityHomologBlockReason(
  env: { [key: string]: string | undefined },
): string {
  const target = env.SV_LOTES_SECURITY_HOMOLOG_TARGET;
  if (env.SV_LOTES_SECURITY_HOMOLOG !== '1') return 'NOT_AUTHORIZED';
  if (target === PRODUCTION_PROJECT_REF) return 'PRODUCTION_FORBIDDEN';
  if (target !== DEVELOP_PROJECT_REF) return 'WRONG_TARGET';
  return '';
}

export function policyWouldAbort(
  observed: readonly string[],
  removed: readonly string[],
  allowed: readonly string[],
): string[] {
  const dropped = new Set(removed);
  const keep = new Set(allowed);
  return observed.filter((name) => !dropped.has(name) && !keep.has(name));
}
