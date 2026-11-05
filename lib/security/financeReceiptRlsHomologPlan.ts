/**
 * Plano da homologação futura no Develop. Não abre conexão.
 * O script scripts/develop/finance-receipts-rls-homolog.ts recusa execução
 * enquanto a autorização explícita não estiver presente.
 */

import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '@/lib/security/financeReceiptAccessPolicy';

export type FinanceRlsHomologCase = {
  id: string;
  area: string;
  expect: string;
};

export const FINANCE_RLS_HOMOLOG_CASES: FinanceRlsHomologCase[] = [
  { id: 'select-own-company', area: 'SELECT', expect: 'empresa A lê as próprias parcelas' },
  { id: 'select-other-company', area: 'SELECT', expect: 'empresa A não lê parcelas da empresa B' },
  { id: 'insert-other-company', area: 'INSERT', expect: 'empresa A não grava parcela na empresa B' },
  { id: 'update-other-company', area: 'UPDATE', expect: 'empresa A não altera parcela da empresa B' },
  { id: 'delete-other-company', area: 'DELETE', expect: 'empresa A não apaga parcela da empresa B' },
  { id: 'truncate-authenticated', area: 'TRUNCATE', expect: 'authenticated recebe permissão negada' },
  { id: 'truncate-anon', area: 'TRUNCATE', expect: 'anon recebe permissão negada' },
  { id: 'owner-read', area: 'OWNER', expect: 'OWNER lê a própria empresa' },
  { id: 'owner-write', area: 'OWNER', expect: 'OWNER não altera, não inclui e não apaga' },
  { id: 'super-admin', area: 'SUPER_ADMIN', expect: 'SUPER_ADMIN lê as duas empresas' },
  { id: 'legacy-company-only', area: 'legado', expect: 'parcela só com company_id da própria empresa continua visível' },
  { id: 'legacy-neither', area: 'legado', expect: 'parcela sem empresa fica invisível para o usuário comum' },
  { id: 'mismatched-pair', area: 'legado', expect: 'tenant_id e company_id divergentes ficam invisíveis para as duas empresas' },
  { id: 'new-sale', area: 'venda', expect: 'venda nova da própria empresa grava parcelas; outra empresa recebe 403' },
  { id: 'existing-contract', area: 'contrato', expect: 'parcelas do contrato da própria empresa continuam carregando' },
  { id: 'cashflow', area: 'caixa', expect: 'entradas pagas da própria empresa permanecem no fluxo' },
  { id: 'manual-payment', area: 'baixa', expect: 'baixa manual continua exigindo a senha do Administrador Principal' },
  { id: 'asaas', area: 'Asaas', expect: 'conciliação por service_role baixa a parcela da cobrança da mesma empresa' },
  { id: 'inter', area: 'Inter', expect: 'webhook com HMAC baixa a parcela vinculada, sem cobrança nova' },
  { id: 'reports', area: 'relatório', expect: 'totais do relatório não incluem a outra empresa' },
];

export function financeRlsHomologBlockReason(
  env: { [key: string]: string | undefined },
): string {
  const target = env.SV_LOTES_FINANCE_RLS_TARGET;
  if (env.SV_LOTES_FINANCE_RLS_HOMOLOG !== '1') return 'NOT_AUTHORIZED';
  if (target === PRODUCTION_PROJECT_REF) return 'PRODUCTION_FORBIDDEN';
  if (target !== DEVELOP_PROJECT_REF) return 'WRONG_TARGET';
  return '';
}
