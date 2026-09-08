/**
 * Regressão — leitura da aba Parcelas / Dados do Contrato.
 * npx tsx scripts/mandatory-contract-receipts-display-tests.ts
 */
import fs from 'node:fs';
import {
  CONTRACT_FINANCE_RECEIPTS_SELECT,
  formatContractReceiptInstallmentLabel,
  formatPaidAmountDisplay,
  resolveContractInstallmentAmountDisplay,
  resolveContractInstallmentsCount,
  resolveContractReceiptDisplayStatus,
} from '../lib/contractReceiptsDisplay';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testSelectUsesRealColumnsOnly() {
  const select = CONTRACT_FINANCE_RECEIPTS_SELECT;
  assert(select.includes('paid_amount'), 'select tem paid_amount');
  assert(select.includes('paid_at'), 'select tem paid_at');
  assert(select.includes('sale_id'), 'select tem sale_id');
  assert(select.includes('installment_number'), 'select tem installment_number');
  assert(!select.includes('payment_date'), 'select sem payment_date');
  assert(!select.includes('description'), 'select sem description');
  assert(!select.includes('amount_paid'), 'select sem amount_paid');
  assert(!select.includes('contract_id'), 'select sem contract_id');
  console.log('OK testSelectUsesRealColumnsOnly');
}

function testInstallmentLabels() {
  assert(formatContractReceiptInstallmentLabel(-1) === 'Sinal/Reserva', 'sinal');
  assert(formatContractReceiptInstallmentLabel(0) === 'Entrada', 'entrada 0');
  assert(formatContractReceiptInstallmentLabel('0') === 'Entrada', 'entrada string 0');
  assert(formatContractReceiptInstallmentLabel(1) === '1', 'parcela 1');
  assert(formatContractReceiptInstallmentLabel(4) === '4', 'parcela 4');
  assert(formatContractReceiptInstallmentLabel(null) === '-', 'nulo');
  console.log('OK testInstallmentLabels');
}

function testStatusUsesCanonicalValues() {
  assert(resolveContractReceiptDisplayStatus('pago').key === 'pago', 'pago');
  assert(resolveContractReceiptDisplayStatus('pendente').key === 'pendente', 'pendente');
  assert(
    resolveContractReceiptDisplayStatus('pendente', '2020-01-01', '2026-09-08').key ===
      'atrasado',
    'pendente vencido vira atrasado só na UI',
  );
  assert(
    resolveContractReceiptDisplayStatus('pendente', '2099-01-01', '2026-09-08').key ===
      'pendente',
    'pendente futuro permanece pendente',
  );
  assert(resolveContractReceiptDisplayStatus('cancelado').key === 'cancelado', 'cancelado');
  assert(resolveContractReceiptDisplayStatus('paid').label === 'Pago', 'legado paid');
  console.log('OK testStatusUsesCanonicalValues');
}

function testDadosDoContratoFields() {
  assert(resolveContractInstallmentsCount({ installments_count: 4 }) === 4, 'count 4');
  assert(
    resolveContractInstallmentsCount({ installments_count: 1 }) === 1,
    'à vista count 1',
  );
  assert(resolveContractInstallmentsCount({}) == null, 'sem count');
  assert(
    resolveContractInstallmentAmountDisplay({ regular_installment_amount: 5 }, []) === 5,
    'regular_installment_amount',
  );
  assert(
    resolveContractInstallmentAmountDisplay({ regular_installment_amount: 0 }, [
      { installment_number: 0, amount: 5 },
      { installment_number: 1, amount: 5 },
    ]) === 5,
    'deriva de parcela >= 1, ignora entrada',
  );
  assert(
    resolveContractInstallmentAmountDisplay({ installment_value: 99 } as never, [
      { installment_number: 0, amount: 5 },
    ]) == null,
    'não usa installment_value órfão',
  );
  assert(formatPaidAmountDisplay(5) === 5, 'paid_amount');
  assert(formatPaidAmountDisplay(0) == null, 'paid_amount 0');
  console.log('OK testDadosDoContratoFields');
}

function testContractsPageDoesNotUseLegacyFields() {
  const page = fs.readFileSync('app/contracts/page.tsx', 'utf8');

  assert(page.includes('CONTRACT_FINANCE_RECEIPTS_SELECT'), 'page usa select canônico');
  assert(page.includes('.eq("sale_id"'), 'filtra por sale_id');
  assert(page.includes('receiptsLoadError'), 'erro de parcelas exposto');
  assert(
    page.includes('Nenhuma parcela encontrada para este contrato.'),
    'empty state permanece',
  );
  assert(page.includes('resolveContractInstallmentsCount'), 'Dados usa installments_count');
  assert(
    page.includes('resolveContractInstallmentAmountDisplay'),
    'Dados deriva valor da parcela',
  );
  assert(page.includes('paid_amount'), 'UI lê paid_amount');
  assert(page.includes('paid_at'), 'UI lê paid_at');
  assert(page.includes('formatContractReceiptInstallmentLabel'), 'rótulo de parcela');

  assert(!page.includes('payment_date'), 'page sem payment_date');
  assert(!page.includes('amount_paid'), 'page sem amount_paid');
  assert(!page.includes('sales?.installments ||'), 'page sem sales.installments');
  assert(!page.includes('sales?.installment_value'), 'page sem installment_value');
  assert(
    !page.includes('installment_number || idx'),
    'entrada 0 não some com || idx+1',
  );

  const fetchBlock = page.slice(
    page.indexOf('const fetchReceipts'),
    page.indexOf('loadVersions'),
  );
  assert(fetchBlock.includes('if (error)'), 'fetch trata error');
  assert(fetchBlock.includes('setReceiptsLoadError'), 'erro não vira lista vazia silenciosa');
  assert(!fetchBlock.includes('contract_id'), 'fetch sem contract_id');
  console.log('OK testContractsPageDoesNotUseLegacyFields');
}

function testCarneUnchangedSelectStar() {
  const page = fs.readFileSync('app/contracts/page.tsx', 'utf8');
  const carne = page.slice(
    page.indexOf('const handleGerarCarne'),
    page.indexOf('const openRegenerateModal'),
  );
  assert(carne.includes('.select("*")'), 'carnê continua select *');
  assert(carne.includes('.eq("sale_id"'), 'carnê continua por sale_id');
  console.log('OK testCarneUnchangedSelectStar');
}

function run() {
  testSelectUsesRealColumnsOnly();
  testInstallmentLabels();
  testStatusUsesCanonicalValues();
  testDadosDoContratoFields();
  testContractsPageDoesNotUseLegacyFields();
  testCarneUnchangedSelectStar();
  console.log('OK — mandatory-contract-receipts-display-tests passed');
}

run();
