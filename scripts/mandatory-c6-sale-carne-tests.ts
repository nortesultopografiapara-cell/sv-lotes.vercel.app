/**
 * Carnê C6 só com boletos já emitidos. Não chama o banco.
 * npx tsx scripts/mandatory-c6-sale-carne-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildC6CarnePdfBytes, c6CarneIncompleteNotice } from '../lib/banking/c6/c6CarnePdf';
import { isC6BolepixV2LiveReceipt } from '../lib/banking/c6/c6BolepixV2OpenApi';
import type { CompanyAsaasChargeResponse } from '../lib/finance/companyAsaasChargeTypes';
import type { SaleChargesSummary } from '../lib/finance/saleChargesShared';
import { saleCarneBoletoSheetCount } from '../lib/finance/saleCarneSlotLayout';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function charge(id: string, line: string): CompanyAsaasChargeResponse {
  return {
    id,
    companyId: 'company',
    customerId: null,
    saleId: 'sale',
    installmentId: id,
    asaasPaymentId: `C6${id}`,
    billingType: 'BOLETO',
    status: 'REGISTERED',
    value: 10,
    dueDate: '2026-11-26',
    invoiceUrl: null,
    bankSlipUrl: null,
    bankSlipIdentification: line,
    pixQrCode: null,
    pixCopyPaste: '00020126580014BR.GOV.BCB.PIX0136oficial',
    financialAccountId: null,
    paymentLink: null,
    paidAt: null,
    createdAt: '2026-11-24T00:00:00Z',
    updatedAt: '2026-11-24T00:00:00Z',
    nossoNumero: '0000000001',
    barCode: null,
  };
}

function summary(total: number, missing: number): SaleChargesSummary {
  return {
    saleId: 'sale',
    companyId: 'company',
    customerName: 'Pagador',
    customerEmail: null,
    customerPhone: null,
    projectName: 'Chacreamento Araguaia',
    quadra: '02',
    lote: '50',
    lotLabel: 'QD 02 — LT 50',
    contractNumber: '000000013/2026',
    financialAccountId: null,
    financialAccountName: 'Conta C6',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
    totalInstallments: total,
    paidInstallments: 0,
    eligibleInstallments: total,
    chargesGenerated: total - missing,
    chargesMissing: missing,
    printableChargesCount: total - missing,
    chargesFailed: 0,
    chargesCancelled: 0,
    firstDueDate: '2026-11-26',
    lastDueDate: '2027-03-02',
    totalAmount: total * 10,
    totalPaid: 0,
    totalPending: total * 10,
    missingInstallmentIds: [],
    missingInstallments: [],
    errorInstallmentIds: [],
    installmentCorrectionType: null,
    uiState: missing > 0 ? 'partial' : 'carne_ready',
    carneReady: total - missing > 0,
    carneBlockReason: null,
    beneficiaryDocumentMissing: false,
    beneficiaryDocumentDivergence: false,
    beneficiaryWarnings: [],
    beneficiaryDocumentSource: null,
  } as SaleChargesSummary;
}

const line = '33690000000000000000000000000000000000000000000'.slice(0, 47);

async function main() {
  let empty = false;
  try {
    await buildC6CarnePdfBytes({
      items: [],
      totalParcels: 5,
      summary: summary(5, 5),
    });
  } catch {
    empty = true;
  }
  assert(empty, 'sem boleto emitido o carnê não é montado');

  const one = await buildC6CarnePdfBytes({
    items: [
      {
        charge: charge('entrada', line),
        parcelLabel: 'Entrada/05 do contrato',
        totalParcels: 5,
        installment: {
          id: 'entrada',
          sale_id: 'sale',
          installment_number: 0,
          due_date: '2026-11-26',
          amount: 10,
          status: 'pendente',
        },
      },
    ],
    totalParcels: 5,
    summary: summary(5, 4),
    beneficiaryName: 'Beneficiário',
    payer: { name: 'Pagador', document: '00000000000' },
  });
  assert(one.included === 1 && one.skippedWithoutOfficialLine === 0, 'carnê parcial com um boleto');
  assert(one.pageCount === 1 && saleCarneBoletoSheetCount(1) === 1, 'um boleto ocupa uma folha');
  assert(
    c6CarneIncompleteNotice(1, 5)?.includes('CARNÊ INCOMPLETO'),
    'o carnê parcial se identifica como incompleto',
  );
  assert(Buffer.from(one.bytes).subarray(0, 4).toString() === '%PDF', 'o arquivo é um PDF');
  const partialText = Buffer.from(one.bytes).toString('latin1');
  assert(partialText.includes('INCOMPLETO'), 'o PDF marca o carnê incompleto');

  const three = await buildC6CarnePdfBytes({
    items: [0, 1, 2].map((n) => ({
      charge: charge(`p${n}`, line),
      parcelLabel: `Parcela ${n}/03 do contrato`,
      totalParcels: 3,
    })),
    totalParcels: 3,
    summary: summary(3, 0),
    beneficiaryName: 'Beneficiário',
    payer: { name: 'Pagador', document: '00000000000' },
  });
  assert(three.included === 3 && three.pageCount === 1, 'três boletos cabem em uma página');
  assert(c6CarneIncompleteNotice(3, 3) === null, 'carnê completo não se declara incompleto');

  const four = await buildC6CarnePdfBytes({
    items: [0, 1, 2, 3].map((n) => ({
      charge: charge(`q${n}`, line),
      parcelLabel: `Parcela ${n}/04 do contrato`,
      totalParcels: 4,
    })),
    totalParcels: 4,
    summary: summary(4, 0),
  });
  assert(four.pageCount === 2 && saleCarneBoletoSheetCount(4) === 2, 'o quarto boleto abre outra página');

  const root = path.resolve(__dirname, '..');
  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
  const pdfRoute = read('app/api/finance/c6/sale-charges/carne-pdf/route.ts');
  const emailRoute = read('app/api/finance/c6/sale-charges/carne-email/route.ts');
  const document = read('lib/banking/c6/c6SaleCarneDocument.ts');
  const panel = read('components/sales/SaleChargesPanel.tsx');
  const batch = read('lib/finance/saleChargesService.ts');
  for (const source of [pdfRoute, emailRoute, document]) {
    assert(!source.includes('postC6BolepixV2Charge'), 'baixar ou enviar o carnê não emite');
    assert(!source.includes('emitC6InstallmentBoleto'), 'o carnê não reserva boleto');
  }
  assert(panel.includes('Gerar boletos pendentes'), 'o botão de pendentes aparece na aba C6');
  assert(panel.includes('disabled'), 'o lote C6 permanece desabilitado');
  assert(batch.includes('Emissão C6 em lote permanece bloqueada'), 'o servidor recusa o lote');
  assert(!batch.includes('emitC6InstallmentBoleto'), 'o lote não chama a emissão individual');
  assert(
    isC6BolepixV2LiveReceipt(
      'f26f2331-1885-4ac6-8d0e-4131cc8a8014',
      'b5cc1de3-172b-4926-a528-36cebc14db51',
      '693281b1-4d61-4209-adcc-0b378968aed3',
    ),
    'a entrada autorizada permanece a única',
  );
  assert(
    !isC6BolepixV2LiveReceipt(
      '00000000-0000-4000-8000-000000000099',
      'b5cc1de3-172b-4926-a528-36cebc14db51',
      '693281b1-4d61-4209-adcc-0b378968aed3',
    ),
    'outra empresa continua bloqueada',
  );
  assert(!read('lib/finance/saleCarnePdf.ts').includes('c6Bolepix'), 'o gerador Asaas não passa a depender do C6');
  assert(!read('lib/banking/inter/interCarnePdf.ts').includes('c6CarneIncompleteNotice'), 'o carnê Inter não muda');

  console.log('C6_SALE_CARNE_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
