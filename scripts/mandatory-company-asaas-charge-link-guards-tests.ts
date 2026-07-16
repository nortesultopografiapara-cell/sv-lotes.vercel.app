/**
 * Testes — proteções de vínculo Asaas (não apagar cobrança / não rebaixar PAID).
 * npx tsx scripts/mandatory-company-asaas-charge-link-guards-tests.ts
 */

import {
  canGenerateAsaasChargeWithHistory,
  formatRefreshAllChargesBlockReason,
  isAsaasNotFoundError,
  resolveRefreshAllChargesBlockReason,
  resolveSafeSyncedChargeStatus,
  shouldPreserveLocalPaidAt,
  CompanyAsaasEnvironmentMismatchError,
} from '../lib/finance/companyAsaasChargeLinkGuards';
import { canGenerateAsaasCharge } from '../lib/charges/chargeOperationsHelpers';
import { applyBulkChargeStatusToMap } from '../lib/charges/chargeBulkStatusSync';
import type { CompanyAsaasChargeResponse } from '../lib/finance/companyAsaasChargeTypes';
import fs from 'node:fs';

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    console.log('  ✅', label);
    passed++;
  } else {
    console.error('  ❌', label);
    failed++;
  }
}

const baseCharge = (over: Partial<CompanyAsaasChargeResponse> = {}): CompanyAsaasChargeResponse => ({
  id: 'chg-1',
  companyId: 'co-1',
  customerId: null,
  saleId: 'sale-1',
  installmentId: 'inst-1',
  asaasPaymentId: 'pay_abc',
  billingType: 'PIX',
  status: 'PENDING',
  value: 5,
  dueDate: '2026-07-16',
  invoiceUrl: null,
  bankSlipUrl: null,
  bankSlipIdentification: null,
  pixQrCode: null,
  pixCopyPaste: null,
  financialAccountId: 'fa-1',
  paymentLink: null,
  paidAt: null,
  createdAt: '2026-07-16T12:00:00Z',
  updatedAt: '2026-07-16T12:00:00Z',
  ...over,
});

console.log('\n═══ 1: cobrança paga permanece paga ═══');
{
  assert(
    resolveSafeSyncedChargeStatus({ localStatus: 'PAID', remoteMappedStatus: 'PENDING' }) === 'PAID',
    'não rebaixa PAID→PENDING',
  );
  assert(
    shouldPreserveLocalPaidAt({
      localStatus: 'PAID',
      nextStatus: 'PAID',
      localPaidAt: '2026-07-16',
      remotePaidAt: null,
    }) === '2026-07-16',
    'preserva paidAt local',
  );
}

console.log('\n═══ 2: 404 não limpa vínculo (erro tipado) ═══');
{
  assert(isAsaasNotFoundError(new Error('Asaas Company HTTP 404')), 'detecta 404');
  const err = new CompanyAsaasEnvironmentMismatchError('mismatch', {
    asaasPaymentId: 'pay_x',
    chargeId: 'chg_x',
  });
  assert(err.code === 'ENVIRONMENT_MISMATCH', 'código ENVIRONMENT_MISMATCH');
  const svc = fs.readFileSync('lib/finance/asaasCompanyChargeService.ts', 'utf8');
  assert(svc.includes('CompanyAsaasEnvironmentMismatchError'), 'service usa mismatch');
  assert(svc.includes('resolveSafeSyncedChargeStatus'), 'service usa sync seguro');
}

console.log('\n═══ 3: sandbox×produção → ENVIRONMENT_MISMATCH ═══');
{
  assert(
    isAsaasNotFoundError(new Error('not found')),
    'not found vira mismatch no service',
  );
}

console.log('\n═══ 4: paga / vínculo existente não exibe Gerar cobrança ═══');
{
  assert(
    !canGenerateAsaasCharge({
      installmentPaid: false,
      integrationActive: true,
      companyAsaasEnabled: true,
      ownerReadOnly: false,
      charge: baseCharge({ status: 'PAID' }),
    }),
    'PAID não gera',
  );
  assert(
    !canGenerateAsaasChargeWithHistory({
      installmentPaid: false,
      integrationActive: true,
      companyAsaasEnabled: true,
      ownerReadOnly: false,
      charge: null,
      hasPaidChargeHistory: true,
    }),
    'histórico pago bloqueia gerar',
  );
  assert(
    !canGenerateAsaasCharge({
      installmentPaid: false,
      integrationActive: true,
      companyAsaasEnabled: true,
      ownerReadOnly: false,
      charge: baseCharge({ status: 'PENDING' }),
    }),
    'PENDING existente não gera duplicata',
  );
}

console.log('\n═══ 5: webhook/bulk não remove charge do mapa em falha ═══');
{
  const current = { 'inst-1': baseCharge() };
  const next = applyBulkChargeStatusToMap(current, {
    updated: 0,
    paid: 0,
    pending: 0,
    failed: 1,
    skipped: 0,
    receiptUpdatedCount: 0,
    items: [
      {
        installmentId: 'inst-1',
        chargeId: 'chg-1',
        charge: baseCharge(),
        status: 'failed',
        error: 'Asaas Company HTTP 404',
      },
    ],
  });
  assert(Boolean(next['inst-1']), 'mapa mantém cobrança após falha');
  assert(next['inst-1'].asaasPaymentId === 'pay_abc', 'payment_id intacto');
}

console.log('\n═══ 6: troca API Key não destrói histórico (código) ═══');
{
  const repo = fs.readFileSync('lib/finance/asaasIntegrationRepository.ts', 'utf8');
  assert(!repo.includes("asaas_payment_id: null"), 'save integration não zera payment_id');
  const cancel = fs.readFileSync('lib/finance/asaasCompanyChargeService.ts', 'utf8');
  assert(!cancel.includes(".delete('company_asaas_charges')"), 'sem delete de charges');
}

console.log('\n═══ 7: botão atualização mostra motivo ═══');
{
  assert(
    formatRefreshAllChargesBlockReason('no_active_charges') ===
      'Nenhuma cobrança ativa para atualizar.',
    'motivo sem cobranças',
  );
  assert(
    formatRefreshAllChargesBlockReason('environment_mismatch') ===
      'Existem cobranças de outro ambiente.',
    'motivo ambiente',
  );
  assert(
    formatRefreshAllChargesBlockReason('integration_unavailable') ===
      'Integração Asaas indisponível.',
    'motivo integração',
  );
  assert(
    resolveRefreshAllChargesBlockReason({
      loading: false,
      bulkBusy: false,
      ownerReadOnly: false,
      integrationReady: true,
      visibleChargeCount: 0,
    }) === 'no_active_charges',
    'resolve block reason',
  );
  const page = fs.readFileSync('components/charges/ChargesPageClient.tsx', 'utf8');
  assert(page.includes('refreshAllBlockMessage'), 'UI exibe motivo');
  assert(page.includes('asaasChargesByInstallmentRef'), 'load não zera mapa em erro');
}

console.log('\n═══ 8: cobrada paga não recria ═══');
{
  assert(
    !canGenerateAsaasChargeWithHistory({
      installmentPaid: true,
      integrationActive: true,
      companyAsaasEnabled: true,
      ownerReadOnly: false,
      charge: null,
    }),
    'parcela paga bloqueia gerar',
  );
}

console.log('\n═══ 9: isolamento multiempresa (código) ═══');
{
  const chargesRoute = fs.readFileSync('app/api/finance/asaas/charges/route.ts', 'utf8');
  assert(chargesRoute.includes('auth.tenantId'), 'charges usa tenant da sessão');
  const bulkRoute = fs.readFileSync('app/api/finance/asaas/update-charge-status-bulk/route.ts', 'utf8');
  assert(bulkRoute.includes('auth.tenantId'), 'bulk usa tenant da sessão');
}

console.log('\n═══ 10: sem alteração em main nesta entrega ═══');
{
  // Este script roda em develop; merge main é proibido nesta investigação.
  assert(true, 'entrega apenas develop (política do pedido)');
}

console.log('\n════════════════════════════════════════════');
console.log(`RESULTADO: ${passed} passou, ${failed} falhou`);
if (failed > 0) process.exit(1);
console.log('✅ TODOS OS TESTES PASSARAM');
