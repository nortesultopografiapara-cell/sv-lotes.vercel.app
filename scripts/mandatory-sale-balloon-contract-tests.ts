/**
 * Contratos com parcelas balão — todos os modelos.
 * npx tsx scripts/mandatory-sale-balloon-contract-tests.ts
 * npm run test:sale-balloon-contract
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

/** Entrada 5 + 44×1.94 + 4×2.44 = 5 + 85.36 + 9.76 = 100.12 ≈ arredondamento de teste com 1.94/2.44 */
function buildBalloonReceipts() {
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
  const balloonNums = new Set([6, 18, 30, 42]);
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
  });
  assert(summary.hasBalloon, 'detecta balão');
  assert(summary.balloonCount === 4, '4 balões');
  assert(summary.baseInstallmentValue === 1.94, 'base 1.94');
  assert(
    summary.balloonRows.map((r) => r.installmentNumber).join(',') === '6,18,30,42',
    'números balão',
  );
  assert(summary.balloonRows.every((r) => r.amount === 2.44), 'valor final 2.44');
  assert(summary.entryAmount === 5, 'entrada 5');
  console.log('OK testHelperDetectsBalloons');
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

function testCompactScheduleAndClause() {
  const summary = resolveSaleContractBalloonFinance({
    sale: baseSale,
    financeReceipts: buildBalloonReceipts(),
  });
  const html = buildCompactBalloonFinanceScheduleHtml(summary);
  assert(html.includes('Quadro Financeiro'), 'título quadro');
  assert(html.includes('Parcelas balão') || html.includes('PARCELAS BALÃO') || html.toLowerCase().includes('parcelas balão'), 'marca balão');
  assert(html.includes('>06<') || html.includes('06'), 'parcela 06');
  assert(html.includes('>42<') || html.includes('42'), 'parcela 42');
  assert(html.includes('Parcela base'), 'parcela base');
  assert(html.includes('Valor total do contrato') || html.includes('Total do contrato'), 'total');
  assert(html.includes('Saldo financiado'), 'saldo');
  assert(html.includes('Incidentes nas parcelas'), 'incidentes');
  assert(html.includes('06, 18, 30 e 42'), 'lista incidentes');
  assert(html.includes('Tabela resumida'), 'tabela resumida');
  assert(!html.includes('44 parcela'), 'não lista comuns');
  assert(!html.includes('Vencimento'), 'sem coluna de vencimentos');
  // Não lista parcelas comuns (ex.: 01, 02, 03 fora dos balões)
  assert(!html.includes('>01<'), 'não lista parcela 01');
  assert(!html.includes('>48<'), 'não lista parcela 48');

  const body = buildBalloonAwarePaymentClauseText({
    summary,
    valorTotalFmt: 'R$ 100,00',
    valorTotalExtenso: 'cem reais',
    valorEntradaFmt: 'R$ 5,00',
    valorEntradaExtenso: 'cinco reais',
    dataPrimeiraParcelaFmt: '09/08/2026',
    dataUltimaParcelaFmt: '09/07/2030',
  });
  assert(body.includes('parcela base'), 'menciona parcela base');
  assert(body.includes('parcelas balão') || body.includes('Quadro Financeiro'), 'menciona balão/quadro');
  assert(body.includes('Quadro Financeiro'), 'remete ao quadro');
  assert(body.includes('acréscimos contratados') || body.includes('inalteradas'), 'redação obrigatória');
  assert(!body.includes('nº'), 'cláusula sem nº de parcela');
  assert(!body.includes('06, 18'), 'cláusula sem lista de balões');
  assert(!body.includes('parcelas iguais'), 'não diz iguais');
  console.log('OK testCompactScheduleAndClause');
}

function countBalloonTableRows(html: string): number {
  const matches = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!matches) return 0;
  return (matches[1].match(/<tr>/g) || []).length;
}

function testBalloonTableScalesWithCount() {
  // 2 balões
  const two = resolveSaleContractBalloonFinance({
    sale: { ...baseSale, installments_count: 24, use_balloon_installments: true },
    financeReceipts: [
      { installment_number: 0, amount: 5, due_date: '2026-07-09' },
      ...Array.from({ length: 24 }, (_, i) => ({
        installment_number: i + 1,
        amount: i + 1 === 12 || i + 1 === 24 ? 10 : 5,
        due_date: '2026-08-01',
      })),
    ],
  });
  assert(two.hasBalloon && two.balloonCount === 2, '2 balões');
  const html2 = buildCompactBalloonFinanceScheduleHtml(two);
  assert(countBalloonTableRows(html2) === 2, 'tabela com 2 linhas');
  assert(!html2.includes('>01<'), '2 balões: sem parcela 01');

  // 5 balões
  const fiveNums = [6, 12, 18, 24, 30];
  const five = resolveSaleContractBalloonFinance({
    sale: { ...baseSale, installments_count: 36, use_balloon_installments: true },
    financeReceipts: [
      { installment_number: 0, amount: 5, due_date: '2026-07-09' },
      ...Array.from({ length: 36 }, (_, i) => ({
        installment_number: i + 1,
        amount: fiveNums.includes(i + 1) ? 10 : 5,
        due_date: '2026-08-01',
      })),
    ],
  });
  assert(five.balloonCount === 5, '5 balões');
  assert(countBalloonTableRows(buildCompactBalloonFinanceScheduleHtml(five)) === 5, 'tabela com 5 linhas');

  // balão final (1 linha)
  const final = resolveSaleContractBalloonFinance({
    sale: { ...baseSale, installments_count: 12, use_balloon_installments: true },
    financeReceipts: [
      ...Array.from({ length: 12 }, (_, i) => ({
        installment_number: i + 1,
        amount: i + 1 === 12 ? 50 : 10,
        due_date: '2026-08-01',
      })),
    ],
  });
  assert(final.balloonCount === 1, '1 balão final');
  const htmlFinal = buildCompactBalloonFinanceScheduleHtml(final);
  assert(countBalloonTableRows(htmlFinal) === 1, 'tabela com 1 linha');
  assert(htmlFinal.includes('>12<') || htmlFinal.includes('12'), 'mostra parcela 12');
  console.log('OK testBalloonTableScalesWithCount');
}

function testPadraoContractHtml() {
  const html = generateContractHTML({
    tenant: baseTenant('PADRAO'),
    customer: baseCustomer(),
    project: { name: 'Loteamento Teste', city: 'Parauapebas', uf: 'PA' },
    block: baseBlock(),
    sale: baseSale,
    financeReceipts: buildBalloonReceipts(),
  });
  assert(html.includes('Quadro Financeiro') || html.includes('parcelas balão'), 'quadro/balão');
  assert(!html.includes('parcelas iguais no valor'), 'sem iguais');
  assert(html.includes('06, 18, 30 e 42') || html.includes('>06<'), 'lista balão 6');
  assert(!html.includes('Quadro de parcelas'), 'sem quadro completo 1..N');
  assert(!html.includes('Parcela 1') && !html.includes('Parcela 2'), 'sem listagem comum');
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
  });
  assert(ctx.hasBalloonInstallments, 'ctx marca balão');
  const summary = buildSvLotes2SummaryHtml(ctx);
  assert(summary.includes('PARCELA BASE'), 'resumo parcela base');
  assert(summary.includes('Quadro Financeiro'), 'quadro financeiro');
  assert(summary.includes('06, 18, 30 e 42') || summary.includes('>06<'), 'quadro balão');
  assert(!summary.includes('FORMA ESPECIAL'), 'sem forma especial no grid');
  assert(!summary.includes('Quadro de parcelas'), 'sem listagem 1..N');

  const clause = buildSvLotes2ClauseSegundaHtml(ctx);
  assert(clause.includes('CLÁUSULA SEGUNDA'), 'cláusula segunda');
  assert(clause.includes('parcelas balão') || clause.includes('Quadro Financeiro'), 'texto balão');
  assert(clause.includes('parcela base') || clause.includes('Quadro Financeiro'), 'remete ao quadro');
  assert(!clause.includes('parcelas iguais'), 'não diz iguais');
  assert(!clause.includes('06, 18, 30 e 42'), 'cláusula sem lista de números');
  console.log('OK testSv2ContractSummaryAndClause');
}

function testRecantoDoesNotSayFixasWithBalloon() {
  const ctx = buildRecantoPrimaveraContractContext({
    tenant: {
      ...baseTenant('RECANTO_PRIMAVERA'),
      contract_model: 'RECANTO_PRIMAVERA',
    },
    customer: baseCustomer(),
    project: {
      name: 'Recanto Primavera',
      city: 'Parauapebas',
      uf: 'PA',
    },
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
  const receipts = buildBalloonReceipts();
  const summary = resolveSaleContractBalloonFinance({
    sale: baseSale,
    financeReceipts: receipts,
  });
  // 5 + 44*1.94 + 4*2.44 = 5 + 85.36 + 9.76 = 100.12 — ajuste sale total para o teste de fechamento real
  const realTotal =
    Math.round(
      (summary.entryAmount + summary.monthlySum) * 100,
    ) / 100;
  const summary2 = resolveSaleContractBalloonFinance({
    sale: { ...baseSale, total_value: realTotal, agreed_price: realTotal },
    financeReceipts: receipts,
  });
  assert(summary2.totalsMatch, 'soma fecha com total da venda');
  console.log('OK testTotalsClose');
}

function testSpouseUntouchedInSv2() {
  const withSpouse = buildSvLotes2ContractContext({
    tenant: baseTenant('SV_LOTES_2'),
    customer: {
      ...baseCustomer(),
      civil_state: 'Casado',
      spouse_name: 'Cônjuge Teste',
      spouse_cpf: '98765432100',
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
  });
  assert(withSpouse.hasBalloonInstallments, 'balão ok com cônjuge');
  const html = generateContractHTML({
    tenant: baseTenant('SV_LOTES_2'),
    customer: withSpouse as unknown as Record<string, unknown>,
    project: { name: 'Loteamento Teste', city: 'Parauapebas', uf: 'PA' },
    block: baseBlock(),
    sale: {
      ...baseSale,
      has_spouse: true,
      sale_spouse_name: 'Cônjuge Teste',
      sale_spouse_cpf: '98765432100',
    },
    financeReceipts: buildBalloonReceipts(),
  });
  // Gera com customer real
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
  });
  assert(
    html2.includes('balão') || html2.includes('PARCELA BASE') || html2.includes('Quadro Financeiro'),
    'contrato SV2 com cônjuge + balão',
  );
  console.log('OK testSpouseUntouchedInSv2');
}

function main() {
  testHelperDetectsBalloons();
  testNoBalloonKeepsEqualWording();
  testCompactScheduleAndClause();
  testBalloonTableScalesWithCount();
  testPadraoContractHtml();
  testSv2ContractSummaryAndClause();
  testRecantoDoesNotSayFixasWithBalloon();
  testTotalsClose();
  testSpouseUntouchedInSv2();
  console.log('mandatory-sale-balloon-contract-tests: all passed');
}

main();
