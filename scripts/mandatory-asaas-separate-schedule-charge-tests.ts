/**
 * Emissão Asaas de SINAL e LOTE. Sem banco, sem Asaas e sem boleto real.
 * npx tsx scripts/mandatory-asaas-separate-schedule-charge-tests.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAsaasCompanyCreatePaymentBody } from '../lib/finance/asaasCompanyClient';
import {
  AsaasChargeAttemptInconclusiveError,
  AsaasChargeAttemptInFlightError,
  buildAsaasChargeIdempotencyKey,
  runGuardedAsaasCreate,
  type AsaasChargeAttemptRow,
  type GuardedAsaasCreatePorts,
} from '../lib/finance/asaasChargeAttempt';
import {
  asaasSeparateScheduleChargeAllowed,
  buildAsaasCarneParcelLabel,
  buildAsaasInstallmentChargeDescription,
} from '../lib/finance/asaasSeparateScheduleCharge';
import { assertCanCreateCompanyAsaasCharge } from '../lib/finance/companyAsaasChargeWorkflow';
import {
  buildSaleChargesSummaryFromRows,
  installmentHasBlockingCharge,
  isEligibleInstallmentForAsaasCharge,
} from '../lib/finance/saleChargesShared';
import {
  assertSettlementTargetsReceipt,
  settleReceiptById,
  type SettledReceipt,
} from '../lib/finance/recantoReceiptSchedule';
import {
  RECANTO_SEPARATE_SIGNAL_DEVELOP_COMPANY_ID,
  RECANTO_SEPARATE_SIGNAL_DEVELOP_PROJECT_ID,
} from '../lib/recantoSeparateSignalRuntime';

const COMPANY = RECANTO_SEPARATE_SIGNAL_DEVELOP_COMPANY_ID;
const PROJECT = RECANTO_SEPARATE_SIGNAL_DEVELOP_PROJECT_ID;
const OTHER_PROJECT = '11111111-1111-4111-8111-111111111111';
const OTHER_COMPANY = '22222222-2222-4222-8222-222222222222';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://aezktedncttwpqeunjej.supabase.co',
  RECANTO_SEPARATE_SIGNAL_SCHEMA_APPLIED: 'true',
  RECANTO_SEPARATE_SIGNAL_PERSIST_ENABLED: 'true',
};

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function receipt(group: 'SIGNAL' | 'LOT' | null, amount: number, due: string, status = 'pendente') {
  return {
    id: `${group || 'legacy'}-${amount}`,
    sale_id: 'sale-1',
    company_id: COMPANY,
    project_id: PROJECT,
    installment_number: group === 'SIGNAL' ? 1 : 1,
    due_date: due,
    amount,
    status,
    schedule_group: group,
  };
}

function memoryGuard(remote: {
  find: () => Promise<{ id: string } | null>;
  create: () => Promise<{ id: string; result: { id: string } }>;
}) {
  let row: AsaasChargeAttemptRow | null = null;
  let now = 1_000_000;
  let owners = 0;
  const ports: GuardedAsaasCreatePorts<{ id: string }> = {
    now: () => now,
    leaseMs: 180_000,
    newOwnerToken: () => `owner-${(owners += 1)}`,
    loadAttempt: async () => row,
    insertAttempt: async (next) => {
      if (row) return 'conflict';
      row = { ...next, idempotencyKey: 'asaas-company:stable' };
      return 'inserted';
    },
    stealAttempt: async (ownerToken, leaseUntilMs) => {
      if (!row) return false;
      if (row.status === 'unknown' || row.status === 'completed') return false;
      const blocked = row.status === 'reserved' && row.leaseUntilMs > now && row.ownerToken !== ownerToken;
      if (blocked) return false;
      row = { ...row, status: 'reserved', ownerToken, leaseUntilMs };
      return true;
    },
    confirmOwner: async (ownerToken) =>
      row?.ownerToken === ownerToken && (row?.leaseUntilMs || 0) > now,
    markUnknown: async (ownerToken) => {
      if (row?.ownerToken === ownerToken) row = { ...row, status: 'unknown' };
    },
    markFailed: async (ownerToken) => {
      if (row?.ownerToken === ownerToken) row = { ...row, status: 'failed' };
    },
    markCompleted: async (_ownerToken, asaasPaymentId) => {
      if (row) row = { ...row, status: 'completed', asaasPaymentId };
    },
    findRemote: remote.find,
    createRemote: remote.create,
  };
  return {
    ports,
    advance(ms: number) {
      now += ms;
    },
    now: () => now,
    read: () => row,
    seed(next: AsaasChargeAttemptRow) {
      row = next;
    },
  };
}

async function main() {
  assert(
    asaasSeparateScheduleChargeAllowed({
      scheduleGroup: 'SIGNAL',
      companyId: COMPANY,
      projectId: PROJECT,
      env,
    }),
    'SINAL autorizado no par',
  );
  assert(
    asaasSeparateScheduleChargeAllowed({
      scheduleGroup: 'LOT',
      companyId: COMPANY,
      projectId: PROJECT,
      env,
    }),
    'LOTE autorizado no par',
  );
  assert(
    asaasSeparateScheduleChargeAllowed({ scheduleGroup: null, companyId: OTHER_COMPANY, projectId: OTHER_PROJECT }),
    'LEGACY permanece autorizado',
  );
  assert(
    !asaasSeparateScheduleChargeAllowed({
      scheduleGroup: 'LOT',
      companyId: COMPANY,
      projectId: OTHER_PROJECT,
      env,
    }),
    'outro empreendimento bloqueado',
  );
  assert(
    !asaasSeparateScheduleChargeAllowed({
      scheduleGroup: 'SIGNAL',
      companyId: OTHER_COMPANY,
      projectId: PROJECT,
      env,
    }),
    'outra empresa bloqueada',
  );
  assert(
    !asaasSeparateScheduleChargeAllowed({
      scheduleGroup: 'SIGNAL',
      companyId: COMPANY,
      projectId: PROJECT,
      env: { NEXT_PUBLIC_SUPABASE_URL: 'https://aezktedncttwpqeunjej.supabase.co' },
    }),
    'flags desligadas bloqueiam SINAL',
  );

  assert(
    isEligibleInstallmentForAsaasCharge(receipt('SIGNAL', 500, '2026-02-10'), {
      separateScheduleAuthorized: true,
    }),
    'SINAL elegível quando autorizado',
  );
  assert(
    isEligibleInstallmentForAsaasCharge(receipt('LOT', 800, '2026-03-10'), {
      separateScheduleAuthorized: true,
    }),
    'LOTE elegível quando autorizado',
  );
  assert(
    !isEligibleInstallmentForAsaasCharge(receipt('SIGNAL', 500, '2026-02-10')),
    'SINAL sem autorização continua fora da fila',
  );
  assert(
    isEligibleInstallmentForAsaasCharge(receipt(null, 500, '2026-03-10')),
    'LEGACY continua elegível',
  );
  assert(
    !isEligibleInstallmentForAsaasCharge(
      receipt('LOT', 800, '2026-03-10', 'pago'),
      { separateScheduleAuthorized: true },
    ),
    'paga não emite',
  );
  assert(
    !isEligibleInstallmentForAsaasCharge(
      receipt('LOT', 800, '2026-03-10', 'cancelado'),
      { separateScheduleAuthorized: true },
    ),
    'cancelada não emite',
  );
  assert(
    installmentHasBlockingCharge({
      id: 'c1',
      companyId: COMPANY,
      customerId: null,
      saleId: 'sale-1',
      installmentId: 'lot-1',
      asaasPaymentId: 'pay_1',
      billingType: 'BOLETO',
      status: 'PENDING',
      value: 800,
      dueDate: '2026-03-10',
      invoiceUrl: null,
      bankSlipUrl: null,
      bankSlipIdentification: null,
      pixQrCode: null,
      pixCopyPaste: null,
      financialAccountId: null,
      paymentLink: null,
      paidAt: null,
      createdAt: '2026-11-10T00:00:00.000Z',
      updatedAt: '2026-11-10T00:00:00.000Z',
    }),
    'cobrança pendente bloqueia outra emissão',
  );

  const signalDescription = buildAsaasInstallmentChargeDescription({
    scheduleGroup: 'SIGNAL',
    installmentNumber: 1,
    contractNumber: '000000080/2026',
  });
  const lotDescription = buildAsaasInstallmentChargeDescription({
    scheduleGroup: 'LOT',
    installmentNumber: 1,
    contractNumber: '000000080/2026',
  });
  assert(signalDescription.startsWith('SINAL — Parcela 1'), signalDescription);
  assert(lotDescription.startsWith('LOTE — Parcela 1'), lotDescription);
  assert(!signalDescription.includes('800'), 'descrição do sinal não leva valor do lote');
  assert(!lotDescription.includes('500'), 'descrição do lote não leva valor do sinal');

  const signalPayload = buildAsaasCompanyCreatePaymentBody({
    customerId: 'cus_1',
    billingType: 'BOLETO',
    value: 500,
    dueDate: '2026-02-10',
    description: signalDescription,
    externalReference: 'receipt-signal',
  });
  const lotPayload = buildAsaasCompanyCreatePaymentBody({
    customerId: 'cus_1',
    billingType: 'BOLETO',
    value: 800,
    dueDate: '2026-03-10',
    description: lotDescription,
    externalReference: 'receipt-lot',
  });
  assert(signalPayload.value === 500 && signalPayload.dueDate === '2026-02-10', 'payload do sinal');
  assert(lotPayload.value === 800 && lotPayload.dueDate === '2026-03-10', 'payload do lote');
  assert(signalPayload.externalReference !== lotPayload.externalReference, 'referências distintas');
  assert(!('Idempotency-Key' in signalPayload), 'o corpo não finge chave que o provedor não aceita');

  const installments = [
    { sale_id: 'sale-1', schedule_group: 'LOT', installment_number: 1 },
    { sale_id: 'sale-1', schedule_group: 'SIGNAL', installment_number: 1 },
    { sale_id: 'sale-1', schedule_group: null, installment_number: 2 },
  ];
  assert(
    buildAsaasCarneParcelLabel(installments[1], installments, 3) === 'SINAL — Parcela 1/1',
    'carnê identifica o sinal',
  );
  assert(
    buildAsaasCarneParcelLabel(installments[0], installments, 3) === 'LOTE — Parcela 1/1',
    'carnê identifica o lote',
  );
  assert(
    buildAsaasCarneParcelLabel(installments[2], installments, 3) === 'Parcela 02/03 do contrato',
    'carnê LEGACY preservado',
  );

  const rows: SettledReceipt[] = [
    {
      id: 'signal-1',
      saleId: 'sale-1',
      scheduleGroup: 'SIGNAL',
      installmentNumber: 1,
      amount: 500,
      status: 'pendente',
      paidAmountCents: 0,
      settlementEventId: null,
    },
    {
      id: 'lot-1',
      saleId: 'sale-1',
      scheduleGroup: 'LOT',
      installmentNumber: 1,
      amount: 800,
      status: 'pendente',
      paidAmountCents: 0,
      settlementEventId: null,
    },
  ];
  const settled = settleReceiptById(rows, { receiptId: 'signal-1', eventId: 'evt-signal' });
  assert(settled.receipts.find((item) => item.id === 'lot-1')?.status === 'pendente', 'webhook não quita o lote');
  assert(settled.receipts.find((item) => item.id === 'signal-1')?.status === 'pago', 'webhook quita o sinal');
  let crossed = false;
  try {
    assertSettlementTargetsReceipt('signal-1', 'lot-1');
  } catch {
    crossed = true;
  }
  assert(crossed, 'conciliação recusa recebível diferente');

  const key = buildAsaasChargeIdempotencyKey(COMPANY, 'receipt-signal');
  assert(key === buildAsaasChargeIdempotencyKey(COMPANY, 'receipt-signal'), 'chave estável');
  assert(key !== buildAsaasChargeIdempotencyKey(COMPANY, 'receipt-lot'), 'chave por recebível');

  let creates = 0;
  const releaseCreate: { open: (() => void) | null } = { open: null };
  const held = memoryGuard({
    find: async () => null,
    create: async () => {
      creates += 1;
      if (creates === 1) {
        await new Promise<void>((resolve) => {
          releaseCreate.open = resolve;
        });
      }
      return { id: 'pay_concurrent', result: { id: 'pay_concurrent' } };
    },
  });
  const first = runGuardedAsaasCreate(held.ports);
  while (creates === 0) await Promise.resolve();
  let blocked = false;
  try {
    await runGuardedAsaasCreate(held.ports);
  } catch (error) {
    blocked =
      error instanceof AsaasChargeAttemptInFlightError ||
      error instanceof AsaasChargeAttemptInconclusiveError;
  }
  assert(blocked, 'segunda chamada simultânea não cria');
  releaseCreate.open?.();
  const created = await first;
  assert(created.asaasPaymentId === 'pay_concurrent' && creates === 1, 'uma cobrança na concorrência');

  let lookups = 0;
  const timeout = memoryGuard({
    find: async () => {
      lookups += 1;
      return lookups >= 2 ? { id: 'pay_timeout' } : null;
    },
    create: async () => {
      creates += 1;
      throw new Error('fetch failed');
    },
  });
  const recovered = await runGuardedAsaasCreate(timeout.ports);
  assert(recovered.kind === 'reused' && recovered.asaasPaymentId === 'pay_timeout', 'timeout recupera a cobrança');
  const createsAfterTimeout = creates;
  const again = await runGuardedAsaasCreate(timeout.ports);
  assert(again.asaasPaymentId === 'pay_timeout' && creates === createsAfterTimeout, 'retry após timeout não cria outra');

  const createsBeforeBrokenLookup = creates;
  const brokenLookup = memoryGuard({
    find: async () => {
      throw new Error('network down');
    },
    create: async () => {
      creates += 1;
      throw new Error('fetch failed');
    },
  });
  let inconclusive = false;
  try {
    await runGuardedAsaasCreate(brokenLookup.ports);
  } catch (error) {
    inconclusive = error instanceof AsaasChargeAttemptInconclusiveError;
  }
  assert(
    inconclusive && brokenLookup.read()?.status === 'reserved' && creates === createsBeforeBrokenLookup,
    'falha de consulta antes do POST não cria e não marca desconhecido',
  );

  const validation = memoryGuard({
    find: async () => null,
    create: async () => {
      creates += 1;
      throw new Error('CPF do cliente inválido');
    },
  });
  let definitive = false;
  try {
    await runGuardedAsaasCreate(validation.ports);
  } catch (error) {
    definitive = error instanceof Error && error.message.includes('CPF');
  }
  assert(definitive && validation.read()?.status === 'failed', 'erro definitivo não fica como desconhecido');

  const unknownAttempt = memoryGuard({
    find: async () => null,
    create: async () => {
      creates += 1;
      throw new Error('fetch failed');
    },
  });
  const createsBeforeUnknown = creates;
  let unknownBlocked = false;
  try {
    await runGuardedAsaasCreate(unknownAttempt.ports);
  } catch (error) {
    unknownBlocked = error instanceof AsaasChargeAttemptInconclusiveError;
  }
  unknownAttempt.advance(180_001);
  let unknownStillBlocked = false;
  try {
    await runGuardedAsaasCreate(unknownAttempt.ports);
  } catch (error) {
    unknownStillBlocked = error instanceof AsaasChargeAttemptInconclusiveError;
  }
  assert(
    unknownBlocked &&
      unknownStillBlocked &&
      unknownAttempt.read()?.status === 'unknown' &&
      creates === createsBeforeUnknown + 1,
    'resultado desconhecido não emite de novo depois da reserva expirar',
  );

  const crashedBeforePost = memoryGuard({
    find: async () => null,
    create: async () => {
      creates += 1;
      return { id: 'pay_after_crash', result: { id: 'pay_after_crash' } };
    },
  });
  crashedBeforePost.seed({
    status: 'reserved',
    ownerToken: 'processo-encerrado',
    leaseUntilMs: crashedBeforePost.now() - 1,
    asaasPaymentId: null,
    idempotencyKey: buildAsaasChargeIdempotencyKey(COMPANY, 'receipt-lot'),
  });
  const createsBeforeCrash = creates;
  const resumed = await runGuardedAsaasCreate(crashedBeforePost.ports);
  assert(
    resumed.asaasPaymentId === 'pay_after_crash' && creates === createsBeforeCrash + 1,
    'queda antes do POST pode retomar uma única emissão',
  );

  const activeRemote = memoryGuard({
    find: async () => ({ id: 'pay_active' }),
    create: async () => {
      creates += 1;
      return { id: 'pay_second', result: { id: 'pay_second' } };
    },
  });
  activeRemote.seed({
    status: 'completed',
    ownerToken: 'anterior',
    leaseUntilMs: 0,
    asaasPaymentId: 'pay_active',
    idempotencyKey: buildAsaasChargeIdempotencyKey(COMPANY, 'receipt-lot'),
  });
  const createsBeforeActive = creates;
  const reusedActive = await runGuardedAsaasCreate(activeRemote.ports);
  assert(
    reusedActive.asaasPaymentId === 'pay_active' && creates === createsBeforeActive,
    'cobrança já existente não gera a segunda',
  );

  const summary = buildSaleChargesSummaryFromRows({
    saleId: 'sale-1',
    companyId: COMPANY,
    installments: [
      { ...receipt('SIGNAL', 500, '2026-02-10'), id: 'receipt-signal', installment_number: 1 },
      { ...receipt('LOT', 800, '2026-03-10'), id: 'receipt-lot', installment_number: 1 },
      { ...receipt('LOT', 999, '2026-04-10'), id: 'other-project', project_id: OTHER_PROJECT },
      { ...receipt('SIGNAL', 500, '2026-01-10', 'pago'), id: 'paid-signal', installment_number: 0 },
    ],
    charges: [],
    context: {
      customerName: 'ANA CLAUDIA MAGALHÃES SILVA',
      customerEmail: null,
      customerPhone: null,
      projectName: 'CHACREAMENTO RECANTO PRIMAVERA',
      quadra: '02',
      lote: '32',
      lotLabel: null,
      contractNumber: '000000080/2026',
      financialAccountId: 'account-1',
    },
    financialAccountName: 'MS IMOBILIARIA LTDA',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
    separateScheduleAuthorized: (row) => row.company_id === COMPANY && row.project_id === PROJECT,
  });
  assert(summary.chargesMissing === 2, 'faltantes reúnem sinal e lote autorizados');
  assert(summary.missingInstallmentIds.includes('receipt-signal'), 'sinal entra no lote de emissão');
  assert(summary.missingInstallmentIds.includes('receipt-lot'), 'lote entra no lote de emissão');
  assert(!summary.missingInstallmentIds.includes('other-project'), 'outro empreendimento fica de fora');
  assert(!summary.missingInstallmentIds.includes('paid-signal'), 'sinal pago fica de fora');
  const signalPreview = summary.missingInstallments.find((item) => item.id === 'receipt-signal');
  const lotPreview = summary.missingInstallments.find((item) => item.id === 'receipt-lot');
  assert(signalPreview?.amount === 500 && signalPreview.dueDate === '2026-02-10', 'sinal preserva valor e vencimento');
  assert(lotPreview?.amount === 800 && lotPreview.dueDate === '2026-03-10', 'lote preserva valor e vencimento');
  assert(summary.hasFinancialAccount && summary.financialAccountName === 'MS IMOBILIARIA LTDA', 'conta da venda preservada');

  const activeCharge = {
    id: 'c1',
    companyId: COMPANY,
    customerId: null,
    saleId: 'sale-1',
    installmentId: 'receipt-lot',
    asaasPaymentId: 'pay_active',
    billingType: 'BOLETO' as const,
    status: 'PENDING' as const,
    value: 800,
    dueDate: '2026-03-10',
    invoiceUrl: null,
    bankSlipUrl: null,
    bankSlipIdentification: null,
    pixQrCode: null,
    pixCopyPaste: null,
    financialAccountId: 'account-1',
    paymentLink: null,
    paidAt: null,
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
  };
  assert(assertCanCreateCompanyAsaasCharge(activeCharge)?.asaasPaymentId === 'pay_active', 'cobrança ativa é reutilizada');

  const inter = readFileSync(resolve('lib/banking/inter/interSaleChargeService.ts'), 'utf8');
  assert(inter.includes('assertSeparateScheduleChargeAllowed'), 'Inter permanece na trava antiga');
  assert(!inter.includes('asaasSeparateScheduleCharge'), 'Inter não recebe a liberação Asaas');
  const manual = readFileSync(
    resolve('supabase/migrations/20261106233000_manual_receipt_payment_reject_cancelled.sql'),
    'utf8',
  );
  assert(manual.includes('execute_authorized_manual_receipt_payment'), 'baixa manual preservada');
  const migration = readFileSync(
    resolve('supabase/migrations/20261110180000_asaas_charge_attempt.sql'),
    'utf8',
  );
  assert(migration.includes('company_asaas_charge_attempts_installment_uidx'), 'unicidade da reserva');
  assert(migration.includes('references public.projects(id) on delete set null'), 'empreendimento com chave estrangeira');
  assert(migration.includes('grant all on table public.company_asaas_charge_attempts to service_role'), 'tentativa restrita ao service_role');
  assert(!/delete\s+from\s+public\.company_asaas_charges/i.test(migration), 'migration não apaga cobranças');

  console.log('asaas separate schedule charge tests: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
