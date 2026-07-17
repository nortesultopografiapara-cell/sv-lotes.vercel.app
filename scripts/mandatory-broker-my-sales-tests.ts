/**
 * Minhas Vendas (corretor) — vínculo, isolamento conceitual, convertida≠ativa,
 * DTOs sem campos financeiros, menu só broker, rota liberada.
 *
 * npx tsx scripts/mandatory-broker-my-sales-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  formatReservationStatusLabel,
  isReservationActiveForKpi,
  resolveReservationDisplayStatus,
} from '../lib/broker/mySalesService';
import {
  MY_SALES_FORBIDDEN_FIELD_KEYS,
  type MySalesListItem,
} from '../lib/broker/mySalesTypes';
import { BROKER_UNLINKED_MESSAGE } from '../lib/broker/resolveAuthenticatedBroker';
import {
  isBrokerBlockedRoute,
  isBrokerRole,
} from '../lib/rolePermissions';

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
    blockStatus: 'reservado',
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
  assert(service.includes("from('sales')"), 'consulta sales');
  assert(service.includes("from('reservation_logs')"), 'consulta reservation_logs');
  assert(service.includes('.eq(\'broker_id\', brokerId)'), 'filtra broker_id');
  console.log('OK testServiceSelectWhitelistNoFinance');
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
  console.log('OK testResolveBrokerAndApiGuards');
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
  assert(!client.includes('from(\'sales\')'), 'client não lista sales direto');
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
  testServiceSelectWhitelistNoFinance();
  testResolveBrokerAndApiGuards();
  testMenuOnlyBroker();
  testPageAndClientExist();
  testMiddlewareAllowsMySales();
  console.log('OK — mandatory-broker-my-sales-tests passed');
}

main();
