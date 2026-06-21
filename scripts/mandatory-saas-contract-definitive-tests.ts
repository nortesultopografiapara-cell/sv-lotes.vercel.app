/**
 * Testes obrigatórios — contratos SaaS e assinatura eletrônica (correção definitiva).
 * npm run test:saas-contracts
 */

import { jsPDF } from 'jspdf';
import { buildSaasContractPdfWithMeta } from '../lib/saasContractPdf';
import {
  buildSaasContractDocumentText,
  menesesSaasContractFixture,
  SAAS_CONTRACT_CONTENT_VERSION,
  SAAS_CONTRACT_V2_CONTENT_VERSION,
} from '../lib/saasContractContent';
import {
  normalizeCompanyContractData,
  type SaasContractCompanyInput,
} from '../lib/saasContractValidation';
import {
  formatSaasContractAddress,
  normalizeContractStreetLine,
} from '../lib/saasContractAddress';
import {
  formatSignerDocumentFieldLabel,
  formatSignerDocumentLine,
  resolveSignerDocumentLabel,
} from '../lib/saasContractDocumentLabel';
import {
  appendBilateralSignatureCertificateToPdf,
  buildSignatureHashPayload,
  computeSignatureHashSync,
  ELECTRONIC_SIGNATURE_BADGE,
  formatSignatureDateBr,
  formatSignatureTimeBr,
} from '../lib/saasContractSignaturePdf';
import {
  buildSignatureHistory,
  generateSignatureToken,
  type CompanyContractSignatureRow,
} from '../lib/saasContractSignatureService';
import {
  countSaasContractClausesInPdfText,
  detectSaasContractPdfContentVersion,
  roughSaasContractPdfText,
} from '../lib/saasContractPdfContentDetect';
import { SAAS_CONTRACT_V3_CLAUSES_COUNT } from '../lib/saasContractPdfValidation';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function pdfRaw(pdf: Uint8Array): string {
  return Buffer.from(pdf).toString('latin1');
}

function fixtureInput(companyOverrides: Record<string, unknown> = {}) {
  const f = menesesSaasContractFixture();
  return {
    company: { ...f.company, ...companyOverrides },
    subscription: {
      contract_number: f.subscription.contract_number || '00002/2026',
      plan_type: f.subscription.plan_type,
      monthly_price: f.subscription.monthly_price,
      start_date: f.subscription.start_date,
      first_payment_date: f.subscription.first_payment_date,
      next_due_date: f.subscription.next_due_date,
    },
  };
}

function baseSignatureFixture(
  overrides: Partial<CompanyContractSignatureRow> = {},
): CompanyContractSignatureRow {
  return {
    id: 'sig-00002-2026',
    contract_id: 'c1',
    company_id: 'co1',
    signer_name: 'Cliente Teste',
    signer_email: 'cliente@test.com',
    signer_document: '65082028200',
    signer_role: 'Titular',
    signature_status: 'SIGNED',
    signature_token: 'client-token-abc123def456',
    provider_signature_token: 'provider-token-xyz789uvw012',
    signature_url: 'https://example.com/sign/client',
    ip_address: '203.0.113.10',
    user_agent: 'test',
    viewed_at: '2026-06-01T10:00:00.000Z',
    signed_at: '2026-06-01T10:05:00.000Z',
    expires_at: '2026-07-01T10:00:00.000Z',
    signature_hash: computeSignatureHashSync('client-hash-payload'),
    provider_signer_name: 'Representante SV',
    provider_signer_email: 'sv@svlotes.com.br',
    provider_signer_document: '12345678901',
    provider_signer_role: 'Socio',
    provider_signed_at: '2026-06-01T11:00:00.000Z',
    provider_signature_hash: computeSignatureHashSync('provider-hash-payload'),
    provider_ip_address: '203.0.113.20',
    provider_user_agent: 'test',
    signer_latitude: -6.0675,
    signer_longitude: -49.9032,
    signer_geo_city: 'Parauapebas/PA',
    created_at: '2026-06-01T09:00:00.000Z',
    updated_at: '2026-06-01T11:00:00.000Z',
    ...overrides,
  };
}

function testNaturalPersonDocumentLabel() {
  assert(resolveSignerDocumentLabel('65082028200') === 'CPF', 'PF: label CPF');
  assert(formatSignerDocumentLine('65082028200').startsWith('CPF:'), 'PF: linha CPF');
  assert(formatSignerDocumentFieldLabel('65082028200') === 'CPF', 'PF: campo CPF');
  console.log('OK testNaturalPersonDocumentLabel');
}

function testLegalPersonDocumentLabel() {
  assert(resolveSignerDocumentLabel('64435850000103') === 'CNPJ', 'PJ: label CNPJ');
  assert(formatSignerDocumentLine('64435850000103').startsWith('CNPJ:'), 'PJ: linha CNPJ');
  console.log('OK testLegalPersonDocumentLabel');
}

function testFullAddressFormatting() {
  const normalized = normalizeContractStreetLine('Rua 02quadra 123 lote 05');
  assert(normalized.includes('Quadra'), 'endereco: insere Quadra');
  assert(normalized.includes('Lote'), 'endereco: insere Lote');
  assert(normalized.includes(','), 'endereco: possui separadores');

  const formatted = formatSaasContractAddress({
    street: 'Rua 02',
    block: '123',
    lot: '05',
    neighborhood: 'Nova Carajás',
    city: 'Parauapebas',
    state: 'PA',
    cep: '68515000',
  });
  assert(formatted.streetLine.includes('Quadra 123'), 'quadra formatada');
  assert(formatted.streetLine.includes('Lote 05'), 'lote formatado');
  assert(formatted.cityStateLine.includes('Parauapebas'), 'cidade completa');
  assert(formatted.cepLine.includes('68515-000'), 'CEP formatado');

  const companyData = normalizeCompanyContractData({
    logradouro: 'Rua 02',
    quadra: '123',
    lote: '05',
    bairro: 'Nova Carajás',
    city: 'Parauapebas',
    state: 'PA',
    cep: '68515000',
  } as SaasContractCompanyInput);
  assert(companyData.address.includes(','), 'normalize: separadores no endereco');
  assert(companyData.neighborhood === 'Nova Carajás', 'normalize: bairro');

  const built = buildSaasContractPdfWithMeta(
    fixtureInput({
      address: 'Rua 02quadra 123 lote 05',
      city: 'Parauapebas',
      state: 'PA',
      cep: '68515000',
      bairro: 'Nova Carajás',
    }),
    { contentVersion: SAAS_CONTRACT_CONTENT_VERSION },
  );
  const rough = roughSaasContractPdfText(built.pdf);
  assert(rough.includes('parauapebas'), 'PDF: cidade nao truncada');
  console.log('OK testFullAddressFormatting');
}

function testIndependentSignatureTokens() {
  const clientToken = generateSignatureToken();
  const providerToken = generateSignatureToken();
  assert(clientToken !== providerToken, 'tokens distintos');
  assert(clientToken.length > 32, 'token cliente robusto');
  assert(providerToken.length > 32, 'token provider robusto');

  const sig = baseSignatureFixture();
  assert(sig.signature_token !== sig.provider_signature_token, 'fixture: tokens independentes');
  console.log('OK testIndependentSignatureTokens');
}

function testElectronicCertificate() {
  const doc = new jsPDF();
  const signedAt = '2026-06-01T10:05:00.000Z';
  appendBilateralSignatureCertificateToPdf(
    doc,
    {
      contractNumber: '00002/2026',
      contentVersion: 3,
      client: {
        contractNumber: '00002/2026',
        signerName: 'Cliente PF',
        signerDocument: '65082028200',
        signerEmail: 'cliente@test.com',
        signerRole: 'Titular',
        ipAddress: '203.0.113.10',
        signedDate: formatSignatureDateBr(signedAt),
        signedTime: formatSignatureTimeBr(signedAt),
        signatureHash: computeSignatureHashSync('client'),
        signatureToken: 'client-token-only',
        signatureId: 'sig-client-id',
        contentVersion: 3,
        partyLabel: 'CONTRATANTE',
        geoCity: 'Parauapebas/PA',
        latitude: -6.0675,
        longitude: -49.9032,
      },
      provider: {
        contractNumber: '00002/2026',
        signerName: 'SV Rep',
        signerDocument: '12345678901',
        signerEmail: 'sv@svlotes.com.br',
        signerRole: 'Socio',
        ipAddress: '203.0.113.20',
        signedDate: formatSignatureDateBr(signedAt),
        signedTime: formatSignatureTimeBr(signedAt),
        signatureHash: computeSignatureHashSync('provider'),
        signatureToken: 'provider-token-only',
        signatureId: 'sig-provider-id',
        contentVersion: 3,
        partyLabel: 'CONTRATADA',
      },
    },
    14,
    doc.internal.pageSize.getWidth(),
  );
  const raw = pdfRaw(new Uint8Array(doc.output('arraybuffer')));
  assert(raw.includes('client') && raw.includes('provider'), 'certificado: tokens distintos mascarados');
  assert(raw.includes('650.820.282-00') || raw.includes('65082028200'), 'certificado: CPF cliente');
  assert(!raw.includes('CNPJ 650'), 'certificado: nunca CNPJ para CPF');
  assert(raw.includes('ASSINADO ELETRONICAMENTE'), 'certificado: badge ASCII');
  assert(!raw.includes('\u2713'), 'certificado: sem unicode checkmark');
  console.log('OK testElectronicCertificate');
}

function testBilateralSignedPdf() {
  const sig = baseSignatureFixture();
  const built = buildSaasContractPdfWithMeta(fixtureInput(), {
    contentVersion: SAAS_CONTRACT_CONTENT_VERSION,
    bilateralCertificate: {
      contractNumber: '00002/2026',
      contentVersion: 3,
      client: {
        contractNumber: '00002/2026',
        signerName: sig.signer_name!,
        signerDocument: sig.signer_document!,
        signerEmail: sig.signer_email,
        ipAddress: sig.ip_address || '—',
        signedDate: formatSignatureDateBr(sig.signed_at!),
        signedTime: formatSignatureTimeBr(sig.signed_at!),
        signatureHash: sig.signature_hash!,
        signatureToken: sig.signature_token,
        signatureId: sig.id,
        contentVersion: 3,
        partyLabel: 'CONTRATANTE',
      },
      provider: {
        contractNumber: '00002/2026',
        signerName: sig.provider_signer_name!,
        signerDocument: sig.provider_signer_document!,
        signerEmail: sig.provider_signer_email,
        ipAddress: sig.provider_ip_address || '—',
        signedDate: formatSignatureDateBr(sig.provider_signed_at!),
        signedTime: formatSignatureTimeBr(sig.provider_signed_at!),
        signatureHash: sig.provider_signature_hash!,
        signatureToken: sig.provider_signature_token!,
        signatureId: sig.id,
        contentVersion: 3,
        partyLabel: 'CONTRATADA',
      },
    },
    executedSignatures: {
      client: {
        name: sig.signer_name!,
        document: sig.signer_document!,
        role: sig.signer_role,
        signedDate: formatSignatureDateBr(sig.signed_at!),
      },
      provider: {
        name: sig.provider_signer_name!,
        document: sig.provider_signer_document!,
        role: sig.provider_signer_role,
        signedDate: formatSignatureDateBr(sig.provider_signed_at!),
      },
    },
  });

  const raw = pdfRaw(built.pdf);
  assert(raw.includes(ELECTRONIC_SIGNATURE_BADGE), 'PDF bilateral: badge ASCII');
  assert(!raw.includes('\u2713'), 'PDF bilateral: sem caractere quebrado');
  assert(built.pageCount >= 4, 'PDF bilateral: paginas suficientes');
  console.log('OK testBilateralSignedPdf');
}

function testRegeneratedContractContentVersion() {
  const text = buildSaasContractDocumentText(fixtureInput(), SAAS_CONTRACT_CONTENT_VERSION);
  assert(text.includes('SUCESSÃO DE VERSÕES') || text.includes('SUCESSAO DE VERSOES'), 'v3: sucessao');
  assert(text.includes('NÍVEL DE SERVIÇO') || text.includes('NIVEL DE SERVICO'), 'v3: SLA');

  const v2text = buildSaasContractDocumentText(fixtureInput(), SAAS_CONTRACT_V2_CONTENT_VERSION);
  assert(!v2text.includes('SUCESSÃO DE VERSÕES'), 'v2 legado: sem sucessao');
  console.log('OK testRegeneratedContractContentVersion');
}

function testOptionalGeolocation() {
  const withGeo = baseSignatureFixture({
    signer_geo_city: 'Parauapebas/PA',
    signer_latitude: -6.0675,
    signer_longitude: -49.9032,
  });
  assert(withGeo.signer_geo_city === 'Parauapebas/PA', 'geo: cidade');
  assert(withGeo.signer_latitude != null, 'geo: latitude');

  const withoutGeo = baseSignatureFixture({
    signer_geo_city: null,
    signer_latitude: null,
    signer_longitude: null,
  });
  assert(withoutGeo.signer_latitude == null, 'geo opcional: ausente OK');
  console.log('OK testOptionalGeolocation');
}

function testSlaClausePresent() {
  const text = buildSaasContractDocumentText(fixtureInput(), SAAS_CONTRACT_CONTENT_VERSION);
  assert(
    text.includes('24 (vinte e quatro) horas') || text.includes('24 horas'),
    'SLA: prazo critico no texto',
  );
  assert(text.includes('10 (dez) dias') || text.includes('10 dias'), 'SLA: prazo baixo no texto');

  const built = buildSaasContractPdfWithMeta(fixtureInput(), {
    contentVersion: SAAS_CONTRACT_CONTENT_VERSION,
  });
  assert(built.clausesCount === SAAS_CONTRACT_V3_CLAUSES_COUNT, 'v3: 27 clausulas');
  assert(
    detectSaasContractPdfContentVersion(built.pdf) === SAAS_CONTRACT_CONTENT_VERSION,
    'detector v3',
  );
  console.log('OK testSlaClausePresent');
}

function testVersionSuccessionClause() {
  const built = buildSaasContractPdfWithMeta(fixtureInput(), {
    contentVersion: SAAS_CONTRACT_CONTENT_VERSION,
  });
  const rough = roughSaasContractPdfText(built.pdf);
  assert(
    rough.includes('sucess') && rough.includes('vers'),
    'clausula sucessao de versoes presente',
  );
  assert(
    countSaasContractClausesInPdfText(rough) === SAAS_CONTRACT_V3_CLAUSES_COUNT,
    'contagem clausulas v3',
  );
  console.log('OK testVersionSuccessionClause');
}

function testSignatureHistoryDocumentLabels() {
  const history = buildSignatureHistory(
    baseSignatureFixture({ signer_document: '65082028200' }),
  );
  const clientEvent = history.find((e) => e.event === 'Cliente assinou');
  assert(Boolean(clientEvent?.details?.startsWith('CPF')), 'historico: CPF cliente');
  const providerEvent = history.find((e) => e.event === 'SV assinou');
  assert(Boolean(providerEvent?.details?.startsWith('CPF')), 'historico: CPF provider');
  console.log('OK testSignatureHistoryDocumentLabels');
}

function testHashPayloadIndependentParties() {
  const base = {
    contractId: 'c1',
    contractNumber: '00002/2026',
    signerName: 'Teste',
    signerDocument: '12345678901',
    signerEmail: 'a@b.com',
    signedAt: '2026-06-01T10:00:00.000Z',
    ipAddress: '1.1.1.1',
  };
  const clientPayload = buildSignatureHashPayload({ ...base, party: 'CLIENT' });
  const providerPayload = buildSignatureHashPayload({ ...base, party: 'PROVIDER' });
  assert(clientPayload !== providerPayload, 'hash payload distinto por parte');
  console.log('OK testHashPayloadIndependentParties');
}

async function main() {
  testNaturalPersonDocumentLabel();
  testLegalPersonDocumentLabel();
  testFullAddressFormatting();
  testIndependentSignatureTokens();
  testElectronicCertificate();
  testBilateralSignedPdf();
  testRegeneratedContractContentVersion();
  testOptionalGeolocation();
  testSlaClausePresent();
  testVersionSuccessionClause();
  testSignatureHistoryDocumentLabels();
  testHashPayloadIndependentParties();
  console.log('\nTodos os testes SaaS/contratos passaram.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
