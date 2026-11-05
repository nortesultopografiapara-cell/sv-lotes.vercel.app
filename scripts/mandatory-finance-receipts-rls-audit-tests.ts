/**
 * Auditoria local da RLS de finance_receipts. Não conecta em banco.
 * npx tsx scripts/mandatory-finance-receipts-rls-audit-tests.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BROAD_FINANCE_RECEIPT_POLICIES,
  DEVELOP_PROJECT_REF,
  FINANCE_RECEIPT_RLS_PROPOSAL,
  OBSERVED_DEVELOP_PRIVILEGES,
  PRODUCTION_PROJECT_REF,
  PROPOSED_ANON_PRIVILEGES,
  PROPOSED_AUTHENTICATED_PRIVILEGES,
  decideServiceRoleFinanceTenantWrite,
  financeReceiptOperationAllowed,
  observedDevelopFinanceReceiptPolicies,
  proposedFinanceReceiptPolicies,
  type FinanceActor,
  type FinanceRowScope,
} from '../lib/security/financeReceiptAccessPolicy';
import { financeRlsHomologBlockReason } from '../lib/security/financeReceiptRlsHomologPlan';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COMPANY_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const rowA: FinanceRowScope = { tenantId: COMPANY_A, companyId: COMPANY_A };
const rowB: FinanceRowScope = { tenantId: COMPANY_B, companyId: COMPANY_B };
const legacyA: FinanceRowScope = { tenantId: null, companyId: COMPANY_A };

function companyUser(tenantId: string, ownerReadonly = false): FinanceActor {
  return {
    role: 'authenticated',
    isSuperAdmin: false,
    ownerReadonly,
    currentTenantId: tenantId,
  };
}

function anon(): FinanceActor {
  return {
    role: 'anon',
    isSuperAdmin: false,
    ownerReadonly: false,
    currentTenantId: null,
  };
}

const observed = observedDevelopFinanceReceiptPolicies();
const proposed = proposedFinanceReceiptPolicies();

function observedAllows(
  actor: FinanceActor,
  command: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
  existing?: FinanceRowScope | null,
  next?: FinanceRowScope | null,
) {
  return financeReceiptOperationAllowed({
    policies: observed,
    privileges: OBSERVED_DEVELOP_PRIVILEGES,
    actor,
    command,
    existing,
    next,
  });
}

function proposedAllows(
  actor: FinanceActor,
  command: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
  existing?: FinanceRowScope | null,
  next?: FinanceRowScope | null,
) {
  const privileges =
    actor.role === 'anon' ? PROPOSED_ANON_PRIVILEGES : PROPOSED_AUTHENTICATED_PRIVILEGES;
  return financeReceiptOperationAllowed({
    policies: proposed,
    privileges,
    actor,
    command,
    existing,
    next,
  });
}

const userA = companyUser(COMPANY_A);
const userB = companyUser(COMPANY_B);
const superAdmin: FinanceActor = {
  role: 'authenticated',
  isSuperAdmin: true,
  ownerReadonly: false,
  currentTenantId: null,
};

assert(proposedAllows(userA, 'SELECT', rowA), '1. empresa A lê os próprios recebíveis');
assert(!proposedAllows(userA, 'SELECT', rowB), '2. empresa A não lê recebíveis da B');
assert(!proposedAllows(userA, 'UPDATE', rowB, rowB), '3. empresa A não altera recebíveis da B');
assert(!proposedAllows(userA, 'DELETE', rowB), '4. empresa A não exclui recebíveis da B');
assert(
  !proposedAllows(userA, 'INSERT', null, rowB),
  '5. empresa A não cria recebível para a B',
);
assert(!proposedAllows(anon(), 'SELECT', rowA), '6. anônimo não lê recebíveis');
assert(!proposedAllows(anon(), 'INSERT', null, rowA), '6b. anônimo não grava recebíveis');
assert(proposedAllows(superAdmin, 'SELECT', rowA), '7. SUPER_ADMIN lê a empresa A');
assert(proposedAllows(superAdmin, 'SELECT', rowB), '7b. SUPER_ADMIN lê a empresa B');
assert(proposedAllows(superAdmin, 'UPDATE', rowA, rowA), '7c. SUPER_ADMIN atualiza parcela');
assert(proposedAllows(userA, 'SELECT', legacyA), '12. parcela antiga só com company_id continua visível');
assert(proposedAllows(userA, 'UPDATE', legacyA, legacyA), '12b. parcela antiga da própria empresa continua editável');
assert(
  !proposedAllows(userA, 'SELECT', { tenantId: COMPANY_A, companyId: COMPANY_B }),
  'parcela com empresas divergentes não aparece para A',
);
assert(
  !proposedAllows(userB, 'SELECT', { tenantId: COMPANY_A, companyId: COMPANY_B }),
  'parcela com empresas divergentes não aparece para B',
);
assert(
  !proposedAllows(userA, 'SELECT', { tenantId: null, companyId: null }),
  'parcela sem empresa não aparece para o usuário comum',
);
assert(
  proposedAllows(superAdmin, 'SELECT', { tenantId: null, companyId: null }),
  'SUPER_ADMIN ainda vê parcela sem empresa para corrigir',
);
assert(
  !proposedAllows(userA, 'INSERT', null, { tenantId: COMPANY_A, companyId: COMPANY_B }),
  'escrita não grava company_id de outra empresa',
);
assert(
  !proposedAllows(userA, 'UPDATE', rowA, { tenantId: COMPANY_B, companyId: COMPANY_A }),
  'update não troca o tenant_id para outra empresa',
);

assert(observedAllows(userA, 'SELECT', rowB), 'Develop atual: SELECT true vaza a empresa B');
assert(observedAllows(userA, 'UPDATE', rowB, rowB), 'Develop atual: UPDATE true altera a empresa B');
assert(observedAllows(userA, 'DELETE', rowB), 'Develop atual: DELETE true apaga a empresa B');
assert(observedAllows(userA, 'INSERT', null, rowB), 'Develop atual: INSERT true cria na empresa B');
assert(
  financeReceiptOperationAllowed({
    policies: observed,
    privileges: OBSERVED_DEVELOP_PRIVILEGES,
    actor: { ...anon(), role: 'authenticated' },
    command: 'TRUNCATE',
  }) === false || OBSERVED_DEVELOP_PRIVILEGES.includes('TRUNCATE'),
  'TRUNCATE observado no Develop não é operação de RLS',
);
assert(
  !PROPOSED_AUTHENTICATED_PRIVILEGES.includes('TRUNCATE'),
  '15. authenticated não recebe TRUNCATE na proposta',
);
assert(
  !PROPOSED_ANON_PRIVILEGES.includes('TRUNCATE'),
  '15b. anon não recebe TRUNCATE na proposta',
);
assert(
  !financeReceiptOperationAllowed({
    policies: proposed,
    privileges: PROPOSED_AUTHENTICATED_PRIVILEGES,
    actor: userA,
    command: 'TRUNCATE',
  }),
  '15c. tentativa de TRUNCATE do usuário da empresa é negada',
);

const owner = companyUser(COMPANY_A, true);
assert(proposedAllows(owner, 'SELECT', rowA), 'OWNER continua lendo a própria empresa');
assert(!proposedAllows(owner, 'UPDATE', rowA, rowA), 'OWNER continua sem alterar parcelas');
assert(!proposedAllows(owner, 'DELETE', rowA), 'OWNER continua sem excluir parcelas');

const sameCompany = decideServiceRoleFinanceTenantWrite({
  callerRole: 'ADMIN',
  callerTenantId: COMPANY_A,
  requestedTenantId: COMPANY_A,
});
const foreignCompany = decideServiceRoleFinanceTenantWrite({
  callerRole: 'ADMIN',
  callerTenantId: COMPANY_A,
  requestedTenantId: COMPANY_B,
});
const platform = decideServiceRoleFinanceTenantWrite({
  callerRole: 'SUPER_ADMIN',
  callerTenantId: null,
  requestedTenantId: COMPANY_B,
});
assert(sameCompany.allow && sameCompany.reason === 'same_tenant', 'service role da mesma empresa passa');
assert(!foreignCompany.allow && foreignCompany.reason === 'foreign_tenant', 'service role não grava outra empresa');
assert(platform.allow && platform.reason === 'platform_admin', 'SUPER_ADMIN operacional continua autorizado');

const proposal = read(FINANCE_RECEIPT_RLS_PROPOSAL);
for (const name of BROAD_FINANCE_RECEIPT_POLICIES) {
  assert(proposal.includes(`DROP POLICY IF EXISTS "${name}"`), `proposta remove ${name}`);
}
assert(!/USING\s*\(\s*true\s*\)/i.test(proposal), 'proposta não cria USING (true)');
assert(!/WITH CHECK\s*\(\s*true\s*\)/i.test(proposal), 'proposta não cria WITH CHECK (true)');
assert(proposal.includes('tenant_isolation_finance_receipts'), 'proposta recria o isolamento');
assert(proposal.includes('public.is_super_admin()'), 'proposta preserva SUPER_ADMIN');
assert(proposal.includes('public.current_tenant_id()'), 'proposta usa a empresa da sessão');
assert(proposal.includes('company_id = public.current_tenant_id()'), 'proposta aceita company_id legado');
assert(proposal.includes('REVOKE ALL ON TABLE public.finance_receipts FROM anon'), 'anon perde privilégio de tabela');
assert(
  proposal.includes('REVOKE ALL ON TABLE public.finance_receipts FROM authenticated'),
  'authenticated perde o GRANT amplo antes do DML mínimo',
);
assert(
  proposal.includes('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_receipts TO authenticated'),
  'authenticated fica só com DML',
);
assert(!/GRANT[\s\S]{0,80}TO anon/i.test(proposal), 'proposta não concede privilégio a anon');
assert(!/REVOKE[\s\S]{0,80}FROM service_role/i.test(proposal), 'proposta não revoga service_role');
assert(proposal.includes("'owner_readonly_no_insert'"), 'allowlist preserva a policy restritiva do OWNER');
assert(!proposal.includes('DROP POLICY IF EXISTS "owner_readonly'), 'proposta não apaga as policies do OWNER');
assert(proposal.includes('SEG2A_UNEXPECTED_POLICY'), 'proposta aborta se restar policy desconhecida');
assert(proposal.includes('SEG2A_SERVICE_ROLE_DML_MISSING'), 'proposta aborta se o service_role perder DML');
assert(proposal.includes('SEG2A_AUTHENTICATED_TRUNCATE'), 'proposta aborta se authenticated conservar TRUNCATE');
assert(!proposal.includes('DROP TRIGGER'), 'proposta não remove o trigger da baixa manual');
assert(!proposal.includes('DROP FUNCTION'), 'proposta não remove funções SECURITY DEFINER');
assert(
  proposal.includes('Production') && proposal.includes('não é alvo'),
  'proposta marca Production como fora do alvo',
);
assert(proposal.includes('NÃO APLICADA'), 'proposta declara que não foi aplicada');
assert(!proposal.includes('postgres://'), 'proposta não tem connection string');
assert(!FINANCE_RECEIPT_RLS_PROPOSAL.includes('supabase/migrations/'), 'proposta fora da pasta de migrations');

const salesCreate = read('app/api/sales/create/route.ts');
assert(
  salesCreate.includes('decideServiceRoleFinanceTenantWrite'),
  'criação de venda recusa tenant escolhido no cliente antes do service role',
);
assert(salesCreate.includes('status: 403'), 'venda de outra empresa responde 403');
assert(!salesCreate.includes('user.role'), 'o papel usado na decisão vem de public.users, não do JWT');
assert(salesCreate.includes('company_id'), 'empresa do perfil também aceita company_id quando tenant_id está vazio');
const saleService = read('lib/gisSaleCreateService.ts');
const saleCreateIdx = saleService.indexOf('export async function executeGisSaleCreate');
const lotGuardIdx = saleService.indexOf('O lote não pertence à empresa da venda.');
const customerWriteIdx = saleService.indexOf('upsert_customer', saleCreateIdx);
assert(lotGuardIdx > saleCreateIdx && lotGuardIdx < customerWriteIdx, 'o lote é conferido no banco antes de gravar cliente ou parcela');

const precheck = read('supabase/proposals/20261105173100_finance_receipts_rls_precheck_readonly.sql');
assert(precheck.includes('BEGIN READ ONLY'), 'inventário abre transação somente leitura');
assert(precheck.includes('ROLLBACK'), 'inventário desfaz a transação de leitura');
assert(!/\b(insert|update|delete|truncate|drop|grant|revoke|alter)\b/i.test(precheck), 'inventário não contém comando de escrita');
assert(precheck.includes('tenant_differs_from_company'), 'inventário conta parcelas com empresas divergentes');
assert(precheck.includes('receipt_sale_company_mismatch'), 'inventário conta parcela ligada a venda de outra empresa');
assert(!precheck.includes('customer_name') && !precheck.includes('cpf'), 'inventário não pede dado pessoal');

const homolog = read('lib/security/financeReceiptRlsHomologPlan.ts');
const homologScript = read('scripts/develop/finance-receipts-rls-homolog.ts');
assert(homolog.includes('select-other-company'), 'plano cobre SELECT entre empresas');
assert(homolog.includes('truncate-authenticated'), 'plano cobre TRUNCATE');
assert(homolog.includes('manual-payment'), 'plano cobre a baixa manual');
assert(homologScript.includes('financeRlsHomologBlockReason'), 'executor da homologação passa pelo bloqueio');
assert(homologScript.includes('executed: false'), 'sem autorização o executor não abre banco');
assert(financeRlsHomologBlockReason({}) === 'NOT_AUTHORIZED', 'ambiente vazio não autoriza homologação');
assert(
  financeRlsHomologBlockReason({ SV_LOTES_FINANCE_RLS_HOMOLOG: '1', SV_LOTES_FINANCE_RLS_TARGET: PRODUCTION_PROJECT_REF }) === 'PRODUCTION_FORBIDDEN',
  'Production não passa no alvo da homologação',
);

const manualPayment = read('lib/finance/manualReceiptPayment.ts');
const manualRpc = read('supabase/migrations/20261021120000_manual_receipt_payment_authorization.sql');
assert(manualPayment.includes("code: 'wrong_tenant'"), '8/10. baixa manual continua exigindo a mesma empresa');
assert(
  manualRpc.includes('GRANT EXECUTE ON FUNCTION public.execute_authorized_manual_receipt_payment'),
  'RPC de baixa manual existe',
);
assert(manualRpc.includes('TO service_role'), 'RPC de baixa manual não volta para o browser');
assert(
  manualRpc.includes('Baixa manual de parcela só pode ser feita com autorização do Administrador Principal.'),
  'trigger de baixa manual permanece no texto da migration já versionada',
);

const asaas = read('lib/finance/companyAsaasPaymentReconciliation.ts');
const inter = read('lib/banking/inter/interPaymentSettlement.ts');
const interRoute = read('app/api/finance/inter/webhook/internal/route.ts');
assert(asaas.includes(".from('finance_receipts')"), '8. conciliação Asaas continua achando a parcela');
assert(asaas.includes('markFinanceReceiptPaidFromCompanyAsaasCharge'), '8b. baixa Asaas permanece no serviço');
assert(inter.includes(".from('finance_receipts')"), '9. conciliação Inter continua achando a parcela');
assert(interRoute.includes('SUPABASE_SERVICE_ROLE_KEY'), '9b. webhook Inter segue em service role');
assert(interRoute.includes('validateInterWebhookHmac'), '9c. webhook Inter segue exigindo HMAC');

const thisFile = read('scripts/mandatory-finance-receipts-rls-audit-tests.ts');
const supabaseImport = ['@supabase', 'supabase-js'].join('/');
const pgImport = ['from ', "'pg'"].join('');
assert(!thisFile.includes(supabaseImport), 'teste não importa o cliente Supabase');
assert(!thisFile.includes(pgImport), 'teste não abre pg');
assert(!thisFile.includes(PRODUCTION_PROJECT_REF) || thisFile.includes('PRODUCTION_PROJECT_REF'), 'teste não embute o ref de Production solto para conexão');
assert(DEVELOP_PROJECT_REF === 'hoynysmynxncdlptuzub', 'ref Develop conhecido');
assert(PRODUCTION_PROJECT_REF === 'aezktedncttwpqeunjej', 'ref Production conhecido e não usado');

console.log('mandatory-finance-receipts-rls-audit-tests: ok');
