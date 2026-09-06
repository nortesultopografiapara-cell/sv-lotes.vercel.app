/**
 * Liberar lote e encerrar venda — testes obrigatórios (helpers + wiring).
 * npx tsx scripts/mandatory-release-lot-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildReleaseLotIdempotencyKey,
  classifyAsaasChargeForRelease,
  classifyFinanceReceiptForRelease,
  classifyInterBankChargeForRelease,
  classifyRemoteAsaasStatusForRelease,
  classifyRemoteInterSituacaoForRelease,
  isActiveUnpaidFinanceReceipt,
  isAsaasRemoteCancelableStatus,
  isCanceledSaleStatus,
  isDeferredSaleOperation,
  isLocalAsaasCancelCandidateStatus,
  isLocalInterCancelCandidateStatus,
  isLotReleaseSaleOperation,
  isOperationalFinanceReceiptForListing,
  isPaidFinanceReceiptStatus,
  isSoldOrReservedLotStatus,
  canConfirmReleaseLot,
  RELEASE_LOT_MOTIVE_GROUPS,
  RELEASE_LOT_MOTIVE_OPTIONS,
  SALE_OPERATION_UI_GROUPS,
  SALE_OPERATION_UI_OPTIONS,
  saleOperationUiOption,
  showsTerminationSettlement,
  resolveBlockLotLabel,
  resolveBlockQuadraLabel,
  summarizeReleaseCharges,
  summarizeReleaseInterCharges,
  summarizeReleaseReceipts,
  validateReleaseLotMotive,
} from '../lib/finance/releaseLotShared';
import {
  asaasBlockedReleaseFooterMessage,
  buildReleaseLotConfirmFooterNotices,
  computeReleaseLotConfirmEnabled,
  interBlockedReleaseFooterMessage,
  passwordStateFromInputValue,
  REFUND_FIRST_DUE_DATE_REQUIRED_MESSAGE,
} from '../lib/finance/releaseLotConfirmUx';
import {
  IMPROVEMENTS_APPRAISAL_REQUIRED_MESSAGE,
  IMPROVEMENTS_CREDIT_NOT_ALLOWED_MESSAGE,
  validateImprovementsForRelease,
} from '../lib/contract-termination/improvements';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/homolog/env';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function testMotiveValidation() {
  assert(validateReleaseLotMotive({ motiveCode: '' }).ok === false, 'motivo vazio');
  assert(validateReleaseLotMotive({ motiveCode: 'distrato' }).ok === false, 'distrato exige justificativa');
  assert(
    validateReleaseLotMotive({
      motiveCode: 'distrato',
      motiveDetail: 'acordo entre as partes',
    }).ok === true,
    'distrato com justificativa',
  );
  assert(
    validateReleaseLotMotive({ motiveCode: 'inadimplencia' }).ok === false,
    'inadimplência exige justificativa',
  );
  assert(
    validateReleaseLotMotive({
      motiveCode: 'inadimplencia',
      motiveDetail: 'parcelas vencidas sem regularização',
    }).ok === true,
    'inadimplência com justificativa',
  );
  const outro = validateReleaseLotMotive({ motiveCode: 'outro', motiveDetail: 'ab' });
  assert(outro.ok === false, 'outro curto');
  const outroOk = validateReleaseLotMotive({
    motiveCode: 'outro',
    motiveDetail: 'Troca administrativa',
  });
  assert(outroOk.ok === true, 'outro ok');
  const adminShort = validateReleaseLotMotive({
    motiveCode: 'cancelamento_administrativo',
    motiveDetail: 'ab',
  });
  assert(adminShort.ok === false, 'admin sem justificativa');
  const adminOk = validateReleaseLotMotive({
    motiveCode: 'cancelamento_administrativo',
    motiveDetail: 'Ajuste interno da loteadora',
  });
  assert(adminOk.ok === true, 'admin com justificativa');
  assert(RELEASE_LOT_MOTIVE_OPTIONS.length >= 7, 'opções de motivo');
  assert(
    RELEASE_LOT_MOTIVE_OPTIONS.some((o) => o.value === 'outro'),
    'backend ainda aceita outro',
  );
  const grouped = SALE_OPERATION_UI_GROUPS.flatMap((g) => g.codes);
  assert(
    grouped.join(',') ===
      'desistencia,distrato,inadimplencia,troca_lote,transferencia_titularidade',
    'painel visual oferece 5 operações (sem Outro, Erro de cadastro e Cancelamento administrativo)',
  );
  assert(!grouped.includes('erro_cadastro'), 'erro_cadastro fora da oferta visual');
  assert(
    !grouped.includes('cancelamento_administrativo'),
    'cancelamento_administrativo fora da oferta visual',
  );
  assert(
    validateReleaseLotMotive({ motiveCode: 'erro_cadastro' }).ok === true,
    'backend ainda aceita erro_cadastro legado',
  );
  assert(
    saleOperationUiOption('erro_cadastro')?.label === 'Erro de cadastro',
    'label legado de erro de cadastro continua legível',
  );
  assert(
    validateReleaseLotMotive({
      motiveCode: 'cancelamento_administrativo',
      motiveDetail: 'Ajuste interno da loteadora',
    }).ok === true,
    'backend ainda aceita cancelamento_administrativo legado',
  );
  assert(
    saleOperationUiOption('cancelamento_administrativo')?.label ===
      'Cancelamento administrativo',
    'label legado de cancelamento administrativo continua legível',
  );
  assert(RELEASE_LOT_MOTIVE_GROUPS === SALE_OPERATION_UI_GROUPS, 'alias visual');
  console.log('OK testMotiveValidation');
}

function testReceiptClassification() {
  assert(isPaidFinanceReceiptStatus({ status: 'pago' }), 'pago');
  assert(isPaidFinanceReceiptStatus({ status: 'paid' }), 'paid');
  assert(isPaidFinanceReceiptStatus({ status: 'pendente', paid_at: '2026-01-01' }), 'paid_at');
  assert(!isPaidFinanceReceiptStatus({ status: 'pendente' }), 'pendente not paid');
  assert(classifyFinanceReceiptForRelease({ status: 'atrasado' }) === 'overdue', 'atrasado');
  assert(classifyFinanceReceiptForRelease({ status: 'cancelado' }) === 'canceled', 'cancelado');
  assert(isActiveUnpaidFinanceReceipt({ status: 'pendente' }), 'active unpaid');
  assert(!isActiveUnpaidFinanceReceipt({ status: 'pago' }), 'paid not unpaid');
  assert(!isActiveUnpaidFinanceReceipt({ status: 'cancelado' }), 'canceled not unpaid');

  const summary = summarizeReleaseReceipts([
    { status: 'pago', amount: 1000, paid_at: '2026-01-10' },
    { status: 'pago', amount: 500.555, paid_at: '2026-02-01' },
    { status: 'pendente', amount: 200 },
    { status: 'atrasado', amount: 300 },
    { status: 'cancelado', amount: 50 },
    { status: 'erro', amount: 10 },
  ]);
  assert(summary.paidReceipts === 2, '2 pagas');
  assert(summary.pendingReceipts === 1, '1 pendente');
  assert(summary.overdueReceipts === 1, '1 atrasada');
  assert(summary.otherUnpaidReceipts === 1, '1 other unpaid');
  assert(summary.unpaidToCancel === 3, '3 a cancelar');
  assert(summary.hasPreservedPayments === true, 'has preserved');
  assert(summary.totalPaidAmount === 1500.56, `total pago=${summary.totalPaidAmount}`);
  assert(summary.lastPaidAt === '2026-02-01', 'last paid');
  console.log('OK testReceiptClassification');
}

function testAsaasClassification() {
  assert(classifyAsaasChargeForRelease('PENDING') === 'open', 'PENDING');
  assert(classifyAsaasChargeForRelease('OVERDUE') === 'open', 'OVERDUE');
  // REGISTERED local ≠ cancelável: exige sync remoto (não entra na contagem "aberta")
  assert(classifyAsaasChargeForRelease('REGISTERED') === 'other', 'REGISTERED other');
  assert(classifyAsaasChargeForRelease('PAID') === 'paid', 'PAID');
  assert(classifyAsaasChargeForRelease('RECEIVED') === 'paid', 'RECEIVED');
  assert(classifyAsaasChargeForRelease('CONFIRMED') === 'paid', 'CONFIRMED');
  assert(classifyAsaasChargeForRelease('CANCELLED') === 'cancelled', 'CANCELLED');
  assert(classifyAsaasChargeForRelease('REFUNDED') === 'refunded', 'REFUNDED');
  assert(isLocalAsaasCancelCandidateStatus('REGISTERED'), 'REGISTERED é candidata a sync');
  assert(isLocalAsaasCancelCandidateStatus('PENDING'), 'PENDING candidata');
  assert(!isLocalAsaasCancelCandidateStatus('PAID'), 'PAID não candidata');
  assert(isAsaasRemoteCancelableStatus('PENDING'), 'remoto PENDING cancelável');
  assert(isAsaasRemoteCancelableStatus('OVERDUE'), 'remoto OVERDUE cancelável');
  assert(!isAsaasRemoteCancelableStatus('RECEIVED'), 'RECEIVED não cancelável');
  assert(!isAsaasRemoteCancelableStatus('REGISTERED'), 'REGISTERED remoto não DELETE');

  assert(classifyRemoteAsaasStatusForRelease('PENDING') === 'cancel', 'disp PENDING');
  assert(classifyRemoteAsaasStatusForRelease('OVERDUE') === 'cancel', 'disp OVERDUE');
  assert(classifyRemoteAsaasStatusForRelease('RECEIVED') === 'preserve_paid', 'disp RECEIVED');
  assert(classifyRemoteAsaasStatusForRelease('CONFIRMED') === 'preserve_paid', 'disp CONFIRMED');
  assert(classifyRemoteAsaasStatusForRelease('REFUNDED') === 'preserve_refunded', 'disp REFUNDED');
  assert(classifyRemoteAsaasStatusForRelease('DELETED') === 'already_cancelled', 'disp DELETED');
  assert(classifyRemoteAsaasStatusForRelease('CANCELLED') === 'already_cancelled', 'disp CANCELLED');
  assert(
    classifyRemoteAsaasStatusForRelease('AWAITING_RISK_ANALYSIS') === 'block_non_removable',
    'disp outros bloqueia',
  );

  const s = summarizeReleaseCharges([
    { status: 'PENDING' },
    { status: 'OVERDUE' },
    { status: 'REGISTERED' },
    { status: 'PAID' },
    { status: 'CANCELLED' },
  ]);
  assert(s.openAsaasCharges === 2, '2 open canceláveis locais (sem REGISTERED)');
  assert(s.paidAsaasCharges === 1, '1 paid');
  assert(s.alreadyCanceledAsaasCharges === 1, '1 cancelled');
  console.log('OK testAsaasClassification');
}

function testInterClassification() {
  assert(classifyInterBankChargeForRelease('REGISTERED') === 'open', 'REGISTERED open Inter');
  assert(classifyInterBankChargeForRelease('PENDING') === 'open', 'PENDING open Inter');
  assert(classifyInterBankChargeForRelease('OVERDUE') === 'open', 'OVERDUE open Inter');
  assert(classifyInterBankChargeForRelease('PAID') === 'paid', 'PAID Inter');
  assert(classifyInterBankChargeForRelease('CANCELLED') === 'cancelled', 'CANCELLED Inter');
  assert(isLocalInterCancelCandidateStatus('REGISTERED'), 'REGISTERED candidata Inter');
  assert(!isLocalInterCancelCandidateStatus('PAID'), 'PAID não candidata Inter');
  assert(classifyRemoteInterSituacaoForRelease('A_RECEBER') === 'cancel', 'A_RECEBER cancel');
  assert(classifyRemoteInterSituacaoForRelease('ATRASADO') === 'cancel', 'ATRASADO cancel');
  assert(classifyRemoteInterSituacaoForRelease('EM_PROCESSAMENTO') === 'cancel', 'EM_PROCESSAMENTO');
  assert(classifyRemoteInterSituacaoForRelease('RECEBIDO') === 'preserve_paid', 'RECEBIDO preserve');
  assert(classifyRemoteInterSituacaoForRelease('CANCELADO') === 'already_cancelled', 'CANCELADO');
  assert(
    classifyRemoteInterSituacaoForRelease('DESCONHECIDO') === 'block_non_removable',
    'desconhecido bloqueia',
  );
  const s = summarizeReleaseInterCharges([
    { status: 'REGISTERED' },
    { status: 'PENDING' },
    { status: 'PAID' },
    { status: 'CANCELLED' },
  ]);
  assert(s.openInterCharges === 2, '2 open Inter');
  assert(s.paidInterCharges === 1, '1 paid Inter');
  assert(s.alreadyCanceledInterCharges === 1, '1 cancelled Inter');
  console.log('OK testInterClassification');
}

function testSaleAndLotStatusHelpers() {
  assert(isCanceledSaleStatus('CANCELLED'), 'CANCELLED');
  assert(isCanceledSaleStatus('cancelada'), 'cancelada');
  assert(!isCanceledSaleStatus('ACTIVE'), 'ACTIVE not canceled');
  assert(isSoldOrReservedLotStatus('Vendido'), 'Vendido');
  assert(isSoldOrReservedLotStatus('Reservado'), 'Reservado');
  assert(!isSoldOrReservedLotStatus('Disponível'), 'Disponível');
  assert(
    buildReleaseLotIdempotencyKey('lot-1', 'sale-1') === 'release-lot:lot-1:sale-1',
    'idempotency key',
  );
  console.log('OK testSaleAndLotStatusHelpers');
}

function testBlocksColumnMapping() {
  assert(
    resolveBlockQuadraLabel({ block_name: '12', name: 'Ignorado' }) === '12',
    'quadra via block_name',
  );
  assert(
    resolveBlockQuadraLabel({ block_name: null, name: 'A' }) === 'A',
    'quadra via name',
  );
  assert(resolveBlockLotLabel({ number: '05', lot_number: '99' }) === '05', 'lote via number');
  assert(
    resolveBlockLotLabel({ number: null, lot_number: '26' }) === '26',
    'lote via lot_number',
  );

  const svc = read('lib/finance/releaseLotService.ts');
  // SELECT principal: nunca incluir a coluna inexistente `block`
  assert(
    svc.includes(
      "'id, status, price, customer_id, sale_id, contract_id, broker_id, project_id, tenant_id, company_id, block_name, name, number, lot_number'",
    ),
    'select usa block_name/name/number/lot_number',
  );
  assert(!svc.includes(', block, number'), 'não seleciona coluna block');
  assert(!svc.includes('company_id, block,'), 'não seleciona block após company_id');
  assert(svc.includes('resolveBlockQuadraLabel'), 'mapeia quadra');
  assert(svc.includes('resolveBlockLotLabel'), 'mapeia lote');
  assert(svc.includes('LOT_CONTEXT_LOAD_FAILED'), 'código LOT_CONTEXT_LOAD_FAILED');
  assert(svc.includes("'load_lot'"), 'stage load_lot');
  assert(
    svc.includes('Não foi possível carregar os dados do lote.'),
    'mensagem amigável sem SQL',
  );
  // Sem fallback que tenta primeiro a query inválida com `block`
  assert(!svc.includes("'id, status, price, customer_id, sale_id, contract_id, broker_id, project_id, tenant_id, block, number'"), 'sem fallback com coluna block');
  console.log('OK testBlocksColumnMapping');
}

function testServiceOrchestrationSource() {
  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('cancelCompanyCharge'), 'cancela Asaas via serviço oficial');
  assert(svc.includes('getCompanyChargeStatus'), 'consulta status Asaas antes de cancelar');
  assert(svc.includes('resolveAsaasChargesForRelease'), 'resolve com sync remoto');
  assert(svc.includes('classifyRemoteAsaasStatusForRelease'), 'classifica status remoto');
  assert(svc.includes('executeCancel: false'), 'preview só sync sem DELETE cego');
  assert(svc.includes('executeCancel: true'), 'execute cancela após sync');
  assert(svc.includes("status: RECEIPT_CANCELLED_STATUS"), 'cancela parcelas unpaid');
  assert(svc.includes("status: SALE_CANCELLED_STATUS"), 'encerra venda CANCELLED');
  assert(svc.includes("status: CONTRACT_CANCELLED_STATUS"), 'cancela contrato');
  assert(svc.includes("status: LOT_AVAILABLE_STATUS"), 'lote Disponível');
  assert(svc.includes("sale_id: null"), 'limpa sale_id do lote');
  assert(svc.includes("customer_id: null"), 'limpa customer_id');
  assert(svc.includes("action: preview.saleId ? 'sale_cancelled'"), 'audit sale_cancelled');
  assert(svc.includes('ASAAS_CANCEL_FAILED'), 'falha Asaas bloqueia local');
  assert(svc.includes('INTER_CANCEL_FAILED'), 'falha Inter bloqueia local');
  assert(svc.includes('resolveInterChargesForRelease'), 'resolve Inter com sync');
  assert(svc.includes('cancel_inter'), 'stage cancel_inter');
  assert(svc.includes('listOpenInterBankChargeIdsForSale'), 'carrega bank_charges Inter');
  assert(svc.includes('asaasBlockedCharges'), 'preview expõe bloqueadas');
  assert(svc.includes('interBlockedCharges'), 'preview expõe Inter bloqueadas');
  assert(svc.includes('openCancelableCharges'), 'total agnóstico canceláveis');
  assert(svc.includes('delete_rejected_reclassified'), 'reclassifica se DELETE recusado');
  assert(svc.includes('alreadyReleased'), 'idempotência alreadyReleased');
  assert(svc.includes('isPaidFinanceReceiptStatus'), 'preserva pagas');
  assert(svc.includes('isTenantEnterpriseAdminRole'), 'admin only');
  assert(svc.includes('CROSS_TENANT'), 'bloqueia cross-tenant');
  assert(!svc.includes('.delete().eq(\'sale_id\''), 'não hard-delete venda');
  assert(!svc.includes("from('finance_receipts').delete"), 'não hard-delete parcelas');
  console.log('OK testServiceOrchestrationSource');
}

function testApiRoute() {
  const route = read('app/api/lots/[lotId]/release/route.ts');
  assert(route.includes('getReleaseLotPreview'), 'GET preview');
  assert(route.includes('executeReleaseLot'), 'POST execute');
  assert(route.includes('getRequestAuthUser'), 'auth');
  assert(route.includes('createAdminSupabase'), 'admin supabase');
  assert(route.includes('acknowledged'), 'exige acknowledged');
  console.log('OK testApiRoute');
}

function testGisWiring() {
  const gis = read('components/map/GISMap.tsx');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(gis.includes('ReleaseLotConfirmModal'), 'modal importado no GIS');
  assert(gis.includes('lotNeedsReleaseConfirm'), 'helper de gatilho');
  assert(modal.includes('/api/lots/'), 'API no modal');
  assert(modal.includes('method: \'GET\''), 'GET preview');
  assert(modal.includes('method: \'POST\''), 'POST execute');
  assert(modal.includes('Operações da venda'), 'título modal');
  assert(
    modal.includes(
      'Encerramento devolve o lote ao estoque. Troca de lote e transferência de',
    ),
    'subtítulo',
  );
  assert(modal.includes('max-w-[1000px]'), 'largura desktop ~1000px');
  assert(modal.includes('Confirmar liberação do lote'), 'botão de risco');
  assert(
    modal.includes(
      'Estou ciente de que esta operação encerrará a venda atual e tornará o lote novamente disponível.',
    ),
    'checkbox',
  );
  assert(!modal.includes('<select'), 'sem select de motivo');
  assert(modal.includes('Escolha a operação da venda'), 'seção de operação');
  assert(read('lib/finance/releaseLotShared.ts').includes("label: 'Troca de lote'"), 'card troca de lote');
  assert(read('lib/finance/releaseLotShared.ts').includes("label: 'Desistência do cliente'"), 'card desistência');
  assert(read('lib/finance/releaseLotShared.ts').includes("label: 'Cancelamento administrativo'"), 'card admin');
  assert(modal.includes('SALE_OPERATION_UI_GROUPS.map'), 'cards agrupados visualmente');
  assert(modal.includes('SALE_OPERATION_UI_OPTIONS.filter'), 'cards renderizam opções oficiais');
  assert(!modal.includes("motiveCode === 'outro'"), 'Outro saiu da UI');
  assert(modal.includes('O que acontecerá'), 'quadro de consequências');
  assert(modal.includes('Cobranças Asaas canceláveis'), 'card Asaas');
  assert(modal.includes('Cobranças bancárias canceláveis'), 'card total bancário');
  assert(modal.includes('Documentos preservados'), 'card documentos');
  assert(modal.includes('Parcelas pagas'), 'card pagas');
  assert(modal.includes('Parcelas pendentes'), 'card pendentes');
  assert(modal.includes('Parcelas atrasadas'), 'card atrasadas');
  assert(modal.includes('asaasBlockedCharges'), 'bloqueia submit se Asaas bloqueado');
  assert(modal.includes('interBlockedCharges'), 'bloqueia submit se Inter bloqueado');
  assert(modal.includes('pagamentos preservados'), 'alerta pagamentos');
  assert(modal.includes('submittingRef'), 'anti double-click');
  assert(modal.includes('form-input-light'), 'contraste inputs GIS');
  assert(modal.includes('createPortal'), 'portal no body');
  assert(modal.includes('WebkitTextFillColor'), 'senha com cor forçada');
  assert(modal.includes('signInWithPassword'), 'senha via Auth');
  assert(modal.includes('lotReleased: true'), 'sucesso libera lote no mapa');
  assert(!modal.includes('CESSAO'), 'sem cessão neste modal');
  assert(!modal.includes('CustomerSearchPicker'), 'sem busca de cessionário');
  assert(!modal.includes('/api/contract-operations/'), 'não usa API de cessão');
  assert(gis.includes('Liberação comercial'), 'handleLotAction bloqueia bypass');
  assert(!gis.includes('Confirmar limpeza do lote'), 'modal antigo removido');
  console.log('OK testGisWiring');
}

function testReleaseLotModalConfirmRules() {
  const ready = {
    motiveCode: 'distrato',
    motiveDetail: 'acordo entre as partes',
    acknowledged: true,
    password: 'secret',
  };
  assert(canConfirmReleaseLot(ready), 'distrato + ciência + senha + justificativa habilita');
  assert(
    !canConfirmReleaseLot({ ...ready, motiveDetail: '' }),
    'distrato sem justificativa bloqueia',
  );
  assert(
    !canConfirmReleaseLot({ ...ready, motiveDetail: 'ab' }),
    'distrato com menos de 3 caracteres bloqueia',
  );
  assert(
    !canConfirmReleaseLot({ ...ready, motiveCode: '' }),
    'sem motivo bloqueia',
  );
  assert(
    !canConfirmReleaseLot({ ...ready, acknowledged: false }),
    'sem checkbox bloqueia',
  );
  assert(
    !canConfirmReleaseLot({ ...ready, password: '   ' }),
    'sem senha bloqueia',
  );
  assert(
    !canConfirmReleaseLot({
      ...ready,
      motiveCode: 'outro',
      motiveDetail: '',
    }),
    'Outro sem descrição bloqueia',
  );
  assert(
    !canConfirmReleaseLot({
      ...ready,
      motiveCode: 'outro',
      motiveDetail: 'ab',
    }),
    'Outro com menos de 3 caracteres bloqueia',
  );
  assert(
    canConfirmReleaseLot({
      ...ready,
      motiveCode: 'cancelamento_administrativo',
      motiveDetail: 'Ajuste interno da loteadora',
    }),
    'admin com justificativa habilita',
  );
  assert(
    !canConfirmReleaseLot({
      ...ready,
      motiveCode: 'cancelamento_administrativo',
      motiveDetail: '',
    }),
    'admin sem justificativa bloqueia',
  );
  assert(
    !canConfirmReleaseLot({ ...ready, asaasBlockedCharges: 1 }),
    'Asaas bloqueada impede',
  );
  assert(
    !canConfirmReleaseLot({ ...ready, interBlockedCharges: 2 }),
    'Inter bloqueada impede',
  );
  assert(
    !canConfirmReleaseLot({ ...ready, loading: true }),
    'loading impede double submit',
  );

  const codes = RELEASE_LOT_MOTIVE_OPTIONS.map((o) => o.value);
  assert(codes.join(',') === 'desistencia,distrato,inadimplencia,erro_cadastro,troca_lote,cancelamento_administrativo,outro', 'valores internos estáveis');

  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes('SALE_OPERATION_UI_GROUPS.map'), 'motivos agrupados visualmente');
  assert(modal.includes('SALE_OPERATION_UI_OPTIONS.filter'), 'cards nascem das opções oficiais');
  assert(modal.includes('key={option.value}'), 'cards usam value interno');
  assert(modal.includes('{option.label}'), 'cards exibem label oficial');
  assert(modal.includes('{option.description}'), 'cards têm descrição');
  assert(modal.includes('setMotiveCode(option.value)'), 'seleção única por estado');
  assert(
    modal.includes('motiveCode: motive.motiveCode'),
    'payload envia motiveCode',
  );
  assert(
    modal.includes('motiveDetail: motive.motiveDetail'),
    'payload envia motiveDetail',
  );
  assert(modal.includes('acknowledged: true'), 'payload envia ciência');
  const postBody = modal.slice(
    modal.indexOf('JSON.stringify({'),
    modal.indexOf('idempotencyKey: preview?.idempotencyKey || null,'),
  );
  assert(!postBody.includes('password'), 'POST não envia senha');
  assert(!modal.includes('to_customer_id'), 'sem campo de cessionário');
  console.log('OK testReleaseLotModalConfirmRules');
}

function testSaleOperationsPanel() {
  const labels = SALE_OPERATION_UI_OPTIONS.map((o) => o.label);
  const offered = SALE_OPERATION_UI_GROUPS.flatMap((g) =>
    SALE_OPERATION_UI_OPTIONS.filter((o) => g.codes.includes(o.value)).map((o) => o.label),
  );
  assert(SALE_OPERATION_UI_OPTIONS.length === 7, 'catálogo interno com 7 códigos (inclui legado)');
  assert(labels.includes('Desistência do cliente'), 'desistência');
  assert(labels.includes('Distrato'), 'distrato');
  assert(labels.includes('Inadimplência'), 'inadimplência');
  assert(labels.includes('Erro de cadastro'), 'label legado permanece no catálogo');
  assert(labels.includes('Cancelamento administrativo'), 'label legado permanece no catálogo');
  assert(labels.includes('Troca de lote'), 'troca');
  assert(labels.includes('Transferência de titularidade'), 'titularidade');
  assert(!labels.includes('Outro'), 'Outro fora da UI');
  assert(
    !SALE_OPERATION_UI_OPTIONS.some((o) => String(o.value) === 'outro'),
    'código outro fora do painel',
  );
  assert(
    offered.join(',') ===
      'Desistência do cliente,Distrato,Inadimplência,Troca de lote,Transferência de titularidade',
    'cards oferecidos sem Erro de cadastro e sem Cancelamento administrativo',
  );
  assert(!offered.includes('Erro de cadastro'), 'card Erro de cadastro não é oferecido');
  assert(
    !offered.includes('Cancelamento administrativo'),
    'card Cancelamento administrativo não é oferecido',
  );
  assert(
    SALE_OPERATION_UI_OPTIONS.some((o) => o.supportLabel === 'Venda de ágio / cessão'),
    'apoio discreto de ágio',
  );

  assert(SALE_OPERATION_UI_GROUPS[0].id === 'encerrar_venda', 'grupo encerrar');
  assert(SALE_OPERATION_UI_GROUPS[0].codes.length === 3, '3 encerrar');
  assert(
    SALE_OPERATION_UI_GROUPS[0].codes.join(',') === 'desistencia,distrato,inadimplencia',
    'encerrar sem erro de cadastro e sem cancelamento administrativo',
  );
  assert(SALE_OPERATION_UI_GROUPS[1].id === 'alterar_venda', 'grupo alterar');
  assert(
    SALE_OPERATION_UI_GROUPS[1].codes.join(',') === 'troca_lote,transferencia_titularidade',
    'alterar: troca e titularidade',
  );

  assert(showsTerminationSettlement('desistencia'), 'settlement desistência');
  assert(showsTerminationSettlement('distrato'), 'settlement distrato');
  assert(showsTerminationSettlement('inadimplencia'), 'settlement inadimplência');
  assert(showsTerminationSettlement('cancelamento_administrativo'), 'settlement admin');
  assert(!showsTerminationSettlement('erro_cadastro'), 'erro sem acerto');
  assert(!showsTerminationSettlement('troca_lote'), 'troca sem acerto');
  assert(!showsTerminationSettlement('transferencia_titularidade'), 'cessão sem acerto');

  assert(isLotReleaseSaleOperation('erro_cadastro'), 'erro ainda libera lote');
  assert(isLotReleaseSaleOperation('cancelamento_administrativo'), 'admin legado ainda libera lote');
  assert(!isLotReleaseSaleOperation('troca_lote'), 'troca não é release');
  assert(!isLotReleaseSaleOperation('transferencia_titularidade'), 'titularidade não é release');
  assert(!isDeferredSaleOperation('troca_lote'), 'troca agora tem etapa própria de prévia');
  assert(isDeferredSaleOperation('transferencia_titularidade'), 'titularidade diferida');
  assert(!isDeferredSaleOperation('distrato'), 'distrato não diferido');

  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes('grid-cols-1 md:grid-cols-3'), 'grid desktop 3 colunas / mobile 1');
  assert(modal.includes('min-h-[148px]'), 'altura mínima uniforme');
  assert(modal.includes('h-full min-h-[148px] w-full'), 'cards mesma largura/altura');
  assert(modal.includes('items-stretch'), 'alinhamento uniforme');
  assert(modal.includes('Escolha a operação da venda'), 'título da seção');
  assert(
    modal.includes('Selecione o procedimento que será realizado para esta venda.'),
    'subtexto',
  );
  assert(SALE_OPERATION_UI_GROUPS[0].label === 'Encerrar venda', 'grupo encerrar');
  assert(SALE_OPERATION_UI_GROUPS[1].label === 'Alterar venda', 'grupo alterar');
  assert(modal.includes('{group.label}'), 'renderiza rótulo do grupo');
  assert(!modal.includes("label: 'Outro'"), 'sem card Outro no modal');
  assert(!modal.includes("motiveCode === 'outro'"), 'sem campo Outro');
  assert(modal.includes('isDeferredSaleOperation(motiveCode)'), 'guarda diferidos');
  assert(modal.includes('isLotReleaseSaleOperation(motiveCode)'), 'só release encerra');
  assert(modal.includes('showsTerminationSettlement(motiveCode)'), 'acerto só no encerramento compatível');
  const handleSubmit = modal.slice(modal.indexOf('const handleSubmit'), modal.indexOf('if (!mounted)'));
  assert(handleSubmit.includes('isDeferredSaleOperation(motiveCode)'), 'submit recusa diferidos');
  assert(handleSubmit.includes('isLotReleaseSaleOperation(motiveCode)'), 'submit só encerrar');
  assert(handleSubmit.includes("fetch(`/api/lots/${encodeURIComponent(lot.id)}/release`"), 'POST release só no submit de encerrar');
  assert(handleSubmit.includes("method: 'POST'"), 'submit usa POST');
  assert(!handleSubmit.includes('/api/contract-operations/'), 'submit sem cessão');
  assert(modal.includes('Transferência de titularidade em etapa própria'), 'estado informativo cessão');
  assert(modal.includes('LotSwapPreviewPanel'), 'troca abre painel próprio de prévia');
  assert(modal.includes('isSaleLotSwapOperation'), 'card troca usa operação própria');
  assert(modal.includes('não chama a liberação'), 'titularidade não usa release');
  assert(
    read('components/map/LotSwapPreviewPanel.tsx').includes(
      'Nenhum lote, parcela, contrato',
    ),
    'prévia sem mutação',
  );
  assert(modal.includes('Justificativa administrativa'), 'admin exige texto');
  assert(modal.includes('Motivo / justificativa do distrato'), 'distrato exige texto');
  assert(
    modal.includes('Motivo / justificativa da inadimplência'),
    'inadimplência exige texto',
  );
  assert(
    modal.includes("{deferredOperation || lotSwapOperation ? 'Fechar' : documentSuccess ? 'Concluir' : 'Cancelar'}"),
    'footer diferido / concluir',
  );
  assert(RELEASE_LOT_MOTIVE_OPTIONS.some((o) => o.value === 'outro'), 'backend outro intacto');
  console.log('OK testSaleOperationsPanel');
}

function testReleaseHomologUsesDevelopOnly() {
  assert(DEVELOP_PROJECT_REF === 'hoynysmynxncdlptuzub', 'ref DEVELOP constante');
  assert(PRODUCTION_PROJECT_REF === 'aezktedncttwpqeunjej', 'ref Production conhecida');
  const svc = read('lib/finance/releaseLotService.ts');
  const route = read('app/api/lots/[lotId]/release/route.ts');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(!svc.includes(PRODUCTION_PROJECT_REF), 'serviço de release sem hardcode Production');
  assert(!route.includes(PRODUCTION_PROJECT_REF), 'rota de release sem hardcode Production');
  assert(!modal.includes(PRODUCTION_PROJECT_REF), 'modal sem hardcode Production');
  const homolog = read('scripts/mandatory-develop-homolog-guards-tests.ts');
  assert(homolog.includes(DEVELOP_PROJECT_REF), 'suite de homologação amarra DEVELOP');
  assert(homolog.includes(PRODUCTION_PROJECT_REF), 'suite de homologação recusa Production');
  console.log('OK testReleaseHomologUsesDevelopOnly');
}

function testOperationalListingExcludesCanceled() {
  assert(
    !isOperationalFinanceReceiptForListing({ status: 'cancelado' }),
    'cancelado fora da listagem operacional',
  );
  assert(
    isOperationalFinanceReceiptForListing({ status: 'pago', paid_at: '2026-01-01' }),
    'pago permanece operacional/histórico',
  );
  assert(
    isOperationalFinanceReceiptForListing({ status: 'pendente' }),
    'pendente operacional',
  );

  const financePage = read('app/finance/page.tsx');
  assert(
    financePage.includes("st !== 'cancelado' && st !== 'canceled'"),
    'Financeiro Todas exclui cancelado',
  );

  const chargeFilter = read('lib/charges/chargeInstallmentHelpers.ts');
  assert(
    chargeFilter.includes("status !== 'cancelado' && status !== 'canceled'"),
    'Cobranças Todas exclui cancelado',
  );

  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes("status: RECEIPT_CANCELLED_STATUS"), 'cleanup = UPDATE cancelado');
  assert(!svc.includes("from('finance_receipts').delete"), 'não DELETE parcelas');
  console.log('OK testOperationalListingExcludesCanceled');
}

function testApiErrorShape() {
  const route = read('app/api/lots/[lotId]/release/route.ts');
  assert(route.includes('success: false'), 'success false');
  assert(route.includes('RELEASE_LOT_FAILED'), 'code padrão');
  assert(route.includes('stage:'), 'stage no payload');
  assert(route.includes('[lots/release POST]'), 'log estruturado');
  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('ReleaseLotStage'), 'stages tipados');
  assert(svc.includes('cancel_asaas'), 'stage asaas');
  assert(svc.includes('cancel_inter'), 'stage inter');
  assert(svc.includes('clear_lot'), 'stage clear_lot');
  console.log('OK testApiErrorShape');
}

function testPaidNeverDeletedGuards() {
  const zeroPaid = summarizeReleaseReceipts([
    { status: 'pendente', amount: 100 },
    { status: 'atrasado', amount: 200 },
  ]);
  assert(zeroPaid.paidReceipts === 0, 'zero paid');
  assert(zeroPaid.unpaidToCancel === 2, '2 cancel');

  const mixed = summarizeReleaseReceipts([
    { status: 'pago', amount: 1000, paid_at: '2026-03-01' },
    { status: 'pendente', amount: 100 },
    { status: 'atrasado', amount: 100 },
    { status: 'pendente', amount: 100 },
  ]);
  assert(mixed.paidReceipts === 1, 'entrada paga permanece contada');
  assert(mixed.pendingReceipts === 2, '2 pendentes');
  assert(mixed.overdueReceipts === 1, '1 atrasada');
  assert(mixed.totalPaidAmount === 1000, 'total pago 1000');
  console.log('OK testPaidNeverDeletedGuards');
}

function testReleaseLotConfirmButtonUx() {
  const ready = {
    releaseOperation: true,
    motiveCode: 'desistencia',
    motiveDetail: '',
    acknowledged: true,
    password: 'secret',
    loading: false,
    asaasBlockedCharges: 0,
    interBlockedCharges: 0,
    needsRefundSchedule: false,
    refundFirstDueDate: '',
    showSettlement: true,
    improvementsCheckOk: true,
  };

  assert(
    computeReleaseLotConfirmEnabled(ready),
    'todas as condições válidas → botão habilitado',
  );
  assert(
    computeReleaseLotConfirmEnabled({ ...ready, password: 'secret' }),
    'senha manual habilita',
  );

  const autofilled = passwordStateFromInputValue('autofill-secret');
  assert(autofilled === 'autofill-secret', 'autofill via input sincroniza state');
  assert(
    computeReleaseLotConfirmEnabled({ ...ready, password: autofilled }),
    'autofill via input sincroniza e habilita',
  );
  assert(
    !computeReleaseLotConfirmEnabled({ ...ready, password: '' }),
    'senha vazia no state desabilita',
  );

  const pendingAppraisal = validateImprovementsForRelease({
    hasImprovements: true,
    appraisalStatus: 'PENDING',
    items: [],
    destination: 'REFUND_CUSTOMER',
  });
  assert(!pendingAppraisal.ok, 'avaliação pendente inválida');
  const pendingNotices = buildReleaseLotConfirmFooterNotices({
    showSettlement: true,
    improvementsCheckOk: pendingAppraisal.ok,
    improvementsCheckError: pendingAppraisal.ok ? null : pendingAppraisal.error,
    needsRefundSchedule: false,
    refundFirstDueDate: '',
  });
  assert(
    !computeReleaseLotConfirmEnabled({
      ...ready,
      improvementsCheckOk: pendingAppraisal.ok,
    }),
    'benfeitoria inválida mantém desabilitado',
  );
  assert(
    pendingNotices.some((n) => n.message === IMPROVEMENTS_APPRAISAL_REQUIRED_MESSAGE),
    'mensagem avaliação ainda não concluída',
  );

  const missingDescription = validateImprovementsForRelease({
    hasImprovements: true,
    appraisalStatus: 'COMPLETED',
    items: [{ description: '', amount: 100 }],
    destination: 'REFUND_CUSTOMER',
  });
  assert(!missingDescription.ok, 'sem descrição inválida');
  assert(
    missingDescription.ok === false &&
      missingDescription.error.includes('descrição'),
    'benfeitoria sem descrição',
  );

  const missingAmount = validateImprovementsForRelease({
    hasImprovements: true,
    appraisalStatus: 'COMPLETED',
    items: [{ description: 'Muro', amount: 0 }],
    destination: 'REFUND_CUSTOMER',
  });
  assert(!missingAmount.ok, 'valor zero inválido');
  assert(
    missingAmount.ok === false &&
      missingAmount.error.includes('maior que zero'),
    'valor deve ser maior que zero',
  );

  const creditBlocked = validateImprovementsForRelease({
    hasImprovements: true,
    appraisalStatus: 'COMPLETED',
    items: [{ description: 'Muro', amount: 100 }],
    destination: 'CREDIT_OTHER_UNIT',
  });
  assert(!creditBlocked.ok, 'crédito incompatível');
  assert(
    creditBlocked.ok === false &&
      creditBlocked.error === IMPROVEMENTS_CREDIT_NOT_ALLOWED_MESSAGE,
    'destino incompatível com benfeitorias reconhecidas',
  );

  const validImprovements = validateImprovementsForRelease({
    hasImprovements: true,
    appraisalStatus: 'COMPLETED',
    items: [{ description: 'Muro', amount: 1500 }],
    destination: 'REFUND_CUSTOMER',
  });
  assert(validImprovements.ok, 'benfeitoria válida');
  assert(
    computeReleaseLotConfirmEnabled({
      ...ready,
      improvementsCheckOk: validImprovements.ok,
    }),
    'benfeitoria válida habilita',
  );

  const missingDateNotices = buildReleaseLotConfirmFooterNotices({
    showSettlement: true,
    improvementsCheckOk: true,
    needsRefundSchedule: true,
    refundFirstDueDate: '',
  });
  assert(
    !computeReleaseLotConfirmEnabled({
      ...ready,
      needsRefundSchedule: true,
      refundFirstDueDate: '',
    }),
    'data faltante mantém desabilitado',
  );
  assert(
    missingDateNotices.some((n) => n.message === REFUND_FIRST_DUE_DATE_REQUIRED_MESSAGE),
    'mensagem de vencimento da 1ª parcela',
  );
  assert(
    computeReleaseLotConfirmEnabled({
      ...ready,
      needsRefundSchedule: true,
      refundFirstDueDate: '2026-09-15',
    }),
    'data preenchida habilita quando cronograma é obrigatório',
  );

  const asaasNotices = buildReleaseLotConfirmFooterNotices({
    showSettlement: true,
    improvementsCheckOk: true,
    needsRefundSchedule: false,
    refundFirstDueDate: '',
    asaasBlockedCharges: 1,
  });
  assert(
    !computeReleaseLotConfirmEnabled({ ...ready, asaasBlockedCharges: 1 }),
    'Asaas bloqueada mantém desabilitado',
  );
  assert(
    asaasNotices.some((n) => n.message === asaasBlockedReleaseFooterMessage(1)),
    'aviso Asaas no rodapé',
  );

  const interNotices = buildReleaseLotConfirmFooterNotices({
    showSettlement: true,
    improvementsCheckOk: true,
    needsRefundSchedule: false,
    refundFirstDueDate: '',
    interBlockedCharges: 2,
  });
  assert(
    !computeReleaseLotConfirmEnabled({ ...ready, interBlockedCharges: 2 }),
    'Inter bloqueada mantém desabilitado',
  );
  assert(
    interNotices.some((n) => n.message === interBlockedReleaseFooterMessage(2)),
    'aviso Inter no rodapé',
  );

  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes('onInput={(e) => syncPasswordFromInput(e.currentTarget)}'), 'onInput senha');
  assert(modal.includes('onChange={(e) => syncPasswordFromInput(e.currentTarget)}'), 'onChange senha');
  assert(modal.includes('confirmFooterNotices'), 'avisos no rodapé');
  assert(modal.includes('disabled={!confirmEnabled}'), 'disabled inalterado na fórmula');
  assert(modal.includes('computeReleaseLotConfirmEnabled'), 'habilitação composta');
  assert(!modal.includes('console.info'), 'sem log de diagnóstico no commit');
  assert(!modal.includes('console.log(password'), 'não loga senha');

  const shared = read('lib/finance/releaseLotShared.ts');
  const start = shared.indexOf('export function canConfirmReleaseLot');
  const end = shared.indexOf('export type ReleaseReceiptBucket');
  const fn = shared.slice(start, end);
  assert(fn.includes('if (input.loading) return false;'), 'canConfirm loading');
  assert(fn.includes('if (!input.acknowledged) return false;'), 'canConfirm ciência');
  assert(fn.includes("if (!String(input.password || '').trim()) return false;"), 'canConfirm senha');
  assert(fn.includes('if ((input.asaasBlockedCharges || 0) > 0) return false;'), 'canConfirm Asaas');
  assert(fn.includes('if ((input.interBlockedCharges || 0) > 0) return false;'), 'canConfirm Inter');
  assert(fn.includes('return validateReleaseLotMotive({'), 'canConfirm motivo');
  assert(!shared.includes('releaseLotConfirmUx'), 'motor shared não depende da UX');

  const ux = read('lib/finance/releaseLotConfirmUx.ts');
  assert(!ux.includes('calculateSettlement'), 'UX não mexe no motor financeiro');
  assert(ux.includes('canConfirmReleaseLot({'), 'UX reutiliza canConfirmReleaseLot');

  const inadimplenciaReady = {
    ...ready,
    motiveCode: 'inadimplencia',
    motiveDetail: 'parcelas vencidas sem regularização',
    inadimplenciaEligible: true,
    inadimplenciaPolicyOk: true,
  };
  assert(
    computeReleaseLotConfirmEnabled(inadimplenciaReady),
    'inadimplência elegível habilita confirmação',
  );
  assert(
    !computeReleaseLotConfirmEnabled({
      ...inadimplenciaReady,
      inadimplenciaEligible: false,
    }),
    'sem parcela vencida desabilita confirmação',
  );
  assert(
    !computeReleaseLotConfirmEnabled({
      ...inadimplenciaReady,
      inadimplenciaEligible: undefined,
    }),
    'preview ainda sem elegibilidade desabilita',
  );
  assert(
    !computeReleaseLotConfirmEnabled({
      ...inadimplenciaReady,
      inadimplenciaPolicyOk: false,
    }),
    'policy incompleta desabilita inadimplência',
  );
  assert(
    computeReleaseLotConfirmEnabled(ready),
    'Desistência permanece habilitada sem os gates de inadimplência',
  );
  const noDefaultNotices = buildReleaseLotConfirmFooterNotices({
    showSettlement: true,
    improvementsCheckOk: true,
    needsRefundSchedule: true,
    refundFirstDueDate: '',
    motiveCode: 'inadimplencia',
    inadimplenciaEligible: false,
  });
  assert(noDefaultNotices.length === 0, 'rodapé não repete o aviso contextual da seção');
  assert(
    !noDefaultNotices.some((n) => n.message === REFUND_FIRST_DUE_DATE_REQUIRED_MESSAGE),
    'não mistura vencimento da restituição com inelegibilidade',
  );
  const modalSrc = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(
    modalSrc.includes('{INADIMPLENCIA_NO_DEFAULT_MESSAGE}'),
    'aviso único permanece abaixo da justificativa',
  );
  assert(
    !computeReleaseLotConfirmEnabled({
      ...inadimplenciaReady,
      inadimplenciaEligible: false,
      needsRefundSchedule: true,
      refundFirstDueDate: '',
    }),
    'botão permanece bloqueado sem inadimplência efetiva',
  );
  const eligibleScheduleNotices = buildReleaseLotConfirmFooterNotices({
    showSettlement: true,
    improvementsCheckOk: true,
    needsRefundSchedule: true,
    refundFirstDueDate: '',
    motiveCode: 'inadimplencia',
    inadimplenciaEligible: true,
  });
  assert(
    eligibleScheduleNotices.some((n) => n.message === REFUND_FIRST_DUE_DATE_REQUIRED_MESSAGE),
    'inadimplência elegível ainda exige vencimento da restituição quando aplicável',
  );
  const desistenciaScheduleNotices = buildReleaseLotConfirmFooterNotices({
    showSettlement: true,
    improvementsCheckOk: true,
    needsRefundSchedule: true,
    refundFirstDueDate: '',
    motiveCode: 'desistencia',
  });
  assert(
    desistenciaScheduleNotices.some((n) => n.message === REFUND_FIRST_DUE_DATE_REQUIRED_MESSAGE),
    'Desistência preserva aviso de restituição',
  );
  console.log('OK testReleaseLotConfirmButtonUx');
}

function testZeroPaidReleaseDoesNotFailLoad() {
  const persist = read('lib/finance/saleReleaseSettlement.ts');
  assert(persist.includes('export function isAbsentSettlementQueryError'), 'helper ausência');
  assert(persist.includes('export function isZeroPaidReleaseSettlement'), 'helper zero pagos');
  assert(persist.includes('.limit(1)'), 'load com limit(1)');
  const loadFn = persist.slice(
    persist.indexOf('export async function loadActiveReleaseSettlement'),
    persist.indexOf('export async function upsertCalculatedReleaseSettlement'),
  );
  assert(!loadFn.includes('.maybeSingle()'), 'load não falha com maybeSingle vazio');
  const svc = read('lib/finance/releaseLotService.ts');
  const execFn = svc.slice(svc.indexOf('export async function executeReleaseLot'));
  assert(execFn.includes('if (isAbsentSettlementQueryError(err))'), 'ausência não bloqueia /release');
  assert(execFn.includes('existingSettlement = null'), 'segue com settlement a persistir');
  console.log('OK testZeroPaidReleaseDoesNotFailLoad');
}

function main() {
  testMotiveValidation();
  testReceiptClassification();
  testAsaasClassification();
  testInterClassification();
  testSaleAndLotStatusHelpers();
  testBlocksColumnMapping();
  testServiceOrchestrationSource();
  testApiRoute();
  testGisWiring();
  testReleaseLotModalConfirmRules();
  testSaleOperationsPanel();
  testReleaseHomologUsesDevelopOnly();
  testOperationalListingExcludesCanceled();
  testApiErrorShape();
  testPaidNeverDeletedGuards();
  testReleaseLotConfirmButtonUx();
  testZeroPaidReleaseDoesNotFailLoad();
  console.log('\nALL mandatory-release-lot-tests PASSED');
}

main();
