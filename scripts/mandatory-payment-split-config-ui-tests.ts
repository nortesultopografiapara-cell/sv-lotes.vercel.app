/**
 * Split de Recebimentos — Fase 2 (UI, APIs, participantes múltiplos).
 * npx tsx scripts/mandatory-payment-split-config-ui-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { canManageRevenueSplit } from '../lib/rolePermissions';
import {
  MemoryRevenueSplitStore,
  RevenueSplitError,
  createRevenueSplitService,
  formatSharePercent,
  isExactHundredPercent,
  isOperationalProjectRevenueSplit,
  parseSharePercentInput,
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

const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const COMPANY_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
const PROJECT_A = '11111111-1111-1111-1111-111111111101';
const PROJECT_B = '22222222-2222-2222-2222-222222222202';
const FA_LF = '44444444-4444-4444-4444-444444444401';
const FA_A = '44444444-4444-4444-4444-444444444402';
const FA_B = '44444444-4444-4444-4444-444444444403';
const FA_C = '44444444-4444-4444-4444-444444444404';
const FA_OTHER = '55555555-5555-5555-5555-555555555501';
const USER_A = '66666666-6666-6666-6666-666666666601';
const USER_B = '66666666-6666-6666-6666-666666666602';
const USER_C = '66666666-6666-6666-6666-666666666603';
const USER_OTHER = '77777777-7777-7777-7777-777777777701';

const adminA: RevenueSplitActor = { role: 'ADMIN', companyId: COMPANY_A, userId: 'admin-a' };
const ownerA: RevenueSplitActor = { role: 'OWNER', companyId: COMPANY_A, userId: USER_A };
const brokerA: RevenueSplitActor = { role: 'BROKER', companyId: COMPANY_A, userId: 'broker-a' };
const adminB: RevenueSplitActor = { role: 'ADMIN', companyId: COMPANY_B, userId: 'admin-b' };

function seedStore(): MemoryRevenueSplitStore {
  const store = new MemoryRevenueSplitStore();
  store.seedProject({ id: PROJECT_A, companyId: COMPANY_A });
  store.seedProject({ id: PROJECT_B, companyId: COMPANY_B });
  store.seedUser({ id: USER_A, companyId: COMPANY_A });
  store.seedUser({ id: USER_B, companyId: COMPANY_A });
  store.seedUser({ id: USER_C, companyId: COMPANY_A });
  store.seedUser({ id: USER_OTHER, companyId: COMPANY_B });
  store.seedAccount({ id: FA_LF, companyId: COMPANY_A, active: true });
  store.seedAccount({ id: FA_A, companyId: COMPANY_A, active: true });
  store.seedAccount({ id: FA_B, companyId: COMPANY_A, active: true });
  store.seedAccount({ id: FA_C, companyId: COMPANY_A, active: true });
  store.seedAccount({ id: FA_OTHER, companyId: COMPANY_B, active: true });
  const now = '2026-09-13T12:00:00.000Z';
  for (const [id, accountId, wallet] of [
    ['dest-a', FA_A, 'wallet-a'],
    ['dest-b', FA_B, 'wallet-b'],
    ['dest-c', FA_C, 'wallet-c'],
  ] as const) {
    store.seedDestination({
      id,
      companyId: COMPANY_A,
      financialAccountId: accountId,
      provider: 'ASAAS_COMPANY',
      destinationType: 'WALLET_ID',
      destinationIdentifier: wallet,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
  }
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

function two(): ProjectRevenueSplitParticipantInput[] {
  return [
    {
      displayName: 'Beleza Imobiliária',
      partyKind: 'ISSUER',
      sharePercent: 20,
      isIssuerRemainder: true,
      financialAccountId: FA_LF,
      sortOrder: 0,
    },
    {
      displayName: 'Sócio A',
      partyKind: 'OWNER',
      sharePercent: 80,
      financialAccountId: FA_A,
      userId: USER_A,
      sortOrder: 1,
    },
  ];
}

function three(): ProjectRevenueSplitParticipantInput[] {
  return [
    {
      displayName: 'Beleza Imobiliária',
      partyKind: 'ISSUER',
      sharePercent: 20,
      isIssuerRemainder: true,
      financialAccountId: FA_LF,
    },
    {
      displayName: 'Sócio A',
      partyKind: 'OWNER',
      sharePercent: 40,
      financialAccountId: FA_A,
      userId: USER_A,
    },
    {
      displayName: 'Sócio B',
      partyKind: 'OWNER',
      sharePercent: 40,
      financialAccountId: FA_B,
      userId: USER_B,
    },
  ];
}

function four(): ProjectRevenueSplitParticipantInput[] {
  return [
    {
      displayName: 'Administradora',
      partyKind: 'ISSUER',
      sharePercent: 25,
      isIssuerRemainder: true,
      financialAccountId: FA_LF,
    },
    {
      displayName: 'Proprietário A',
      partyKind: 'OWNER',
      sharePercent: 25,
      financialAccountId: FA_A,
      userId: USER_A,
    },
    {
      displayName: 'Proprietário B',
      partyKind: 'OWNER',
      sharePercent: 25,
      financialAccountId: FA_B,
      userId: USER_B,
    },
    {
      displayName: 'Proprietário C',
      partyKind: 'OWNER',
      sharePercent: 25,
      financialAccountId: FA_C,
      userId: USER_C,
    },
  ];
}

function testUiAndApiFiles() {
  const panel = read('components/projects/ProjectRevenueSplitPanel.tsx');
  const ownersUi = read('app/owners/page.tsx');
  const ownersModal = read('components/owners/OwnerRevenueSplitModal.tsx');
  const mapPage = read('app/map/page.tsx');
  const projectApi = read('app/api/projects/[id]/revenue-split/route.ts');
  const destApi = read('app/api/finance/revenue-split/destinations/route.ts');
  const ownerApi = read('app/api/owners/[id]/revenue-split/route.ts');

  assert(mapPage.includes('ProjectRevenueSplitPanel'), 'painel no empreendimento');
  assert(mapPage.includes('Distribuição') || panel.includes('Distribuição de Recebimentos'), 'bloco no empreendimento');
  assert(panel.includes('Adicionar participante'), 'lista dinâmica');
  assert(panel.includes('Salvar rascunho'), 'ação draft');
  assert(panel.includes('Ativar Split'), 'ação activate');
  assert(panel.includes('Desativar Split'), 'ação deactivate');
  assert(panel.includes('Configurar Split'), 'CTA sem config');
  assert(panel.includes('type="radio"'), 'um emissor via radio');
  assert(panel.includes('Total distribuído'), 'rodapé total');
  assert(panel.includes('REVENUE_SPLIT_MISSING_WALLET_MESSAGE'), 'mensagem wallet');
  assert(panel.includes('REVENUE_SPLIT_WALLET_LINKED_LABEL'), 'status vinculada');
  assert(panel.includes('REVENUE_SPLIT_CONFIGURE_ACCOUNT_LABEL'), 'atalho conta financeira');
  assert(!panel.includes('walletId da conta Asaas de destino'), 'sem digitação manual no fluxo normal');
  assert(panel.includes('Modo avançado (SUPER_ADMIN)'), 'fallback só SUPER_ADMIN');
  assert(panel.includes('Preview informativo'), 'preview');
  assert(!panel.includes('apiKey') && !panel.includes('Client Secret'), 'UI sem segredo');

  const accountsPanel = read('components/finance/FinancialAccountsPanel.tsx');
  assert(accountsPanel.includes('Carteira para Split'), 'bloco carteira nas configurações');
  assert(accountsPanel.includes('Validar conexão e buscar Wallet ID'), 'botão validar wallet');
  assert(accountsPanel.includes('Não vinculada'), 'status inicial');
  assert(accountsPanel.includes('/api/finance/asaas/accounts/'), 'chama resolve-wallet');
  assert(accountsPanel.includes('não precisam de URL nem token de webhook'), 'destinatário sem webhook');

  const resolveRoute = read('app/api/finance/asaas/accounts/[id]/resolve-wallet/route.ts');
  assert(resolveRoute.includes('authorizeCompanyAsaasRoute'), 'resolve-wallet autenticada');
  assert(resolveRoute.includes('canResolveAsaasWallet'), 'admin only');
  assert(resolveRoute.includes('rejectAsaasSecretInRequestBody'), 'recusa apiKey no body');
  assert(!resolveRoute.includes('webhook'), 'não cria webhook no destinatário');

  assert(ownersUi.includes('Participação financeira'), 'atalho sócios');
  assert(ownersUi.includes('OwnerRevenueSplitModal'), 'modal sócios');
  assert(!ownersModal.includes('owner_project_access'), 'modal não grava ACL');
  assert(ownersModal.includes('A participação financeira fica nas tabelas de Split'), 'fonte revenue_split');

  assert(projectApi.includes("action === 'activate'"), 'API activate');
  assert(projectApi.includes("action === 'deactivate'"), 'API deactivate');
  assert(projectApi.includes('saveProjectRevenueSplit'), 'reusa service');
  assert(projectApi.includes('getProjectRevenueSplitView'), 'GET view');
  assert(destApi.includes('upsertAsaasWalletDestination'), 'API wallet');
  assert(destApi.includes('Não envie API key'), 'API recusa key');
  assert(ownerApi.includes('listOwnerParticipations'), 'API participações');
  console.log('OK testUiAndApiFiles');
}

function testCompatibilityNoAsaasEmit() {
  const ownerAccess = read('supabase/migrations/20260714120000_owner_project_access.sql');
  assert(!ownerAccess.includes('share_percent'), 'owner_project_access sem %');
  const chargeService = read('lib/finance/asaasCompanyChargeService.ts');
  assert(!chargeService.includes('freezeSaleRevenueSplit'), 'emit usa ensure, não freeze admin');
  const saleCharges = read('lib/finance/saleChargesService.ts');
  assert(!saleCharges.includes('freezeSaleRevenueSplit'), 'sale charges sem freeze');
  console.log('OK testCompatibilityNoAsaasEmit');
}

function testShareFormatting() {
  assert(formatSharePercent(100) === '100,0000', '100 formatado');
  assert(formatSharePercent(99.9999) === '99,9999', '99,9999 formatado');
  assert(formatSharePercent(100.0001) === '100,0001', '100,0001 formatado');
  assert(isExactHundredPercent([40, 60]), '40+60');
  assert(isExactHundredPercent([33.3333, 33.3333, 33.3334]), 'terços');
  assert(!isExactHundredPercent([99.9999]), '99,9999 inválido');
  assert(!isExactHundredPercent([100.0001]), '100,0001 inválido');
  assert(parseSharePercentInput('33,3333') === 33.3333, 'parse vírgula');
  console.log('OK testShareFormatting');
}

function testRoles() {
  assert(canManageRevenueSplit('ADMIN'), 'admin edita');
  assert(canManageRevenueSplit('ADMIN_EMPRESA'), 'admin empresa edita');
  assert(canManageRevenueSplit('COMPANY_ADMIN'), 'company admin edita');
  assert(!canManageRevenueSplit('OWNER'), 'OWNER não edita');
  assert(!canManageRevenueSplit('BROKER'), 'BROKER não edita');
  console.log('OK testRoles');
}

async function testNoConfig() {
  const store = seedStore();
  const service = createRevenueSplitService(store);
  const view = await service.getProjectRevenueSplitView(PROJECT_A, COMPANY_A);
  assert(view.present === false, 'sem config');
  assert(view.operational === false, 'não operacional');
  assert(view.participants.length === 0, 'sem participantes');
  console.log('OK testNoConfig');
}

async function testDraftIncompleteAndActivate() {
  const store = seedStore();
  const service = createRevenueSplitService(store);

  const draft = await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: false,
    status: 'DRAFT',
    participants: [
      {
        displayName: 'Beleza Imobiliária',
        partyKind: 'ISSUER',
        sharePercent: 20,
        isIssuerRemainder: true,
      },
      {
        displayName: 'Sócio A',
        partyKind: 'OWNER',
        sharePercent: 80,
      },
    ],
  });
  assert(draft.config.status === 'DRAFT', 'draft salvo incompleto');
  assert(draft.config.enabled === false, 'draft não enabled');
  assert(!isOperationalProjectRevenueSplit(draft.config), 'draft não operacional');

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        actor: adminA,
        companyId: COMPANY_A,
        projectId: PROJECT_A,
        enabled: true,
        status: 'ACTIVE',
        participants: [
          {
            displayName: 'Beleza Imobiliária',
            partyKind: 'ISSUER',
            sharePercent: 40,
            isIssuerRemainder: true,
            financialAccountId: FA_LF,
          },
          {
            displayName: 'Sócio A',
            partyKind: 'OWNER',
            sharePercent: 60,
          },
        ],
      }),
    'DESTINATION_ACCOUNT_REQUIRED',
    'ACTIVE exige conta no não-emissor',
  );

  const withAccountNoWallet = [
    {
      displayName: 'Beleza Imobiliária',
      partyKind: 'ISSUER' as const,
      sharePercent: 40,
      isIssuerRemainder: true,
      financialAccountId: FA_LF,
    },
    {
      displayName: 'Sócio sem carteira',
      partyKind: 'OWNER' as const,
      sharePercent: 60,
      financialAccountId: FA_LF,
    },
  ];
  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        actor: adminA,
        companyId: COMPANY_A,
        projectId: PROJECT_A,
        enabled: true,
        status: 'ACTIVE',
        participants: withAccountNoWallet,
      }),
    'DESTINATION_REQUIRED',
    'não-emissor sem wallet não ativa',
  );

  const activated = await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: two(),
  });
  assert(activated.config.status === 'ACTIVE', 'ativou');
  assert(isOperationalProjectRevenueSplit(activated.config), 'ativo operacional');

  const deactivated = await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: false,
    status: 'INACTIVE',
    participants: two(),
  });
  assert(deactivated.config.status === 'INACTIVE', 'inativou');
  assert(!isOperationalProjectRevenueSplit(deactivated.config), 'INACTIVE não é tratada como ativa');
  const live = await service.getProjectRevenueSplit(PROJECT_A, COMPANY_A);
  assert(live.present === true, 'config permanece');
  assert(live.operational === false, 'inactive não operacional');
  console.log('OK testDraftIncompleteAndActivate');
}

async function testMultipleParticipantsPersist() {
  const store = seedStore();
  const service = createRevenueSplitService(store);

  await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: false,
    status: 'DRAFT',
    participants: two(),
  });
  let current = await service.getProjectRevenueSplit(PROJECT_A, COMPANY_A);
  assert(current.participants.length === 2, '2 participantes');

  await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: three(),
  });
  current = await service.getProjectRevenueSplit(PROJECT_A, COMPANY_A);
  assert(current.participants.length === 3, '3 participantes');
  assert(
    current.participants.map((row) => row.sharePercent).sort().join(',') === '20,40,40',
    '20/40/40 persistido',
  );

  await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: four(),
  });
  current = await service.getProjectRevenueSplit(PROJECT_A, COMPANY_A);
  assert(current.participants.length === 4, '4 participantes');
  assert(current.participants.every((row) => row.sharePercent === 25), '4x25 persistido');

  await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: three(),
  });
  current = await service.getProjectRevenueSplit(PROJECT_A, COMPANY_A);
  assert(current.participants.length === 3, 'removeu participante');
  console.log('OK testMultipleParticipantsPersist');
}

async function testIssuerSwapAndSingleIssuer() {
  const store = seedStore();
  const service = createRevenueSplitService(store);

  await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: two(),
  });

  const swapped = await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: [
      {
        displayName: 'Beleza Imobiliária',
        partyKind: 'OWNER',
        sharePercent: 20,
        isIssuerRemainder: false,
        financialAccountId: FA_A,
      },
      {
        displayName: 'Sócio A',
        partyKind: 'ISSUER',
        sharePercent: 80,
        isIssuerRemainder: true,
        financialAccountId: FA_LF,
      },
    ],
  });
  assert(swapped.participants.filter((row) => row.isIssuerRemainder).length === 1, 'um emissor');
  assert(
    swapped.participants.find((row) => row.isIssuerRemainder)?.displayName === 'Sócio A',
    'emissor trocado',
  );

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        actor: adminA,
        companyId: COMPANY_A,
        projectId: PROJECT_A,
        enabled: true,
        status: 'ACTIVE',
        participants: [
          {
            displayName: 'A',
            partyKind: 'ISSUER',
            sharePercent: 50,
            isIssuerRemainder: true,
            financialAccountId: FA_LF,
          },
          {
            displayName: 'B',
            partyKind: 'ISSUER',
            sharePercent: 50,
            isIssuerRemainder: true,
            financialAccountId: FA_A,
          },
        ],
      }),
    'MULTIPLE_ISSUER_REMAINDER',
    'impede dois emissores',
  );

  const issuerNoWallet = await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: [
      {
        displayName: 'LF Imóveis',
        partyKind: 'ISSUER',
        sharePercent: 40,
        isIssuerRemainder: true,
      },
      {
        displayName: 'Sócio A',
        partyKind: 'OWNER',
        sharePercent: 60,
        financialAccountId: FA_A,
      },
    ],
  });
  assert(
    issuerNoWallet.participants.find((row) => row.isIssuerRemainder)?.financialAccountId == null,
    'emissor sem wallet permitido',
  );
  console.log('OK testIssuerSwapAndSingleIssuer');
}

async function testTotalsForActivate() {
  const store = seedStore();
  const service = createRevenueSplitService(store);
  const base = two();

  const ok = await service.inspectProjectRevenueSplit({
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: base,
  });
  assert(ok.ok, '100 válido para ativar');

  const below = await service.inspectProjectRevenueSplit({
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: [
      { ...base[0], sharePercent: 39.9999 },
      { ...base[1], sharePercent: 60 },
    ],
  });
  assert(!below.ok, '99,9999 inválido');
  assert(below.issues.some((issue) => issue.code === 'SHARE_SUM_BELOW_100'), 'código abaixo');

  const above = await service.inspectProjectRevenueSplit({
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: [
      { ...base[0], sharePercent: 40.0001 },
      { ...base[1], sharePercent: 60 },
    ],
  });
  assert(!above.ok, '100,0001 inválido');
  assert(above.issues.some((issue) => issue.code === 'SHARE_SUM_ABOVE_100'), 'código acima');
  console.log('OK testTotalsForActivate');
}

async function testCrossTenantAndPermissions() {
  const store = seedStore();
  const service = createRevenueSplitService(store);

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        actor: adminA,
        companyId: COMPANY_A,
        projectId: PROJECT_A,
        enabled: false,
        status: 'DRAFT',
        participants: [
          {
            displayName: 'Local',
            partyKind: 'ISSUER',
            sharePercent: 50,
            isIssuerRemainder: true,
            financialAccountId: FA_LF,
          },
          {
            displayName: 'Outro tenant',
            partyKind: 'OWNER',
            sharePercent: 50,
            userId: USER_OTHER,
            financialAccountId: FA_A,
          },
        ],
      }),
    'USER_TENANT_MISMATCH',
    'usuário cross-tenant',
  );

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        actor: adminA,
        companyId: COMPANY_A,
        projectId: PROJECT_A,
        enabled: false,
        status: 'DRAFT',
        participants: [
          {
            displayName: 'Local',
            partyKind: 'ISSUER',
            sharePercent: 50,
            isIssuerRemainder: true,
            financialAccountId: FA_LF,
          },
          {
            displayName: 'Conta errada',
            partyKind: 'OWNER',
            sharePercent: 50,
            financialAccountId: FA_OTHER,
          },
        ],
      }),
    'FINANCIAL_ACCOUNT_TENANT_MISMATCH',
    'conta financeira cross-tenant',
  );

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        actor: ownerA,
        companyId: COMPANY_A,
        projectId: PROJECT_A,
        enabled: false,
        status: 'DRAFT',
        participants: two(),
      }),
    'PERMISSION_DENIED',
    'OWNER não edita',
  );

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        actor: brokerA,
        companyId: COMPANY_A,
        projectId: PROJECT_A,
        enabled: false,
        status: 'DRAFT',
        participants: two(),
      }),
    'PERMISSION_DENIED',
    'BROKER não edita',
  );

  await expectCode(
    () =>
      service.upsertAsaasWalletDestination({
        actor: adminA,
        companyId: COMPANY_A,
        financialAccountId: FA_OTHER,
        walletId: 'wallet-x',
      }),
    'FINANCIAL_ACCOUNT_TENANT_MISMATCH',
    'wallet conta outro tenant',
  );

  await expectCode(
    () =>
      service.upsertAsaasWalletDestination({
        actor: adminA,
        companyId: COMPANY_A,
        financialAccountId: FA_A,
        walletId: 'aact_secret_token',
      }),
    'WALLET_REJECTED',
    'rejeita api key/token',
  );

  const wallet = await service.upsertAsaasWalletDestination({
    actor: adminA,
    companyId: COMPANY_A,
    financialAccountId: FA_LF,
    walletId: 'wallet-lf-ok',
  });
  assert(wallet.destinationIdentifier === 'wallet-lf-ok', 'wallet salva');
  assert(wallet.destinationType === 'WALLET_ID', 'tipo wallet');

  const saved = await service.saveProjectRevenueSplit({
    actor: adminA,
    companyId: COMPANY_A,
    projectId: PROJECT_A,
    enabled: true,
    status: 'ACTIVE',
    participants: two(),
  });
  assert(saved.config.status === 'ACTIVE', 'admin edita');

  const listed = await service.listOwnerParticipations({
    actor: adminA,
    companyId: COMPANY_A,
    userId: USER_A,
  });
  assert(listed.participants.length === 1, 'participação do sócio');
  assert(listed.participants[0].sharePercent === 80, '% não veio de owner_project_access');

  await expectCode(
    () =>
      service.listOwnerParticipations({
        actor: adminA,
        companyId: COMPANY_A,
        userId: USER_OTHER,
      }),
    'USER_TENANT_MISMATCH',
    'participações de outro tenant',
  );

  await expectCode(
    () =>
      service.saveProjectRevenueSplit({
        actor: adminB,
        companyId: COMPANY_A,
        projectId: PROJECT_A,
        enabled: true,
        status: 'ACTIVE',
        participants: two(),
      }),
    'TENANT_MISMATCH',
    'admin de outra empresa',
  );
  console.log('OK testCrossTenantAndPermissions');
}

async function main() {
  testUiAndApiFiles();
  testCompatibilityNoAsaasEmit();
  testShareFormatting();
  testRoles();
  await testNoConfig();
  await testDraftIncompleteAndActivate();
  await testMultipleParticipantsPersist();
  await testIssuerSwapAndSingleIssuer();
  await testTotalsForActivate();
  await testCrossTenantAndPermissions();
  console.log('\nALL mandatory-payment-split-config-ui-tests PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
