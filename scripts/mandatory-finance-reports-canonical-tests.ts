/**
 * Dataset canônico dos relatórios financeiros.
 * npx tsx scripts/mandatory-finance-reports-canonical-tests.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCanonicalFinanceReport } from '../lib/finance/reports/canonicalFinanceDataset';
import { getCanonicalFinanceTotals } from '../lib/finance/reports/financeReportFormat';
import {
  DEFAULT_REPORT_FILTERS,
  SEVERINO_CLIENT,
  SEVERINO_CONTRACT,
  SEVERINO_IDS,
  SEVERINO_PROJECT,
  SEVERINO_TODAY,
  buildSeverinoCanonicalInput,
  buildSeverinoSplitView,
} from '../lib/finance/reports/severinoCanonicalFixture';
import type { CanonicalFinanceReportInput } from '../lib/finance/reports/canonicalFinanceTypes';
import { excelPresentationTotals } from '../lib/finance/reports/renderFinanceReportExcel';
import { estimateShareAmount } from '../lib/finance/revenueSplit/shareFormat';
import { formatReportSharePercent } from '../lib/finance/reports/splitForReport';
import {
  formatFinancePdfSplitLegLine,
  formatSplitBeneficiaryLabel,
  formatSplitSharePercentLabel,
} from '../lib/finance/reports/splitPresentation';

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

function almost(a: number, b: number, eps = 0.009): boolean {
  return Math.abs(a - b) < eps;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function baseInput(over: Partial<CanonicalFinanceReportInput> = {}): CanonicalFinanceReportInput {
  const seed = buildSeverinoCanonicalInput();
  return {
    ...seed,
    ...over,
    filters: { ...seed.filters, ...(over.filters || {}) },
    splitViews: over.splitViews !== undefined ? over.splitViews : seed.splitViews,
    receipts: over.receipts !== undefined ? over.receipts : seed.receipts,
    cashMovements: over.cashMovements !== undefined ? over.cashMovements : seed.cashMovements,
  };
}

console.log('\n═══ wiring: blocks saiu do Financeiro Resumido ═══');
{
  const page = readFileSync(join(process.cwd(), 'app/finance/page.tsx'), 'utf8');
  const dataset = readFileSync(
    join(process.cwd(), 'lib/finance/reports/canonicalFinanceDataset.ts'),
    'utf8',
  );
  assert(page.includes('buildCanonicalFinanceReport'), 'page usa dataset canônico');
  assert(page.includes('downloadFinanceResumidoPdf'), 'PDF resumido canônico');
  assert(page.includes('downloadFinanceCompletoPdf'), 'PDF completo canônico');
  assert(page.includes('downloadFinanceResumidoExcel'), 'Excel resumido canônico');
  assert(page.includes('downloadFinanceCompletoExcel'), 'Excel completo canônico');
  assert(page.includes('handleExportResumidoPDF'), 'handler PDF Res. preservado');
  assert(page.includes('handleExportPDF'), 'handler PDF Compl. preservado');
  assert(!page.includes('prepareResumidoData'), 'prepareResumidoData removido');
  assert(!page.includes('statusLote'), 'statusLote/DISPONÍVEL removido do finance page');
  assert(!dataset.includes('fetchAllEnterpriseLotRows'), 'dataset não lê blocks/lotes');
  assert(!dataset.includes('DISPONÍVEL'), 'dataset não lista disponibilidade');
  assert(page.includes('ChargeRevenueSplitDistribution'), 'tela Parcelas intacta');
  assert(page.includes('PaymentTableRow'), 'tabela Parcelas intacta');
  const premiumUi = readFileSync(
    join(process.cwd(), 'components/finance/FinancePremiumUI.tsx'),
    'utf8',
  );
  const splitUi = readFileSync(
    join(process.cwd(), 'components/finance/ChargeRevenueSplitDistribution.tsx'),
    'utf8',
  );
  assert(
    premiumUi.includes('ChargeRevenueSplitDistribution'),
    'PaymentTableRow renderiza Distribuição do Recebimento',
  );
  assert(
    premiumUi.includes('isPaid && resolvePaymentSaleId(p)'),
    'quadro de split permanece na parcela paga',
  );
  assert(splitUi.includes('Distribuição do Recebimento'), 'título operacional de split');
  assert(splitUi.includes('Beneficiário'), 'coluna Beneficiário');
  assert(splitUi.includes('Percentual'), 'coluna Percentual');
  assert(splitUi.includes('Situação'), 'coluna Situação');
  assert(splitUi.includes('>Valor<') || splitUi.includes('>Valor</th>'), 'coluna Valor');
  assert(splitUi.includes('Status do Split'), 'status do split visível');
}

console.log('\n═══ cenário Severino — receita 33,34 não vira 66,68 ═══');
{
  const report = buildCanonicalFinanceReport(baseInput());
  const parcela = report.wallet.movements.find((m) => m.id === SEVERINO_IDS.PARCELA_ID);
  const entrada = report.wallet.movements.find((m) => m.id === SEVERINO_IDS.ENTRADA_ID);
  assert(Boolean(parcela), 'parcela presente');
  assert(Boolean(entrada), 'entrada presente');
  assert(parcela?.contractNumber === SEVERINO_CONTRACT, 'contrato 000000007/2026');
  assert(parcela?.clientName === SEVERINO_CLIENT, 'cliente Severino');
  assert(parcela?.projectName === SEVERINO_PROJECT, 'empreendimento Araguaia');
  assert(parcela?.blockName === '02' && parcela?.lotNumber === '41', 'QD 02 LT 41');
  assert(parcela?.paidAmount === 33.34, 'receita da parcela = 33,34');
  const destSum = round((parcela?.split || []).reduce((s, l) => s + l.amount, 0));
  assert(destSum === 33.34, `destinos da parcela somam 33,34 (obtido ${destSum})`);
  assert(destSum !== 66.68, 'destinos não duplicam a receita');
  assert((parcela?.split || []).length === 2, 'duas pernas');
  assert(
    (parcela?.split || []).every((l) => l.amount === 16.67),
    'pernas 16,67 + 16,67',
  );
  assert(
    (parcela?.split || []).every((l) => l.amountKind === 'estimated'),
    'sem net_amount → Previsto/Estimado',
  );
  assert(entrada?.installmentLabel === 'Entrada', 'installment_number 0 = Entrada');
  assert(report.wallet.receivedInPeriod === 66.67, 'recebido = 33,33 + 33,34');
  assert(
    almost(report.destinations.total, report.wallet.receivedInPeriod),
    `destinos ${report.destinations.total} reconciliam com recebido ${report.wallet.receivedInPeriod}`,
  );
  assert(
    !report.wallet.movements.some((m) => String(m.statusLabel).includes('DISPONÍVEL')),
    'nenhum lote disponível na carteira',
  );
  const pdfTotals = getCanonicalFinanceTotals(report);
  const excelTotals = excelPresentationTotals(report);
  assert(
    JSON.stringify(pdfTotals) === JSON.stringify(excelTotals),
    'PDF/Excel compartilham os mesmos totais',
  );
}

console.log('\n═══ A) pagamento sem split ═══');
{
  const report = buildCanonicalFinanceReport(
    baseInput({
      splitViews: {},
      receipts: [
        {
          id: 'r-nosplit',
          sale_id: 'sale-x',
          installment_number: 1,
          amount: 100,
          paid_amount: 100,
          status: 'pago',
          due_date: '2026-09-10',
          paid_at: '2026-09-10T12:00:00.000Z',
          financial_account_id: 'fa-admin',
          customers: { name: 'Cliente Sem Split', document: '000' },
          projects: { name: SEVERINO_PROJECT },
          blocks: { block_name: '01', number: '01' },
          sales: { id: 'sale-x', contracts: [{ contract_number: '000000001/2026' }] },
        },
      ],
      cashMovements: [],
    }),
  );
  const row = report.wallet.movements[0];
  assert(row.paidAmount === 100, 'receita 100');
  assert(row.hasSplit === false, 'sem split');
  assert(row.split.length === 0, 'nenhuma perna');
  assert(report.destinations.rows.length === 1, 'um destino = conta');
  assert(report.destinations.rows[0].amount === 100, 'destino = valor pago');
  assert(report.destinations.rows[0].amountKind === 'account', 'natureza conta financeira');
}

console.log('\n═══ B) split 50/50 ═══');
{
  const report = buildCanonicalFinanceReport(baseInput());
  const parcela = report.wallet.movements.find((m) => m.id === SEVERINO_IDS.PARCELA_ID)!;
  assert(parcela.split[0].sharePercent === 50 && parcela.split[1].sharePercent === 50, '50/50');
}

console.log('\n═══ C) split 3+ participantes ═══');
{
  const view = buildSeverinoSplitView({
    participants: [
      { id: 'a', displayName: 'A', sharePercent: 40, isIssuerRemainder: true, financialAccountId: 'fa-admin' },
      { id: 'b', displayName: 'B', sharePercent: 30, isIssuerRemainder: false, financialAccountId: 'fa-ana' },
      { id: 'c', displayName: 'C', sharePercent: 30, isIssuerRemainder: false, financialAccountId: 'fa-c' },
    ],
    legs: [
      {
        installmentId: SEVERINO_IDS.PARCELA_ID,
        displayName: 'A',
        sharePercent: 40,
        isIssuerRemainder: true,
        grossAmountEstimate: estimateShareAmount(33.34, 40),
        netAmount: null,
        status: 'SETTLED',
      },
      {
        installmentId: SEVERINO_IDS.PARCELA_ID,
        displayName: 'B',
        sharePercent: 30,
        grossAmountEstimate: estimateShareAmount(33.34, 30),
        netAmount: null,
        status: 'SETTLED',
      },
      {
        installmentId: SEVERINO_IDS.PARCELA_ID,
        displayName: 'C',
        sharePercent: 30,
        grossAmountEstimate: estimateShareAmount(33.34, 30),
        netAmount: null,
        status: 'SETTLED',
      },
    ],
  });
  const report = buildCanonicalFinanceReport(
    baseInput({ splitViews: { [SEVERINO_IDS.SALE_ID]: view } }),
  );
  const parcela = report.wallet.movements.find((m) => m.id === SEVERINO_IDS.PARCELA_ID)!;
  assert(parcela.split.length === 3, '3 pernas');
  const sum = round(parcela.split.reduce((s, l) => s + l.amount, 0));
  assert(almost(sum, 33.34), `soma 3 pernas reconcilia 33,34 (obtido ${sum})`);
  assert(parcela.paidAmount === 33.34, 'receita permanece 33,34');
}

console.log('\n═══ D) parcela pendente ═══');
{
  const report = buildCanonicalFinanceReport(
    baseInput({
      receipts: [
        {
          id: 'pend',
          sale_id: SEVERINO_IDS.SALE_ID,
          installment_number: 2,
          amount: 80,
          status: 'pendente',
          due_date: '2026-09-20',
          paid_at: null,
          financial_account_id: 'fa-admin',
          customers: { name: SEVERINO_CLIENT },
          projects: { name: SEVERINO_PROJECT },
          blocks: { block_name: '02', number: '41' },
          sales: {
            id: SEVERINO_IDS.SALE_ID,
            installments_count: 2,
            contracts: [{ contract_number: SEVERINO_CONTRACT }],
          },
        },
      ],
      cashMovements: [],
    }),
  );
  assert(report.wallet.toReceive === 80, 'a receber 80');
  assert(report.wallet.qtyPending === 1, '1 pendente');
  assert(report.wallet.receivedInPeriod === 0, 'nada recebido');
  assert(report.wallet.movements[0].statusLabel === 'Pendente', 'status pendente');
}

console.log('\n═══ E) parcela vencida ═══');
{
  const report = buildCanonicalFinanceReport(
    baseInput({
      receipts: [
        {
          id: 'late',
          sale_id: SEVERINO_IDS.SALE_ID,
          installment_number: 2,
          amount: 90,
          status: 'pendente',
          due_date: '2026-09-01',
          paid_at: null,
          financial_account_id: 'fa-admin',
          customers: { name: SEVERINO_CLIENT },
          projects: { name: SEVERINO_PROJECT },
          blocks: { block_name: '02', number: '41' },
          sales: { id: SEVERINO_IDS.SALE_ID, contracts: [{ contract_number: SEVERINO_CONTRACT }] },
        },
      ],
      cashMovements: [],
      todayIso: SEVERINO_TODAY,
    }),
  );
  assert(report.wallet.overdue === 90, 'vencido 90');
  assert(report.wallet.qtyOverdue === 1, '1 vencida');
  assert(report.wallet.movements[0].statusLabel === 'Vencido', 'status vencido');
}

console.log('\n═══ F) entrada installment_number=0 ═══');
{
  const report = buildCanonicalFinanceReport(baseInput());
  const entrada = report.wallet.movements.find((m) => m.installmentNumber === 0);
  assert(entrada?.installmentLabel === 'Entrada', 'rótulo Entrada');
}

console.log('\n═══ G) saída manual ═══');
{
  const report = buildCanonicalFinanceReport(baseInput());
  const saida = report.cash.movements.find((m) => m.tipo === 'saida');
  assert(Boolean(saida), 'saída presente no caixa');
  assert(saida?.amount === 14, 'saída 14');
  assert(report.cash.outflows === 14, 'total saídas 14');
  assert(
    report.cash.outflowsByCategory.some(
      (c) => c.category === 'Despesas administrativas' && c.amount === 14,
    ),
    'categoria administrativa',
  );
  assert(report.cash.inflows === 66.67, 'caixa entradas = recebimentos (sem duplicar split)');
  assert(report.wallet.receivedInPeriod === 66.67, 'carteira recebida 66,67 ≠ saídas');
}

console.log('\n═══ H) pagamento Asaas ═══');
{
  const report = buildCanonicalFinanceReport(baseInput());
  const parcela = report.wallet.movements.find((m) => m.id === SEVERINO_IDS.PARCELA_ID)!;
  assert(parcela.chargeProvider === 'ASAAS', 'provider Asaas');
  assert(parcela.paidAmount === 33.34, 'Asaas não duplica split na receita');
  assert(Boolean(parcela.paidAtLabel && parcela.paidAtLabel !== '—'), 'data/hora de paid_at');
}

console.log('\n═══ I) pagamento Inter — fee não vira receita ═══');
{
  const report = buildCanonicalFinanceReport(
    baseInput({
      chargeHints: {
        [SEVERINO_IDS.PARCELA_ID]: { provider: 'INTER', feeAmount: 1.11 },
        [SEVERINO_IDS.ENTRADA_ID]: { provider: 'INTER', feeAmount: 0.5 },
      },
    }),
  );
  const parcela = report.wallet.movements.find((m) => m.id === SEVERINO_IDS.PARCELA_ID)!;
  assert(parcela.chargeProvider === 'INTER', 'provider Inter');
  assert(parcela.gatewayFeeAmount === 1.11, 'fee persistida disponível');
  assert(parcela.paidAmount === 33.34, 'fee NÃO soma na receita');
  assert(report.wallet.receivedInPeriod === 66.67, 'recebido ignora fee');
}

console.log('\n═══ net_amount persistido = Liquidado ═══');
{
  const view = buildSeverinoSplitView();
  view.legs = view.legs.map((leg) => ({ ...leg, netAmount: 16.67, grossAmountEstimate: 16.67 }));
  const report = buildCanonicalFinanceReport(
    baseInput({ splitViews: { [SEVERINO_IDS.SALE_ID]: view } }),
  );
  const parcela = report.wallet.movements.find((m) => m.id === SEVERINO_IDS.PARCELA_ID)!;
  assert(
    parcela.split.every((l) => l.amountKind === 'settled' && l.amountKindLabel === 'Liquidado'),
    'net_amount → Liquidado',
  );
  assert(
    parcela.split.every((l) => l.grossAmount === 16.67),
    'líquido não substitui o bruto previsto',
  );
  assert(
    parcela.split.every((l) => l.netAmount === 16.67),
    'net_amount persistido permanece na coluna líquido',
  );
}

console.log('\n═══ J) filtro de período — paid_at vs due_date vs movement_date ═══');
{
  const report = buildCanonicalFinanceReport(
    baseInput({
      receipts: [
        {
          id: 'paid-sep-due-aug',
          sale_id: 'sale-j',
          installment_number: 1,
          amount: 50,
          paid_amount: 50,
          status: 'pago',
          due_date: '2026-08-10',
          paid_at: '2026-09-05T08:00:00.000Z',
          financial_account_id: 'fa-admin',
          customers: { name: 'Periodo' },
          projects: { name: SEVERINO_PROJECT },
          blocks: { block_name: '01', number: '02' },
          sales: { id: 'sale-j', contracts: [{ contract_number: '000000002/2026' }] },
        },
        {
          id: 'pending-sep',
          sale_id: 'sale-j2',
          installment_number: 1,
          amount: 40,
          status: 'pendente',
          due_date: '2026-09-25',
          financial_account_id: 'fa-admin',
          customers: { name: 'Periodo' },
          projects: { name: SEVERINO_PROJECT },
          blocks: { block_name: '01', number: '03' },
          sales: { id: 'sale-j2', contracts: [{ contract_number: '000000003/2026' }] },
        },
      ],
      cashMovements: [
        {
          id: 'cash-aug',
          type: 'entrada',
          status: 'ativo',
          amount: 200,
          category: 'Parcela',
          description: 'antes do período',
          movement_date: '2026-08-20',
          projects: { name: SEVERINO_PROJECT },
        },
        {
          id: 'cash-sep',
          type: 'entrada',
          status: 'ativo',
          amount: 50,
          category: 'Parcela',
          description: 'no período',
          movement_date: '2026-09-05',
          metadata: { installment_id: 'paid-sep-due-aug' },
          projects: { name: SEVERINO_PROJECT },
        },
      ],
      splitViews: {},
      filters: {
        ...DEFAULT_REPORT_FILTERS,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        projectFilter: SEVERINO_PROJECT,
      },
    }),
  );
  assert(report.wallet.receivedInPeriod === 50, 'recebido usa paid_at em setembro');
  assert(report.wallet.toReceive === 40, 'a receber usa due_date em setembro');
  assert(report.cash.openingBalance === 200, 'saldo inicial = caixa de agosto');
  assert(report.cash.inflows === 50, 'entrada de caixa só setembro');
  assert(
    report.wallet.movements.some((m) => m.id === 'paid-sep-due-aug'),
    'listagem inclui pago no período mesmo com vencimento fora',
  );
}

console.log('\n═══ K) filtro empreendimento ═══');
{
  const seed = baseInput();
  seed.receipts = [
    ...seed.receipts,
    {
      id: 'other-proj',
      sale_id: 'sale-other',
      installment_number: 1,
      amount: 999,
      paid_amount: 999,
      status: 'pago',
      due_date: '2026-09-10',
      paid_at: '2026-09-10T10:00:00.000Z',
      financial_account_id: 'fa-admin',
      customers: { name: 'Outro' },
      projects: { name: 'Recanto Primavera' },
      blocks: { block_name: '01', number: '01' },
      sales: { id: 'sale-other', contracts: [{ contract_number: '000000099/2026' }] },
    },
  ];
  const report = buildCanonicalFinanceReport(seed);
  assert(
    report.wallet.movements.every((m) => m.projectName === SEVERINO_PROJECT),
    'somente Araguaia',
  );
  assert(
    !report.wallet.byProject.some((p) => p.projectName === 'Recanto Primavera'),
    'Recanto fora do quadro',
  );
}

console.log('\n═══ L) filtro conta ═══');
{
  const seed = baseInput();
  seed.filters = {
    ...seed.filters,
    financialAccountId: 'fa-admin',
    financialAccountLabel: 'Administradora — Asaas',
  };
  seed.receipts = [
    ...seed.receipts,
    {
      id: 'other-acc',
      sale_id: 'sale-acc',
      installment_number: 1,
      amount: 70,
      paid_amount: 70,
      status: 'pago',
      due_date: '2026-09-10',
      paid_at: '2026-09-10T10:00:00.000Z',
      financial_account_id: 'fa-other',
      customers: { name: 'Outra conta' },
      projects: { name: SEVERINO_PROJECT },
      blocks: { block_name: '09', number: '09' },
      sales: {
        id: 'sale-acc',
        financial_account_id: 'fa-other',
        contracts: [{ contract_number: '000000088/2026' }],
      },
    },
  ];
  const report = buildCanonicalFinanceReport(seed);
  assert(
    report.wallet.movements.every((m) => m.financialAccountId === 'fa-admin'),
    'somente conta administradora',
  );
}

console.log('\n═══ snapshot fallback quando legs ainda não existem ═══');
{
  const view = buildSeverinoSplitView({ legs: [] });
  const report = buildCanonicalFinanceReport(
    baseInput({ splitViews: { [SEVERINO_IDS.SALE_ID]: view } }),
  );
  const parcela = report.wallet.movements.find((m) => m.id === SEVERINO_IDS.PARCELA_ID)!;
  assert(parcela.hasSplit, 'usa snapshot da venda');
  assert(parcela.split.length === 2, '2 participantes do snapshot');
  assert(
    parcela.split.every((l) => l.amountKind === 'estimated'),
    'snapshot sem net = estimado',
  );
}

console.log('\n═══ lote disponível não aparece ═══');
{
  const report = buildCanonicalFinanceReport(baseInput());
  const dump = JSON.stringify(report);
  assert(!dump.includes('DISPONÍVEL'), 'JSON do relatório sem DISPONÍVEL');
  assert(
    report.wallet.movements.every((m) => m.id.startsWith('receipt-')),
    'somente finance_receipts',
  );
}

console.log('\n═══ ROSIVAN 000000030/2026 — 20+40+40 split 50/50 sem total híbrido ═══');
{
  const saleId = 'sale-rosivan-030';
  const ids = {
    entrada: 'receipt-rosivan-entrada',
    p1: 'receipt-rosivan-p1',
    p2: 'receipt-rosivan-p2',
  };
  const customer = { name: 'ROSIVAN DE OLIVEIRA', document: '000.000.000-00' };
  const blocks = { block_name: '01', name: '01', number: '74' };
  const sales = {
    id: saleId,
    installments_count: 2,
    financial_account_id: 'fa-asaas-sandbox',
    projects: { name: SEVERINO_PROJECT },
    contracts: [{ contract_number: '000000030/2026' }],
  };
  const receipt = (
    id: string,
    installment: number,
    amount: number,
  ) => ({
    id,
    sale_id: saleId,
    project_id: 'proj-araguaia',
    installment_number: installment,
    amount,
    paid_amount: amount,
    status: 'pago',
    due_date: '2026-09-17',
    paid_at: '2026-09-17T12:00:00.000Z',
    financial_account_id: 'fa-asaas-sandbox',
    customers: customer,
    projects: { name: SEVERINO_PROJECT },
    blocks,
    sales,
  });
  const cashRow = (id: string, receiptId: string, amount: number, desc: string) => ({
    id,
    type: 'entrada',
    status: 'ativo',
    amount,
    category: 'Venda de Lote',
    description: desc,
    movement_date: '2026-09-17',
    sale_id: saleId,
    project_id: 'proj-araguaia',
    metadata: {
      provider: 'MANUAL_FINANCE',
      installment_id: receiptId,
      receipt_id: receiptId,
      financial_account_id: 'fa-asaas-sandbox',
    },
  });
  const leg = (
    installmentId: string,
    name: string,
    gross: number,
    net: number | null,
    issuer: boolean,
  ) => ({
    installmentId,
    displayName: name,
    sharePercent: 50,
    isIssuerRemainder: issuer,
    financialAccountId: issuer ? 'fa-asaas-sandbox' : 'fa-ana',
    grossAmountEstimate: gross,
    netAmount: net,
    status: 'SETTLED',
  });
  const splitView = {
    saleId,
    snapshot: { id: 'snap-rosivan' },
    participants: [
      {
        id: 'part-admin',
        displayName: 'Administradora',
        sharePercent: 50,
        isIssuerRemainder: true,
        financialAccountId: 'fa-asaas-sandbox',
      },
      {
        id: 'part-ana',
        displayName: 'ANA VITORIA',
        sharePercent: 50,
        isIssuerRemainder: false,
        financialAccountId: 'fa-ana',
      },
    ],
    legs: [
      leg(ids.entrada, 'Administradora', 10, null, true),
      leg(ids.entrada, 'ANA VITORIA', 10, 9.5, false),
      leg(ids.p1, 'Administradora', 20, null, true),
      leg(ids.p1, 'ANA VITORIA', 20, 19.36, false),
      leg(ids.p2, 'Administradora', 20, null, true),
      leg(ids.p2, 'ANA VITORIA', 20, 19.36, false),
    ],
  };
  const report = buildCanonicalFinanceReport(
    baseInput({
      receipts: [
        receipt(ids.entrada, 0, 20),
        receipt(ids.p1, 1, 40),
        receipt(ids.p2, 2, 40),
      ],
      cashMovements: [
        cashRow('cash-rosivan-entrada', ids.entrada, 20, 'Pagamento de Parcela 0 - CT 000000030/2026'),
        cashRow('cash-rosivan-p1', ids.p1, 40, 'Pagamento de Parcela 1 - CT 000000030/2026'),
        cashRow('cash-rosivan-p2', ids.p2, 40, 'Pagamento de Parcela 2 - CT 000000030/2026'),
      ],
      splitViews: { [saleId]: splitView },
      accountLabels: {
        'fa-asaas-sandbox': 'ASAAS SANDBOX — Asaas',
        'fa-ana': 'ANA VITORIA — Asaas',
      },
      chargeHints: {
        [ids.entrada]: { provider: 'ASAAS', feeAmount: null },
        [ids.p1]: { provider: 'ASAAS', feeAmount: null },
        [ids.p2]: { provider: 'ASAAS', feeAmount: null },
      },
    }),
  );

  assert(report.wallet.receivedInPeriod === 100, 'receita = 100');
  assert(report.cash.inflows === 100, 'caixa entradas = 100');
  assert(report.wallet.qtyPaid === 3, '3 parcelas pagas');
  assert(report.wallet.toReceive === 0, 'a receber = 0');
  assert(report.destinations.grossPredictedTotal === 100, 'distribuição bruta prevista = 100');
  assert(report.destinations.total === 100, 'total canônico = bruto previsto, não híbrido');
  assert(report.destinations.netConfirmedTotal === 48.22, 'líquido confirmado = 48,22');
  const hybrid = round(50 + 48.22);
  assert(report.destinations.total !== hybrid, `não gera total híbrido ${hybrid}`);
  assert(report.destinations.persistedFeeTotal == null, 'sem tarifa persistida — não inventar');

  const admin = report.destinations.rows.find((r) => r.beneficiaryName === 'Administradora');
  const ana = report.destinations.rows.find((r) => r.beneficiaryName === 'ANA VITORIA');
  assert(admin?.grossAmount === 50, 'Administradora bruto previsto 50');
  assert(admin?.netAmount == null, 'Administradora sem net_amount');
  assert(admin?.amountKindLabel === 'Previsto/Estimado', 'Administradora estimado');
  assert(ana?.grossAmount === 50, 'ANA bruto previsto 50');
  assert(ana?.netAmount === 48.22, 'ANA líquido 48,22');
  assert(ana?.amountKindLabel === 'Liquidado', 'ANA liquidado');

  assert(
    report.cash.movements.every((m) => m.projectName === SEVERINO_PROJECT),
    'caixa usa empreendimento Chacreamento Araguaia',
  );
  assert(
    report.cash.movements.every((m) => m.projectName !== 'Lançamento manual'),
    'Lançamento manual não vai para a coluna Empreendimento',
  );
  assert(
    report.cash.movements.every((m) => m.accountLabel === 'ASAAS SANDBOX — Asaas'),
    'conta Asaas sandbox resolvida pela metadata/parcela',
  );
  assert(
    report.cash.movements.every((m) => !String(m.tipoLabel).includes('Lançamento manual')),
    'entrada de venda não é originada como lançamento manual',
  );
}

console.log('\n═══ apresentação visual — nome, %, UUID fora do PDF ═══');
{
  assert(formatSplitSharePercentLabel(50) === '50%', '50.0000 → 50%');
  assert(formatSplitSharePercentLabel(50.0000) === '50%', '50.0000 literal → 50%');
  assert(formatReportSharePercent(50) === '50%', 'formatador de relatório 50%');
  assert(formatSplitBeneficiaryLabel('ana vitoria') === 'ANA VITORIA', 'ana vitoria → ANA VITORIA');
  assert(formatSplitBeneficiaryLabel('Administradora') === 'Administradora', 'Administradora permanece');
  assert(
    formatSplitBeneficiaryLabel('ANA VITORIA') === 'ANA VITORIA',
    'ANA VITORIA já formatado permanece',
  );

  const walletUuid = '1ef06e2a-a15f-4f2e-b26b-302a06056e6c';
  const view = buildSeverinoSplitView();
  view.legs = view.legs.map((leg) => ({
    ...leg,
    destinationIdentifier: walletUuid,
  }));
  const report = buildCanonicalFinanceReport(
    baseInput({ splitViews: { [SEVERINO_IDS.SALE_ID]: view } }),
  );
  const parcela = report.wallet.movements.find((m) => m.id === SEVERINO_IDS.PARCELA_ID)!;
  assert(report.wallet.receivedInPeriod === 66.67, 'lock receita Severino');
  assert(
    parcela.split.some((leg) => String(leg.accountOrWallet || '').includes(walletUuid)),
    'UUID permanece no dataset',
  );
  const pdfLine = formatFinancePdfSplitLegLine(parcela.split[0]);
  assert(!pdfLine.includes(walletUuid), 'UUID da wallet NÃO aparece no PDF');
  assert(pdfLine.includes('50%') || pdfLine.includes(formatSplitSharePercentLabel(parcela.split[0].sharePercent)), 'PDF mostra percentual amigável');
  assert(
    pdfLine.includes(formatSplitBeneficiaryLabel(parcela.split[0].beneficiaryName)),
    'PDF mostra beneficiário formatado',
  );
  assert(pdfLine.includes('bruto'), 'PDF mostra bruto previsto');
  assert(pdfLine.includes('líquido'), 'PDF mostra líquido');

  const pdfSrc = readFileSync(
    join(process.cwd(), 'lib/finance/reports/renderFinanceReportPdf.ts'),
    'utf8',
  );
  const excelSrc = readFileSync(
    join(process.cwd(), 'lib/finance/reports/renderFinanceReportExcel.ts'),
    'utf8',
  );
  assert(pdfSrc.includes('formatFinancePdfSplitLegLine'), 'PDF completo usa linha sem wallet');
  assert(!pdfSrc.includes('leg.accountOrWallet'), 'renderer PDF não interpola accountOrWallet');
  assert(excelSrc.includes('Conta/Wallet'), 'Excel completo mantém coluna Conta/Wallet');
  assert(excelSrc.includes('leg.accountOrWallet'), 'Excel preserva wallet no dataset analítico');
}

if (failed > 0) {
  console.error(`\nFAILED ${failed}  passed ${passed}`);
  process.exit(1);
}
console.log(`\nOK — mandatory-finance-reports-canonical-tests passed (${passed})`);
