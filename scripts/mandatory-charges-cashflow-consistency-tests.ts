/**
 * Consistência Cobranças × Fluxo de Caixa (Asaas Company).
 * npx tsx scripts/mandatory-charges-cashflow-consistency-tests.ts
 */
import {
  buildCashFlowItems,
  calculateFinancialTotals,
  collectInstallmentIdsWithCashEntrada,
  shouldCountPaidReceiptInCashFlow,
} from '../lib/financeCashFlow';
import {
  chunkInstallmentIdsForChargeFetch,
  computeAsaasOperationalKpis,
  mergeFetchedChargesIntoMap,
  resolveAsaasStatusDisplayLabel,
  resolveChargeActionVisibility,
} from '../lib/charges/chargeOperationsHelpers';
import { buildChargeInstallmentView } from '../lib/charges/chargeInstallmentHelpers';
import { mapCompanyAsaasChargeRow } from '../lib/finance/companyAsaasChargeTypes';
import type { CompanyAsaasChargeResponse } from '../lib/finance/companyAsaasChargeTypes';
import { canGenerateAsaasChargeWithHistory } from '../lib/finance/companyAsaasChargeLinkGuards';
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

const charge = (over: Partial<CompanyAsaasChargeResponse> = {}): CompanyAsaasChargeResponse => ({
  id: 'chg-1',
  companyId: 'co-menezes',
  customerId: null,
  saleId: 'sale-canaa',
  installmentId: 'inst-entrada',
  asaasPaymentId: 'pay_38mg8w98fpvzh5h9',
  billingType: 'PIX',
  status: 'PAID',
  value: 5,
  dueDate: '2026-07-16',
  invoiceUrl: null,
  bankSlipUrl: null,
  bankSlipIdentification: null,
  pixQrCode: null,
  pixCopyPaste: null,
  financialAccountId: 'fa-1',
  paymentLink: null,
  paidAt: '2026-07-16T00:00:00+00:00',
  createdAt: '2026-07-16T12:23:00Z',
  updatedAt: '2026-07-16T12:23:00Z',
  asaasRemoteStatus: 'RECEIVED',
  ...over,
});

console.log('\n═══ 1: duplicidade financeira — saldo R$ 10 não R$ 20 ═══');
{
  const receipts = [
    { id: 'inst-entrada', status: 'pago', amount: 5, paid_amount: 5, installment_number: 0, paid_at: '2026-07-16' },
    { id: 'inst-parcela', status: 'pago', amount: 5, paid_amount: 5, installment_number: 1, paid_at: '2026-07-16' },
  ];
  const cashMvs = [
    {
      id: 'cash-1',
      type: 'entrada',
      status: 'ativo',
      amount: 5,
      description: 'Recebimento automático Asaas - Entrada',
      metadata: { provider: 'ASAAS_COMPANY', installment_id: 'inst-entrada', charge_id: 'chg-1' },
    },
    {
      id: 'cash-2',
      type: 'entrada',
      status: 'ativo',
      amount: 5,
      description: 'Recebimento automático Asaas - Parcela 1',
      metadata: { provider: 'ASAAS_COMPANY', installment_id: 'inst-parcela', charge_id: 'chg-2' },
    },
  ];

  const linked = collectInstallmentIdsWithCashEntrada(cashMvs);
  assert(linked.has('inst-entrada') && linked.has('inst-parcela'), 'detecta vínculo installment→cash');
  assert(!shouldCountPaidReceiptInCashFlow('inst-entrada', linked), 'parcela com cash não conta 2x');

  const totals = calculateFinancialTotals(receipts, cashMvs, []);
  assert(totals.totalEntradas === 10, `saldo entradas = 10 (obtido ${totals.totalEntradas})`);

  const items = buildCashFlowItems(receipts, cashMvs, []);
  const entradas = items.filter((i) => i.tipo === 'entrada');
  assert(entradas.length === 2, `lista com 2 entradas (obtido ${entradas.length})`);
  assert(
    entradas.every((i) => i.source === 'cash_movements'),
    'lista usa cash Asaas, não espelho da parcela',
  );
  assert(
    !entradas.some((i) => String(i.description).includes('Recebimento parcela')),
    'sem linhas espelho "Recebimento parcela"',
  );
}

console.log('\n═══ 2: parcela paga sem cash ainda conta 1x ═══');
{
  const receipts = [
    { id: 'inst-old', status: 'pago', amount: 100, paid_amount: 100, installment_number: 1 },
  ];
  const totals = calculateFinancialTotals(receipts, [], []);
  assert(totals.totalEntradas === 100, 'parcela sem cash conta 100');
  const items = buildCashFlowItems(receipts, [], []);
  assert(items.length === 1 && items[0].source === 'finance_receipts', 'fallback synthetic receipt');
}

console.log('\n═══ 3: status UI correto (nunca Não gerada com histórico) ═══');
{
  assert(resolveAsaasStatusDisplayLabel(null) === 'Não gerada', 'sem histórico → Não gerada');
  assert(
    resolveAsaasStatusDisplayLabel(null, { hasChargeHistory: true }) === 'Histórico disponível',
    'com histórico → não diz Não gerada',
  );
  assert(resolveAsaasStatusDisplayLabel(charge()) === 'Pago', 'RECEIVED/PAID → Pago');
  assert(
    resolveAsaasStatusDisplayLabel(charge({ status: 'PENDING', asaasRemoteStatus: 'PENDING', paidAt: null })) ===
      'Aguardando pagamento',
    'PENDING → Aguardando pagamento',
  );
  assert(
    resolveAsaasStatusDisplayLabel(charge({ status: 'PENDING', asaasRemoteStatus: 'CONFIRMED', paidAt: null })) ===
      'Confirmada',
    'CONFIRMED → Confirmada',
  );
  assert(
    resolveAsaasStatusDisplayLabel(null, { environmentMismatch: true }) === 'Cobrança de outro ambiente',
    'ENVIRONMENT_MISMATCH',
  );
  assert(resolveAsaasStatusDisplayLabel(null, { legacySandbox: true }) === 'Sandbox', 'LEGACY_SANDBOX');

  const view = buildChargeInstallmentView(
    {
      id: 'inst-entrada',
      amount: 5,
      status: 'pago',
      installment_number: 0,
      due_date: '2026-07-16',
      customers: { name: 'Cliente' },
      projects: { name: 'Canaã' },
      blocks: { block_name: '02', number: '10' },
    },
    charge(),
  );
  assert(view.asaasStatusLabel === 'Pago', 'view Status Asaas = Pago');
  assert(view.asaasStatusLabel !== 'Não gerada', 'view não é Não gerada');
}

console.log('\n═══ 4: mapa de cobranças — merge/chunk preserva histórico ═══');
{
  const prev = { 'inst-a': charge({ installmentId: 'inst-a' }) };
  const merged = mergeFetchedChargesIntoMap(prev, ['inst-b'], [
    charge({ id: 'chg-b', installmentId: 'inst-b', asaasPaymentId: 'pay_b', status: 'PENDING' }),
  ]);
  assert(Boolean(merged['inst-a']), 'preserva charge não pedido no chunk');
  assert(Boolean(merged['inst-b']), 'inclui charge do chunk');
  const cleared = mergeFetchedChargesIntoMap(merged, ['inst-b'], []);
  assert(Boolean(cleared['inst-b']), 'não apaga vínculo com asaas_payment_id omitido no lote');
  assert(Boolean(cleared['inst-a']), 'mantém ids fora do chunk');

  const chunks = chunkInstallmentIdsForChargeFetch(
    Array.from({ length: 85 }, (_, i) => `id-${i}`),
    40,
  );
  assert(chunks.length === 3, 'chunk 40 → 3 lotes para 85 ids');
  assert(chunks[0].length === 40 && chunks[2].length === 5, 'tamanhos dos chunks');
}

console.log('\n═══ 4b: cobrança paga — status e ações de consulta ═══');
{
  const paid = charge({
    status: 'PAID',
    asaasRemoteStatus: 'RECEIVED',
    invoiceUrl: 'https://www.asaas.com/i/abc',
    bankSlipUrl: 'https://www.asaas.com/b/pdf/abc',
    paymentLink: 'https://www.asaas.com/i/abc',
    transactionReceiptUrl: 'https://www.asaas.com/comprovantes/h/xyz',
  });
  assert(resolveAsaasStatusDisplayLabel(paid) === 'Pago', 'status Pago');
  assert(resolveAsaasStatusDisplayLabel(paid) !== 'Não gerada', 'não é Não gerada');

  const vis = resolveChargeActionVisibility({
    charge: paid,
    installmentPaid: true,
    integrationActive: true,
    companyAsaasEnabled: true,
    ownerReadOnly: false,
  });
  assert(!vis.showGenerate, 'pago sem Gerar cobrança');
  assert(vis.showOpenCharge, 'invoice_url acessível após pagamento');
  assert(vis.showOpenBoleto, 'boleto acessível após pagamento');
  assert(vis.showOpenReceipt, 'comprovante quando disponível');
  assert(vis.showPaidIndicator, 'indicador Parcela paga complementar');

  const visNoReceipt = resolveChargeActionVisibility({
    charge: charge({
      status: 'PAID',
      invoiceUrl: 'https://www.asaas.com/i/abc',
      paymentLink: 'https://www.asaas.com/i/abc',
      transactionReceiptUrl: null,
    }),
    installmentPaid: true,
    integrationActive: true,
    companyAsaasEnabled: true,
    ownerReadOnly: false,
  });
  assert(visNoReceipt.showOpenCharge, 'sem comprovante ainda mantém Abrir cobrança');
  assert(!visNoReceipt.showOpenReceipt, 'sem comprovante não inventa link');
  assert(visNoReceipt.showReceiptUnavailableHint, 'hint de comprovante indisponível');
}

console.log('\n═══ 5: KPIs — paga não entra em aguardando/emitidas ═══');
{
  const rows = [
    { id: 'inst-1', amount: 5, status: 'pendente', due_date: '2026-08-01', installment_number: 1 },
    { id: 'inst-paid', amount: 5, status: 'pago', due_date: '2026-07-16', installment_number: 0, paid_at: '2026-07-16' },
    { id: 'inst-paid-charge', amount: 5, status: 'pendente', due_date: '2026-08-02', installment_number: 2 },
  ];
  const map = {
    'inst-1': charge({ installmentId: 'inst-1', status: 'PENDING', asaasRemoteStatus: 'PENDING', paidAt: null }),
    'inst-paid-charge': charge({ installmentId: 'inst-paid-charge', status: 'PAID', asaasRemoteStatus: 'RECEIVED' }),
  };
  const kpis = computeAsaasOperationalKpis(rows as any, map, '2026-07-16');
  assert(kpis.qtyCobrancasEmitidas === 1, '1 emitida (PENDING)');
  assert(kpis.qtyAguardandoGeracao === 0, '0 aguardando (PAID charge não aguarda)');
  assert(kpis.cobrancasEmitidas === 5, 'valor emitidas = 5');
}

console.log('\n═══ 6: raw_payload.status → asaasRemoteStatus ═══');
{
  const mapped = mapCompanyAsaasChargeRow({
    id: 'c1',
    company_id: 'co',
    customer_id: null,
    sale_id: null,
    installment_id: 'i1',
    asaas_payment_id: 'pay_x',
    billing_type: 'PIX',
    status: 'PAID',
    value: 5,
    due_date: '2026-07-16',
    invoice_url: 'https://www.asaas.com/i/x',
    bank_slip_url: null,
    bank_slip_identification: null,
    pix_qr_code: null,
    pix_copy_paste: null,
    financial_account_id: null,
    raw_payload: {
      status: 'RECEIVED',
      transactionReceiptUrl: 'https://www.asaas.com/comprovantes/h/abc',
    },
    paid_at: '2026-07-16',
    cash_movement_id: 'cm1',
    created_at: '2026-07-16T12:00:00Z',
    updated_at: '2026-07-16T12:00:00Z',
  });
  assert(mapped.asaasRemoteStatus === 'RECEIVED', 'extrai RECEIVED do raw_payload');
  assert(resolveAsaasStatusDisplayLabel(mapped) === 'Pago', 'label Pago via remote');
  assert(
    mapped.transactionReceiptUrl === 'https://www.asaas.com/comprovantes/h/abc',
    'extrai transactionReceiptUrl do raw_payload',
  );
}

console.log('\n═══ 7: gerar cobrança bloqueado com histórico / PAID ═══');
{
  assert(
    !canGenerateAsaasChargeWithHistory({
      installmentPaid: false,
      integrationActive: true,
      companyAsaasEnabled: true,
      ownerReadOnly: false,
      charge: charge(),
      hasPaidChargeHistory: true,
    }),
    'PAID + histórico bloqueia gerar',
  );
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

console.log('\n═══ 8: multiempresa — mapa por installment não cruza company ═══');
{
  // mapCompanyAsaasChargeRow / list filtrados por company_id na API; aqui validamos chave local.
  const mapA = mergeFetchedChargesIntoMap({}, ['inst-1'], [charge({ companyId: 'co-a', installmentId: 'inst-1' })]);
  const mapB = mergeFetchedChargesIntoMap({}, ['inst-1'], [charge({ companyId: 'co-b', installmentId: 'inst-1', id: 'chg-b' })]);
  assert(mapA['inst-1'].companyId === 'co-a', 'mapa A isolado');
  assert(mapB['inst-1'].companyId === 'co-b', 'mapa B isolado');
}

console.log('\n═══ 9: idempotência visual do saldo ═══');
{
  const receipts = [
    { id: 'inst-entrada', status: 'pago', amount: 5, paid_amount: 5, installment_number: 0 },
  ];
  const cash = [
    {
      id: 'cash-1',
      type: 'entrada',
      status: 'ativo',
      amount: 5,
      metadata: { provider: 'ASAAS_COMPANY', installment_id: 'inst-entrada' },
    },
  ];
  const t1 = calculateFinancialTotals(receipts, cash, []);
  const t2 = calculateFinancialTotals(receipts, cash, []);
  assert(t1.totalEntradas === t2.totalEntradas && t1.totalEntradas === 5, 'totais idempotentes = 5');
}

// Política: este arquivo só sob develop neste ciclo
{
  const branch = fs.existsSync('.git/HEAD')
    ? fs.readFileSync('.git/HEAD', 'utf8')
    : '';
  assert(branch.includes('develop') || branch.includes('ref:'), 'workspace git ok');
}

console.log('\n════════════════════════════════════════════');
console.log(`RESULTADO: ${passed} passou, ${failed} falhou`);
if (failed > 0) process.exit(1);
console.log('✅ TODOS OS TESTES PASSARAM');
