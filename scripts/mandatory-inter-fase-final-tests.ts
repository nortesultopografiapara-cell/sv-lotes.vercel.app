/**
 * Fase final Inter Cobrança V3 — Central, WhatsApp, e-mail, carnê parcial,
 * settlement idempotente e proteção contra duplicidade.
 * npm run test:inter-fase-final
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  formatInterChargeStatusLabel,
  isInterSituacaoRecebido,
  mapInterSituacaoToBankStatus,
} from '../lib/banking/inter/interStatus';
import { settleInterPaidCharge } from '../lib/banking/inter/interPaymentSettlement';
import { buildInterCarnePdfBytes, expectedInterCarnePageCount } from '../lib/banking/inter/interCarnePdf';
import {
  containFitRect,
  saleCarneBoletoSheetCount,
  saleCarneDocumentPageCount,
} from '../lib/finance/saleCarneSlotLayout';
import { buildInterChargeEmailHtml } from '../lib/banking/inter/interChargeEmail';
import { buildSaleCarnePartialNotice } from '../lib/finance/saleChargesShared';
import { resolveInterIssuedChargeActions } from '../lib/charges/interChargeActions';
import {
  buildInterChargeWhatsAppMessage,
  executeChargeWhatsAppShare,
} from '../lib/charges/chargeWhatsAppMessage';
import type { CompanyAsaasChargeResponse } from '../lib/finance/companyAsaasChargeTypes';
import type { InterCobrancaDetail } from '../lib/banking/inter/interCobrancaClient';

const root = path.join(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function charge(partial: Partial<CompanyAsaasChargeResponse>): CompanyAsaasChargeResponse {
  return {
    id: '2be6533a-9430-4db3-92d0-8da03b48242a',
    companyId: 'co-1',
    customerId: 'cu-1',
    saleId: 's-1',
    installmentId: 'fr-1',
    asaasPaymentId: '937fb876-9e2f-4cf2-a2aa-d6be84923b7f',
    billingType: 'BOLETO',
    status: 'REGISTERED',
    value: 11.11,
    dueDate: '2026-10-09',
    invoiceUrl: null,
    bankSlipUrl: null,
    bankSlipIdentification: '07790001161111000000000000000000000000000000000',
    pixQrCode: null,
    pixCopyPaste: '00020101021226580014BR.GOV.BCB.PIX',
    financialAccountId: null,
    paymentLink: null,
    paidAt: null,
    createdAt: '2026-08-13T11:32:55.789Z',
    updatedAt: '2026-08-13T11:32:55.789Z',
    asaasRemoteStatus: 'A_RECEBER',
    nossoNumero: '90816247624',
    barCode: '07791159401111000000000000000000000000000000',
    ...partial,
  };
}

function paidDetail(partial?: Partial<InterCobrancaDetail>): InterCobrancaDetail {
  return {
    codigoSolicitacao: '937fb876-9e2f-4cf2-a2aa-d6be84923b7f',
    situacao: 'RECEBIDO',
    valorNominal: 5,
    valorTotalRecebido: 5,
    origemRecebimento: 'PIX',
    dataHoraSituacao: '2026-08-13T12:00:00Z',
    nossoNumero: '90816247624',
    linhaDigitavel: '07790001161111000000000000000000000000000000000',
    codigoBarras: '07791159401111000000000000000000000000000000',
    pixCopiaECola: '00020101021226580014BR.GOV.BCB.PIX',
    txid: 'txid-pago',
    raw: {},
    ...partial,
  };
}

type Row = Record<string, unknown>;

function createSettlementMock(seed: {
  charge: Row;
  receipt: Row;
  movements?: Array<{ id: string; metadata: Row }>;
}) {
  const chargeRow = { ...seed.charge };
  const receiptRow = { ...seed.receipt };
  const movements = [...(seed.movements || [])];
  let cashInserts = 0;
  let receiptUpdates = 0;
  let chargeUpdates = 0;

  const admin = {
    from: (table: string) => {
      const state: { op: string; payload: Row | null } = { op: 'select', payload: null };
      const applyUpdate = () => {
        if (state.op !== 'update' || !state.payload) return;
        if (table === 'bank_charges') {
          chargeUpdates += 1;
          Object.assign(chargeRow, state.payload);
        }
        if (table === 'finance_receipts') {
          receiptUpdates += 1;
          Object.assign(receiptRow, state.payload);
        }
      };
      const api: Record<string, unknown> = {
        select: () => api,
        update: (payload: Row) => {
          state.op = 'update';
          state.payload = payload;
          return api;
        },
        insert: (payload: Row) => {
          state.op = 'insert';
          state.payload = payload;
          if (table === 'cash_movements') {
            cashInserts += 1;
            const id = `cm-${cashInserts}`;
            movements.push({
              id,
              metadata: (payload.metadata as Row) || {},
            });
            (api as { _insertedId?: string })._insertedId = id;
          }
          return api;
        },
        eq: () => api,
        filter: () => api,
        limit: () => api,
        maybeSingle: async () => {
          applyUpdate();
          if (table === 'bank_charges') return { data: { ...chargeRow }, error: null };
          if (table === 'finance_receipts') return { data: { ...receiptRow }, error: null };
          if (table === 'cash_movements') {
            const existing = movements.find(
              (m) =>
                String((m.metadata as Row).bank_charge_id) === String(chargeRow.id) &&
                String((m.metadata as Row).provider) === 'INTER',
            );
            return { data: existing ? { id: existing.id } : null, error: null };
          }
          return { data: null, error: null };
        },
        single: async () => {
          const id = (api as { _insertedId?: string })._insertedId || `cm-${cashInserts}`;
          return { data: { id }, error: null };
        },
        then: (resolve: (value: { data: unknown; error: null }) => void) => {
          applyUpdate();
          resolve({ data: null, error: null });
        },
      };
      return api;
    },
  };

  return {
    admin: admin as never,
    chargeRow,
    receiptRow,
    movements,
    cashInserts: () => cashInserts,
    receiptUpdates: () => receiptUpdates,
    chargeUpdates: () => chargeUpdates,
  };
}

function testStatusMapping() {
  assert.equal(mapInterSituacaoToBankStatus('A_RECEBER'), 'REGISTERED');
  assert.equal(mapInterSituacaoToBankStatus('RECEBIDO'), 'PAID');
  assert.equal(mapInterSituacaoToBankStatus('PAGO'), 'PAID');
  assert.equal(mapInterSituacaoToBankStatus('CANCELADO'), 'CANCELLED');
  assert.equal(mapInterSituacaoToBankStatus('ATRASADO'), 'OVERDUE');
  assert.equal(isInterSituacaoRecebido('RECEBIDO'), true);
  assert.equal(
    formatInterChargeStatusLabel({ situacao: 'A_RECEBER', dueDate: '2099-01-01' }),
    'A receber',
  );
  assert.equal(formatInterChargeStatusLabel({ situacao: 'RECEBIDO' }), 'Pago/Recebido');
  assert.equal(
    formatInterChargeStatusLabel({ situacao: 'A_RECEBER', dueDate: '2020-01-01', todayStr: '2026-08-13' }),
    'Atrasado',
  );
  assert.equal(formatInterChargeStatusLabel({ situacao: 'CANCELADO' }), 'Cancelado');
  const helpers = read('lib/charges/chargeInstallmentHelpers.ts');
  assert.match(helpers, /formatInterChargeStatusLabel/);
  assert.doesNotMatch(helpers, /situacao === 'A_RECEBER'/);
  console.log('OK status Inter centralizado');
}

function testUiHideGenerateAndNoAsaasActions() {
  const issued = resolveInterIssuedChargeActions({
    charge: charge({}),
    installmentPaid: false,
    customerPhone: '11999999999',
    customerEmail: 'cliente@example.com',
  });
  assert.equal(issued.hideGenerate, true);
  assert.equal(issued.showCopyLinha, true);
  assert.equal(issued.showCopyPix, true);
  assert.equal(issued.showOfficialPdf, true);
  assert.equal(issued.showWhatsApp, true);
  assert.equal(issued.showEmail, true);

  const noExt = resolveInterIssuedChargeActions({
    charge: charge({ asaasPaymentId: '' }),
    installmentPaid: false,
  });
  assert.equal(noExt.hideGenerate, false);
  assert.equal(noExt.showOfficialPdf, false);

  const actions = read('components/charges/ChargeInstallmentActions.tsx');
  assert.match(actions, /hideGenerate/);
  assert.match(actions, /Baixar boleto/);
  assert.match(actions, /onSendEmail/);
  assert.doesNotMatch(actions, /Abrir cobrança Asaas/);
  const interBlock = actions.slice(actions.indexOf('isInter'));
  assert.match(interBlock, /!isInter/);
  const page = read('components/charges/ChargesPageClient.tsx');
  assert.match(page, /<th>Status cobrança<\/th>/);
  assert.doesNotMatch(page, /<th>Status Asaas<\/th>/);
  assert.match(page, /\/api\/finance\/inter\/send-email/);
  assert.match(page, /preferInterMessage: provider === 'INTER'/);
  console.log('OK UI Inter sem Gerar e sem ações Asaas');
}

function testRefreshGetOnlyAndPdfRoute() {
  const refresh = read('app/api/finance/inter/refresh-charge/route.ts');
  assert.match(refresh, /created: false/);
  assert.match(refresh, /inserted: false/);
  assert.doesNotMatch(refresh, /createInterCobranca/);
  assert.doesNotMatch(refresh, /createInterInstallmentCharge/);
  const pdf = read('app/api/finance/inter/pdf/route.ts');
  assert.match(pdf, /fetchInterCobrancaPdf/);
  assert.doesNotMatch(pdf, /createInterCobranca/);
  assert.match(pdf, /application\/pdf/);
  const create = read('app/api/finance/inter/create-charge/route.ts');
  assert.match(create, /createInterInstallmentCharge/);
  assert.match(create, /reused: result.reused/);
  const service = read('lib/banking/inter/interSaleChargeService.ts');
  assert.match(service, /if \(existing\?\.id\)/);
  assert.match(service, /reused: true/);
  assert.doesNotMatch(
    service.slice(service.indexOf('if (existing?.id)'), service.indexOf('const { data: receipt')),
    /createInterCobranca/,
  );
  console.log('OK refresh GET-only / PDF oficial / emissão não duplica');
}

function testWhatsAppWithoutAsaasUrl() {
  const msg = buildInterChargeWhatsAppMessage({
    clientName: 'Maria',
    parcelLabel: 'Parcela 1',
    contractNumber: 'CT-1',
    projectName: 'Loteamento Alfa',
    lotLabel: 'QD 01 • LT 02',
    amount: 11.11,
    dueDateLabel: '09/10/2026',
    charge: charge({ invoiceUrl: null, bankSlipUrl: null, paymentLink: null }),
  });
  assert.match(msg, /Olá, Maria/);
  assert.match(msg, /Loteamento Alfa/);
  assert.match(msg, /Pix copia e cola/);
  assert.match(msg, /Linha digitável/);
  assert.doesNotMatch(msg, /undefined/);
  assert.doesNotMatch(msg, /asaas/i);
  assert.doesNotMatch(msg, /https:\/\/www\.asaas/);

  const share = executeChargeWhatsAppShare({
    installmentId: 'fr-1',
    customerPhone: '11987654321',
    charge: charge({ invoiceUrl: null, bankSlipUrl: null, paymentLink: null }),
    preferInterMessage: true,
    messageInput: {
      clientName: 'Maria',
      parcelLabel: 'Parcela 1',
      contractNumber: 'CT-1',
      projectName: 'Loteamento Alfa',
      lotLabel: 'QD 01 • LT 02',
      amount: 11.11,
      dueDateLabel: '09/10/2026',
    },
  });
  assert.equal(share.ok, true);
  if (share.ok) {
    assert.match(share.url, /wa\.me/);
    assert.doesNotMatch(decodeURIComponent(share.url), /asaas/i);
  }

  const noArtifacts = executeChargeWhatsAppShare({
    installmentId: 'fr-1',
    customerPhone: '11987654321',
    charge: charge({
      pixCopyPaste: null,
      bankSlipIdentification: null,
      invoiceUrl: null,
      bankSlipUrl: null,
      paymentLink: null,
    }),
    preferInterMessage: true,
    messageInput: {
      clientName: 'Maria',
      parcelLabel: 'Parcela 1',
      contractNumber: 'CT-1',
      projectName: 'Alfa',
      lotLabel: 'LT 1',
      amount: 11.11,
      dueDateLabel: '09/10/2026',
    },
  });
  assert.equal(noArtifacts.ok, false);
  console.log('OK WhatsApp Inter sem URL Asaas');
}

function testEmailIndependentOfAsaas() {
  const email = buildInterChargeEmailHtml({
    clientName: 'Maria',
    projectName: 'Loteamento Alfa',
    lotLabel: 'QD 01 — LT 02',
    parcelLabel: 'Parcela 1',
    dueDateLabel: '09/10/2026',
    amount: 11.11,
    pixCopyPaste: '00020101021226580014BR.GOV.BCB.PIX',
    digitableLine: '07790001161111000000000000000000000000000000000',
  });
  assert.match(email.subject, /Parcela 1/);
  assert.match(email.html, /Pix copia e cola/);
  assert.match(email.html, /Linha digitável/);
  assert.doesNotMatch(email.html, /asaas/i);
  const route = read('app/api/finance/inter/send-email/route.ts');
  assert.match(route, /sendResendEmail/);
  assert.match(route, /fetchInterCobrancaPdf/);
  assert.doesNotMatch(route, /company_asaas/);
  assert.doesNotMatch(route, /asaas\/sale-charges/);
  console.log('OK e-mail Inter independente do Asaas');
}

async function testPartialCarne() {
  const notice = buildSaleCarnePartialNotice(2, 4);
  assert.match(String(notice), /2/);
  const built = await buildInterCarnePdfBytes({
    items: [
      {
        charge: charge({ installmentId: 'a', value: 10, dueDate: '2026-10-09' }),
        parcelLabel: 'Parcela 01/04 do contrato',
        officialPdf: null,
      },
      {
        charge: charge({ installmentId: 'b', value: 20, dueDate: '2026-11-09' }),
        parcelLabel: 'Parcela 02/04 do contrato',
        officialPdf: null,
      },
    ],
    emittedCount: 2,
    totalParcels: 4,
    customerName: 'Maria',
    projectName: 'Alfa',
    lotLabel: 'QD 01 — LT 02',
  });
  assert.ok(built.bytes.length > 80);
  assert.equal(built.includedOfficialPdfs, 0);
  assert.equal(built.boletoSheetCount, 0);
  assert.equal(built.coverPages, 0);
  assert.ok(built.pageCount === 0 || built.pageCount === 1, 'sem capa/resumo');
  const header = Buffer.from(built.bytes.slice(0, 8)).toString('utf8');
  assert.match(header, /%PDF/);
  assert.doesNotMatch(Buffer.from(built.bytes).toString('latin1'), /Carnê de cobranças/);
  const carneSvc = read('lib/banking/inter/interCarneService.ts');
  assert.match(carneSvc, /fetchInterCobrancaPdf/);
  assert.doesNotMatch(carneSvc, /createInterCobranca/);
  const panel = read('components/sales/SaleChargesPanel.tsx');
  assert.match(panel, /\/api\/finance\/inter\/sale-charges\/carne-pdf/);
  assert.match(panel, /Gerar carnê em PDF \/ Baixar/);
  assert.doesNotMatch(panel, /Carnê PDF no layout Asaas não se aplica/);
  assert.doesNotMatch(panel, /fase futura/);
  console.log('OK carnê parcial Inter (2 de 4, sem boleto fictício)');
}

async function makeOfficialA4Pdf(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 36, y: 36, width: 523, height: 770, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  page.drawText('BOLETO OFICIAL INTER (fixture)', { x: 48, y: 780, size: 14, font, color: rgb(0, 0, 0) });
  return doc.save();
}

async function testCompactCarnePagination() {
  const cases: Array<{ n: number; pages: number; sheets: number }> = [
    { n: 1, pages: 1, sheets: 1 },
    { n: 2, pages: 1, sheets: 1 },
    { n: 3, pages: 1, sheets: 1 },
    { n: 4, pages: 2, sheets: 2 },
    { n: 6, pages: 2, sheets: 2 },
    { n: 10, pages: 4, sheets: 4 },
  ];
  for (const c of cases) {
    assert.equal(saleCarneBoletoSheetCount(c.n), c.sheets, `sheets ${c.n}`);
    assert.equal(saleCarneDocumentPageCount({ coverPages: 0, boletoCount: c.n }), c.pages, `math ${c.n}`);
    assert.equal(expectedInterCarnePageCount(c.n), c.pages, `expected ${c.n}`);
  }

  const fit = containFitRect(595.28, 841.89, 0, 0, 500, 250);
  assert.ok(Math.abs(fit.width / fit.height - 595.28 / 841.89) < 1e-9, 'contain preserva proporção');
  assert.ok(fit.width <= 500 && fit.height <= 250, 'cabe no slot');
  assert.ok(fit.scale < 1, 'reduz A4 para 1/3');
  assert.ok(Math.abs(fit.width / 595.28 - fit.scale) < 1e-9);
  assert.ok(Math.abs(fit.height / 841.89 - fit.scale) < 1e-9);

  const official = await makeOfficialA4Pdf();
  for (const c of cases) {
    const items = Array.from({ length: c.n }, (_, i) => ({
      charge: charge({ installmentId: `fr-${i}`, asaasPaymentId: `ext-${i}` }),
      parcelLabel: `Parcela ${String(i + 1).padStart(2, '0')}/10 do contrato`,
      officialPdf: official,
    }));
    const built = await buildInterCarnePdfBytes({
      items,
      emittedCount: c.n,
      totalParcels: 10,
      customerName: 'Maria',
    });
    assert.equal(built.includedOfficialPdfs, c.n, `incluiu ${c.n}`);
    assert.equal(built.pageCount, c.pages, `páginas ${c.n} boletos`);
    assert.equal(built.boletoSheetCount, c.sheets, `folhas ${c.n}`);
    assert.equal(built.coverPages, 0, `sem capa ${c.n}`);
  }

  const interPdf = read('lib/banking/inter/interCarnePdf.ts');
  assert.match(interPdf, /containFitRect/);
  assert.match(interPdf, /embedPage/);
  assert.match(interPdf, /saleCarneNeedsNewPage/);
  assert.match(interPdf, /coverPages = 0/);
  assert.doesNotMatch(interPdf, /copyPages/);
  assert.doesNotMatch(interPdf, /Carnê de cobranças — Banco Inter/);
  const asaasPdf = read('lib/finance/saleCarnePdf.ts');
  assert.match(asaasPdf, /SLOT_H/);
  assert.match(asaasPdf, /drawBoletoSlot/);
  assert.match(asaasPdf, /saleCarneNeedsNewPage/);
  assert.match(asaasPdf, /from 'jspdf'/);
  console.log('OK compositor Inter 3/folha sem capa (1,2,3,4,6,10) + Asaas intacto');
}

async function testPaymentSettlementIdempotent() {
  const chargeSeed: Row = {
    id: 'bc-paid',
    company_id: 'co-1',
    status: 'REGISTERED',
    amount: 5,
    finance_receipt_id: 'fr-paid',
    sale_id: 's-1',
    customer_id: 'cu-1',
    external_id: '937fb876-9e2f-4cf2-a2aa-d6be84923b7f',
    metadata: {},
  };
  const mock = createSettlementMock({
    charge: chargeSeed,
    receipt: {
      id: 'fr-paid',
      status: 'pendente',
      company_id: 'co-1',
      sale_id: 's-1',
      customer_id: 'cu-1',
      project_id: 'p-1',
      installment_number: 1,
      amount: 5,
    },
  });
  const first = await settleInterPaidCharge(mock.admin, {
    companyId: 'co-1',
    charge: mock.chargeRow,
    detail: paidDetail(),
  });
  assert.equal(first.paid, true);
  assert.equal(first.duplicate, false);
  assert.equal(mock.cashInserts(), 1);
  assert.equal(mock.receiptRow.status, 'pago');
  assert.equal(String(mock.chargeRow.status).toUpperCase(), 'PAID');

  const second = await settleInterPaidCharge(mock.admin, {
    companyId: 'co-1',
    charge: { ...mock.chargeRow, status: 'PAID' },
    detail: paidDetail(),
  });
  assert.equal(second.paid, true);
  assert.equal(second.duplicate, true);
  assert.equal(mock.cashInserts(), 1);
  assert.equal(mock.movements.length, 1);
  console.log('OK pagamento Inter idempotente (1 cash_movement)');
}

function testGenerateMissingDoesNotReemit() {
  const service = read('lib/banking/inter/interSaleChargeService.ts');
  assert.match(service, /generateMissingInterSaleChargesBatch/);
  assert.match(service, /refreshInterChargeArtifacts/);
  assert.match(service, /result.reused/);
  const gen = read('app/api/finance/inter/sale-charges/generate-missing/route.ts');
  assert.match(gen, /generateMissingInterSaleChargesBatch/);
  console.log('OK lote Inter não reemite cobrança existente');
}

function testAsaasRegressionSourcesIntact() {
  const asaasPaths = [
    'app/api/finance/asaas/sale-charges/carne-pdf/route.ts',
    'app/api/finance/asaas/sale-charges/carne-email/route.ts',
    'lib/finance/saleCarnePdf.ts',
    'lib/finance/asaasCompanyChargeService.ts',
  ];
  for (const rel of asaasPaths) {
    assert.equal(fs.existsSync(path.join(root, rel)), true, rel);
  }
  const panel = read('components/sales/SaleChargesPanel.tsx');
  assert.match(panel, /\/api\/finance\/asaas\/sale-charges\/carne-pdf/);
  assert.match(panel, /\/api\/finance\/asaas\/sale-charges\/generate-missing/);
  console.log('OK regressão Asaas: rotas de carnê/emissão intactas');
}

async function main() {
  console.log('\n=== Inter fase final ===\n');
  testStatusMapping();
  testUiHideGenerateAndNoAsaasActions();
  testRefreshGetOnlyAndPdfRoute();
  testWhatsAppWithoutAsaasUrl();
  testEmailIndependentOfAsaas();
  await testPartialCarne();
  await testCompactCarnePagination();
  await testPaymentSettlementIdempotent();
  testGenerateMissingDoesNotReemit();
  testAsaasRegressionSourcesIntact();
  console.log('\n=== Inter fase final OK ===\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
