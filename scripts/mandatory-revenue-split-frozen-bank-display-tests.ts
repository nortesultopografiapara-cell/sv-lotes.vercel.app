/**
 * Fase 4 — exibição da identificação bancária congelada no snapshot.
 * npx tsx scripts/mandatory-revenue-split-frozen-bank-display-tests.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCanonicalFinanceReport } from '../lib/finance/reports/canonicalFinanceDataset';
import {
  SEVERINO_IDS,
  buildSeverinoCanonicalInput,
  buildSeverinoSplitView,
} from '../lib/finance/reports/severinoCanonicalFixture';
import { destinationAmountKindForLeg, resolveFrozenBankIdentityForSplitRow } from '../lib/finance/reports/splitForReport';
import { formatFinancePdfSplitLegLine } from '../lib/finance/reports/splitPresentation';
import {
  FROZEN_BANK_IDENTITY_MISSING_LABEL,
  formatFrozenBankIdentityUiLines,
  formatPaidAtDisplay,
  hasFrozenBankIdentity,
  readFrozenBankIdentityFromSnapshotRow,
} from '../lib/finance/reports/frozenBankIdentity';

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    console.log('  ✅', label);
    passed++;
  } else {
    console.error('  ❌', label);
    failed++;
  }
}

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

const ANA_WALLET = '1ef06e2a-a15f-4f2e-b26b-302a06056e6c';

const ANA_FROZEN = {
  destBeneficiaryName: 'ANA VITORIA',
  destInstitution: 'Asaas',
  destBankName: 'Asaas I.P S.A',
  destBankCode: '461',
  destAgency: '0001',
  destAccountMasked: '••••8370-3',
  destBankAccountKind: 'CORRENTE',
};

const ADMIN_FROZEN = {
  destBeneficiaryName: 'S.V TOPOGRAFIA E PROJETO LTDA',
  destInstitution: 'Asaas',
  destBankName: 'Asaas I.P S.A',
  destBankCode: '461',
  destAgency: '001',
  destAccountMasked: '••••6755-4',
  destBankAccountKind: 'CORRENTE',
};

function frozen031View() {
  const view = buildSeverinoSplitView();
  view.snapshot = { id: 'fffedae8-2f67-46ce-82b0-bcc5da549d9f' };
  view.participants = [
    {
      id: 'part-admin',
      displayName: 'Administradora',
      sharePercent: 50,
      isIssuerRemainder: true,
      financialAccountId: '11ed4002-4273-4d0c-a12f-707574c58dbb',
      destinationIdentifier: null,
      destinationType: null,
      ...ADMIN_FROZEN,
    },
    {
      id: 'part-ana',
      displayName: 'ana vitoria',
      sharePercent: 50,
      isIssuerRemainder: false,
      financialAccountId: '4c3a11c3-ec23-4cff-af60-977e7813f893',
      destinationIdentifier: ANA_WALLET,
      destinationType: 'WALLET_ID',
      ...ANA_FROZEN,
    },
  ];
  view.legs = (view.legs || []).map((leg) => {
    const issuer = Boolean(leg.isIssuerRemainder);
    return {
      ...leg,
      snapshotParticipantId: issuer ? 'part-admin' : 'part-ana',
      destinationIdentifier: issuer ? null : ANA_WALLET,
      destinationType: issuer ? null : 'WALLET_ID',
      status: 'PENDING',
      netAmount: 9.5,
    };
  });
  return view;
}

console.log('\n═══ A) snapshot novo → banco aparece ═══');
{
  const report = buildCanonicalFinanceReport(
    buildSeverinoCanonicalInput({
      splitViews: { [SEVERINO_IDS.SALE_ID]: frozen031View() },
    }),
  );
  const parcela = report.wallet.movements.find((m) => m.id === SEVERINO_IDS.PARCELA_ID)!;
  const admin = parcela.split.find((l) => l.isIssuerRemainder)!;
  const ana = parcela.split.find((l) => !l.isIssuerRemainder)!;
  assert(admin.frozenBankIdentity.destBeneficiaryName === ADMIN_FROZEN.destBeneficiaryName, 'admin titular');
  assert(admin.frozenBankIdentity.destAgency === '001', 'admin agência');
  assert(admin.frozenBankIdentity.destAccountMasked === '••••6755-4', 'admin conta');
  assert(ana.frozenBankIdentity.destBeneficiaryName === 'ANA VITORIA', 'ANA titular');
  assert(ana.frozenBankIdentity.destAgency === '0001', 'ANA agência 0001');
  assert(ana.frozenBankIdentity.destAccountMasked === '••••8370-3', 'ANA conta');
  assert(admin.bankIdentityFrozen && ana.bankIdentityFrozen, 'freeze true');
  const uiAna = formatFrozenBankIdentityUiLines(ana.frozenBankIdentity).join('\n');
  assert(uiAna.includes('ANA VITORIA'), 'UI ANA titular');
  assert(uiAna.includes('Ag. 0001'), 'UI ANA agência');
  assert(uiAna.includes('••••8370-3'), 'UI ANA conta');
}

console.log('\n═══ B) snapshot antigo NULL → não usa cadastro vivo ═══');
{
  const view = buildSeverinoSplitView();
  const report = buildCanonicalFinanceReport(
    buildSeverinoCanonicalInput({
      splitViews: { [SEVERINO_IDS.SALE_ID]: view },
      accountLabels: {
        'fa-admin': 'Ag. 9999 cadastro vivo',
        'fa-ana': 'Ag. 9999 cadastro vivo',
      },
    }),
  );
  const parcela = report.wallet.movements.find((m) => m.id === SEVERINO_IDS.PARCELA_ID)!;
  assert(
    parcela.split.every((leg) => !hasFrozenBankIdentity(leg.frozenBankIdentity)),
    'dest_* ausentes no snapshot antigo',
  );
  assert(
    parcela.split.every((leg) => leg.bankIdentityFrozen === false),
    'bank_identity_frozen = false',
  );
  assert(
    parcela.split.every((leg) => leg.frozenBankIdentity.destAgency == null),
    'agência do snapshot permanece NULL',
  );
  const missing = formatFrozenBankIdentityUiLines(parcela.split[0].frozenBankIdentity);
  assert(missing[0] === FROZEN_BANK_IDENTITY_MISSING_LABEL, 'mensagem de freeze ausente');
  assert(
    !parcela.split.some((leg) => String(leg.frozenBankIdentity.destAgency || '').includes('9999')),
    'não copia 9999 do cadastro vivo',
  );
  const pdfLine = formatFinancePdfSplitLegLine(parcela.split[0]);
  assert(pdfLine.includes(FROZEN_BANK_IDENTITY_MISSING_LABEL), 'PDF antigo sem inventar banco');
  assert(!pdfLine.includes('9999'), 'PDF não mostra agência viva');
}

console.log('\n═══ C) issuer sem wallet → banco aparece ═══');
{
  const view = frozen031View();
  const issuerPart = view.participants.find((p) => p.isIssuerRemainder)!;
  assert(issuerPart.destinationIdentifier == null, 'issuer sem wallet técnica');
  const frozen = resolveFrozenBankIdentityForSplitRow(issuerPart, view.participants);
  assert(frozen.destAccountMasked === '••••6755-4', 'issuer congela conta');
  assert(frozen.destAgency === '001', 'issuer congela agência');
  const report = buildCanonicalFinanceReport(
    buildSeverinoCanonicalInput({
      splitViews: { [SEVERINO_IDS.SALE_ID]: view },
    }),
  );
  const admin = report.wallet.movements
    .find((m) => m.id === SEVERINO_IDS.PARCELA_ID)!
    .split.find((l) => l.isIssuerRemainder)!;
  assert(!admin.destinationIdentifier, 'issuer destination vazio');
  assert(admin.frozenBankIdentity.destBeneficiaryName === ADMIN_FROZEN.destBeneficiaryName, 'issuer titular');
}

console.log('\n═══ D) ANA wallet separada → UUID fora da tela/PDF ═══');
{
  const view = frozen031View();
  const report = buildCanonicalFinanceReport(
    buildSeverinoCanonicalInput({
      splitViews: { [SEVERINO_IDS.SALE_ID]: view },
    }),
  );
  const ana = report.wallet.movements
    .find((m) => m.id === SEVERINO_IDS.PARCELA_ID)!
    .split.find((l) => !l.isIssuerRemainder)!;
  assert(ana.destinationIdentifier === ANA_WALLET, 'wallet permanece no dataset técnico');
  assert(ana.frozenBankIdentity.destAccountMasked === '••••8370-3', 'conta bancária distinta');
  const pdfLine = formatFinancePdfSplitLegLine(ana);
  assert(!pdfLine.includes(ANA_WALLET), 'PDF sem UUID');
  const ui = formatFrozenBankIdentityUiLines(ana.frozenBankIdentity).join('\n');
  assert(!ui.includes(ANA_WALLET), 'UI sem UUID');
  const uiSrc = read('components/finance/ChargeRevenueSplitDistribution.tsx');
  assert(!uiSrc.includes('destinationIdentifier'), 'tela não interpola wallet');
  const pdfSrc = read('lib/finance/reports/renderFinanceReportPdf.ts');
  assert(!pdfSrc.includes('destinationIdentifier'), 'PDF renderer não interpola wallet');
}

console.log('\n═══ E) PENDING + net_amount continua Pendente/Estimado ═══');
{
  assert(destinationAmountKindForLeg('PENDING', 9.5) === 'estimated', 'helper intacto');
  const view = frozen031View();
  const report = buildCanonicalFinanceReport(
    buildSeverinoCanonicalInput({
      splitViews: { [SEVERINO_IDS.SALE_ID]: view },
    }),
  );
  const parcela = report.wallet.movements.find((m) => m.id === SEVERINO_IDS.PARCELA_ID)!;
  assert(
    parcela.split.every((leg) => leg.amountKind === 'estimated'),
    'PENDING+net não é Liquidado',
  );
  assert(
    parcela.split.every((leg) => leg.statusLabel === 'Pendente'),
    'situação Pendente',
  );
  assert(parcela.split.every((leg) => leg.netAmount === 9.5), 'net_amount permanece informado');
}

console.log('\n═══ F) Excel técnico separado do destino bancário ═══');
{
  const excelSrc = read('lib/finance/reports/renderFinanceReportExcel.ts');
  assert(excelSrc.includes('Titular congelado'), 'coluna titular');
  assert(excelSrc.includes('Conta mascarada'), 'coluna conta mascarada');
  assert(excelSrc.includes('bank_identity_frozen'), 'indicador freeze');
  assert(excelSrc.includes('financial_account_id'), 'id técnico');
  assert(excelSrc.includes('destination_type'), 'tipo técnico');
  assert(excelSrc.includes('wallet / provider_split_id'), 'wallet em coluna técnica');
  assert(excelSrc.includes('DESTINATION_BANK_IDENTITY_NOTE'), 'nota freeze');
  assert(!excelSrc.includes('Conta/Wallet'), 'não mistura wallet com banco');
}

console.log('\n═══ locks de fonte ═══');
{
  const splitSrc = read('lib/finance/reports/splitForReport.ts');
  assert(splitSrc.includes('resolveFrozenBankIdentityForSplitRow'), 'join dest_* do snapshot');
  assert(!splitSrc.includes('companyFinancialAccountRepository'), 'splitForReport sem repo vivo');
  assert(!splitSrc.includes("from('company_financial_accounts')"), 'sem query cadastro vivo');
  const dataset = read('lib/finance/reports/canonicalFinanceDataset.ts');
  assert(!dataset.includes("from('company_financial_accounts')"), 'dataset sem cadastro vivo');
  assert(
    read('lib/finance/reports/frozenBankIdentity.ts').includes('Nunca consulta company_financial_accounts'),
    'contrato da fonte',
  );
  assert(formatPaidAtDisplay('2026-09-18') === '18/09/2026', 'paid_at só data');
  assert(formatPaidAtDisplay('2026-09-18T00:00:00+00:00') === '18/09/2026', 'meia-noite não inventa hora');
  const rawNull = readFrozenBankIdentityFromSnapshotRow({ dest_agency: null });
  assert(rawNull.destAgency == null, 'NULL permanece NULL');
}

if (failed > 0) {
  console.error(`\nFAILED ${failed}  passed ${passed}`);
  process.exit(1);
}
console.log(`\nOK — mandatory-revenue-split-frozen-bank-display-tests passed (${passed})`);
