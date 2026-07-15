/**
 * Testes obrigatórios: seletor de conta financeira no modal de venda.
 *
 * Valida que o componente CustomerLotFormModal carrega contas financeiras
 * via API server-side, sem gate client-side por whitelist Asaas.
 */
import * as fs from 'node:fs';
import {
  assertCompanyFinancialAccountResponseSafe,
  formatFinancialAccountLabel,
  mapCompanyFinancialAccountRow,
  type CompanyFinancialAccountRow,
} from '../lib/finance/companyFinancialAccountTypes';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function testModalNoClientSideGate(): void {
  const modal = read('components/map/CustomerLotFormModal.tsx');

  assert(
    !modal.includes('isCompanyAsaasEnabled'),
    'modal não usa isCompanyAsaasEnabled (gate removido)',
  );
  assert(
    modal.includes("fetch('/api/finance/financial-accounts'"),
    'modal chama API financial-accounts diretamente',
  );
  assert(
    !modal.includes("Promise.resolve({ ok: false } as Response)"),
    'modal não usa Response simulado',
  );
  assert(
    modal.includes("credentials: 'include'"),
    'modal envia credentials na requisição',
  );

  console.log('OK testModalNoClientSideGate');
}

function testModalHandlesApiErrors(): void {
  const modal = read('components/map/CustomerLotFormModal.tsx');

  assert(
    modal.includes('accountsRes.status === 403'),
    'modal trata HTTP 403',
  );
  assert(
    modal.includes('accountsRes.status === 404'),
    'modal trata HTTP 404',
  );
  assert(
    modal.includes('financialAccountsUnavailable'),
    'modal rastreia estado de módulo indisponível',
  );

  console.log('OK testModalHandlesApiErrors');
}

function testModalSelectorStates(): void {
  const modal = read('components/map/CustomerLotFormModal.tsx');

  assert(
    modal.includes('Carregando contas...'),
    'mensagem de loading presente',
  );
  assert(
    modal.includes('Nenhuma conta financeira ativa cadastrada'),
    'mensagem de lista vazia presente',
  );
  assert(
    modal.includes('Módulo financeiro não disponível'),
    'mensagem de módulo indisponível presente',
  );
  assert(
    modal.includes('Selecione a conta'),
    'placeholder de seleção presente',
  );
  assert(
    modal.includes("account.isDefault ? ' · Padrão' : ''"),
    'indicador de conta padrão presente',
  );

  console.log('OK testModalSelectorStates');
}

function testModalDefaultAccountSelection(): void {
  const modal = read('components/map/CustomerLotFormModal.tsx');

  assert(
    modal.includes('accounts.find((account) => account.isDefault)'),
    'modal busca conta padrão',
  );
  assert(
    modal.includes('accounts[0]'),
    'modal usa fallback para primeira conta',
  );
  assert(
    modal.includes('projectAccountId || defaultAccount?.id'),
    'conta do projeto tem prioridade sobre padrão',
  );

  console.log('OK testModalDefaultAccountSelection');
}

function testApiRouteServerSideProtection(): void {
  const route = read('app/api/finance/financial-accounts/route.ts');

  assert(
    route.includes('authorizeCompanyAsaasRoute'),
    'rota GET usa authorizeCompanyAsaasRoute',
  );
  assert(
    route.includes('auth.tenantId'),
    'rota usa tenantId da sessão',
  );
  assert(
    !route.includes('body.companyId') && !route.includes('body.company_id'),
    'rota não aceita company_id do client',
  );
  assert(
    route.includes('assertCompanyFinancialAccountResponseSafe'),
    'rota valida resposta segura',
  );

  const guard = read('lib/banking/bankingRouteGuard.ts');
  assert(
    guard.includes('isCompanyAsaasEnabled'),
    'guard usa whitelist server-side',
  );
  assert(
    guard.includes('status: 403'),
    'guard retorna 403 para empresa não autorizada',
  );

  console.log('OK testApiRouteServerSideProtection');
}

function testNoCredentialsExposed(): void {
  const safeResponse = mapCompanyFinancialAccountRow(
    {
      id: 'acc-1',
      company_id: 'company-1',
      name: 'Conta Teste',
      account_type: 'IMOBILIARIA',
      beneficiary_name: 'Empresa Teste',
      document: null,
      email: null,
      phone: null,
      environment: 'PRODUCTION',
      bank_integration_id: 'int-1',
      is_default: true,
      active: true,
      notes: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    } as CompanyFinancialAccountRow,
    { connectionStatus: 'CONNECTED' },
  );

  assertCompanyFinancialAccountResponseSafe(safeResponse);
  assertCompanyFinancialAccountResponseSafe([safeResponse]);

  const json = JSON.stringify(safeResponse);
  assert(!json.includes('apiKey'), 'sem apiKey');
  assert(!json.includes('encrypted_payload'), 'sem encrypted_payload');
  assert(!json.includes('webhookToken'), 'sem webhookToken');

  console.log('OK testNoCredentialsExposed');
}

function testFormatFinancialAccountLabel(): void {
  assert(
    formatFinancialAccountLabel({
      name: 'Conta Padrão',
      accountType: 'IMOBILIARIA',
      beneficiaryName: 'Meneses Imobiliária',
    }) === 'Conta Padrão (Imobiliária — Meneses Imobiliária)',
    'label com beneficiário diferente do nome',
  );

  assert(
    formatFinancialAccountLabel({
      name: 'Conta Padrão',
      accountType: 'IMOBILIARIA',
      beneficiaryName: 'Conta Padrão',
    }) === 'Conta Padrão (Imobiliária)',
    'label sem duplicar beneficiário igual ao nome',
  );

  assert(
    formatFinancialAccountLabel({
      name: 'Conta SPE',
      accountType: 'SPE',
      beneficiaryName: null,
    }) === 'Conta SPE (SPE)',
    'label sem beneficiário',
  );

  console.log('OK testFormatFinancialAccountLabel');
}

function testTenantIsolation(): void {
  const repo = read('lib/finance/companyFinancialAccountRepository.ts');

  assert(
    repo.includes(".eq('company_id', companyId)"),
    'listCompanyFinancialAccounts filtra por company_id',
  );
  assert(
    repo.includes(".eq('active', true)"),
    'activeOnly filtra contas ativas',
  );
  assert(
    repo.includes("order('is_default', { ascending: false })"),
    'ordena padrão primeiro',
  );

  console.log('OK testTenantIsolation');
}

async function main() {
  testModalNoClientSideGate();
  testModalHandlesApiErrors();
  testModalSelectorStates();
  testModalDefaultAccountSelection();
  testApiRouteServerSideProtection();
  testNoCredentialsExposed();
  testFormatFinancialAccountLabel();
  testTenantIsolation();

  console.log('OK — mandatory sale financial account selector tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
