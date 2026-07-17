/**
 * Minhas Vendas (corretor) — schema real, vínculo, convertida≠ativa,
 * DTOs sem campos financeiros, menu só broker, falha ≠ vazio.
 *
 * npx tsx scripts/mandatory-broker-my-sales-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  assertMySalesBlockSelectSchema,
  formatContractStatusLabel,
  formatReservationStatusLabel,
  isContractPending,
  isContractSigned,
  isReservationActiveForKpi,
  MY_SALES_BLOCK_EMBED,
  MY_SALES_BLOCKS_RESERVATION_SELECT,
  MY_SALES_CONTRACTS_SELECT,
  MY_SALES_CUSTOMER_EMBED,
  MY_SALES_FORBIDDEN_CONTRACT_COLUMNS,
  MY_SALES_SALES_SELECT,
  parseSelectFieldList,
  resolveBrokerMatchIds,
  resolveContractSignatureState,
  resolveReservationDisplayStatus,
  selectCurrentContractsBySaleId,
} from '../lib/broker/mySalesService';
import {
  resolveLoteFromBlock,
  resolveQuadraFromBlock,
  formatSaleBlockLotLabel,
} from '../lib/saleBlockLotLabel';
import {
  MY_SALES_FORBIDDEN_FIELD_KEYS,
  type MySalesListItem,
} from '../lib/broker/mySalesTypes';
import { BROKER_UNLINKED_MESSAGE } from '../lib/broker/resolveAuthenticatedBroker';
import {
  isBrokerBlockedRoute,
  isBrokerRole,
} from '../lib/rolePermissions';
import { isSaleContractFullySigned } from '../lib/saleContractDashboardStats';

const ROOT = path.resolve(__dirname, '..');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function testBrokerRolesAllowMySales() {
  assert(isBrokerRole('BROKER'), 'BROKER');
  assert(isBrokerRole('CORRETOR'), 'CORRETOR');
  assert(!isBrokerBlockedRoute('/my-sales'), '/my-sales não bloqueada');
  assert(isBrokerBlockedRoute('/finance'), '/finance bloqueada');
  assert(isBrokerBlockedRoute('/contracts'), '/contracts bloqueada');
  console.log('OK testBrokerRolesAllowMySales');
}

function testConvertedReservationNotActiveKpi() {
  const converted = resolveReservationDisplayStatus({
    logStatus: 'active',
    expirationTime: new Date(Date.now() + 86400000).toISOString(),
    hasLinkedSale: true,
  });
  assert(converted === 'convertida', `expected convertida got ${converted}`);
  assert(!isReservationActiveForKpi(converted), 'convertida não conta como ativa');
  assert(
    formatReservationStatusLabel(converted) === 'Convertida em venda',
    'label convertida',
  );

  const active = resolveReservationDisplayStatus({
    logStatus: 'active',
    expirationTime: new Date(Date.now() + 86400000).toISOString(),
    hasLinkedSale: false,
    blockStatus: 'Reservado',
  });
  assert(active === 'ativa', `expected ativa got ${active}`);
  assert(isReservationActiveForKpi(active), 'ativa no KPI');

  const soldBlock = resolveReservationDisplayStatus({
    logStatus: 'active',
    expirationTime: new Date(Date.now() + 86400000).toISOString(),
    blockStatus: 'Vendido',
    hasLinkedSale: false,
  });
  assert(soldBlock === 'convertida', 'lote vendido = convertida');
  assert(!isReservationActiveForKpi(soldBlock), 'vendido fora do KPI ativas');
  console.log('OK testConvertedReservationNotActiveKpi');
}

function testDtoHasNoForbiddenFinancialKeys() {
  const sample: MySalesListItem = {
    id: 'sale:1',
    type: 'sale',
    typeLabel: 'Venda',
    date: '2026-07-01',
    projectName: 'P',
    blockLabel: '1',
    lotLabel: '10',
    customerName: 'Cliente',
    customerPhone: null,
    statusKey: 'assinado',
    statusLabel: 'Assinado',
    contractStatusKey: 'assinado',
    contractStatusLabel: 'Assinado',
    reservationExpiresAt: null,
    contractSignedAt: null,
    saleId: '1',
    reservationId: null,
    contractId: 'c1',
    linkedSaleId: null,
  };
  const keys = Object.keys(sample).map((k) => k.toLowerCase());
  for (const forbidden of MY_SALES_FORBIDDEN_FIELD_KEYS) {
    assert(
      !keys.some((k) => k.includes(forbidden.toLowerCase())),
      `DTO não deve ter campo financeiro: ${forbidden}`,
    );
  }
  console.log('OK testDtoHasNoForbiddenFinancialKeys');
}

function testRealSchemaNoReservationLogsOrFullName() {
  const service = read('lib/broker/mySalesService.ts');
  assert(
    !service.includes("from('reservation_logs')"),
    'não deve consultar reservation_logs',
  );
  assert(service.includes("from('blocks')"), 'reservas via blocks');
  assert(service.includes("eq('status', 'Reservado')"), 'status Reservado');
  assert(service.includes("from('sales')"), 'consulta sales');
  assert(MY_SALES_CUSTOMER_EMBED.includes('name'), 'embed usa name');
  assert(!MY_SALES_CUSTOMER_EMBED.includes('full_name'), 'embed sem full_name');
  assert(MY_SALES_SALES_SELECT.includes('customers:customer_id'), 'join customers');
  assert(!MY_SALES_SALES_SELECT.includes('full_name'), 'sales select sem full_name');
  const selectBodies = [MY_SALES_CUSTOMER_EMBED, MY_SALES_SALES_SELECT].join('\n');
  assert(!/\bfull_name\b/.test(selectBodies), 'selects sem full_name');

  const resolveSrc = read('lib/broker/resolveAuthenticatedBroker.ts');
  assert(resolveSrc.includes("'id, name, email"), 'resolve select name');
  const resolveSelectMatch = resolveSrc.match(/const selectCols\s*=\s*\n?\s*'([^']+)'/);
  assert(Boolean(resolveSelectMatch), 'selectCols encontrado');
  assert(
    !String(resolveSelectMatch?.[1] || '').includes('full_name'),
    'resolve broker sem full_name no select',
  );
  console.log('OK testRealSchemaNoReservationLogsOrFullName');
}

function testBlockSelectSchemaContract() {
  assertMySalesBlockSelectSchema(MY_SALES_BLOCK_EMBED);

  const embedFields = parseSelectFieldList(MY_SALES_BLOCK_EMBED);
  assert(embedFields.includes('block_name'), 'quadra via block_name');
  assert(embedFields.includes('number'), 'lote via number');
  assert(embedFields.includes('lot_number'), 'lote fallback lot_number');
  assert(!embedFields.includes('block'), 'proíbe blocks.block');
  assert(!embedFields.includes('quadra'), 'proíbe blocks.quadra');

  const reservationLeaf = MY_SALES_BLOCKS_RESERVATION_SELECT
    .replace(/customers:customer_id\s*\([^)]*\)/g, '')
    .replace(/projects:project_id\s*\([^)]*\)/g, '');
  const reservationFields = parseSelectFieldList(reservationLeaf);
  assert(!reservationFields.includes('block'), 'reserva select sem block');
  assert(!reservationFields.includes('quadra'), 'reserva select sem quadra');
  assert(reservationFields.includes('block_name'), 'reserva tem block_name');
  assert(reservationFields.includes('number'), 'reserva tem number');

  assert(MY_SALES_SALES_SELECT.includes(MY_SALES_BLOCK_EMBED.trim()) || MY_SALES_SALES_SELECT.includes('block_name'), 'sales usa embed de bloco');
  assert(!MY_SALES_SALES_SELECT.includes('broker_name'), 'sales select sem broker_name');
  assert(!MY_SALES_SALES_SELECT.includes('broker_email'), 'sales select sem broker_email');
  // Garante que não pedimos a coluna literal "block" (≠ block_name / block_id).
  assert(
    !parseSelectFieldList(
      MY_SALES_SALES_SELECT
        .replace(/customers:customer_id\s*\([^)]*\)/g, '')
        .replace(/projects:project_id\s*\([^)]*\)/g, '')
        .replace(/blocks:block_id\s*\([^)]*\)/g, MY_SALES_BLOCK_EMBED),
    ).includes('block'),
    'sales select sem coluna block',
  );

  const sample = { block_name: '02', number: '10', lot_number: '10' };
  assert(resolveQuadraFromBlock(sample) === '02', 'quadra = block_name');
  assert(resolveLoteFromBlock(sample) === '10', 'lote = number');
  assert(
    formatSaleBlockLotLabel(sample) === 'QD 02 - LT 10',
    'formato QD/LT do helper compartilhado',
  );

  const auditedSalesFields = [
    'id',
    'status',
    'sale_date',
    'created_at',
    'broker_id',
    'company_id',
    'tenant_id',
    'project_id',
    'block_id',
    'customer_id',
  ];
  for (const field of auditedSalesFields) {
    assert(MY_SALES_SALES_SELECT.includes(field), `sales select tem ${field}`);
  }
  const auditedBlockFields = [
    'block_name',
    'number',
    'lot_number',
    'name',
    'status',
    'project_id',
  ];
  for (const field of auditedBlockFields) {
    assert(MY_SALES_BLOCK_EMBED.includes(field), `block embed tem ${field}`);
  }
  console.log('OK testBlockSelectSchemaContract');
}

function testServiceSelectWhitelistNoFinance() {
  const service = read('lib/broker/mySalesService.ts');
  for (const forbidden of [
    'total_value',
    'agreed_price',
    'commission',
    'down_payment',
    'asaas',
    'finance_receipt',
  ]) {
    assert(
      !service.includes(forbidden),
      `mySalesService não deve referenciar ${forbidden}`,
    );
  }
  assert(service.includes('.in(\'broker_id\', brokerMatchIds)'), 'filtra broker_id');
  console.log('OK testServiceSelectWhitelistNoFinance');
}

function testLegacyBrokerMatchIds() {
  const ids = resolveBrokerMatchIds({
    brokerId: 'broker-1',
    authUserId: 'auth-1',
    userId: 'user-1',
  });
  assert(ids.includes('broker-1'), 'broker id');
  assert(ids.includes('auth-1'), 'auth legado');
  assert(ids.includes('user-1'), 'user legado');
  assert(ids.length === 3, '3 ids únicos');

  const dedup = resolveBrokerMatchIds({
    brokerId: 'same',
    authUserId: 'same',
    userId: 'same',
  });
  assert(dedup.length === 1, 'dedupe');
  console.log('OK testLegacyBrokerMatchIds');
}

function testContractsSelectSchemaAndStatusRules() {
  assert(
    !MY_SALES_CONTRACTS_SELECT.includes('customer_signed_at'),
    'select sem customer_signed_at',
  );
  for (const forbidden of MY_SALES_FORBIDDEN_CONTRACT_COLUMNS) {
    assert(
      !MY_SALES_CONTRACTS_SELECT.includes(forbidden),
      `contracts select proíbe ${forbidden}`,
    );
  }
  for (const required of [
    'id',
    'sale_id',
    'status',
    'is_current',
    'version',
    'signed_at',
    'created_at',
    'signature_status',
    'company_id',
    'tenant_id',
  ]) {
    assert(MY_SALES_CONTRACTS_SELECT.includes(required), `contracts tem ${required}`);
  }
  assert(
    !MY_SALES_CONTRACTS_SELECT.includes('updated_at'),
    'select sem contracts.updated_at',
  );
  assert(
    !MY_SALES_CONTRACTS_SELECT.split(',').map((s) => s.trim()).includes('updated_at'),
    'campo updated_at ausente do select',
  );

  const service = read('lib/broker/mySalesService.ts');
  assert(service.includes('MY_SALES_CONTRACTS_SELECT'), 'usa constante de select');
  assert(
    service.includes('.select(MY_SALES_CONTRACTS_SELECT)'),
    'contracts usa MY_SALES_CONTRACTS_SELECT',
  );
  assert(service.includes('unavailable: true'), 'falha de contratos = unavailable');
  assert(
    !service.includes('Falha ao consultar contratos:'),
    'falha de contratos não lança erro fatal na listagem',
  );
  assert(
    service.includes('resolveContractSignatureState'),
    'usa helper canônico de assinatura',
  );
  assert(
    service.includes('selectCurrentContractsBySaleId'),
    'escolhe contrato atual por sale_id',
  );

  // Mesma regra do módulo Contratos (isSaleContractFullySigned).
  assert(isContractSigned('assinado'), 'assinado');
  assert(isContractSigned('signed'), 'signed legado');
  assert(!isContractSigned('ativo'), 'ativo sozinho não é assinado');
  assert(
    isContractSigned('ativo', 'SIGNED'),
    'ativo + signature_status SIGNED = assinado (caso 000000057/2026)',
  );
  assert(
    isSaleContractFullySigned({ status: 'ativo', signature_status: 'SIGNED' }),
    'alinhado ao dashboard admin',
  );
  assert(isContractPending('ativo'), 'ativo sem SIGNED = pendente');
  assert(isContractPending('ativo', 'CLIENT_SIGNED'), 'só comprador = pendente');
  assert(isContractPending('rascunho'), 'rascunho = pendente');
  assert(!isContractPending('assinado'), 'assinado não pendente');
  assert(
    resolveContractSignatureState({ contract: null }) === 'NOT_GENERATED',
    'sem contrato ≠ pendente',
  );
  assert(
    resolveContractSignatureState({
      contract: { status: 'cancelado', signature_status: 'SIGNED' },
    }) === 'CANCELLED',
    'cancelado tem prioridade',
  );
  assert(formatContractStatusLabel('assinado') === 'Contrato assinado', 'label assinado');
  assert(
    formatContractStatusLabel('ativo', 'SIGNED') === 'Contrato assinado',
    'label ativo+SIGNED',
  );
  assert(
    formatContractStatusLabel('ativo', 'PENDING') === 'Contrato pendente',
    'label ativo+PENDING',
  );
  console.log('OK testContractsSelectSchemaAndStatusRules');
}

function testCurrentContractVersionWinsOverOldPending() {
  const saleId = 'sale-arlan-qd04-lt11';
  const map = selectCurrentContractsBySaleId([
    {
      id: 'c-v1',
      sale_id: saleId,
      version: 1,
      is_current: false,
      status: 'ativo',
      signature_status: 'PENDING',
    },
    {
      id: 'c-v2',
      sale_id: saleId,
      version: 2,
      is_current: true,
      status: 'ativo',
      signature_status: 'SIGNED',
    },
  ]);
  const current = map.get(saleId);
  assert(Boolean(current), 'escolheu contrato');
  assert(String(current?.id) === 'c-v2', 'versão atual v2');
  assert(
    resolveContractSignatureState({
      contract: {
        status: current?.status as string,
        signature_status: current?.signature_status as string,
      },
    }) === 'SIGNED',
    'v2 assinada → SIGNED (não sobrescrita por v1 pendente)',
  );

  const onlyOld = selectCurrentContractsBySaleId([
    {
      id: 'c-old',
      sale_id: saleId,
      version: 1,
      is_current: false,
      status: 'ativo',
      signature_status: 'PENDING',
    },
  ]);
  assert(!onlyOld.has(saleId), 'is_current=false não vira atual');
  console.log('OK testCurrentContractVersionWinsOverOldPending');
}

function testSignatureKpiDoesNotCountNoContractAsPending() {
  const cases: Array<{
    contract: { status?: string | null; signature_status?: string | null } | null;
    expect: 'SIGNED' | 'PENDING' | 'CANCELLED' | 'NOT_GENERATED';
  }> = [
    { contract: { status: 'ativo', signature_status: 'SIGNED' }, expect: 'SIGNED' },
    { contract: { status: 'ativo', signature_status: 'PENDING' }, expect: 'PENDING' },
    { contract: { status: 'cancelado' }, expect: 'CANCELLED' },
    { contract: null, expect: 'NOT_GENERATED' },
  ];
  let signed = 0;
  let pending = 0;
  for (const c of cases) {
    const state = resolveContractSignatureState({ contract: c.contract });
    assert(state === c.expect, `${JSON.stringify(c.contract)} → ${c.expect}`);
    if (state === 'SIGNED') signed += 1;
    else if (state === 'PENDING') pending += 1;
  }
  assert(signed === 1, 'KPI assinados');
  assert(pending === 1, 'KPI pendentes (sem NOT_GENERATED)');
  console.log('OK testSignatureKpiDoesNotCountNoContractAsPending');
}

function testContractsFailureDoesNotDropSalesList() {
  const service = read('lib/broker/mySalesService.ts');
  // Vendas e reservas em paralelo; contratos depois, soft-fail.
  assert(service.includes('Promise.all(['), 'Promise.all vendas+reservas');
  assert(service.includes('loadSalesForBroker'), 'carrega vendas');
  assert(service.includes('loadReservationsForBroker'), 'carrega reservas');
  assert(service.includes('loadContractsBySaleIds'), 'carrega contratos');
  assert(service.includes('contractsUnavailable'), 'propaga flag');
  assert(service.includes('contractsWarning'), 'propaga warning');
  assert(service.includes('contractsAvailable'), 'mapeia com flag');

  const client = read('components/broker/MySalesPageClient.tsx');
  assert(client.includes('contractsUnavailable'), 'UI lê flag');
  assert(client.includes('contractsWarning'), 'UI aviso contratos');
  assert(
    client.includes('As vendas e reservas continuam disponíveis'),
    'aviso isolado de contratos',
  );
  console.log('OK testContractsFailureDoesNotDropSalesList');
}

function testMySalesScrollPaginationMobileStructure() {
  const client = read('components/broker/MySalesPageClient.tsx');
  assert(client.includes('sv-page--scroll-y') || client.includes('SV_PAGE_MOBILE_CLASS'), 'página com rolagem');
  assert(client.includes('my-sales-pagination'), 'paginação marcada');
  assert(client.includes('showPagination'), 'paginação quando total > pageSize');
  assert(client.includes('total > pageSize'), 'condição total > pageSize');
  assert(client.includes('my-sales-mobile-cards'), 'cards mobile');
  assert(client.includes('my-sales-desktop-table'), 'tabela desktop');
  assert(client.includes('md:hidden'), 'cards só mobile');
  assert(client.includes('hidden') && client.includes('md:block'), 'tabela só desktop');
  assert(client.includes('document.body.style.overflow'), 'modal restaura overflow');
  assert(client.includes('SV_MODAL_OVERLAY_CLASS') || client.includes('sv-modal-overlay'), 'modal padrão');
  assert(!client.includes('overflow-y-hidden'), 'sem overflow-y-hidden permanente');
  assert(client.includes('listBusy'), 'loading desabilita toques repetidos');
  assert(client.includes('Data inicial'), 'filtro data inicial label mobile');
  assert(client.includes('Data final'), 'filtro data final label mobile');
  console.log('OK testMySalesScrollPaginationMobileStructure');
}

function testResolveBrokerAndApiGuards() {
  const resolveSrc = read('lib/broker/resolveAuthenticatedBroker.ts');
  assert(resolveSrc.includes('auth_user_id'), 'resolve usa auth_user_id');
  assert(resolveSrc.includes('user_id'), 'resolve fallback user_id');
  assert(BROKER_UNLINKED_MESSAGE.length > 20, 'mensagem unlinked');

  const api = read('app/api/my-sales/route.ts');
  assert(api.includes('isBrokerRole'), 'API exige isBrokerRole');
  assert(api.includes('resolveAuthenticatedBroker'), 'API resolve broker');
  assert(api.includes('brokerUnlinked'), 'API flag unlinked');
  assert(api.includes('getMySalesDetailForBroker'), 'API detalhe revalida');
  assert(api.includes('MY_SALES_QUERY_FAILED'), 'código de erro de query');
  assert(api.includes('summaryUnavailable'), 'flag summaryUnavailable');
  assert(api.includes('status: 500'), 'HTTP 500 em falha de banco');
  console.log('OK testResolveBrokerAndApiGuards');
}

function testUiDoesNotMaskQueryErrorsAsEmpty() {
  const client = read('components/broker/MySalesPageClient.tsx');
  assert(client.includes('queryFailed'), 'UI distingue falha');
  assert(client.includes('summaryUnavailable') || client.includes('Indisponível'), 'KPI indisponível');
  assert(client.includes('Consulta indisponível'), 'mensagem ≠ vazio');
  assert(client.includes('MY_SALES_QUERY_FAILED') || client.includes('json.code'), 'mostra código');
  console.log('OK testUiDoesNotMaskQueryErrorsAsEmpty');
}

function testMenuOnlyBroker() {
  const layout = read('components/Layout.tsx');
  assert(layout.includes("href: '/my-sales'"), 'menu tem /my-sales');
  assert(layout.includes('Minhas Vendas'), 'label Minhas Vendas');
  assert(layout.includes('ShoppingBag'), 'ícone ShoppingBag');

  const brokerBlockMatch = layout.match(
    /if \(isBrokerRole\(role\)\) \{[\s\S]*?return \[([\s\S]*?)\];/,
  );
  assert(Boolean(brokerBlockMatch), 'bloco isBrokerRole encontrado');
  const brokerMenu = brokerBlockMatch?.[1] || '';
  assert(brokerMenu.includes('/map'), 'broker tem Mapa GIS');
  assert(brokerMenu.includes('/my-sales'), 'broker tem Minhas Vendas');
  assert(!brokerMenu.includes('/finance'), 'broker sem Financeiro');
  assert(!brokerMenu.includes('/contracts'), 'broker sem Contratos');

  const adminBlock = layout.match(
    /if \(shouldShowFullTenantAdminMenu\(role\)\) \{[\s\S]*?return items;/,
  );
  assert(Boolean(adminBlock), 'bloco admin encontrado');
  assert(
    !String(adminBlock?.[0] || '').includes('/my-sales'),
    'admin não duplica Minhas Vendas',
  );
  console.log('OK testMenuOnlyBroker');
}

function testPageAndClientExist() {
  assert(fs.existsSync(path.join(ROOT, 'app/my-sales/page.tsx')), 'page');
  assert(
    fs.existsSync(path.join(ROOT, 'components/broker/MySalesPageClient.tsx')),
    'client',
  );
  const client = read('components/broker/MySalesPageClient.tsx');
  assert(client.includes('/api/my-sales'), 'client consome API');
  assert(!client.includes("from('sales')"), 'client não lista sales direto');
  console.log('OK testPageAndClientExist');
}

function testMiddlewareAllowsMySales() {
  const mw = read('middleware.ts');
  const blockedMatch = mw.match(/const blockedRoutes = \[([\s\S]*?)\];/);
  assert(Boolean(blockedMatch), 'blockedRoutes no middleware');
  const blocked = blockedMatch?.[1] || '';
  assert(!blocked.includes("'/my-sales'"), 'middleware não bloqueia /my-sales');
  assert(blocked.includes("'/finance'"), 'middleware ainda bloqueia finance');
  console.log('OK testMiddlewareAllowsMySales');
}

function main() {
  testBrokerRolesAllowMySales();
  testConvertedReservationNotActiveKpi();
  testDtoHasNoForbiddenFinancialKeys();
  testRealSchemaNoReservationLogsOrFullName();
  testBlockSelectSchemaContract();
  testServiceSelectWhitelistNoFinance();
  testLegacyBrokerMatchIds();
  testContractsSelectSchemaAndStatusRules();
  testCurrentContractVersionWinsOverOldPending();
  testSignatureKpiDoesNotCountNoContractAsPending();
  testContractsFailureDoesNotDropSalesList();
  testMySalesScrollPaginationMobileStructure();
  testResolveBrokerAndApiGuards();
  testUiDoesNotMaskQueryErrorsAsEmpty();
  testMenuOnlyBroker();
  testPageAndClientExist();
  testMiddlewareAllowsMySales();
  console.log('OK — mandatory-broker-my-sales-tests passed');
}

main();
