/**
 * Acerto financeiro de encerramento — testes obrigatórios Fase 1 (engine puro).
 * npx tsx scripts/mandatory-release-settlement-araguaia-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  ARAGUAIA_POLICY_V1,
  INCOMPLETE_POLICY_MESSAGE,
  MISSING_POLICY_MESSAGE,
  POLICY_CATALOG,
  buildTerminationSettlementPreview,
  calculateTerminationSettlement,
  classifyReceiptKind,
  classifyTerminationReceipts,
  isTerminationReceiptPaid,
  paidReceiptValue,
  resolveTerminationPolicy,
} from '../lib/contract-termination';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/homolog/env';
import type {
  TerminationPolicy,
  TerminationReceiptInput,
} from '../lib/contract-termination/types';

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
    installment_number: installmentNumber,
    status: 'pago',
    amount,
    ...extra,
  };
}

function araguaiaCalc(
  receipts: TerminationReceiptInput[],
  extra: {
    hasImprovements?: boolean;
    destination?: 'REFUND_CUSTOMER' | 'CREDIT_OTHER_UNIT';
    exceptionOverride?: Parameters<typeof calculateTerminationSettlement>[0]['exceptionOverride'];
    motiveCode?: string;
  } = {},
) {
  return calculateTerminationSettlement({
    policy: ARAGUAIA_POLICY_V1,
    receipts,
    motiveCode: extra.motiveCode || 'distrato',
    hasImprovements: Boolean(extra.hasImprovements),
    destination: extra.destination || 'REFUND_CUSTOMER',
    exceptionOverride: extra.exceptionOverride || null,
  });
}

function testReceiptHelpers() {
  assert(classifyReceiptKind(-1) === 'signal', 'sinal -1');
  assert(classifyReceiptKind(0) === 'entry', 'entrada 0');
  assert(classifyReceiptKind(1) === 'installment', 'parcela 1');
  assert(classifyReceiptKind(12) === 'installment', 'parcela 12');
  assert(classifyReceiptKind(null) === 'other', 'null → other');
  assert(isTerminationReceiptPaid({ status: 'pago' }), 'pago');
  assert(isTerminationReceiptPaid({ status: 'paid' }), 'paid');
  assert(isTerminationReceiptPaid({ status: 'pendente', paid_at: '2026-01-01' }), 'paid_at');
  assert(!isTerminationReceiptPaid({ status: 'pendente' }), 'pendente não pago');
  assert(paidReceiptValue({ paid_amount: 100, amount: 999 }) === 100, 'paid_amount prevalece');
  assert(paidReceiptValue({ paid_amount: 0, amount: 999 }) === 0, 'paid_amount 0 é válido');
  assert(paidReceiptValue({ paid_amount: null, amount: 250 }) === 250, 'fallback amount');

  const classified = classifyTerminationReceipts([
    rec(-1, 3000),
    rec(0, 10000),
    rec(1, 5000),
    { installment_number: 2, status: 'pendente', amount: 5000 },
  ]);
  assert(classified[0].kind === 'signal' && classified[0].paid, 'sinal classificado');
  assert(classified[3].paid === false && classified[3].paidValue === 0, 'não pago não entra');
  console.log('OK testReceiptHelpers');
}

function testAraguaiaHappyPath() {
  const s = araguaiaCalc([rec(0, 10000), rec(1, 10000), rec(2, 10000)]);
  assert(s.totalPaid === 30000, `totalPaid=${s.totalPaid}`);
  assert(s.entryPaid === 10000, 'entrada 10000');
  assert(s.signalPaid === 0, 'sem sinal');
  assert(s.installmentPaid === 20000, 'parcelas 20000');
  assert(s.nonRefundableAmount === 10000, 'entrada não reembolsável');
  assert(s.refundableBase === 20000, 'base 20000');
  assert(s.contractualRetentionPercent === 25, 'retenção 25');
  assert(s.contractualRetentionAmount === 5000, `retenção=${s.contractualRetentionAmount}`);
  assert(s.contractualRefundAmount === 15000, `líquido=${s.contractualRefundAmount}`);
  assert(s.refundInstallmentCount === 2, '2 parcelas quitadas');
  assert(s.calculationStatus === 'CALCULATED', 'status CALCULATED');
  assert(s.policyVersion === ARAGUAIA_POLICY_V1.policyVersion, 'versão');
  assert(s.clauseReference === 'Cláusula Terceira, item 8', 'cláusula');
  assert(s.policySource === 'catalog', 'origem catálogo');
  console.log('OK testAraguaiaHappyPath');
}

function testAraguaiaOnlyEntry() {
  const s = araguaiaCalc([rec(0, 10000)]);
  assert(s.totalPaid === 10000, 'total entrada');
  assert(s.refundableBase === 0, 'base 0');
  assert(s.contractualRetentionAmount === 0, 'retenção 0');
  assert(s.contractualRefundAmount === 0, 'líquido 0');
  assert(s.refundInstallmentCount === 0, 'sem parcelas quitadas');
  console.log('OK testAraguaiaOnlyEntry');
}

function testAraguaiaImprovements() {
  const s = araguaiaCalc([rec(0, 10000), rec(1, 20000)], { hasImprovements: true });
  assert(s.calculationStatus === 'WAITING_IMPROVEMENT_APPRAISAL', 'waiting');
  assert(s.isFinal === false, 'não é final');
  assert(s.agreedRefundAmount === null, 'acordado não fecha');
  assert(s.contractualRefundAmount === 15000, 'contratual provisório permanece visível');
  assert(
    s.warnings.some((w) => /avaliação técnica/i.test(w)),
    'explica avaliação técnica',
  );
  console.log('OK testAraguaiaImprovements');
}

function testEntryNeverDoubleRetention() {
  const s = araguaiaCalc([rec(0, 10000), rec(1, 20000)]);
  assert(s.nonRefundableAmount === 10000, 'entrada fora da base');
  assert(s.refundableBase === 20000, 'retenção só sobre 20000');
  assert(s.contractualRetentionAmount === 5000, 'não reter 25% da entrada');
  assert(s.contractualRefundAmount === 15000, 'líquido sem retenção duplicada');
  console.log('OK testEntryNeverDoubleRetention');
}

function testPaidAmountPrevails() {
  const s = araguaiaCalc([
    rec(0, 10000, { paid_amount: 10000 }),
    rec(1, 9999, { paid_amount: 20000 }),
  ]);
  assert(s.installmentPaid === 20000, 'paid_amount da parcela prevalece');
  assert(s.refundableBase === 20000, 'base usa paid_amount');
  console.log('OK testPaidAmountPrevails');
}

function testUnpaidReceiptExcluded() {
  const s = araguaiaCalc([
    rec(0, 10000),
    rec(1, 20000),
    { installment_number: 2, status: 'pendente', amount: 8000 },
  ]);
  assert(s.installmentPaid === 20000, 'parcela pendente fora');
  assert(s.totalPaid === 30000, 'total sem pendente');
  console.log('OK testUnpaidReceiptExcluded');
}

function testSignalSeparated() {
  const s = araguaiaCalc([rec(-1, 3000), rec(0, 10000), rec(1, 20000)]);
  assert(s.signalPaid === 3000, 'sinal separado');
  assert(s.entryPaid === 10000, 'entrada não mistura sinal');
  assert(s.nonRefundableAmount === 13000, 'sinal + entrada não reembolsáveis');
  assert(s.refundableBase === 20000, 'sinal fora da base');
  assert(s.refundInstallmentCount === 1, 'sinal não conta parcela de restituição');
  console.log('OK testSignalSeparated');
}

function testRefundInstallmentCountRule() {
  const s = araguaiaCalc([
    rec(-1, 1000),
    rec(0, 5000),
    rec(1, 1000),
    rec(2, 1000),
    rec(3, 1000),
    { installment_number: 4, status: 'pendente', amount: 1000 },
  ]);
  assert(s.refundInstallmentCount === 3, 'somente parcelas >= 1 quitadas');
  console.log('OK testRefundInstallmentCountRule');
}

function testCreditNotAutomatic() {
  const defaultDest = araguaiaCalc([rec(0, 10000), rec(1, 20000)]);
  assert(defaultDest.destination === 'REFUND_CUSTOMER', 'padrão restituir ao cliente');
  assert(defaultDest.creditOtherUnitAutomatic === false, 'nunca automático no default');

  const credit = araguaiaCalc([rec(0, 10000), rec(1, 20000)], {
    destination: 'CREDIT_OTHER_UNIT',
  });
  assert(credit.destination === 'CREDIT_OTHER_UNIT', 'crédito só se escolhido');
  assert(credit.creditOtherUnitAutomatic === false, 'flag automático sempre false');
  assert(
    credit.warnings.some((w) => /nenhuma transferência financeira/i.test(w)),
    'aviso de simulação',
  );
  assert(ARAGUAIA_POLICY_V1.creditOtherUnitAutomatic === false, 'policy nunca automática');
  console.log('OK testCreditNotAutomatic');
}

function testExceptionKeepsContractual() {
  const s = araguaiaCalc([rec(0, 10000), rec(1, 20000)], {
    exceptionOverride: {
      enabled: true,
      refundAmount: 12000,
      justification: 'Acordo comercial homologado pela diretoria',
    },
  });
  assert(s.contractualRefundAmount === 15000, 'contratual intacto');
  assert(s.agreedRefundAmount === 12000, 'acordado separado');
  assert(s.exceptionApplied === true, 'exceção aplicada');
  assert(s.contractualRetentionAmount === 5000, 'retenção contratual permanece');
  console.log('OK testExceptionKeepsContractual');
}

function testIncompleteModelsDoNotInheritAraguaia() {
  const models = ['PADRAO', 'MENESES', 'RECANTO_PRIMAVERA', 'SV_LOTES_2', 'CUSTOM'] as const;
  for (const model of models) {
    const policy = POLICY_CATALOG[model];
    assert(policy.status === 'INCOMPLETE', `${model} INCOMPLETE`);
    assert(policy.contractualRetentionPercent == null, `${model} sem percentual inventado`);
    const s = calculateTerminationSettlement({
      policy,
      receipts: [rec(0, 10000), rec(1, 20000)],
      motiveCode: 'distrato',
      hasImprovements: false,
      destination: 'REFUND_CUSTOMER',
    });
    assert(s.calculationStatus === 'INCOMPLETE', `${model} não calcula restituição`);
    assert(s.contractualRetentionPercent == null, `${model} não herda 25`);
    assert(s.contractualRefundAmount === 0, `${model} líquido não inventado`);
    assert(s.warnings[0] === INCOMPLETE_POLICY_MESSAGE, `${model} mensagem homologada`);
    assert(s.totalPaid === 30000, `${model} ainda mostra pagamentos encontrados`);
  }
  console.log('OK testIncompleteModelsDoNotInheritAraguaia');
}

function testMissingPolicyControlledError() {
  const missing = resolveTerminationPolicy({
    saleContractModel: null,
    contractContractModel: null,
  });
  assert(missing.detectedModel === null, 'sem modelo');
  assert(missing.policy.policySource === 'missing', 'source missing');
  const s = calculateTerminationSettlement({
    policy: missing.policy,
    receipts: [rec(0, 10000)],
    hasImprovements: false,
    destination: 'REFUND_CUSTOMER',
  });
  assert(s.calculationStatus === 'MISSING_POLICY', 'erro controlado');
  assert(s.warnings[0] === MISSING_POLICY_MESSAGE, 'mensagem de ausência');
  assert(s.contractualRetentionPercent == null, 'sem percentual');

  const unknown = resolveTerminationPolicy({ saleContractModel: 'MODELO_INEXISTENTE' });
  assert(unknown.policy.policySource === 'missing', 'desconhecido não cai no catálogo');
  assert(unknown.detectedModel === 'MODELO_INEXISTENTE', 'preserva chave detectada');
  const unknownCalc = calculateTerminationSettlement({
    policy: unknown.policy,
    receipts: [rec(1, 1000)],
    hasImprovements: false,
    destination: 'REFUND_CUSTOMER',
  });
  assert(unknownCalc.calculationStatus === 'MISSING_POLICY', 'desconhecido = missing');
  console.log('OK testMissingPolicyControlledError');
}

function testResolveNeverFallsBackToAraguaia() {
  const padrao = resolveTerminationPolicy({ saleContractModel: 'PADRAO' });
  assert(padrao.detectedModel === 'PADRAO', 'detecta PADRAO');
  assert(padrao.policy.catalogKey === 'PADRAO', 'não vira ARAGUAIA');
  assert(padrao.policy.status === 'INCOMPLETE', 'PADRAO incompleto');

  const saleWins = resolveTerminationPolicy({
    saleContractModel: 'ARAGUAIA',
    contractContractModel: 'PADRAO',
  });
  assert(saleWins.detectedModel === 'ARAGUAIA', 'snapshot da venda prevalece');
  assert(saleWins.policy.status === 'COMPLETE', 'ARAGUAIA complete');

  const contractOnly = resolveTerminationPolicy({
    saleContractModel: null,
    contractContractModel: 'ARAGUAIA',
  });
  assert(contractOnly.detectedModel === 'ARAGUAIA', 'contrato como fallback de snapshot');
  console.log('OK testResolveNeverFallsBackToAraguaia');
}

function testPreviewHelper() {
  const preview = buildTerminationSettlementPreview({
    saleContractModel: 'ARAGUAIA',
    receipts: [rec(0, 10000), rec(1, 20000)],
  });
  assert(preview.policyStatus === 'COMPLETE', 'preview complete');
  assert(preview.settlement.contractualRefundAmount === 15000, 'preview calcula');
  assert(preview.incompleteMessage == null, 'sem mensagem incomplete');
  assert(/25%/.test(preview.appliedRuleLabel), 'label usa percentual da policy');

  const incomplete = buildTerminationSettlementPreview({
    saleContractModel: 'MENESES',
    receipts: [rec(0, 10000)],
  });
  assert(incomplete.policyStatus === 'INCOMPLETE', 'meneses incomplete');
  assert(incomplete.incompleteMessage === INCOMPLETE_POLICY_MESSAGE, 'mensagem clara');
  assert(!/25%/.test(incomplete.appliedRuleLabel), 'incomplete não inventa 25%');
  console.log('OK testPreviewHelper');
}

function testEnginePurityAndWiring() {
  const calc = read('lib/contract-termination/calculateSettlement.ts');
  assert(!/\bARAGUAIA\b/.test(calc), 'cálculo não ramifica em ARAGUAIA');
  assert(!calc.includes('from(\'sales\')'), 'engine sem query de sales');
  assert(!calc.includes('supabase'), 'engine sem supabase');

  const catalog = read('lib/contract-termination/policyCatalog.ts');
  assert(catalog.includes("'PADRAO'"), 'PADRAO explícito');
  assert(catalog.includes("'MENESES'"), 'MENESES explícito');
  assert(catalog.includes("'RECANTO_PRIMAVERA'"), 'RECANTO explícito');
  assert(catalog.includes("'SV_LOTES_2'"), 'SV_LOTES_2 explícito');
  assert(catalog.includes("'CUSTOM'"), 'CUSTOM explícito');
  assert(catalog.includes('contractualRetentionPercent: 25'), '25 só no ARAGUAIA');
  assert(catalog.includes("status: 'INCOMPLETE'"), 'incompletos marcados');

  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('buildTerminationSettlementPreview'), 'GET/preview consome helper');
  assert(svc.includes('settlementPreview'), 'preview expõe settlement');
  assert(!svc.includes('sale_release_settlements'), 'não persiste settlement');
  assert(!svc.includes(".from('cash_movements')"), 'não soma cash_movements no release');

  const route = read('app/api/lots/[lotId]/release/route.ts');
  const post = route.slice(route.indexOf('export async function POST'));
  assert(!post.includes('hasImprovements'), 'POST não lê benfeitorias');
  assert(!post.includes('exceptionOverride'), 'POST não persiste exceção');
  assert(!post.includes('CREDIT_OTHER_UNIT'), 'POST não executa crédito');
  assert(post.includes('executeReleaseLot'), 'POST permanece no execute atual');

  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes('ReleaseLotSettlementSection'), 'modal consome seção de acerto');
  const postBody = modal.slice(
    modal.indexOf('JSON.stringify({'),
    modal.indexOf('idempotencyKey: preview?.idempotencyKey || null,'),
  );
  assert(!postBody.includes('hasImprovements'), 'POST do modal sem settlement');
  assert(!postBody.includes('destination'), 'POST do modal sem destino');
  assert(!modal.includes('/api/contract-operations/'), 'sem API de cessão');

  const ui = read('components/map/ReleaseLotSettlementSection.tsx');
  assert(ui.includes('Acerto financeiro'), 'seção acerto');
  assert(ui.includes('Regra aplicada conforme contrato'), 'selo da regra');
  assert(ui.includes('Há benfeitorias no imóvel?'), 'pergunta benfeitorias');
  assert(ui.includes('Aguardando avaliação de benfeitorias'), 'status waiting');
  assert(ui.includes('Contratual'), 'bloco contratual');
  assert(ui.includes('Acordado'), 'bloco acordado');
  assert(ui.includes('Simulação — nenhuma transferência financeira será realizada nesta etapa.'), 'crédito simulação');
  assert(!ui.includes("'25%'") && !ui.includes('"25%"'), 'UI não hardcoda 25%');
  assert(ui.includes('formatRetentionPercent'), 'percentual vem do engine');
  assert(!ui.includes('<select'), 'destino sem select');
  console.log('OK testEnginePurityAndWiring');
}

function testNoMigrationAndDevelopGuards() {
  assert(DEVELOP_PROJECT_REF === 'hoynysmynxncdlptuzub', 'DEVELOP autorizado');
  assert(PRODUCTION_PROJECT_REF === 'aezktedncttwpqeunjej', 'Production conhecida');

  const engineDir = path.join(__dirname, '..', 'lib', 'contract-termination');
  for (const file of fs.readdirSync(engineDir)) {
    const src = fs.readFileSync(path.join(engineDir, file), 'utf8');
    assert(!src.includes(PRODUCTION_PROJECT_REF), `${file} sem Production`);
    assert(!src.includes('aezktedncttwpqeunjej.supabase.co'), `${file} sem host Production`);
  }

  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  const migrations = fs.existsSync(migrationsDir) ? fs.readdirSync(migrationsDir) : [];
  assert(
    !migrations.some((f) => f.includes('settlement') && f.includes('2026')),
    'nenhuma migration nova de settlement nesta fase',
  );

  const ui = read('components/map/ReleaseLotSettlementSection.tsx');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  const svc = read('lib/finance/releaseLotService.ts');
  assert(!ui.includes(PRODUCTION_PROJECT_REF), 'UI sem Production');
  assert(!modal.includes(PRODUCTION_PROJECT_REF), 'modal sem Production');
  assert(!svc.includes(PRODUCTION_PROJECT_REF), 'serviço sem Production');
  console.log('OK testNoMigrationAndDevelopGuards');
}

function testPolicyInterfaceShape() {
  const policy: TerminationPolicy = ARAGUAIA_POLICY_V1;
  assert(policy.status === 'COMPLETE', 'status');
  assert(typeof policy.policyVersion === 'string', 'version');
  assert(policy.policySource === 'catalog', 'source');
  assert(policy.clauseReference != null, 'clause');
  assert(policy.creditOtherUnitAutomatic === false, 'auto false');
  const s = araguaiaCalc([rec(0, 1)]);
  for (const key of [
    'totalPaid',
    'entryPaid',
    'signalPaid',
    'installmentPaid',
    'otherPaid',
    'nonRefundableAmount',
    'refundableBase',
    'contractualRetentionPercent',
    'contractualRetentionAmount',
    'contractualRefundAmount',
    'agreedRefundAmount',
    'refundInstallmentCount',
    'calculationStatus',
    'warnings',
    'policyVersion',
    'policySource',
    'clauseReference',
  ]) {
    assert(key in s, `saída contém ${key}`);
  }
  console.log('OK testPolicyInterfaceShape');
}

function main() {
  testReceiptHelpers();
  testAraguaiaHappyPath();
  testAraguaiaOnlyEntry();
  testAraguaiaImprovements();
  testEntryNeverDoubleRetention();
  testPaidAmountPrevails();
  testUnpaidReceiptExcluded();
  testSignalSeparated();
  testRefundInstallmentCountRule();
  testCreditNotAutomatic();
  testExceptionKeepsContractual();
  testIncompleteModelsDoNotInheritAraguaia();
  testMissingPolicyControlledError();
  testResolveNeverFallsBackToAraguaia();
  testPreviewHelper();
  testEnginePurityAndWiring();
  testNoMigrationAndDevelopGuards();
  testPolicyInterfaceShape();
  console.log('\nALL mandatory-release-settlement-araguaia-tests PASSED');
}

main();
