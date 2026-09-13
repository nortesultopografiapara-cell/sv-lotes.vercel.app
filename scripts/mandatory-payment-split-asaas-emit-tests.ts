/**
 * Fase 3 — emissão Asaas Company com Split (Sandbox).
 * npx tsx scripts/mandatory-payment-split-asaas-emit-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildAsaasCompanyCreatePaymentBody } from '../lib/finance/asaasCompanyClient';
import {
  INTER_REVENUE_SPLIT_UNSUPPORTED_MESSAGE,
  MemoryRevenueSplitStore,
  RevenueSplitError,
  applyAsaasSplitWebhookToLegs,
  assertAsaasCompanySplitWalletsPresent,
  assertAsaasSandboxForSplit,
  buildAsaasCompanyRemoteSplits,
  classifyCompanyAsaasWebhookEvent,
  createRevenueSplitService,
  mapAsaasRemoteSplitStatus,
  prepareAsaasCompanyChargeSplit,
  remoteLegsForAsaasCompany,
  shouldReconcileCompanyAsaasPayment,
  type ChargeRevenueSplitLeg,
  type ProjectRevenueSplitParticipantInput,
} from '../lib/finance/revenueSplit';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const COMPANY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const PROJECT = '11111111-1111-1111-1111-111111111101';
const SALE_A = '33333333-3333-3333-3333-333333333301';
const SALE_B = '33333333-3333-3333-3333-333333333302';
const FA_ISSUER = '44444444-4444-4444-4444-444444444401';
const FA_A = '44444444-4444-4444-4444-444444444402';
const FA_B = '44444444-4444-4444-4444-444444444403';
const FA_C = '44444444-4444-4444-4444-444444444404';

const admin = { role: 'ADMIN', companyId: COMPANY, userId: 'admin-a' };

function seedBase(): MemoryRevenueSplitStore {
  const store = new MemoryRevenueSplitStore();
  store.seedProject({ id: PROJECT, companyId: COMPANY });
  store.seedSale({ id: SALE_A, companyId: COMPANY, projectId: PROJECT });
  store.seedSale({ id: SALE_B, companyId: COMPANY, projectId: PROJECT });
  store.seedAccount({ id: FA_ISSUER, companyId: COMPANY, active: true });
  store.seedAccount({ id: FA_A, companyId: COMPANY, active: true });
  store.seedAccount({ id: FA_B, companyId: COMPANY, active: true });
  store.seedAccount({ id: FA_C, companyId: COMPANY, active: true });
  const now = '2026-09-13T12:00:00.000Z';
  for (const [id, wallet] of [
    [FA_A, 'wallet-a'],
    [FA_B, 'wallet-b'],
    [FA_C, 'wallet-c'],
  ] as const) {
    store.seedDestination({
      id: `dest-${id}`,
      companyId: COMPANY,
      financialAccountId: id,
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

function parts(
  ratios: number[],
  wallets = true,
): ProjectRevenueSplitParticipantInput[] {
  const names = ['Beleza Imobiliária', 'Sócio A', 'Sócio B', 'Sócio C'];
  const accounts = [FA_ISSUER, FA_A, FA_B, FA_C];
  return ratios.map((sharePercent, index) => ({
    displayName: names[index],
    partyKind: index === 0 ? 'ISSUER' : 'OWNER',
    sharePercent,
    isIssuerRemainder: index === 0,
    financialAccountId: wallets || index === 0 ? accounts[index] : null,
    sortOrder: index,
  }));
}

async function activate(store: MemoryRevenueSplitStore, ratios: number[], wallets = true) {
  const service = createRevenueSplitService(store);
  await service.saveProjectRevenueSplit({
    actor: admin,
    companyId: COMPANY,
    projectId: PROJECT,
    enabled: true,
    status: 'ACTIVE',
    participants: parts(ratios, wallets),
  });
  return service;
}

function testPayloadWithoutSplitUnchanged() {
  const body = buildAsaasCompanyCreatePaymentBody({
    customerId: 'cus_1',
    billingType: 'PIX',
    value: 100,
    dueDate: '2026-10-01',
    description: 'Parcela 1',
    externalReference: 'inst-1',
  });
  assert(!('split' in body), 'sem split no payload antigo');
  assert(body.customer === 'cus_1', 'customer');
  assert(body.billingType === 'PIX', 'billingType');
  assert(body.value === 100, 'value');
  assert(body.externalReference === 'inst-1', 'externalReference');
  assert(Boolean(body.fine) && Boolean(body.interest), 'multa/juros intactos');
  const json = JSON.stringify(body);
  assert(!json.includes('percentualValue'), 'sem percentualValue sem split');
  assert(!json.includes('fixedValue'), 'sem fixedValue');
  console.log('OK testPayloadWithoutSplitUnchanged');
}

function testRemoteCounts() {
  const mk = (
    ratios: number[],
    ids: string[],
  ): ChargeRevenueSplitLeg[] =>
    ratios.map((sharePercent, index) => ({
      id: ids[index],
      companyId: COMPANY,
      saleId: SALE_A,
      installmentId: 'inst-1',
      chargeId: null,
      snapshotId: 'snap-1',
      snapshotParticipantId: `sp-${index}`,
      provider: 'ASAAS_COMPANY',
      providerSplitId: null,
      destinationType: index === 0 ? null : 'WALLET_ID',
      destinationIdentifier: index === 0 ? null : `wallet-${index}`,
      sharePercent,
      isIssuerRemainder: index === 0,
      displayName: `P${index}`,
      grossAmountEstimate: null,
      netAmount: null,
      status: 'PENDING',
      failureReason: null,
      createdAt: '',
      updatedAt: '',
    }));

  const two = buildAsaasCompanyRemoteSplits(mk([40, 60], ['leg-i', 'leg-a']));
  assert(two.length === 1, '40/60 → 1 split remoto');
  assert(two[0].walletId === 'wallet-1' && two[0].percentualValue === 60, 'sócio 60');
  assert(two[0].externalReference === 'leg-a', 'externalReference = id da leg');
  assert(!two.some((item) => item.externalReference === 'leg-i'), 'emissor fora do array');

  const three = buildAsaasCompanyRemoteSplits(mk([20, 40, 40], ['i', 'a', 'b']));
  assert(three.length === 2, '20/40/40 → 2 splits remotos');

  const four = buildAsaasCompanyRemoteSplits(mk([25, 25, 25, 25], ['i', 'a', 'b', 'c']));
  assert(four.length === 3, '25x4 → 3 splits remotos');
  assert(
    four.every((item) => item.percentualValue === 25),
    'percentualValue 25',
  );
  console.log('OK testRemoteCounts');
}

function testWalletMissingAndSandboxGuard() {
  const legs: ChargeRevenueSplitLeg[] = [
    {
      id: 'i',
      companyId: COMPANY,
      saleId: SALE_A,
      installmentId: 'inst',
      chargeId: null,
      snapshotId: 's',
      snapshotParticipantId: 'sp0',
      provider: 'ASAAS_COMPANY',
      providerSplitId: null,
      destinationType: null,
      destinationIdentifier: null,
      sharePercent: 40,
      isIssuerRemainder: true,
      displayName: 'Emissor',
      grossAmountEstimate: null,
      netAmount: null,
      status: 'PENDING',
      failureReason: null,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'a',
      companyId: COMPANY,
      saleId: SALE_A,
      installmentId: 'inst',
      chargeId: null,
      snapshotId: 's',
      snapshotParticipantId: 'sp1',
      provider: 'ASAAS_COMPANY',
      providerSplitId: null,
      destinationType: 'WALLET_ID',
      destinationIdentifier: '',
      sharePercent: 60,
      isIssuerRemainder: false,
      displayName: 'Sócio A',
      grossAmountEstimate: null,
      netAmount: null,
      status: 'PENDING',
      failureReason: null,
      createdAt: '',
      updatedAt: '',
    },
  ];
  try {
    assertAsaasCompanySplitWalletsPresent(legs);
    throw new Error('deveria falhar wallet ausente');
  } catch (err) {
    assert(err instanceof RevenueSplitError && err.code === 'WALLET_MISSING', 'wallet ausente');
  }
  try {
    assertAsaasSandboxForSplit('PRODUCTION');
    throw new Error('deveria bloquear production');
  } catch (err) {
    assert(err instanceof RevenueSplitError && err.code === 'SANDBOX_ONLY', 'sandbox only');
  }
  assertAsaasSandboxForSplit('SANDBOX');
  console.log('OK testWalletMissingAndSandboxGuard');
}

async function testSnapshotOnceAndReissueUsesSame() {
  const store = seedBase();
  const service = await activate(store, [40, 60]);
  const first = await service.ensureSaleRevenueSplitSnapshot({
    companyId: COMPANY,
    saleId: SALE_A,
    provider: 'ASAAS_COMPANY',
  });
  assert(first.reason === 'SNAPSHOT_CREATED', 'criou snapshot');
  const percents = first.participants.map((row) => row.sharePercent).sort();
  assert(percents.join(',') === '40,60', '40/60 congelado');

  await service.saveProjectRevenueSplit({
    actor: admin,
    companyId: COMPANY,
    projectId: PROJECT,
    enabled: true,
    status: 'ACTIVE',
    participants: parts([30, 35, 35]),
  });

  const again = await service.ensureSaleRevenueSplitSnapshot({
    companyId: COMPANY,
    saleId: SALE_A,
    provider: 'ASAAS_COMPANY',
  });
  assert(again.reason === 'SNAPSHOT_ALREADY_EXISTS', 'idempotente');
  assert(again.snapshot?.id === first.snapshot?.id, 'mesmo snapshot');
  assert(
    again.participants.map((row) => row.sharePercent).sort().join(',') === '40,60',
    'reemissão usa snapshot antigo',
  );

  const saleB = await service.ensureSaleRevenueSplitSnapshot({
    companyId: COMPANY,
    saleId: SALE_B,
    provider: 'ASAAS_COMPANY',
  });
  assert(
    saleB.participants.map((row) => row.sharePercent).sort().join(',') === '30,35,35',
    'venda nova usa config atual',
  );
  console.log('OK testSnapshotOnceAndReissueUsesSame');
}

async function testPreparePayloadCounts() {
  const cases: Array<{ ratios: number[]; remote: number }> = [
    { ratios: [40, 60], remote: 1 },
    { ratios: [20, 40, 40], remote: 2 },
    { ratios: [25, 25, 25, 25], remote: 3 },
  ];
  for (const item of cases) {
    const store = seedBase();
    await activate(store, item.ratios);
    const prepared = await prepareAsaasCompanyChargeSplit({
      store,
      companyId: COMPANY,
      saleId: SALE_A,
      installmentId: 'inst-prep',
      grossAmount: 1000,
      environment: 'SANDBOX',
    });
    assert(prepared.enabled, `${item.ratios.join('/')} enabled`);
    assert(prepared.legs.length === item.ratios.length, `${item.ratios.join('/')} legs locais`);
    assert(prepared.remoteSplits.length === item.remote, `${item.ratios.join('/')} remotos`);
    assert(
      prepared.legs.some((leg) => leg.isIssuerRemainder && !prepared.remoteSplits.some((s) => s.externalReference === leg.id)),
      'emissor local sem split remoto',
    );
    const body = buildAsaasCompanyCreatePaymentBody({
      customerId: 'cus',
      billingType: 'PIX',
      value: 1000,
      dueDate: '2026-10-01',
      description: 'teste',
      externalReference: 'inst-prep',
      split: prepared.remoteSplits,
    });
    assert(Array.isArray(body.split) && (body.split as unknown[]).length === item.remote, 'payload split');
    const json = JSON.stringify(body);
    assert(json.includes('percentualValue'), 'usa percentualValue');
    assert(!json.includes('fixedValue'), 'não usa fixedValue');
  }

  const storeNoSplit = seedBase();
  const preparedNone = await prepareAsaasCompanyChargeSplit({
    store: storeNoSplit,
    companyId: COMPANY,
    saleId: SALE_A,
    installmentId: 'inst-none',
    grossAmount: 100,
    environment: 'SANDBOX',
  });
  assert(!preparedNone.enabled && preparedNone.remoteSplits.length === 0, 'venda sem split');
  console.log('OK testPreparePayloadCounts');
}

async function testPrepareMissingWalletBlocks() {
  const store = seedBase();
  await store.insertSnapshot({
    snapshot: {
      companyId: COMPANY,
      projectId: PROJECT,
      saleId: SALE_A,
      sourceConfigId: null,
      provider: 'ASAAS_COMPANY',
      currency: 'BRL',
    },
    participants: [
      {
        companyId: COMPANY,
        sourceParticipantId: null,
        displayName: 'Beleza Imobiliária',
        partyKind: 'ISSUER',
        userId: null,
        financialAccountId: FA_ISSUER,
        destinationProvider: null,
        destinationType: null,
        destinationIdentifier: null,
        sharePercent: 40,
        isIssuerRemainder: true,
        sortOrder: 0,
      },
      {
        companyId: COMPANY,
        sourceParticipantId: null,
        displayName: 'Sócio A',
        partyKind: 'OWNER',
        userId: null,
        financialAccountId: FA_A,
        destinationProvider: 'ASAAS_COMPANY',
        destinationType: 'WALLET_ID',
        destinationIdentifier: null,
        sharePercent: 60,
        isIssuerRemainder: false,
        sortOrder: 1,
      },
    ],
  });
  try {
    await prepareAsaasCompanyChargeSplit({
      store,
      companyId: COMPANY,
      saleId: SALE_A,
      installmentId: 'inst-w',
      grossAmount: 100,
      environment: 'SANDBOX',
    });
    throw new Error('deveria bloquear wallet');
  } catch (err) {
    assert(err instanceof RevenueSplitError && err.code === 'WALLET_MISSING', 'wallet bloqueia emissão');
  }
  try {
    const storeProd = seedBase();
    await activate(storeProd, [40, 60]);
    await prepareAsaasCompanyChargeSplit({
      store: storeProd,
      companyId: COMPANY,
      saleId: SALE_A,
      installmentId: 'inst-prod',
      grossAmount: 100,
      environment: 'PRODUCTION',
    });
    throw new Error('deveria bloquear production');
  } catch (err) {
    assert(err instanceof RevenueSplitError && err.code === 'SANDBOX_ONLY', 'production bloqueada');
  }
  console.log('OK testPrepareMissingWalletBlocks');
}

async function testWebhookSplitDoesNotPayInstallment() {
  assert(classifyCompanyAsaasWebhookEvent('PAYMENT_SPLIT_DONE') === 'split', 'kind split');
  assert(shouldReconcileCompanyAsaasPayment('PAYMENT_SPLIT_DONE') === false, 'não reconcilia parcela');
  assert(shouldReconcileCompanyAsaasPayment('PAYMENT_RECEIVED') === true, 'pagamento reconcilia');
  assert(mapAsaasRemoteSplitStatus('AWAITING_CREDIT') === 'PROCESSING', 'awaiting');
  assert(mapAsaasRemoteSplitStatus('DONE') === 'SETTLED', 'done');
  assert(mapAsaasRemoteSplitStatus('REFUSED') === 'FAILED', 'refused');
  assert(mapAsaasRemoteSplitStatus('REFUNDED') === 'REFUNDED', 'refunded');
  assert(mapAsaasRemoteSplitStatus('CANCELLED') === 'CANCELLED', 'cancelled');

  const store = seedBase();
  await activate(store, [20, 40, 40]);
  const prepared = await prepareAsaasCompanyChargeSplit({
    store,
    companyId: COMPANY,
    saleId: SALE_A,
    installmentId: 'inst-wh',
    grossAmount: 1000,
    environment: 'SANDBOX',
  });
  for (const leg of prepared.legs) {
    await store.updateLeg(leg.id, COMPANY, { chargeId: 'chg-1' });
  }
  const remote = remoteLegsForAsaasCompany(await store.listLegsByCharge('chg-1'))[0];
  await applyAsaasSplitWebhookToLegs({
    store,
    companyId: COMPANY,
    chargeId: 'chg-1',
    eventType: 'PAYMENT_SPLIT_DONE',
    targetLegIds: [remote.id],
    status: 'SETTLED',
    providerSplitId: 'split-remote-1',
  });
  const after = await store.getLegById(remote.id);
  assert(after?.status === 'SETTLED', 'leg SETTLED');
  await applyAsaasSplitWebhookToLegs({
    store,
    companyId: COMPANY,
    chargeId: 'chg-1',
    eventType: 'PAYMENT_SPLIT_DONE',
    targetLegIds: [remote.id],
    status: 'SETTLED',
    providerSplitId: 'split-remote-1',
  });
  assert((await store.getLegById(remote.id))?.status === 'SETTLED', 'idempotente');

  const other = remoteLegsForAsaasCompany(await store.listLegsByCharge('chg-1'))[1];
  await applyAsaasSplitWebhookToLegs({
    store,
    companyId: COMPANY,
    chargeId: 'chg-1',
    eventType: 'PAYMENT_SPLIT_CANCELLED',
    targetLegIds: [other.id],
    status: 'CANCELLED',
  });
  assert((await store.getLegById(other.id))?.status === 'CANCELLED', 'cancel leg');

  await applyAsaasSplitWebhookToLegs({
    store,
    companyId: COMPANY,
    chargeId: 'chg-1',
    eventType: 'PAYMENT_REFUNDED',
    targetLegIds: [remote.id],
    status: 'REFUNDED',
  });
  assert((await store.getLegById(remote.id))?.status === 'REFUNDED', 'refund leg');
  console.log('OK testWebhookSplitDoesNotPayInstallment');
}

function testSourceWiring() {
  const client = read('lib/finance/asaasCompanyClient.ts');
  assert(client.includes('buildAsaasCompanyCreatePaymentBody'), 'body builder');
  assert(client.includes('percentualValue'), 'percentualValue');
  assert(client.includes('if (input.split && input.split.length > 0)'), 'split opcional');

  const charge = read('lib/finance/asaasCompanyChargeService.ts');
  assert(charge.includes('prepareAsaasCompanyChargeSplit'), 'freeze/prepare na emissão');
  assert(!charge.includes('freezeSaleRevenueSplit'), 'não usa freeze admin');
  assert(charge.includes('attachAsaasChargeToSplitLegs'), 'anexa charge nas legs');
  assert(charge.includes('syncChargeRevenueSplitLegsFromAsaasPayment'), 'sync usa GET payment');

  const webhook = read('lib/finance/companyAsaasWebhookHandler.ts');
  const webhookEvents = read('lib/finance/revenueSplit/webhookEvents.ts');
  assert(webhookEvents.includes('PAYMENT_SPLIT_DONE'), 'webhook split');
  assert(webhook.includes('installmentPaid: false'), 'split não paga parcela');
  assert(webhook.includes('classifyCompanyAsaasWebhookEvent'), 'classifica evento');

  const inter = read('lib/banking/inter/interSaleChargeService.ts');
  assert(inter.includes('assertInterEmissionAllowedForRevenueSplit'), 'Inter bloqueado');
  assert(
    inter.includes(INTER_REVENUE_SPLIT_UNSUPPORTED_MESSAGE) ||
      read('lib/finance/revenueSplit/interSplitGuard.ts').includes(INTER_REVENUE_SPLIT_UNSUPPORTED_MESSAGE),
    'mensagem Inter',
  );
  assert(
    INTER_REVENUE_SPLIT_UNSUPPORTED_MESSAGE ===
      'Este empreendimento utiliza Split de Recebimentos. O provedor Inter ainda não suporta Split nesta versão.',
    'mensagem exata',
  );

  const ui = read('components/finance/ChargeRevenueSplitDistribution.tsx');
  assert(ui.includes('Distribuição do Recebimento'), 'UI título');
  assert(ui.includes('REVENUE_SPLIT_GATEWAY_ESTIMATE_WARNING'), 'aviso estimado');
  assert(read('lib/finance/revenueSplit/display.ts').includes('Valor estimado. O valor efetivo depende das tarifas do gateway.'), 'texto estimado');
  assert(read('components/sales/SaleChargesPanel.tsx').includes('ChargeRevenueSplitDistribution'), 'painel venda');
  assert(read('components/finance/AsaasInstallmentChargePanel.tsx').includes('ChargeRevenueSplitDistribution'), 'painel parcela');

  const adapter = read('lib/finance/revenueSplit/asaasCompanySplitAdapter.ts');
  assert(adapter.includes('supportsSplit: true'), 'adapter supportsSplit');
  assert(adapter.includes('NÃO entra no array') || adapter.includes('Nao entra') || adapter.includes('não inclui'), 'emissor fora');
  console.log('OK testSourceWiring');
}

async function testInterGuard() {
  const store = seedBase();
  await activate(store, [40, 60]);
  const { assertInterEmissionAllowedForRevenueSplit } = await import(
    '../lib/finance/revenueSplit/interSplitGuard'
  );
  try {
    await assertInterEmissionAllowedForRevenueSplit({
      store,
      companyId: COMPANY,
      saleId: SALE_A,
    });
    throw new Error('Inter deveria bloquear com split ACTIVE');
  } catch (err) {
    assert(
      err instanceof Error && err.message === INTER_REVENUE_SPLIT_UNSUPPORTED_MESSAGE,
      'mensagem Inter ACTIVE',
    );
  }
  const storeNone = seedBase();
  await assertInterEmissionAllowedForRevenueSplit({
    store: storeNone,
    companyId: COMPANY,
    saleId: SALE_A,
  });
  console.log('OK testInterGuard');
}

async function main() {
  testPayloadWithoutSplitUnchanged();
  testRemoteCounts();
  testWalletMissingAndSandboxGuard();
  await testSnapshotOnceAndReissueUsesSame();
  await testPreparePayloadCounts();
  await testPrepareMissingWalletBlocks();
  await testWebhookSplitDoesNotPayInstallment();
  testSourceWiring();
  await testInterGuard();
  console.log('\nALL mandatory-payment-split-asaas-emit-tests PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
