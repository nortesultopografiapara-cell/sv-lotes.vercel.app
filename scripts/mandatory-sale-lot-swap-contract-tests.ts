/**
 * Contrato gerado na Troca de lote — contexto financeiro pós-troca.
 * npx tsx scripts/mandatory-sale-lot-swap-contract-tests.ts
 *
 * Não reexecuta swap. Não toca banco. Sem IDs de homologação.
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateContractHTML } from '../lib/contractTemplate';
import { buildLotSwapFinancialPlan } from '../lib/finance/saleLotSwapPlan';
import { buildLotSwapContractFinanceContext } from '../lib/finance/saleLotSwapContractContext';
import { resolveSaleContractModelFromContext } from '../lib/contractModel';
import { resolveSaleContractPaymentBreakdown } from '../lib/saleContractPaymentSummary';
import { buildSaleContractClauseQuartaHtml } from '../lib/saleContractLegalTemplate';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function norm(html: string): string {
  return html.replace(/\u00a0/g, ' ').replace(/&nbsp;/g, ' ');
}

const CUSTOMER = {
  name: 'Cliente Teste Troca',
  cpf_cnpj: '11144477735',
  document: '11144477735',
  rg: '1234567',
  rg_issuer: 'PC',
  rg_issuer_state: 'PA',
  nationality: 'Brasileiro',
  civil_state: 'Solteiro',
  profession: 'Comerciante',
  email: 'cliente@teste.com',
  phone: '(94) 99999-1234',
  address: 'Rua A, 10',
  neighborhood: 'Centro',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
};

const BLOCK = {
  id: 'block-dest-test',
  number: '62',
  lote: '62',
  lot: '62',
  block_name: '02',
  quadra: '02',
  area: 1250.5,
  frente: 25,
  fundo: 25,
  'Lado Dir.': 50,
  'Lado Esq.': 50,
  segments_json: [
    { segment_index: 0, official_side: 'frente', distance: 25, confrontant: 'Rua Principal' },
    { segment_index: 1, official_side: 'lado_direito', distance: 50, confrontant: 'Chácara 13' },
    { segment_index: 2, official_side: 'fundo', distance: 25, confrontant: 'Área verde' },
    { segment_index: 3, official_side: 'lado_esquerdo', distance: 50, confrontant: 'Chácara 11' },
  ],
};

const MUNDO_NOVO_SELLERS = [
  {
    role: 'PROMITENTE_VENDEDOR',
    order: 1,
    name: 'Maria Elvira de Sousa',
    nationality: 'brasileira',
    maritalStatus: 'casada',
    profession: 'agricultora',
    rg: '7059327-SSP/PA',
    cpf: '248.031.972-53',
    address: 'Loteamento Palmares Sul – Lotes 33, 34 e 36 – Parauapebas – PA',
  },
  {
    role: 'PROMITENTE_VENDEDOR',
    order: 2,
    name: 'Adenil Antonio de Sousa',
    nationality: 'brasileiro',
    maritalStatus: 'casado',
    profession: 'agricultor',
    rg: '7010624-SSP-PA',
    cpf: '175.200.962-20',
    address: 'Loteamento Palmares Sul – Lotes 33, 34 e 36 – Parauapebas – PA',
  },
];

function homologPlan(overrides?: {
  newLotPrice?: number;
  receipts?: Array<{
    id: string;
    installment_number: number;
    status: string;
    amount: number;
    paid_amount?: number;
    due_date: string;
  }>;
}) {
  return buildLotSwapFinancialPlan({
    oldSalePrice: 100,
    newLotPrice: overrides?.newLotPrice ?? 50,
    receipts: overrides?.receipts ?? [
      {
        id: 'r-entry',
        installment_number: 0,
        status: 'pago',
        amount: 20,
        paid_amount: 20,
        due_date: '2026-08-10',
      },
      {
        id: 'r-paid-1',
        installment_number: 1,
        status: 'pago',
        amount: 26.67,
        paid_amount: 26.67,
        due_date: '2026-09-10',
      },
      {
        id: 'r-future-1',
        installment_number: 2,
        status: 'pendente',
        amount: 26.67,
        due_date: '2026-10-10',
      },
      {
        id: 'r-future-2',
        installment_number: 3,
        status: 'pendente',
        amount: 26.66,
        due_date: '2026-11-10',
      },
    ],
    financialAccountId: 'acc-1',
    asOf: '2026-09-06',
  });
}

function staleSaleFinance(extra?: Record<string, unknown>) {
  return {
    total_value: 100,
    agreed_price: 100,
    lot_price: 100,
    down_payment: 20,
    installments_count: 3,
    installment_value: 26.67,
    payment_type: 'Parcelado',
    installment_correction_type: 'IGPM',
    sale_date: '2026-08-10',
    brokers: { name: 'Corretor Exemplo', cpf: '12345678909' },
    ...extra,
  };
}

function generateSwapHtml(input: {
  contractModel: string;
  tenant?: Record<string, unknown>;
  project?: Record<string, unknown>;
  plan?: ReturnType<typeof homologPlan>;
  companyName?: string;
}) {
  const plan = input.plan ?? homologPlan();
  const finance = buildLotSwapContractFinanceContext(plan);
  const tenant = {
    contract_model: input.contractModel,
    razao_social: input.companyName || 'Empresa Teste Troca LTDA',
    name: input.companyName || 'Empresa Teste Troca LTDA',
    cnpj: '57590706000178',
    address: 'Rua Teste, 100',
    city: 'Parauapebas',
    state: 'PA',
    ...input.tenant,
  };
  const project = {
    name: 'Empreendimento Teste',
    city: 'Parauapebas',
    uf: 'PA',
    contract_model: input.contractModel,
    ...input.project,
  };
  return generateContractHTML({
    tenant,
    customer: CUSTOMER,
    project,
    block: BLOCK,
    sale: { ...staleSaleFinance(), ...finance.salePatch },
    financeReceipts: finance.financeReceipts,
    balloonAddons: [],
  });
}

function assertHomologFinance(html: string, label: string) {
  const text = norm(html);
  assert(text.includes('50,00'), `${label}: valor do novo lote`);
  assert(text.includes('46,67'), `${label}: valor já pago/aproveitado`);
  assert(text.includes('3,33'), `${label}: saldo remanescente`);
  assert(text.includes('1,66'), `${label}: parcela 10/10`);
  assert(text.includes('1,67'), `${label}: parcela 10/11`);
  assert(text.includes('10/10/2026'), `${label}: vencimento 10/10/2026`);
  assert(text.includes('10/11/2026'), `${label}: vencimento 10/11/2026`);
  assert(!text.includes('26,67'), `${label}: não reapresenta parcela antiga 26,67`);
  assert(
    !/entrada[^.]{0,80}20,00/i.test(text),
    `${label}: não trata 20,00 como nova entrada`,
  );
  assert(
    !/2 parcelas iguais[^.]{0,80}26,67/i.test(text),
    `${label}: não reapresenta 2 x 26,67`,
  );
}

function testPlanSnapshotMatchesHomolog() {
  const plan = homologPlan();
  const finance = buildLotSwapContractFinanceContext(plan);
  assert(finance.snapshot.new_lot_price === 50, 'preço destino');
  assert(finance.snapshot.total_paid === 46.67, 'pago preservado');
  assert(finance.snapshot.new_balance === 3.33, 'saldo');
  assert(finance.snapshot.remaining_installments.length === 2, '2 novas parcelas');
  assert(finance.snapshot.remaining_installments[0].amount === 1.66, '1,66');
  assert(finance.snapshot.remaining_installments[1].amount === 1.67, '1,67');
  assert(finance.salePatch.down_payment === 0, 'down_payment da troca não é a entrada antiga');
  assert(finance.financeReceipts.every((row) => row.status === 'pendente'), 'só CREATE');
  assert(!finance.financeReceipts.some((row) => row.amount === 20), 'sem recibo de entrada antiga');
  assert(!finance.financeReceipts.some((row) => row.amount === 26.67), 'sem parcela antiga');
  console.log('OK testPlanSnapshotMatchesHomolog');
}

function testPadraoClauseAndQuadro() {
  const plan = homologPlan();
  const finance = buildLotSwapContractFinanceContext(plan);
  const sale = { ...staleSaleFinance(), ...finance.salePatch };
  const clause = buildSaleContractClauseQuartaHtml({
    isCash: false,
    mode: 'INSTALLMENT',
    valorTotalFmt: 'R$ 50,00',
    valorTotalExtenso: 'cinquenta reais',
    valorEntradaFmt: 'R$ 20,00',
    valorEntradaExtenso: 'vinte reais',
    qtdParcelas: 3,
    valorParcelaFmt: 'R$ 26,67',
    valorParcelaExtenso: 'vinte e seis reais e sessenta e sete centavos',
    dataPrimeiraParcelaFmt: '10/10/2026',
    dataUltimaParcelaFmt: '10/11/2026',
    lotSwapSnapshot: finance.snapshot,
  });
  const text = norm(clause);
  assert(text.includes('pago e aproveitado'), 'PADRAO: continuidade');
  assert(text.includes('46,67'), 'PADRAO: crédito');
  assert(text.includes('3,33'), 'PADRAO: saldo');
  assert(!text.includes('entrada de'), 'PADRAO: sem nova entrada');
  assert(!text.includes('26,67'), 'PADRAO cláusula sem 26,67');

  const breakdown = resolveSaleContractPaymentBreakdown(sale, {
    financeReceipts: finance.financeReceipts,
  });
  const quadro = norm(
    require('../lib/saleContractPaymentSummary').buildSaleContractPaymentSummaryHtml(breakdown),
  );
  assert(breakdown.lotSwapUsesContinuity, 'quadro marca continuidade');
  assert(breakdown.entryAmount === 0, 'quadro não usa entrada 20');
  assert(breakdown.installmentBalance === 3.33, 'quadro saldo 3,33');
  assert(quadro.includes('Valor já pago/aproveitado'), 'rótulo do histórico pago');
  assert(!quadro.includes('Valor da entrada'), 'quadro sem rótulo de nova entrada');
  console.log('OK testPadraoClauseAndQuadro');
}

function testModelsHomologCase() {
  const padrao = generateSwapHtml({ contractModel: 'PADRAO' });
  assertHomologFinance(padrao, 'PADRAO');
  assert(norm(padrao).includes('pago e aproveitado'), 'PADRAO narrativa');

  const araguaia = generateSwapHtml({
    contractModel: 'ARAGUAIA',
    tenant: { contract_model: 'ARAGUAIA' },
    project: { name: 'Chacreamento Araguaia', contract_model: 'ARAGUAIA' },
  });
  assertHomologFinance(araguaia, 'ARAGUAIA');
  assert(norm(araguaia).includes('pago e aproveitado'), 'ARAGUAIA narrativa');
  assert(!/entrada no valor de[^.]{0,40}20,00/i.test(norm(araguaia)), 'ARAGUAIA sem entrada 20');

  const recanto = generateSwapHtml({
    contractModel: 'RECANTO_PRIMAVERA',
    tenant: { contract_model: 'RECANTO_PRIMAVERA', name: 'Recanto Co' },
    project: { name: 'Recanto Primavera', contract_model: 'RECANTO_PRIMAVERA' },
  });
  assertHomologFinance(recanto, 'RECANTO_PRIMAVERA');
  assert(norm(recanto).includes('pago e aproveitado'), 'RECANTO narrativa');
  assert(norm(recanto).includes('VALOR JÁ PAGO/APROVEITADO'), 'RECANTO quadro da troca');
  assert(!norm(recanto).includes('>SINAL<'), 'RECANTO não trata o pago como sinal novo');

  const mundo = generateSwapHtml({
    contractModel: 'MUNDO_NOVO',
    tenant: {
      contract_model: 'MUNDO_NOVO',
      razao_social: 'R R NEGÓCIOS & SERVIÇOS LTDA',
    },
    project: {
      name: 'Chacreamento Mundo Novo',
      contract_model: 'MUNDO_NOVO',
      seller_parties_json: MUNDO_NOVO_SELLERS,
    },
  });
  assertHomologFinance(mundo, 'MUNDO_NOVO');
  assert(norm(mundo).includes('pago e aproveitado'), 'MUNDO_NOVO narrativa');
  console.log('OK testModelsHomologCase');
}

function testNewLotMoreExpensive() {
  const plan = homologPlan({ newLotPrice: 150 });
  const html = norm(generateSwapHtml({ contractModel: 'ARAGUAIA', plan }));
  assert(html.includes('150,00'), 'lote mais caro');
  assert(html.includes('46,67'), 'crédito preservado');
  assert(html.includes('103,33'), 'saldo maior');
  assert(!html.includes('26,67'), 'sem parcela antiga');
  console.log('OK testNewLotMoreExpensive');
}

function testNewLotCheaper() {
  const html = norm(generateSwapHtml({ contractModel: 'PADRAO', plan: homologPlan({ newLotPrice: 50 }) }));
  assert(html.includes('50,00'), 'lote mais barato');
  assert(html.includes('3,33'), 'saldo menor');
  console.log('OK testNewLotCheaper');
}

function testNoPaidInstallments() {
  const plan = buildLotSwapFinancialPlan({
    oldSalePrice: 100,
    newLotPrice: 50,
    receipts: [
      {
        id: 'f1',
        installment_number: 1,
        status: 'pendente',
        amount: 50,
        due_date: '2026-10-10',
      },
      {
        id: 'f2',
        installment_number: 2,
        status: 'pendente',
        amount: 50,
        due_date: '2026-11-10',
      },
    ],
    asOf: '2026-09-06',
  });
  const html = norm(generateSwapHtml({ contractModel: 'ARAGUAIA', plan }));
  assert(plan.financials.total_paid === 0, 'nada pago');
  assert(!html.includes('pago e aproveitado'), 'sem narrativa de continuidade');
  assert(!html.includes('46,67'), 'sem crédito inventado');
  console.log('OK testNoPaidInstallments');
}

function testSeveralPaidInstallments() {
  const plan = homologPlan({
    receipts: [
      { id: 'p0', installment_number: 0, status: 'pago', amount: 20, paid_amount: 20, due_date: '2026-06-10' },
      { id: 'p1', installment_number: 1, status: 'pago', amount: 20, paid_amount: 20, due_date: '2026-07-10' },
      { id: 'p2', installment_number: 2, status: 'pago', amount: 20, paid_amount: 20, due_date: '2026-08-10' },
      { id: 'f1', installment_number: 3, status: 'pendente', amount: 20, due_date: '2026-10-10' },
      { id: 'f2', installment_number: 4, status: 'pendente', amount: 20, due_date: '2026-11-10' },
    ],
  });
  assert(plan.financials.total_paid === 60, 'três pagas');
  const html = norm(generateSwapHtml({ contractModel: 'PADRAO', plan }));
  assert(html.includes('60,00'), 'crédito das várias pagas');
  assert(html.includes('pago e aproveitado'), 'continuidade com várias pagas');
  console.log('OK testSeveralPaidInstallments');
}

function testCentavoRounding() {
  const plan = homologPlan();
  const [a, b] = plan.receipts.create.map((row) => row.amount);
  assert(a === 1.66 && b === 1.67, 'centavos 1,66+1,67');
  assert(Math.round((a + b) * 100) / 100 === 3.33, 'soma fecha o saldo');
  console.log('OK testCentavoRounding');
}

function testMultitenantSameLogic() {
  const a = generateSwapHtml({
    contractModel: 'PADRAO',
    companyName: 'Empresa Alfa Loteamentos LTDA',
  });
  const b = generateSwapHtml({
    contractModel: 'PADRAO',
    companyName: 'Empresa Beta Empreendimentos LTDA',
  });
  assertHomologFinance(a, 'tenant A');
  assertHomologFinance(b, 'tenant B');
  assert(norm(a).includes('Empresa Alfa'), 'empresa A no HTML');
  assert(norm(b).includes('Empresa Beta'), 'empresa B no HTML');
  assert(!a.includes('339327bb'), 'sem sale_id de homolog');
  assert(!a.includes('a6b243fe'), 'sem swap_id de homolog');
  console.log('OK testMultitenantSameLogic');
}

function testNormalSaleUnchanged() {
  const html = norm(
    generateContractHTML({
      tenant: {
        contract_model: 'PADRAO',
        razao_social: 'Empresa Venda Normal LTDA',
        cnpj: '57590706000178',
        city: 'Parauapebas',
        state: 'PA',
      },
      customer: CUSTOMER,
      project: { name: 'Empreendimento Normal', city: 'Parauapebas', uf: 'PA' },
      block: BLOCK,
      sale: staleSaleFinance({ total_value: 100, agreed_price: 100 }),
      financeReceipts: [
        { installment_number: 0, amount: 20, due_date: '2026-08-10' },
        { installment_number: 1, amount: 26.67, due_date: '2026-09-10' },
        { installment_number: 2, amount: 26.67, due_date: '2026-10-10' },
      ],
    }),
  );
  assert(html.includes('entrada'), 'venda normal segue com entrada');
  assert(html.includes('20,00'), 'entrada 20 da venda normal');
  assert(html.includes('26,67'), 'parcelas da venda normal');
  assert(!html.includes('pago e aproveitado'), 'venda normal sem narrativa de troca');
  console.log('OK testNormalSaleUnchanged');
}

function testModelResolverUntouched() {
  const resolved = resolveSaleContractModelFromContext({
    saleModel: 'ARAGUAIA',
    contractModel: 'PADRAO',
    projectModel: 'PADRAO',
    companyModel: 'PADRAO',
  });
  assert(resolved.model === 'ARAGUAIA', 'sale model prevalece');
  const svc = read('lib/finance/saleLotSwapExecuteService.ts');
  assert(svc.includes('resolveSaleContractModelFromContext'), 'execute usa resolver oficial');
  assert(svc.includes('buildLotSwapContractFinanceContext'), 'execute injeta snapshot da troca');
  assert(!svc.includes('mundoNovoContractSellers'), 'não altera sellers Mundo Novo');
  assert(!read('lib/mundoNovoContractSellers.ts').includes('lot_swap_finance'), 'sellers file intocado pela troca');
  console.log('OK testModelResolverUntouched');
}

function testRpcUntouched() {
  const sql = read(
    'supabase/migrations/20261014120200_fix_execute_sale_lot_swap_due_date_contract_insert.sql',
  );
  assert(sql.includes('CREATE OR REPLACE FUNCTION public.execute_sale_lot_swap'), 'RPC permanece');
  const ctx = read('lib/finance/saleLotSwapExecuteService.ts');
  assert(!ctx.includes('.rpc(') || ctx.includes("rpc(LOT_SWAP_EXECUTE_RPC") || ctx.includes("rpc('execute_sale_lot_swap'"), 'ainda chama a mesma RPC');
  console.log('OK testRpcUntouched');
}

testPlanSnapshotMatchesHomolog();
testPadraoClauseAndQuadro();
testModelsHomologCase();
testNewLotMoreExpensive();
testNewLotCheaper();
testNoPaidInstallments();
testSeveralPaidInstallments();
testCentavoRounding();
testMultitenantSameLogic();
testNormalSaleUnchanged();
testModelResolverUntouched();
testRpcUntouched();
console.log('OK mandatory-sale-lot-swap-contract-tests');
