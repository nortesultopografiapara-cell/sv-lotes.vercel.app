/**
 * Fundação Split de Recebimentos — Fase 1.
 * npx tsx scripts/mandatory-payment-split-foundation-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { canManageOwners, canManageRevenueSplit } from '../lib/rolePermissions';
import {
  MemoryRevenueSplitStore,
  RevenueSplitError,
  createRevenueSplitService,
  isOperationalProjectRevenueSplit,
  ownerCanViewProjectRevenueSplit,
  planChargeRevenueSplitLegs,
  validateProjectRevenueSplit,
  type ProjectRevenueSplitParticipantInput,
  type RevenueSplitActor,
} from '../lib/finance/revenueSplit/server';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const MIGRATION = 'supabase/migrations/20261013120000_project_revenue_split_foundation.sql';
const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const COMPANY_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
const PROJECT_A = '11111111-1111-1111-1111-111111111101';
const PROJECT_B = '22222222-2222-2222-2222-222222222202';
const SALE_A = '33333333-3333-3333-3333-333333333301';
const SALE_B = '33333333-3333-3333-3333-333333333302';
const FA_LF = '44444444-4444-4444-4444-444444444401';
const FA_OLIMPIO = '44444444-4444-4444-4444-444444444402';
const FA_OTHER = '55555555-5555-5555-5555-555555555501';
const USER_OLIMPIO = '66666666-6666-6666-6666-666666666601';

const adminA: RevenueSplitActor = { role: 'ADMIN', companyId: COMPANY_A, userId: 'admin-a' };
const ownerA: RevenueSplitActor = { role: 'OWNER', companyId: COMPANY_A, userId: USER_OLIMPIO };
const brokerA: RevenueSplitActor = { role: 'BROKER', companyId: COMPANY_A, userId: 'broker-a' };
const adminB: RevenueSplitActor = { role: 'ADMIN', companyId: COMPANY_B, userId: 'admin-b' };

function olimpio40_60(): ProjectRevenueSplitParticipantInput[] {
  return [
    {
      displayName: 'LF Imóveis',
      partyKind: 'ISSUER',
      sharePercent: 40,
      isIssuerRemainder: true,
      financialAccountId: FA_LF,
      sortOrder: 0,
    },
    {
      displayName: 'Seu Olímpio',
      partyKind: 'OWNER',
      sharePercent: 60,
      isIssuerRemainder: false,
      financialAccountId: FA_OLIMPIO,
      userId: USER_OLIMPIO,
      sortOrder: 1,
    },
  ];
}

function seedStore(): MemoryRevenueSplitStore {
  const store = new MemoryRevenueSplitStore();
  store.seedProject({ id: PROJECT_A, companyId: COMPANY_A });
  store.seedProject({ id: PROJECT_B, companyId: COMPANY_B });
  store.seedSale({ id: SALE_A, companyId: COMPANY_A, projectId: PROJECT_A });
  store.seedSale({ id: SALE_B, companyId: COMPANY_A, projectId: PROJECT_A });
  store.seedUser({ id: USER_OLIMPIO, companyId: COMPANY_A });
  store.seedAccount({ id: FA_LF, companyId: COMPANY_A, active: true });
  store.seedAccount({ id: FA_OLIMPIO, companyId: COMPANY_A, active: true });
  store.seedAccount({ id: FA_OTHER, companyId: COMPANY_B, active: true });
  const now = '2026-09-13T12:00:00.000Z';
  store.seedDestination({
    id: 'dest-olimpio',
    companyId: COMPANY_A,
    financialAccountId: FA_OLIMPIO,
    provider: 'ASAAS_COMPANY',
    destinationType: 'WALLET_ID',
    destinationIdentifier: 'wallet-olimpio-60',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return store;
}

async function expectCode(fn: () => Promise<unknown>, code: string, label: string) {
  try {
    await fn();
    throw new Error(`${label}: deveria falhar com ${code}`);
  } catch (err) {
    if (!(err instanceof RevenueSplitError)) {
      throw new Error(`${label}: deveria ser RevenueSplitError (${String(err)})`);
    }
    assert(err.code === code, `${label}: esperado ${code}, obtido ${err.code}`);
  }
}

function collectPublicSqlIdents(sql: string, kind: 'fn' | 'table'): string[] {
  const re =
    kind === 'fn'
      ? /\bpublic\.(is_super_admin|is_tenant_admin|current_tenant_id|is_owner_readonly_user|reject_revenue_split_snapshot_mutation)\s*\(/g
      : /REFERENCES\s+public\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql))) {
    found.add(match[1]);
  }
  return [...found].sort();
}

function testMigrationAndRls() {
  const sql = read(MIGRATION);
  const helperSql = [
    read('supabase/migrations/20260527180000_fix_master_companies_rls.sql'),
    read('supabase/migrations/20260622130000_fix_company_admin_users_rls.sql'),
  ].join('\n');

  for (const table of [
    'project_revenue_split_configs',
    'project_revenue_split_participants',
    'sale_revenue_split_snapshots',
    'sale_revenue_split_snapshot_participants',
    'charge_revenue_split_legs',
    'financial_account_provider_destinations',
  ]) {
    assert(sql.includes(`CREATE TABLE IF NOT EXISTS public.${table}`), `tabela ${table}`);
    assert(sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`), `RLS ${table}`);
    assert(sql.includes(`${table}_select`), `policy select ${table}`);
  }
  assert(sql.includes("status IN ('DRAFT', 'ACTIVE', 'INACTIVE')"), 'status config');
  assert(sql.includes("party_kind IN ('ISSUER', 'OWNER', 'PARTNER', 'SPE')"), 'party_kind');
  assert(sql.includes("status IN ('PENDING', 'PROCESSING', 'SETTLED', 'FAILED', 'REFUNDED', 'CANCELLED')"), 'status legs');
  assert(sql.includes('numeric(7, 4)'), 'precisão percentual');
  assert(sql.includes('sale_revenue_split_snapshots is immutable'), 'imutabilidade');
  assert(sql.includes('public.is_tenant_admin()'), 'escrita positiva via is_tenant_admin');
  assert(sql.includes('public.is_super_admin()'), 'super admin');
  assert(sql.includes('public.current_tenant_id()'), 'tenant atual');
  assert(!/\bis_owner_readonly_user\s*\(/.test(sql), 'não chama helper inexistente');
  assert(!sql.includes('owner_readonly_no_insert'), 'sem policy negativa OWNER');
  assert(sql.includes('FOR INSERT'), 'policy insert');
  assert(sql.includes('FOR UPDATE'), 'policy update');
  assert(sql.includes('FOR DELETE'), 'policy delete');
  assert(
    /FOR INSERT[\s\S]*is_tenant_admin\(\)/.test(sql),
    'INSERT exige admin do tenant',
  );
  assert(sql.includes('Nunca armazena API key'), 'sem segredo no destino');
  assert(!/api_key|sandbox_api_key|production_api_key|webhook_secret/i.test(sql), 'migration sem credenciais');
  assert(sql.includes('Percentual NÃO fica em owner_project_access'), 'não usa ACL para %');
  assert(sql.includes('uq_project_revenue_split_one_issuer_remainder'), 'um emissor ativo');
  assert(sql.includes('CONSTRAINT sale_revenue_split_snapshots_sale_unique UNIQUE (sale_id)'), 'um snapshot por venda');

  const publicFns = collectPublicSqlIdents(sql, 'fn');
  const createdHere = new Set(['reject_revenue_split_snapshot_mutation']);
  const requiredExisting = publicFns.filter((name) => !createdHere.has(name));
  for (const name of ['is_super_admin', 'is_tenant_admin', 'current_tenant_id']) {
    assert(requiredExisting.includes(name), `helper ${name} referenciado`);
    assert(
      helperSql.includes(`CREATE OR REPLACE FUNCTION public.${name}()`),
      `${name}: CREATE existe nas migrations de origin/develop (não prova runtime sozinho)`,
    );
  }
  assert(!requiredExisting.includes('is_owner_readonly_user'), 'helper inexistente não referenciada');
  assert(
    requiredExisting.every((name) =>
      ['is_super_admin', 'is_tenant_admin', 'current_tenant_id'].includes(name),
    ),
    `só helpers reais: ${requiredExisting.join(', ')}`,
  );

  const fkTables = collectPublicSqlIdents(sql, 'table');
  for (const table of [
    'companies',
    'company_financial_accounts',
    'projects',
    'users',
    'sales',
    'finance_receipts',
  ]) {
    assert(fkTables.includes(table), `FK ${table}`);
  }
  console.log('OK testMigrationAndRls');
}

function testPermissions() {
  assert(canManageRevenueSplit('ADMIN'), 'ADMIN gerencia');
  assert(canManageRevenueSplit('COMPANY_ADMIN'), 'COMPANY_ADMIN gerencia');
  assert(canManageRevenueSplit('SUPER_ADMIN'), 'SUPER_ADMIN gerencia');
  assert(!canManageRevenueSplit('OWNER'), 'OWNER não gerencia');
  assert(!canManageRevenueSplit('BROKER'), 'BROKER não gerencia');
  assert(canManageRevenueSplit('ADMIN') === canManageOwners('ADMIN'), 'mesmo grupo de owners');
  assert(
    ownerCanViewProjectRevenueSplit('OWNER', PROJECT_A, [
      {
        tenant_id: COMPANY_A,
        user_id: USER_OLIMPIO,
        project_id: PROJECT_A,
        can_view_dashboard: true,
        can_view_map: true,
        can_view_finance: true,
        can_view_contracts: true,
      },
    ]),
    'OWNER vê split se can_view_finance',
  );
  assert(
    !ownerCanViewProjectRevenueSplit('OWNER', PROJECT_A, [
      {
        tenant_id: COMPANY_A,
        user_id: USER_OLIMPIO,
        project_id: PROJECT_A,
        can_view_dashboard: true,
        can_view_map: true,
        can_view_finance: false,
        can_view_contracts: true,
      },
    ]),
    'OWNER sem finance não vê split',
  );
  console.log('OK testPermissions');
}

function testCompatibilityNoAsaasEmit() {
  const ownerAccess = read('supabase/migrations/20260714120000_owner_project_access.sql');
  assert(!ownerAccess.includes('share_percent'), 'owner_project_access sem percentual');

  const mundo = read('lib/mundoNovoContractSellers.ts');
  assert(mundo.includes('seller_parties_json'), 'Mundo Novo intacto');
  console.log('OK testCompatibilityNoAsaasEmit');
}

async function testProjectWithoutSplit() {
  const store = seedStore();
  const service = createRevenueSplitService(store);
  const result = await service.getProjectRevenueSplit(PROJECT_A, COMPANY_A);
  assert(result.present === false, 'sem config');
  assert(result.operational === false, 'não operacional');
  assert(result.config === null, 'config nula');

  const freeze = await service.freezeSaleRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    saleId: SALE_A,
  });
  assert(freeze.reason === 'SPLIT_NOT_ENABLED', 'freeze sem split não cria snapshot');
  assert(freeze.snapshot === null, 'sem snapshot');
  console.log('OK testProjectWithoutSplit');
}

async function testDraftAndActivate4060() {
  const store = seedStore();
  const service = createRevenueSplitService(store);

  const draft = await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: false,
    status: 'DRAFT',
    participants: [{ displayName: 'LF Imóveis', partyKind: 'ISSUER', sharePercent: 40, isIssuerRemainder: true }],
  });
  assert(draft.config.status === 'DRAFT', 'draft');
  assert(draft.config.enabled === false, 'draft desligado');
  assert(!isOperationalProjectRevenueSplit(draft.config), 'draft não operacional');

  const active = await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: olimpio40_60(),
  });
  assert(active.config.status === 'ACTIVE', 'active');
  assert(active.participants.length === 2, '2 participantes');
  const got = await service.getProjectRevenueSplit(PROJECT_A, COMPANY_A);
  assert(got.operational === true, 'operacional 40/60');
  assert(got.participants.find((p) => p.isIssuerRemainder)?.sharePercent === 40, 'LF 40');
  assert(got.participants.find((p) => !p.isIssuerRemainder)?.sharePercent === 60, 'Olímpio 60');
  console.log('OK testDraftAndActivate4060');
}

async function testRatios3070And502525() {
  const store = seedStore();
  const service = createRevenueSplitService(store);
  const now = '2026-09-13T12:00:00.000Z';
  store.seedAccount({ id: 'fa-p2', companyId: COMPANY_A, active: true });
  store.seedAccount({ id: 'fa-p3', companyId: COMPANY_A, active: true });
  store.seedDestination({
    id: 'dest-p2',
    companyId: COMPANY_A,
    financialAccountId: 'fa-p2',
    provider: 'ASAAS_COMPANY',
    destinationType: 'WALLET_ID',
    destinationIdentifier: 'wallet-p2',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  store.seedDestination({
    id: 'dest-p3',
    companyId: COMPANY_A,
    financialAccountId: 'fa-p3',
    provider: 'ASAAS_COMPANY',
    destinationType: 'WALLET_ID',
    destinationIdentifier: 'wallet-p3',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });

  await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: [
      { displayName: 'LF', partyKind: 'ISSUER', sharePercent: 30, isIssuerRemainder: true },
      { displayName: 'Sócio', partyKind: 'PARTNER', sharePercent: 70, financialAccountId: FA_OLIMPIO },
    ],
  });
  const a = await service.getProjectRevenueSplit(PROJECT_A, COMPANY_A);
  assert(a.participants.map((p) => p.sharePercent).sort().join(',') === '30,70', '30/70');

  await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: [
      { displayName: 'LF', partyKind: 'ISSUER', sharePercent: 50, isIssuerRemainder: true },
      { displayName: 'A', partyKind: 'OWNER', sharePercent: 25, financialAccountId: 'fa-p2' },
      { displayName: 'B', partyKind: 'SPE', sharePercent: 25, financialAccountId: 'fa-p3' },
    ],
  });
  const b = await service.getProjectRevenueSplit(PROJECT_A, COMPANY_A);
  assert(b.participants.length === 3, '50/25/25');
  console.log('OK testRatios3070And502525');
}

async function testValidationRejects() {
  const store = seedStore();
  const service = createRevenueSplitService(store);
  const base = {
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true as const,
    status: 'ACTIVE' as const,
  };

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        ...base,
        participants: [
          { displayName: 'LF', partyKind: 'ISSUER', sharePercent: 40, isIssuerRemainder: true },
          { displayName: 'Olímpio', partyKind: 'OWNER', sharePercent: 50, financialAccountId: FA_OLIMPIO },
        ],
      }),
    'SHARE_SUM_BELOW_100',
    'soma 90',
  );

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        ...base,
        participants: [
          { displayName: 'LF', partyKind: 'ISSUER', sharePercent: 40, isIssuerRemainder: true },
          { displayName: 'Olímpio', partyKind: 'OWNER', sharePercent: 70, financialAccountId: FA_OLIMPIO },
        ],
      }),
    'SHARE_SUM_ABOVE_100',
    'soma 110',
  );

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        ...base,
        participants: [
          { displayName: 'LF', partyKind: 'ISSUER', sharePercent: 40, isIssuerRemainder: true },
          { displayName: 'Outro', partyKind: 'PARTNER', sharePercent: 60, isIssuerRemainder: true, financialAccountId: FA_OLIMPIO },
        ],
      }),
    'MULTIPLE_ISSUER_REMAINDER',
    'dois emissores',
  );

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        ...base,
        participants: [{ displayName: 'Olímpio', partyKind: 'OWNER', sharePercent: 100, financialAccountId: FA_OLIMPIO }],
      }),
    'ISSUER_REQUIRED',
    'nenhum emissor',
  );

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        ...base,
        participants: [
          { displayName: 'LF', partyKind: 'ISSUER', sharePercent: 100, isIssuerRemainder: true },
          { displayName: 'Zero', partyKind: 'OWNER', sharePercent: 0, financialAccountId: FA_OLIMPIO, active: true },
        ],
      }),
    'SHARE_PERCENT_RANGE',
    'percentual zero',
  );

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        ...base,
        participants: [
          { displayName: 'LF', partyKind: 'ISSUER', sharePercent: 40, isIssuerRemainder: true },
          { displayName: 'Outro tenant', partyKind: 'OWNER', sharePercent: 60, financialAccountId: FA_OTHER },
        ],
      }),
    'FINANCIAL_ACCOUNT_TENANT_MISMATCH',
    'conta outro tenant',
  );

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        actor: adminA,
        companyId: COMPANY_A,
        projectId: PROJECT_B,
        enabled: true,
        status: 'ACTIVE',
        participants: olimpio40_60(),
      }),
    'PROJECT_TENANT_MISMATCH',
    'projeto outro tenant',
  );

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        actor: ownerA,
        companyId: COMPANY_A,
        projectId: PROJECT_A,
        enabled: true,
        status: 'ACTIVE',
        participants: olimpio40_60(),
      }),
    'PERMISSION_DENIED',
    'OWNER não altera',
  );

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        actor: brokerA,
        companyId: COMPANY_A,
        projectId: PROJECT_A,
        enabled: true,
        status: 'ACTIVE',
        participants: olimpio40_60(),
      }),
    'PERMISSION_DENIED',
    'BROKER não altera',
  );

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        actor: adminB,
        companyId: COMPANY_A,
        projectId: PROJECT_A,
        enabled: true,
        status: 'ACTIVE',
        participants: olimpio40_60(),
      }),
    'TENANT_MISMATCH',
    'RLS/app cross-tenant write',
  );

  console.log('OK testValidationRejects');
}

async function testSnapshotImmutableAndIdempotent() {
  const store = seedStore();
  const service = createRevenueSplitService(store);

  await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: olimpio40_60(),
  });

  const freezeA = await service.freezeSaleRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    saleId: SALE_A,
    provider: 'ASAAS_COMPANY',
  });
  assert(freezeA.reason === 'SNAPSHOT_CREATED', 'criou snapshot A');
  assert(freezeA.participants.map((p) => p.sharePercent).sort().join(',') === '40,60', 'A 40/60');

  await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: [
      { displayName: 'LF Imóveis', partyKind: 'ISSUER', sharePercent: 45, isIssuerRemainder: true, financialAccountId: FA_LF },
      { displayName: 'Seu Olímpio', partyKind: 'OWNER', sharePercent: 55, financialAccountId: FA_OLIMPIO },
    ],
  });

  const live = await service.getProjectRevenueSplit(PROJECT_A, COMPANY_A);
  assert(live.participants.map((p) => p.sharePercent).sort().join(',') === '45,55', 'config viva 45/55');

  const againA = await service.freezeSaleRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    saleId: SALE_A,
  });
  assert(againA.duplicated === true, 'freeze repetido não duplica');
  assert(againA.snapshot?.id === freezeA.snapshot?.id, 'mesmo snapshot');
  assert(againA.participants.map((p) => p.sharePercent).sort().join(',') === '40,60', 'A permanece 40/60');
  assert(store.snapshotsBySale.size === 1, 'ainda um snapshot');

  const freezeB = await service.freezeSaleRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    saleId: SALE_B,
  });
  assert(freezeB.reason === 'SNAPSHOT_CREATED', 'venda B nova');
  assert(freezeB.participants.map((p) => p.sharePercent).sort().join(',') === '45,55', 'B 45/55');

  const legs = planChargeRevenueSplitLegs({
    snapshot: freezeA.snapshot!,
    participants: freezeA.participants,
    installmentId: 'inst-1',
    provider: 'ASAAS_COMPANY',
    grossAmount: 1000,
  });
  assert(legs.every((leg) => leg.status === 'PENDING'), 'legs pendentes');
  assert(legs.find((leg) => leg.isIssuerRemainder)?.grossAmountEstimate === 400, 'estimativa 400 informativa');
  assert(legs.find((leg) => !leg.isIssuerRemainder)?.grossAmountEstimate === 600, 'estimativa 600 informativa');
  assert(legs.every((leg) => leg.netAmount === null), 'líquido só no gateway futuro');
  console.log('OK testSnapshotImmutableAndIdempotent');
}

function testPureValidationCrossTenant() {
  const result = validateProjectRevenueSplit(
    { companyId: COMPANY_A, projectId: PROJECT_A, enabled: true, status: 'ACTIVE' },
    olimpio40_60(),
    {
      companyId: COMPANY_A,
      projectId: PROJECT_A,
      projectCompanyId: COMPANY_B,
      usersById: { [USER_OLIMPIO]: { id: USER_OLIMPIO, companyId: COMPANY_A } },
      accountsById: {
        [FA_LF]: { id: FA_LF, companyId: COMPANY_A, active: true },
        [FA_OLIMPIO]: { id: FA_OLIMPIO, companyId: COMPANY_A, active: true },
      },
      destinations: [],
    },
    'activate',
  );
  assert(!result.ok, 'projeto outro tenant falha');
  assert(result.issues.some((i) => i.code === 'PROJECT_TENANT_MISMATCH'), 'código projeto tenant');
  console.log('OK testPureValidationCrossTenant');
}

async function main() {
  testMigrationAndRls();
  testPermissions();
  testCompatibilityNoAsaasEmit();
  testPureValidationCrossTenant();
  await testProjectWithoutSplit();
  await testDraftAndActivate4060();
  await testRatios3070And502525();
  await testValidationRejects();
  await testSnapshotImmutableAndIdempotent();
  console.log('\nALL mandatory-payment-split-foundation-tests PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
