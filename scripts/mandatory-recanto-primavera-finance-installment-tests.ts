/**
 * Parcelas financeiras — Recanto (sinal não abate) vs PADRAO (entrada abate).
 * npx tsx scripts/mandatory-recanto-primavera-finance-installment-tests.ts
 */

import type { LotFormConfirmPayload } from '../components/map/CustomerLotFormModal';
import { generateContractHTML } from '../lib/contractTemplate';
import {
  computeInstallmentDisplayValue,
  expectedSaleFinanceTotal,
  splitInstallmentAmounts,
  resolveInstallmentPrincipal,
} from '../lib/saleInstallmentCalc';
import { buildSaleEditFinancePayloads } from '../lib/saleEditFinanceRecalc';
import {
  fromMoneyCents,
  resolveRecantoLotInstallmentPlan,
  toMoneyCents,
} from '../lib/recantoFixedInstallmentPlan';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const LOT_VALUE = 70960.69;
const DOWN = 3500;
const INSTALLMENTS = 4;

const recantoTenant = {
  name: 'IVANILDE DE MOURA SILVA',
  contract_model: 'RECANTO_PRIMAVERA',
  cnpj: '32641281104',
  contract_legal_nationality: 'Brasileira',
  contract_legal_marital_status: 'Solteira',
  contract_legal_profession: 'Agricultora',
  contract_legal_rg: '1234567',
  contract_legal_rg_issuer: 'SSP/PA',
  contract_legal_phone: '(94) 99222-3344',
  contract_legal_email: 'ivanilde@test.com',
  contract_legal_address: 'Rua Teste',
  contract_bank_name: 'Sicredi',
  contract_bank_branch: '0804',
  contract_bank_account: '91047-5',
  contract_bank_beneficiary: 'Ivanilde',
  city: 'Parauapebas',
  state: 'PA',
};

const baseForm = (): LotFormConfirmPayload =>
  ({
    name: 'Cliente Teste',
    cpf_cnpj: '98765432100',
    payment_type: 'Parcelado',
    discount_value: '0',
    down_payment: String(DOWN),
    down_payment_due_date: '2026-07-01',
    installments_count: String(INSTALLMENTS),
    first_installment_due_date: '2026-08-01',
    broker_id: '',
    notes: '',
    reservation_signal_paid: 0,
    lot_value: LOT_VALUE,
    final_value: LOT_VALUE,
    installment_value: 0,
  }) as LotFormConfirmPayload;

const lot = { id: 'block-1', project_id: 'proj-1' };

function sumInstallmentPayloads(
  payloads: ReturnType<typeof buildSaleEditFinancePayloads>,
): number {
  return payloads
    .filter((p) => Number(p.installment_number) >= 1)
    .reduce((s, p) => s + Number(p.amount || 0), 0);
}

function testRecantoInstallmentsDoNotSubtractSignal() {
  const form = baseForm();
  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
    { contractModel: 'RECANTO_PRIMAVERA' },
  );

  const monthly = payloads.filter((p) => Number(p.installment_number) >= 1);
  assert(monthly.length === INSTALLMENTS, '4 parcelas mensais');

  const amounts = monthly.map((p) => Number(p.amount));
  const expected = splitInstallmentAmounts(LOT_VALUE, INSTALLMENTS);
  for (let i = 0; i < INSTALLMENTS; i++) {
    assert(
      Math.abs(amounts[i] - expected[i]) < 0.01,
      `parcela ${i + 1}: esperado ${expected[i]}, got ${amounts[i]}`,
    );
  }

  assert(
    Math.abs(amounts[0] - 17740.17) < 0.01,
    `1ª parcela ~17740.17, got ${amounts[0]}`,
  );
  assert(
    Math.abs(sumInstallmentPayloads(payloads) - LOT_VALUE) < 0.02,
    'parcelas somam valor total do lote',
  );

  const signalLine = payloads.find((p) => Number(p.installment_number) === 0);
  assert(signalLine != null, 'sinal como installment 0');
  assert(Number(signalLine?.amount) === DOWN, 'sinal separado');

  const display = computeInstallmentDisplayValue({
    finalValue: LOT_VALUE,
    downPayment: DOWN,
    installmentsCount: INSTALLMENTS,
    contractModel: 'RECANTO_PRIMAVERA',
  });
  assert(Math.abs(display - 17740.17) < 0.01, 'valor exibido da parcela Recanto');

  console.log('OK testRecantoInstallmentsDoNotSubtractSignal');
}

function testPadraoInstallmentsSubtractEntry() {
  const form = baseForm();
  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
    { contractModel: 'PADRAO' },
  );

  const principal = resolveInstallmentPrincipal({
    totalValue: LOT_VALUE,
    downPayment: DOWN,
    contractModel: 'PADRAO',
  });
  assert(Math.abs(principal - 67460.69) < 0.01, 'saldo parcelado PADRAO');

  const monthly = payloads.filter((p) => Number(p.installment_number) >= 1);
  const amounts = monthly.map((p) => Number(p.amount));
  const expected = splitInstallmentAmounts(principal, INSTALLMENTS);
  assert(
    Math.abs(amounts[0] - expected[0]) < 0.01,
    `PADRAO parcela 1 ~16865.17, got ${amounts[0]}`,
  );
  assert(
    Math.abs(amounts[0] - 16865.17) < 0.01,
    `PADRAO parcela 1 ~16865.17, got ${amounts[0]}`,
  );
  assert(
    Math.abs(sumInstallmentPayloads(payloads) - principal) < 0.02,
    'PADRAO parcelas somam saldo após entrada',
  );

  const display = computeInstallmentDisplayValue({
    finalValue: LOT_VALUE,
    downPayment: DOWN,
    installmentsCount: INSTALLMENTS,
    contractModel: 'PADRAO',
  });
  assert(Math.abs(display - 16865.17) < 0.01, 'valor exibido PADRAO');

  console.log('OK testPadraoInstallmentsSubtractEntry');
}

function testRecantoContractSaldoNotReduced() {
  const html = generateContractHTML({
    tenant: recantoTenant,
    customer: {
      name: 'João Silva',
      document: '98765432100',
      cpf: '98765432100',
      profession: 'Motorista',
      civil_state: 'Casado',
      phone: '(94) 98888-7777',
      email: 'joao@test.com',
      address: 'Rua A',
      city: 'Parauapebas',
      state: 'PA',
    },
    project: {
      name: 'CHACREAMENTO RECANTO PRIMAVERA',
      city: 'Parauapebas',
      uf: 'PA',
    },
    block: { quadra: '01', lot: '01', area: 300 },
    sale: {
      payment_type: 'Parcelado',
      total_value: LOT_VALUE,
      down_payment: DOWN,
      installments_count: INSTALLMENTS,
      first_installment_due_date: '2026-08-01',
    },
    contractDate: '2026-06-17',
  });

  const normalized = html.replace(/\u00a0/g, ' ');
  assert(normalized.includes('R$ 70.960,69'), 'saldo parcelado = valor total');
  assert(normalized.includes('R$ 3.500,00'), 'sinal no contrato');
  assert(!normalized.includes('R$ 67.460,69'), 'sem saldo reduzido pelo sinal');

  console.log('OK testRecantoContractSaldoNotReduced');
}

function testRecantoExpectedFinanceTotal() {
  const expected = expectedSaleFinanceTotal({
    finalValue: LOT_VALUE,
    grossDownPayment: DOWN,
    contractModel: 'RECANTO_PRIMAVERA',
    paymentType: 'Parcelado',
  });
  assert(
    Math.abs(expected - (LOT_VALUE + DOWN)) < 0.01,
    'total financeiro Recanto = lote + sinal',
  );

  const padraoExpected = expectedSaleFinanceTotal({
    finalValue: LOT_VALUE,
    grossDownPayment: DOWN,
    contractModel: 'PADRAO',
    paymentType: 'Parcelado',
  });
  assert(Math.abs(padraoExpected - LOT_VALUE) < 0.01, 'PADRAO total = lote');

  console.log('OK testRecantoExpectedFinanceTotal');
}

/** Cenário 1: sinal 3500, pago 800, restante 2700 em 15 primeiras parcelas. */
function testRecantoSignalRemainingFirstInstallments() {
  const lotValue = 60000;
  const installments = 120;
  const form = {
    ...baseForm(),
    down_payment: '3500',
    signal_contract_value: '3500',
    signal_paid_at_sale: '800',
    signal_remaining_payment_mode: 'FIRST_INSTALLMENTS' as const,
    signal_remaining_installments: '15',
    installments_count: String(installments),
    lot_value: lotValue,
    final_value: lotValue,
  };

  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
    { contractModel: 'RECANTO_PRIMAVERA' },
  );

  const signalLine = payloads.find((p) => Number(p.installment_number) === 0);
  assert(Number(signalLine?.amount) === 800, 'sinal no ato = 800');
  assert(signalLine?.status === 'pago', 'sinal no ato marcado como pago');

  const monthly = payloads.filter((p) => Number(p.installment_number) >= 1);
  assert(monthly.length === installments, '120 parcelas');

  const base = 500;
  for (let i = 0; i < 15; i++) {
    assert(
      Math.abs(Number(monthly[i].amount) - 680) < 0.01,
      `parcela ${i + 1} = 680 (500+180), got ${monthly[i].amount}`,
    );
    assert(Number(monthly[i].base_amount) === base, `base parcela ${i + 1}`);
    assert(
      Math.abs(Number(monthly[i].signal_addon_amount) - 180) < 0.01,
      `addon parcela ${i + 1}`,
    );
  }
  for (let i = 15; i < installments; i++) {
    assert(
      Math.abs(Number(monthly[i].amount) - base) < 0.01,
      `parcela ${i + 1} = 500, got ${monthly[i].amount}`,
    );
    assert(Number(monthly[i].signal_addon_amount || 0) === 0, `sem addon ${i + 1}`);
  }

  const html = generateContractHTML({
    tenant: recantoTenant,
    customer: {
      name: 'João Silva',
      document: '98765432100',
      cpf: '98765432100',
      profession: 'Motorista',
      civil_state: 'Casado',
      phone: '(94) 98888-7777',
      email: 'joao@test.com',
      address: 'Rua A',
      city: 'Parauapebas',
      state: 'PA',
    },
    project: {
      name: 'CHACREAMENTO RECANTO PRIMAVERA',
      city: 'Parauapebas',
      uf: 'PA',
    },
    block: { quadra: '01', lot: '01', area: 300 },
    sale: {
      payment_type: 'Parcelado',
      total_value: lotValue,
      down_payment: 3500,
      signal_contract_value: 3500,
      signal_paid_at_sale: 800,
      signal_remaining_value: 2700,
      signal_remaining_payment_mode: 'FIRST_INSTALLMENTS',
      signal_remaining_installments: 15,
      signal_remaining_installment_value: 180,
      installments_count: installments,
      first_installment_due_date: '2026-08-01',
    },
    contractDate: '2026-06-17',
  });
  const normalized = html.replace(/\u00a0/g, ' ');
  assert(normalized.includes('R$ 3.500,00'), 'sinal contratado no contrato');
  assert(normalized.includes('R$ 800,00'), 'pago no ato no contrato');
  assert(normalized.includes('R$ 2.700,00'), 'restante no contrato');
  assert(normalized.includes('15 parcelas'), 'qtd parcelas do restante');
  assert(normalized.includes('R$ 180,00'), 'complemento do sinal no quadro');
  assert(normalized.includes('não será abatido'), 'cláusula sinal não abate');
  assert(
    normalized.includes('observando-se os valores constantes no quadro de pagamento'),
    'parágrafo terceiro sem valor único',
  );
  assert(
    !/no valor de\s*<strong>R\$\s*[\d.,]+<\/strong>\s*cada/i.test(html),
    'não afirma R$ X cada quando parcelas variam',
  );
  assert(normalized.includes('Valor base'), 'quadro com valor base');
  assert(normalized.includes('Complemento do sinal'), 'quadro com complemento');
  assert(normalized.includes('1 a 15'), 'faixa com complemento');
  assert(normalized.includes('16 a 120'), 'faixa sem complemento');

  console.log('OK testRecantoSignalRemainingFirstInstallments');
}

/** Cenário 2: sinal pago integralmente no ato — sem acréscimo. */
function testRecantoSignalFullyPaidAtSale() {
  const lotValue = 60000;
  const installments = 120;
  const form = {
    ...baseForm(),
    down_payment: '3500',
    signal_contract_value: '3500',
    signal_paid_at_sale: '3500',
    signal_remaining_payment_mode: 'FIRST_INSTALLMENTS' as const,
    signal_remaining_installments: '15',
    installments_count: String(installments),
    lot_value: lotValue,
    final_value: lotValue,
  };

  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
    { contractModel: 'RECANTO_PRIMAVERA' },
  );

  const monthly = payloads.filter((p) => Number(p.installment_number) >= 1);
  for (const row of monthly) {
    assert(Number(row.signal_addon_amount || 0) === 0, 'sem acréscimo');
    assert(Math.abs(Number(row.amount) - 500) < 0.01, 'parcela base 500');
  }

  const html = generateContractHTML({
    tenant: recantoTenant,
    customer: {
      name: 'João Silva',
      document: '98765432100',
      cpf: '98765432100',
      profession: 'Motorista',
      civil_state: 'Casado',
      phone: '(94) 98888-7777',
      email: 'joao@test.com',
      address: 'Rua A',
      city: 'Parauapebas',
      state: 'PA',
    },
    project: {
      name: 'CHACREAMENTO RECANTO PRIMAVERA',
      city: 'Parauapebas',
      uf: 'PA',
    },
    block: { quadra: '01', lot: '01', area: 300 },
    sale: {
      payment_type: 'Parcelado',
      total_value: lotValue,
      down_payment: 3500,
      signal_contract_value: 3500,
      signal_paid_at_sale: 3500,
      signal_remaining_value: 0,
      installments_count: installments,
      first_installment_due_date: '2026-08-01',
    },
    contractDate: '2026-06-17',
  });
  const normalized = html.replace(/\u00a0/g, ' ');
  assert(
    normalized.includes('pago integralmente no ato'),
    'contrato informa sinal integral no ato',
  );
  assert(
    !normalized.includes('Complemento do sinal'),
    'sem quadro de complemento indevido',
  );
  assert(
    normalized.includes('observando-se os valores constantes no quadro de pagamento'),
    'parágrafo terceiro remete ao quadro',
  );

  console.log('OK testRecantoSignalFullyPaidAtSale');
}

/** Cenário 3: restante diluído em todas as 120 parcelas. */
function testRecantoSignalRemainingAllInstallments() {
  const lotValue = 60000;
  const installments = 120;
  const form = {
    ...baseForm(),
    down_payment: '3500',
    signal_contract_value: '3500',
    signal_paid_at_sale: '800',
    signal_remaining_payment_mode: 'ALL_INSTALLMENTS' as const,
    signal_remaining_installments: '',
    installments_count: String(installments),
    lot_value: lotValue,
    final_value: lotValue,
  };

  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
    { contractModel: 'RECANTO_PRIMAVERA' },
  );

  const monthly = payloads.filter((p) => Number(p.installment_number) >= 1);
  const addonTotal = monthly.reduce(
    (s, p) => s + Number(p.signal_addon_amount || 0),
    0,
  );
  assert(Math.abs(addonTotal - 2700) < 0.05, 'soma dos acréscimos = 2700');
  for (const row of monthly) {
    assert(Number(row.signal_addon_amount) > 0, 'todas recebem acréscimo');
    assert(Number(row.amount) > Number(row.base_amount), 'total > base');
  }

  const html = generateContractHTML({
    tenant: recantoTenant,
    customer: {
      name: 'João Silva',
      document: '98765432100',
      cpf: '98765432100',
      profession: 'Motorista',
      civil_state: 'Casado',
      phone: '(94) 98888-7777',
      email: 'joao@test.com',
      address: 'Rua A',
      city: 'Parauapebas',
      state: 'PA',
    },
    project: {
      name: 'CHACREAMENTO RECANTO PRIMAVERA',
      city: 'Parauapebas',
      uf: 'PA',
    },
    block: { quadra: '01', lot: '01', area: 300 },
    sale: {
      payment_type: 'Parcelado',
      total_value: lotValue,
      down_payment: 3500,
      signal_contract_value: 3500,
      signal_paid_at_sale: 800,
      signal_remaining_value: 2700,
      signal_remaining_payment_mode: 'ALL_INSTALLMENTS',
      signal_remaining_installments: 120,
      signal_remaining_installment_value: 22.5,
      installments_count: installments,
      first_installment_due_date: '2026-08-01',
    },
    contractDate: '2026-06-17',
  });
  const normalized = html.replace(/\u00a0/g, ' ');
  assert(
    normalized.includes('diluído nas 120 parcelas'),
    'texto diluição em todas as parcelas',
  );
  assert(
    normalized.includes('conforme quadro de pagamento deste contrato'),
    'cláusula remete ao quadro (sem valor único cada)',
  );
  assert(
    !/no valor de\s*<strong>R\$\s*[\d.,]+<\/strong>\s*cada/i.test(html),
    'não afirma R$ X cada com diluição/arredondamento',
  );
  assert(normalized.includes('Complemento do sinal'), 'quadro com complemento');
  assert(normalized.includes('1 a 120'), 'faixa todas as parcelas');

  console.log('OK testRecantoSignalRemainingAllInstallments');
}

/** Cenário 4: Meneses/PADRAO inalterado. */
function testMenesesUnchangedWithSignalFieldsAbsent() {
  const form = {
    ...baseForm(),
    signal_contract_value: '',
    signal_paid_at_sale: '',
    signal_remaining_payment_mode: '' as const,
    signal_remaining_installments: '',
  };
  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-1',
    'cust-1',
    null,
    lot,
    form,
    { contractModel: 'PADRAO' },
  );

  const principal = resolveInstallmentPrincipal({
    totalValue: LOT_VALUE,
    downPayment: DOWN,
    contractModel: 'PADRAO',
  });
  const monthly = payloads.filter((p) => Number(p.installment_number) >= 1);
  const expected = splitInstallmentAmounts(principal, INSTALLMENTS);
  assert(
    Math.abs(Number(monthly[0].amount) - expected[0]) < 0.01,
    'PADRAO parcela inalterada',
  );
  assert(
    monthly.every((p) => Number(p.signal_addon_amount || 0) === 0),
    'PADRAO sem addon de sinal',
  );

  const html = generateContractHTML({
    tenant: { name: 'MENESES', contract_model: 'PADRAO', cnpj: '123' },
    customer: {
      name: 'João Silva',
      document: '98765432100',
      cpf: '98765432100',
    },
    project: { name: 'Meneses', city: 'Parauapebas', uf: 'PA' },
    block: { quadra: '01', lot: '01', area: 300 },
    sale: {
      payment_type: 'Parcelado',
      total_value: LOT_VALUE,
      down_payment: DOWN,
      installments_count: INSTALLMENTS,
      first_installment_due_date: '2026-08-01',
    },
    contractDate: '2026-06-17',
  });
  assert(!html.includes('sinal contratual'), 'PADRAO sem cláusula de sinal Recanto');
  assert(!html.includes('não será abatido do valor do lote'), 'PADRAO sem texto Recanto');

  console.log('OK testMenesesUnchangedWithSignalFieldsAbsent');
}

/** Caso referência: R$ 73.296,99 / 122×597,97 + residual 344,65 + sinal diluído. */
function testRecantoFixedAmountWithResidualReferenceCase() {
  const LOT = 73296.99;
  const FIXED = 597.97;
  const COUNT = 122;
  const SIGNAL = 3500;
  const PAID = 1750;

  const form = {
    ...baseForm(),
    lot_value: LOT,
    final_value: LOT,
    down_payment: String(SIGNAL),
    signal_contract_value: String(SIGNAL),
    signal_paid_at_sale: String(PAID),
    signal_remaining_payment_mode: 'FIRST_INSTALLMENTS' as const,
    signal_remaining_installments: '20',
    installments_count: String(COUNT),
    installment_definition_mode: 'FIXED_AMOUNT',
    regular_installment_amount: String(FIXED),
    generate_residual_installment: true,
  };

  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-fixed-1',
    'cust-1',
    null,
    lot,
    form,
    { contractModel: 'RECANTO_PRIMAVERA' },
  );

  const signalRow = payloads.find((p) => Number(p.installment_number) === 0);
  const monthly = payloads
    .filter((p) => Number(p.installment_number) >= 1)
    .sort(
      (a, b) =>
        Number(a.installment_number) - Number(b.installment_number),
    );

  assert(Boolean(signalRow), 'sinal linha 0');
  assert(Math.abs(Number(signalRow!.amount) - PAID) < 0.01, 'sinal pago no ato');
  assert(monthly.length === 123, `123 vencimentos (got ${monthly.length})`);
  assert(
    Number(monthly[122]!.installment_number) === 123,
    'residual é installment_number 123',
  );

  for (let i = 0; i < 20; i++) {
    assert(
      Math.abs(Number(monthly[i]!.amount) - 685.47) < 0.01,
      `parcela ${i + 1} = 685,47`,
    );
    assert(
      Math.abs(Number(monthly[i]!.base_amount) - 597.97) < 0.01,
      `base ${i + 1} = 597,97`,
    );
    assert(
      Math.abs(Number(monthly[i]!.signal_addon_amount) - 87.5) < 0.01,
      `addon ${i + 1} = 87,50`,
    );
  }
  for (let i = 20; i < 122; i++) {
    assert(
      Math.abs(Number(monthly[i]!.amount) - 597.97) < 0.01,
      `parcela ${i + 1} = 597,97`,
    );
    assert(
      Number(monthly[i]!.signal_addon_amount || 0) === 0,
      `sem addon na ${i + 1}`,
    );
  }
  assert(
    Math.abs(Number(monthly[122]!.amount) - 344.65) < 0.01,
    'residual 344,65',
  );
  assert(
    Number(monthly[122]!.signal_addon_amount || 0) === 0,
    'residual sem complemento de sinal',
  );

  const basesSum = monthly.reduce(
    (s, p) => s + Number(p.base_amount || 0),
    0,
  );
  assert(Math.abs(basesSum - LOT) < 0.01, 'soma bases = valor do lote');

  const expectedTotal = expectedSaleFinanceTotal({
    finalValue: LOT,
    grossDownPayment: SIGNAL,
    contractModel: 'RECANTO_PRIMAVERA',
    paymentType: 'Parcelado',
  });
  const allSum = payloads.reduce((s, p) => s + Number(p.amount || 0), 0);
  assert(
    Math.abs(allSum - expectedTotal) < 0.02,
    `total financeiro fecha (${allSum} vs ${expectedTotal})`,
  );

  // installments_count da venda permanece 122 (regulares) — o builder não altera sales;
  // documentamos que o residual é receipt normal da mesma venda (não fluxo separado).
  assert(
    Number(form.installments_count) === 122,
    'sales.installments_count = quantidade regular',
  );

  const html = generateContractHTML({
    tenant: recantoTenant,
    customer: {
      name: 'Cliente Teste',
      document: '98765432100',
      cpf: '98765432100',
    },
    project: {
      name: 'Recanto Primavera',
      city: 'Parauapebas',
      uf: 'PA',
    },
    block: { quadra: '01', lot: '01', area: 300 },
    sale: {
      payment_type: 'Parcelado',
      total_value: LOT,
      down_payment: SIGNAL,
      signal_contract_value: SIGNAL,
      signal_paid_at_sale: PAID,
      signal_remaining_value: SIGNAL - PAID,
      signal_remaining_payment_mode: 'FIRST_INSTALLMENTS',
      signal_remaining_installments: 20,
      signal_remaining_installment_value: 87.5,
      installments_count: COUNT,
      installment_definition_mode: 'FIXED_AMOUNT',
      regular_installment_amount: FIXED,
      has_residual_installment: true,
      residual_installment_amount: 344.65,
      first_installment_due_date: '2026-08-01',
    },
    contractDate: '2026-06-17',
  });
  const normalized = html.replace(/\u00a0/g, ' ');
  assert(
    /parcela final de ajuste/i.test(normalized),
    'contrato menciona parcela final de ajuste',
  );
  assert(
    normalized.includes('344,65') || normalized.includes('344.65'),
    'contrato traz valor do residual',
  );
  assert(!/parcelas balão/i.test(normalized), 'residual não é chamado de balão');

  console.log('OK testRecantoFixedAmountWithResidualReferenceCase');
}

function testRecantoFixedAmountResidualZeroNoExtra() {
  const LOT = 1000;
  const form = {
    ...baseForm(),
    lot_value: LOT,
    final_value: LOT,
    down_payment: '0',
    signal_contract_value: '0',
    signal_paid_at_sale: '0',
    installments_count: '10',
    installment_definition_mode: 'FIXED_AMOUNT',
    regular_installment_amount: '100',
    generate_residual_installment: true,
  };
  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-z',
    'cust-1',
    null,
    lot,
    form,
    { contractModel: 'RECANTO_PRIMAVERA' },
  );
  const monthly = payloads.filter((p) => Number(p.installment_number) >= 1);
  assert(monthly.length === 10, 'sem parcela extra quando residual 0');
  console.log('OK testRecantoFixedAmountResidualZeroNoExtra');
}

function testRecantoFixedAmountNegativeResidualBlocked() {
  let threw = false;
  try {
    buildSaleEditFinancePayloads(
      'tenant',
      'sale-neg',
      'cust-1',
      null,
      lot,
      {
        ...baseForm(),
        lot_value: 1000,
        final_value: 1000,
        installments_count: '10',
        installment_definition_mode: 'FIXED_AMOUNT',
        regular_installment_amount: '150',
        generate_residual_installment: true,
      },
      { contractModel: 'RECANTO_PRIMAVERA' },
    );
  } catch {
    threw = true;
  }
  assert(threw, 'residual negativo deve bloquear');
  console.log('OK testRecantoFixedAmountNegativeResidualBlocked');
}

function testRecantoFixedAmountCentsIntegerMath() {
  const lotCents = toMoneyCents(73296.99);
  const unit = toMoneyCents(597.97);
  const residualCents = lotCents - unit * 122;
  assert(residualCents === 34465, `residual cents = 34465 (got ${residualCents})`);
  assert(fromMoneyCents(residualCents) === 344.65, 'fromMoneyCents residual');
  const plan = resolveRecantoLotInstallmentPlan({
    lotValue: 73296.99,
    regularCount: 122,
    mode: 'FIXED_AMOUNT',
    regularAmount: 597.97,
    generateResidual: true,
  });
  assert(plan.ok, 'plan ok');
  assert(plan.hasResidual, 'has residual');
  assert(Math.abs(plan.residualAmount - 344.65) < 0.001, 'residual amount');
  console.log('OK testRecantoFixedAmountCentsIntegerMath');
}

function testRecantoByCountUnchangedWithFixedFieldsAbsent() {
  const form = baseForm();
  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-by',
    'cust-1',
    null,
    lot,
    form,
    { contractModel: 'RECANTO_PRIMAVERA' },
  );
  const monthly = payloads.filter((p) => Number(p.installment_number) >= 1);
  const expected = splitInstallmentAmounts(LOT_VALUE, INSTALLMENTS);
  assert(monthly.length === INSTALLMENTS, 'BY_COUNT qtd');
  assert(
    Math.abs(Number(monthly[0]!.amount) - expected[0]) < 0.01,
    'BY_COUNT média preservada',
  );
  console.log('OK testRecantoByCountUnchangedWithFixedFieldsAbsent');
}

/**
 * Documenta comportamento atual: cancelamento de contrato NÃO cancela finance_receipts.
 * O residual entra no mesmo conjunto de receipts da venda (installment_number N+1).
 */
function testRecantoResidualIsNormalSaleReceiptNotSeparateFlow() {
  const form = {
    ...baseForm(),
    lot_value: 73296.99,
    final_value: 73296.99,
    installments_count: '122',
    installment_definition_mode: 'FIXED_AMOUNT',
    regular_installment_amount: '597.97',
    generate_residual_installment: true,
    signal_contract_value: '0',
    signal_paid_at_sale: '0',
    down_payment: '0',
  };
  const payloads = buildSaleEditFinancePayloads(
    'tenant',
    'sale-same-set',
    'cust-1',
    null,
    lot,
    form,
    { contractModel: 'RECANTO_PRIMAVERA' },
  );
  assert(
    payloads.every((p) => p.sale_id === 'sale-same-set'),
    'residual no mesmo sale_id',
  );
  assert(
    payloads.some((p) => Number(p.installment_number) === 123),
    'residual é receipt normal N+1',
  );
  console.log(
    'OK testRecantoResidualIsNormalSaleReceiptNotSeparateFlow (cancel contrato ≠ cancel receipts — gap documentado)',
  );
}

function main() {
  testRecantoInstallmentsDoNotSubtractSignal();
  testPadraoInstallmentsSubtractEntry();
  testRecantoContractSaldoNotReduced();
  testRecantoExpectedFinanceTotal();
  testRecantoSignalRemainingFirstInstallments();
  testRecantoSignalFullyPaidAtSale();
  testRecantoSignalRemainingAllInstallments();
  testMenesesUnchangedWithSignalFieldsAbsent();
  testRecantoFixedAmountWithResidualReferenceCase();
  testRecantoFixedAmountResidualZeroNoExtra();
  testRecantoFixedAmountNegativeResidualBlocked();
  testRecantoFixedAmountCentsIntegerMath();
  testRecantoByCountUnchangedWithFixedFieldsAbsent();
  testRecantoResidualIsNormalSaleReceiptNotSeparateFlow();
  console.log('OK — mandatory-recanto-primavera-finance-installment-tests passed');
}

main();
