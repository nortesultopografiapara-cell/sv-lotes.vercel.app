/**
 * Primeiro vencimento no Quadro Financeiro — sem limite artificial de 30 dias.
 * npx tsx scripts/mandatory-contract-first-due-date-tests.ts
 *
 * Cobre o defeito Meneses 000000059/2026: Quadro com "—" apesar de
 * finance_receipts / first_installment_due_date terem 2026-09-07.
 */

import { generateContractHTML } from '../lib/contractTemplate';
import {
  formatContractDueDateBr,
  resolveContractPaymentDates,
} from '../lib/contractPaymentDates';
import {
  buildCompactBalloonFinanceScheduleHtml,
  resolveSaleContractBalloonFinance,
} from '../lib/saleContractBalloonFinance';
import { buildSaleContractPaymentSummaryHtml } from '../lib/saleContractPaymentSummary';
import { buildSvLotes2SummaryHtml } from '../lib/svLotes2ContractClauses';
import { buildSvLotes2ContractContext } from '../lib/svLotes2ContractContext';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function extractQuadroFirstDue(html: string): string | null {
  const m = html.match(
    /Primeiro vencimento[\s\S]*?contract-finance-value[^>]*>([^<]+)</i,
  );
  return m?.[1]?.replace(/\u00a0/g, ' ').trim() || null;
}

function baseTenant(model: string) {
  return {
    id: 'co-meneses',
    name: 'Meneses Imobiliaria Ltda',
    razao_social: 'Meneses Imobiliaria Ltda',
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
    block: '02',
    number: '11',
    area: 300,
    price: 125000,
  };
}

/** Caso real Meneses 000000059/2026 (~59 dias após a venda). */
function buildMeneses059Receipts() {
  const receipts: Array<{
    installment_number: number;
    amount: number;
    due_date: string;
    status: string;
  }> = [
    {
      installment_number: 0,
      amount: 875,
      due_date: '2026-08-07',
      status: 'pendente',
    },
  ];
  for (let i = 1; i <= 99; i++) {
    const d = new Date(Date.UTC(2026, 8, 7)); // 2026-09-07
    d.setUTCMonth(d.getUTCMonth() + (i - 1));
    const due = d.toISOString().slice(0, 10);
    receipts.push({
      installment_number: i,
      amount: i === 24 ? 38375 : 875,
      due_date: due,
      status: 'pendente',
    });
  }
  return receipts;
}

const meneses059Sale = {
  id: 'sale-059',
  payment_type: 'Parcelado',
  lot_price: 125000,
  discount: 0,
  total_value: 125000,
  agreed_price: 125000,
  down_payment: 875,
  installments_count: 99,
  use_balloon_installments: true,
  installment_correction_type: 'NONE',
  sale_date: '2026-07-10',
  first_installment_due_date: '2026-09-07',
  down_payment_due_date: '2026-08-07',
  balloon_config: {
    mode: 'MANUAL',
    manualCount: 1,
    manualRows: [
      {
        installmentNumber: '24',
        additionalAmount: '37500,00',
        dueDate: '',
      },
    ],
  },
};

const meneses059Addons = [
  { installment_number: 24, additional_amount: 37500 },
];

function testResolverPrefersInstallmentOneNotEntry() {
  const dates = resolveContractPaymentDates(
    meneses059Sale,
    buildMeneses059Receipts(),
  );
  assert(dates.entryDueFmt === '07/08/2026', `entrada got ${dates.entryDueFmt}`);
  assert(
    dates.firstInstallmentDueFmt === '07/09/2026',
    `1ª parcela got ${dates.firstInstallmentDueFmt}`,
  );
  assert(dates.firstInstallmentDueRaw === '2026-09-07', 'raw ISO');
  console.log('OK testResolverPrefersInstallmentOneNotEntry');
}

function testResolverFallbackSaleFieldWhenNoReceipts() {
  const dates = resolveContractPaymentDates(
    {
      ...meneses059Sale,
      first_installment_due_date: '2026-09-07',
    },
    [{ installment_number: 0, due_date: '2026-08-07', amount: 875 }],
  );
  assert(
    dates.firstInstallmentDueFmt === '07/09/2026',
    `fallback sale field got ${dates.firstInstallmentDueFmt}`,
  );
  console.log('OK testResolverFallbackSaleFieldWhenNoReceipts');
}

function testFormatIsoNotAmbiguousBr() {
  assert(formatContractDueDateBr('2026-09-07') === '07/09/2026', 'setembro');
  assert(formatContractDueDateBr('2026-07-09') === '09/07/2026', 'julho');
  assert(formatContractDueDateBr(null) === '', 'null → vazio');
  console.log('OK testFormatIsoNotAmbiguousBr');
}

function testWithin30DaysStillWorks() {
  const sale = {
    ...meneses059Sale,
    sale_date: '2026-07-10',
    first_installment_due_date: '2026-08-09',
    use_balloon_installments: true,
    installments_count: 48,
    lot_price: 100,
    total_value: 100,
    agreed_price: 100,
    down_payment: 5,
  };
  const receipts = [
    { installment_number: 0, amount: 5, due_date: '2026-07-10', status: 'pendente' },
    { installment_number: 1, amount: 1.98, due_date: '2026-08-09', status: 'pendente' },
    { installment_number: 6, amount: 2.48, due_date: '2027-01-09', status: 'pendente' },
  ];
  for (let i = 2; i <= 48; i++) {
    if (i === 6) continue;
    receipts.push({
      installment_number: i,
      amount: 1.98,
      due_date: '2026-08-09',
      status: 'pendente',
    });
  }
  const html = generateContractHTML({
    tenant: baseTenant('MENESES'),
    customer: baseCustomer(),
    project: { name: 'Teste', city: 'Parauapebas', uf: 'PA' },
    block: baseBlock(),
    sale,
    financeReceipts: receipts,
    balloonAddons: [{ installment_number: 6, additional_amount: 0.5 }],
  });
  assert(extractQuadroFirstDue(html) === '09/08/2026', '≤30 dias no quadro');
  console.log('OK testWithin30DaysStillWorks');
}

function testMeneses059RealCaseAbout59Days() {
  const html = generateContractHTML({
    tenant: baseTenant('MENESES'),
    customer: baseCustomer(),
    project: { name: 'Chacreamento', city: 'Parauapebas', uf: 'PA' },
    block: baseBlock(),
    sale: meneses059Sale,
    financeReceipts: buildMeneses059Receipts(),
    balloonAddons: meneses059Addons,
  });

  const htmlNorm = html.replace(/\u00a0/g, ' ');
  const firstDue = extractQuadroFirstDue(html);
  assert(firstDue === '07/09/2026', `quadro Meneses got "${firstDue}"`);
  assert(!/Primeiro vencimento[\s\S]{0,160}—/.test(html), 'sem traço vazio');
  assert(htmlNorm.includes('125.000,00'), 'valor venda');
  assert(htmlNorm.includes('875,00'), 'entrada/parcela base');
  assert(htmlNorm.includes('99 parcelas mensais'), '99 parcelas');
  assert(
    htmlNorm.includes('Parcela 24') &&
      htmlNorm.includes('37.500,00') &&
      htmlNorm.includes('38.375,00'),
    'balão 24 preservado',
  );
  console.log('OK testMeneses059RealCaseAbout59Days');
}

function testNinetyDaysAndYearChange() {
  const cases: Array<{ due: string; expected: string; label: string }> = [
    { due: '2026-10-10', expected: '10/10/2026', label: '90 dias' },
    { due: '2027-02-15', expected: '15/02/2027', label: 'mudança de ano' },
  ];

  for (const c of cases) {
    const sale = {
      ...meneses059Sale,
      sale_date: c.label === 'mudança de ano' ? '2026-11-15' : '2026-07-10',
      first_installment_due_date: c.due,
      installments_count: 12,
      lot_price: 10000,
      total_value: 10000,
      agreed_price: 10000,
      down_payment: 1000,
    };
    const receipts = [
      {
        installment_number: 0,
        amount: 1000,
        due_date: '2026-08-01',
        status: 'pendente',
      },
      {
        installment_number: 1,
        amount: 750,
        due_date: c.due,
        status: 'pendente',
      },
      {
        installment_number: 3,
        amount: 2750,
        due_date: c.due,
        status: 'pendente',
      },
    ];
    for (let i = 2; i <= 12; i++) {
      if (i === 3) continue;
      receipts.push({
        installment_number: i,
        amount: 750,
        due_date: c.due,
        status: 'pendente',
      });
    }
    const html = generateContractHTML({
      tenant: baseTenant('PADRAO'),
      customer: baseCustomer(),
      project: { name: 'Teste', city: 'Parauapebas', uf: 'PA' },
      block: { ...baseBlock(), price: 10000 },
      sale,
      financeReceipts: receipts,
      balloonAddons: [{ installment_number: 3, additional_amount: 2000 }],
    });
    assert(
      extractQuadroFirstDue(html) === c.expected,
      `${c.label}: got ${extractQuadroFirstDue(html)}`,
    );
  }
  console.log('OK testNinetyDaysAndYearChange');
}

function testWithoutBalloonSv2StillShowsFirstDue() {
  const sale = {
    ...meneses059Sale,
    use_balloon_installments: false,
    installments_count: 12,
    lot_price: 12000,
    total_value: 12000,
    agreed_price: 12000,
    down_payment: 1000,
    first_installment_due_date: '2026-09-07',
  };
  const receipts = [
    { installment_number: 0, amount: 1000, due_date: '2026-08-07', status: 'pendente' },
  ];
  for (let i = 1; i <= 12; i++) {
    receipts.push({
      installment_number: i,
      amount: 916.67,
      due_date: '2026-09-07',
      status: 'pendente',
    });
  }
  const ctx = buildSvLotes2ContractContext({
    tenant: baseTenant('SV_LOTES_2'),
    customer: baseCustomer(),
    project: { name: 'Teste', city: 'Parauapebas', uf: 'PA' },
    block: { ...baseBlock(), price: 12000 },
    sale,
    financeReceipts: receipts,
    balloonAddons: [],
  });
  const summary = buildSvLotes2SummaryHtml(ctx);
  assert(extractQuadroFirstDue(summary) === '07/09/2026', 'SV2 sem balão');
  console.log('OK testWithoutBalloonSv2StillShowsFirstDue');
}

function testMultipleBalloonsDoNotReplaceFirstDue() {
  const receipts = buildMeneses059Receipts();
  // Força balões 24 e 48 com datas posteriores — 1ª parcela permanece 07/09.
  receipts.find((r) => r.installment_number === 48)!.amount = 38375;
  const addons = [
    { installment_number: 24, additional_amount: 37500 },
    { installment_number: 48, additional_amount: 37500 },
  ];
  const html = generateContractHTML({
    tenant: baseTenant('MENESES'),
    customer: baseCustomer(),
    project: { name: 'Teste', city: 'Parauapebas', uf: 'PA' },
    block: baseBlock(),
    sale: {
      ...meneses059Sale,
      balloon_config: {
        mode: 'MANUAL',
        manualCount: 2,
        manualRows: [
          { installmentNumber: '24', additionalAmount: '37500,00', dueDate: '' },
          { installmentNumber: '48', additionalAmount: '37500,00', dueDate: '' },
        ],
      },
    },
    financeReceipts: receipts,
    balloonAddons: addons,
  });
  assert(extractQuadroFirstDue(html) === '07/09/2026', 'não usa data do balão');
  assert(html.includes('Parcela 24'), 'balão 24');
  assert(html.includes('Parcela 48'), 'balão 48');
  console.log('OK testMultipleBalloonsDoNotReplaceFirstDue');
}

function testPaymentSummaryWithoutFirstDueStillDashesRegressionGuard() {
  // Garante que o builder exige o extra — e que o path Meneses agora o fornece.
  const summary = resolveSaleContractBalloonFinance({
    sale: meneses059Sale,
    financeReceipts: buildMeneses059Receipts(),
    balloonAddons: meneses059Addons,
  });
  const without = buildCompactBalloonFinanceScheduleHtml(summary);
  assert(extractQuadroFirstDue(without) === '—', 'sem extra → traço');

  const withExtra = buildSaleContractPaymentSummaryHtml(
    {
      lotPrice: 125000,
      lotPriceFmt: 'R$ 125.000,00',
      discountAmount: 0,
      discountFmt: 'R$ 0,00',
      entryAmount: 875,
      entryFmt: 'R$ 875,00',
      installmentBalance: 124125,
      installmentBalanceFmt: 'R$ 124.125,00',
      installmentsCount: 99,
      installmentValue: 875,
      installmentValueFmt: 'R$ 875,00',
      correctionLabel: 'Parcelas fixas',
      isCashPayment: false,
      balloonSummary: summary,
    },
    { balloonSummary: summary, firstDueDateFmt: '07/09/2026' },
  );
  assert(extractQuadroFirstDue(withExtra) === '07/09/2026', 'com extra → data');
  console.log('OK testPaymentSummaryWithoutFirstDueStillDashesRegressionGuard');
}

function main() {
  testResolverPrefersInstallmentOneNotEntry();
  testResolverFallbackSaleFieldWhenNoReceipts();
  testFormatIsoNotAmbiguousBr();
  testWithin30DaysStillWorks();
  testMeneses059RealCaseAbout59Days();
  testNinetyDaysAndYearChange();
  testWithoutBalloonSv2StillShowsFirstDue();
  testMultipleBalloonsDoNotReplaceFirstDue();
  testPaymentSummaryWithoutFirstDueStillDashesRegressionGuard();
  console.log('ALL mandatory-contract-first-due-date-tests PASSED');
}

main();
