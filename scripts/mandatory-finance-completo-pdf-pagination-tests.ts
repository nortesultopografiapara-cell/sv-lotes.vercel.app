/**
 * Paginação do PDF Financeiro Completo — parcela + distribuição como grupo.
 * npx tsx scripts/mandatory-finance-completo-pdf-pagination-tests.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCanonicalFinanceReport } from '../lib/finance/reports/canonicalFinanceDataset';
import {
  buildSeverinoCanonicalInput,
  buildSeverinoSplitView,
} from '../lib/finance/reports/severinoCanonicalFixture';
import {
  COMPLETO_SPLIT_SUBTABLE_HEAD,
  COMPLETO_SPLIT_UNREGISTERED_LABEL,
  COMPLETO_WALLET_TABLE_HEAD,
  buildCompletoSplitSubtableBody,
  buildFinanceCompletoPdf,
  estimateCompletoWalletGroupHeightMm,
  formatCompletoSplitAccountCell,
  formatCompletoSplitAgencyCell,
  formatCompletoSplitBankCell,
  formatCompletoSplitBeneficiaryCell,
  isCompletoWalletGroupIndivisible,
  shouldMoveCompletoWalletGroupToNextPage,
} from '../lib/finance/reports/renderFinanceReportPdf';
import type { CanonicalSplitLeg, CanonicalWalletMovement } from '../lib/finance/reports/canonicalFinanceTypes';
import { EMPTY_FROZEN_BANK_IDENTITY } from '../lib/finance/reports/frozenBankIdentity';

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

function frozenLeg(
  over: Partial<CanonicalSplitLeg> & Pick<CanonicalSplitLeg, 'beneficiaryName' | 'isIssuerRemainder'>,
): CanonicalSplitLeg {
  const frozen = over.isIssuerRemainder ? ADMIN_FROZEN : ANA_FROZEN;
  return {
    sharePercent: 50,
    amount: 10,
    grossAmount: 10,
    netAmount: null,
    amountKind: 'estimated',
    amountKindLabel: 'Previsto/Estimado',
    statusLabel: 'Pendente',
    accountOrWallet: null,
    frozenBankIdentity: frozen,
    bankIdentityFrozen: true,
    financialAccountId: null,
    destinationType: over.isIssuerRemainder ? null : 'WALLET_ID',
    destinationIdentifier: over.isIssuerRemainder ? null : '1ef06e2a-a15f-4f2e-b26b-302a06056e6c',
    providerSplitId: null,
    ...over,
  };
}

function movement031(over: Partial<CanonicalWalletMovement> = {}): CanonicalWalletMovement {
  return {
    id: 'r-031-p1',
    saleId: 'ccd28630-fd7f-4677-8ac6-611e5299f50e',
    contractNumber: '000000031/2026',
    clientName: 'ROSIVAN DE OLIVEIRA',
    clientDocument: '000',
    projectName: 'Chacreamento Araguaia',
    blockName: '01',
    lotNumber: '96',
    installmentNumber: 1,
    installmentLabel: 'Parcela 1/2',
    dueDate: '2026-09-18',
    dueDateLabel: '18/09/2026',
    paidAt: '2026-09-18',
    paidAtLabel: '18/09/2026',
    amount: 20,
    paidAmount: 20,
    status: 'pago',
    statusLabel: 'Pago',
    financialAccountId: 'fa-admin',
    financialAccountLabel: 'Administradora',
    hasSplit: true,
    split: [
      frozenLeg({ beneficiaryName: 'Administradora', isIssuerRemainder: true }),
      frozenLeg({ beneficiaryName: 'ana vitoria', isIssuerRemainder: false }),
    ],
    destinationFallbackLabel: 'Administradora',
    chargeProvider: 'ASAAS',
    gatewayFeeAmount: null,
    ...over,
  };
}

function frozen031Input() {
  const saleId = 'ccd28630-fd7f-4677-8ac6-611e5299f50e';
  const entradaId = 'bb76bd3c-901d-4bdc-b299-5743031989f0';
  const p1Id = '86205e07-e2a7-4adc-a34f-7dbb36032d45';
  const p2Id = '89676634-703c-4579-bc94-110ec9c4078b';
  const view = buildSeverinoSplitView();
  view.saleId = saleId;
  view.snapshot = { id: 'fffedae8-2f67-46ce-82b0-bcc5da549d9f' };
  view.participants = [
    {
      id: 'part-admin',
      displayName: 'Administradora',
      sharePercent: 50,
      isIssuerRemainder: true,
      ...ADMIN_FROZEN,
    },
    {
      id: 'part-ana',
      displayName: 'ana vitoria',
      sharePercent: 50,
      isIssuerRemainder: false,
      destinationIdentifier: '1ef06e2a-a15f-4f2e-b26b-302a06056e6c',
      destinationType: 'WALLET_ID',
      ...ANA_FROZEN,
    },
  ];
  view.legs = [entradaId, p1Id, p2Id].flatMap((installmentId) =>
    view.participants.map((part) => ({
      installmentId,
      displayName: part.displayName,
      sharePercent: 50,
      isIssuerRemainder: part.isIssuerRemainder,
      snapshotParticipantId: part.id,
      status: 'PENDING',
      netAmount: null,
      grossAmountEstimate: installmentId === entradaId ? 5 : 10,
    })),
  );
  const customer = { name: 'ROSIVAN DE OLIVEIRA', document: '000', cpf_cnpj: '000' };
  const blocks = { block_name: '01', name: '01', number: '96' };
  const sales = {
    id: saleId,
    installments_count: 2,
    financial_account_id: 'fa-admin',
    projects: { name: 'Chacreamento Araguaia' },
    contracts: [{ contract_number: '000000031/2026' }],
  };
  return buildSeverinoCanonicalInput({
    receipts: [
      {
        id: entradaId,
        sale_id: saleId,
        installment_number: 0,
        amount: 10,
        paid_amount: 10,
        status: 'pago',
        due_date: '2026-09-18',
        paid_at: '2026-09-18',
        financial_account_id: 'fa-admin',
        customers: customer,
        projects: { name: 'Chacreamento Araguaia' },
        blocks,
        sales,
      },
      {
        id: p1Id,
        sale_id: saleId,
        installment_number: 1,
        amount: 20,
        paid_amount: 20,
        status: 'pago',
        due_date: '2026-09-18',
        paid_at: '2026-09-18',
        financial_account_id: 'fa-admin',
        customers: customer,
        projects: { name: 'Chacreamento Araguaia' },
        blocks,
        sales,
      },
      {
        id: p2Id,
        sale_id: saleId,
        installment_number: 2,
        amount: 20,
        paid_amount: 20,
        status: 'pago',
        due_date: '2026-10-18',
        paid_at: '2026-09-18',
        financial_account_id: 'fa-admin',
        customers: customer,
        projects: { name: 'Chacreamento Araguaia' },
        blocks,
        sales,
      },
    ],
    cashMovements: [],
    splitViews: { [saleId]: view },
  });
}

async function main() {
console.log('\n═══ A) parcela + split 2 participantes não se separam ═══');
{
  const m = movement031();
  assert(isCompletoWalletGroupIndivisible(m), '2 participantes = grupo indivisível');
  const h = estimateCompletoWalletGroupHeightMm(m);
  assert(h > 20, 'grupo tem altura de parcela + subtabela');
  assert(!shouldMoveCompletoWalletGroupToNextPage(h + 10, h), 'cabe no espaço → permanece');
  const src = read('lib/finance/reports/renderFinanceReportPdf.ts');
  const parcelIdx = src.indexOf('buildWalletParcelRow(movement)');
  const splitIdx = src.indexOf('buildCompletoSplitSubtableBody(movement)');
  assert(parcelIdx > 0 && splitIdx > parcelIdx, 'desenha parcela antes da distribuição');
}

console.log('\n═══ B) quebra próxima ao rodapé move grupo inteiro ═══');
{
  const m = movement031();
  const h = estimateCompletoWalletGroupHeightMm(m);
  assert(shouldMoveCompletoWalletGroupToNextPage(h - 1, h), 'espaço insuficiente move o grupo');
  const src = read('lib/finance/reports/renderFinanceReportPdf.ts');
  assert(src.includes('shouldMoveCompletoWalletGroupToNextPage'), 'usa o predicado de grupo');
  assert(src.includes('startNewWalletPage'), 'abre página nova para o grupo');
}

console.log('\n═══ C) cabeçalho repete na nova página ═══');
{
  const src = read('lib/finance/reports/renderFinanceReportPdf.ts');
  assert(src.includes("showHead: showHead ? 'everyPage' : 'never'"), 'cabeçalho da parcela na nova página');
  assert(src.includes('COMPLETO_WALLET_TABLE_HEAD'), 'cabeçalho principal reutilizado');
  assert(src.includes("showHead: 'everyPage'"), 'subtabela repete cabeçalho se quebrar');
}

console.log('\n═══ D) nenhuma distribuição órfã ═══');
{
  const src = read('lib/finance/reports/renderFinanceReportPdf.ts');
  assert(!src.includes('formatFinancePdfSplitLegBlock'), 'sem bloco vertical órfão');
  assert(src.includes('isCompletoWalletGroupIndivisible'), 'grupo 2–4 indivisível');
  const startPage = src.indexOf('if (mustMove && y > COMPLETO_PDF_TOP_MARGIN_MM + 8)');
  const drawParcel = src.indexOf('body: [buildWalletParcelRow(movement)]');
  const drawSplit = src.indexOf("doc.text('DISTRIBUIÇÃO DO RECEBIMENTO (não somar como receita)'");
  assert(startPage > 0 && startPage < drawParcel && drawParcel < drawSplit, 'ordem: nova página → parcela → distribuição');
}

console.log('\n═══ E) 4 participantes continua legível ═══');
{
  const four = movement031({
    split: [
      frozenLeg({ beneficiaryName: 'Administradora', isIssuerRemainder: true, sharePercent: 25 }),
      frozenLeg({ beneficiaryName: 'ANA A', isIssuerRemainder: false, sharePercent: 25 }),
      frozenLeg({ beneficiaryName: 'ANA B', isIssuerRemainder: false, sharePercent: 25 }),
      frozenLeg({ beneficiaryName: 'ANA C', isIssuerRemainder: false, sharePercent: 25 }),
    ],
  });
  assert(isCompletoWalletGroupIndivisible(four), '4 participantes ainda indivisível');
  const h = estimateCompletoWalletGroupHeightMm(four);
  const pageInner = 210 - 14 - 18;
  assert(h < pageInner, `4 participantes cabem em uma página paisagem (${h} < ${pageInner})`);
  assert(buildCompletoSplitSubtableBody(four).length === 4, '4 linhas na subtabela');
}

console.log('\n═══ F) sem split permanece normal ═══');
{
  const plain = movement031({ hasSplit: false, split: [], paidAmount: 20 });
  assert(isCompletoWalletGroupIndivisible(plain), 'sem split é indivisível');
  const h = estimateCompletoWalletGroupHeightMm(plain);
  const withSplit = estimateCompletoWalletGroupHeightMm(movement031());
  assert(h < withSplit, 'sem split é mais baixo');
  assert(buildCompletoSplitSubtableBody(plain).length === 0, 'sem subtabela vazia');
  const src = read('lib/finance/reports/renderFinanceReportPdf.ts');
  assert(src.includes('Destino: ${movement.destinationFallbackLabel}'), 'destino simples sem subtabela');
}

console.log('\n═══ G) dados bancários congelados preservados ═══');
{
  const m = movement031();
  const body = buildCompletoSplitSubtableBody(m);
  const admin = body[0].join(' | ');
  const ana = body[1].join(' | ');
  assert(String(body[0][0]).includes('Administradora'), 'nome Administradora');
  assert(String(body[0][0]).includes('S.V TOPOGRAFIA E PROJETO LTDA'), 'titular issuer');
  assert(admin.includes('001'), 'agência issuer');
  assert(admin.includes('••••6755-4'), 'conta issuer');
  assert(String(body[1][0]).includes('ANA VITORIA'), 'nome ANA');
  assert(ana.includes('0001'), 'agência ANA');
  assert(ana.includes('••••8370-3'), 'conta ANA');
  assert(!ana.includes('1ef06e2a'), 'UUID fora da subtabela');
  const missingLeg = frozenLeg({
    beneficiaryName: 'ANA VITORIA',
    isIssuerRemainder: false,
    frozenBankIdentity: { ...EMPTY_FROZEN_BANK_IDENTITY },
    bankIdentityFrozen: false,
  });
  assert(formatCompletoSplitBankCell(missingLeg) === COMPLETO_SPLIT_UNREGISTERED_LABEL, 'antigo sem freeze');
  assert(formatCompletoSplitAgencyCell(missingLeg) === '—', 'agência antiga vazia');
  assert(formatCompletoSplitAccountCell(missingLeg) === '—', 'conta antiga vazia');
  assert(formatCompletoSplitBeneficiaryCell(missingLeg).includes('ANA VITORIA'), 'beneficiário permanece');
}

console.log('\n═══ H) status preservados ═══');
{
  const pending = frozenLeg({
    beneficiaryName: 'ana vitoria',
    isIssuerRemainder: false,
    statusLabel: 'Pendente',
    amountKind: 'estimated',
  });
  const received = frozenLeg({
    beneficiaryName: 'Administradora',
    isIssuerRemainder: true,
    statusLabel: 'Recebido',
    amountKind: 'settled',
  });
  const passed = frozenLeg({
    beneficiaryName: 'ana vitoria',
    isIssuerRemainder: false,
    statusLabel: 'Repassado',
    amountKind: 'settled',
  });
  const rows = buildCompletoSplitSubtableBody(
    movement031({ split: [pending, received, passed] }),
  );
  assert(rows[0][4] === 'Pendente', 'PENDING → Pendente');
  assert(rows[1][4] === 'Recebido', 'SETTLED issuer → Recebido');
  assert(rows[2][4] === 'Repassado', 'SETTLED externo → Repassado');
  const src = read('lib/finance/reports/renderFinanceReportPdf.ts');
  assert(src.includes('leg.statusLabel'), 'PDF não recalcula status');
  assert(!src.includes('destinationAmountKindForLeg'), 'PDF não altera semântica de net_amount');
}

console.log('\n═══ cabeçalhos e fonte ═══');
{
  assert(COMPLETO_WALLET_TABLE_HEAD[0] === 'Contrato', 'cabeçalho parcela');
  assert(COMPLETO_SPLIT_SUBTABLE_HEAD.includes('Valor informado'), 'coluna valor informado');
  assert(COMPLETO_SPLIT_SUBTABLE_HEAD.includes('Data pgto.'), 'coluna data');
  const src = read('lib/finance/reports/renderFinanceReportPdf.ts');
  assert(src.includes('fontSize: 8'), 'fonte 8, não minúscula');
  assert(!src.includes('fontSize: 6'), 'sem fonte 6');
  assert(!src.includes('fontSize: 5'), 'sem fonte 5');
}

console.log('\n═══ PDF inspeção 000000031/2026 ═══');
{
  const report = buildCanonicalFinanceReport(frozen031Input());
  const pdf = await buildFinanceCompletoPdf(report);
  const pages = pdf.getNumberOfPages();
  assert(pages >= 1, `PDF gerado (${pages} página(s))`);
  const dir = join(process.cwd(), 'scripts/_fixtures/finance-reports');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, 'financeiro-completo-031-layout.pdf');
  writeFileSync(out, Buffer.from(pdf.output('arraybuffer')));
  console.log('  ℹ inspeção:', out);
}

if (failed > 0) {
  console.error(`\nFAILED ${failed}  passed ${passed}`);
  process.exit(1);
}
console.log(`\nOK — mandatory-finance-completo-pdf-pagination-tests passed (${passed})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
