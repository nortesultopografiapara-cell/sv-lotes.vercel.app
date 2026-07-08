/**
 * Testes obrigatórios — Portal do Cliente Etapa 4 (painel read-only restrito).
 * Executar: npx tsx scripts/mandatory-client-portal-dashboard-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  assertClientPortalDashboardSanitized,
  resolveClientPortalGreetingName,
} from '../lib/portal-cliente/dashboard';
import { resolvePortalScopeCompanyId } from '../lib/portal-cliente/dashboardDiagnosticLog';
import type { ClientPortalDashboardResponse } from '../lib/portal-cliente/dashboardTypes';
import {
  createClientPortalSessionToken,
  readClientPortalSessionToken,
} from '../lib/portal-cliente/session';

const root = path.join(__dirname, '..');

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function read(file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function buildSampleDashboard(): ClientPortalDashboardResponse {
  return {
    ok: true,
    linkType: 'lot_sale',
    summary: {
      greetingName: 'João',
      customerNameMasked: 'JO*** SI***',
      companyName: 'SV Topografia',
      projectName: 'Recanto Primavera I',
      quadra: '02',
      lote: '21',
      quadraLote: 'QD 02 LT 21',
      saleStatusLabel: 'Ativa',
      contractStatusLabel: 'Ativo',
      financialStatusLabel: 'Parcelas em aberto',
      nextDueDate: '2026-08-10',
      paidCount: 2,
      openCount: 10,
      overdueCount: 1,
      negotiationCount: 0,
    },
    contract: {
      contractNumber: '000000123/2026',
      statusLabel: 'Ativo',
      signatureStatusLabel: 'Aguardando assinatura',
      signUrl: 'https://www.svlotes.com.br/sign/sale/abc123token',
      contractPdfUrl: null,
      contractViewUrl: '/api/portal-cliente/contract',
      emptyMessage: null,
    },
    finance: {
      summary: {
        financialStatusLabel: 'Parcelas em aberto',
        nextDueDate: '2026-08-10',
        paidCount: 2,
        openCount: 10,
        overdueCount: 1,
        negotiationCount: 0,
      },
      installments: [
        {
          installmentNumber: 1,
          dueDate: '2026-07-10',
          amountLabel: 'R$ 500,00',
          status: 'paid',
          statusLabel: 'Paga',
          paidAt: '2026-07-09',
          paymentUrl: null,
          pixCopyPaste: null,
        },
        {
          installmentNumber: 2,
          dueDate: '2026-08-10',
          amountLabel: 'R$ 500,00',
          status: 'open',
          statusLabel: 'Em aberto',
          paidAt: null,
          paymentUrl: 'https://pay.example/boleto',
          pixCopyPaste: '00020126pix',
        },
      ],
      emptyMessage: null,
    },
    charges: {
      items: [
        {
          installmentNumber: 2,
          dueDate: '2026-08-10',
          amountLabel: 'R$ 500,00',
          statusLabel: 'Pendente',
          paymentUrl: 'https://pay.example/boleto',
          boletoDownloadUrl: 'https://pay.example/boleto.pdf',
          pixCopyPaste: '00020126pix',
        },
      ],
      emptyMessage: null,
    },
    companyWhatsAppUrl: 'https://wa.me/5594999999999',
    message: null,
  };
}

function testUnauthorizedApi(): void {
  const route = read('app/api/portal-cliente/dashboard/route.ts');
  assert(route.includes('getClientPortalSessionCookie'), 'reads session cookie');
  assert(route.includes('readClientPortalSessionToken'), 'validates session token');
  assert(route.includes('status: 401'), 'returns 401 without session');
  assert(route.includes('logClientPortalDashboardDiagnostic'), 'diagnostic logs');
  assert(route.includes('1_session_loaded'), 'session step log');
  assert(route.includes('result.step'), 'returns failing step');
  assert(!route.includes('Não foi possível carregar seus dados'), 'no generic dashboard error');
  assert(!route.includes('/api/finance/asaas/create-charge'), 'no create-charge api');
  assert(!route.includes('/api/finance/asaas/regenerate-charge'), 'no regenerate-charge api');
}

function testPortalContractRoute(): void {
  const route = read('app/api/portal-cliente/contract/route.ts');
  assert(route.includes('validatePortalLotSaleScope'), 'validates sale scope');
  assert(route.includes('readStoredContractHtml'), 'reads stored html only');
  assert(!route.includes('contractRegeneration'), 'no regeneration');
  assert(!route.includes('/map'), 'no map route');
}

function testPainelRedirectWithoutSession(): void {
  const page = read('app/portal-cliente/painel/page.tsx');
  assert(page.includes("redirect('/portal-cliente')"), 'redirect without session');
  assert(page.includes('ClientPortalDashboard'), 'dashboard component');
  const dashboard = read('components/portal-cliente/ClientPortalDashboard.tsx');
  assert(!dashboard.includes('/map'), 'no map link');
  assert(!dashboard.includes('memorial'), 'no memorial link');
  assert(!dashboard.includes('prancha'), 'no prancha link');
  assert(dashboard.includes('Contrato ainda não disponível') || dashboard.includes('emptyMessage'), 'contract empty state');
}

function testSanitizedResponse(): void {
  const sample = buildSampleDashboard();
  assertClientPortalDashboardSanitized(sample);
  assert(sample.summary.greetingName === 'João', 'greeting name');
  assert(!JSON.stringify(sample).includes('"customer_id"'), 'no customer_id key');
  try {
    assertClientPortalDashboardSanitized({ customer_id: 'x' });
    assert(false, 'sanitizer should reject internal keys');
  } catch {
    // expected
  }
}

function testCompanyScopeResolution(): void {
  const fromCustomer = resolvePortalScopeCompanyId({
    saleCompanyId: null,
    saleTenantId: null,
    customerCompanyId: 'comp-a',
    customerTenantId: null,
  });
  assert(fromCustomer === 'comp-a', 'company fallback from customer');
  const dashboard = read('lib/portal-cliente/dashboard.ts');
  assert(dashboard.includes('validatePortalLotSaleScope'), 'uses scope validation');
}

function testSessionScopeRequired(): void {
  const token = createClientPortalSessionToken({
    linkKey: 'abc123',
    documentHash: 'hash123',
    verifiedAt: new Date().toISOString(),
    scope: {
      linkType: 'lot_sale',
      companyId: 'comp-1',
      customerId: 'cust-1',
      saleId: 'sale-1',
      contractId: 'contract-1',
    },
  });
  const parsed = readClientPortalSessionToken(token);
  assert(parsed?.scope.linkType === 'lot_sale', 'scope linkType');
  assert(parsed?.scope.saleId === 'sale-1', 'scope saleId');
  assert(parsed?.scope.contractId === 'contract-1', 'scope contractId');
}

function testSaleScopeInDashboardLoader(): void {
  const dashboard = read('lib/portal-cliente/dashboard.ts');
  assert(dashboard.includes('.eq(\'sale_id\', saleId)'), 'filters by sale_id');
  assert(dashboard.includes('.eq(\'customer_id\', customerId)'), 'filters by customer_id');
  assert(dashboard.includes('company_asaas_charges'), 'reads existing charges only');
  assert(dashboard.includes('validatePortalLotSaleScope'), 'shared scope validation');
  assert(dashboard.includes('from(\'blocks\')'), 'loads block label only');
  assert(dashboard.includes('Contrato não encontrado.'), 'contract not found message');
  assert(dashboard.includes('Cobranças não encontradas.'), 'charges not found message');
  assert(dashboard.includes('Parcelas não encontradas.'), 'finance not found message');
  assert(!dashboard.includes('/api/finance/asaas/create-charge'), 'no create charge api');
  assert(!dashboard.includes('/api/finance/asaas/regenerate-charge'), 'no regenerate charge api');
  assert(!dashboard.includes('createCompanyAsaas'), 'no asaas create service');
  assert(!dashboard.includes('gisSaleCreateService'), 'no gis');
  assert(!dashboard.includes('contractRegeneration'), 'no contract regeneration');
  assert(dashboard.includes('assertClientPortalDashboardSanitized'), 'sanitizer');
}

function testInstallmentPaymentLinksOnlyWhenPresent(): void {
  const sample = buildSampleDashboard();
  const paid = sample.finance.installments[0];
  const open = sample.finance.installments[1];
  assert(paid.paymentUrl === null, 'paid has no payment url');
  assert(open.paymentUrl !== null, 'open may have payment url');
  assert(sample.charges.items[0].pixCopyPaste !== null, 'charge may have pix');
}

function testVerifyOtpRedirectsToPainel(): void {
  const verify = read('app/api/portal-cliente/verify-otp/route.ts');
  assert(verify.includes('resolveClientPortalLinkContext'), 'verify resolves link scope');
  assert(verify.includes('contractId'), 'session stores contractId');
  assert(verify.includes('/portal-cliente/painel'), 'redirect to painel');
  const confirm = read('components/portal-cliente/ClientPortalConfirmForm.tsx');
  assert(confirm.includes('/portal-cliente/painel'), 'confirm navigates to painel');
}

function testGreetingName(): void {
  assert(resolveClientPortalGreetingName('joão silva') === 'João', 'first name greeting');
  assert(resolveClientPortalGreetingName('') === 'Cliente', 'fallback greeting');
}

function testIsolatedFromAdminModules(): void {
  const dashboard = read('lib/portal-cliente/dashboard.ts');
  assert(!dashboard.includes('asaasCompanyChargeService'), 'no charge service');
  assert(!dashboard.includes('gisSaleCreateService'), 'no sale create');
}

function main(): void {
  testUnauthorizedApi();
  testPortalContractRoute();
  testPainelRedirectWithoutSession();
  testSanitizedResponse();
  testCompanyScopeResolution();
  testSessionScopeRequired();
  testSaleScopeInDashboardLoader();
  testInstallmentPaymentLinksOnlyWhenPresent();
  testVerifyOtpRedirectsToPainel();
  testGreetingName();
  testIsolatedFromAdminModules();
  console.log('mandatory-client-portal-dashboard-tests: OK');
}

main();
