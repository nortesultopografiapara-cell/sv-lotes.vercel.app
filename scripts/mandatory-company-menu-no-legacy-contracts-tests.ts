/**
 * Regressão — menu empresarial nunca exibe Contratos Antigos.
 * npm run test:company-menu-no-legacy-contracts
 *
 * Garante ocultação global (sem company_id / tenant / plano / seed).
 * Rota /legacy-contracts e módulo permanecem para manutenção direta.
 */

import fs from 'node:fs';
import path from 'node:path';
import { LEGACY_CONTRACTS_ROUTE } from '../lib/legacy-contracts/constants';
import { getOwnerMenuItemsFromPermissions } from '../lib/ownerProjectAccess';
import type { OwnerProjectAccessRow } from '../lib/ownerProjectAccess';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const FORBIDDEN_LABEL = 'Contratos Antigos';
const FORBIDDEN_HREF = '/legacy-contracts';

function testLayoutCompanyNavigationHasNoLegacyContracts() {
  const layout = read('components/Layout.tsx');

  assert(!layout.includes(`name: '${FORBIDDEN_LABEL}'`), 'Layout sem label Contratos Antigos');
  assert(!layout.includes(`name: "${FORBIDDEN_LABEL}"`), 'Layout sem label (aspas duplas)');
  assert(!layout.includes(LEGACY_CONTRACTS_ROUTE), 'Layout sem LEGACY_CONTRACTS_ROUTE no menu');
  assert(!layout.includes(`href: '${FORBIDDEN_HREF}'`), 'Layout sem href /legacy-contracts');
  assert(!layout.includes(`href: "${FORBIDDEN_HREF}"`), 'Layout sem href /legacy-contracts (aspas)');
  assert(!layout.includes("'/legacy-contracts':"), 'Layout sem ícone de menu legacy');
  assert(layout.includes("name: 'Contratos'"), 'Contratos permanece no menu');
  assert(layout.includes("href: '/contracts'"), 'href /contracts permanece');
  assert(!layout.includes('canAccessLegacyContractsModule'), 'menu não depende de permissão legacy');
  assert(fs.existsSync(path.join(ROOT, 'app/legacy-contracts/page.tsx')), 'rota preservada');
  assert(LEGACY_CONTRACTS_ROUTE === FORBIDDEN_HREF, 'constante de rota preservada');

  console.log('OK testLayoutCompanyNavigationHasNoLegacyContracts');
}

function testOwnerMenuBuilderHasNoLegacyContracts() {
  const ownerSource = read('lib/ownerProjectAccess.ts');
  assert(
    !ownerSource.includes(`name: '${FORBIDDEN_LABEL}'`),
    'ownerProjectAccess sem label Contratos Antigos',
  );
  assert(
    !ownerSource.includes(`items.push({ name: '${FORBIDDEN_LABEL}'`),
    'owner menu builder sem push do item legado',
  );
  assert(
    !ownerSource.includes(`href: '${FORBIDDEN_HREF}' }`),
    'owner menu builder sem href legado no push',
  );

  const rows: OwnerProjectAccessRow[] = [
    {
      tenant_id: 'tenant-1',
      user_id: 'owner-1',
      project_id: 'project-1',
      can_view_dashboard: true,
      can_view_map: true,
      can_view_finance: true,
      can_view_contracts: true,
    },
  ];
  const menu = getOwnerMenuItemsFromPermissions(
    {
      can_view_dashboard: true,
      can_view_map: true,
      can_view_finance: true,
      can_view_contracts: true,
    },
    rows,
  );

  assert(menu.some((item) => item.href === '/contracts' && item.name === 'Contratos'), 'Contratos ok');
  assert(!menu.some((item) => item.name === FORBIDDEN_LABEL), 'OWNER sem label legado');
  assert(!menu.some((item) => item.href === FORBIDDEN_HREF), 'OWNER sem href legado');
  assert(!menu.some((item) => item.href === LEGACY_CONTRACTS_ROUTE), 'OWNER sem chave de rota legada');

  console.log('OK testOwnerMenuBuilderHasNoLegacyContracts');
}

function testNoTenantSeedReintroducesMenuItem() {
  // Menu empresarial é montado só em Layout + ownerProjectAccess (código global).
  // Não há seed/onboarding por company_id que registre itens de navegação.
  const candidates = [
    'components/Layout.tsx',
    'lib/ownerProjectAccess.ts',
    'lib/companyAdminUsers.ts',
    'lib/rolePermissions.ts',
  ].filter((rel) => fs.existsSync(path.join(ROOT, rel)));

  for (const rel of candidates) {
    const src = read(rel);
    assert(
      !src.includes(`name: '${FORBIDDEN_LABEL}'`),
      `${rel}: sem item de menu legado`,
    );
    assert(
      !src.includes(`push({ name: '${FORBIDDEN_LABEL}'`),
      `${rel}: sem push dinâmico do item legado`,
    );
  }

  console.log('OK testNoTenantSeedReintroducesMenuItem');
}

function main() {
  testLayoutCompanyNavigationHasNoLegacyContracts();
  testOwnerMenuBuilderHasNoLegacyContracts();
  testNoTenantSeedReintroducesMenuItem();
  console.log('\nTodos os testes de regressão do menu (sem Contratos Antigos) passaram.');
}

main();
