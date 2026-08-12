/**
 * Testes obrigatórios — gerar N cobranças faltantes (sem zerar todas).
 * npx tsx scripts/mandatory-sale-charges-generate-quantity-tests.ts
 */
import fs from 'fs';
import path from 'path';
import {
  buildSaleChargesSummaryFromRows,
  clampGenerateMissingChargesQuantity,
  installmentHasBlockingCharge,
  isEligibleInstallmentForAsaasCharge,
  planGenerateMissingCharges,
  saleHasMonetaryCorrection,
  SALE_CHARGES_CORRECTION_WARNING,
  SALE_CHARGES_GENERATE_ACTION_MAX,
  SALE_CHARGES_GENERATE_BATCH_LIMIT,
  SALE_CHARGES_QUANTITY_PRESETS,
  splitGenerateMissingChargesBatches,
  type SaleChargeInstallmentRow,
} from '../lib/finance/saleChargesShared';
import type { CompanyAsaasChargeResponse } from '../lib/finance/companyAsaasChargeTypes';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

function installment(
  partial: Partial<SaleChargeInstallmentRow> & { id: string },
): SaleChargeInstallmentRow {
  return {
    sale_id: 'sale-1',
    company_id: 'co1',
    tenant_id: 'co1',
    customer_id: 'c1',
    project_id: 'p1',
    block_id: 'b1',
    financial_account_id: null,
    installment_number: 1,
    due_date: '2026-09-12',
    amount: 100,
    status: 'pendente',
    paid_at: null,
    ...partial,
  };
}

function charge(
  partial: Partial<CompanyAsaasChargeResponse> & { installmentId: string },
): CompanyAsaasChargeResponse {
  return {
    id: `ch-${partial.installmentId}`,
    companyId: 'co1',
    saleId: 'sale-1',
    installmentId: partial.installmentId,
    customerId: 'c1',
    financialAccountId: 'acc1',
    asaasPaymentId: `pay_${partial.installmentId}`,
    billingType: 'BOLETO',
    status: 'PENDING',
    value: 100,
    netValue: 100,
    dueDate: '2026-09-12',
    description: null,
    invoiceUrl: null,
    bankSlipUrl: null,
    bankSlipIdentification: null,
    barCode: null,
    pixQrCode: null,
    pixCopyPaste: null,
    externalReference: partial.installmentId,
    paymentDate: null,
    confirmedDate: null,
    cashMovementId: null,
    rawPayload: null,
    createdAt: null,
    updatedAt: null,
    ...partial,
  } as CompanyAsaasChargeResponse;
}

function build100Missing() {
  const installments = Array.from({ length: 100 }, (_, i) =>
    installment({
      id: `p${i + 1}`,
      installment_number: i + 1,
      due_date: `2026-${String(((i % 12) + 1)).padStart(2, '0')}-12`,
      amount: 1000,
    }),
  );
  const summary = buildSaleChargesSummaryFromRows({
    saleId: 'sale-1',
    companyId: 'co1',
    installments,
    charges: [],
    context: {
      customerName: 'Cliente',
      customerEmail: null,
      customerPhone: null,
      projectName: 'Emp',
      quadra: '1',
      lote: '1',
      lotLabel: null,
      contractNumber: null,
      financialAccountId: 'acc1',
    },
    financialAccountName: 'Conta',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
    installmentCorrectionType: 'FIXED',
  });
  return { installments, summary };
}

// --- Caso 1: 100 faltantes, gerar 6 ---
{
  const { summary } = build100Missing();
  assert(summary.chargesMissing === 100, 'caso1: 100 faltantes');
  const plan = planGenerateMissingCharges({
    missingOrdered: summary.missingInstallments,
    quantityRequested: 6,
  });
  assert(plan.quantity === 6, 'caso1: plano = 6');
  assert(plan.selected.length === 6, 'caso1: 6 selecionadas');
  assert(plan.first?.installmentNumber === 1, 'caso1: inicia na 01');
  assert(plan.last?.installmentNumber === 6, 'caso1: termina na 06');
  assert(summary.chargesMissing - plan.quantity === 94, 'caso1: 94 permanecem');
}

// --- Caso 2: já 1-6, pedir mais 6 → 7-12 ---
{
  const { installments } = build100Missing();
  const charges = [1, 2, 3, 4, 5, 6].map((n) =>
    charge({ installmentId: `p${n}`, status: 'PENDING' }),
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
      projectName: 'Emp',
      quadra: '1',
      lote: '1',
      lotLabel: null,
      contractNumber: null,
      financialAccountId: 'acc1',
    },
    financialAccountName: 'Conta',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
  });
  assert(summary.chargesGenerated === 6, 'caso2: 6 geradas');
  assert(summary.chargesMissing === 94, 'caso2: 94 faltantes');
  const plan = planGenerateMissingCharges({
    missingOrdered: summary.missingInstallments,
    quantityRequested: 6,
  });
  assert(plan.first?.installmentNumber === 7, 'caso2: próxima é 07');
  assert(plan.last?.installmentNumber === 12, 'caso2: até 12');
  assert(
    !plan.selected.some((s) => (s.installmentNumber || 0) <= 6),
    'caso2: não duplica 1-6',
  );
}

// --- Caso 3: paga não recria ---
{
  const paid = installment({ id: 'p1', status: 'pago', paid_at: '2026-01-01' });
  assert(!isEligibleInstallmentForAsaasCharge(paid), 'caso3: paga inelegível');
  const c = charge({ installmentId: 'p1', status: 'PAID' });
  assert(installmentHasBlockingCharge(c), 'caso3: PAID bloqueia');
}

// --- Caso 4: falha parcial → retry só faltantes ---
{
  const { installments } = build100Missing();
  const charges = [1, 2, 3, 4].map((n) =>
    charge({ installmentId: `p${n}`, status: 'REGISTERED' }),
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
      projectName: 'Emp',
      quadra: '1',
      lote: '1',
      lotLabel: null,
      contractNumber: null,
      financialAccountId: 'acc1',
    },
    financialAccountName: 'Conta',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
  });
  assert(summary.chargesGenerated === 4, 'caso4: 4 ok');
  const plan = planGenerateMissingCharges({
    missingOrdered: summary.missingInstallments,
    quantityRequested: 2,
  });
  assert(plan.first?.installmentNumber === 5, 'caso4: retry na 05');
  assert(plan.last?.installmentNumber === 6, 'caso4: e 06');
}

// --- Caso 5: IPCA aviso ---
{
  assert(saleHasMonetaryCorrection('IPCA'), 'caso5: IPCA');
  assert(saleHasMonetaryCorrection('IGPM'), 'caso5: IGPM');
  assert(saleHasMonetaryCorrection('INCC'), 'caso5: INCC');
  assert(SALE_CHARGES_CORRECTION_WARNING.includes('correção monetária'), 'caso5: texto aviso');
  const { summary } = build100Missing();
  const withIpca = {
    ...summary,
    installmentCorrectionType: 'IPCA',
  };
  assert(
    saleHasMonetaryCorrection(withIpca.installmentCorrectionType),
    'caso5: summary IPCA',
  );
}

// --- Caso 6: FIXED ---
{
  assert(!saleHasMonetaryCorrection('FIXED'), 'caso6: FIXED sem aviso');
  assert(!saleHasMonetaryCorrection(null), 'caso6: null sem aviso');
}

// --- Caso 7: quantidade > faltantes ---
{
  assert(
    clampGenerateMissingChargesQuantity(50, 10) === 10,
    'caso7: limita às faltantes',
  );
  assert(
    clampGenerateMissingChargesQuantity(1000, 100) ===
      SALE_CHARGES_GENERATE_ACTION_MAX,
    'caso7: respeita teto de ação',
  );
  assert(clampGenerateMissingChargesQuantity(0, 10) === 0, 'caso7: zero inválido');
  assert(clampGenerateMissingChargesQuantity(-3, 10) === 0, 'caso7: negativo');
}

// --- Caso 8: double-click (UI) ---
{
  const panel = fs.readFileSync(
    path.join(process.cwd(), 'components/sales/SaleChargesPanel.tsx'),
    'utf8',
  );
  assert(panel.includes('if (!saleId || !summary || generating) return'), 'caso8: guarda generating');
  assert(panel.includes('disabled={generating'), 'caso8: botões disabled');
}

// --- Caso 9: venda antiga (campos novos opcionais no builder) ---
{
  const summary = buildSaleChargesSummaryFromRows({
    saleId: 'sale-old',
    companyId: 'co1',
    installments: [installment({ id: 'p1', sale_id: 'sale-old' })],
    charges: [],
    context: {
      customerName: 'Legado',
      customerEmail: null,
      customerPhone: null,
      projectName: 'P',
      quadra: '1',
      lote: '2',
      lotLabel: null,
      contractNumber: null,
      financialAccountId: null,
    },
    financialAccountName: null,
    hasFinancialAccount: false,
    financialAccountBlockReason: 'Sem conta',
  });
  assert(Array.isArray(summary.missingInstallments), 'caso9: missingInstallments');
  assert(summary.installmentCorrectionType === null, 'caso9: correction null');
}

// --- Caso 10: batch interno 5 com N=12 ---
{
  const batches = splitGenerateMissingChargesBatches(12, SALE_CHARGES_GENERATE_BATCH_LIMIT);
  assert(
    JSON.stringify(batches) === JSON.stringify([5, 5, 2]),
    'caso10: 12 → 5+5+2',
  );
  assert(
    batches.reduce((a, b) => a + b, 0) === 12,
    'caso10: soma = quantidade da ação',
  );
  assert(
    SALE_CHARGES_QUANTITY_PRESETS.every((n) => n <= SALE_CHARGES_GENERATE_ACTION_MAX),
    'caso10: presets dentro do teto',
  );
}

// UI modal
{
  const panel = fs.readFileSync(
    path.join(process.cwd(), 'components/sales/SaleChargesPanel.tsx'),
    'utf8',
  );
  assert(panel.includes('Gerar cobranças'), 'modal título');
  assert(panel.includes('Próximas {n}'), 'atalhos 3/6/12 via preset');
  assert(panel.includes('SALE_CHARGES_QUANTITY_PRESETS'), 'usa presets centralizados');
  assert(panel.includes('Personalizado'), 'personalizado');
  assert(panel.includes('planGenerateMissingCharges'), 'usa plano domínio');
  assert(panel.includes('splitGenerateMissingChargesBatches'), 'usa batches');
  assert(!panel.includes('while (remaining > 0)'), 'não zera todas as faltantes');
}

console.log('\nOK mandatory-sale-charges-generate-quantity-tests');
