/**
 * Testes obrigatórios — download PDF contrato SaaS v1/v2.
 * npx tsx scripts/mandatory-saas-contract-v2-download-tests.ts
 */

import { buildSaasContractPdfWithMeta } from '../lib/saasContractPdf';
import {
  menesesSaasContractFixture,
  SAAS_CONTRACT_LEGACY_CONTENT_VERSION,
} from '../lib/saasContractContent';
import {
  computeSignatureHashSync,
  formatSignatureDateBr,
  formatSignatureTimeBr,
} from '../lib/saasContractSignaturePdf';
import {
  buildSaasContractPdfHttpHeaders,
  createSaasContractPdfResponse,
  isPdfBytes,
  pdfBytesToLatinHeader,
} from '../lib/saasContractPdfHttp';
import { countPdfPages } from '../lib/saasContractPdfValidation';
import type { CompanyContractRow } from '../lib/saasContractService';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function fixtureInput() {
  const f = menesesSaasContractFixture();
  return {
    company: f.company,
    subscription: {
      contract_number: f.subscription.contract_number || '00001/2026',
      plan_type: f.subscription.plan_type,
      monthly_price: f.subscription.monthly_price,
      start_date: f.subscription.start_date,
      first_payment_date: f.subscription.first_payment_date,
      next_due_date: f.subscription.next_due_date,
    },
  };
}

function testV1DraftPdf() {
  const built = buildSaasContractPdfWithMeta(fixtureInput(), {
    contentVersion: SAAS_CONTRACT_LEGACY_CONTENT_VERSION,
  });
  assert(isPdfBytes(built.pdf), 'v1 draft é PDF');
  assert(pdfBytesToLatinHeader(built.pdf).startsWith('%PDF'), 'v1 começa com %PDF');
  assert(built.clausesCount === 24, 'v1 tem 24 cláusulas');
  console.log('OK testV1DraftPdf');
}

function testV2DraftPdf() {
  const built = buildSaasContractPdfWithMeta(fixtureInput(), { contentVersion: 2 });
  assert(isPdfBytes(built.pdf), 'v2 draft é PDF');
  assert(pdfBytesToLatinHeader(built.pdf).startsWith('%PDF'), 'v2 começa com %PDF');
  assert(built.clausesCount === 25, 'v2 tem 25 cláusulas');
  console.log('OK testV2DraftPdf');
}

function testV2ViewedScenario() {
  const built = buildSaasContractPdfWithMeta(fixtureInput(), { contentVersion: 2 });
  assert(built.pageCount >= 3, 'v2 visualizado (draft) tem páginas');
  assert(countPdfPages(built.pdf) === built.pageCount, 'contagem páginas consistente');
  console.log('OK testV2ViewedScenario');
}

function testV2SignedFinalPdf() {
  const input = fixtureInput();
  const clientSignedAt = '2026-06-08T15:30:00.000Z';
  const providerSignedAt = '2026-06-08T16:00:00.000Z';
  const contractNumber = input.subscription.contract_number;
  const hash = computeSignatureHashSync('test-final-pdf');

  const built = buildSaasContractPdfWithMeta(input, {
    contentVersion: 2,
    bilateralCertificate: {
      contractNumber,
      client: {
        contractNumber,
        signerName: 'Cliente Teste',
        signerDocument: '12345678901',
        signerEmail: 'cliente@test.com',
        signerRole: 'Sócio',
        ipAddress: '127.0.0.1',
        signedDate: formatSignatureDateBr(clientSignedAt),
        signedTime: formatSignatureTimeBr(clientSignedAt),
        signatureHash: hash,
        partyLabel: 'CONTRATANTE',
      },
      provider: {
        contractNumber,
        signerName: 'SV LOTES',
        signerDocument: '98765432100',
        signerEmail: 'sv@test.com',
        signerRole: 'Representante',
        ipAddress: '127.0.0.2',
        signedDate: formatSignatureDateBr(providerSignedAt),
        signedTime: formatSignatureTimeBr(providerSignedAt),
        signatureHash: hash,
        partyLabel: 'CONTRATADA',
      },
    },
  });

  assert(isPdfBytes(built.pdf), 'v2 assinado é PDF');
  assert(built.pageCount > 3, 'v2 assinado inclui certificado');
  console.log('OK testV2SignedFinalPdf');
}

function testHttpHeadersAndResponse() {
  const built = buildSaasContractPdfWithMeta(fixtureInput(), { contentVersion: 2 });
  const headers = buildSaasContractPdfHttpHeaders('attachment', '00007/2026', {
    pageCount: built.pageCount,
    clausesCount: built.clausesCount,
  });
  assert(headers['Content-Type'] === 'application/pdf', 'Content-Type application/pdf');
  assert(headers['Content-Disposition'].includes('attachment'), 'Content-Disposition attachment');
  assert(headers['Cache-Control'].includes('no-store'), 'Cache-Control no-store');

  const res = createSaasContractPdfResponse(built.pdf, 'attachment', {
    contractNumber: '00007/2026',
    pageCount: built.pageCount,
    clausesCount: built.clausesCount,
    source: 'regenerated',
  });
  assert(res.status === 200, 'response status 200');
  assert(res.headers.get('Content-Type') === 'application/pdf', 'response Content-Type');
  assert(res.headers.get('Content-Length') != null, 'Content-Length presente');
  console.log('OK testHttpHeadersAndResponse');
}

function testArchivedContractRecordShape() {
  const row: CompanyContractRow = {
    id: 'c-arch',
    company_id: 'co1',
    subscription_id: null,
    contract_url: 'https://example.com/draft.pdf',
    pdf_signed_url: null,
    contract_number: '00007/2026',
    version: 7,
    generated_at: '2026-06-08T00:00:00Z',
    status: 'viewed',
    content_version: 2,
    archived_at: '2026-06-09T00:00:00Z',
    archive_kind: 'test',
  };
  assert(row.content_version === 2, 'arquivado v2 mantém content_version');
  assert(row.status === 'viewed', 'status visualizado');
  console.log('OK testArchivedContractRecordShape');
}

function main() {
  testV1DraftPdf();
  testV2DraftPdf();
  testV2ViewedScenario();
  testV2SignedFinalPdf();
  testHttpHeadersAndResponse();
  testArchivedContractRecordShape();
  console.log('\nTodos os testes mandatory-saas-contract-v2-download passaram.');
}

main();
