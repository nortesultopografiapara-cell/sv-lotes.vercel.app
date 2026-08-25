/**
 * Benfeitorias no fluxo de desistência (componente separado da restituição contratual).
 * npx tsx scripts/mandatory-release-improvements-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildTerminationPolicySnapshot } from '../lib/contract-termination/snapshot';
import { calculateTerminationSettlement } from '../lib/contract-termination/calculateSettlement';
import {
  buildCustomerObligation,
  buildImprovementsRecord,
  engineHasImprovementsFlag,
  IMPROVEMENTS_APPRAISAL_REQUIRED_MESSAGE,
  IMPROVEMENTS_CREDIT_NOT_ALLOWED_MESSAGE,
  parseImprovementsFromCalculationSnapshot,
  validateImprovementsForRelease,
} from '../lib/contract-termination/improvements';
import {
  prepareReleaseSettlement,
  validateReleaseSettlementOperatorInput,
  type ReleaseSettlementOperatorInput,
} from '../lib/finance/saleReleaseSettlement';
import { formatLotAuditEvent } from '../lib/lotAudit';
import { lotHistoryImprovementsLine } from '../lib/lotHistoryPresentation';
import { resolveRefundSchedule } from '../lib/termination-documents/refundSchedule';
import { buildTerminationDocumentSnapshot } from '../lib/termination-documents/snapshot';
import type { TerminationReceiptInput } from '../lib/contract-termination/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function rec(installmentNumber: number, amount: number): TerminationReceiptInput {
  return {
    id: `r-${installmentNumber}-${amount}`,
    installment_number: installmentNumber,
    status: 'pago',
    amount,
  };
}

const araguaiaSnapshot = buildTerminationPolicySnapshot({
  contractModel: 'ARAGUAIA',
  persistSource: 'catalog',
}).termination_policy_snapshot;

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
    refundFirstDueDate: '2026-09-15',
    ...extra,
  };
}

function prepare(op: ReleaseSettlementOperatorInput) {
  return prepareReleaseSettlement({
    motiveCode: 'desistencia',
    receipts: [rec(0, 2000), rec(1, 1000), rec(2, 1000)],
    saleSnapshot: araguaiaSnapshot,
    salePersistSource: 'catalog',
    saleContractModel: 'ARAGUAIA',
    operator: op,
  });
}

function testScenarioANoImprovements() {
  const prepared = prepare(operator());
  const s = prepared.settlement;
  assert(s.totalPaid === 4000, 'total pago');
  assert(s.nonRefundableAmount === 2000, 'entrada');
  assert(s.refundableBase === 2000, 'base');
  assert(s.contractualRetentionAmount === 500, 'retenção 25%');
  assert(s.contractualRefundAmount === 1500, 'líquido 1500');
  assert(s.agreedRefundAmount === 1500, 'acordado 1500');
  assert(prepared.improvements.declared === false, 'sem benfeitorias');
  assert(prepared.obligation.improvementsTotal === 0, 'benfeitoria 0');
  assert(prepared.obligation.total === 1500, 'obrigação = restituição');
  assert(prepared.improvementStatus === 'NONE', 'status persistido NONE');
  const row = {
    id: 's1',
    sale_id: 'sale-1',
    company_id: 'c1',
    operation_type: 'desistencia',
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
    calculation_status: prepared.calculationStatus,
    calculation_snapshot: {
      ...s,
      improvements: prepared.improvements,
      obligation: prepared.obligation,
    },
  };
  const snap = buildTerminationDocumentSnapshot({
    settlement: row,
    documentNumber: 'TD-000000020/2026',
    context: {
      vendor: { role: 'vendedor', name: 'V', document: null, extra: null },
      buyer: { role: 'comprador', name: 'C', document: null, extra: null },
    },
  });
  assert(snap.html.includes('não existem benfeitorias indenizáveis'), 'texto português');
  assert(!/\bNONE\b/.test(snap.html), 'sem NONE no termo');
  console.log('OK testScenarioANoImprovements');
}

function testScenarioBPendingBlocks() {
  const pending = operator({
    hasImprovements: true,
    improvementsAppraisalStatus: 'PENDING',
  });
  const check = validateReleaseSettlementOperatorInput({
    motiveCode: 'desistencia',
    operator: pending,
  });
  assert(!check.ok, 'não confirma com avaliação pendente');
  if (!check.ok) {
    assert(check.code === 'IMPROVEMENTS_APPRAISAL_REQUIRED', 'código');
    assert(check.error === IMPROVEMENTS_APPRAISAL_REQUIRED_MESSAGE, 'mensagem');
  }
  const prepared = prepare(pending);
  assert(prepared.calculationStatus === 'WAITING_IMPROVEMENT_APPRAISAL', 'motor waiting');
  assert(prepared.settlement.contractualRefundAmount === 1500, 'contratual visível');
  assert(prepared.settlement.agreedRefundAmount == null, 'acordado não fecha');
  const svc = read('lib/finance/releaseLotService.ts');
  const execFn = svc.slice(svc.indexOf('export async function executeReleaseLot'));
  const waitIdx = execFn.indexOf('IMPROVEMENTS_APPRAISAL_REQUIRED');
  const asaasIdx = execFn.indexOf('resolveAsaasChargesForRelease');
  const localIdx = execFn.indexOf('const local = await applyLocalRelease');
  assert(waitIdx > 0 && waitIdx < asaasIdx, 'bloqueio antes do Asaas');
  assert(waitIdx < localIdx, 'bloqueio antes de limpar lote/encerrar venda');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes('improvementsCheck.ok'), 'UI exige avaliação concluída');
  console.log('OK testScenarioBPendingBlocks');
}

function testScenarioCSingleImprovement() {
  const prepared = prepare(
    operator({
      hasImprovements: true,
      improvementsAppraisalStatus: 'COMPLETED',
      improvementItems: [{ id: 'imp-1', description: 'Poço', amount: 10000 }],
    }),
  );
  assert(prepared.settlement.contractualRefundAmount === 1500, 'contratual 1500');
  assert(prepared.improvements.items.length === 1, 'um item');
  assert(prepared.improvements.items[0].description === 'Poço', 'descrição');
  assert(prepared.improvements.total === 10000, 'total item');
  assert(prepared.obligation.contractualRefund === 1500, 'origem contratual');
  assert(prepared.obligation.improvementsTotal === 10000, 'origem benfeitoria');
  assert(prepared.obligation.total === 11500, 'obrigação 11500');
  assert(prepared.improvementStatus === 'APPRAISED', 'status APPRAISED');
  const parsed = parseImprovementsFromCalculationSnapshot({
    improvements: prepared.improvements,
    obligation: prepared.obligation,
  });
  assert(parsed.items[0].amount === 10000, 'persistência do item');
  const snap = buildTerminationDocumentSnapshot({
    settlement: {
      id: 's1',
      sale_id: 'sale-1',
      company_id: 'c1',
      operation_type: 'desistencia',
      total_paid: prepared.settlement.totalPaid,
      entry_amount: prepared.settlement.entryPaid,
      signal_amount: prepared.settlement.signalPaid,
      non_refundable_amount: prepared.settlement.nonRefundableAmount,
      refundable_base: prepared.settlement.refundableBase,
      retention_percent: prepared.settlement.contractualRetentionPercent,
      retention_amount: prepared.settlement.contractualRetentionAmount,
      agreed_refund_amount: prepared.settlement.agreedRefundAmount,
      contractual_refund_amount: prepared.settlement.contractualRefundAmount,
      refund_installments: prepared.settlement.refundInstallmentCount,
      refund_destination: prepared.refundDestination,
      improvement_status: prepared.improvementStatus,
      calculation_status: prepared.calculationStatus,
      calculation_snapshot: {
        ...prepared.settlement,
        improvements: prepared.improvements,
        obligation: prepared.obligation,
      },
    },
    documentNumber: 'TD-000000021/2026',
    context: {
      vendor: { role: 'vendedor', name: 'V', document: null, extra: null },
      buyer: { role: 'comprador', name: 'C', document: null, extra: null },
    },
  });
  assert(snap.html.includes('Poço'), 'termo descreve item');
  assert(snap.html.includes('R$ 10.000,00') || snap.html.includes('10.000'), 'valor no termo');
  const audit = formatLotAuditEvent({
    id: 'e1',
    company_id: null,
    project_id: 'p1',
    block_id: 'b1',
    lot_id: 'b1',
    sale_id: 'sale-1',
    contract_id: null,
    user_id: 'u1',
    action: 'sale_cancelled',
    title: 'Lote liberado — venda encerrada',
    description: 'Desistência do cliente · Vendido → Disponível',
    old_data: null,
    new_data: {
      motiveCode: 'desistencia',
      improvementsTotal: prepared.obligation.improvementsTotal,
      obligation: prepared.obligation,
      improvements: prepared.improvements,
    },
    created_at: '2026-08-25T12:00:00Z',
    source: 'gis_map',
  });
  assert(audit.title === 'Lote liberado — venda encerrada', 'título preservado');
  assert(audit.description?.includes('Desistência do cliente'), 'descrição preservada');
  const impLine = lotHistoryImprovementsLine(audit) || '';
  assert(impLine.includes('Benfeitorias reconhecidas'), 'linha de auditoria');
  assert(impLine.includes('10.000'), 'valor na auditoria');
  console.log('OK testScenarioCSingleImprovement');
}

function testScenarioDMultipleImprovements() {
  const record = buildImprovementsRecord({
    hasImprovements: true,
    appraisalStatus: 'COMPLETED',
    items: [
      { description: 'Muro de alvenaria', amount: 8000 },
      { description: 'Fundação', amount: 12000 },
    ],
  });
  assert(record.total === 20000, 'soma 20000');
  assert(record.items.length === 2, 'dois itens');
  assert(record.items[0].order === 1 && record.items[1].order === 2, 'ordem');
  const prepared = prepare(
    operator({
      hasImprovements: true,
      improvementsAppraisalStatus: 'COMPLETED',
      improvementItems: record.items,
    }),
  );
  assert(prepared.improvements.total === 20000, 'prepare soma');
  assert(prepared.improvements.items.map((i) => i.description).join('|') === 'Muro de alvenaria|Fundação', 'discriminação');
  console.log('OK testScenarioDMultipleImprovements');
}

function testScenarioERetentionProtection() {
  const engine = calculateTerminationSettlement({
    policy: prepare(operator()).policy,
    receipts: [rec(0, 2000), rec(1, 1000), rec(2, 1000)],
    motiveCode: 'desistencia',
    hasImprovements: engineHasImprovementsFlag({
      hasImprovements: true,
      improvementsAppraisalStatus: 'COMPLETED',
    }),
    destination: 'REFUND_CUSTOMER',
    exceptionOverride: null,
  });
  assert(engine.refundableBase === 2000, 'base sem benfeitoria');
  assert(engine.contractualRetentionAmount === 500, '25% só sobre 2000');
  assert(engine.contractualRefundAmount === 1500, 'líquido 1500');
  const obligation = buildCustomerObligation({
    contractualRefund: engine.contractualRefundAmount,
    improvements: buildImprovementsRecord({
      hasImprovements: true,
      appraisalStatus: 'COMPLETED',
      items: [{ description: 'Casa residencial', amount: 20000 }],
    }),
  });
  assert(obligation.improvementsTotal === 20000, '20000 sem retenção');
  assert(obligation.total === 21500, '1500+20000');
  assert(obligation.improvementsTotal * 0.25 !== obligation.improvementsTotal, 'não aplica 25% no total da benfeitoria');
  const calcSrc = read('lib/contract-termination/calculateSettlement.ts');
  assert(!calcSrc.includes('improvements.ts'), 'motor contratual não importa benfeitorias');
  assert(!calcSrc.includes('obligation.total'), 'motor não soma obrigação');
  console.log('OK testScenarioERetentionProtection');
}

function testCreditOtherUnitNotExtended() {
  const check = validateImprovementsForRelease({
    hasImprovements: true,
    appraisalStatus: 'COMPLETED',
    items: [{ description: 'Muro', amount: 8000 }],
    destination: 'CREDIT_OTHER_UNIT',
  });
  assert(!check.ok, 'crédito bloqueado com benfeitoria');
  if (!check.ok) {
    assert(check.code === 'IMPROVEMENTS_CREDIT_NOT_ALLOWED', 'código crédito');
    assert(check.error === IMPROVEMENTS_CREDIT_NOT_ALLOWED_MESSAGE, 'mensagem crédito');
  }
  console.log('OK testCreditOtherUnitNotExtended');
}

function testScheduleUsesObligationWithoutChangingCount() {
  const split = resolveRefundSchedule({
    destination: 'REFUND_CUSTOMER',
    agreedRefundAmount: 1500,
    contractualRefundAmount: 1500,
    installmentCount: 2,
    calculationStatus: 'CALCULATED',
    firstDueDate: '2026-09-15',
    scheduleTotal: 21500,
    improvementsTotal: 20000,
  });
  assert(split.ok && split.schedule.defined, 'define cronograma');
  if (split.ok && split.schedule.defined) {
    assert(split.schedule.installmentCount === 2, 'quantidade inalterada');
    assert(split.schedule.installments.reduce((a, r) => a + r.amount, 0) === 21500, 'soma obrigação');
  }
  console.log('OK testScheduleUsesObligationWithoutChangingCount');
}

function testLegacyNonePresentation() {
  const snap = buildTerminationDocumentSnapshot({
    settlement: {
      id: 's-legacy',
      sale_id: 'sale-legacy',
      company_id: 'c1',
      operation_type: 'desistencia',
      total_paid: 4000,
      entry_amount: 2000,
      signal_amount: 0,
      non_refundable_amount: 2000,
      refundable_base: 2000,
      retention_percent: 25,
      retention_amount: 500,
      agreed_refund_amount: 1500,
      contractual_refund_amount: 1500,
      refund_installments: 2,
      refund_destination: 'REFUND_CUSTOMER',
      improvement_status: 'NONE',
      calculation_status: 'CALCULATED',
    },
    documentNumber: 'TD-000000022/2026',
    context: {
      vendor: { role: 'vendedor', name: 'V', document: null, extra: null },
      buyer: { role: 'comprador', name: 'C', document: null, extra: null },
    },
  });
  assert(!/\bNONE\b/.test(snap.html), 'legado NONE não aparece');
  assert(snap.html.includes('não existem benfeitorias indenizáveis'), 'legado em português');
  console.log('OK testLegacyNonePresentation');
}

function testWiringIsolated() {
  const calc = read('lib/contract-termination/calculateSettlement.ts');
  const ui = read('components/map/ReleaseLotSettlementSection.tsx');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  const route = read('app/api/lots/[lotId]/release/route.ts');
  const persist = read('lib/finance/saleReleaseSettlement.ts');
  assert(ui.includes('Benfeitorias do imóvel'), 'seção UI');
  assert(ui.includes('Avaliação concluída'), 'status avaliação');
  assert(ui.includes('Total das benfeitorias'), 'total UI');
  assert(ui.includes('Total da obrigação com o cliente'), 'obrigação UI');
  assert(modal.includes('improvementItems'), 'POST envia itens');
  assert(modal.includes('improvementsAppraisalCompleted'), 'POST envia status');
  assert(route.includes('improvementItems'), 'rota lê itens');
  assert(persist.includes('engineHasImprovementsFlag'), 'prepare não mistura avaliação concluída no motor');
  assert(!calc.includes('buildCustomerObligation'), 'cálculo contratual isolado');
  assert(!read('lib/contract-operations/completeService.ts').includes('buildImprovementsRecord'), 'não mexe em contract-operations');
  console.log('OK testWiringIsolated');
}

function main() {
  testScenarioANoImprovements();
  testScenarioBPendingBlocks();
  testScenarioCSingleImprovement();
  testScenarioDMultipleImprovements();
  testScenarioERetentionProtection();
  testCreditOtherUnitNotExtended();
  testScheduleUsesObligationWithoutChangingCount();
  testLegacyNonePresentation();
  testWiringIsolated();
  console.log('ALL mandatory-release-improvements-tests PASSED');
}

main();
