/**
 * Testes obrigatórios — conteúdo jurídico PDF contrato SaaS v1 vs v2.
 * npx tsx scripts/mandatory-saas-contract-v2-content-tests.ts
 */

import { buildSaasContractPdfWithMeta } from '../lib/saasContractPdf';
import {
  menesesSaasContractFixture,
  SAAS_CONTRACT_CONTENT_VERSION,
  SAAS_CONTRACT_LEGACY_CONTENT_VERSION,
  SAAS_CONTRACT_V2_CONTENT_VERSION,
} from '../lib/saasContractContent';
import {
  countSaasContractClausesInPdfText,
  detectSaasContractPdfContentVersion,
  pdfContainsSaasContractV1LegacyMarkers,
  roughSaasContractPdfText,
  SAAS_CONTRACT_V2_FUTURE_SIGNATURE_PHRASE,
  SAAS_CONTRACT_V2_LEGACY_22_PHRASE,
  storedPdfMatchesExpectedContentVersion,
} from '../lib/saasContractPdfContentDetect';
import {
  SAAS_CONTRACT_LEGACY_CLAUSES_COUNT,
  SAAS_CONTRACT_V2_CLAUSES_COUNT,
} from '../lib/saasContractPdfValidation';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function fixtureInput() {
  const f = menesesSaasContractFixture();
  return {
    company: f.company,
    subscription: {
      contract_number: f.subscription.contract_number || '00007/2026',
      plan_type: f.subscription.plan_type,
      monthly_price: f.subscription.monthly_price,
      start_date: f.subscription.start_date,
      first_payment_date: f.subscription.first_payment_date,
      next_due_date: f.subscription.next_due_date,
    },
  };
}

function testV2PdfContent() {
  const built = buildSaasContractPdfWithMeta(fixtureInput(), {
    contentVersion: SAAS_CONTRACT_V2_CONTENT_VERSION,
  });
  const rough = roughSaasContractPdfText(built.pdf);

  assert(built.clausesCount === SAAS_CONTRACT_V2_CLAUSES_COUNT, 'v2 meta: 25 cláusulas');
  assert(
    countSaasContractClausesInPdfText(rough) === SAAS_CONTRACT_V2_CLAUSES_COUNT,
    'v2 PDF: 25 cláusulas detectadas',
  );
  assert(
    rough.includes('22-a') || rough.includes('cláusula 22-a') || rough.includes('clausula 22-a'),
    'v2 PDF contém CLÁUSULA 22-A',
  );
  assert(
    !rough.includes(SAAS_CONTRACT_V2_LEGACY_22_PHRASE),
    'v2 PDF não contém frase legado cláusula 22',
  );
  assert(
    !pdfContainsSaasContractV1LegacyMarkers(rough),
    'v2 PDF sem marcadores v1 legado',
  );
  assert(
    !rough.includes(SAAS_CONTRACT_V2_FUTURE_SIGNATURE_PHRASE),
    'v2 PDF não contém "fase posterior"',
  );
  assert(
    detectSaasContractPdfContentVersion(built.pdf) === SAAS_CONTRACT_V2_CONTENT_VERSION,
    'detector identifica PDF v2',
  );
  assert(
    storedPdfMatchesExpectedContentVersion(built.pdf, SAAS_CONTRACT_V2_CONTENT_VERSION),
    'PDF v2 aceito para content_version=2',
  );

  console.log('OK testV2PdfContent');
}

function testV1LegacyPdfContent() {
  const built = buildSaasContractPdfWithMeta(fixtureInput(), {
    contentVersion: SAAS_CONTRACT_LEGACY_CONTENT_VERSION,
  });
  const rough = roughSaasContractPdfText(built.pdf);

  assert(built.clausesCount === SAAS_CONTRACT_LEGACY_CLAUSES_COUNT, 'v1 meta: 24 cláusulas');
  assert(
    countSaasContractClausesInPdfText(rough) === SAAS_CONTRACT_LEGACY_CLAUSES_COUNT,
    'v1 PDF: 24 cláusulas detectadas',
  );
  assert(
    rough.includes(SAAS_CONTRACT_V2_LEGACY_22_PHRASE) ||
      rough.includes('manifestação preliminar') ||
      rough.includes('manifestacao preliminar'),
    'v1 PDF contém texto legado cláusula 22',
  );
  assert(
    !rough.includes('22-a') || pdfContainsSaasContractV1LegacyMarkers(rough),
    'v1 PDF não é confundido com v2',
  );
  assert(
    detectSaasContractPdfContentVersion(built.pdf) === SAAS_CONTRACT_LEGACY_CONTENT_VERSION,
    'detector identifica PDF v1',
  );
  assert(
    storedPdfMatchesExpectedContentVersion(built.pdf, SAAS_CONTRACT_LEGACY_CONTENT_VERSION),
    'PDF v1 aceito para content_version=1',
  );

  console.log('OK testV1LegacyPdfContent');
}

function testStaleV1RejectedForV2Expected() {
  const v1 = buildSaasContractPdfWithMeta(fixtureInput(), {
    contentVersion: SAAS_CONTRACT_LEGACY_CONTENT_VERSION,
  }).pdf;
  assert(
    !storedPdfMatchesExpectedContentVersion(v1, SAAS_CONTRACT_V2_CONTENT_VERSION),
    'PDF v1 no storage não serve para content_version=2',
  );
  console.log('OK testStaleV1RejectedForV2Expected');
}

function main() {
  testV2PdfContent();
  testV1LegacyPdfContent();
  testStaleV1RejectedForV2Expected();
  console.log('\nTodos os testes mandatory-saas-contract-v2-content passaram.');
}

main();
