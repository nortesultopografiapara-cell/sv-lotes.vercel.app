/**
 * Testes — carnê / cobranças por venda (aba Cobranças).
 * npx tsx scripts/mandatory-sale-charges-carne-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  buildSaleChargesSummaryFromRows,
  chargeHasCarneArtifacts,
  digitableLineToBarcode44,
  formatDateBr,
  formatDigitableLineDisplay,
  formatSaleCarneParcelLabel,
  installmentHasBlockingCharge,
  installmentNeedsAsaasCharge,
  isCanceledFinanceReceipt,
  isEligibleInstallmentForAsaasCharge,
  isPrintablePendingCharge,
  SALE_CHARGES_GENERATE_BATCH_LIMIT,
  type SaleChargeInstallmentRow,
} from '../lib/finance/saleChargesShared';
import { buildSaleCarneFilename } from '../lib/finance/saleChargesShared';
import { extractCompanyAsaasBankSlipIdentification } from '../lib/finance/asaasCompanyLateFees';
import {
  formatCarneTaxDocument,
  normalizeCarneTaxDocument,
  resolveSaleCarneBeneficiaryFromSources,
  SALE_CARNE_BENEFICIARY_DIVERGENCE_WARNING,
  SALE_CARNE_BENEFICIARY_MISSING_DOC_WARNING,
} from '../lib/finance/saleCarneBeneficiary';
import {
  formatPayerAddressForCarne,
  normalizeFreeformStreetForCarne,
} from '../lib/finance/saleCarnePayerAddress';
import type { CompanyAsaasChargeResponse } from '../lib/finance/companyAsaasChargeTypes';
import { ASAAS_BOLETO_MIN_AMOUNT } from '../lib/saasMasterConfig';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function installment(
  partial: Partial<SaleChargeInstallmentRow> & { id: string },
): SaleChargeInstallmentRow {
  return {
    sale_id: 'sale-1',
    installment_number: 1,
    due_date: '2026-08-01',
    amount: 100,
    status: 'pendente',
    ...partial,
  };
}

function charge(
  partial: Partial<CompanyAsaasChargeResponse> & { installmentId: string },
): CompanyAsaasChargeResponse {
  return {
    id: 'c1',
    companyId: 'co1',
    customerId: 'cu1',
    saleId: 'sale-1',
    asaasPaymentId: 'pay_1',
    billingType: 'BOLETO',
    status: 'PENDING',
    value: 100,
    dueDate: '2026-08-01',
    invoiceUrl: 'https://asaas.test/i',
    bankSlipUrl: 'https://asaas.test/b',
    bankSlipIdentification: '23793.38128 60000.000003 00000.000400 1 84340000010000',
    pixQrCode: null,
    pixCopyPaste: null,
    financialAccountId: 'fa1',
    paymentLink: 'https://asaas.test/i',
    paidAt: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...partial,
  };
}

function testScopeOnlySelectedSale() {
  const rows = [
    installment({ id: 'a', sale_id: 'sale-1' }),
    installment({ id: 'b', sale_id: 'sale-2' }),
  ];
  const summary = buildSaleChargesSummaryFromRows({
    saleId: 'sale-1',
    companyId: 'co1',
    installments: rows,
    charges: [],
    context: {
      customerName: 'Cliente',
      customerEmail: null,
      customerPhone: null,
      projectName: 'Emp',
      quadra: '02',
      lote: '10',
      lotLabel: 'QD 02 - LT 10',
      contractNumber: 'C-1',
      financialAccountId: 'fa1',
    },
    financialAccountName: 'Conta',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
  });
  assert(summary.totalInstallments === 1, 'só parcelas da venda');
  assert(summary.chargesMissing === 1, '1 faltante da venda 1');
  console.log('OK testScopeOnlySelectedSale');
}

function testMissingOnly() {
  const rows = [
    installment({ id: 'p1', installment_number: 1 }),
    installment({ id: 'p2', installment_number: 2 }),
  ];
  const charges = [charge({ installmentId: 'p1', id: 'c-p1' })];
  const summary = buildSaleChargesSummaryFromRows({
    saleId: 'sale-1',
    companyId: 'co1',
    installments: rows,
    charges,
    context: {
      customerName: 'A',
      customerEmail: null,
      customerPhone: null,
      projectName: 'P',
      quadra: '1',
      lote: '1',
      lotLabel: null,
      contractNumber: null,
      financialAccountId: 'fa',
    },
    financialAccountName: 'Conta',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
  });
  assert(summary.chargesGenerated === 1, '1 gerada');
  assert(summary.chargesMissing === 1, '1 faltante');
  assert(summary.missingInstallmentIds.includes('p2'), 'p2 faltante');
  assert(!summary.missingInstallmentIds.includes('p1'), 'p1 não faltante');
  console.log('OK testMissingOnly');
}

function testNoDuplicateWhenActive() {
  const c = charge({ installmentId: 'p1', status: 'PENDING' });
  assert(installmentHasBlockingCharge(c), 'bloqueia ativa');
  assert(
    !installmentNeedsAsaasCharge({
      installment: installment({ id: 'p1' }),
      charge: c,
    }),
    'não precisa gerar',
  );
  console.log('OK testNoDuplicateWhenActive');
}

function testIgnorePaidAndCanceled() {
  assert(
    !isEligibleInstallmentForAsaasCharge(
      installment({ id: 'x', status: 'pago' }),
    ),
    'pago inelegível',
  );
  assert(isCanceledFinanceReceipt({ status: 'cancelado' }), 'cancelado');
  assert(
    !isEligibleInstallmentForAsaasCharge(
      installment({ id: 'y', status: 'cancelado' }),
    ),
    'cancelado inelegível',
  );
  assert(
    !isEligibleInstallmentForAsaasCharge(
      installment({ id: 'z', amount: ASAAS_BOLETO_MIN_AMOUNT - 0.01 }),
    ),
    'abaixo do mínimo',
  );
  console.log('OK testIgnorePaidAndCanceled');
}

function testPreservePaid() {
  const c = charge({ installmentId: 'p1', status: 'PAID' });
  assert(installmentHasBlockingCharge(c), 'pago bloqueia regenerate');
  assert(!isPrintablePendingCharge(c), 'pago fora do carnê');
  console.log('OK testPreservePaid');
}

function testBatchLimit() {
  assert(SALE_CHARGES_GENERATE_BATCH_LIMIT === 5, 'lote técnico 5');
  assert(SALE_CHARGES_GENERATE_BATCH_LIMIT < 100, 'não dispara 100 de uma vez');
  console.log('OK testBatchLimit');
}

function testNoAccountBlocksCarneReadyFalse() {
  const summary = buildSaleChargesSummaryFromRows({
    saleId: 'sale-1',
    companyId: 'co1',
    installments: [installment({ id: 'p1' })],
    charges: [],
    context: {
      customerName: 'A',
      customerEmail: null,
      customerPhone: null,
      projectName: 'P',
      quadra: '1',
      lote: '1',
      lotLabel: null,
      contractNumber: null,
      financialAccountId: null,
    },
    financialAccountName: null,
    hasFinancialAccount: false,
    financialAccountBlockReason: 'Sem conta',
  });
  assert(summary.uiState === 'no_account', 'estado sem conta');
  assert(summary.carneReady === false, 'carnê bloqueado');
  console.log('OK testNoAccountBlocksCarneReadyFalse');
}

function testCarneBlockedWhenMissing() {
  const summary = buildSaleChargesSummaryFromRows({
    saleId: 'sale-1',
    companyId: 'co1',
    installments: [
      installment({ id: 'p1' }),
      installment({ id: 'p2', installment_number: 2 }),
    ],
    charges: [charge({ installmentId: 'p1' })],
    context: {
      customerName: 'Heron',
      customerEmail: null,
      customerPhone: null,
      projectName: 'Martini III',
      quadra: '02',
      lote: '10',
      lotLabel: 'QD 02 - LT 10',
      contractNumber: '99',
      financialAccountId: 'fa',
    },
    financialAccountName: 'Conta',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
  });
  assert(summary.carneReady === true, 'carnê liberado com 1 imprimível');
  assert(summary.printableChargesCount === 1, '1 imprimível');
  assert(summary.chargesMissing === 1, 'ainda 1 faltante');
  assert(
    String(summary.carneBlockReason || '').includes('disponível'),
    'aviso de carnê parcial',
  );
  assert(
    !String(summary.carneBlockReason || '').includes('Gere as'),
    'não obriga gerar todas',
  );
  console.log('OK testCarneBlockedWhenMissing');
}

function testPartialCarneTenWithTwo() {
  const installments = Array.from({ length: 10 }, (_, i) =>
    installment({
      id: `p${i + 1}`,
      installment_number: i + 1,
      due_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-12`,
    }),
  );
  const charges = [1, 2].map((n) =>
    charge({ id: `c${n}`, installmentId: `p${n}`, asaasPaymentId: `pay_${n}` }),
  );
  const summary = buildSaleChargesSummaryFromRows({
    saleId: 'sale-1',
    companyId: 'co1',
    installments,
    charges,
    context: {
      customerName: 'Cliente',
      customerEmail: null,
      customerPhone: null,
      projectName: 'P',
      quadra: '02',
      lote: '39',
      lotLabel: null,
      contractNumber: null,
      financialAccountId: 'fa',
    },
    financialAccountName: 'Conta',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
  });
  assert(summary.totalInstallments === 10, '10 parcelas');
  assert(summary.chargesGenerated === 2, '2 geradas');
  assert(summary.chargesMissing === 8, '8 faltantes');
  assert(summary.printableChargesCount === 2, '2 imprimíveis');
  assert(summary.carneReady === true, 'carnê liberado');
  assert(
    String(summary.carneBlockReason || '').includes('2 cobranças disponíveis'),
    'mensagem 2 disponíveis',
  );
  assert(
    String(summary.carneBlockReason || '').includes('8 parcelas'),
    'mensagem 8 sem cobrança',
  );

  const printable = charges.filter(isPrintablePendingCharge);
  assert(printable.length === 2, 'PDF filtraria 2');
  const labels = printable.map((c, idx) =>
    formatSaleCarneParcelLabel(idx + 1, summary.totalInstallments),
  );
  assert(labels[0] === 'Parcela 01/10 do contrato', 'rótulo parcela 01/10');
  assert(labels[1] === 'Parcela 02/10 do contrato', 'rótulo parcela 02/10');
  console.log('OK testPartialCarneTenWithTwo');
}

function testPartialCarneHundredWithSix() {
  const installments = Array.from({ length: 100 }, (_, i) =>
    installment({ id: `p${i + 1}`, installment_number: i + 1 }),
  );
  const charges = [7, 8, 9, 10, 11, 12].map((n) =>
    charge({ id: `c${n}`, installmentId: `p${n}`, asaasPaymentId: `pay_${n}` }),
  );
  const summary = buildSaleChargesSummaryFromRows({
    saleId: 'sale-1',
    companyId: 'co1',
    installments,
    charges,
    context: {
      customerName: 'A',
      customerEmail: null,
      customerPhone: null,
      projectName: 'P',
      quadra: '1',
      lote: '1',
      lotLabel: null,
      contractNumber: null,
      financialAccountId: 'fa',
    },
    financialAccountName: 'Conta',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
  });
  assert(summary.carneReady === true, 'liberado com 6');
  assert(summary.printableChargesCount === 6, '6 imprimíveis');
  assert(summary.chargesMissing === 94, '94 faltantes permanecem');
  assert(
    formatSaleCarneParcelLabel(7, 100) === 'Parcela 07/100 do contrato',
    'preserva nº real 07/100',
  );
  assert(
    formatSaleCarneParcelLabel(8, 100) === 'Parcela 08/100 do contrato',
    'preserva nº real 08/100',
  );
  console.log('OK testPartialCarneHundredWithSix');
}

function testCarneBlockedWhenZeroPrintable() {
  const summary = buildSaleChargesSummaryFromRows({
    saleId: 'sale-1',
    companyId: 'co1',
    installments: [installment({ id: 'p1' }), installment({ id: 'p2', installment_number: 2 })],
    charges: [],
    context: {
      customerName: 'A',
      customerEmail: null,
      customerPhone: null,
      projectName: 'P',
      quadra: '1',
      lote: '1',
      lotLabel: null,
      contractNumber: null,
      financialAccountId: 'fa',
    },
    financialAccountName: 'Conta',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
  });
  assert(summary.carneReady === false, 'bloqueado sem imprimíveis');
  assert(summary.printableChargesCount === 0, '0 imprimíveis');
  assert(
    summary.carneBlockReason === 'Nenhuma cobrança disponível para gerar o carnê.',
    'mensagem zero',
  );
  console.log('OK testCarneBlockedWhenZeroPrintable');
}

function testPrintableExcludesPaidCancelledFailedExpired() {
  const paid = charge({ installmentId: 'p1', status: 'PAID', id: 'c-paid' });
  const cancelled = charge({ installmentId: 'p2', status: 'CANCELLED', id: 'c-can' });
  const failed = charge({ installmentId: 'p3', status: 'FAILED', id: 'c-fail' });
  const expired = charge({ installmentId: 'p4', status: 'EXPIRED', id: 'c-exp' });
  const pending = charge({ installmentId: 'p5', status: 'PENDING', id: 'c-ok' });
  assert(!isPrintablePendingCharge(paid), 'PAID fora');
  assert(!isPrintablePendingCharge(cancelled), 'CANCELLED fora');
  assert(!isPrintablePendingCharge(failed), 'FAILED fora');
  assert(!isPrintablePendingCharge(expired), 'EXPIRED fora');
  assert(isPrintablePendingCharge(pending), 'PENDING ok');

  const summary = buildSaleChargesSummaryFromRows({
    saleId: 'sale-1',
    companyId: 'co1',
    installments: [
      installment({ id: 'p1', status: 'pago', paid_at: '2026-01-01' }),
      installment({ id: 'p2', installment_number: 2 }),
      installment({ id: 'p3', installment_number: 3 }),
      installment({ id: 'p4', installment_number: 4 }),
      installment({ id: 'p5', installment_number: 5 }),
    ],
    charges: [paid, cancelled, failed, expired, pending],
    context: {
      customerName: 'A',
      customerEmail: null,
      customerPhone: null,
      projectName: 'P',
      quadra: '1',
      lote: '1',
      lotLabel: null,
      contractNumber: null,
      financialAccountId: 'fa',
    },
    financialAccountName: 'Conta',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
  });
  assert(summary.printableChargesCount === 1, 'só PENDING conta');
  assert(summary.carneReady === true, 'liberado com 1 válida');
  console.log('OK testPrintableExcludesPaidCancelledFailedExpired');
}

function testFullCarneStillReady() {
  const installments = Array.from({ length: 3 }, (_, i) =>
    installment({ id: `p${i + 1}`, installment_number: i + 1 }),
  );
  const charges = installments.map((r, i) =>
    charge({ id: `c${i + 1}`, installmentId: r.id, asaasPaymentId: `pay_${i + 1}` }),
  );
  const summary = buildSaleChargesSummaryFromRows({
    saleId: 'sale-1',
    companyId: 'co1',
    installments,
    charges,
    context: {
      customerName: 'A',
      customerEmail: null,
      customerPhone: null,
      projectName: 'P',
      quadra: '1',
      lote: '1',
      lotLabel: null,
      contractNumber: null,
      financialAccountId: 'fa',
    },
    financialAccountName: 'Conta',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
  });
  assert(summary.chargesMissing === 0, 'sem faltantes');
  assert(summary.printableChargesCount === 3, '3 imprimíveis');
  assert(summary.carneReady === true, 'venda antiga ok');
  assert(summary.carneBlockReason === null, 'sem aviso parcial');
  console.log('OK testFullCarneStillReady');
}

function testPartialCarneUiAndRoutes() {
  const panel = fs.readFileSync(
    path.join(process.cwd(), 'components/sales/SaleChargesPanel.tsx'),
    'utf8',
  );
  const pdfRoute = fs.readFileSync(
    path.join(process.cwd(), 'app/api/finance/asaas/sale-charges/carne-pdf/route.ts'),
    'utf8',
  );
  const emailRoute = fs.readFileSync(
    path.join(process.cwd(), 'app/api/finance/asaas/sale-charges/carne-email/route.ts'),
    'utf8',
  );
  assert(panel.includes('disabled={!canMutate || !kpi.carneReady}'), 'botões usam carneReady');
  assert(!pdfRoute.includes('chargesMissing > 0'), 'pdf não bloqueia por missing');
  assert(!emailRoute.includes('chargesMissing > 0'), 'email não bloqueia por missing');
  assert(pdfRoute.includes('formatSaleCarneParcelLabel'), 'pdf usa rótulo contrato');
  assert(emailRoute.includes('formatSaleCarneParcelLabel'), 'email usa rótulo contrato');
  assert(panel.includes('kpi.carneReady ?'), 'mostra aviso parcial mesmo ready');
  console.log('OK testPartialCarneUiAndRoutes');
}

function testDigitableToBarcode() {
  // 47-digit sample (synthetic but valid length structure)
  const digitable =
    '2379338128600000000300000000400184340000010000'.replace(/\s/g, '');
  // pad/fix to 47 if needed
  const d47 =
    digitable.length === 47
      ? digitable
      : '23793381286000000003000000004001843400000100000'.slice(0, 47);
  const barcode = digitableLineToBarcode44(d47);
  assert(barcode !== null && barcode.length === 44, `barcode 44 got ${barcode?.length}`);
  console.log('OK testDigitableToBarcode');
}

function testCarneArtifacts() {
  assert(
    chargeHasCarneArtifacts(
      charge({
        installmentId: 'p1',
        bankSlipIdentification: '1'.repeat(47),
      }),
    ),
    'com linha digitável 47',
  );
  assert(
    !chargeHasCarneArtifacts(
      charge({
        installmentId: 'p1',
        bankSlipIdentification: '466692372',
        bankSlipUrl: null,
        invoiceUrl: null,
        pixQrCode: null,
        pixCopyPaste: null,
      }),
    ),
    'nosso número curto sozinho não basta',
  );
  assert(
    !chargeHasCarneArtifacts(
      charge({
        installmentId: 'p1',
        bankSlipIdentification: null,
        bankSlipUrl: null,
        invoiceUrl: null,
        pixQrCode: null,
        pixCopyPaste: null,
      }),
    ),
    'sem artefatos',
  );
  console.log('OK testCarneArtifacts');
}

function testFilenameSanitize() {
  const name = buildSaleCarneFilename({
    saleId: 's',
    companyId: 'c',
    customerName: 'Heron Luís',
    customerEmail: null,
    customerPhone: null,
    projectName: 'CHÁCARAS E LOTES MARTINI III',
    quadra: '02',
    lote: '10',
    lotLabel: null,
    contractNumber: null,
    financialAccountId: null,
    financialAccountName: null,
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
    totalInstallments: 99,
    paidInstallments: 0,
    eligibleInstallments: 99,
    chargesGenerated: 99,
    chargesMissing: 0,
    printableChargesCount: 99,
    chargesFailed: 0,
    chargesCancelled: 0,
    firstDueDate: null,
    lastDueDate: null,
    totalAmount: 0,
    totalPaid: 0,
    totalPending: 0,
    missingInstallmentIds: [],
    missingInstallments: [],
    errorInstallmentIds: [],
    installmentCorrectionType: null,
    carneReady: true,
    carneBlockReason: null,
    uiState: 'carne_ready',
  });
  assert(name.endsWith('.pdf'), 'pdf');
  assert(!name.includes(' '), 'sem espaços');
  assert(name.includes('heron'), 'cliente');
  assert(name.includes('qd-02'), 'quadra');
  console.log('OK testFilenameSanitize');
}

function testOver100ParcelsSummary() {
  const rows = Array.from({ length: 120 }, (_, i) =>
    installment({
      id: `p${i + 1}`,
      installment_number: i + 1,
      amount: 50,
    }),
  );
  const charges = rows.slice(0, 10).map((r) =>
    charge({ installmentId: r.id, id: `c-${r.id}` }),
  );
  const summary = buildSaleChargesSummaryFromRows({
    saleId: 'sale-1',
    companyId: 'co1',
    installments: rows,
    charges,
    context: {
      customerName: 'A',
      customerEmail: null,
      customerPhone: null,
      projectName: 'P',
      quadra: '1',
      lote: '1',
      lotLabel: null,
      contractNumber: null,
      financialAccountId: 'fa',
    },
    financialAccountName: 'Conta',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
  });
  assert(summary.totalInstallments === 120, '120 parcelas');
  assert(summary.chargesGenerated === 10, '10 geradas');
  assert(summary.chargesMissing === 110, '110 faltantes');
  assert(summary.missingInstallmentIds.length === 110, 'ids faltantes');
  console.log('OK testOver100ParcelsSummary');
}

function testUiAndRoutesExist() {
  const root = process.cwd();
  const files = [
    'components/sales/SaleChargesPanel.tsx',
    'components/map/CustomerLotFormModal.tsx',
    'app/api/finance/asaas/sale-charges/route.ts',
    'app/api/finance/asaas/sale-charges/generate-missing/route.ts',
    'app/api/finance/asaas/sale-charges/sync/route.ts',
    'app/api/finance/asaas/sale-charges/carne-pdf/route.ts',
    'app/api/finance/asaas/sale-charges/carne-email/route.ts',
    'lib/finance/saleChargesService.ts',
    'lib/finance/saleCarnePdf.ts',
  ];
  for (const f of files) {
    assert(fs.existsSync(path.join(root, f)), `existe ${f}`);
  }
  const modal = fs.readFileSync(
    path.join(root, 'components/map/CustomerLotFormModal.tsx'),
    'utf8',
  );
  assert(modal.includes("activeTab === 'cobrancas'"), 'aba cobrancas');
  assert(modal.includes('SaleChargesPanel'), 'painel');
  assert(modal.includes('Cobranças'), 'label Cobranças');

  const panel = fs.readFileSync(
    path.join(root, 'components/sales/SaleChargesPanel.tsx'),
    'utf8',
  );
  assert(panel.includes('Gerar cobranças faltantes'), 'botão gerar');
  assert(panel.includes('Gerar cobranças'), 'modal gerar cobranças');
  assert(panel.includes('Próximas {n}'), 'atalho quantidade');
  assert(panel.includes('Gerar carnê em PDF'), 'botão carnê');
  assert(!panel.includes('while (remaining > 0)'), 'não gera todas automaticamente');
  assert(!panel.includes('ASAAS_API_KEY'), 'sem API key no front');
  assert(!panel.includes('apiKey'), 'sem apiKey no front');

  const gen = fs.readFileSync(
    path.join(root, 'app/api/finance/asaas/sale-charges/generate-missing/route.ts'),
    'utf8',
  );
  assert(gen.includes('authorizeCompanyAsaasRoute'), 'auth server');
  assert(gen.includes('confirmed'), 'confirmação');
  console.log('OK testUiAndRoutesExist');
}

function testFinanceReceiptsSelectHasNoDeletedAt() {
  const root = process.cwd();
  const service = fs.readFileSync(
    path.join(root, 'lib/finance/saleChargesService.ts'),
    'utf8',
  );
  const shared = fs.readFileSync(
    path.join(root, 'lib/finance/saleChargesShared.ts'),
    'utf8',
  );
  assert(!/,\s*deleted_at|\.deleted_at|deleted_at\?:/.test(service), 'service sem coluna deleted_at');
  assert(!/deleted_at\?:|\.deleted_at|row\.deleted_at/.test(shared), 'shared sem campo deleted_at');
  assert(shared.includes("=== 'cancelado'"), 'cancelamento via status');
  console.log('OK testFinanceReceiptsSelectHasNoDeletedAt');
}

function testBeneficiaryResolution() {
  const asaas = resolveSaleCarneBeneficiaryFromSources({
    asaas: { cpfCnpj: '12631238000102', companyName: 'ASAAS NOME OFICIAL' },
    financialAccount: {
      document: '11144477735',
      beneficiaryName: 'Conta Local',
      name: 'Conta X',
    },
    company: {
      cnpj: '00000000000191',
      razaoSocial: 'EMPRESA LOCAL',
      fantasyName: 'Fantasia',
    },
  });
  assert(asaas.documentSource === 'asaas', 'prioridade asaas doc');
  assert(asaas.documentDigits === '12631238000102', 'digitos asaas');
  assert(asaas.name === 'ASAAS NOME OFICIAL', 'nome asaas');
  assert(asaas.companyDocumentDivergence, 'divergencia asaas x empresa');
  assert(
    asaas.warnings.includes(SALE_CARNE_BENEFICIARY_DIVERGENCE_WARNING),
    'aviso divergencia',
  );

  const account = resolveSaleCarneBeneficiaryFromSources({
    asaas: null,
    financialAccount: {
      document: '12.631.238/0001-02',
      beneficiaryName: 'Titular Conta',
      name: 'Conta',
    },
    company: { cnpj: '00000000000191', razaoSocial: 'Empresa' },
  });
  assert(account.documentSource === 'financial_account', 'fallback conta');
  assert(account.documentFormatted === '12.631.238/0001-02', 'mascara cnpj conta');
  assert(account.name === 'Titular Conta', 'nome conta');

  const company = resolveSaleCarneBeneficiaryFromSources({
    asaas: null,
    financialAccount: { document: null, beneficiaryName: null, name: 'Conta Sem Doc' },
    company: {
      cnpj: '529.982.247-25',
      razaoSocial: 'Razao Empresa',
      fantasyName: 'Fantasia',
    },
  });
  assert(company.documentSource === 'company', 'fallback empresa');
  assert(company.documentDigits === '52998224725', 'cpf empresa');
  assert(company.nameSource === 'financial_account_name' || company.name === 'Conta Sem Doc', 'nome conta antes empresa');

  const none = resolveSaleCarneBeneficiaryFromSources({
    asaas: { cpfCnpj: '123', companyName: '' },
    financialAccount: { document: 'abc', name: '' },
    company: { cnpj: null },
  });
  assert(none.missingDocument, 'sem documento');
  assert(none.warnings.includes(SALE_CARNE_BENEFICIARY_MISSING_DOC_WARNING), 'aviso missing');
  assert(normalizeCarneTaxDocument('12.345') === null, 'invalido curto');
  assert(formatCarneTaxDocument('11144477735') === '111.444.777-35', 'mascara cpf');
  assert(formatCarneTaxDocument('12631238000102') === '12.631.238/0001-02', 'mascara cnpj');
  console.log('OK testBeneficiaryResolution');
}

function testPayerAddressFormatting() {
  const street = normalizeFreeformStreetForCarne('RUA 02QUADRA 123 LOTE 05, S');
  assert(street.includes('RUA 02, QUADRA'), 'separa QUADRA');
  assert(street.includes('S/N'), 'S isolado vira S/N');
  assert(!street.endsWith(', S'), 'nao termina com , S');

  const full = formatPayerAddressForCarne({
    address: 'RUA 02QUADRA 123 LOTE 05, S',
    neighborhood: 'CENTRO',
    city: 'Parauapebas',
    stateUf: 'PA',
    cep: '68515000',
  });
  assert(full.includes('PARAUAPEBAS/PA'), 'cidade/uf');
  assert(full.includes('CEP 68.515-000'), 'cep mascarado');
  assert(full.includes('CENTRO'), 'bairro');
  assert(full.includes('—'), 'separador blocos');

  assert(
    formatPayerAddressForCarne({ address: 'RUA DAS FLORES', city: 'Belem' }) ===
      'RUA DAS FLORES — BELEM',
    'sem uf/cep',
  );
  assert(
    normalizeFreeformStreetForCarne('TRAVESSA DOS SANTOS').includes('SANTOS'),
    'preserva S em nomes',
  );
  assert(
    !normalizeFreeformStreetForCarne('TRAVESSA DOS SANTOS').includes('S/N'),
    'nao converte S de nomes',
  );
  assert(formatPayerAddressForCarne({ address: '', city: '', state: '' }) === '', 'vazio');
  console.log('OK testPayerAddressFormatting');
}

function testPdfThreePerPageSource() {
  const root = process.cwd();
  assert(fs.existsSync(path.join(root, 'lib/finance/saleChargesShared.ts')), 'shared');
  const pdf = fs.readFileSync(path.join(root, 'lib/finance/saleCarnePdf.ts'), 'utf8');
  assert(pdf.includes('SLOT_H'), 'altura slot');
  assert(pdf.includes('/ 3'), '3 por folha');
  assert(pdf.includes('digitableLineToBarcode44'), 'barcode oficial');
  assert(pdf.includes('RECIBO DO PAGADOR'), 'recibo pagador');
  assert(pdf.includes('ASAAS_BANK_CODE'), 'código banco');
  assert(pdf.includes('461'), '461 Asaas');
  assert(pdf.includes('formatDateBr'), 'datas BR');
  assert(pdf.includes('pay_'), 'menciona filtro pay_');
  assert(!pdf.includes('Nº cobrança'), 'sem id interno no layout');
  assert(pdf.includes('pixQrCode') || pdf.includes('resolveOfficialPixImage'), 'PIX oficial');
  assert(pdf.includes('formatPayerAddressForCarne'), 'endereco formatado');
  const client = fs.readFileSync(path.join(root, 'lib/finance/asaasCompanyClient.ts'), 'utf8');
  assert(client.includes('identificationField'), 'endpoint identificationField');
  assert(client.includes('commercialInfo'), 'endpoint commercialInfo');
  const late = fs.readFileSync(path.join(root, 'lib/finance/asaasCompanyLateFees.ts'), 'utf8');
  assert(late.includes('NÃO usa nossoNumero'), 'não fallback nossoNumero');
  const panel = fs.readFileSync(path.join(root, 'components/sales/SaleChargesPanel.tsx'), 'utf8');
  assert(panel.includes('beneficiaryWarnings'), 'avisos UI');
  console.log('OK testPdfThreePerPageSource');
}

function main() {
  testScopeOnlySelectedSale();
  testMissingOnly();
  testNoDuplicateWhenActive();
  testIgnorePaidAndCanceled();
  testPreservePaid();
  testBatchLimit();
  testNoAccountBlocksCarneReadyFalse();
  testCarneBlockedWhenMissing();
  testPartialCarneTenWithTwo();
  testPartialCarneHundredWithSix();
  testCarneBlockedWhenZeroPrintable();
  testPrintableExcludesPaidCancelledFailedExpired();
  testFullCarneStillReady();
  testPartialCarneUiAndRoutes();
  testDigitableToBarcode();
  testCarneArtifacts();
  testFilenameSanitize();
  testOver100ParcelsSummary();
  testUiAndRoutesExist();
  testFinanceReceiptsSelectHasNoDeletedAt();
  testBeneficiaryResolution();
  testPayerAddressFormatting();
  testPdfThreePerPageSource();
  console.log('\nALL mandatory-sale-charges-carne-tests PASSED');
}

main();
