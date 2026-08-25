/**
 * Fase 3A — persistência do settlement no POST /release.
 * npx tsx scripts/mandatory-sale-release-settlement-persist-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildTerminationPolicySnapshot } from '../lib/contract-termination/snapshot';
import { validateReleaseLotMotive } from '../lib/finance/releaseLotShared';
import {
  buildReleaseReceiptsSnapshot,
  prepareReleaseSettlement,
  readSettlementDbError,
  resolveSettlementContractId,
  SettlementPersistError,
  validateReleaseSettlementOperatorInput,
  type ReleaseSettlementOperatorInput,
} from '../lib/finance/saleReleaseSettlement';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/homolog/env';
import type { TerminationReceiptInput } from '../lib/contract-termination/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function operator(
  extra: Partial<ReleaseSettlementOperatorInput> = {},
): ReleaseSettlementOperatorInput {
  return {
    hasImprovements: false,
    improvementsAppraisalStatus: 'NONE',
    improvementItems: [],
    refundDestination: 'REFUND_CUSTOMER',
    exceptionalAgreement: false,
    exceptionalReason: null,
    exceptionalRefundAmount: null,
    exceptionalRetentionPercent: null,
    refundFirstDueDate: null,
    ...extra,
  };
}

function rec(
  installmentNumber: number,
  amount: number,
  extra: Partial<TerminationReceiptInput> = {},
): TerminationReceiptInput {
  return {
    id: `r-${installmentNumber}-${amount}`,
    installment_number: installmentNumber,
    status: 'pago',
    amount,
    ...extra,
  };
}

const araguaiaSnapshot = buildTerminationPolicySnapshot({
  contractModel: 'ARAGUAIA',
  persistSource: 'catalog',
}).termination_policy_snapshot;

function testAraguaiaRetentionAndNonRefundable() {
  const prepared = prepareReleaseSettlement({
    motiveCode: 'desistencia',
    receipts: [rec(0, 10000), rec(-1, 3000), rec(1, 20000)],
    saleSnapshot: araguaiaSnapshot,
    salePersistSource: 'catalog',
    saleContractModel: 'ARAGUAIA',
    operator: operator(),
  });
  const s = prepared.settlement;
  assert(prepared.policyOrigin === 'sale_snapshot', 'origem snapshot da venda');
  assert(s.entryPaid === 10000, 'entrada');
  assert(s.signalPaid === 3000, 'sinal');
  assert(s.installmentPaid === 20000, 'parcelas');
  assert(s.nonRefundableAmount === 13000, 'entrada+sinal fora da base');
  assert(s.refundableBase === 20000, 'base só parcelas');
  assert(s.contractualRetentionPercent === 25, '25% ARAGUAIA');
  assert(s.contractualRetentionAmount === 5000, 'retenção 25% da base');
  assert(s.contractualRefundAmount === 15000, 'líquido contratual');
  assert(s.calculationStatus === 'CALCULATED', 'CALCULATED');
  console.log('OK testAraguaiaRetentionAndNonRefundable');
  console.log(
    JSON.stringify(
      {
        example: 'sale_release_settlements (ARAGUAIA / desistência)',
        operation_type: prepared.operationType,
        policy_origin: prepared.policyOrigin,
        calculation_status: prepared.calculationStatus,
        total_paid: s.totalPaid,
        entry_amount: s.entryPaid,
        signal_amount: s.signalPaid,
        installment_paid: s.installmentPaid,
        non_refundable_amount: s.nonRefundableAmount,
        refundable_base: s.refundableBase,
        retention_percent: s.contractualRetentionPercent,
        retention_amount: s.contractualRetentionAmount,
        contractual_refund_amount: s.contractualRefundAmount,
        agreed_refund_amount: s.agreedRefundAmount,
        document_id: null,
        credit_other_unit_id: null,
      },
      null,
      2,
    ),
  );
}

function testIncompleteDoesNotInheritAraguaia() {
  const prepared = prepareReleaseSettlement({
    motiveCode: 'distrato',
    receipts: [rec(0, 10000), rec(1, 20000)],
    saleContractModel: 'PADRAO',
    operator: operator(),
  });
  assert(prepared.policyOrigin === 'legacy_inferred', 'PADRAO legado inferido');
  assert(prepared.calculationStatus === 'INCOMPLETE', 'INCOMPLETE');
  assert(prepared.settlement.contractualRetentionPercent == null, 'não herda 25%');
  assert(prepared.settlement.contractualRefundAmount === 0, 'não inventa líquido');
  assert(prepared.policy.catalogKey === 'PADRAO', 'não vira ARAGUAIA');
  console.log('OK testIncompleteDoesNotInheritAraguaia');
}

function testLegacyInferredOrigin() {
  const prepared = prepareReleaseSettlement({
    motiveCode: 'inadimplencia',
    receipts: [rec(0, 10000), rec(1, 8000)],
    saleContractModel: 'ARAGUAIA',
    operator: operator(),
  });
  assert(prepared.policyOrigin === 'legacy_inferred', 'sem snapshot → legado inferido');
  assert(prepared.settlement.contractualRetentionPercent === 25, 'ARAGUAIA legado ainda 25');
  console.log('OK testLegacyInferredOrigin');
}

function testDesistenciaRejectsException() {
  const rejected = validateReleaseSettlementOperatorInput({
    motiveCode: 'desistencia',
    operator: operator({
      exceptionalAgreement: true,
      exceptionalReason: 'acordo',
      exceptionalRefundAmount: 1,
    }),
  });
  assert(!rejected.ok && rejected.code === 'EXCEPTION_NOT_ALLOWED', 'desistência sem excepcional');

  const prepared = prepareReleaseSettlement({
    motiveCode: 'desistencia',
    receipts: [rec(0, 10000), rec(1, 20000)],
    saleSnapshot: araguaiaSnapshot,
    salePersistSource: 'catalog',
    operator: operator({
      exceptionalAgreement: true,
      exceptionalReason: 'não deve aplicar',
      exceptionalRefundAmount: 1,
    }),
  });
  assert(prepared.exceptionalAgreement === false, 'engine ignora excepcional fora do distrato');
  assert(prepared.settlement.contractualRefundAmount === 15000, 'contratual intacto');
  console.log('OK testDesistenciaRejectsException');
}

function testDistratoExceptionRequiresJustification() {
  const noReason = validateReleaseSettlementOperatorInput({
    motiveCode: 'distrato',
    operator: operator({
      exceptionalAgreement: true,
      exceptionalRefundAmount: 12000,
    }),
  });
  assert(
    !noReason.ok && noReason.code === 'EXCEPTION_JUSTIFICATION_REQUIRED',
    'distrato sem justificativa',
  );

  const ok = validateReleaseSettlementOperatorInput({
    motiveCode: 'distrato',
    operator: operator({
      exceptionalAgreement: true,
      exceptionalReason: 'Acordo homologado pela diretoria',
      exceptionalRefundAmount: 12000,
    }),
  });
  assert(ok.ok, 'distrato com justificativa');

  const prepared = prepareReleaseSettlement({
    motiveCode: 'distrato',
    receipts: [rec(0, 10000), rec(1, 20000)],
    saleSnapshot: araguaiaSnapshot,
    salePersistSource: 'catalog',
    operator: operator({
      exceptionalAgreement: true,
      exceptionalReason: 'Acordo homologado pela diretoria',
      exceptionalRefundAmount: 12000,
    }),
  });
  assert(prepared.settlement.contractualRefundAmount === 15000, 'contratual preservado');
  assert(prepared.settlement.agreedRefundAmount === 12000, 'acordado separado');
  assert(prepared.exceptionalAgreement === true, 'flag excepcional');
  console.log('OK testDistratoExceptionRequiresJustification');
}

function testInadimplenciaFreezesOverdueSnapshot() {
  const receipts = [
    rec(0, 10000),
    rec(1, 5000),
    {
      id: 'overdue-1',
      installment_number: 2,
      status: 'atrasado',
      amount: 5000,
      due_date: '2026-01-01',
    },
    {
      id: 'overdue-by-date',
      installment_number: 3,
      status: 'pendente',
      amount: 5000,
      due_date: '2020-06-01',
    },
  ];
  const prepared = prepareReleaseSettlement({
    motiveCode: 'inadimplencia',
    receipts,
    saleSnapshot: araguaiaSnapshot,
    salePersistSource: 'catalog',
    operator: operator(),
  });
  assert(prepared.receiptsSnapshot.overdue.count === 2, 'duas vencidas congeladas');
  assert(prepared.receiptsSnapshot.overdue.amount === 10000, 'valor vencido');
  assert(
    prepared.receiptsSnapshot.overdue.receiptIds.includes('overdue-1'),
    'id atrasado',
  );
  assert(
    prepared.receiptsSnapshot.overdue.receiptIds.includes('overdue-by-date'),
    'pendente vencida por due_date',
  );
  assert(prepared.receiptsSnapshot.paid.count === 2, 'pagas congeladas');
  assert(prepared.settlement.contractualRetentionPercent === 25, 'sem multa extra');
  console.log('OK testInadimplenciaFreezesOverdueSnapshot');
}

function testErroCadastroNotApplicable() {
  const prepared = prepareReleaseSettlement({
    motiveCode: 'erro_cadastro',
    receipts: [rec(0, 10000), rec(1, 20000)],
    saleSnapshot: araguaiaSnapshot,
    salePersistSource: 'catalog',
    operator: operator(),
  });
  assert(prepared.calculationStatus === 'NOT_APPLICABLE', 'erro sem cálculo de distrato');
  assert(prepared.settlement.contractualRetentionAmount === 0, 'sem retenção fictícia');
  assert(prepared.settlement.contractualRefundAmount === 0, 'sem restituição automática');
  assert(prepared.settlement.totalPaid === 30000, 'pagamentos preservados no snapshot');
  assert(prepared.receiptsSnapshot.paid.count === 2, 'recibos pagos no snapshot');
  console.log('OK testErroCadastroNotApplicable');
}

function testCancelamentoAdministrativo() {
  const short = validateReleaseLotMotive({
    motiveCode: 'cancelamento_administrativo',
    motiveDetail: 'ab',
  });
  assert(!short.ok, 'justificativa administrativa obrigatória');

  const withPaid = prepareReleaseSettlement({
    motiveCode: 'cancelamento_administrativo',
    receipts: [rec(0, 10000), rec(1, 20000)],
    saleSnapshot: araguaiaSnapshot,
    salePersistSource: 'catalog',
    operator: operator(),
  });
  assert(withPaid.calculationStatus === 'CALCULATED', 'com pagamentos e policy calcula');

  const incomplete = prepareReleaseSettlement({
    motiveCode: 'cancelamento_administrativo',
    receipts: [rec(0, 10000)],
    saleContractModel: 'MENESES',
    operator: operator(),
  });
  assert(incomplete.calculationStatus === 'INCOMPLETE', 'policy incompleta persistida');
  assert(incomplete.settlement.contractualRetentionPercent == null, 'não inventa %');

  const noPaid = prepareReleaseSettlement({
    motiveCode: 'cancelamento_administrativo',
    receipts: [{ installment_number: 1, status: 'pendente', amount: 1000 }],
    saleSnapshot: araguaiaSnapshot,
    salePersistSource: 'catalog',
    operator: operator(),
  });
  assert(noPaid.calculationStatus === 'NOT_APPLICABLE', 'sem pagos → N/A');
  console.log('OK testCancelamentoAdministrativo');
}

function testReceiptsSnapshotBeforeMutation() {
  const snap = buildReleaseReceiptsSnapshot([
    rec(0, 1000),
    { id: 'open-1', installment_number: 1, status: 'pendente', amount: 2000 },
  ]);
  assert(snap.paid.count === 1, 'pago no snapshot');
  assert(snap.pending.count === 1, 'aberto no snapshot');
  const svc = read('lib/finance/releaseLotService.ts');
  const persistIdx = svc.indexOf('prepareReleaseSettlement');
  const cancelReceiptsIdx = svc.indexOf("status: RECEIPT_CANCELLED_STATUS");
  assert(persistIdx > 0 && persistIdx < cancelReceiptsIdx, 'snapshot antes de cancelar abertos');
  assert(svc.includes('isPaidFinanceReceiptStatus'), 'pagos conferidos');
  assert(!svc.includes("from('finance_receipts').delete"), 'não apaga finance_receipts');
  console.log('OK testReceiptsSnapshotBeforeMutation');
}

function testReleaseFlowGuarantees() {
  const svc = read('lib/finance/releaseLotService.ts');
  const execFn = svc.slice(svc.indexOf('export async function executeReleaseLot'));
  assert(execFn.includes("sale_id: null") || svc.includes("sale_id: null"), 'limpa blocks.sale_id');
  assert(svc.includes('SALE_CANCELLED_STATUS'), 'sales → CANCELLED');
  assert(svc.includes('LOT_AVAILABLE_STATUS'), 'lote Disponível');
  assert(svc.includes("status === 'EXECUTED'"), 'segundo POST reusa EXECUTED');
  assert(execFn.includes('alreadyReleased: true'), 'não reexecuta se já encerrado');
  assert(!svc.includes("from('sale_documents').delete"), 'não apaga sale_documents');
  assert(svc.includes('documentsPreserved'), 'conta documentos preservados');
  assert(svc.includes('isPaidAsaasChargeStatus'), 'Asaas pago preservado');
  assert(svc.includes('ASAAS_CANCEL_FAILED'), 'Asaas falha bloqueia');
  assert(svc.includes('INTER_CANCEL_FAILED'), 'Inter falha bloqueia');
  assert(svc.includes('isLocalAsaasCancelCandidateStatus'), 'Asaas aberto cancelável');
  assert(svc.includes('isLocalInterCancelCandidateStatus'), 'Inter aberto cancelável');
  assert(execFn.includes('saleId: preview.saleId'), 'settlement usa sale_id original');
  assert(svc.includes('upsertCalculatedReleaseSettlement(admin, {'), 'persiste na sale original');
  assert(svc.includes('saleId: preview.saleId'), 'não busca settlement em blocks.sale_id depois');
  console.log('OK testReleaseFlowGuarantees');
}

function testMigrationSchemaAndRls() {
  const sql = read('supabase/migrations/20261010120000_sale_release_settlements.sql');
  assert(sql.includes('CREATE TABLE IF NOT EXISTS public.sale_release_settlements'), 'tabela');
  for (const col of [
    'sale_id',
    'operation_type',
    'policy_snapshot',
    'policy_origin',
    'calculation_snapshot',
    'receipts_snapshot',
    'contractual_refund_amount',
    'agreed_refund_amount',
    'calculation_status',
    'idempotency_key',
    'termination_document_snapshot',
    'document_id',
  ]) {
    assert(sql.includes(col), `coluna ${col}`);
  }
  assert(sql.includes('sale_release_settlements_sale_active_uidx'), 'unique sale ativa');
  assert(sql.includes("WHERE status IN ('CALCULATED', 'EXECUTED', 'FAILED_DOCUMENT')"), 'sem duplicar final');
  assert(sql.includes('sale_release_settlements_tenant_all'), 'RLS tenant');
  assert(sql.includes('current_tenant_id()'), 'isolamento por empresa');
  assert(!/\bDROP TABLE\b/i.test(sql), 'sem DROP TABLE');
  assert(!/\bDELETE FROM\b/i.test(sql), 'sem DELETE');
  assert(!/\bTRUNCATE TABLE\b/i.test(sql), 'sem TRUNCATE TABLE');
  assert(sql.includes('Reservado para Fase 3B'), 'documento reservado');
  const persist = read('lib/finance/saleReleaseSettlement.ts');
  assert(!persist.includes('document_id: null'), 'document_id não é zerado no upsert financeiro');
  assert(
    !persist.includes('termination_document_snapshot: null'),
    'snapshot documental não é zerado no upsert financeiro',
  );
  assert(persist.includes('credit_other_unit_id: null'), 'crédito não executado');
  assert(persist.includes('refundSchedule: params.prepared.refundSchedule'), 'cronograma no calculation_snapshot');
  assert(persist.includes('improvements: params.prepared.improvements'), 'itens de benfeitoria no snapshot');
  assert(persist.includes('obligation: params.prepared.obligation'), 'obrigação discriminada no snapshot');
  assert(!persist.includes('jsPDF'), 'sem PDF no motor financeiro');
  assert(!persist.includes('generateContractHTML'), 'sem HTML de contrato');
  console.log('OK testMigrationSchemaAndRls');
}

function testRegressionsUntouched() {
  const files = [
    'components/map/GISMap.tsx',
    'components/map/LotConfrontationsPanel.tsx',
    'lib/saleEdit.ts',
    'lib/gisSaleCreateService.ts',
    'app/finance/page.tsx',
    'lib/charges/chargeInstallmentHelpers.ts',
  ];
  for (const rel of files) {
    const src = read(rel);
    assert(!src.includes('sale_release_settlements'), `${rel} sem tabela de settlement`);
    assert(!src.includes('/api/contract-operations/'), `${rel} sem contract-operations neste fluxo`);
  }
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes('submittingRef'), 'anti duplo clique');
  assert(!modal.includes('/api/contract-operations/'), 'modal sem cessão');
  assert(DEVELOP_PROJECT_REF === 'hoynysmynxncdlptuzub', 'DEVELOP');
  assert(PRODUCTION_PROJECT_REF === 'aezktedncttwpqeunjej', 'Production conhecida');
  const apply = read('scripts/develop/apply-sale-release-settlements.ts');
  assert(apply.includes('assertDevelopWriteAllowed'), 'apply só DEVELOP');
  assert(apply.includes('assertNotContractOperationsMigration'), 'bloqueia operations');
  assert(!apply.includes(PRODUCTION_PROJECT_REF) || apply.includes('ABORT'), 'recusa Production');
  console.log('OK testRegressionsUntouched');
}

function testOrphanBlockContractIdNeverPersisted() {
  const realId = '11111111-1111-1111-1111-111111111111';
  const orphanId = '22222222-2222-2222-2222-222222222222';
  assert(
    resolveSettlementContractId({ id: realId }) === realId,
    'contrato válido → grava contract_id',
  );
  assert(resolveSettlementContractId(null) === null, 'sem contrato → null');
  assert(resolveSettlementContractId(undefined) === null, 'contrato indefinido → null');
  assert(resolveSettlementContractId({ id: '  ' }) === null, 'id vazio → null');
  assert(
    resolveSettlementContractId({ id: realId }) !== orphanId,
    'UUID órfão do lote não substitui o contrato carregado',
  );

  const svc = read('lib/finance/releaseLotService.ts');
  assert(
    svc.includes('contractId: resolveSettlementContractId(contract)'),
    'preview só usa contrato carregado',
  );
  assert(
    svc.includes('contractId: resolveSettlementContractId(liveCtx.contract)'),
    'INSERT do settlement só usa contrato carregado',
  );
  assert(
    !svc.includes('block.contract_id ? String(block.contract_id)'),
    'não reaproveita blocks.contract_id órfão no settlement',
  );

  const persist = read('lib/finance/saleReleaseSettlement.ts');
  const rowAssign = persist.slice(
    persist.indexOf('const row = {'),
    persist.indexOf('if (params.existingId)'),
  );
  assert(rowAssign.includes('contract_id: params.contractId'), 'persiste contract_id recebido');
  assert(svc.includes('sale_release_settlements_contract_id_fkey') || persist.includes('REFERENCES public.contracts') || read('supabase/migrations/20261010120000_sale_release_settlements.sql').includes('sale_release_settlements_contract_id_fkey') || read('supabase/migrations/20261010120000_sale_release_settlements.sql').includes('contract_id uuid REFERENCES public.contracts(id)'), 'FK de contrato permanece');

  const sql = read('supabase/migrations/20261010120000_sale_release_settlements.sql');
  assert(sql.includes('contract_id uuid REFERENCES public.contracts(id)'), 'FK intacto');
  assert(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS intacto');

  const execFn = svc.slice(svc.indexOf('export async function executeReleaseLot'));
  const persistIdx = execFn.indexOf('upsertCalculatedReleaseSettlement');
  const asaasIdx = execFn.indexOf('{ executeCancel: true }');
  const localIdx = execFn.indexOf('const local = await applyLocalRelease');
  assert(persistIdx > 0 && persistIdx < asaasIdx, 'settlement antes do Asaas');
  assert(asaasIdx < localIdx, 'Asaas antes de liberar o lote');
  assert(execFn.includes("status === 'EXECUTED'"), 'segundo POST idempotente');
  assert(execFn.includes('isSaleReleaseSettlementOperation'), 'cinco operações no mesmo /release');

  const pg = new SettlementPersistError('SETTLEMENT_INSERT_FAILED', {
    message: 'violates foreign key constraint "sale_release_settlements_contract_id_fkey"',
    code: '23503',
    details: 'Key (contract_id)=(22222222-2222-2222-2222-222222222222) is not present in table "contracts".',
    hint: 'Insert a valid contract or leave contract_id null.',
  });
  assert(pg.db.code === '23503', 'preserva code');
  assert(/fkey/.test(pg.db.message), 'preserva message');
  assert(/contracts/.test(String(pg.db.details)), 'preserva details');
  assert(/null/.test(String(pg.db.hint)), 'preserva hint');
  const fields = readSettlementDbError(pg);
  assert(fields.message === pg.message, 'wrapper Error.message permanece');
  assert(svc.includes('settlementFailDetails(err)'), 'response técnico leva code/details/hint');
  assert(
    svc.includes("'Não foi possível persistir o acerto financeiro na venda original.'"),
    'mensagem amigável ao operador',
  );
  console.log('OK testOrphanBlockContractIdNeverPersisted');
}

function main() {
  testAraguaiaRetentionAndNonRefundable();
  testIncompleteDoesNotInheritAraguaia();
  testLegacyInferredOrigin();
  testDesistenciaRejectsException();
  testDistratoExceptionRequiresJustification();
  testInadimplenciaFreezesOverdueSnapshot();
  testErroCadastroNotApplicable();
  testCancelamentoAdministrativo();
  testReceiptsSnapshotBeforeMutation();
  testReleaseFlowGuarantees();
  testMigrationSchemaAndRls();
  testRegressionsUntouched();
  testOrphanBlockContractIdNeverPersisted();
  console.log('\nALL mandatory-sale-release-settlement-persist-tests PASSED');
}

main();
