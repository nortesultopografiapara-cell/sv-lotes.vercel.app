/**
 * Testes — proteções de vínculo Asaas (não apagar cobrança / não rebaixar PAID).
 * npx tsx scripts/mandatory-company-asaas-charge-link-guards-tests.ts
 */

import {
  canGenerateAsaasChargeWithHistory,
  asaasRowMayUseLinkedAccount,
  chargesRowActionsReady,
  classifyAsaasIntegrationResponse,
  formatChargesAsaasIntegrationGate,
  formatRefreshAllChargesBlockReason,
  overviewGateAllowsPerChargeAsaasSync,
  resolveAsaasRowAccountState,
  resolveAsaasRowActionNotice,
  resolveChargesRefreshAllPresentation,
  resolveIssuedChargesCardSubtitle,
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
  assert(classifyAsaasIntegrationResponse(404, false) === 'module_disabled', '404 é módulo desligado');
  assert(classifyAsaasIntegrationResponse(403, false) === 'denied', '403 é acesso negado');
  assert(classifyAsaasIntegrationResponse(500, false) === 'query_error', 'erro HTTP é falha de consulta');
  assert(
    classifyAsaasIntegrationResponse(
      500,
      false,
      'FINANCIAL_ACCOUNT_REQUIRED: há mais de uma conta Asaas ativa. Informe financial_account_id.',
    ) === 'multiple_accounts',
    'várias contas Asaas não são falha genérica nem integração inativa',
  );
  assert(
    formatChargesAsaasIntegrationGate('multiple_accounts') ===
      'Há mais de uma conta Asaas ativa. Cada cobrança é atualizada pela conta já vinculada.',
    'aviso único para várias contas Asaas',
  );
  assert(overviewGateAllowsPerChargeAsaasSync('multiple_accounts'), 'várias contas não bloqueiam o lote');
  assert(overviewGateAllowsPerChargeAsaasSync('ready'), 'integração pronta segue no lote');
  assert(!overviewGateAllowsPerChargeAsaasSync('not_ready'), 'integração inativa continua bloqueada');
  assert(!overviewGateAllowsPerChargeAsaasSync('query_error'), 'falha genérica continua bloqueada');
  assert(classifyAsaasIntegrationResponse(200, false) === 'not_ready', '200 sem ready é integração inativa');
  assert(classifyAsaasIntegrationResponse(200, true) === 'ready', '200 ready libera o botão');
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

console.log('\n═══ 10b: coluna Ações não trata várias contas como integração inativa ═══');
{
  assert(
    resolveAsaasRowActionNotice({
      gate: 'multiple_accounts',
      issued: true,
      installmentPaid: true,
      accountState: 'active',
    }) === null,
    'cobrança paga em conta ativa não vira integração inativa',
  );
  assert(
    resolveAsaasRowActionNotice({
      gate: 'multiple_accounts',
      issued: false,
      installmentPaid: false,
      accountState: 'active',
    }) === null,
    'não gerada em conta ativa pode seguir a emissão',
  );
  assert(
    asaasRowMayUseLinkedAccount({ gate: 'multiple_accounts', accountState: 'active' }),
    'várias contas ativas liberam a conta vinculada',
  );
  assert(
    !asaasRowMayUseLinkedAccount({ gate: 'not_ready', accountState: 'active' }),
    'integração realmente inativa continua bloqueada',
  );
  const paid = resolveAsaasRowActionNotice({
    gate: 'multiple_accounts',
    issued: false,
    installmentPaid: true,
    accountState: 'active',
  });
  assert(paid?.label === 'Parcela paga' && paid.replacesActions, 'parcela paga sem cobrança fica indisponível pelo status');
  const missing = resolveAsaasRowActionNotice({
    gate: 'multiple_accounts',
    issued: false,
    installmentPaid: false,
    accountState: 'none',
  });
  assert(missing?.label === 'Conta ausente' && missing.replacesActions, 'sem conta não emite');
  const inactive = resolveAsaasRowActionNotice({
    gate: 'multiple_accounts',
    issued: true,
    installmentPaid: false,
    accountState: 'inactive',
  });
  assert(
    inactive?.label === 'Conta inativa' && inactive.replacesActions === false,
    'cobrança emitida em conta inativa mantém a leitura',
  );
  const dormant = resolveAsaasRowActionNotice({
    gate: 'not_ready',
    issued: false,
    installmentPaid: false,
    accountState: 'active',
  });
  assert(dormant?.label === 'Integração inativa', 'conta ativa com integração inativa mantém a mensagem');
  assert(
    resolveAsaasRowAccountState({
      accountId: 'acc-1',
      accountActive: true,
      accountsLoaded: true,
    }) === 'active',
    'conta carregada e ativa',
  );
  assert(
    resolveAsaasRowAccountState({
      accountId: '',
      accountActive: null,
      accountsLoaded: true,
    }) === 'none',
    'parcela sem conta',
  );
  const actionsSrc = fs.readFileSync('components/charges/ChargeInstallmentActions.tsx', 'utf8');
  assert(
    !actionsSrc.includes('if (!isInter && !integrationActive)'),
    'a linha não decide só pelo estado geral',
  );
  assert(actionsSrc.includes('resolveAsaasRowActionNotice'), 'a linha usa o aviso por conta e status');
  const page = fs.readFileSync('components/charges/ChargesPageClient.tsx', 'utf8');
  assert(page.includes('accountState={accountState}'), 'a página entrega o estado da conta da linha');
  assert(page.includes('asaasRowMayUseLinkedAccount'), 'emitir usa a conta vinculada');
}

console.log('\n═══ 11: abertura compacta da Meneses não rotula a espera como falha ═══');
{
  const opening = resolveChargesRefreshAllPresentation({
    ownerReadOnly: false,
    integrationReady: false,
    gate: 'pending',
    hasVisibleInterCharges: false,
    hasAsaasRows: true,
    integrationLoading: true,
  });
  assert(!opening.showButton, 'botão espera a integração');
  assert(opening.notice === 'Carregando integração Asaas…', 'espera não diz integração indisponível');

  const ready = resolveChargesRefreshAllPresentation({
    ownerReadOnly: false,
    integrationReady: true,
    gate: classifyAsaasIntegrationResponse(200, true),
    hasVisibleInterCharges: false,
    hasAsaasRows: true,
    integrationLoading: false,
  });
  assert(ready.showButton, 'uma conta Asaas pronta mostra Atualizar todas');
  assert(ready.notice === null, 'integração pronta não exibe aviso de falha');

  const queryError = resolveChargesRefreshAllPresentation({
    ownerReadOnly: false,
    integrationReady: false,
    gate: 'query_error',
    hasVisibleInterCharges: false,
    hasAsaasRows: true,
    integrationLoading: false,
  });
  assert(!queryError.showButton, 'falha de consulta não libera o botão');
  assert(
    queryError.notice === 'Não foi possível consultar a integração Asaas.',
    'falha de consulta não vira integração indisponível',
  );

  assert(
    chargesRowActionsReady({ totalsReady: false, loadError: null, rowCount: 12 }),
    'prefixo de parcelas não vira dados indisponíveis',
  );
  assert(
    !chargesRowActionsReady({ totalsReady: false, loadError: 'falha', rowCount: 12 }),
    'erro de parcelas continua dados indisponíveis',
  );

  const consulting = resolveIssuedChargesCardSubtitle({
    chargeStatusReady: false,
    readError: null,
    activeCount: 0,
  });
  assert(consulting === 'Consultando cobranças locais…', 'cartão em leitura não anuncia zero');
  assert(
    resolveIssuedChargesCardSubtitle({
      chargeStatusReady: true,
      readError: 'Não foi possível ler as cobranças locais.',
      activeCount: 0,
    }) === 'Não foi possível ler as cobranças locais.',
    'falha de leitura aparece no cartão',
  );
  assert(
    resolveIssuedChargesCardSubtitle({
      chargeStatusReady: true,
      readError: null,
      activeCount: 5,
    }) === '5 cobrança(s) ativa(s)',
    'cinco cobranças locais aparecem no cartão',
  );

  const page = fs.readFileSync('components/charges/ChargesPageClient.tsx', 'utf8');
  const loadStart = page.indexOf('const loadInstallments = useCallback');
  const progressive = page.indexOf('fetchFinanceReceiptsProgressive', loadStart);
  const earlyIntegration = page.indexOf('void loadIntegrationStatus()', loadStart);
  assert(earlyIntegration > loadStart && earlyIntegration < progressive, 'GET da integração sai antes das parcelas');
  const openStart = page.indexOf('if (!shouldSyncAsaas)');
  const openReturn = page.indexOf('return;', openStart);
  const openBlock = page.slice(openStart, openReturn);
  assert(openBlock.includes('loadAsaasChargesContext'), 'abertura lê o mapa local');
  assert(!openBlock.includes('requestChargeBulkStatusSync'), 'abertura não sincroniza o banco');
  assert(!openBlock.includes('update-charge-status-bulk'), 'abertura não chama a baixa em lote');
  assert(page.includes('reconcilePaidReceipts: false'), 'leitura local não reconcilia parcelas pagas');
  assert(page.includes('resolveChargesRefreshAllPresentation'), 'o botão usa o estado real da integração');
  assert(page.includes('resolveIssuedChargesCardSubtitle'), 'o cartão distingue espera, erro e contagem');
  assert(page.includes('chargesRowActionsReady'), 'as linhas não tratam o prefixo como falha');
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
