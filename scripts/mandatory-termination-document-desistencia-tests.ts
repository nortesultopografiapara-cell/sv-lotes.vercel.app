/**
 * Fase 3B — termo documental de desistência (implementação local).
 * npx tsx scripts/mandatory-termination-document-desistencia-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildTerminationPolicySnapshot } from '../lib/contract-termination/snapshot';
import { POLICY_CATALOG } from '../lib/contract-termination/policyCatalog';
import { calculateTerminationSettlement } from '../lib/contract-termination/calculateSettlement';
import { prepareReleaseSettlement } from '../lib/finance/saleReleaseSettlement';
import { showsTerminationSettlement } from '../lib/finance/releaseLotShared';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/homolog/env';
import { hashTerminationDocumentHtml } from '../lib/termination-documents/hash';
import {
  formatSaleOperationDocumentNumber,
  isValidSaleOperationDocumentNumber,
  parseSaleOperationDocumentNumber,
} from '../lib/termination-documents/numbering';
import {
  buildTerminationDocumentSnapshot,
  snapshotFinanceMatchesSettlement,
  type FrozenSettlementFinance,
} from '../lib/termination-documents/snapshot';
import { shouldGenerateTerminationDocument } from '../lib/termination-documents/titles';
import { DESISTENCIA_DOCUMENT_TITLE } from '../lib/termination-documents/types';
import {
  addCalendarMonths,
  resolveRefundSchedule,
  splitRefundInstallmentAmounts,
  shouldDefineRefundSchedule,
} from '../lib/termination-documents/refundSchedule';
import type { TerminationReceiptInput } from '../lib/contract-termination/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function rec(
  installmentNumber: number,
  amount: number,
): TerminationReceiptInput {
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

function homologPrepared() {
  return prepareReleaseSettlement({
    motiveCode: 'desistencia',
    receipts: [rec(0, 2000), rec(1, 1000), rec(2, 1000)],
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
    },
  });
}

function settlementRowFromPrepared(
  prepared: ReturnType<typeof homologPrepared>,
  extra: Partial<FrozenSettlementFinance> = {},
): FrozenSettlementFinance {
  const s = prepared.settlement;
  return {
    id: 'settlement-homolog',
    sale_id: 'sale-homolog',
    company_id: 'company-a',
    contract_id: extra.contract_id === undefined ? 'contract-homolog' : extra.contract_id,
    block_id: 'block-homolog',
    project_id: 'project-homolog',
    operation_type: prepared.operationType,
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
    ...extra,
  };
}

function testHomologAraguaiaNumbers() {
  const prepared = homologPrepared();
  const s = prepared.settlement;
  assert(s.totalPaid === 4000, 'R$ 4.000 pagos');
  assert(s.entryPaid === 2000, 'entrada R$ 2.000');
  assert(s.nonRefundableAmount === 2000, 'entrada não reembolsável');
  assert(s.refundableBase === 2000, 'base R$ 2.000');
  assert(s.contractualRetentionPercent === 25, 'retenção 25%');
  assert(s.contractualRetentionAmount === 500, 'retenção R$ 500');
  assert(s.contractualRefundAmount === 1500, 'líquido R$ 1.500');
  assert(s.agreedRefundAmount === 1500, 'acordado R$ 1.500');
  assert(s.refundInstallmentCount === 2, '2 parcelas');
  assert(prepared.policy.policyVersion === 'araguaia.clause3.item8.v1', 'policy version');
  assert(prepared.policy.policySource === 'catalog', 'policy source catalog');
  console.log('OK testHomologAraguaiaNumbers');
}

function testRefundScheduleSplitsAndCalendar() {
  const two = splitRefundInstallmentAmounts(1500, 2);
  assert(two.join(',') === '750,750', '1500/2 = 750+750');
  const three = splitRefundInstallmentAmounts(1000, 3);
  assert(three.join(',') === '333.33,333.33,333.34', '1000/3 centavos na última');
  assert(
    Math.round(three.reduce((a, n) => a + n, 0) * 100) === 100000,
    'soma 1000',
  );
  assert(addCalendarMonths('2026-01-31', 1) === '2026-02-28', '31/01 → 28/02/2026');
  assert(addCalendarMonths('2026-01-31', 2) === '2026-03-31', '31/01 + 2 meses → 31/03');
  assert(addCalendarMonths('2024-01-31', 1) === '2024-02-29', 'bissexto');
  const one = resolveRefundSchedule({
    destination: 'REFUND_CUSTOMER',
    agreedRefundAmount: 1500,
    installmentCount: 1,
    calculationStatus: 'CALCULATED',
    firstDueDate: '2026-09-15',
  });
  assert(one.ok && one.schedule.defined, '1 parcela definida');
  if (one.ok && one.schedule.defined) {
    assert(one.schedule.installments.length === 1, 'uma parcela');
    assert(one.schedule.installments[0].amount === 1500, 'valor único');
    assert(one.schedule.installments[0].dueDate === '2026-09-15', 'mesma data');
  }
  const zero = resolveRefundSchedule({
    destination: 'REFUND_CUSTOMER',
    agreedRefundAmount: 0,
    installmentCount: 2,
    calculationStatus: 'CALCULATED',
    firstDueDate: '2026-09-15',
  });
  assert(zero.ok && !zero.schedule.defined, 'valor zero não define cronograma');
  const none = resolveRefundSchedule({
    destination: 'REFUND_CUSTOMER',
    agreedRefundAmount: 1500,
    installmentCount: 0,
    calculationStatus: 'CALCULATED',
    firstDueDate: '2026-09-15',
  });
  assert(none.ok && !none.schedule.defined, 'quantidade 0 não define');
  const na = resolveRefundSchedule({
    destination: 'REFUND_CUSTOMER',
    agreedRefundAmount: 1500,
    installmentCount: 2,
    calculationStatus: 'NOT_APPLICABLE',
    firstDueDate: '2026-09-15',
  });
  assert(na.ok && !na.schedule.defined, 'NOT_APPLICABLE não define');
  const credit = resolveRefundSchedule({
    destination: 'CREDIT_OTHER_UNIT',
    agreedRefundAmount: 1500,
    installmentCount: 2,
    calculationStatus: 'CALCULATED',
    firstDueDate: '2026-09-15',
  });
  assert(credit.ok && !credit.schedule.defined, 'crédito sem cronograma em dinheiro');
  assert(
    !shouldDefineRefundSchedule({
      destination: 'CREDIT_OTHER_UNIT',
      agreedRefundAmount: 1500,
      installmentCount: 2,
      calculationStatus: 'CALCULATED',
    }),
    'UI não exige data no crédito',
  );
  const missing = resolveRefundSchedule({
    destination: 'REFUND_CUSTOMER',
    agreedRefundAmount: 1500,
    installmentCount: 2,
    calculationStatus: 'CALCULATED',
    firstDueDate: null,
  });
  assert(!missing.ok && missing.code === 'REFUND_SCHEDULE_DATE_REQUIRED', 'CALCULATED+restituição+valor+parcelas sem data bloqueia');
  const waitingNoDate = resolveRefundSchedule({
    destination: 'REFUND_CUSTOMER',
    agreedRefundAmount: 1500,
    installmentCount: 2,
    calculationStatus: 'WAITING_IMPROVEMENT_APPRAISAL',
    firstDueDate: null,
  });
  assert(waitingNoDate.ok, 'WAITING sem data aceita');
  assert(
    waitingNoDate.ok &&
      waitingNoDate.schedule.defined === false &&
      waitingNoDate.schedule.installmentCount === 2 &&
      waitingNoDate.schedule.installments.length === 0,
    'WAITING preserva quantidade e não inventa parcelas',
  );
  assert(
    !shouldDefineRefundSchedule({
      destination: 'REFUND_CUSTOMER',
      agreedRefundAmount: 1500,
      installmentCount: 2,
      calculationStatus: 'WAITING_IMPROVEMENT_APPRAISAL',
    }),
    'WAITING não exige firstDueDate',
  );
  const waitingWithDate = resolveRefundSchedule({
    destination: 'REFUND_CUSTOMER',
    agreedRefundAmount: 1500,
    installmentCount: 2,
    calculationStatus: 'WAITING_IMPROVEMENT_APPRAISAL',
    firstDueDate: '2026-09-15',
  });
  assert(waitingWithDate.ok && waitingWithDate.schedule.defined === false, 'WAITING com data não congela cronograma');
  if (waitingWithDate.ok && !waitingWithDate.schedule.defined) {
    assert(waitingWithDate.schedule.installmentCount === 2, 'WAITING com data preserva quantidade');
    assert(waitingWithDate.schedule.installments.length === 0, 'WAITING com data sem parcelas individualizadas');
  }
  const jan = resolveRefundSchedule({
    destination: 'REFUND_CUSTOMER',
    agreedRefundAmount: 1500,
    installmentCount: 2,
    calculationStatus: 'CALCULATED',
    firstDueDate: '2026-01-31',
  });
  assert(jan.ok && jan.schedule.defined, 'cronograma jan');
  if (jan.ok && jan.schedule.defined) {
    assert(jan.schedule.installments[1].dueDate === '2026-02-28', '2ª em 28/02');
    assert(jan.schedule.frequency === 'MONTHLY', 'MONTHLY');
  }
  console.log('OK testRefundScheduleSplitsAndCalendar');
}

function homologContext() {
  return {
    contractNumber: '000000007/2026',
    contractModel: 'ARAGUAIA',
    forumCitySnapshot: 'Redenção/PA',
    projectName: 'Chacreamento Araguaia',
    quadra: '02',
    lote: '50',
    customerId: 'customer-1',
    vendor: {
      role: 'vendedor' as const,
      name: 'Loteadora Homolog',
      document: '00.000.000/0001-00',
      extra: null,
    },
    buyer: {
      role: 'comprador' as const,
      name: 'Comprador Homolog',
      document: '000.000.000-00',
      extra: null,
    },
    spouse: {
      role: 'conjuge' as const,
      name: 'Cônjuge Homolog',
      document: '111.111.111-11',
      extra: null,
    },
    pendingObligationsCanceled: true,
  };
}

function testSnapshotEqualsSettlementAndHtml() {
  const prepared = homologPrepared();
  const row = settlementRowFromPrepared(prepared);
  const resolved = resolveRefundSchedule({
    destination: 'REFUND_CUSTOMER',
    agreedRefundAmount: 1500,
    contractualRefundAmount: 1500,
    installmentCount: 2,
    calculationStatus: 'CALCULATED',
    firstDueDate: '2026-09-15',
  });
  assert(resolved.ok && resolved.schedule.defined, 'cronograma 1500/2');
  const snap = buildTerminationDocumentSnapshot({
    settlement: row,
    documentNumber: 'TD-000000001/2026',
    generatedAt: '2026-08-25T12:00:00.000Z',
    refundSchedule: resolved.ok ? resolved.schedule : null,
    context: homologContext(),
  });

  assert(snapshotFinanceMatchesSettlement(snap, row), 'snapshot = settlement');
  assert(snap.documentNumber === 'TD-000000001/2026', 'número');
  assert(snap.title === DESISTENCIA_DOCUMENT_TITLE, 'título');
  assert(snap.operationType === 'desistencia', 'tipo');
  assert(snap.policyVersion === 'araguaia.clause3.item8.v1', 'policy no snapshot');
  assert(snap.policySource === 'catalog', 'source no snapshot');
  assert(snap.contractNumber === '000000007/2026', 'contrato');
  assert(snap.refundSchedule.defined === true, 'cronograma definido');
  if (snap.refundSchedule.defined) {
    assert(snap.refundSchedule.installmentCount === 2, '2 parcelas');
    assert(snap.refundSchedule.firstDueDate === '2026-09-15', '1ª 15/09');
    assert(snap.refundSchedule.frequency === 'MONTHLY', 'mensal');
    assert(snap.refundSchedule.installments[0].amount === 750, '1ª 750');
    assert(snap.refundSchedule.installments[1].amount === 750, '2ª 750');
    assert(snap.refundSchedule.installments[1].dueDate === '2026-10-15', '2ª 15/10');
  }
  assert(snap.signatureStatus === 'NOT_STARTED', 'assinatura futura');
  assert(snap.spouse?.name === 'Cônjuge Homolog', 'cônjuge no ato');
  assert(snap.contentHash === hashTerminationDocumentHtml(snap.html), 'hash do HTML');
  assert(snap.html.includes('ACERTO FINANCEIRO'), 'quadro acerto');
  assert(snap.html.includes('CRONOGRAMA DA RESTITUIÇÃO'), 'seção cronograma');
  assert(snap.html.includes('15/09/2026'), 'vencimento 1');
  assert(snap.html.includes('15/10/2026'), 'vencimento 2');
  assert(snap.html.includes('R$ 750,00') || snap.html.includes('750'), 'valor parcela');
  assert(snap.html.includes('não equivale à comprovação futura de pagamento'), 'assinatura ≠ pagamento');
  assert(snap.html.includes('conforme as parcelas forem efetivamente pagas'), 'quitação por pagamento');
  assert(snap.html.includes('R$ 4.000,00') || snap.html.includes('4.000'), 'total pago');
  assert(snap.html.includes('R$ 1.500,00') || snap.html.includes('1.500'), 'líquido');
  assert(!snap.html.includes('30/60'), 'não inventa 30/60');
  assert(!/plena, geral, irrevogável e irretratável quitação/i.test(snap.html), 'sem quitação plena');
  assert(snap.html.includes('não existem benfeitorias indenizáveis'), 'cláusula 5 em português');
  assert(!snap.html.includes('araguaia.clause3.item8.v1'), 'PDF das partes sem código técnico');
  assert(snap.html.includes('Cláusula 3 — itens 6 a 9'), 'redação jurídica amigável');
  assert(!snap.html.includes('política congelada'), 'sem jargão política congelada');
  assert(!/\bNONE\b/.test(snap.html), 'não exibe NONE');
  assert(snap.html.includes('A) Identificação'), 'cláusula A');
  assert(snap.html.includes('K) Assinaturas'), 'cláusula K');
  assert(snap.contractId === 'contract-homolog', 'contract_id válido');

  const withoutDate = buildTerminationDocumentSnapshot({
    settlement: row,
    documentNumber: 'TD-000000009/2026',
    context: homologContext(),
  });
  assert(withoutDate.refundSchedule.defined === false, 'sem data não inventa cronograma');
  assert(withoutDate.html.includes('não são definidos neste ato'), 'texto neutro sem calendário');

  const frozenRetry = buildTerminationDocumentSnapshot({
    settlement: row,
    documentNumber: 'TD-000000001/2026',
    generatedAt: '2026-08-25T12:00:00.000Z',
    refundSchedule: resolved.ok ? resolved.schedule : null,
    context: homologContext(),
  });
  assert(frozenRetry.contentHash === snap.contentHash, 'retry reutiliza hash/cronograma');
  assert(frozenRetry.html === snap.html, 'HTML congelado idêntico');

  const nullContract = buildTerminationDocumentSnapshot({
    settlement: settlementRowFromPrepared(prepared, { contract_id: null }),
    documentNumber: 'TD-000000002/2026',
    context: {
      vendor: { role: 'vendedor', name: 'V', document: null, extra: null },
      buyer: { role: 'comprador', name: 'C', document: null, extra: null },
    },
  });
  assert(nullContract.contractId === null, 'contract_id null permitido');
  console.log('OK testSnapshotEqualsSettlementAndHtml');
  console.log(
    JSON.stringify(
      {
        homologSchedule: snap.refundSchedule,
        documentNumber: snap.documentNumber,
        totals: {
          totalPaid: snap.totalPaid,
          nonRefundableAmount: snap.nonRefundableAmount,
          restitutionBase: snap.restitutionBase,
          retentionAmount: snap.retentionAmount,
          agreedRefundAmount: snap.agreedRefundAmount,
          refundInstallments: snap.refundInstallments,
        },
      },
      null,
      2,
    ),
  );
}

function testNumberingAndMigration() {
  assert(
    formatSaleOperationDocumentNumber('TD', 1, 2026) === 'TD-000000001/2026',
    'formato TD',
  );
  assert(isValidSaleOperationDocumentNumber('TD-000000001/2026'), 'válido');
  assert(parseSaleOperationDocumentNumber('TD-000000001/2026')?.seq === 1, 'seq');
  const sql = read('supabase/migrations/20261011120000_sale_release_settlement_documents.sql');
  assert(sql.includes('document_number'), 'coluna document_number');
  assert(sql.includes('document_status'), 'coluna document_status');
  assert(sql.includes('document_generated_at'), 'document_generated_at');
  assert(sql.includes('document_generated_by'), 'document_generated_by');
  assert(sql.includes('document_hash'), 'document_hash');
  assert(sql.includes('sale_operation_document_counters'), 'contador');
  assert(sql.includes('next_sale_operation_document_number'), 'RPC atômica');
  assert(sql.includes('ON CONFLICT (company_id, prefix, year)'), 'concorrência');
  assert(sql.includes('last_seq + 1'), 'incremento atômico');
  assert(!sql.includes('SELECT MAX'), 'sem SELECT MAX+1');
  assert(sql.includes('tenant mismatch'), 'isolamento tenant na RPC');
  assert(sql.includes('sale_release_settlements_document_number_uidx'), 'unique por tenant');
  assert(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS contador');
  assert(sql.includes("GRANT EXECUTE ON FUNCTION public.next_sale_operation_document_number"), 'grant RPC');
  assert(sql.includes("PENDING', 'GENERATED', 'SIGNED', 'FAILED"), 'estados documentais');
  console.log('OK testNumberingAndMigration');
}

function testTitlesAndErroCadastro() {
  assert(shouldGenerateTerminationDocument('desistencia'), 'desistência gera termo');
  assert(shouldGenerateTerminationDocument('distrato'), 'distrato gera termo próprio');
  assert(!shouldGenerateTerminationDocument('inadimplencia'), 'inadimplência não');
  assert(!shouldGenerateTerminationDocument('erro_cadastro'), 'erro_cadastro NÃO gera termo');
  assert(!shouldGenerateTerminationDocument('cancelamento_administrativo'), 'admin não');
  assert(!showsTerminationSettlement('erro_cadastro'), 'erro sem acerto na UI');
  const calc = calculateTerminationSettlement;
  assert(typeof calc === 'function', 'motor financeiro intacto');
  console.log('OK testTitlesAndErroCadastro');
}

function testImprovementsAndCredit() {
  const prepared = homologPrepared();
  const waiting = buildTerminationDocumentSnapshot({
    settlement: settlementRowFromPrepared(prepared, {
      improvement_status: 'WAITING_APPRAISAL',
      calculation_status: 'WAITING_IMPROVEMENT_APPRAISAL',
    }),
    documentNumber: 'TD-000000003/2026',
    context: {
      vendor: { role: 'vendedor', name: 'V', document: null, extra: null },
      buyer: { role: 'comprador', name: 'C', document: null, extra: null },
    },
  });
  assert(waiting.html.includes('não constitui cálculo final'), 'benfeitorias bloqueiam final');
  assert(waiting.html.includes('não há quitação financeira definitiva'), 'sem quitação definitiva');
  assert(waiting.refundSchedule.defined === false, 'WAITING sem cronograma definido');
  assert(waiting.refundSchedule.installmentCount === 2, 'WAITING preserva quantidade no documento');
  assert(waiting.refundSchedule.installments.length === 0, 'WAITING sem parcelas no documento');
  assert(
    waiting.html.includes('após a conclusão da avaliação das benfeitorias'),
    'documento informa cronograma após avaliação',
  );
  assert(!waiting.html.includes('CRONOGRAMA DA RESTITUIÇÃO'), 'WAITING sem seção de calendário');

  const waitingDateIgnored = buildTerminationDocumentSnapshot({
    settlement: settlementRowFromPrepared(prepared, {
      improvement_status: 'WAITING_APPRAISAL',
      calculation_status: 'WAITING_IMPROVEMENT_APPRAISAL',
    }),
    documentNumber: 'TD-000000013/2026',
    refundSchedule: {
      defined: true,
      installmentCount: 2,
      firstDueDate: '2026-09-15',
      frequency: 'MONTHLY',
      installments: [
        { number: 1, dueDate: '2026-09-15', amount: 750 },
        { number: 2, dueDate: '2026-10-15', amount: 750 },
      ],
    },
    context: {
      vendor: { role: 'vendedor', name: 'V', document: null, extra: null },
      buyer: { role: 'comprador', name: 'C', document: null, extra: null },
    },
  });
  assert(waitingDateIgnored.refundSchedule.defined === false, 'WAITING ignora cronograma enviado');
  assert(!waitingDateIgnored.html.includes('15/09/2026'), 'WAITING não congela data enviada');
  assert(waitingDateIgnored.html.includes('após a conclusão da avaliação das benfeitorias'), 'WAITING com data ainda informa avaliação');
  assert(!waiting.html.includes('NONE'), 'WAITING não exibe NONE');

  const appraisedPrepared = prepareReleaseSettlement({
    motiveCode: 'desistencia',
    receipts: [rec(0, 2000), rec(1, 1000), rec(2, 1000)],
    saleSnapshot: araguaiaSnapshot,
    salePersistSource: 'catalog',
    saleContractModel: 'ARAGUAIA',
    operator: {
      hasImprovements: true,
      improvementsAppraisalStatus: 'COMPLETED',
      improvementItems: [
        { id: 'imp-1', order: 1, description: 'Muro de alvenaria', amount: 8000 },
        { id: 'imp-2', order: 2, description: 'Fundação', amount: 12000 },
      ],
      refundDestination: 'REFUND_CUSTOMER',
      exceptionalAgreement: false,
      exceptionalReason: null,
      exceptionalRefundAmount: null,
      exceptionalRetentionPercent: null,
      refundFirstDueDate: '2026-09-15',
    },
  });
  assert(appraisedPrepared.settlement.contractualRefundAmount === 1500, 'retenção contratual intacta');
  assert(appraisedPrepared.settlement.agreedRefundAmount === 1500, 'acordado contratual intacto');
  assert(appraisedPrepared.improvements.total === 20000, 'total benfeitorias');
  assert(appraisedPrepared.obligation.total === 21500, 'obrigação = 1500 + 20000');
  assert(appraisedPrepared.settlement.calculationStatus === 'CALCULATED', 'avaliação concluída fecha o motor');
  const appraisedSchedule = resolveRefundSchedule({
    destination: 'REFUND_CUSTOMER',
    agreedRefundAmount: 1500,
    contractualRefundAmount: 1500,
    installmentCount: 2,
    calculationStatus: 'CALCULATED',
    firstDueDate: '2026-09-15',
    scheduleTotal: appraisedPrepared.obligation.total,
    improvementsTotal: appraisedPrepared.improvements.total,
  });
  assert(appraisedSchedule.ok && appraisedSchedule.schedule.defined, 'cronograma do total');
  if (appraisedSchedule.ok && appraisedSchedule.schedule.defined) {
    assert(appraisedSchedule.schedule.installments[0].amount === 10750, '21500/2');
    assert(appraisedSchedule.schedule.installments[1].amount === 10750, '21500/2 última');
  }
  const appraised = buildTerminationDocumentSnapshot({
    settlement: settlementRowFromPrepared(appraisedPrepared),
    documentNumber: 'TD-000000014/2026',
    refundSchedule: appraisedSchedule.ok ? appraisedSchedule.schedule : null,
    context: {
      vendor: { role: 'vendedor', name: 'V', document: null, extra: null },
      buyer: { role: 'comprador', name: 'C', document: null, extra: null },
    },
  });
  assert(appraised.html.includes('Muro de alvenaria'), 'discrimina muro');
  assert(appraised.html.includes('Fundação'), 'discrimina fundação');
  assert(appraised.html.includes('Valor total das benfeitorias reconhecidas'), 'total no termo');
  assert(appraised.html.includes('Total da obrigação com o cliente'), 'obrigação no termo');
  assert(appraised.html.includes('tratado separadamente do cálculo contratual'), 'origem separada');
  assert(!/\bNONE\b/.test(appraised.html), 'avaliado sem NONE');
  assert(appraised.html.includes('não equivale à comprovação futura de pagamento'), 'assinatura ≠ pagamento com benfeitoria');

  const credit = buildTerminationDocumentSnapshot({
    settlement: settlementRowFromPrepared(prepared, {
      refund_destination: 'CREDIT_OTHER_UNIT',
    }),
    documentNumber: 'TD-000000004/2026',
    context: {
      vendor: { role: 'vendedor', name: 'V', document: null, extra: null },
      buyer: { role: 'comprador', name: 'C', document: null, extra: null },
    },
  });
  assert(credit.refundDestination === 'CREDIT_OTHER_UNIT', 'destino crédito');
  assert(credit.html.includes('intenção reconhecida'), 'somente intenção');
  assert(!credit.html.includes('CRONOGRAMA DA RESTITUIÇÃO'), 'crédito sem cronograma em dinheiro');
  assert(!/transferência já ocorreu/i.test(credit.html), 'não afirma transferência');
  assert(!credit.html.includes('nova venda'), 'não cria nova venda');
  console.log('OK testImprovementsAndCredit');
}

function testCatalogModelsDoNotChangeEngine() {
  for (const key of ['PADRAO', 'MENESES', 'RECANTO_PRIMAVERA', 'SV_LOTES_2', 'ARAGUAIA'] as const) {
    assert(Boolean(POLICY_CATALOG[key]), `catálogo ${key}`);
  }
  const calcSrc = read('lib/contract-termination/calculateSettlement.ts');
  assert(calcSrc.includes("WAITING_IMPROVEMENT_APPRAISAL"), 'motor original');
  assert(!calcSrc.includes('refundSchedule'), 'motor não monta cronograma');
  const persist = read('lib/finance/saleReleaseSettlement.ts');
  assert(persist.includes('calculateTerminationSettlement({'), 'prepare ainda usa o motor');
  console.log('OK testCatalogModelsDoNotChangeEngine');
}

function testReleaseFlowAtomicityAndRetry() {
  const svc = read('lib/finance/releaseLotService.ts');
  const execFn = svc.slice(svc.indexOf('export async function executeReleaseLot'));
  assert(execFn.includes('IMPROVEMENTS_APPRAISAL_REQUIRED'), 'bloqueia avaliação pendente');
  const persistMod = read('lib/termination-documents/persist.ts');
  const freezeIdx = execFn.indexOf('frozenSnapshot = await freezeDesistenciaSnapshotOrThrow');
  const asaasIdx = execFn.indexOf('resolveAsaasChargesForRelease');
  const interIdx = execFn.indexOf('resolveInterChargesForRelease');
  const localIdx = execFn.indexOf('const local = await applyLocalRelease');
  const afterLocal = execFn.slice(localIdx);
  const execIdx = afterLocal.indexOf('markReleaseSettlementExecuted');
  const pdfIdx = afterLocal.indexOf('materializeDesistenciaPdfSafe');
  assert(freezeIdx > 0 && freezeIdx < asaasIdx, 'snapshot antes do Asaas');
  assert(freezeIdx < interIdx, 'snapshot antes do Inter');
  assert(localIdx > asaasIdx && localIdx > interIdx, 'local depois das cobranças');
  assert(execIdx >= 0, 'EXECUTED depois do lote');
  assert(pdfIdx > execIdx, 'PDF depois de EXECUTED');
  assert(svc.includes("status === 'EXECUTED'"), 'idempotência EXECUTED');
  assert(svc.includes('alreadyReleased: true'), 'não reexecuta release');
  assert(svc.includes('DOCUMENT_SNAPSHOT_FAILED') || svc.includes('persist_document'), 'falha de snapshot bloqueia lote');
  assert(svc.includes('PDF failed after EXECUTED'), 'falha de PDF não desfaz lote');
  assert(persistMod.includes("document_status: 'FAILED'"), 'FAILED documental');
  assert(persistMod.includes("status', 'EXECUTED'"), 'FAILED só em EXECUTED');
  assert(persistMod.includes('retryTerminationDocumentPdf'), 'retry dedicado');
  assert(persistMod.includes("row.status !== 'EXECUTED'"), 'retry exige EXECUTED');
  assert(persistMod.includes('assertFrozenHtmlUnchanged'), 'HTML congelado no retry');
  assert(persistMod.includes('REFUND_SCHEDULE_DATE_REQUIRED'), 'freeze exige cronograma quando devido');
  assert(persistMod.includes('parseRefundScheduleFromCalculationSnapshot'), 'lê cronograma persistido');
  assert(persistMod.includes('undefinedRefundSchedule'), 'sem CALCULATED não congela calendário');
  const scheduleSrc = read('lib/termination-documents/refundSchedule.ts');
  assert(scheduleSrc.includes("status !== 'CALCULATED'"), 'data só obrigatória com CALCULATED');
  assert(!svc.includes("from('sale_contract_operations')"), 'não usa sale_contract_operations');
  assert(!persistMod.includes('saleContractSignatureService'), 'sem assinatura de contrato');
  assert(!persistMod.includes('/sign/sale/'), 'sem rota de assinatura de contrato');
  console.log('OK testReleaseFlowAtomicityAndRetry');
}

function testApiUxAndSaleDocuments() {
  const api = read('app/api/sales/[saleId]/termination-document/route.ts');
  const pdf = read('app/api/sales/[saleId]/termination-document/pdf/route.ts');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  const signatureActions = read('components/map/TerminationDocumentSignatureActions.tsx');
  const gis = read('components/map/GISMap.tsx');
  const docs = read('lib/saleDocuments.ts');
  assert(api.includes('loadTerminationDocumentBySale'), 'GET lê snapshot');
  assert(api.includes('retryTerminationDocumentPdf'), 'POST retry documental');
  assert(api.includes("retry !== true"), 'retry explícito');
  assert(pdf.includes('createSaleDocumentSignedUrl'), 'PDF via sale_documents');
  assert(modal.includes('Visualizar termo'), 'UX visualizar');
  assert(modal.includes('Baixar PDF'), 'UX baixar');
  assert(modal.includes('Tentar gerar PDF'), 'UX retry');
  assert(signatureActions.includes('Enviar para assinatura'), 'botão de assinatura');
  assert(modal.includes('TerminationDocumentSignatureActions'), 'ações de assinatura do termo');
  assert(!modal.includes('Disponível em fase posterior'), 'assinatura ativada');
  assert(modal.includes('Concluir'), 'botão concluir após sucesso');
  assert(modal.includes('refundFirstDueDate'), 'POST envia 1ª parcela');
  assert(!modal.includes('/sign/sale/'), 'modal não cria rota própria de assinatura');
  const ui = read('components/map/ReleaseLotSettlementSection.tsx');
  assert(ui.includes('Valor de cada parcela'), 'UI valor parcela');
  assert(ui.includes('Vencimento da 1ª parcela'), 'UI data 1ª parcela');
  assert(gis.includes('result.keepModalOpen'), 'GIS mantém modal');
  assert(docs.includes("DESISTENCIA"), 'tipo SYSTEM_GENERATED');
  assert(docs.includes('DESISTENCIA_ASSINADO'), 'tipo PDF assinado');
  assert(docs.includes('Termo de Desistência, Rescisão Contratual e Acerto Financeiro'), 'label documentos da venda');
  const saleDocsPanel = read('components/sales/SaleDocumentsPanel.tsx');
  assert(
    saleDocsPanel.includes('Documentos de Encerramento / Operações'),
    'seção encerramento em Documentos da Venda',
  );
  assert(saleDocsPanel.includes('terminationDocumentViewHref'), 'visualizar usa API do termo');
  assert(saleDocsPanel.includes('terminationDocumentPdfHref'), 'PDF usa API do termo');
  const history = read('components/map/LotHistoryPanel.tsx');
  assert(history.includes('Ver documento'), 'histórico oferece Ver documento');
  assert(history.includes('Visualizar documento assinado'), 'histórico oferece documento assinado');
  assert(history.includes('lotHistoryTerminationDocumentLinks'), 'mesmo sale_id do termo');
  const persist = read('lib/termination-documents/persist.ts');
  assert(persist.includes('createSystemGeneratedSaleDocumentMetadata'), 'PDF em sale_documents');
  assert(persist.includes('SALE_DOCUMENT_TYPE_DESISTENCIA'), 'tipo DESISTENCIA');
  assert(persist.includes('page.setContent') || read('lib/termination-documents/pdf.ts').includes('page.setContent'), 'PDF do HTML congelado');
  console.log('OK testApiUxAndSaleDocuments');
}

function testTenantIsolationAndIdempotencySource() {
  const persist = read('lib/termination-documents/persist.ts');
  assert(persist.includes('CROSS_TENANT'), 'bloqueio cross-tenant');
  assert(persist.includes('.eq(\'company_id\', params.companyId)'), 'update por company');
  assert(persist.includes('existing?.html && existing.documentNumber'), 'reusa snapshot');
  assert(
    persist.includes("document_status === 'GENERATED' || row.document_status === 'SIGNED'"),
    'idempotência PDF',
  );
  assert(persist.includes('findExistingDesistenciaSaleDocument'), 'reusa sale_documents');
  const numbering = read('lib/termination-documents/numbering.ts');
  assert(numbering.includes('next_sale_operation_document_number'), 'RPC');
  assert(!numbering.includes('SELECT MAX('), 'sem MAX+1');
  console.log('OK testTenantIsolationAndIdempotencySource');
}

function testEnvGuard() {
  assert(DEVELOP_PROJECT_REF !== PRODUCTION_PROJECT_REF, 'refs distintas');
  console.log('OK testEnvGuard');
}

function testZeroPaidDesistenciaDocument() {
  const prepared = prepareReleaseSettlement({
    motiveCode: 'desistencia',
    receipts: [{ id: 'open-1', installment_number: 1, status: 'pendente', amount: 2500 }],
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
    },
  });
  const snap = buildTerminationDocumentSnapshot({
    settlement: settlementRowFromPrepared(prepared),
    documentNumber: 'TD-000000099/2026',
    context: {
      contractNumber: '000000099/2026',
      contractModel: 'ARAGUAIA',
      projectName: 'Homolog Zero',
      quadra: '01',
      lote: '09',
      vendor: { role: 'vendedor', name: 'SV LOTES SPE', document: null, extra: null },
      buyer: { role: 'comprador', name: 'Cliente Sem Pagamento', document: null, extra: null },
      pendingObligationsCanceled: true,
    },
  });
  assert(prepared.settlement.totalPaid === 0, 'settlement zerado');
  assert(snap.totalPaid === 0, 'documento total 0');
  assert(snap.agreedRefundAmount === 0, 'documento restituição 0');
  assert(snap.retentionAmount === 0, 'documento retenção 0');
  assert(snap.html.includes('TD-000000099/2026'), 'documento gerado');
  assert(snap.operationType === 'desistencia', 'motivo desistência');
  console.log('OK testZeroPaidDesistenciaDocument');
}

function main() {
  testHomologAraguaiaNumbers();
  testRefundScheduleSplitsAndCalendar();
  testSnapshotEqualsSettlementAndHtml();
  testNumberingAndMigration();
  testTitlesAndErroCadastro();
  testImprovementsAndCredit();
  testCatalogModelsDoNotChangeEngine();
  testReleaseFlowAtomicityAndRetry();
  testApiUxAndSaleDocuments();
  testTenantIsolationAndIdempotencySource();
  testEnvGuard();
  testZeroPaidDesistenciaDocument();
  console.log('ALL mandatory-termination-document-desistencia-tests PASSED');
}

main();
