/**
 * Indicadores do dashboard de Contratos — contagem assinados/pendentes.
 * npx tsx scripts/mandatory-sale-contract-dashboard-stats-tests.ts
 */

import {
  classifySaleContractForDashboard,
  computeSaleContractDashboardStats,
  isSaleContractFullySigned,
  resolveCanonicalSaleSignatureStatus,
  resolveContractSignatureState,
  saleContractDashboardPercent,
} from '../lib/saleContractDashboardStats';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testFullySignedBySignatureStatus() {
  assert(
    isSaleContractFullySigned({ status: 'ativo', signature_status: 'SIGNED' }),
    'SIGNED + ativo = assinado',
  );
  assert(
    !isSaleContractFullySigned({ status: 'ativo', signature_status: 'CLIENT_SIGNED' }),
    'CLIENT_SIGNED não é totalmente assinado',
  );
  assert(
    isSaleContractFullySigned({
      status: 'ativo',
      signature_status: 'CLIENT_SIGNED',
      process_signature_status: 'SIGNED',
    }),
    'processo SIGNED prevalece sobre espelho CLIENT_SIGNED',
  );
  console.log('OK testFullySignedBySignatureStatus');
}

function testFullySignedByContractStatus() {
  assert(
    isSaleContractFullySigned({ status: 'assinado', signature_status: null }),
    'status assinado',
  );
  assert(
    isSaleContractFullySigned({ status: 'signed', signature_status: 'PENDING' }),
    'status signed legado',
  );
  console.log('OK testFullySignedByContractStatus');
}

function testPendingContract() {
  assert(
    classifySaleContractForDashboard({ status: 'ativo', signature_status: 'PENDING' }) ===
      'pending',
    'enviado = pendente',
  );
  assert(
    classifySaleContractForDashboard({ status: 'ativo', signature_status: 'CLIENT_SIGNED' }) ===
      'pending',
    'aguardando vendedor = pendente',
  );
  assert(
    classifySaleContractForDashboard({ status: 'rascunho', signature_status: null }) ===
      'pending',
    'rascunho = pendente',
  );
  console.log('OK testPendingContract');
}

function testCancelledContract() {
  assert(
    classifySaleContractForDashboard({ status: 'cancelado', signature_status: 'SIGNED' }) ===
      'cancelled',
    'cancelado não entra em ativos',
  );
  console.log('OK testCancelledContract');
}

function testStatsConsistency() {
  const contracts = [
    { status: 'ativo', signature_status: 'SIGNED', sale_value_display: 95000 },
    { status: 'ativo', signature_status: 'SIGNED', sale_value_display: 120000 },
    { status: 'ativo', signature_status: 'CLIENT_SIGNED', sale_value_display: 80000 },
    { status: 'ativo', signature_status: 'PENDING', sale_value_display: 70000 },
    { status: 'ativo', signature_status: null, sale_value_display: 60000 },
    { status: 'cancelado', signature_status: null, sale_value_display: 50000 },
    { status: 'superseded', signature_status: 'SIGNED', sale_value_display: 99999 },
  ];

  const stats = computeSaleContractDashboardStats(contracts);
  assert(stats.assinados === 2, `assinados ${stats.assinados}`);
  assert(stats.pendentes === 3, `pendentes ${stats.pendentes}`);
  assert(stats.ativos === 5, `ativos ${stats.ativos}`);
  assert(stats.cancelados === 1, `cancelados ${stats.cancelados}`);
  assert(stats.assinados + stats.pendentes === stats.ativos, 'soma assinados+pendentes=ativos');
  assert(stats.valorTotal === 574999, `valor ${stats.valorTotal}`);
  console.log('OK testStatsConsistency');
}

function testPercentages() {
  assert(saleContractDashboardPercent(18, 42) === 42.86, 'pct assinados');
  assert(saleContractDashboardPercent(24, 42) === 57.14, 'pct pendentes');
  assert(saleContractDashboardPercent(0, 42) === 0, 'zero');
  console.log('OK testPercentages');
}

function testListAndDashboardSameRule() {
  const contract = { status: 'ativo', signature_status: 'SIGNED' as const };
  const uiSigned =
    String(contract.signature_status || '').toUpperCase() === 'SIGNED' ||
    ['assinado', 'signed'].includes(String(contract.status || '').toLowerCase());
  assert(uiSigned === isSaleContractFullySigned(contract), 'lista e dashboard alinhados');
  const stats = computeSaleContractDashboardStats([contract]);
  assert(stats.assinados === 1 && stats.pendentes === 0, 'contado como assinado');
  console.log('OK testListAndDashboardSameRule');
}

function testResolveContractSignatureState() {
  assert(
    resolveContractSignatureState({
      contract: { status: 'ativo', signature_status: 'SIGNED' },
    }) === 'SIGNED',
    'ativo+SIGNED',
  );
  assert(
    resolveContractSignatureState({
      contract: { status: 'ativo', signature_status: 'CLIENT_SIGNED' },
    }) === 'PENDING',
    'incompleto',
  );
  assert(
    resolveContractSignatureState({ contract: { status: 'cancelado' } }) === 'CANCELLED',
    'cancelado',
  );
  assert(resolveContractSignatureState({ contract: null }) === 'NOT_GENERATED', 'sem contrato');
  assert(
    resolveContractSignatureState({ contractsAvailable: false }) === 'UNAVAILABLE',
    'indisponível',
  );
  console.log('OK testResolveContractSignatureState');
}

function testHomologCountersEtapa91() {
  // 2 SIGNED => Assinados 2 / Pendentes 0
  const twoSigned = computeSaleContractDashboardStats([
    {
      status: 'ativo',
      signature_status: 'CLIENT_SIGNED',
      process_signature_status: 'SIGNED',
      sale_value_display: 100,
    },
    {
      status: 'ativo',
      signature_status: null,
      process_signature_status: 'SIGNED',
      sale_value_display: 200,
    },
  ]);
  assert(twoSigned.assinados === 2, `2 signed → assinados ${twoSigned.assinados}`);
  assert(twoSigned.pendentes === 0, `2 signed → pendentes ${twoSigned.pendentes}`);
  assert(twoSigned.ativos === 2, '2 signed → ativos 2');

  // 1 SIGNED + 1 pendente => Assinados 1 / Pendentes 1
  const mixed = computeSaleContractDashboardStats([
    {
      status: 'ativo',
      signature_status: 'PENDING',
      process_signature_status: 'SIGNED',
      sale_value_display: 100,
    },
    {
      status: 'ativo',
      signature_status: 'CLIENT_SIGNED',
      process_signature_status: 'PARTIALLY_SIGNED',
      sale_value_display: 200,
    },
  ]);
  assert(mixed.assinados === 1, `mixed → assinados ${mixed.assinados}`);
  assert(mixed.pendentes === 1, `mixed → pendentes ${mixed.pendentes}`);

  // cancelado não contado como assinado/pendente
  const withCancel = computeSaleContractDashboardStats([
    {
      status: 'cancelado',
      signature_status: 'SIGNED',
      process_signature_status: 'SIGNED',
      sale_value_display: 999,
    },
    {
      status: 'ativo',
      signature_status: 'PENDING',
      process_signature_status: 'SIGNED',
      sale_value_display: 50,
    },
  ]);
  assert(withCancel.cancelados === 1, 'cancelado contado');
  assert(withCancel.assinados === 1, 'cancelado não entra em assinados');
  assert(withCancel.pendentes === 0, 'cancelado não entra em pendentes');
  assert(withCancel.ativos === 1, 'ativos só o não-cancelado');

  assert(
    resolveCanonicalSaleSignatureStatus({
      signature_status: 'CLIENT_SIGNED',
      process_signature_status: 'SIGNED',
    }) === 'SIGNED',
    'canônico preferência processo SIGNED',
  );

  console.log('OK testHomologCountersEtapa91');
}

function main() {
  testFullySignedBySignatureStatus();
  testFullySignedByContractStatus();
  testPendingContract();
  testCancelledContract();
  testStatsConsistency();
  testPercentages();
  testListAndDashboardSameRule();
  testResolveContractSignatureState();
  testHomologCountersEtapa91();
  console.log('mandatory-sale-contract-dashboard-stats-tests: all passed');
}

main();
