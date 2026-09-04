/**
 * Distrato — termo documental aditivo sobre ReleaseLot.
 * npx tsx scripts/mandatory-termination-document-distrato-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { calculateTerminationSettlement } from '../lib/contract-termination/calculateSettlement';
import { POLICY_CATALOG } from '../lib/contract-termination/policyCatalog';
import { buildTerminationPolicySnapshot } from '../lib/contract-termination/snapshot';
import type { TerminationReceiptInput } from '../lib/contract-termination/types';
import {
  canConfirmReleaseLot,
  classifyFinanceReceiptForRelease,
  LOT_AVAILABLE_STATUS,
  SALE_CANCELLED_STATUS,
  CONTRACT_CANCELLED_STATUS,
  validateReleaseLotMotive,
} from '../lib/finance/releaseLotShared';
import { prepareReleaseSettlement } from '../lib/finance/saleReleaseSettlement';
import {
  isOriginalTerminationDocumentType,
  isSignedTerminationDocumentType,
  SALE_DOCUMENT_TYPE_LABELS,
} from '../lib/saleDocuments';
import { lotHistoryTerminationDocumentLinks } from '../lib/lotHistoryPresentation';
import {
  terminationDocumentPrefixForType,
  terminationOriginalSaleDocumentType,
  terminationSignedSaleDocumentType,
} from '../lib/termination-documents/documentKinds';
import { TERMINATION_DOCUMENT_PREFIX_DISTRATO } from '../lib/termination-documents/numbering';
import { resolveTerminationDocumentHtmlBuilder } from '../lib/termination-documents/resolveTemplate';
import {
  buildTerminationDocumentSnapshot,
  type FrozenSettlementFinance,
} from '../lib/termination-documents/snapshot';
import {
  isDistratoTerminationOperation,
  shouldGenerateTerminationDocument,
  terminationDocumentTitleForType,
} from '../lib/termination-documents/titles';
import {
  DISTRATO_DOCUMENT_TITLE,
  DESISTENCIA_DOCUMENT_TITLE,
} from '../lib/termination-documents/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function rec(installmentNumber: number, amount: number, status = 'pago'): TerminationReceiptInput {
  return {
    id: `r-${installmentNumber}-${amount}`,
    installment_number: installmentNumber,
    status,
    amount,
  };
}

const araguaiaSnapshot = buildTerminationPolicySnapshot({
  contractModel: 'ARAGUAIA',
  persistSource: 'catalog',
}).termination_policy_snapshot;

function preparedDistrato(extra?: {
  receipts?: TerminationReceiptInput[];
  operator?: Partial<Parameters<typeof prepareReleaseSettlement>[0]['operator']>;
}) {
  return prepareReleaseSettlement({
    motiveCode: 'distrato',
    receipts: extra?.receipts || [rec(0, 2000), rec(1, 1000), rec(2, 1000), rec(3, 1000, 'pendente')],
    saleSnapshot: araguaiaSnapshot,
    salePersistSource: 'catalog',
    saleContractModel: 'ARAGUAIA',
    operator: {
      hasImprovements: false,
      improvementsAppraisalStatus: 'NONE',
      improvementItems: [],
      refundDestination: 'REFUND_CUSTOMER',
      exceptionalAgreement: false,
      exceptionalReason: null,
      exceptionalRefundAmount: null,
      exceptionalRetentionPercent: null,
      refundFirstDueDate: null,
      ...extra?.operator,
    },
  });
}

function settlementRow(
  prepared: ReturnType<typeof preparedDistrato>,
  extra: Partial<FrozenSettlementFinance> = {},
): FrozenSettlementFinance {
  const s = prepared.settlement;
  return {
    id: 'settlement-distrato',
    sale_id: 'sale-distrato',
    company_id: 'company-a',
    contract_id: 'contract-distrato',
    block_id: 'block-distrato',
    project_id: 'project-distrato',
    operation_type: 'distrato',
    total_paid: s.totalPaid,
    entry_amount: s.entryPaid,
    signal_amount: s.signalPaid,
    non_refundable_amount: s.nonRefundableAmount,
    refundable_base: s.refundableBase,
    retention_percent: s.contractualRetentionPercent,
    retention_amount: s.contractualRetentionAmount,
    agreed_refund_amount: s.agreedRefundAmount,
    contractual_refund_amount: s.contractualRefundAmount,
    refund_installments: s.refundInstallmentCount,
    refund_destination: prepared.refundDestination,
    improvement_status: prepared.improvementStatus,
    policy_snapshot: prepared.policySnapshot,
    operator_user_id: 'operator-1',
    calculation_status: prepared.calculationStatus,
    calculation_snapshot: extra.calculation_snapshot ?? {
      ...s,
      refundSchedule: prepared.refundSchedule,
      improvements: prepared.improvements,
      obligation: prepared.obligation,
    },
    reason: 'Distrato',
    reason_detail: 'acordo entre as partes',
    ...extra,
  };
}

function testJustificationRequired() {
  assert(validateReleaseLotMotive({ motiveCode: 'distrato' }).ok === false, 'sem justificativa');
  assert(
    validateReleaseLotMotive({ motiveCode: 'distrato', motiveDetail: 'ab' }).ok === false,
    'justificativa curta',
  );
  const ok = validateReleaseLotMotive({
    motiveCode: 'distrato',
    motiveDetail: 'acordo entre as partes',
  });
  assert(ok.ok === true && ok.motiveCode === 'distrato', 'justificativa válida');
  assert(ok.ok === true && ok.motiveDetail === 'acordo entre as partes', 'detalhe preservado');
  assert(
    !canConfirmReleaseLot({
      motiveCode: 'distrato',
      motiveDetail: '',
      acknowledged: true,
      password: 'x',
    }),
    'confirm bloqueado sem justificativa',
  );
  assert(
    canConfirmReleaseLot({
      motiveCode: 'distrato',
      motiveDetail: 'acordo entre as partes',
      acknowledged: true,
      password: 'x',
    }),
    'confirm habilitado',
  );
  assert(
    validateReleaseLotMotive({ motiveCode: 'desistencia' }).ok === true,
    'desistência não exige o campo de distrato',
  );
  console.log('OK testJustificationRequired');
}

function testDocumentGeneratedFromSettlement() {
  const prepared = preparedDistrato();
  const snap = buildTerminationDocumentSnapshot({
    settlement: settlementRow(prepared),
    documentNumber: 'DT-000000001/2026',
    context: {
      contractNumber: '000000010/2026',
      contractModel: 'ARAGUAIA',
      projectName: 'Loteamento Homolog',
      quadra: '01',
      lote: '02',
      vendor: { role: 'vendedor', name: 'SV LOTES SPE', document: '00.000.000/0001-00', extra: null },
      buyer: { role: 'comprador', name: 'Cliente Teste', document: '123.456.789-00', extra: null },
      pendingObligationsCanceled: true,
    },
  });
  assert(snap.operationType === 'distrato', 'tipo distrato');
  assert(snap.title === DISTRATO_DOCUMENT_TITLE, 'título padrão SV LOTES');
  assert(snap.documentNumber.startsWith('DT-'), 'prefixo DT');
  assert(snap.html.includes(DISTRATO_DOCUMENT_TITLE), 'HTML com título');
  assert(!snap.html.includes(DESISTENCIA_DOCUMENT_TITLE), 'não usa título da desistência');
  assert(!snap.html.includes('Comprador / desistente'), 'linguagem de distrato');
  assert(snap.html.includes('acordo entre as partes'), 'justificativa no documento');
  assert(snap.html.includes('Cliente Teste'), 'comprador');
  assert(snap.html.includes('SV LOTES SPE'), 'empresa');
  assert(snap.html.includes('Loteamento Homolog'), 'empreendimento');
  assert(snap.html.includes('000000010/2026'), 'contrato');
  assert(snap.totalPaid === prepared.settlement.totalPaid, 'total pago do settlement');
  assert(snap.agreedRefundAmount === prepared.settlement.agreedRefundAmount, 'líquido do settlement');
  assert(snap.retentionAmount === prepared.settlement.contractualRetentionAmount, 'retenção do settlement');
  assert(snap.html.includes('4.000,00') || snap.totalPaid === 4000, 'valores pagos refletidos');
  assert(snap.reasonDetail === 'acordo entre as partes', 'reason_detail congelado');
  console.log('OK testDocumentGeneratedFromSettlement');
}

function testPaidPreservedOpenCanceled() {
  const paid = rec(0, 2000);
  const open = rec(1, 1000, 'pendente');
  const overdue = rec(2, 1000, 'atrasado');
  assert(classifyFinanceReceiptForRelease(paid) === 'paid', 'pago preservado');
  assert(classifyFinanceReceiptForRelease(open) === 'pending', 'pendente a cancelar');
  assert(classifyFinanceReceiptForRelease(overdue) === 'overdue', 'atrasado a cancelar');
  const prepared = preparedDistrato({ receipts: [paid, open, overdue] });
  assert(prepared.receiptsSnapshot.paid.count === 1, 'snapshot conta pago');
  assert(prepared.receiptsSnapshot.pending.count + prepared.receiptsSnapshot.overdue.count === 2, 'abertos no snapshot');
  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('isPaidFinanceReceiptStatus'), 'pagos conferidos');
  assert(svc.includes("status: RECEIPT_CANCELLED_STATUS"), 'abertos cancelados');
  assert(svc.includes('SALE_CANCELLED_STATUS'), 'venda encerrada');
  assert(svc.includes('CONTRACT_CANCELLED_STATUS'), 'contrato encerrado');
  assert(svc.includes('LOT_AVAILABLE_STATUS'), 'lote Disponível');
  assert(SALE_CANCELLED_STATUS === 'CANCELLED', 'status venda');
  assert(CONTRACT_CANCELLED_STATUS === 'cancelado', 'status contrato');
  assert(LOT_AVAILABLE_STATUS === 'Disponível', 'status lote');
  console.log('OK testPaidPreservedOpenCanceled');
}

function testImprovementsAndExceptionStayDistratoOnly() {
  const withImp = preparedDistrato({
    operator: {
      hasImprovements: true,
      improvementsAppraisalStatus: 'COMPLETED',
      improvementItems: [{ description: 'Muro', amount: 500 }],
    },
  });
  assert(withImp.hasImprovements === true, 'benfeitorias no acerto');
  assert(withImp.obligation.improvementsTotal === 500, 'valor da benfeitoria');
  const calc = calculateTerminationSettlement({
    motiveCode: 'distrato',
    policy: POLICY_CATALOG.ARAGUAIA,
    receipts: [rec(0, 2000), rec(1, 1000)],
    hasImprovements: false,
    destination: 'REFUND_CUSTOMER',
    exceptionOverride: { enabled: true, justification: 'acordo especial', refundAmount: 900 },
  });
  assert(calc.exceptionApplied === true, 'exceção permitida no distrato');
  const desist = calculateTerminationSettlement({
    motiveCode: 'desistencia',
    policy: POLICY_CATALOG.ARAGUAIA,
    receipts: [rec(0, 2000), rec(1, 1000)],
    hasImprovements: false,
    destination: 'REFUND_CUSTOMER',
    exceptionOverride: { enabled: true, justification: 'acordo especial', refundAmount: 900 },
  });
  assert(desist.exceptionApplied === false, 'exceção continua só no distrato');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes("allowException={motiveCode === 'distrato'}"), 'UI exceção só distrato');
  console.log('OK testImprovementsAndExceptionStayDistratoOnly');
}

function testHistoryAndKinds() {
  const links = lotHistoryTerminationDocumentLinks({
    action: 'sale_cancelled',
    saleId: 'sale-distrato',
    motiveCode: 'distrato',
  });
  assert(Boolean(links), 'histórico registra distrato');
  assert(links?.saleId === 'sale-distrato', 'sale_id preservado');
  assert(Boolean(links?.viewHref.includes('termination-document')), 'termo recuperável');
  assert(terminationOriginalSaleDocumentType('distrato') === 'DISTRATO', 'tipo original');
  assert(terminationSignedSaleDocumentType('distrato') === 'DISTRATO_ASSINADO', 'tipo assinado');
  assert(terminationOriginalSaleDocumentType('desistencia') === 'DESISTENCIA', 'desistência intacta');
  assert(
    terminationSignedSaleDocumentType('desistencia') === 'DESISTENCIA_ASSINADO',
    'assinado desistência intacto',
  );
  assert(terminationDocumentPrefixForType('distrato') === TERMINATION_DOCUMENT_PREFIX_DISTRATO, 'DT');
  assert(terminationDocumentPrefixForType('desistencia') === 'TD', 'TD desistência');
  assert(isOriginalTerminationDocumentType('DISTRATO'), 'DISTRATO original');
  assert(isSignedTerminationDocumentType('DISTRATO_ASSINADO'), 'DISTRATO_ASSINADO');
  assert(isOriginalTerminationDocumentType('DESISTENCIA'), 'DESISTENCIA original');
  assert(isSignedTerminationDocumentType('DESISTENCIA_ASSINADO'), 'DESISTENCIA_ASSINADO');
  assert(
    SALE_DOCUMENT_TYPE_LABELS.DISTRATO_ASSINADO.includes('assinado'),
    'label assinado',
  );
  assert(isDistratoTerminationOperation('distrato'), 'helper distrato');
  assert(!isDistratoTerminationOperation('desistencia'), 'não confunde desistência');
  console.log('OK testHistoryAndKinds');
}

function testTemplateIsolationAndResolverHook() {
  assert(shouldGenerateTerminationDocument('distrato'), 'gera termo');
  assert(shouldGenerateTerminationDocument('desistencia'), 'desistência continua gerando');
  assert(!shouldGenerateTerminationDocument('inadimplencia'), 'inadimplência sem termo');
  assert(!shouldGenerateTerminationDocument('erro_cadastro'), 'erro sem termo');
  assert(!shouldGenerateTerminationDocument('cancelamento_administrativo'), 'admin sem termo');
  assert(
    terminationDocumentTitleForType('distrato') === DISTRATO_DOCUMENT_TITLE,
    'título distrato',
  );
  assert(
    terminationDocumentTitleForType('desistencia') === DESISTENCIA_DOCUMENT_TITLE,
    'título desistência intacto',
  );
  const builder = resolveTerminationDocumentHtmlBuilder({
    operationType: 'distrato',
    contractModel: 'ARAGUAIA',
  });
  const desistBuilder = resolveTerminationDocumentHtmlBuilder({
    operationType: 'desistencia',
    contractModel: 'ARAGUAIA',
  });
  assert(builder !== desistBuilder, 'templates distintos');
  const resolver = read('lib/termination-documents/resolveTemplate.ts');
  assert(resolver.includes('contractModel'), 'gancho futuro de modelo');
  assert(resolver.includes('void input.contractModel'), 'não ramifica modelo nesta etapa');
  const desistTpl = read('lib/termination-documents/desistenciaTemplate.ts');
  assert(desistTpl.includes('export function buildDesistenciaTermHtml'), 'template desistência intacto');
  assert(!desistTpl.includes('buildDistratoTermHtml'), 'desistência não importa distrato');
  const wip = [
    'lib/contract-operations/',
    'supabase/migrations/20261008120000_sale_contract_operations.sql',
  ];
  for (const rel of wip) {
    assert(!fs.existsSync(path.join(__dirname, '..', rel)), `WIP ausente: ${rel}`);
  }
  console.log('OK testTemplateIsolationAndResolverHook');
}

function testZeroPaidDistratoDocument() {
  const prepared = preparedDistrato({
    receipts: [{ id: 'open-dt', installment_number: 1, status: 'pendente', amount: 1800 }],
  });
  assert(prepared.settlement.totalPaid === 0, 'distrato sem pagamentos: total 0');
  assert(prepared.calculationStatus === 'CALCULATED', 'distrato zerado CALCULATED');
  const snap = buildTerminationDocumentSnapshot({
    settlement: settlementRow(prepared, { reason_detail: 'cliente desistiu antes de pagar' }),
    documentNumber: 'DT-000000099/2026',
    context: {
      contractNumber: '000000099/2026',
      contractModel: 'ARAGUAIA',
      projectName: 'Loteamento Homolog',
      quadra: '01',
      lote: '09',
      vendor: { role: 'vendedor', name: 'SV LOTES SPE', document: null, extra: null },
      buyer: { role: 'comprador', name: 'Cliente Sem Pagamento', document: null, extra: null },
      pendingObligationsCanceled: true,
    },
  });
  assert(snap.operationType === 'distrato', 'motivo distrato escolhido');
  assert(snap.documentNumber.startsWith('DT-'), 'prefixo DT');
  assert(snap.totalPaid === 0, 'documento total 0');
  assert(snap.agreedRefundAmount === 0, 'documento restituição 0');
  assert(snap.html.includes(DISTRATO_DOCUMENT_TITLE), 'documento gerado');
  console.log('OK testZeroPaidDistratoDocument');
}

function testReleaseMotorUnchangedAndSource() {
  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('shouldGenerateTerminationDocument(motive.motiveCode)'), 'documento via gate');
  assert(svc.includes('export async function executeReleaseLot'), 'motor único');
  assert(!svc.includes('completeContractOperation'), 'sem segunda arquitetura');
  assert(!svc.includes("from('sale_contract_operations')"), 'sem tabela WIP');
  const barrel = read('lib/termination-documents/index.ts');
  assert(
    (barrel.match(/SALE_DOCUMENT_TYPE_DESISTENCIA_ASSINADO/g) || []).length === 1,
    'sem export duplicado no barrel',
  );
  const persist = read('lib/termination-documents/persist.ts');
  assert(persist.includes('terminationDocumentPrefixForType'), 'prefixo por operação');
  assert(persist.includes('TERMINATION_DOCUMENT_PREFIX_DESISTENCIA'), 'TD permanece no persist');
  assert(persist.includes('SALE_DOCUMENT_TYPE_DESISTENCIA'), 'tipo DESISTENCIA permanece');
  const sig = read('lib/termination-documents/signature.ts');
  assert(sig.includes('SALE_DOCUMENT_TYPE_DESISTENCIA_ASSINADO'), 'e-sign desistência');
  assert(sig.includes('terminationSignedSaleDocumentType'), 'e-sign distrato');
  assert(sig.includes("signed_document_type', TERMINATION_SIGNED_DOCUMENT_TYPE"), 'mesmo motor TERMO');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes('Motivo / justificativa do distrato'), 'campo distrato');
  assert(modal.includes('Justificativa administrativa'), 'admin intacto');
  const migrations = fs.readdirSync(path.join(__dirname, '..', 'supabase/migrations'));
  assert(
    !migrations.includes('20261008120000_sale_contract_operations.sql'),
    'sem migration WIP',
  );
  console.log('OK testReleaseMotorUnchangedAndSource');
}

function main() {
  testJustificationRequired();
  testDocumentGeneratedFromSettlement();
  testPaidPreservedOpenCanceled();
  testImprovementsAndExceptionStayDistratoOnly();
  testHistoryAndKinds();
  testTemplateIsolationAndResolverHook();
  testZeroPaidDistratoDocument();
  testReleaseMotorUnchangedAndSource();
  console.log('ALL mandatory-termination-document-distrato-tests passed');
}

main();
