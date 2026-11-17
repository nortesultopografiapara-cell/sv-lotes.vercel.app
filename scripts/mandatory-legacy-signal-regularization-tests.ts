/**
 * Regularização de sinal antigo. Dados fictícios, sem banco e sem a venda real.
 * npx tsx scripts/mandatory-legacy-signal-regularization-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  LegacySignalRollback,
  createLegacySignalGate,
  executeLegacySignalRegularization,
  financialPicture,
  previewLegacySignalRegularization,
  splitCentsEvenly,
  type LegacySignalActor,
  type LegacySignalRequest,
  type LegacySignalState,
} from '../lib/finance/legacySignalRegularization';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const company = '11111111-1111-4111-8111-111111111111';
const otherCompany = '22222222-2222-4222-8222-222222222222';
const admin: LegacySignalActor = { id: 'admin-1', tenantId: company, role: 'ADMIN', status: 'ACTIVE' };
const paidAt = '2026-10-24T14:12:49.000Z';
const lotAmounts = [...Array.from({ length: 119 }, () => 58974), 58948];

function request(patch: Partial<LegacySignalRequest> = {}): LegacySignalRequest {
  return {
    receivedCents: 150000,
    installments: [
      { dueDate: '2026-12-20', amountCents: 66667 },
      { dueDate: '2027-01-20', amountCents: 66667 },
      { dueDate: '2027-02-20', amountCents: 66666 },
    ],
    reason: 'Sinal antigo marcado integralmente, com saldo ainda pendente.',
    requestKey: 'regularizacao-teste-01',
    confirm: true,
    ...patch,
  };
}

function scenario(patch: Partial<LegacySignalState> = {}): LegacySignalState {
  const saleId = 'sale-ficticia';
  const receipts = [
    {
      id: 'receipt-signal-0',
      saleId,
      tenantId: company,
      companyId: company,
      customerId: 'customer-ficticio',
      projectId: 'project-ficticio',
      blockId: 'lot-ficticio',
      brokerId: 'broker-ficticio',
      contractId: 'contract-ficticio',
      installmentNumber: 0,
      dueDate: '2026-10-21',
      amountCents: 350000,
      paidAmountCents: 350000,
      paidAt,
      status: 'pago',
      scheduleGroup: null,
      financialAccountId: null,
    },
    ...lotAmounts.map((amountCents, index) => ({
      id: `lot-${index + 1}`,
      saleId,
      tenantId: company,
      companyId: company,
      customerId: 'customer-ficticio',
      projectId: 'project-ficticio',
      blockId: 'lot-ficticio',
      brokerId: null,
      contractId: 'contract-ficticio',
      installmentNumber: index + 1,
      dueDate: '2027-03-20',
      amountCents,
      paidAmountCents: null,
      paidAt: null,
      status: 'pendente',
      scheduleGroup: null,
      financialAccountId: null,
    })),
  ];
  return {
    sale: {
      id: saleId,
      tenantId: company,
      companyId: company,
      status: 'ACTIVE',
      signalScheduleMode: null,
      totalCents: 7076854,
      signalContractCents: 350000,
      signalPaidAtSaleCents: 150000,
      signalRemainingCents: 200000,
    },
    receipts,
    cash: [],
    bankCharges: [],
    asaasCharges: [],
    settlements: [],
    commissions: [{ id: 'commission-1', saleId, status: 'pendente' }],
    contracts: [{ id: 'contract-ficticio', saleId, version: 2 }],
    audits: [],
    ...patch,
  };
}

const parts = splitCentsEvenly(200000, 3);
assert(parts.join(',') === '66667,66667,66666', 'divisão do saldo');
assert(lotAmounts.reduce((sum, value) => sum + value, 0) === 7076854, 'lote fictício fecha 70768,54');

const initial = scenario();
const preview = previewLegacySignalRegularization(initial, admin, request({ confirm: false }));
assert(preview.ok && preview.code === 'preview', 'prévia válida');
assert(preview.before?.signalPaidCents === 350000 && preview.before.signalPendingCents === 0, 'prévia atual');
assert(preview.after?.signalPaidCents === 150000 && preview.after.signalPendingCents === 200000, 'prévia proposta');
assert(preview.after?.signalTotalCents === 350000 && preview.after.lotCents === 7076854 && preview.after.lotCount === 120, 'totais da prévia');
assert(preview.before?.cashCount === 0 && preview.after?.cashCount === 0, 'prévia sem caixa');
assert(JSON.stringify(initial) === JSON.stringify(scenario()), 'prévia não grava');

const withoutConfirm = executeLegacySignalRegularization(initial, admin, request({ confirm: false }));
assert(withoutConfirm.result.code === 'confirmation_required' && withoutConfirm.state === initial, 'confirmação obrigatória');

const applied = executeLegacySignalRegularization(initial, admin, request());
const next = applied.state;
const picture = financialPicture(next);
assert(applied.result.ok && applied.result.code === 'applied', 'aplicação');
assert(picture.originalReceiptId === 'receipt-signal-0', 'id original preservado');
assert(picture.originalAmountCents === 150000 && picture.originalPaidAt === paidAt, 'valor e data originais');
assert(picture.signalPaidCents === 150000 && picture.signalPendingCents === 200000, 'sinal depois');
assert(picture.signalTotalCents === 350000 && picture.lotCents === 7076854 && picture.lotCount === 120, 'totais depois');
assert(picture.cashCount === 0, 'sem caixa');
assert(next.contracts.length === 1 && next.contracts[0].version === 2, 'contrato preservado');
assert(next.commissions[0].status === 'pendente', 'comissão preservada');
assert(next.bankCharges.length === 0 && next.asaasCharges.length === 0, 'sem cobrança');
const signalRows = next.receipts.filter((row) => row.scheduleGroup === 'SIGNAL');
assert(signalRows.length === 4, 'sinal identificado');
assert(signalRows.filter((row) => row.installmentNumber > 0).every((row) => row.status === 'pendente'), 'saldo pendente');
const lotsBefore = initial.receipts.filter((row) => row.installmentNumber >= 1);
const lotsAfter = next.receipts.filter((row) => row.installmentNumber >= 1 && row.scheduleGroup !== 'SIGNAL');
assert(JSON.stringify(lotsBefore) === JSON.stringify(lotsAfter), 'parcelas do lote intactas');
assert(next.audits.length === 1 && next.audits[0].actorUserId === admin.id, 'auditoria');
assert(next.audits[0].before.originalAmountCents === 350000 && next.audits[0].after.signalPaidCents === 150000, 'auditoria antes e depois');
assert(next.audits[0].reason.includes('pendente'), 'motivo registrado');

const replay = executeLegacySignalRegularization(next, admin, request());
assert(replay.result.code === 'replayed' && replay.result.replayed, 'idempotência');
assert(replay.state.receipts.length === next.receipts.length && replay.state.audits.length === 1, 'replay não duplica');

const otherKey = executeLegacySignalRegularization(next, admin, request({ requestKey: 'regularizacao-teste-02' }));
assert(otherKey.result.code === 'already_regularized' && otherKey.state === next, 'segunda chave não grava');

const conflict = executeLegacySignalRegularization(next, admin, request({ reason: 'Outro motivo suficientemente descritivo.' }));
assert(conflict.result.code === 'idempotency_conflict' && conflict.state === next, 'mesma chave com outros valores');

for (const actor of [
  { ...admin, role: 'BROKER' },
  { ...admin, role: 'OWNER' },
  { ...admin, role: 'ADMIN', status: 'INACTIVE' },
  { ...admin, tenantId: otherCompany },
]) {
  const denied = executeLegacySignalRegularization(initial, actor, request());
  assert(denied.result.ok === false && denied.state === initial, `acesso negado para ${actor.role}`);
}
const outsider = previewLegacySignalRegularization(initial, { ...admin, tenantId: otherCompany }, request());
assert(outsider.code === 'wrong_company', 'isolamento entre empresas');

async function runConcurrentAndRollback() {
const gate = createLegacySignalGate(scenario());
const raced = await Promise.all(Array.from({ length: 8 }, (_, index) => (
  gate.execute(admin, request({ requestKey: `concorrencia-${index.toString().padStart(2, '0')}` }))
)));
assert(raced.filter((item) => item.code === 'applied').length === 1, 'uma execução concorrente');
assert(raced.filter((item) => item.code === 'already_regularized').length === 7, 'demais execuções reconhecem a primeira');
assert(gate.read().audits.length === 1, 'auditoria única sob concorrência');
assert(gate.read().receipts.filter((row) => row.scheduleGroup === 'SIGNAL').length === 4, 'sem parcela duplicada');

for (const step of ['after_update', 'after_insert', 'audit'] as const) {
  const snapshot = scenario();
  const frozen = JSON.stringify(snapshot);
  assertThrows(() => executeLegacySignalRegularization(snapshot, admin, request(), { failAt: step }), LegacySignalRollback);
  assert(JSON.stringify(snapshot) === frozen, `rollback em ${step}`);
  const guarded = createLegacySignalGate(scenario());
  const rolled = await guarded.execute(admin, request(), { failAt: step });
  assert(rolled.code === 'rolled_back' && guarded.read().audits.length === 0, `fila desfaz ${step}`);
  assert(guarded.read().receipts[0].amountCents === 350000, `parcela original intacta após ${step}`);
}
}

const cashState = scenario({
  cash: [{ id: 'cash-1', saleId: 'sale-ficticia', receiptId: 'receipt-signal-0', status: 'ativo', provider: 'SALE_CREATE', hasReceiptDocument: true }],
});
const cashBlocked = executeLegacySignalRegularization(cashState, admin, request());
assert(cashBlocked.result.code === 'blocked' && cashBlocked.result.blockers.includes('cash') && cashBlocked.result.blockers.includes('receipt'), 'bloqueia caixa e recibo');
const saleOnlyCash = scenario({
  cash: [{ id: 'cash-sale', saleId: 'sale-ficticia', status: 'ativo', hasReceiptDocument: false }],
});
const saleOnlyBlocked = executeLegacySignalRegularization(saleOnlyCash, admin, request({ requestKey: 'regularizacao-caixa-venda' }));
assert(saleOnlyBlocked.result.code === 'blocked' && saleOnlyBlocked.result.blockers.includes('cash') && !saleOnlyBlocked.result.blockers?.includes('receipt'), 'bloqueia lançamento da venda sem metadados e sem recibo');
const contractCash = scenario({
  cash: [{ id: 'cash-contract', contractId: 'contract-ficticio', status: 'ativo' }],
});
const contractBlocked = executeLegacySignalRegularization(contractCash, admin, request({ requestKey: 'regularizacao-caixa-contrato' }));
assert(contractBlocked.result.code === 'blocked' && contractBlocked.result.blockers.includes('cash'), 'bloqueia lançamento vinculado pelo contrato');
const otherCash = executeLegacySignalRegularization(scenario({
  cash: [{ id: 'cash-other', saleId: 'outra-venda', status: 'ativo' }],
}), admin, request({ requestKey: 'regularizacao-caixa-alheia' }));
assert(otherCash.result.ok && otherCash.result.code === 'applied', 'lançamento de outra venda não bloqueia');
assert(cashBlocked.state === cashState, 'bloqueio não grava');

const bankState = scenario({ bankCharges: [{ id: 'bank-1', receiptId: 'receipt-signal-0', status: 'REGISTERED' }] });
const bankBlocked = executeLegacySignalRegularization(bankState, admin, request());
assert(bankBlocked.result.blockers.includes('bank_charge') && bankBlocked.state === bankState, 'bloqueia cobrança bancária');

const separate = scenario();
separate.sale.signalScheduleMode = 'SEPARATE';
separate.receipts[0].scheduleGroup = 'SIGNAL';
separate.receipts[0].amountCents = 150000;
separate.receipts[0].paidAmountCents = 150000;
const separateResult = executeLegacySignalRegularization(separate, admin, request());
assert(separateResult.result.code === 'separate_schedule' && separateResult.state === separate, 'sinal novo permanece intacto');

const badSum = executeLegacySignalRegularization(initial, admin, request({
  installments: [{ dueDate: '2026-12-20', amountCents: 100 }],
}));
assert(badSum.result.code === 'invalid' && badSum.state === initial, 'soma inválida não grava');

const root = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261117120000_legacy_signal_regularization.sql'), 'utf8');
const server = fs.readFileSync(path.join(root, 'lib', 'finance', 'legacySignalRegularizationServer.ts'), 'utf8');
const executeRoute = fs.readFileSync(path.join(root, 'app', 'api', 'finance', 'legacy-signal-regularization', 'execute', 'route.ts'), 'utf8');
assert(sql.includes('pg_advisory_xact_lock'), 'trava de concorrência');
assert(sql.includes('confirmation_required') && executeRoute.includes('confirmation_required'), 'confirmação no servidor');
assert(sql.includes('wrong_company') && server.includes('wrong_company'), 'empresa conferida no servidor');
assert(sql.includes('GRANT EXECUTE ON FUNCTION public.execute_legacy_signal_regularization') && sql.includes('service_role'), 'RPC restrita');
assert(!/INSERT\s+INTO\s+public\.cash_movements/i.test(sql), 'não cria caixa');
assert(sql.includes('cm.sale_id = p_sale_id'), 'qualquer caixa da venda bloqueia');
assert(!sql.includes('SALE_CREATE'), 'o bloqueio não depende do provedor');
assert(sql.includes('createdInstallments') && sql.includes('originalScheduleGroup'), 'auditoria guarda o antes e as parcelas criadas');
assert(!/UPDATE\s+public\.contracts/i.test(sql), 'não altera contrato');
assert(!/UPDATE\s+public\.sales/i.test(sql), 'não altera a venda');
assert(!/UPDATE\s+public\.broker_commissions/i.test(sql), 'não altera comissão');
assert(!/DELETE\s+FROM\s+public\.finance_receipts/i.test(sql), 'não apaga recebimento');
assert(!/INSERT\s+INTO\s+public\.company_asaas_charges/i.test(sql), 'não emite cobrança Asaas');
assert(!/\binter\b|\bc6\b/i.test(sql), 'não chama Inter ou C6');
assert(!sql.includes('924b7332-1828-4309-881c-5a44cdc169c5'), 'não contém a venda real');
assert(server.indexOf('actor.tenantId !== saleTenant') < server.indexOf('finance_receipts'), 'isolamento antes das parcelas');

function assertThrows(run: () => unknown, expected: new (...args: never[]) => Error) {
  let thrown: unknown = null;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof expected, expected.name);
}

runConcurrentAndRollback().then(() => {
console.log(JSON.stringify({
  ok: true,
  before: preview.before,
  after: picture,
  audit: next.audits.length,
  signalRows: signalRows.map((row) => ({
    id: row.id,
    number: row.installmentNumber,
    cents: row.amountCents,
    status: row.status,
    group: row.scheduleGroup,
    paidAt: row.paidAt,
  })),
}, null, 2));
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
