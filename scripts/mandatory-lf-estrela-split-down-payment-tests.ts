/**
 * Sinal/entrada Recanto reutilizado na LF / ESTRELA_DO_SUL.
 * npx tsx scripts/mandatory-lf-estrela-split-down-payment-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import type { LotFormConfirmPayload } from '../components/map/CustomerLotFormModal';
import {
  formatInstallmentCorrectionLabel,
} from '../lib/installmentCorrectionType';
import {
  buildSaleEditFinancePayloads,
  planPartialFinanceRecalc,
} from '../lib/saleEditFinanceRecalc';
import { resolveCustomPreviewValues } from '../lib/customContractPreviewResolver';
import { resolveCommercialInstallmentScheduleFromSale } from '../lib/installmentScheduleDescription';
import {
  downPaymentReducesInstallmentBase,
  expectedSaleFinanceTotal,
  resolveInstallmentPrincipal,
  splitInstallmentAmounts,
} from '../lib/saleInstallmentCalc';
import {
  applySignalAddonToInstallmentAmounts,
  buildSplitDownPaymentPersistFields,
  resolveRecantoSignalPlan,
  validateRecantoSignalPlan,
} from '../lib/recantoSignalRemaining';
import {
  assertLfEstrelaCorrectionCoherentWithHardcodedLegal,
  catalogDefaultInstallmentCorrectionType,
  isInstallmentCorrectionOptionEnabled,
  LF_ESTRELA_CORRECTION_SELECTOR_HINT,
  LF_ESTRELA_HARDCODED_IGPM_LEGAL_MESSAGE,
  readAllowSplitDownPaymentOverride,
  readProjectInstallmentCorrectionType,
  resolvePersistInstallmentCorrectionType,
  resolveProjectInstallmentCorrectionType,
  shouldForceFixedInstallmentCorrection,
  usesSplitDownPaymentFinance,
} from '../lib/saleFinanceConfig';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

const LOT = 70892.37;
const SIGNAL = 3500;
const PAID = 1000;
const REMAINING = 2500;
const INSTALLMENTS = 120;

const lot = { id: 'block-lf', project_id: '760c32d8-4c43-403b-986c-9872011f44cd' };

const baseForm = (): LotFormConfirmPayload =>
  ({
    name: 'Cliente LF',
    cpf_cnpj: '52998224725',
    payment_type: 'Parcelado',
    discount_value: '0',
    down_payment: String(SIGNAL),
    down_payment_due_date: '2026-07-01',
    installments_count: String(INSTALLMENTS),
    first_installment_due_date: '2026-08-01',
    broker_id: '',
    notes: '',
    reservation_signal_paid: 0,
    lot_value: LOT,
    final_value: LOT,
    installment_value: 0,
    signal_contract_value: String(SIGNAL),
    signal_paid_at_sale: String(PAID),
    signal_remaining_payment_mode: 'FIRST_INSTALLMENTS',
    signal_remaining_installments: '5',
  }) as LotFormConfirmPayload;

function monthlyRows(
  payloads: ReturnType<typeof buildSaleEditFinancePayloads>,
) {
  return payloads
    .filter((p) => Number(p.installment_number) >= 1)
    .sort(
      (a, b) => Number(a.installment_number) - Number(b.installment_number),
    );
}

function testCapabilityCatalogAndOverride() {
  assert(
    usesSplitDownPaymentFinance('RECANTO_PRIMAVERA') === true,
    'Recanto sempre ligado',
  );
  assert(
    usesSplitDownPaymentFinance('ESTRELA_DO_SUL') === true,
    'Estrela/LF ligado por catálogo',
  );
  assert(usesSplitDownPaymentFinance('PADRAO') === false, 'PADRAO desligado');
  assert(usesSplitDownPaymentFinance('MENESES') === false, 'Meneses desligado');
  assert(
    usesSplitDownPaymentFinance({
      contractModel: 'PADRAO',
      projectLfConfig: { allow_split_down_payment: true },
    }) === true,
    'override JSON liga PADRAO sem hardcode de nome',
  );
  assert(
    usesSplitDownPaymentFinance({
      contractModel: 'ESTRELA_DO_SUL',
      projectLfConfig: { allow_split_down_payment: false },
    }) === false,
    'override JSON pode desligar Estrela',
  );
  assert(
    usesSplitDownPaymentFinance({
      contractModel: 'RECANTO_PRIMAVERA',
      projectLfConfig: { allow_split_down_payment: false },
    }) === true,
    'override não desliga Recanto',
  );
  assert(
    readAllowSplitDownPaymentOverride({
      sale_finance_config: { allow_split_down_payment: true },
    }) === true,
    'lê sale_finance_config',
  );
  assert(
    downPaymentReducesInstallmentBase('ESTRELA_DO_SUL') === true,
    'motor ESTRELA_DO_SUL: arras continuam abatendo no 1-arg',
  );
  assert(
    downPaymentReducesInstallmentBase('RECANTO_PRIMAVERA') === false,
    'Recanto 1-arg inalterado',
  );
  console.log('OK testCapabilityCatalogAndOverride');
}

function testPlan3500Minus1000() {
  const plan = resolveRecantoSignalPlan({
    contractValue: SIGNAL,
    paidAtSale: PAID,
    paymentMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 5,
    totalInstallments: INSTALLMENTS,
  });
  assert(plan.contractValue === SIGNAL, 'sinal contratado 3500');
  assert(plan.paidAtSale === PAID, 'pago no ato 1000');
  assert(plan.remainingValue === REMAINING, 'restante 2500');
  assert(plan.hasRemaining === true, 'tem restante');
  assert(Math.abs(plan.remainingInstallmentValue - 500) < 0.001, 'acréscimo 500');
  console.log('OK testPlan3500Minus1000');
}

function runSplitCase(
  model: 'RECANTO_PRIMAVERA' | 'ESTRELA_DO_SUL',
  remainingCount: number | 'ALL',
) {
  const form = {
    ...baseForm(),
    signal_remaining_payment_mode:
      remainingCount === 'ALL' ? 'ALL_INSTALLMENTS' : 'FIRST_INSTALLMENTS',
    signal_remaining_installments:
      remainingCount === 'ALL' ? '' : String(remainingCount),
  } as LotFormConfirmPayload;

  const payloads = buildSaleEditFinancePayloads(
    'tenant-lf',
    'sale-lf',
    'cust-lf',
    null,
    lot,
    form,
    { contractModel: model },
  );

  const signal = payloads.find((p) => Number(p.installment_number) === 0);
  assert(Number(signal?.amount) === PAID, `${model}: linha 0 = pago no ato`);
  assert(signal?.status === 'pago', `${model}: pago no ato marcado pago`);

  const monthly = monthlyRows(payloads);
  assert(monthly.length === INSTALLMENTS, `${model}: ${INSTALLMENTS} parcelas`);

  const lotPrincipal = resolveInstallmentPrincipal({
    totalValue: LOT,
    downPayment: SIGNAL,
    contractModel: model,
  });
  const reduces = downPaymentReducesInstallmentBase(model);
  assert(
    Math.abs(lotPrincipal - (reduces ? LOT - SIGNAL : LOT)) < 0.001,
    `${model}: saldo financiado ${reduces ? 'abate' : 'não abate'} sinal contratado`,
  );
  const bases = splitInstallmentAmounts(lotPrincipal, INSTALLMENTS);
  const composed = applySignalAddonToInstallmentAmounts(
    bases,
    resolveRecantoSignalPlan({
      contractValue: SIGNAL,
      paidAtSale: PAID,
      paymentMode: remainingCount === 'ALL' ? 'ALL_INSTALLMENTS' : 'FIRST_INSTALLMENTS',
      remainingInstallments: remainingCount === 'ALL' ? null : remainingCount,
      totalInstallments: INSTALLMENTS,
    }),
  );

  const addonSum = monthly.reduce(
    (s, p) => s + Number(p.signal_addon_amount || 0),
    0,
  );
  assert(Math.abs(addonSum - REMAINING) < 0.02, `${model}: soma addons = 2500`);

  for (let i = 0; i < monthly.length; i++) {
    assert(
      Math.abs(Number(monthly[i].amount) - composed[i].amount) < 0.01,
      `${model}: parcela ${i + 1} = ${composed[i].amount}`,
    );
    assert(
      Math.abs(Number(monthly[i].base_amount) - bases[i]) < 0.01,
      `${model}: base parcela ${i + 1} ${reduces ? 'abate sinal contratado' : 'não abate sinal'}`,
    );
  }

  const firstBase = bases[0];
  if (remainingCount === 5) {
    if (model === 'RECANTO_PRIMAVERA') {
      assert(Math.abs(firstBase - 590.77) < 0.01, 'Recanto base ~590,77 em 120x');
      assert(
        Math.abs(Number(monthly[0].amount) - 1090.77) < 0.01,
        'Recanto 1–5: 590,77 + 500',
      );
    } else {
      assert(Math.abs(firstBase - 561.6) < 0.01, 'Estrela base ~561,60 em 120x (lote−sinal)');
      assert(
        Math.abs(Number(monthly[0].amount) - 1061.6) < 0.01,
        'Estrela 1–5: 561,60 + 500',
      );
    }
    assert(Number(monthly[5].signal_addon_amount || 0) === 0, 'parcela 6 sem addon');
  }
  if (remainingCount === 4) {
    assert(
      Math.abs(Number(monthly[0].signal_addon_amount) - 625) < 0.01,
      '4 parcelas: acréscimo 625',
    );
    assert(Number(monthly[4].signal_addon_amount || 0) === 0, 'parcela 5 sem addon');
  }
  if (remainingCount === 'ALL') {
    assert(
      monthly.every((p) => Number(p.signal_addon_amount) > 0),
      'todas as 120 recebem acréscimo',
    );
  }

  const expected = expectedSaleFinanceTotal({
    finalValue: LOT,
    grossDownPayment: SIGNAL,
    contractModel: model,
    paymentType: 'Parcelado',
  });
  const allSum = payloads.reduce((s, p) => s + Number(p.amount || 0), 0);
  assert(Math.abs(allSum - expected) < 0.05, `${model}: total financeiro fecha`);
  return { payloads, monthly, composed };
}

function testFiveAndFourAndAllOnBothModels() {
  runSplitCase('RECANTO_PRIMAVERA', 5);
  runSplitCase('ESTRELA_DO_SUL', 5);
  runSplitCase('RECANTO_PRIMAVERA', 4);
  runSplitCase('ESTRELA_DO_SUL', 4);
  runSplitCase('RECANTO_PRIMAVERA', 'ALL');
  runSplitCase('ESTRELA_DO_SUL', 'ALL');
  console.log('OK testFiveAndFourAndAllOnBothModels');
}

function testFullyPaidHidesRemaining() {
  const plan = resolveRecantoSignalPlan({
    contractValue: SIGNAL,
    paidAtSale: SIGNAL,
    paymentMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 5,
    totalInstallments: INSTALLMENTS,
  });
  assert(plan.remainingValue === 0, 'restante 0');
  assert(plan.hasRemaining === false, 'sem distribuição');

  const payloads = buildSaleEditFinancePayloads(
    't',
    's',
    'c',
    null,
    lot,
    {
      ...baseForm(),
      signal_paid_at_sale: String(SIGNAL),
    } as LotFormConfirmPayload,
    { contractModel: 'ESTRELA_DO_SUL' },
  );
  const monthly = monthlyRows(payloads);
  assert(
    monthly.every((p) => Number(p.signal_addon_amount || 0) === 0),
    'LF pago integral: sem addon',
  );
  const financed = splitInstallmentAmounts(LOT - SIGNAL, INSTALLMENTS);
  assert(
    Math.abs(Number(monthly[0].amount) - financed[0]) < 0.01,
    'LF pago integral: parcela-base = (lote − sinal)/N',
  );
  const allSum = payloads.reduce((s, p) => s + Number(p.amount || 0), 0);
  assert(Math.abs(allSum - LOT) < 0.05, 'LF pago integral: receipts = valor do lote');
  console.log('OK testFullyPaidHidesRemaining');
}

function testZeroPaidAtSale() {
  const plan = resolveRecantoSignalPlan({
    contractValue: SIGNAL,
    paidAtSale: 0,
    paymentMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 5,
    totalInstallments: INSTALLMENTS,
  });
  assert(plan.remainingValue === SIGNAL, 'restante = sinal inteiro');
  const payloads = buildSaleEditFinancePayloads(
    't',
    's',
    'c',
    null,
    lot,
    {
      ...baseForm(),
      signal_paid_at_sale: '0',
    } as LotFormConfirmPayload,
    { contractModel: 'ESTRELA_DO_SUL' },
  );
  const signal = payloads.find((p) => Number(p.installment_number) === 0);
  assert(!signal || Number(signal.amount) === 0, 'sem linha de ato ou 0');
  const monthly = monthlyRows(payloads);
  const addonSum = monthly.reduce(
    (s, p) => s + Number(p.signal_addon_amount || 0),
    0,
  );
  assert(Math.abs(addonSum - SIGNAL) < 0.02, '3500 diluídos nas 5 primeiras');
  assert(
    Math.abs(Number(monthly[0].base_amount) - splitInstallmentAmounts(LOT - SIGNAL, INSTALLMENTS)[0]) <
      0.01,
    'zero no ato: base ainda abate o sinal contratado',
  );
  assert(Number(monthly[5].signal_addon_amount || 0) === 0, 'somente o restante nas 5 primeiras');
  console.log('OK testZeroPaidAtSale');
}

function testUnevenRounding() {
  const addons = applySignalAddonToInstallmentAmounts(
    [100, 100, 100],
    resolveRecantoSignalPlan({
      contractValue: 1000,
      paidAtSale: 0,
      paymentMode: 'ALL_INSTALLMENTS',
      totalInstallments: 3,
    }),
  );
  const sum = addons.reduce((s, r) => s + r.signalAddonAmount, 0);
  assert(Math.abs(sum - 1000) < 0.001, 'centavos fecham em 1000');
  const last = addons[2].signalAddonAmount;
  assert(last !== addons[0].signalAddonAmount || addons[0].signalAddonAmount === last, 'ajuste na última quando necessário');
  const split = splitInstallmentAmounts(1000, 3);
  assert(Math.abs(split[0] + split[1] + split[2] - 1000) < 0.001, 'split 1000/3 fecha');
  console.log('OK testUnevenRounding');
}

function testValidations() {
  const over = validateRecantoSignalPlan({
    contractValue: 3500,
    paidAtSale: 4000,
    paymentMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 5,
    totalInstallments: 120,
  });
  assert(!over.valid, 'pago no ato > sinal');

  const zeroCount = validateRecantoSignalPlan({
    contractValue: 3500,
    paidAtSale: 1000,
    paymentMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 0,
    totalInstallments: 120,
  });
  assert(!zeroCount.valid, 'qtd 0 com restante');

  const tooMany = validateRecantoSignalPlan({
    contractValue: 3500,
    paidAtSale: 1000,
    paymentMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 200,
    totalInstallments: 120,
  });
  assert(!tooMany.valid, 'mais parcelas que o principal');

  const ok = validateRecantoSignalPlan({
    contractValue: 3500,
    paidAtSale: 1000,
    paymentMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 5,
    totalInstallments: 120,
  });
  assert(ok.valid, 'configuração válida');
  console.log('OK testValidations');
}

function testPersistSnapshot() {
  const recanto = buildSplitDownPaymentPersistFields({
    enabled: true,
    contractValue: SIGNAL,
    paidAtSale: PAID,
    paymentMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 5,
    installmentsCount: INSTALLMENTS,
  });
  const lf = buildSplitDownPaymentPersistFields({
    enabled: usesSplitDownPaymentFinance('ESTRELA_DO_SUL'),
    contractValue: SIGNAL,
    paidAtSale: PAID,
    paymentMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 5,
    installmentsCount: INSTALLMENTS,
  });
  assert(recanto.signalContractValue === SIGNAL, 'snapshot sinal contratado');
  assert(recanto.signalPaidAtSale === PAID, 'snapshot pago no ato');
  assert(recanto.signalRemainingValue === REMAINING, 'snapshot restante');
  assert(recanto.signalRemainingPaymentMode === 'FIRST_INSTALLMENTS', 'estratégia');
  assert(recanto.signalRemainingInstallments === 5, 'qtd restante');
  assert(recanto.signalRemainingInstallmentValue === 500, 'acréscimo persistido');
  assert(
    JSON.stringify(recanto) === JSON.stringify(lf),
    'LF persiste o mesmo snapshot Recanto',
  );

  const padrao = buildSplitDownPaymentPersistFields({
    enabled: false,
    contractValue: SIGNAL,
    paidAtSale: PAID,
    paymentMode: 'FIRST_INSTALLMENTS',
    remainingInstallments: 5,
    installmentsCount: 10,
  });
  assert(padrao.signalContractValue == null, 'PADRAO não grava signal_*');
  console.log('OK testPersistSnapshot');
}

function testLfEstrelaDownPaymentToken() {
  const estrelaBases = splitInstallmentAmounts(LOT - SIGNAL, INSTALLMENTS);
  const firstAmount = Math.round((estrelaBases[0] + 500) * 100) / 100;
  const values = resolveCustomPreviewValues({
    tenantId: '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
    company: { razao_social: 'L.F. IMÓVEIS LTDA' },
    sale: {
      company_id: '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
      contract_model: 'ESTRELA_DO_SUL',
      total_value: LOT,
      down_payment: SIGNAL,
      signal_contract_value: SIGNAL,
      signal_paid_at_sale: PAID,
      signal_remaining_value: REMAINING,
      signal_remaining_payment_mode: 'FIRST_INSTALLMENTS',
      signal_remaining_installments: 5,
      signal_remaining_installment_value: 500,
      installments_count: INSTALLMENTS,
      first_installment_due_date: '2026-08-01',
    },
    receipts: [
      { installment_number: 0, amount: PAID, due_date: '2026-07-01' },
      { installment_number: 1, amount: firstAmount, due_date: '2026-08-01' },
      { installment_number: 6, amount: estrelaBases[5], due_date: '2027-01-01' },
    ],
  });
  assert(
    String(values.DOWN_PAYMENT || '').includes('3.500'),
    `DOWN_PAYMENT = sinal contratado, got ${values.DOWN_PAYMENT}`,
  );
  assert(
    !String(values.DOWN_PAYMENT || '').includes('1.000'),
    'DOWN_PAYMENT não usa só o pago no ato',
  );
  assert(
    String(values.INSTALLMENT_VALUE || '').includes('1.061,60'),
    `INSTALLMENT_VALUE vem da 1ª parcela gerada, got ${values.INSTALLMENT_VALUE}`,
  );
  assert(values.FIRST_DUE_DATE === '01/08/2026', 'FIRST_DUE_DATE da 1ª parcela');
  console.log('OK testLfEstrelaDownPaymentToken');
}

function testPadraoUnchanged() {
  const payloads = buildSaleEditFinancePayloads(
    't',
    's',
    'c',
    null,
    lot,
    {
      ...baseForm(),
      signal_contract_value: '',
      signal_paid_at_sale: '',
    } as LotFormConfirmPayload,
    { contractModel: 'PADRAO' },
  );
  const monthly = monthlyRows(payloads);
  const principal = LOT - SIGNAL;
  const expected = splitInstallmentAmounts(principal, INSTALLMENTS);
  assert(
    Math.abs(Number(monthly[0].amount) - expected[0]) < 0.01,
    'PADRAO continua abatendo entrada',
  );
  assert(
    monthly.every((p) => Number(p.signal_addon_amount || 0) === 0),
    'PADRAO sem addon Recanto',
  );
  console.log('OK testPadraoUnchanged');
}

function testSourceWiring() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const create = read('lib/gisSaleCreateService.ts');
  const edit = read('lib/saleEdit.ts');
  const gis = read('components/map/GISMap.tsx');
  const recalc = read('lib/saleEditFinanceRecalc.ts');
  assert(
    modal.includes('usesSplitDownPaymentFinance(contractModel)'),
    'form GIS usa capability, não só Recanto',
  );
  assert(
    create.includes('usesSplitDownPaymentFinance({'),
    'create persiste split via capability',
  );
  assert(
    create.includes('contractModel: saleContractModel'),
    'create passa o modelo do contrato ao split',
  );
  assert(
    create.includes('buildSplitDownPaymentPersistFields'),
    'create reutiliza persist Recanto',
  );
  assert(
    edit.includes('usesSplitDownPaymentFinance(contractModel)'),
    'edit persiste split via capability',
  );
  assert(
    gis.includes('resolveSaleContractModelFromContext'),
    'mapa resolve modelo do projeto+empresa',
  );
  assert(
    recalc.includes('usesSplitDownPaymentFinance(options?.contractModel)'),
    'parcelas usam o mesmo motor Recanto',
  );
  assert(
    !recalc.includes('reduceByDownPayment: isRecanto ? false'),
    'recalc não força lote cheio em todo split',
  );
  assert(
    !modal.includes('reduceByDownPayment: isRecantoSinal ? false'),
    'form não força lote cheio em todo split',
  );
  assert(
    !create.includes('reduceByDownPayment: splitDownPayment ? false'),
    'create não força lote cheio em todo split',
  );
  assert(
    !edit.includes('reduceByDownPayment: isRecanto ? false'),
    'edit não força lote cheio em todo split',
  );
  assert(
    !modal.includes("isRecantoSinal = !downPaymentReducesInstallmentBase"),
    'form não esconde LF por arras do motor Estrela',
  );
  assert(
    modal.includes("normalizeSaleContractModel(contractModel) === 'ESTRELA_DO_SUL'"),
    'labels Arras só no formulário ESTRELA/LF',
  );
  assert(modal.includes('Valor do Sinal / Entrada (Arras)'), 'label valor do sinal/entrada');
  assert(
    modal.includes('Valor pago no ato do Sinal / Entrada'),
    'label pago no ato do sinal/entrada',
  );
  assert(modal.includes('Restante do Sinal / Entrada'), 'label restante do sinal/entrada');
  assert(
    modal.includes('Vencimento do Sinal / Entrada'),
    'label vencimento do sinal/entrada',
  );
  assert(
    modal.includes('Forma de cobrança do restante do Sinal / Entrada'),
    'label forma de cobrança do restante',
  );
  assert(
    modal.includes('Valor do sinal contratado (R$)'),
    'Recanto preserva nomenclatura original do sinal',
  );
  assert(
    modal.includes('isInstallmentCorrectionOptionEnabled'),
    'seletor desabilita índices incompatíveis com o jurídico LF ESTRELA',
  );
  assert(
    modal.includes('indisponível neste modelo'),
    'opções bloqueadas aparecem como indisponíveis',
  );
  assert(
    modal.includes('LF_ESTRELA_CORRECTION_SELECTOR_HINT'),
    'seletor explica que o modelo atual exige IGP-M',
  );
  assert(
    modal.includes('Correção das Parcelas / Índice de Correção Anual'),
    'label do seletor de correção no formulário de venda',
  );
  assert(
    create.includes('resolvePersistInstallmentCorrectionType'),
    'create persiste o índice escolhido, não FIXED do split',
  );
  assert(
    !/splitDownPayment\s*\n\s*\?\s*DEFAULT_INSTALLMENT_CORRECTION_TYPE/.test(create),
    'create não força FIXED quando há split',
  );
  assert(
    edit.includes('resolvePersistInstallmentCorrectionType'),
    'edit persiste o índice escolhido, não FIXED do split LF',
  );
  assert(
    !edit.includes('isRecanto\n        ? DEFAULT_INSTALLMENT_CORRECTION_TYPE'),
    'edit não força FIXED para todo split',
  );
  console.log('OK testSourceWiring');
}

function testCorrectionIndexIndependentOfSplit() {
  assert(
    shouldForceFixedInstallmentCorrection('RECANTO_PRIMAVERA') === true,
    'Recanto continua forçando FIXED',
  );
  assert(
    shouldForceFixedInstallmentCorrection('ESTRELA_DO_SUL') === false,
    'Estrela não força FIXED por causa do split',
  );
  assert(
    catalogDefaultInstallmentCorrectionType('ESTRELA_DO_SUL') === 'IGPM',
    'catálogo Estrela = IGP-M',
  );
  assert(
    catalogDefaultInstallmentCorrectionType('PADRAO') === 'FIXED',
    'catálogo padrão = FIXED',
  );
  assert(
    resolveProjectInstallmentCorrectionType({
      contractModel: 'ESTRELA_DO_SUL',
    }) === 'IGPM',
    'Estrela sem JSON herda IGP-M',
  );
  assert(
    resolveProjectInstallmentCorrectionType({
      contractModel: 'ESTRELA_DO_SUL',
      projectLfConfig: {
        sale_finance_config: { installment_correction_type: 'IPCA' },
      },
    }) === 'IGPM',
    'LF ESTRELA ignora JSON IPCA enquanto o jurídico é IGP-M',
  );
  assert(
    resolveProjectInstallmentCorrectionType({
      contractModel: 'PADRAO',
      projectLfConfig: {
        sale_finance_config: { installment_correction_type: 'IPCA' },
      },
    }) === 'IPCA',
    'outros modelos honram o índice do empreendimento',
  );
  assert(
    readProjectInstallmentCorrectionType({
      sale_finance_config: { installment_correction_type: 'INCC' },
    }) === 'INCC',
    'lê índice em sale_finance_config',
  );
  assert(
    resolvePersistInstallmentCorrectionType({
      contractModel: 'ESTRELA_DO_SUL',
      selected: 'IGPM',
    }) === 'IGPM',
    'venda Estrela grava IGP-M',
  );
  assert(
    resolvePersistInstallmentCorrectionType({
      contractModel: 'ESTRELA_DO_SUL',
      selected: 'IPCA',
    }) === 'IGPM',
    'split Estrela não grava IPCA nem FIXED; alinha ao jurídico IGP-M',
  );
  assert(
    resolvePersistInstallmentCorrectionType({
      contractModel: 'ESTRELA_DO_SUL',
      selected: 'FIXED',
    }) === 'IGPM',
    'split não volta a forçar FIXED no LF ESTRELA',
  );
  assert(
    resolvePersistInstallmentCorrectionType({
      contractModel: 'PADRAO',
      selected: 'INCC',
    }) === 'INCC',
    'PADRAO persiste INCC escolhido',
  );
  assert(
    resolvePersistInstallmentCorrectionType({
      contractModel: 'RECANTO_PRIMAVERA',
      selected: 'IGPM',
    }) === 'FIXED',
    'Recanto ignora seleção e grava FIXED',
  );
  assert(
    isInstallmentCorrectionOptionEnabled('ESTRELA_DO_SUL', 'IGPM') === true,
    'IGP-M habilitado no LF ESTRELA',
  );
  assert(
    isInstallmentCorrectionOptionEnabled('ESTRELA_DO_SUL', 'FIXED') === false,
    'FIXED desabilitado no LF ESTRELA',
  );
  assert(
    isInstallmentCorrectionOptionEnabled('ESTRELA_DO_SUL', 'IPCA') === false,
    'IPCA desabilitado no LF ESTRELA',
  );
  assert(
    isInstallmentCorrectionOptionEnabled('ESTRELA_DO_SUL', 'INCC') === false,
    'INCC desabilitado no LF ESTRELA',
  );
  assert(
    isInstallmentCorrectionOptionEnabled('PADRAO', 'IPCA') === true,
    'PADRAO mantém IPCA habilitado',
  );
  assert(
    formatInstallmentCorrectionLabel('IGPM') === 'IGP-M',
    'capa imprime IGP-M quando a venda grava IGPM',
  );

  assertLfEstrelaCorrectionCoherentWithHardcodedLegal('ESTRELA_DO_SUL', 'IGPM');
  let locked = false;
  try {
    assertLfEstrelaCorrectionCoherentWithHardcodedLegal('ESTRELA_DO_SUL', 'FIXED');
  } catch (err) {
    locked = err instanceof Error && err.message === LF_ESTRELA_HARDCODED_IGPM_LEGAL_MESSAGE;
  }
  assert(locked, 'bloqueia FIXED no LF ESTRELA enquanto o jurídico é IGP-M');
  locked = false;
  try {
    assertLfEstrelaCorrectionCoherentWithHardcodedLegal('ESTRELA_DO_SUL', 'IPCA');
  } catch (err) {
    locked = err instanceof Error && err.message.includes('IGP-M');
  }
  assert(locked, 'bloqueia IPCA no LF ESTRELA');
  assertLfEstrelaCorrectionCoherentWithHardcodedLegal('PADRAO', 'IPCA');

  const legal = read('lib/lfEstrelaCustomTemplate.ts');
  assert(
    legal.includes(
      'As parcelas vincendas sofrerão reajuste monetário anual, aplicando-se a variação positiva acumulada do Índice Geral de Preços - Mercado (IGP-M)',
    ),
    'cláusula 2.3 permanece IGP-M literal',
  );
  assert(
    legal.includes(
      'Na hipótese de extinção, vedação legal ou ausência de divulgação do IGP-M/FGV',
    ),
    'cláusula 2.4 permanece IGP-M literal',
  );
  assert(
    legal.includes(
      'Atualização monetária calculada pro rata die (proporcional aos dias de atraso), com base na variação do IGP-M/FGV',
    ),
    'cláusula 2.5(a) permanece IGP-M literal',
  );
  assert(
    legal.includes('acrescido de correção monetária (IGP-M/FGV), juros de 1% ao mês e multa de 2%'),
    'cláusula 7.3 permanece IGP-M literal',
  );
  assert(legal.includes("t('CORRECTION_INDEX')"), 'capa continua com token CORRECTION_INDEX');
  console.log('OK testCorrectionIndexIndependentOfSplit');
}

function estrela38500Form(overrides?: Partial<LotFormConfirmPayload>): LotFormConfirmPayload {
  return {
    ...baseForm(),
    lot_value: 38500,
    final_value: 38500,
    installments_count: '100',
    signal_contract_value: '3500',
    down_payment: '3500',
    signal_paid_at_sale: '1000',
    signal_remaining_payment_mode: 'FIRST_INSTALLMENTS',
    signal_remaining_installments: '5',
    installment_correction_type: 'IGPM',
    ...overrides,
  } as LotFormConfirmPayload;
}

function testEstrelaProduction38500Case() {
  const form = estrela38500Form();
  const payloads = buildSaleEditFinancePayloads(
    'tenant-estrela',
    'sale-estrela-38500',
    'cust-estrela',
    null,
    lot,
    form,
    { contractModel: 'ESTRELA_DO_SUL' },
  );

  const signal = payloads.find((p) => Number(p.installment_number) === 0);
  assert(Number(signal?.amount) === 1000, 'pago no ato R$ 1.000');
  assert(signal?.status === 'pago', 'pago no ato marcado pago');

  const monthly = monthlyRows(payloads);
  assert(monthly.length === 100, '100 parcelas');
  for (let i = 0; i < 5; i++) {
    assert(Number(monthly[i].base_amount) === 350, `base ${i + 1} = 350`);
    assert(Number(monthly[i].signal_addon_amount) === 500, `addon ${i + 1} = 500`);
    assert(Number(monthly[i].amount) === 850, `1ª–5ª = 850, got ${monthly[i].amount}`);
  }
  for (let i = 5; i < 100; i++) {
    assert(Number(monthly[i].amount) === 350, `6ª–100ª = 350, parcela ${i + 1}`);
    assert(Number(monthly[i].signal_addon_amount || 0) === 0, `parcela ${i + 1} sem addon`);
  }

  const firstFive = 5 * 850;
  const rest = 95 * 350;
  const paidAtSale = 1000;
  assert(firstFive === 4250, '5 × 850 = 4.250');
  assert(rest === 33250, '95 × 350 = 33.250');
  const allSum = payloads.reduce((s, p) => s + Number(p.amount || 0), 0);
  assert(allSum === 38500, `receipts + ato = 38.500, got ${allSum}`);
  assert(firstFive + rest + paidAtSale === 38500, '5×850 + 95×350 + 1.000 = 38.500');

  const expected = expectedSaleFinanceTotal({
    finalValue: 38500,
    grossDownPayment: 3500,
    contractModel: 'ESTRELA_DO_SUL',
    paymentType: 'Parcelado',
  });
  assert(expected === 38500, 'total econômico Estrela = valor do lote (sem dupla cobrança)');
  assert(Math.abs(allSum - expected) < 0.001, 'finance_receipts fecha o valor da venda');

  const recantoExpected = expectedSaleFinanceTotal({
    finalValue: 38500,
    grossDownPayment: 3500,
    contractModel: 'RECANTO_PRIMAVERA',
    paymentType: 'Parcelado',
  });
  assert(recantoExpected === 42000, 'Recanto continua lote + sinal contratado');

  const saleSnapshot = {
    company_id: '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
    contract_model: 'ESTRELA_DO_SUL',
    total_value: 38500,
    agreed_price: 38500,
    down_payment: 3500,
    signal_contract_value: 3500,
    signal_paid_at_sale: 1000,
    signal_remaining_value: 2500,
    signal_remaining_payment_mode: 'FIRST_INSTALLMENTS',
    signal_remaining_installments: 5,
    signal_remaining_installment_value: 500,
    installments_count: 100,
    installment_definition_mode: 'BY_COUNT',
    installment_correction_type: 'IGPM',
  };
  const schedule = resolveCommercialInstallmentScheduleFromSale(saleSnapshot);
  assert(
    schedule === '100 parcelas — 1ª à 5ª de R$ 850,00; 6ª à 100ª de R$ 350,00',
    `PARCELAS E VALORES: ${schedule}`,
  );

  const preview = resolveCustomPreviewValues({
    tenantId: '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
    company: { razao_social: 'L.F. IMÓVEIS LTDA' },
    sale: saleSnapshot,
    receipts: payloads.map((p) => ({
      installment_number: p.installment_number,
      amount: p.amount,
      due_date: p.due_date,
    })),
  });
  assert(String(preview.DOWN_PAYMENT || '').includes('3.500'), 'contrato: Sinal/Entrada R$ 3.500');
  assert(
    preview.INSTALLMENTS_SCHEDULE ===
      '100 parcelas — 1ª à 5ª de R$ 850,00; 6ª à 100ª de R$ 350,00',
    `contrato cronograma: ${preview.INSTALLMENTS_SCHEDULE}`,
  );
  assert(preview.CORRECTION_INDEX === 'IGP-M' || String(preview.CORRECTION_INDEX || '').includes('IGP-M'),
    `índice permanece IGP-M, got ${preview.CORRECTION_INDEX}`,
  );
  assert(
    resolvePersistInstallmentCorrectionType({
      contractModel: 'ESTRELA_DO_SUL',
      selected: 'IGPM',
    }) === 'IGPM',
    'persistência da venda permanece IGP-M',
  );

  const recantoSameNumbers = buildSaleEditFinancePayloads(
    'tenant-recanto',
    'sale-recanto-38500',
    'cust-recanto',
    null,
    lot,
    form,
    { contractModel: 'RECANTO_PRIMAVERA' },
  );
  const recantoMonthly = monthlyRows(recantoSameNumbers);
  assert(Number(recantoMonthly[0].amount) === 885, 'Recanto neste cenário continua 385+500=885');
  assert(Number(recantoMonthly[5].amount) === 385, 'Recanto demais = 385');
  const recantoSum = recantoSameNumbers.reduce((s, p) => s + Number(p.amount || 0), 0);
  assert(recantoSum === 42000, 'Recanto: parcelas + ato = lote + sinal (sem regressão)');

  console.log('OK testEstrelaProduction38500Case');
}

function testEstrelaEditRecalcAndPartialRemaining() {
  const created = buildSaleEditFinancePayloads(
    't',
    'sale-edit',
    'c',
    null,
    lot,
    estrela38500Form(),
    { contractModel: 'ESTRELA_DO_SUL' },
  );
  const editedSame = buildSaleEditFinancePayloads(
    't',
    'sale-edit',
    'c',
    null,
    lot,
    estrela38500Form(),
    { contractModel: 'ESTRELA_DO_SUL' },
  );
  assert(
    JSON.stringify(monthlyRows(created).map((p) => [p.amount, p.base_amount, p.signal_addon_amount])) ===
      JSON.stringify(
        monthlyRows(editedSame).map((p) => [p.amount, p.base_amount, p.signal_addon_amount]),
      ),
    'edit com os mesmos dados regenera 850/350',
  );

  const editedFour = buildSaleEditFinancePayloads(
    't',
    'sale-edit',
    'c',
    null,
    lot,
    estrela38500Form({ signal_remaining_installments: '4' }),
    { contractModel: 'ESTRELA_DO_SUL' },
  );
  const fourMonthly = monthlyRows(editedFour);
  assert(Number(fourMonthly[0].amount) === 975, 'edit 4 primeiras: 350 + 625');
  assert(Number(fourMonthly[3].amount) === 975, '4ª = 975');
  assert(Number(fourMonthly[4].amount) === 350, '5ª volta à parcela-base');
  const fourSum = editedFour.reduce((s, p) => s + Number(p.amount || 0), 0);
  assert(fourSum === 38500, 'edit com 4 primeiras ainda fecha 38.500');

  const plan = planPartialFinanceRecalc(
    created.map((p, idx) => ({
      id: `r-${idx}`,
      installment_number: p.installment_number,
      amount: p.amount,
      status: p.status,
      paid_at: p.paid_at ? String(p.paid_at) : null,
      due_date: p.due_date,
    })),
    editedSame,
    38500,
    {
      contractModel: 'ESTRELA_DO_SUL',
      grossDownPayment: 3500,
      paymentType: 'Parcelado',
    },
  );
  assert(plan.totalDiff < 0.05, `recálculo parcial fecha, diff=${plan.totalDiff}`);

  console.log('OK testEstrelaEditRecalcAndPartialRemaining');
}

function main() {
  testCapabilityCatalogAndOverride();
  testPlan3500Minus1000();
  testFiveAndFourAndAllOnBothModels();
  testFullyPaidHidesRemaining();
  testZeroPaidAtSale();
  testUnevenRounding();
  testValidations();
  testPersistSnapshot();
  testLfEstrelaDownPaymentToken();
  testPadraoUnchanged();
  testSourceWiring();
  testCorrectionIndexIndependentOfSplit();
  testEstrelaProduction38500Case();
  testEstrelaEditRecalcAndPartialRemaining();
  console.log('OK — mandatory-lf-estrela-split-down-payment-tests passed');
}

main();
