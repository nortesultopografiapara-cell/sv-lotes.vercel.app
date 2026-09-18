/**
 * Fase 2 — freeze da identificação bancária no snapshot imutável.
 * npx tsx scripts/mandatory-revenue-split-snapshot-bank-identity-tests.ts
 *
 * Não altera legs, webhook, emissão, relatórios, Parcelas nem cadastro vivo após freeze.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  MemoryRevenueSplitStore,
  createRevenueSplitService,
  freezeInstitutionFromProvider,
  freezeSnapshotBankIdentityFromAccount,
  maskBankAccountForSnapshot,
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

const MIGRATION = 'supabase/migrations/20261019120000_sale_revenue_split_snapshot_bank_identity.sql';
const COMPANY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const PROJECT = '11111111-1111-1111-1111-111111111101';
const SALE_1 = '33333333-3333-3333-3333-333333333301';
const SALE_2 = '33333333-3333-3333-3333-333333333302';
const FA_ADMIN = '44444444-4444-4444-4444-444444444401';
const FA_ANA = '44444444-4444-4444-4444-444444444402';
const admin: RevenueSplitActor = { role: 'ADMIN', companyId: COMPANY, userId: 'admin-a' };

function participants(): ProjectRevenueSplitParticipantInput[] {
  return [
    {
      displayName: 'Administradora',
      partyKind: 'ISSUER',
      sharePercent: 50,
      isIssuerRemainder: true,
      financialAccountId: FA_ADMIN,
      sortOrder: 0,
    },
    {
      displayName: 'ANA VITORIA',
      partyKind: 'OWNER',
      sharePercent: 50,
      isIssuerRemainder: false,
      financialAccountId: FA_ANA,
      sortOrder: 1,
    },
  ];
}

function seedStore(): MemoryRevenueSplitStore {
  const store = new MemoryRevenueSplitStore();
  store.seedProject({ id: PROJECT, companyId: COMPANY });
  store.seedSale({ id: SALE_1, companyId: COMPANY, projectId: PROJECT });
  store.seedSale({ id: SALE_2, companyId: COMPANY, projectId: PROJECT });
  store.seedAccount({
    id: FA_ADMIN,
    companyId: COMPANY,
    active: true,
    beneficiaryName: 'S.V TOPOGRAFIA E PROJETO LTDA',
    provider: 'ASAAS_COMPANY',
    bankName: 'Asaas I.P. S.A',
    bankCode: '461',
    agency: '0001',
    accountNumber: '1111222',
    accountDigit: '9',
    bankAccountKind: 'CORRENTE',
  });
  store.seedAccount({
    id: FA_ANA,
    companyId: COMPANY,
    active: true,
    beneficiaryName: 'ANA VITORIA',
    provider: 'ASAAS_COMPANY',
    bankName: 'Banco A',
    bankCode: '461',
    agency: '0001',
    accountNumber: '8098370',
    accountDigit: '3',
    bankAccountKind: 'CORRENTE',
  });
  const now = '2026-09-18T12:00:00.000Z';
  store.seedDestination({
    id: 'dest-ana',
    companyId: COMPANY,
    financialAccountId: FA_ANA,
    provider: 'ASAAS_COMPANY',
    destinationType: 'WALLET_ID',
    destinationIdentifier: 'wallet-ana-asaas',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return store;
}

function testMaskAndInstitutionHelpers() {
  assert(maskBankAccountForSnapshot('8098370', '3') === '••••8370-3', 'máscara 8098370-3');
  assert(maskBankAccountForSnapshot('8370', '3') === '••••8370-3', 'máscara já com 4 dígitos');
  assert(maskBankAccountForSnapshot(null, null) === null, 'sem conta → null');
  assert(freezeInstitutionFromProvider('ASAAS_COMPANY') === 'Asaas', 'provider Asaas ≠ banco');
  assert(freezeInstitutionFromProvider(null) === null, 'sem provider não inventa instituição');
  const missing = freezeSnapshotBankIdentityFromAccount({
    id: 'x',
    companyId: COMPANY,
    beneficiaryName: 'ANA VITORIA',
    provider: 'ASAAS_COMPANY',
    bankName: null,
    bankCode: null,
    agency: null,
    accountNumber: null,
    accountDigit: null,
    bankAccountKind: null,
  });
  assert(missing.destBeneficiaryName === 'ANA VITORIA', 'titular pode congelar sem banco');
  assert(missing.destInstitution === 'Asaas', 'instituição do provider');
  assert(missing.destBankName === null, 'banco ausente = null');
  assert(missing.destAccountMasked === null, 'conta ausente = null');
  console.log('OK testMaskAndInstitutionHelpers');
}

function testMigrationAdditiveNoBackfill() {
  const sql = read(MIGRATION);
  for (const col of [
    'dest_beneficiary_name',
    'dest_institution',
    'dest_bank_name',
    'dest_bank_code',
    'dest_agency',
    'dest_account_masked',
    'dest_bank_account_kind',
  ]) {
    assert(sql.includes(col), `coluna ${col}`);
  }
  assert(sql.includes('sale_revenue_split_snapshot_participants'), 'tabela snapshot participants');
  assert(sql.includes('ADD COLUMN IF NOT EXISTS'), 'aditiva');
  assert(!/\bUPDATE\b/i.test(sql), 'sem UPDATE / backfill');
  assert(!/\bINSERT INTO\b/i.test(sql), 'sem INSERT de dados');
  assert(!/ALTER TABLE public\.charge_revenue_split_legs/i.test(sql), 'não toca legs');
  assert(!/bank_credentials/i.test(sql), 'não toca credenciais');
  assert(!/\bDELETE FROM\b/i.test(sql), 'sem delete');
  const service = read('lib/finance/revenueSplit/service.ts');
  assert(service.includes('freezeSnapshotBankIdentityFromAccount'), 'freeze no ensure/insert');
  assert(service.includes('listFinancialAccountsForSnapshotFreeze'), 'lê cadastro no freeze');
  assert(!service.includes('.update('), 'serviço de freeze não faz update de snapshot');
  const store = read('lib/finance/revenueSplit/supabaseStore.ts');
  assert(store.includes('snapshotBankIdentityToDbPayload'), 'INSERT persiste identidade bancária');
  assert(store.includes('listFinancialAccountsForSnapshotFreeze'), 'store lê contas no freeze');
  const reports = read('lib/finance/reports/splitForReport.ts');
  assert(reports.includes('destinationAmountKindForLeg'), 'relatório PENDING/SETTLED intacto');
  const parcelas = read('components/finance/ChargeRevenueSplitDistribution.tsx');
  assert(parcelas.includes('summarizeRevenueSplitLegsStatus'), 'Parcelas intactas');
  console.log('OK testMigrationAdditiveNoBackfill');
}

async function testHistoricalFreezeDoesNotFollowLiveCadastro() {
  const store = seedStore();
  const service = createRevenueSplitService(store);

  await service.saveProjectRevenueSplit({
    actor: admin,
    companyId: COMPANY,
    projectId: PROJECT,
    enabled: true,
    status: 'ACTIVE',
    participants: participants(),
  });

  const freeze1 = await service.freezeSaleRevenueSplit({
    actor: admin,
    companyId: COMPANY,
    saleId: SALE_1,
    provider: 'ASAAS_COMPANY',
  });
  assert(freeze1.reason === 'SNAPSHOT_CREATED', 'congelou venda 1');
  const ana1 = freeze1.participants.find((p) => p.displayName === 'ANA VITORIA');
  assert(ana1?.destBankName === 'Banco A', 'venda 1 banco A');
  assert(ana1?.destAgency === '0001', 'venda 1 agência 0001');
  assert(ana1?.destAccountMasked === '••••8370-3', 'venda 1 máscara ••••8370-3');
  assert(ana1?.destInstitution === 'Asaas', 'instituição Asaas, não banco');
  assert(ana1?.destinationIdentifier === 'wallet-ana-asaas', 'wallet técnica preservada');
  assert(ana1?.destBankName !== ana1?.destInstitution, 'banco ≠ instituição');

  store.seedAccount({
    id: FA_ANA,
    companyId: COMPANY,
    active: true,
    beneficiaryName: 'ANA VITORIA',
    provider: 'ASAAS_COMPANY',
    bankName: 'Banco B',
    bankCode: '341',
    agency: '9999',
    accountNumber: '5555666',
    accountDigit: '1',
    bankAccountKind: 'POUPANCA',
  });

  const again1 = await service.freezeSaleRevenueSplit({
    actor: admin,
    companyId: COMPANY,
    saleId: SALE_1,
  });
  const ana1Again = again1.participants.find((p) => p.displayName === 'ANA VITORIA');
  assert(again1.duplicated === true, 'freeze repetido não reescreve');
  assert(ana1Again?.destBankName === 'Banco A', 'venda 1 permanece Banco A');
  assert(ana1Again?.destAgency === '0001', 'venda 1 permanece 0001');
  assert(ana1Again?.destAccountMasked === '••••8370-3', 'venda 1 permanece máscara antiga');

  const freeze2 = await service.freezeSaleRevenueSplit({
    actor: admin,
    companyId: COMPANY,
    saleId: SALE_2,
    provider: 'ASAAS_COMPANY',
  });
  const ana2 = freeze2.participants.find((p) => p.displayName === 'ANA VITORIA');
  assert(freeze2.reason === 'SNAPSHOT_CREATED', 'congelou venda 2');
  assert(ana2?.destBankName === 'Banco B', 'venda 2 banco B');
  assert(ana2?.destAgency === '9999', 'venda 2 agência 9999');
  assert(ana2?.destAccountMasked === '••••5666-1', 'venda 2 nova máscara');
  assert(ana1Again?.destAccountMasked !== ana2?.destAccountMasked, 'históricos distintos');
  console.log('OK testHistoricalFreezeDoesNotFollowLiveCadastro');
}

async function testIssuerRemainderFreezesBankIdentityWithoutWallet() {
  const store = seedStore();
  const service = createRevenueSplitService(store);
  await service.saveProjectRevenueSplit({
    actor: admin,
    companyId: COMPANY,
    projectId: PROJECT,
    enabled: true,
    status: 'ACTIVE',
    participants: participants(),
  });
  const freeze = await service.freezeSaleRevenueSplit({
    actor: admin,
    companyId: COMPANY,
    saleId: SALE_1,
  });
  const issuer = freeze.participants.find((p) => p.isIssuerRemainder);
  assert(Boolean(issuer), 'issuer presente');
  assert(issuer?.destinationIdentifier == null, 'issuer sem wallet artificial');
  assert(issuer?.destinationType == null, 'issuer destination_type null');
  assert(issuer?.financialAccountId === FA_ADMIN, 'issuer usa financial_account_id');
  assert(issuer?.destBeneficiaryName === 'S.V TOPOGRAFIA E PROJETO LTDA', 'titular issuer congelado');
  assert(issuer?.destInstitution === 'Asaas', 'instituição issuer');
  assert(issuer?.destBankName === 'Asaas I.P. S.A', 'banco cadastral issuer');
  assert(issuer?.destAgency === '0001', 'agência issuer');
  assert(issuer?.destAccountMasked === '••••1222-9', 'conta mascarada issuer');
  assert(issuer?.destBankAccountKind === 'CORRENTE', 'tipo issuer');
  console.log('OK testIssuerRemainderFreezesBankIdentityWithoutWallet');
}

async function testMissingBankIdentityDoesNotBlockFreeze() {
  const store = seedStore();
  store.seedAccount({
    id: FA_ANA,
    companyId: COMPANY,
    active: true,
    beneficiaryName: 'ANA VITORIA',
    provider: 'ASAAS_COMPANY',
  });
  const service = createRevenueSplitService(store);
  await service.saveProjectRevenueSplit({
    actor: admin,
    companyId: COMPANY,
    projectId: PROJECT,
    enabled: true,
    status: 'ACTIVE',
    participants: participants(),
  });
  const freeze = await service.freezeSaleRevenueSplit({
    actor: admin,
    companyId: COMPANY,
    saleId: SALE_1,
  });
  assert(freeze.reason === 'SNAPSHOT_CREATED', 'freeze não bloqueia sem banco');
  const ana = freeze.participants.find((p) => p.displayName === 'ANA VITORIA');
  assert(ana?.destBankName == null, 'banco ausente = null');
  assert(ana?.destAgency == null, 'agência ausente = null');
  assert(ana?.destAccountMasked == null, 'conta ausente = null');
  assert(ana?.sharePercent === 50, 'percentual intacto');
  console.log('OK testMissingBankIdentityDoesNotBlockFreeze');
}

async function main() {
  testMaskAndInstitutionHelpers();
  testMigrationAdditiveNoBackfill();
  await testHistoricalFreezeDoesNotFollowLiveCadastro();
  await testIssuerRemainderFreezesBankIdentityWithoutWallet();
  await testMissingBankIdentityDoesNotBlockFreeze();
  console.log('mandatory-revenue-split-snapshot-bank-identity-tests: OK');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
