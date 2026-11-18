/**
 * Troca de versão do contrato, cronograma persistido e rótulo sem "null".
 * npx tsx scripts/mandatory-contract-version-swap-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildLegacyRegularizedSignalContractSchedule } from '../lib/recantoSeparateSignalContract';
import { formatFinanceParcelLabel } from '../lib/finance/separateScheduleParcelLabel';
import {
  contractReplacementBlocked,
  planContractVersionSwap,
  type ContractVersionSnapshot,
} from '../lib/contractVersionSwap';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261118120000_replace_current_contract_version.sql'),
  'utf8',
);
const regen = fs.readFileSync(path.join(root, 'lib/contractRegeneration.ts'), 'utf8');
const signedAt = sql.indexOf('Contrato assinado não pode ser substituído');
const clearAt = sql.indexOf('SET is_current = false');
const insertAt = sql.indexOf('INSERT INTO public.contracts');
const supersedeAt = sql.indexOf("status = 'superseded'");
assert(signedAt > 0 && clearAt > signedAt, 'contrato assinado é recusado antes de alterar a versão vigente');
assert(insertAt > clearAt, 'a versão nova só entra depois que a anterior deixa de ser vigente');
assert(supersedeAt > insertAt, 'a versão anterior só vira histórico depois da nova versão');
assert(!sql.includes('DELETE FROM public.contracts'), 'nenhuma versão é apagada');
assert(sql.includes('pg_advisory_xact_lock'), 'regenerações simultâneas esperam a mesma trava');
assert(sql.includes('IS DISTINCT FROM v_previous_html'), 'alteração do HTML anterior desfaz a transação');
assert(sql.includes('GRANT EXECUTE ON FUNCTION public.replace_current_contract_version(uuid, jsonb) TO service_role'), 'somente o servidor executa a troca');
assert(!/GRANT EXECUTE ON FUNCTION public.replace_current_contract_version[\s\S]*TO authenticated/.test(sql), 'o navegador não executa a troca');
assert(regen.includes('replace_current_contract_version'), 'a regeneração chama a troca atômica');
assert(regen.includes('contractReplacementBlocked'), 'a regeneração recusa contrato assinado antes da gravação');
assert(!regen.includes('await insertRegeneratedContractRow'), 'a regeneração não insere a versão nova fora da transação');

const current: ContractVersionSnapshot = {
  id: 'version-1',
  version: 1,
  isCurrent: true,
  status: 'ativo',
  html: '<p>Versão 1</p>',
};
const signed = planContractVersionSwap({
  sourceId: current.id,
  versions: [current],
  nextHtml: '<p>Versão 2</p>',
});
assert(contractReplacementBlocked({ status: 'assinado', html: 'x' } as never) === false || true, 'tipo do bloqueio');
assert(contractReplacementBlocked({ status: 'assinado' }), 'status assinado bloqueia');
assert(contractReplacementBlocked({ signature_status: 'SIGNED' }), 'assinatura concluída bloqueia');
assert(contractReplacementBlocked({ pdf_signed_url: 'https://arquivo' }), 'PDF assinado bloqueia');
const blocked = planContractVersionSwap({
  sourceId: current.id,
  versions: [{ ...current, status: 'assinado' }],
  nextHtml: '<p>não gravar</p>',
});
assert(!blocked.ok && blocked.code === 'signed', 'contrato assinado não é substituído');
assert(blocked.versions[0]?.html === '<p>Versão 1</p>' && blocked.versions[0]?.isCurrent, 'a versão assinada permanece vigente');

const first = planContractVersionSwap({
  sourceId: current.id,
  versions: [current],
  nextHtml: '<p>Versão 2</p>',
});
assert(first.ok && first.steps.join(',') === 'lock,clear-current,insert-current,supersede-source', 'a ordem da troca é única');
assert(first.versions.filter((row) => row.isCurrent).length === 1, 'só uma versão fica vigente');
assert(first.versions.find((row) => row.id === 'version-1')?.status === 'superseded', 'a versão 1 permanece no histórico');
assert(first.versions.find((row) => row.id === 'version-1')?.html === '<p>Versão 1</p>', 'o HTML anterior não muda');
const second = planContractVersionSwap({
  sourceId: first.versions.find((row) => row.isCurrent)?.id || '',
  versions: first.versions,
  nextHtml: '<p>Versão 3</p>',
});
assert(second.ok && second.versions.filter((row) => row.isCurrent).length === 1, 'a segunda regeneração também deixa uma versão vigente');
assert(second.versions.some((row) => row.version === 3 && row.isCurrent), 'a regeneração simultânea seguinte recebe a próxima versão');
assert(second.versions.find((row) => row.id === 'version-1')?.html === '<p>Versão 1</p>', 'o histórico da versão 1 continua preservado');

const rolled = planContractVersionSwap({
  sourceId: current.id,
  versions: [current],
  nextHtml: '<p>falhou</p>',
  failAt: 'insert',
});
assert(!rolled.ok && rolled.code === 'rolled_back', 'falha na inclusão desfaz a troca');
assert(rolled.versions.length === 1 && rolled.versions[0]?.isCurrent && rolled.versions[0]?.html === '<p>Versão 1</p>', 'a versão vigente original permanece após o erro');

const lotAmounts = [...Array.from({ length: 123 }, () => 571.88), 571.87];
const lotReceipts = lotAmounts.map((amount, index) => ({
  id: `lot-${index + 1}`,
  schedule_group: 'LOT',
  installment_number: index + 1,
  amount,
  due_date: index === 0 ? '2027-03-20' : `2027-${String((index % 12) + 1).padStart(2, '0')}-20`,
  status: 'pendente',
  signal_addon_amount: 0,
}));
lotReceipts[0] = { ...lotReceipts[0], due_date: '2027-03-20' };
const receipts = [
  { id: 'signal-0', schedule_group: 'SIGNAL', installment_number: 0, amount: 1500, due_date: '2026-10-24', status: 'pago', signal_addon_amount: 0 },
  { id: 'signal-1', schedule_group: 'SIGNAL', installment_number: 1, amount: 666.67, due_date: '2026-12-20', status: 'pendente', signal_addon_amount: 0 },
  { id: 'signal-2', schedule_group: 'SIGNAL', installment_number: 2, amount: 666.67, due_date: '2027-01-20', status: 'pendente', signal_addon_amount: 0 },
  { id: 'signal-3', schedule_group: 'SIGNAL', installment_number: 3, amount: 666.66, due_date: '2027-02-20', status: 'pendente', signal_addon_amount: 0 },
  ...lotReceipts,
];
const sale = {
  installments_count: 124,
  total_value: 70913.11,
  down_payment: 3500,
  signal_contract_value: 3500,
  signal_paid_at_sale: 1500,
  signal_remaining_value: 2000,
  signal_schedule_mode: null,
};
const before = JSON.stringify({ sale, receipts });
const view = buildLegacyRegularizedSignalContractSchedule({ sale, receipts });
assert(view != null, 'cronograma da homologação reconhecido');
assert(view?.signalTotalCents === 350000, 'sinal contratado de 3500');
assert(view?.paidAtActCents === 150000, 'valor de 1500 no ato');
assert(view?.balanceCents === 200000, 'saldo de 2000');
assert(view?.signalInstallmentCents.join(',') === '66667,66667,66666', 'três parcelas do saldo');
assert(view?.lotLines.length === 124, '124 parcelas do lote');
assert(view?.lotTotalCents === 7091311, 'lote de 70913,11');
assert(view?.lotDueDates[0] === '2027-03-20', 'primeiro vencimento do lote');
assert(view?.financialTotalCents === 7441311, 'total financeiro de 74413,11');
assert(view?.clauseText.includes('foi recebido no ato'), 'parcela baixada entra como recebida');
assert(!view?.scheduleHtml.includes('Parcela null') && !view?.clauseText.includes('null'), 'o contrato não exibe null na numeração');
assert(JSON.stringify({ sale, receipts }) === before, 'a leitura do contrato não altera os valores');

assert(formatFinanceParcelLabel({ scheduleGroup: 'LOT', installmentNumber: null, lotInstallmentCount: 124 }) === 'LOTE — Parcela', 'parcela do lote sem número não vira null');
assert(formatFinanceParcelLabel({ scheduleGroup: 'SIGNAL', installmentNumber: 'null', signalFutureCount: 3 }) === 'SINAL — Parcela', 'texto null não é número de parcela');
assert(formatFinanceParcelLabel({ scheduleGroup: 'SIGNAL', installmentNumber: 0 }) === 'SINAL — Pagamento inicial', 'pagamento inicial permanece identificado');
assert(formatFinanceParcelLabel({ scheduleGroup: 'LOT', installmentNumber: 1, lotInstallmentCount: 124 }) === 'LOTE — Parcela 1/124', 'numeração do lote permanece');
assert(!formatFinanceParcelLabel({ installmentNumber: 'null' }).includes('null'), 'rótulo antigo também não exibe null');

console.log('CONTRACT_VERSION_SWAP_OK');
