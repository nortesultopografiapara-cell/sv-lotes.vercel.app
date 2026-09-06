/**
 * Inadimplência — termo documental aditivo sobre ReleaseLot.
 * npx tsx scripts/mandatory-termination-document-inadimplencia-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  INCOMPLETE_POLICY_MESSAGE,
  MISSING_POLICY_MESSAGE,
} from '../lib/contract-termination/policyCatalog';
import { buildTerminationPolicySnapshot } from '../lib/contract-termination/snapshot';
import type { TerminationReceiptInput } from '../lib/contract-termination/types';
import {
  evaluateInadimplenciaPreconditions,
  hasEffectiveInadimplencia,
  INADIMPLENCIA_NO_DEFAULT_MESSAGE,
} from '../lib/finance/inadimplenciaGuards';
import {
  canConfirmReleaseLot,
  classifyFinanceReceiptForRelease,
  CONTRACT_CANCELLED_STATUS,
  LOT_AVAILABLE_STATUS,
  SALE_CANCELLED_STATUS,
  validateReleaseLotMotive,
} from '../lib/finance/releaseLotShared';
import { prepareReleaseSettlement } from '../lib/finance/saleReleaseSettlement';
import { formatLotAuditEvent } from '../lib/lotAudit';
import { lotHistoryTerminationDocumentLinks } from '../lib/lotHistoryPresentation';
import {
  isOriginalTerminationDocumentType,
  isSignedTerminationDocumentType,
  SALE_DOCUMENT_TYPE_LABELS,
} from '../lib/saleDocuments';
import {
  terminationDocumentPrefixForType,
  terminationOriginalSaleDocumentType,
  terminationSignedSaleDocumentType,
} from '../lib/termination-documents/documentKinds';
import { TERMINATION_DOCUMENT_PREFIX_INADIMPLENCIA } from '../lib/termination-documents/numbering';
import { resolveTerminationDocumentHtmlBuilder } from '../lib/termination-documents/resolveTemplate';
import {
  buildTerminationDocumentSnapshot,
  type FrozenSettlementFinance,
} from '../lib/termination-documents/snapshot';
import {
  isInadimplenciaTerminationOperation,
  shouldGenerateTerminationDocument,
  terminationDocumentTitleForType,
} from '../lib/termination-documents/titles';
import {
  DESISTENCIA_DOCUMENT_TITLE,
  DISTRATO_DOCUMENT_TITLE,
  INADIMPLENCIA_DOCUMENT_TITLE,
} from '../lib/termination-documents/types';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/homolog/env';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function rec(
  installmentNumber: number,
  amount: number,
  extra: Partial<TerminationReceiptInput> = {},
): TerminationReceiptInput {
  return {
    id: `r-${installmentNumber}-${amount}-${extra.status || 'pago'}`,
    installment_number: installmentNumber,
    status: extra.status || 'pago',
    amount,
    ...extra,
  };
}

const araguaiaSnapshot = buildTerminationPolicySnapshot({
  contractModel: 'ARAGUAIA',
  persistSource: 'catalog',
}).termination_policy_snapshot;

function preparedInadimplencia(extra?: {
  receipts?: TerminationReceiptInput[];
  saleSnapshot?: Record<string, unknown> | null;
  saleContractModel?: string | null;
  salePersistSource?: string | null;
  operator?: Partial<Parameters<typeof prepareReleaseSettlement>[0]['operator']>;
}) {
  return prepareReleaseSettlement({
    motiveCode: 'inadimplencia',
    receipts:
      extra?.receipts || [
        rec(0, 2000),
        rec(1, 1000),
        rec(2, 1000),
        rec(3, 1000, { status: 'atrasado', due_date: '2020-01-15' }),
      ],
    saleSnapshot: extra?.saleSnapshot === undefined ? araguaiaSnapshot : extra.saleSnapshot,
    salePersistSource: extra?.salePersistSource ?? 'catalog',
    saleContractModel: extra?.saleContractModel ?? 'ARAGUAIA',
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
  prepared: ReturnType<typeof preparedInadimplencia>,
  extra: Partial<FrozenSettlementFinance> = {},
): FrozenSettlementFinance {
  const s = prepared.settlement;
  return {
    id: 'settlement-inadimplencia',
    sale_id: 'sale-inadimplencia',
    company_id: 'company-a',
    contract_id: 'contract-inadimplencia',
    block_id: 'block-inadimplencia',
    project_id: 'project-inadimplencia',
    operation_type: 'inadimplencia',
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
    receipts_snapshot: prepared.receiptsSnapshot,
    calculation_snapshot: extra.calculation_snapshot ?? {
      ...s,
      refundSchedule: prepared.refundSchedule,
      improvements: prepared.improvements,
      obligation: prepared.obligation,
    },
    reason: 'Inadimplência',
    reason_detail: 'parcelas vencidas sem regularização',
    ...extra,
  };
}

function testBlockWithoutOverdue() {
  const pendingFuture = [
    rec(0, 2000),
    rec(1, 800, { status: 'pendente', due_date: '2099-12-31' }),
  ];
  assert(
    !hasEffectiveInadimplencia(pendingFuture, 'ACTIVE'),
    'pendente no prazo não é inadimplência',
  );
  const blocked = evaluateInadimplenciaPreconditions({
    receipts: pendingFuture,
    saleStatus: 'ACTIVE',
    calculationStatus: 'CALCULATED',
  });
  assert(blocked.ok === false, 'bloqueia sem vencido');
  assert(blocked.ok === false && blocked.error === INADIMPLENCIA_NO_DEFAULT_MESSAGE, 'mensagem amigável');
  assert(blocked.ok === false && blocked.code === 'INADIMPLENCIA_NOT_DEFAULT', 'código de bloqueio');
  assert(
    validateReleaseLotMotive({ motiveCode: 'inadimplencia' }).ok === false,
    'justificativa obrigatória',
  );
  assert(
    !canConfirmReleaseLot({
      motiveCode: 'inadimplencia',
      motiveDetail: '',
      acknowledged: true,
      password: 'x',
    }),
    'confirm bloqueado sem justificativa',
  );
  console.log('OK testBlockWithoutOverdue');
}

function testExecuteWithOverdueAndDueDate() {
  const overdueStatus = rec(2, 1500, { status: 'atrasado' });
  const overdueByDate = rec(3, 1500, { status: 'pendente', due_date: '2020-03-01' });
  assert(hasEffectiveInadimplencia([overdueStatus], 'ACTIVE'), 'status atrasado');
  assert(hasEffectiveInadimplencia([overdueByDate], 'ACTIVE'), 'vencido por due_date');
  assert(
    hasEffectiveInadimplencia([rec(1, 100, { status: 'pendente', due_date: '2099-01-01' })], 'INADIMPLENTE'),
    'status da venda marcado inadimplente',
  );
  const prepared = preparedInadimplencia({
    receipts: [rec(0, 2000), rec(1, 1000), overdueStatus, overdueByDate],
  });
  const gate = evaluateInadimplenciaPreconditions({
    receipts: [rec(0, 2000), rec(1, 1000), overdueStatus, overdueByDate],
    saleStatus: 'ACTIVE',
    calculationStatus: prepared.calculationStatus,
  });
  assert(gate.ok === true, 'executa com parcela vencida');
  assert(prepared.operationType === 'inadimplencia', 'settlement operation_type');
  assert(prepared.calculationStatus === 'CALCULATED', 'policy ARAGUAIA calcula');
  console.log('OK testExecuteWithOverdueAndDueDate');
}

function testPaidPreservedPendingCanceledAndCharges() {
  const paid = rec(0, 2000);
  const open = rec(1, 1000, { status: 'pendente', due_date: '2099-12-31' });
  const overdue = rec(2, 1000, { status: 'atrasado', due_date: '2020-01-01' });
  assert(classifyFinanceReceiptForRelease(paid) === 'paid', 'pago preservado');
  assert(classifyFinanceReceiptForRelease(open) === 'pending', 'pendente a cancelar');
  assert(classifyFinanceReceiptForRelease(overdue) === 'overdue', 'atrasado a cancelar');
  const prepared = preparedInadimplencia({ receipts: [paid, open, overdue] });
  assert(prepared.receiptsSnapshot.paid.count === 1, 'snapshot conta pago');
  assert(prepared.receiptsSnapshot.pending.count === 1, 'pendente no snapshot');
  assert(prepared.receiptsSnapshot.overdue.count === 1, 'vencida no snapshot');
  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('isPaidFinanceReceiptStatus'), 'pagos conferidos');
  assert(svc.includes("status: RECEIPT_CANCELLED_STATUS"), 'abertos cancelados');
  assert(svc.includes('SALE_CANCELLED_STATUS'), 'venda encerrada');
  assert(svc.includes('CONTRACT_CANCELLED_STATUS'), 'contrato encerrado');
  assert(svc.includes('LOT_AVAILABLE_STATUS'), 'lote Disponível');
  assert(svc.includes('// Encerramento preserva sales.contract_id da venda histórica.'), 'contract_id histórico');
  assert(svc.includes('cancelCompanyCharge'), 'cobrança Asaas cancelável');
  assert(svc.includes('resolveInterChargesForRelease'), 'cobrança Inter cancelável');
  assert(SALE_CANCELLED_STATUS === 'CANCELLED', 'status venda');
  assert(CONTRACT_CANCELLED_STATUS === 'cancelado', 'status contrato');
  assert(LOT_AVAILABLE_STATUS === 'Disponível', 'status lote');
  console.log('OK testPaidPreservedPendingCanceledAndCharges');
}

function testAraguaiaFrozenPolicyAndMissingPolicyBlock() {
  const prepared = preparedInadimplencia();
  assert(prepared.settlement.entryPaid === 2000, 'entrada apurada');
  assert(prepared.settlement.nonRefundableAmount === 2000, 'entrada não reembolsável');
  assert(prepared.settlement.contractualRetentionPercent === 25, 'retenção 25%');
  assert(prepared.settlement.refundableBase === 2000, 'base restituível');
  assert(prepared.settlement.contractualRetentionAmount === 500, 'retenção sobre base');
  assert(prepared.settlement.agreedRefundAmount === 1500, 'líquido previsto');
  assert(prepared.settlement.paidInstallmentCount === 2, 'parcelas pagas para cronograma');

  const missing = evaluateInadimplenciaPreconditions({
    receipts: [rec(3, 1000, { status: 'atrasado' })],
    saleStatus: 'ACTIVE',
    calculationStatus: 'MISSING_POLICY',
  });
  assert(missing.ok === false, 'bloqueia sem policy');
  assert(missing.ok === false && missing.error === MISSING_POLICY_MESSAGE, 'mensagem missing');

  const incompletePrepared = preparedInadimplencia({
    saleSnapshot: null,
    salePersistSource: null,
    saleContractModel: 'PADRAO',
    receipts: [rec(3, 900, { status: 'atrasado' })],
  });
  const incomplete = evaluateInadimplenciaPreconditions({
    receipts: [rec(3, 900, { status: 'atrasado' })],
    saleStatus: 'ACTIVE',
    calculationStatus: incompletePrepared.calculationStatus,
  });
  assert(incompletePrepared.calculationStatus === 'INCOMPLETE' || incompletePrepared.calculationStatus === 'MISSING_POLICY', 'PADRAO sem policy homologada');
  assert(incomplete.ok === false, 'bloqueia modelo sem policy');
  assert(
    incomplete.ok === false &&
      (incomplete.error === INCOMPLETE_POLICY_MESSAGE || incomplete.error === MISSING_POLICY_MESSAGE),
    'mensagem clara de policy',
  );

  const persist = read('lib/finance/saleReleaseSettlement.ts');
  assert(persist.includes("operationType === 'distrato' && input.operator.exceptionalAgreement"), 'persist só aplica exceção no distrato');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes("allowException={motiveCode === 'distrato'}"), 'UI exceção só distrato');
  console.log('OK testAraguaiaFrozenPolicyAndMissingPolicyBlock');
}

function testDocumentInadimplencia() {
  const prepared = preparedInadimplencia();
  const snap = buildTerminationDocumentSnapshot({
    settlement: settlementRow(prepared),
    documentNumber: 'IN-000000001/2026',
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
  assert(snap.operationType === 'inadimplencia', 'tipo inadimplencia');
  assert(snap.title === INADIMPLENCIA_DOCUMENT_TITLE, 'título do termo');
  assert(snap.documentNumber === 'IN-000000001/2026', 'número IN');
  assert(snap.documentNumber.startsWith('IN-'), 'prefixo IN');
  assert(!snap.documentNumber.startsWith('DT-'), 'não reutiliza DT');
  assert(!snap.documentNumber.startsWith('TD-'), 'não reutiliza DES/TD');
  assert(snap.html.includes(INADIMPLENCIA_DOCUMENT_TITLE), 'HTML com título');
  assert(!snap.html.includes(DESISTENCIA_DOCUMENT_TITLE), 'não usa título da desistência');
  assert(!snap.html.includes(DISTRATO_DOCUMENT_TITLE), 'não usa título do distrato');
  assert(snap.html.includes('parcelas vencidas sem regularização'), 'justificativa no documento');
  assert(snap.html.includes('000000010/2026'), 'contrato original');
  assert(snap.html.includes('Loteamento Homolog'), 'empreendimento');
  assert(snap.html.includes('Quadra 01 / Lote 02'), 'quadra/lote');
  assert(snap.html.includes('Cliente Teste'), 'comprador');
  assert(snap.html.includes('SV LOTES SPE'), 'vendedor');
  assert(snap.html.includes('Quantidade de parcelas vencidas'), 'qtde vencidas');
  assert(snap.html.includes('Valor total vencido'), 'valor vencido');
  assert(snap.html.includes('Quantidade de parcelas pagas'), 'qtde pagas');
  assert(snap.html.includes('Total pago'), 'total pago');
  assert(snap.html.includes('Política contratual congelada aplicada'), 'policy congelada');
  assert(snap.html.includes('Retenção contratual'), 'retenção');
  assert(snap.html.includes('Valor líquido previsto'), 'líquido');
  assert(snap.html.includes('parcelas pendentes da aquisição foram canceladas'), 'pendentes canceladas');
  assert(snap.html.includes('cobranças externas'), 'cobranças externas');
  assert(snap.html.includes('Disponível'), 'lote Disponível');
  assert(snap.html.includes('permanecem preservados'), 'histórico preservado');
  assert(snap.html.includes('assinatura eletrônica'), 'assinaturas quando aplicável');
  assert(snap.overdueReceiptCount === 1, 'qtde vencidas no snapshot');
  assert(snap.paidReceiptCount === 3, 'qtde pagas no snapshot');
  assert(SALE_DOCUMENT_TYPE_LABELS.INADIMPLENCIA === 'Termo de Rescisão Contratual por Inadimplência', 'label original');
  assert(
    SALE_DOCUMENT_TYPE_LABELS.INADIMPLENCIA_ASSINADO.includes('assinado'),
    'label assinado',
  );
  assert(SALE_DOCUMENT_TYPE_LABELS.RESCISAO !== SALE_DOCUMENT_TYPE_LABELS.INADIMPLENCIA, 'não reutiliza RESCISAO');
  console.log('OK testDocumentInadimplencia');
}

function testHistoryBadgeAndKinds() {
  const links = lotHistoryTerminationDocumentLinks({
    action: 'sale_cancelled',
    saleId: 'sale-inadimplencia',
    motiveCode: 'inadimplencia',
  });
  assert(Boolean(links), 'histórico registra inadimplência');
  assert(links?.saleId === 'sale-inadimplencia', 'sale_id preservado');
  const formatted = formatLotAuditEvent({
    id: 'e-inad',
    company_id: null,
    project_id: 'p1',
    block_id: 'b1',
    lot_id: 'b1',
    sale_id: 'sale-inadimplencia',
    contract_id: null,
    user_id: 'u1',
    action: 'sale_cancelled',
    title: 'Lote liberado — venda encerrada',
    description: 'Inadimplência: parcelas vencidas sem regularização · Vendido → Disponível',
    old_data: null,
    new_data: { motiveCode: 'inadimplencia' },
    created_at: '2026-09-06T12:00:00Z',
    source: 'gis_map',
  });
  assert(formatted.actionLabel === 'Venda cancelada por inadimplência', 'badge específico');
  assert(formatted.motiveCode === 'inadimplencia', 'motiveCode no histórico');
  assert(String(formatted.description || '').includes('Inadimplência:'), 'texto do histórico');
  const desist = formatLotAuditEvent({
    id: 'e-des',
    company_id: null,
    project_id: 'p1',
    block_id: 'b1',
    lot_id: 'b1',
    sale_id: 'sale-des',
    contract_id: null,
    user_id: 'u1',
    action: 'sale_cancelled',
    title: 'Lote liberado — venda encerrada',
    description: 'Desistência do cliente · Vendido → Disponível',
    old_data: null,
    new_data: { motiveCode: 'desistencia' },
    created_at: '2026-09-06T12:00:00Z',
    source: 'gis_map',
  });
  assert(desist.actionLabel === 'Venda cancelada', 'badge da Desistência intacto');
  assert(terminationOriginalSaleDocumentType('inadimplencia') === 'INADIMPLENCIA', 'tipo original');
  assert(terminationSignedSaleDocumentType('inadimplencia') === 'INADIMPLENCIA_ASSINADO', 'tipo assinado');
  assert(terminationOriginalSaleDocumentType('desistencia') === 'DESISTENCIA', 'desistência intacta');
  assert(terminationOriginalSaleDocumentType('distrato') === 'DISTRATO', 'distrato intacto');
  assert(terminationSignedSaleDocumentType('desistencia') === 'DESISTENCIA_ASSINADO', 'assinado desistência');
  assert(terminationSignedSaleDocumentType('distrato') === 'DISTRATO_ASSINADO', 'assinado distrato');
  assert(terminationDocumentPrefixForType('inadimplencia') === TERMINATION_DOCUMENT_PREFIX_INADIMPLENCIA, 'IN');
  assert(terminationDocumentPrefixForType('desistencia') === 'TD', 'TD desistência');
  assert(terminationDocumentPrefixForType('distrato') === 'DT', 'DT distrato');
  assert(isOriginalTerminationDocumentType('INADIMPLENCIA'), 'INADIMPLENCIA original');
  assert(isSignedTerminationDocumentType('INADIMPLENCIA_ASSINADO'), 'INADIMPLENCIA_ASSINADO');
  assert(isInadimplenciaTerminationOperation('inadimplencia'), 'helper inadimplencia');
  assert(!isInadimplenciaTerminationOperation('desistencia'), 'não confunde desistência');
  assert(!isInadimplenciaTerminationOperation('distrato'), 'não confunde distrato');
  console.log('OK testHistoryBadgeAndKinds');
}

function testRegressionDesistenciaDistratoAndSource() {
  assert(shouldGenerateTerminationDocument('inadimplencia'), 'gera termo de inadimplência');
  assert(shouldGenerateTerminationDocument('desistencia'), 'Desistência continua gerando');
  assert(shouldGenerateTerminationDocument('distrato'), 'Distrato continua gerando');
  assert(
    terminationDocumentTitleForType('inadimplencia') === INADIMPLENCIA_DOCUMENT_TITLE,
    'título inadimplência',
  );
  assert(
    terminationDocumentTitleForType('desistencia') === DESISTENCIA_DOCUMENT_TITLE,
    'título desistência intacto',
  );
  assert(
    terminationDocumentTitleForType('distrato') === DISTRATO_DOCUMENT_TITLE,
    'título distrato intacto',
  );
  const builder = resolveTerminationDocumentHtmlBuilder({
    operationType: 'inadimplencia',
    contractModel: 'ARAGUAIA',
  });
  const desistBuilder = resolveTerminationDocumentHtmlBuilder({
    operationType: 'desistencia',
    contractModel: 'ARAGUAIA',
  });
  const distratoBuilder = resolveTerminationDocumentHtmlBuilder({
    operationType: 'distrato',
    contractModel: 'ARAGUAIA',
  });
  assert(builder !== desistBuilder, 'template distinto da desistência');
  assert(builder !== distratoBuilder, 'template distinto do distrato');
  assert(desistBuilder !== distratoBuilder, 'desistência e distrato seguem distintos');

  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('evaluateInadimplenciaPreconditions'), 'gate de inadimplência');
  assert(svc.includes('hasEffectiveInadimplencia'), 'pré-condição antes do upsert');
  assert(svc.includes("INADIMPLENCIA_NOT_DEFAULT"), 'código sem inadimplência efetiva');
  assert(svc.includes("'Inadimplência concluída com sucesso.'"), 'sucesso inadimplência');
  assert(svc.includes("'Desistência concluída com sucesso.'"), 'Desistência homologada intacta');
  assert(svc.includes("'Distrato concluído com sucesso.'"), 'Distrato homologado intacto');
  assert(svc.includes('shouldGenerateTerminationDocument(motive.motiveCode)'), 'documento via gate');
  assert(!svc.includes('completeContractOperation'), 'sem segunda arquitetura');
  assert(!svc.includes("from('sale_contract_operations')"), 'sem tabela WIP');

  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes('Motivo / justificativa da inadimplência'), 'campo inadimplência');
  assert(modal.includes('Motivo / justificativa do distrato'), 'campo distrato intacto');
  assert(modal.includes('INADIMPLENCIA_NO_DEFAULT_MESSAGE'), 'bloqueio visual');
  assert(modal.includes("allowException={motiveCode === 'distrato'}"), 'exceção só distrato');

  const sig = read('lib/termination-documents/signature.ts');
  assert(sig.includes('terminationSignedSaleDocumentType'), 'e-sign por operação');
  assert(sig.includes("signed_document_type', TERMINATION_SIGNED_DOCUMENT_TYPE"), 'mesmo motor TERMO');
  assert(terminationSignedSaleDocumentType('inadimplencia') === 'INADIMPLENCIA_ASSINADO', 'artefato assinado');

  const persist = read('lib/termination-documents/persist.ts');
  assert(persist.includes('terminationDocumentPrefixForType'), 'prefixo por operação');
  assert(persist.includes('receipts_snapshot'), 'receipts no settlement documental');

  const kinds = read('lib/termination-documents/documentKinds.ts');
  assert(kinds.includes("return SALE_DOCUMENT_TYPE_INADIMPLENCIA"), 'tipo INADIMPLENCIA');
  assert(kinds.includes("return SALE_DOCUMENT_TYPE_INADIMPLENCIA_ASSINADO"), 'tipo INADIMPLENCIA_ASSINADO');
  assert(!kinds.includes("'RESCISAO'"), 'não reutiliza RESCISAO');

  const mundo = [
    'lib/mundoNovoContractSellers.ts',
    'lib/araguaia/mundoNovo.ts',
  ];
  for (const rel of mundo) {
    if (!fs.existsSync(path.join(__dirname, '..', rel))) continue;
  }
  assert(!svc.includes('seller_parties_json'), 'release não altera Mundo Novo');
  assert(!modal.includes('seller_parties_json'), 'modal não altera Mundo Novo');

  assert(DEVELOP_PROJECT_REF === 'hoynysmynxncdlptuzub', 'ref DEVELOP');
  assert(PRODUCTION_PROJECT_REF === 'aezktedncttwpqeunjej', 'ref Production conhecida');
  assert(!svc.includes(PRODUCTION_PROJECT_REF), 'serviço sem hardcode Production');
  assert(!modal.includes(PRODUCTION_PROJECT_REF), 'modal sem hardcode Production');

  const migrations = fs.readdirSync(path.join(__dirname, '..', 'supabase/migrations'));
  assert(
    !migrations.includes('20261008120000_sale_contract_operations.sql'),
    'sem migration WIP',
  );
  console.log('OK testRegressionDesistenciaDistratoAndSource');
}

function main() {
  testBlockWithoutOverdue();
  testExecuteWithOverdueAndDueDate();
  testPaidPreservedPendingCanceledAndCharges();
  testAraguaiaFrozenPolicyAndMissingPolicyBlock();
  testDocumentInadimplencia();
  testHistoryBadgeAndKinds();
  testRegressionDesistenciaDistratoAndSource();
  console.log('\nALL mandatory-termination-document-inadimplencia-tests PASSED');
}

main();
