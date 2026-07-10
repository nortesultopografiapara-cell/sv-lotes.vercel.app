/**
 * Contratos com parcelas balão — todos os modelos.
 * npx tsx scripts/mandatory-sale-balloon-contract-tests.ts
 * npm run test:sale-balloon-contract
 *
 * REGRA: balões só via sale_balloon_installments (balloonAddons).
 * Nunca inferir por diferença de finance_receipts.amount.
 */

import { generateContractHTML } from '../lib/contractTemplate';
import {
  buildBalloonAwarePaymentClauseText,
  buildCompactBalloonFinanceScheduleHtml,
  resolveSaleContractBalloonFinance,
} from '../lib/saleContractBalloonFinance';
import { buildSaleContractClauseQuartaHtml } from '../lib/saleContractLegalTemplate';
import { buildSvLotes2ClauseSegundaHtml } from '../lib/svLotes2ContractTerms';
import { buildSvLotes2SummaryHtml } from '../lib/svLotes2ContractClauses';
import { buildSvLotes2ContractContext } from '../lib/svLotes2ContractContext';
import { buildRecantoPrimaveraClausesHtml } from '../lib/recantoPrimaveraContractClauses';
import { buildRecantoPrimaveraContractContext } from '../lib/recantoPrimaveraContractContext';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const baseSale = {
  id: 'sale-balloon-1',
  payment_type: 'Parcelado',
  lot_price: 100,
  discount: 0,
  total_value: 100,
  agreed_price: 100,
  down_payment: 5,
  installments_count: 48,
  use_balloon_installments: true,
  installment_correction_type: 'NONE',
};

const defaultAddons = [
  { installment_number: 6, additional_amount: 0.5 },
  { installment_number: 18, additional_amount: 0.5 },
  { installment_number: 30, additional_amount: 0.5 },
  { installment_number: 42, additional_amount: 0.5 },
];

/** Entrada 5 + comuns ~1.94 + balões 2.44 */
function buildBalloonReceipts(balloonNums = new Set([6, 18, 30, 42])) {
  const receipts: Array<{
    installment_number: number;
    amount: number;
    due_date: string;
    status: string;
  }> = [
    {
      installment_number: 0,
      amount: 5,
      due_date: '2026-07-09',
      status: 'pendente',
    },
  ];
  for (let i = 1; i <= 48; i++) {
    const month = ((i - 1) % 12) + 1;
    const year = 2026 + Math.floor((i - 1) / 12);
    receipts.push({
      installment_number: i,
      amount: balloonNums.has(i) ? 2.44 : 1.94,
      due_date: `${year}-${String(month).padStart(2, '0')}-09`,
      status: 'pendente',
    });
  }
  return receipts;
}

/**
 * Simula o contrato 000000015/2026:
 * comuns com centavos variáveis (1.94 / 1.95 / 1.96) por arredondamento.
 * Balões persistidos: 6 e 18 com +0.50 → finais 2.46.
 */
function buildRoundingCaseReceipts() {
  const receipts: Array<{
    installment_number: number;
    amount: number;
    due_date: string;
  }> = [{ installment_number: 0, amount: 5, due_date: '2026-07-09' }];

  // Base teórica ~1.96; algumas comuns ficam 1.94/1.95/1.96 (fechamento).
  for (let i = 1; i <= 48; i++) {
    let amount = 1.96;
    if (i === 6 || i === 18) amount = 2.46;
    else if (i % 7 === 0) amount = 1.94;
    else if (i % 5 === 0) amount = 1.95;
    // Forçar um "mínimo" baixo (1.88) em UMA parcela comum — NÃO deve virar balão.
    if (i === 3) amount = 1.88;
    receipts.push({
      installment_number: i,
      amount,
      due_date: '2026-08-09',
    });
  }
  return receipts;
}

const roundingAddons = [
  { installment_number: 6, additional_amount: 0.5 },
  { installment_number: 18, additional_amount: 0.5 },
];

function baseTenant(model: string) {
  return {
    id: 'co-1',
    name: 'Empresa Teste',
    razao_social: 'Empresa Teste LTDA',
    cnpj: '12345678000199',
    contract_model: model,
    city: 'Parauapebas',
    state: 'PA',
  };
}

function baseCustomer() {
  return {
    name: 'Cliente Teste',
    cpf_cnpj: '12345678901',
    document: '12345678901',
    rg: '1234567',
    profession: 'Comerciante',
    civil_state: 'Solteiro',
    address: 'Rua A, 100',
    neighborhood: 'Centro',
    city: 'Parauapebas',
    state: 'PA',
    zip_code: '68515000',
  };
}

function baseBlock() {
  return {
    id: 'b1',
    block: '1',
    number: '10',
    area: 300,
    price: 100,
  };
}

function testHelperDetectsBalloons() {
  const receipts = buildBalloonReceipts();
  const summary = resolveSaleContractBalloonFinance({
    sale: baseSale,
    financeReceipts: receipts,
    balloonAddons: defaultAddons,
  });
  assert(summary.hasBalloon, 'detecta balão');
  assert(summary.balloonCount === 4, '4 balões');
  assert(
    summary.balloonRows.map((r) => r.installmentNumber).join(',') === '6,18,30,42',
    'números balão',
  );
  assert(summary.balloonRows.every((r) => r.amount === 2.44), 'valor final 2.44');
  assert(summary.entryAmount === 5, 'entrada 5');
  console.log('OK testHelperDetectsBalloons');
}

function testRoundingDoesNotInferBalloons() {
  const receipts = buildRoundingCaseReceipts();
  const summary = resolveSaleContractBalloonFinance({
    sale: baseSale,
    financeReceipts: receipts,
    balloonAddons: roundingAddons,
  });

  assert(summary.balloonCount === 2, `balloonRows.length === 2 (got ${summary.balloonCount})`);
  assert(
    summary.balloonRows.map((r) => r.installmentNumber).join(',') === '6,18',
    'balloonNumbers === [6, 18]',
  );
  assert(summary.balloonRows.every((r) => r.balloonAddonAmount === 0.5), 'acréscimo 0.50');
  assert(summary.balloonRows.every((r) => r.amount === 2.46), 'valor final 2.46');
  assert(summary.balloonRows.every((r) => r.baseAmount === 1.96), 'base = amount - addon');

  // Parcela 3 tem 1.88 (menor) — NÃO é balão sem registro persistido.
  const p3 = summary.scheduleRows.find((r) => r.installmentNumber === 3)!;
  assert(!p3.isBalloon, 'parcela 3 comum apesar de valor menor');
  assert(p3.balloonAddonAmount === 0, 'parcela 3 sem addon');

  // Comuns com 1.94/1.95/1.96 ≠ moda/base não viram balão.
  const falsePositives = summary.scheduleRows.filter(
    (r) => !roundingAddons.some((a) => a.installment_number === r.installmentNumber) && r.isBalloon,
  );
  assert(falsePositives.length === 0, 'nenhuma parcela comum classificada como balão');

  const html = buildCompactBalloonFinanceScheduleHtml(summary);
  assert(html.includes('data-row-count="2"'), 'quadro com 2 linhas');
  assert(html.includes('Parcela 06') && html.includes('Parcela 18'), 'lista 06 e 18');
  assert(!html.includes('Parcela 01'), 'sem 01');
  assert(!html.includes('Parcela 03'), 'sem 03');
  assert(!html.includes('Parcela 48'), 'sem 48');
  console.log('OK testRoundingDoesNotInferBalloons');
}

function testNoAddonsNoBalloonEvenWithVariableAmounts() {
  const receipts = buildRoundingCaseReceipts();
  const summary = resolveSaleContractBalloonFinance({
    sale: { ...baseSale, use_balloon_installments: false },
    financeReceipts: receipts,
    balloonAddons: [],
  });
  assert(!summary.hasBalloon, 'sem addons → sem balão');
  assert(summary.balloonCount === 0, '0 balões');
  assert(buildCompactBalloonFinanceScheduleHtml(summary) === '', 'sem quadro');
  console.log('OK testNoAddonsNoBalloonEvenWithVariableAmounts');
}

function testFlagWithoutAddonsThrows() {
  let threw = false;
  try {
    resolveSaleContractBalloonFinance({
      sale: baseSale,
      financeReceipts: buildBalloonReceipts(),
      balloonAddons: [],
    });
  } catch (e) {
    threw = String((e as Error).message || '').includes('sale_balloon_installments');
  }
  assert(threw, 'flag sem addons → erro explícito');
  console.log('OK testFlagWithoutAddonsThrows');
}

function testNoBalloonKeepsEqualWording() {
  const equalReceipts = Array.from({ length: 12 }, (_, i) => ({
    installment_number: i + 1,
    amount: 100,
    due_date: '2026-08-01',
    status: 'pendente',
  }));
  const summary = resolveSaleContractBalloonFinance({
    sale: {
      ...baseSale,
      use_balloon_installments: false,
      down_payment: 0,
      installments_count: 12,
      total_value: 1200,
    },
    financeReceipts: equalReceipts,
    balloonAddons: [],
  });
  assert(!summary.hasBalloon, 'sem balão');

  const clause = buildSaleContractClauseQuartaHtml({
    isCash: false,
    valorTotalFmt: 'R$ 1.200,00',
    valorTotalExtenso: 'mil e duzentos reais',
    valorEntradaFmt: 'R$ 0,00',
    valorEntradaExtenso: 'zero reais',
    qtdParcelas: 12,
    valorParcelaFmt: 'R$ 100,00',
    valorParcelaExtenso: 'cem reais',
    dataPrimeiraParcelaFmt: '01/08/2026',
    dataUltimaParcelaFmt: '01/07/2027',
  });
  assert(clause.includes('parcelas iguais'), 'mantém iguais');
  console.log('OK testNoBalloonKeepsEqualWording');
}

function countBalloonOnlyRows(html: string): number {
  const m = html.match(/data-row-count="(\d+)"/);
  if (m) return Number(m[1]);
  return (html.match(/Parcela \d{2}/g) || []).length;
}

function testBalloonTableScalesWithCount() {
  const mk = (nums: number[]) => {
    const set = new Set(nums);
    const receipts = [
      { installment_number: 0, amount: 5, due_date: '2026-07-09' },
      ...Array.from({ length: 36 }, (_, i) => ({
        installment_number: i + 1,
        amount: set.has(i + 1) ? 10 : 5,
        due_date: '2026-08-01',
      })),
    ];
    const addons = nums.map((n) => ({
      installment_number: n,
      additional_amount: 5,
    }));
    return resolveSaleContractBalloonFinance({
      sale: {
        ...baseSale,
        installments_count: 36,
        use_balloon_installments: true,
      },
      financeReceipts: receipts,
      balloonAddons: addons,
    });
  };

  const two = mk([12, 24]);
  assert(two.balloonCount === 2, '2 balões');
  assert(countBalloonOnlyRows(buildCompactBalloonFinanceScheduleHtml(two)) === 2, '2 linhas');

  const five = mk([6, 12, 18, 24, 30]);
  assert(five.balloonCount === 5, '5 balões');
  assert(countBalloonOnlyRows(buildCompactBalloonFinanceScheduleHtml(five)) === 5, '5 linhas');

  const one = mk([36]);
  assert(one.balloonCount === 1, '1 balão');
  assert(countBalloonOnlyRows(buildCompactBalloonFinanceScheduleHtml(one)) === 1, '1 linha');

  const none = resolveSaleContractBalloonFinance({
    sale: { ...baseSale, use_balloon_installments: false },
    financeReceipts: Array.from({ length: 12 }, (_, i) => ({
      installment_number: i + 1,
      amount: 100,
      due_date: '2026-08-01',
    })),
    balloonAddons: [],
  });
  assert(none.balloonCount === 0, '0 balões');
  assert(buildCompactBalloonFinanceScheduleHtml(none) === '', 'sem quadro');
  console.log('OK testBalloonTableScalesWithCount');
}

function testCompactScheduleAndClause() {
  const summary = resolveSaleContractBalloonFinance({
    sale: baseSale,
    financeReceipts: buildBalloonReceipts(),
    balloonAddons: defaultAddons,
  });
  const html = buildCompactBalloonFinanceScheduleHtml(summary);
  assert(html.includes('Quadro Financeiro'), 'título quadro');
  assert(html.includes('Parcela 06'), 'parcela 06');
  assert(html.includes('Parcela 42'), 'parcela 42');
  assert(html.includes('data-row-count="4"'), '4 linhas');
  assert(!html.includes('Parcela 01'), 'não lista 01');

  const body = buildBalloonAwarePaymentClauseText({
    summary,
    valorTotalFmt: 'R$ 100,00',
    valorTotalExtenso: 'cem reais',
    valorEntradaFmt: 'R$ 5,00',
    valorEntradaExtenso: 'cinco reais',
    dataPrimeiraParcelaFmt: '09/08/2026',
    dataUltimaParcelaFmt: '09/07/2030',
  });
  assert(body.includes('Quadro Financeiro'), 'remete ao quadro');
  assert(!body.includes('06, 18'), 'cláusula sem lista');
  console.log('OK testCompactScheduleAndClause');
}

function testPadraoContractHtml() {
  const html = generateContractHTML({
    tenant: baseTenant('PADRAO'),
    customer: baseCustomer(),
    project: { name: 'Loteamento Teste', city: 'Parauapebas', uf: 'PA' },
    block: baseBlock(),
    sale: baseSale,
    financeReceipts: buildBalloonReceipts(),
    balloonAddons: defaultAddons,
  });
  assert(html.includes('Quadro Financeiro'), 'quadro');
  assert(html.includes('Parcela 06'), 'balão 6');
  assert(!html.includes('Parcela 01'), 'sem 01');
  assert(!html.includes('Quadro de parcelas'), 'sem quadro 1..N');
  console.log('OK testPadraoContractHtml');
}

function testSv2ContractSummaryAndClause() {
  const ctx = buildSvLotes2ContractContext({
    tenant: baseTenant('SV_LOTES_2'),
    customer: baseCustomer(),
    project: { name: 'Loteamento Teste', city: 'Parauapebas', uf: 'PA' },
    block: baseBlock(),
    sale: baseSale,
    financeReceipts: buildBalloonReceipts(),
    balloonAddons: defaultAddons,
  });
  assert(ctx.hasBalloonInstallments, 'ctx marca balão');
  const summary = buildSvLotes2SummaryHtml(ctx);
  assert(summary.includes('Quadro Financeiro'), 'quadro');
  assert(summary.includes('data-balloon-only="true"'), 'só balões');
  assert(!summary.includes('Parcela 01'), 'sem 01');

  const clause = buildSvLotes2ClauseSegundaHtml(ctx);
  assert(clause.includes('Quadro Financeiro'), 'cláusula remete');
  assert(!clause.includes('06, 18, 30 e 42'), 'sem lista na cláusula');
  console.log('OK testSv2ContractSummaryAndClause');
}

function testRecantoDoesNotSayFixasWithBalloon() {
  const ctx = buildRecantoPrimaveraContractContext({
    tenant: {
      ...baseTenant('RECANTO_PRIMAVERA'),
      contract_model: 'RECANTO_PRIMAVERA',
    },
    customer: baseCustomer(),
    project: { name: 'Recanto Primavera', city: 'Parauapebas', uf: 'PA' },
    block: baseBlock(),
    sale: {
      ...baseSale,
      down_payment: 10,
      signal_contract_value: 10,
      signal_paid_at_sale: 10,
    },
    financeReceipts: buildBalloonReceipts().map((r) =>
      r.installment_number === 0 ? { ...r, amount: 10 } : r,
    ),
    balloonAddons: defaultAddons,
  });
  const clauses = buildRecantoPrimaveraClausesHtml(ctx);
  if (ctx.hasBalloonInstallments) {
    assert(!clauses.includes('FIXAS'), 'não diz FIXAS com balão');
    assert(
      clauses.includes('balão') || clauses.includes('Quadro Financeiro'),
      'menciona balão/quadro',
    );
  }
  console.log('OK testRecantoDoesNotSayFixasWithBalloon');
}

function testTotalsClose() {
  const summary = resolveSaleContractBalloonFinance({
    sale: baseSale,
    financeReceipts: buildBalloonReceipts(),
    balloonAddons: defaultAddons,
  });
  assert(summary.entryAmount === 5, 'entrada');
  assert(summary.balloonCount === 4, '4 balões');
  console.log('OK testTotalsClose');
}

function testSpouseUntouchedInSv2() {
  const withSpouse = buildSvLotes2ContractContext({
    tenant: baseTenant('SV_LOTES_2'),
    customer: {
      ...baseCustomer(),
      civil_state: 'Casado',
    },
    project: { name: 'Loteamento Teste', city: 'Parauapebas', uf: 'PA' },
    block: baseBlock(),
    sale: {
      ...baseSale,
      has_spouse: true,
      sale_spouse_name: 'Cônjuge Teste',
      sale_spouse_cpf: '98765432100',
    },
    financeReceipts: buildBalloonReceipts(),
    balloonAddons: defaultAddons,
  });
  assert(withSpouse.hasBalloonInstallments, 'balão ok com cônjuge');
  const html2 = generateContractHTML({
    tenant: baseTenant('SV_LOTES_2'),
    customer: {
      ...baseCustomer(),
      civil_state: 'Casado',
    },
    project: { name: 'Loteamento Teste', city: 'Parauapebas', uf: 'PA' },
    block: baseBlock(),
    sale: {
      ...baseSale,
      has_spouse: true,
      sale_spouse_name: 'Cônjuge Teste',
      sale_spouse_cpf: '98765432100',
    },
    financeReceipts: buildBalloonReceipts(),
    balloonAddons: defaultAddons,
  });
  assert(
    html2.includes('balão') ||
      html2.includes('PARCELA BASE') ||
      html2.includes('Quadro Financeiro'),
    'contrato SV2 com cônjuge + balão',
  );
  console.log('OK testSpouseUntouchedInSv2');
}

function testHomologacao000000015() {
  const summary = resolveSaleContractBalloonFinance({
    sale: baseSale,
    financeReceipts: buildRoundingCaseReceipts(),
    balloonAddons: roundingAddons,
  });
  assert(summary.saleTotal === 100, 'venda 100');
  assert(summary.entryAmount === 5, 'entrada 5');
  assert(summary.installmentsCount === 48, '48 parcelas');
  assert(summary.balloonCount === 2, 'exatamente 2 balões');
  assert(
    summary.balloonRows.map((r) => r.installmentNumber).join(',') === '6,18',
    '06 e 18',
  );
  assert(summary.balloonRows[0].amount === 2.46, 'parcela 6 = 2.46');
  assert(summary.balloonRows[1].amount === 2.46, 'parcela 18 = 2.46');

  const html = generateContractHTML({
    tenant: baseTenant('SV_LOTES_2'),
    customer: baseCustomer(),
    project: { name: 'Loteamento Teste', city: 'Parauapebas', uf: 'PA' },
    block: baseBlock(),
    sale: baseSale,
    financeReceipts: buildRoundingCaseReceipts(),
    balloonAddons: roundingAddons,
  });
  assert(html.includes('Parcela 06'), 'PDF lista 06');
  assert(html.includes('Parcela 18'), 'PDF lista 18');
  assert(html.includes('data-row-count="2"'), '2 linhas');
  assert(!html.includes('Parcela 01'), 'sem 01');
  assert(!html.includes('Parcela 02'), 'sem 02');
  assert(!html.includes('Parcela 03'), 'sem 03');
  assert(!html.includes('Parcela 07'), 'sem 07');
  console.log('OK testHomologacao000000015');
}

function testConfigBeatsPollutedTable() {
  const { resolveContractBalloonAddons } = require('../lib/saleBalloonRepository');
  // Tabela poluída com 47 linhas (bug antigo) vs config real com 2 balões.
  const polluted = Array.from({ length: 47 }, (_, i) => ({
    sale_id: 's1',
    installment_number: i + 1,
    additional_amount: 0.08,
  }));
  const addons = resolveContractBalloonAddons({
    sale: {
      use_balloon_installments: true,
      installments_count: 48,
      total_value: 100,
      balloon_mode: 'MANUAL',
      balloon_config: {
        mode: 'MANUAL',
        manualCount: 2,
        manualRows: [
          { installmentNumber: '6', additionalAmount: '0,50', dueDate: '' },
          { installmentNumber: '18', additionalAmount: '0,50', dueDate: '' },
        ],
      },
    },
    tableRows: polluted,
  });
  assert(addons.length === 2, `config vence tabela poluída (got ${addons.length})`);
  assert(
    addons.map((a: { installment_number: number }) => a.installment_number).join(',') ===
      '6,18',
    'números 6 e 18',
  );

  const summary = resolveSaleContractBalloonFinance({
    sale: baseSale,
    financeReceipts: buildRoundingCaseReceipts(),
    balloonAddons: addons,
  });
  assert(summary.balloonCount === 2, 'quadro com 2');
  assert(
    buildCompactBalloonFinanceScheduleHtml(summary).includes('data-row-count="2"'),
    'html 2 linhas',
  );
  console.log('OK testConfigBeatsPollutedTable');
}

function main() {
  testHelperDetectsBalloons();
  testRoundingDoesNotInferBalloons();
  testNoAddonsNoBalloonEvenWithVariableAmounts();
  testFlagWithoutAddonsThrows();
  testNoBalloonKeepsEqualWording();
  testCompactScheduleAndClause();
  testBalloonTableScalesWithCount();
  testPadraoContractHtml();
  testSv2ContractSummaryAndClause();
  testRecantoDoesNotSayFixasWithBalloon();
  testTotalsClose();
  testSpouseUntouchedInSv2();
  testHomologacao000000015();
  testConfigBeatsPollutedTable();
  console.log('mandatory-sale-balloon-contract-tests: all passed');
}

main();
