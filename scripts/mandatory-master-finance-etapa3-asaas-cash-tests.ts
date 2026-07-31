/**
 * Etapa 3 — Asaas, transferências e receitas extraordinárias (Caixa SaaS).
 * npm run test:master-finance-etapa3-asaas-cash
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  mapAsaasFinancialTransaction,
  isAsaasCashSyncTransferMapping,
  isAsaasCashSyncExpenseMapping,
  saasCashAffectsPnl,
} from '../lib/asaasFinancialTransactions';
import {
  MANUAL_EXTRAORDINARY_INCOME_ORIGIN,
  computeSaasCashSummaryFromRows,
  saasCashTypeLabel,
  type SaasCashMovement,
} from '../lib/saasCashMovements';
import { mapMovementsToExportRows } from '../lib/saasCashExport';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testTransferAndWithdrawalOutsidePnl() {
  const transfer = mapAsaasFinancialTransaction({
    id: 'e3-tr',
    type: 'TRANSFER',
    value: -500,
    date: '2026-07-20',
    description: 'Transferência bancária',
  });
  assert(isAsaasCashSyncTransferMapping(transfer), 'TRANSFER → transfer');
  assert(!saasCashAffectsPnl(transfer.type), 'transfer fora do P&L');

  const summary = computeSaasCashSummaryFromRows([
    { type: 'income', amount: 1000 },
    { type: 'expense', amount: 50 },
    { type: 'transfer', amount: 500 },
  ]);
  assert(summary.periodIncome === 1000, 'income só receitas');
  assert(summary.periodExpense === 50, 'expense só despesas');
  assert(summary.periodTransfer === 500, 'periodTransfer informativo');
  assert(summary.netResult === 950, 'resultado = income − expense');
  console.log('OK testTransferAndWithdrawalOutsidePnl');
}

function testFeeAndBillPaymentAsExpense() {
  const fee = mapAsaasFinancialTransaction({
    id: 'e3-fee',
    type: 'PAYMENT_FEE',
    value: -2.99,
    date: '2026-07-20',
  });
  assert(isAsaasCashSyncExpenseMapping(fee), 'tarifa = expense');

  const bill = mapAsaasFinancialTransaction({
    id: 'e3-bill',
    type: 'BILL_PAYMENT',
    value: -120,
    date: '2026-07-20',
    description: 'Conta de luz',
  });
  assert(bill.type === 'expense', 'pagamento de conta = expense');
  assert(bill.category === 'Pagamento de conta', 'categoria boleto');
  console.log('OK testFeeAndBillPaymentAsExpense');
}

function testWebhookIncomeNotDuplicatedByExtract() {
  const received = mapAsaasFinancialTransaction({
    id: 'e3-pay',
    type: 'PAYMENT_RECEIVED',
    value: 299,
    date: '2026-07-20',
    paymentId: 'pay_known',
  });
  assert(received.skip === true, 'PAYMENT_RECEIVED skip');
  assert(received.skipReason === 'webhook_income', 'motivo webhook_income');

  const svc = read('lib/saasCashMovements.ts');
  assert(svc.includes('asaas_payment_id'), 'dedup por payment id');
  assert(svc.includes('findExistingByAsaasMovementId'), 'dedup por movement id');
  assert(
    svc.includes("mapped.type === 'income' && paymentId"),
    'extrato não duplica income existente',
  );
  console.log('OK testWebhookIncomeNotDuplicatedByExtract');
}

function testPixDebitNotAlwaysTransfer() {
  const ambiguous = mapAsaasFinancialTransaction({
    id: 'e3-pix-a',
    type: 'PIX_TRANSACTION_DEBIT',
    value: -10,
    date: '2026-07-20',
    description: 'Pix chave aleatória',
  });
  assert(ambiguous.type === 'transfer', 'ambíguo fora do P&L');
  assert(ambiguous.metadata?.needs_classification === true, 'pendente classificação');

  const withId = mapAsaasFinancialTransaction({
    id: 'e3-pix-t',
    type: 'PIX_TRANSACTION_DEBIT',
    value: -10,
    date: '2026-07-20',
    description: 'Pix',
    transferId: 'tr_1',
  });
  assert(withId.category === 'Transferência Pix', 'transferId → transfer pix');

  const expenseLike = mapAsaasFinancialTransaction({
    id: 'e3-pix-e',
    type: 'PIX_TRANSACTION_DEBIT',
    value: -10,
    date: '2026-07-20',
    description: 'Pagamento boleto fornecedor',
  });
  assert(expenseLike.type === 'expense', 'descrição pagamento → expense');
  console.log('OK testPixDebitNotAlwaysTransfer');
}

function testRefundKeepsLink() {
  const refund = mapAsaasFinancialTransaction({
    id: 'e3-ref',
    type: 'PAYMENT_REVERSAL',
    value: -100,
    date: '2026-07-20',
    paymentId: 'pay_orig',
  });
  assert(refund.source === 'asaas_refund', 'source estorno');
  assert(
    refund.metadata?.related_asaas_payment_id === 'pay_orig',
    'vínculo com pagamento original',
  );
  console.log('OK testRefundKeepsLink');
}

function testOrphanPixCreditFlagged() {
  const orphan = mapAsaasFinancialTransaction({
    id: 'e3-pix-c',
    type: 'PIX_TRANSACTION_CREDIT',
    value: 350,
    date: '2026-07-20',
    description: 'Pix recebido avulso',
  });
  assert(!orphan.skip, 'crédito órfão não ignorado');
  assert(orphan.type === 'income', 'crédito = income');
  assert(orphan.metadata?.needs_classification === true, 'precisa conciliação');
  assert(orphan.metadata?.orphan_credit === true, 'flag orphan');
  console.log('OK testOrphanPixCreditFlagged');
}

function testExtraordinaryIncomeContracts() {
  const svc = read('lib/saasCashMovements.ts');
  assert(svc.includes('createExtraordinarySaasIncome'), 'create extraordinária');
  assert(svc.includes('updateExtraordinarySaasIncome'), 'update seguro');
  assert(svc.includes(MANUAL_EXTRAORDINARY_INCOME_ORIGIN), 'origem MANUAL_EXTRAORDINARY_INCOME');
  assert(svc.includes("business_unit: 'SV_LOTES'"), 'BU SV_LOTES');
  assert(svc.includes('external_reference'), 'dedup referência externa');
  assert(svc.includes('SAAS_CASH_EXTRAORDINARY_'), 'auditoria');
  assert(
    svc.includes('Somente receita extraordinária manual pode ser editada'),
    'bloqueia edição de não-extraordinária',
  );

  const route = read('app/api/master/saas-cash/manual-income/route.ts');
  assert(route.includes('createExtraordinarySaasIncome'), 'POST');
  assert(route.includes('updateExtraordinarySaasIncome'), 'PATCH');
  assert(route.includes('externalReference'), 'API aceita ref externa');

  const panel = read('components/master/saas/SaasCashPanel.tsx');
  assert(panel.includes('Receita extraordinária'), 'UI modal');
  assert(panel.includes('externalReference'), 'campo ref externa');
  assert(panel.includes('periodTransfer'), 'card transferências');
  assert(panel.includes("value=\"transfer\""), 'filtro transfer');
  console.log('OK testExtraordinaryIncomeContracts');
}

function testExportAndLabelsIdentifyTransfer() {
  assert(saasCashTypeLabel('transfer') === 'Transferência', 'label transfer');
  const rows = mapMovementsToExportRows([
    {
      id: '1',
      company_id: null,
      saas_charge_id: null,
      asaas_payment_id: null,
      type: 'transfer',
      category: 'Saque',
      description: 'Saque Asaas',
      amount: 200,
      movement_date: '2026-07-15',
      source: 'asaas_transfer',
      metadata: {},
      created_at: null,
      created_by: null,
    } as SaasCashMovement,
    {
      id: '2',
      company_id: null,
      saas_charge_id: null,
      asaas_payment_id: null,
      type: 'income',
      category: 'Assinatura',
      description: 'Mensalidade',
      amount: 299,
      movement_date: '2026-07-16',
      source: 'asaas_webhook',
      metadata: {},
      created_at: null,
      created_by: null,
    } as SaasCashMovement,
  ]);
  assert(rows[0].type === 'Transferência', 'export tipo transfer');
  assert(rows[0].amount < 0, 'transfer assinado negativo no export');
  assert(rows[1].type === 'Entrada', 'export tipo income');
  assert(rows[1].amount > 0, 'income positivo');

  const exportLib = read('lib/saasCashExport.ts');
  assert(exportLib.includes('periodTransfer'), 'export resume transfer');
  console.log('OK testExportAndLabelsIdentifyTransfer');
}

function testTenantFinanceModulesIntact() {
  const companyCash = read('lib/finance/companyAsaasFinancialTransactions.ts');
  assert(companyCash.includes('mapAsaasFinancialTransaction'), 'tenant reutiliza mapper');
  assert(companyCash.includes("sync_scope: 'company'"), 'escopo company preservado');
  assert(companyCash.includes('CompanyCashMovementType'), 'tipos company preservados');

  // Dashboard Executivo fora do escopo desta etapa — contrato de não remoção.
  const dash = read('components/master/dashboard/MasterExecutiveDashboard.tsx');
  assert(dash.includes('Indicadores SV LOTES (SaaS)'), 'dashboard não removido');

  const companySyncTests = read('scripts/mandatory-company-asaas-cash-sync-tests.ts');
  assert(companySyncTests.includes('mapCompanyAsaasFinancialTransaction'), 'suite tenant intacta');
  console.log('OK testTenantFinanceModulesIntact');
}

function testHistoricalScriptDryRunOnlyContracts() {
  const hist = read('scripts/reclassify-saas-cash-transfers.ts');
  assert(hist.includes("APPLY=true"), 'documenta APPLY');
  assert(hist.includes('DRY_RUN'), 'modo dry-run');
  assert(hist.includes('candidateCount'), 'relatório quantidade');
  assert(hist.includes('candidateTotal'), 'relatório valor total');
  assert(hist.includes('pix_debit+pending_review'), 'regra pix pendente');
  assert(!hist.includes('process.env.APPLY') || hist.includes('apply'), 'flag apply');
  console.log('OK testHistoricalScriptDryRunOnlyContracts');
}

function testAntiDupDocumentation() {
  const svc = read('lib/saasCashMovements.ts');
  assert(svc.includes('anti-duplicidade'), 'doc anti-dup');
  assert(svc.includes('NÃO há ponte automática AR SV LOTES'), 'sem ponte AR↔SaaS');
  console.log('OK testAntiDupDocumentation');
}

function main() {
  testTransferAndWithdrawalOutsidePnl();
  testFeeAndBillPaymentAsExpense();
  testWebhookIncomeNotDuplicatedByExtract();
  testPixDebitNotAlwaysTransfer();
  testRefundKeepsLink();
  testOrphanPixCreditFlagged();
  testExtraordinaryIncomeContracts();
  testExportAndLabelsIdentifyTransfer();
  testTenantFinanceModulesIntact();
  testHistoricalScriptDryRunOnlyContracts();
  testAntiDupDocumentation();
  console.log('\nmandatory-master-finance-etapa3-asaas-cash-tests: all passed');
}

main();
