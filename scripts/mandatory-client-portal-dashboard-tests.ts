/**
 * Testes obrigatórios — Portal do Cliente Etapa 4 (painel read-only).
 * Executar: npx tsx scripts/mandatory-client-portal-dashboard-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  assertClientPortalDashboardSanitized,
  resolveClientPortalGreetingName,
} from '../lib/portal-cliente/dashboard';
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
      contractStatusLabel: 'Ativo',
      financialStatusLabel: 'Parcelas em aberto',
      nextDueDate: '2026-08-10',
      paidCount: 2,
      openCount: 10,
      overdueCount: 1,
    },
    contract: {
      contractNumber: '000000123/2026',
      statusLabel: 'Ativo',
      signatureStatusLabel: 'Aguardando assinatura',
      signUrl: 'https://www.svlotes.com.br/sign/sale/abc123token',
      contractPdfUrl: null,
      validationUrl: null,
    },
    finance: {
      summary: {
        financialStatusLabel: 'Parcelas em aberto',
        nextDueDate: '2026-08-10',
        paidCount: 2,
        openCount: 10,
        overdueCount: 1,
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
  assert(!route.includes('/api/finance/asaas/create-charge'), 'no create-charge api');
  assert(!route.includes('/api/finance/asaas/regenerate-charge'), 'no regenerate-charge api');
}

function testPainelRedirectWithoutSession(): void {
  const page = read('app/portal-cliente/painel/page.tsx');
  assert(page.includes("redirect('/portal-cliente')"), 'redirect without session');
  assert(page.includes('ClientPortalDashboard'), 'dashboard component');
}

function testSanitizedResponse(): void {
  const sample = buildSampleDashboard();
  assertClientPortalDashboardSanitized(sample);
  assert(sample.summary.greetingName === 'João', 'greeting name');
  assert(!JSON.stringify(sample).includes('customer_id'), 'no customer_id key');
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
    },
  });
  const parsed = readClientPortalSessionToken(token);
  assert(parsed?.scope.linkType === 'lot_sale', 'scope linkType');
  assert(parsed?.scope.saleId === 'sale-1', 'scope saleId');
}

function testSaleScopeInDashboardLoader(): void {
  const dashboard = read('lib/portal-cliente/dashboard.ts');
  assert(dashboard.includes('.eq(\'sale_id\', saleId)'), 'filters by sale_id');
  assert(dashboard.includes('.eq(\'customer_id\', customerId)'), 'filters by customer_id');
  assert(dashboard.includes('company_asaas_charges'), 'reads existing charges only');
  assert(!dashboard.includes('/api/finance/asaas/create-charge'), 'no create charge api');
  assert(!dashboard.includes('/api/finance/asaas/regenerate-charge'), 'no regenerate charge api');
  assert(!dashboard.includes('createCompanyAsaas'), 'no asaas create service');
  assert(dashboard.includes('assertClientPortalDashboardSanitized'), 'sanitizer');
}

function testInstallmentPaymentLinksOnlyWhenPresent(): void {
  const sample = buildSampleDashboard();
  const paid = sample.finance!.installments[0];
  const open = sample.finance!.installments[1];
  assert(paid.paymentUrl === null, 'paid has no payment url');
  assert(open.paymentUrl !== null, 'open may have payment url');
  assert(open.pixCopyPaste !== null, 'open may have pix');
}

function testVerifyOtpRedirectsToPainel(): void {
  const verify = read('app/api/portal-cliente/verify-otp/route.ts');
  assert(verify.includes('resolveClientPortalLinkContext'), 'verify resolves link scope');
  assert(verify.includes('scope:'), 'session stores scope');
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
  assert(!dashboard.includes('contractRegeneration'), 'no contract regeneration');
  assert(!dashboard.includes('asaasCompanyChargeService'), 'no charge service');
  assert(!dashboard.includes('gisSaleCreateService'), 'no sale create');
}

function main(): void {
  testUnauthorizedApi();
  testPainelRedirectWithoutSession();
  testSanitizedResponse();
  testSessionScopeRequired();
  testSaleScopeInDashboardLoader();
  testInstallmentPaymentLinksOnlyWhenPresent();
  testVerifyOtpRedirectsToPainel();
  testGreetingName();
  testIsolatedFromAdminModules();
  console.log('mandatory-client-portal-dashboard-tests: OK');
}

main();
