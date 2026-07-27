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
  installmentHasBlockingCharge,
  installmentNeedsAsaasCharge,
  isCanceledFinanceReceipt,
  isEligibleInstallmentForAsaasCharge,
  isPrintablePendingCharge,
  SALE_CHARGES_GENERATE_BATCH_LIMIT,
  type SaleChargeInstallmentRow,
} from '../lib/finance/saleChargesShared';
import { buildSaleCarneFilename } from '../lib/finance/saleChargesShared';
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
  assert(SALE_CHARGES_GENERATE_BATCH_LIMIT === 5, 'lote 5');
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
  assert(!summary.carneReady, 'não ready');
  assert(String(summary.carneBlockReason || '').includes('faltantes'), 'mensagem');
  console.log('OK testCarneBlockedWhenMissing');
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
    'com linha digitável',
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
    chargesFailed: 0,
    chargesCancelled: 0,
    firstDueDate: null,
    lastDueDate: null,
    totalAmount: 0,
    totalPaid: 0,
    totalPending: 0,
    missingInstallmentIds: [],
    errorInstallmentIds: [],
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
  assert(panel.includes('Gerar carnê em PDF'), 'botão carnê');
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

function testPdfThreePerPageSource() {
  const root = process.cwd();
  assert(fs.existsSync(path.join(root, 'lib/finance/saleChargesShared.ts')), 'shared');
  const pdf = fs.readFileSync(path.join(root, 'lib/finance/saleCarnePdf.ts'), 'utf8');
  assert(pdf.includes('SLOT_H'), 'altura slot');
  assert(pdf.includes('/ 3'), '3 por folha');
  assert(pdf.includes('digitableLineToBarcode44'), 'barcode oficial');
  assert(pdf.includes('pixQrCode') || pdf.includes('resolvePixImage'), 'PIX');
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
  testDigitableToBarcode();
  testCarneArtifacts();
  testFilenameSanitize();
  testOver100ParcelsSummary();
  testUiAndRoutesExist();
  testFinanceReceiptsSelectHasNoDeletedAt();
  testPdfThreePerPageSource();
  console.log('\nALL mandatory-sale-charges-carne-tests PASSED');
}

main();
