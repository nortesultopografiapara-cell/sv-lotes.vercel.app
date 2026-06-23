/**
 * Testes — evidências eletrônicas, certificado e validação pública /verify/[token].
 * npx tsx scripts/mandatory-signature-verify-evidence-tests.ts
 */

import {
  buildClientEvidencePatch,
  parseUserAgent,
  readClientEvidenceFromRow,
} from '../lib/signatureEvidence';
import {
  maskCpfPublic,
  maskEmailPublic,
  maskIpPublic,
  maskPhonePublic,
} from '../lib/signaturePrivacy';
import { buildSignatureVerifyUrl } from '../lib/signatureVerifyUrls';
import {
  buildSaleContractSignatureCertificateHtml,
} from '../lib/saleContractSignatureCertificateHtml';
import { computeSignatureHashSync, buildSignatureHashPayload } from '../lib/saasContractSignaturePdf';
import { buildCertificateRows } from '../lib/saasContractSignaturePdf';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testSaleEvidencePatch() {
  const patch = buildClientEvidencePatch({
    signerEmail: 'joao@test.com',
    signerPhone: '(94) 99999-9999',
    ipAddress: '177.54.10.20',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    signedAt: '2026-06-08T15:30:00.000Z',
    documentType: 'CONTRATO_VENDA',
    validationToken: 'token123',
    geo: { city: 'Parauapebas', region: 'Pará', country: 'Brazil' },
    signatureEventId: 'event-uuid-1',
  });
  assert(patch.signer_browser === 'Google Chrome', 'browser');
  assert(patch.signer_os === 'Windows', 'os');
  assert(patch.signer_device === 'Desktop', 'device');
  assert(patch.signed_document_type === 'CONTRATO_VENDA', 'doc type');
  assert(String(patch.validation_public_url).includes('/verify/token123'), 'validation url');
  console.log('OK testSaleEvidencePatch');
}

function testSaasEvidencePatch() {
  const patch = buildClientEvidencePatch({
    signerEmail: 'cliente@test.com',
    ipAddress: '177.54.10.20',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    signedAt: '2026-06-08T15:30:00.000Z',
    documentType: 'CONTRATO_SAAS',
    validationToken: 'saas-token',
  });
  assert(patch.signed_document_type === 'CONTRATO_SAAS', 'saas doc type');
  assert(patch.signer_device === 'Mobile', 'mobile device');
  console.log('OK testSaasEvidencePatch');
}

function testCertificateShowsEvidence() {
  const html = buildSaleContractSignatureCertificateHtml({
    contractNumber: '000000050/2026',
    projectName: 'Residencial',
    quadra: '05',
    lote: '12',
    buyerName: 'João Comprador',
    buyerDocument: '98765432100',
    signerEmail: 'joao@test.com',
    signerPhone: '(94) 99999-9999',
    browser: 'Google Chrome',
    os: 'Windows',
    device: 'Desktop',
    approxLocation: 'Parauapebas, Pará, Brazil',
    signatureEventId: 'event-uuid-1',
    signatureStatus: 'ASSINADO',
    signedAt: '2026-06-08T15:30:00.000Z',
    ipAddress: '177.54.10.20',
    signatureToken: 'abc123',
    signatureHash: 'a'.repeat(64),
    publicUrl: buildSignatureVerifyUrl('abc123'),
  });
  assert(html.includes('E-mail'), 'email no certificado');
  assert(html.includes('joao@test.com'), 'email valor');
  assert(html.includes('Navegador'), 'navegador');
  assert(html.includes('Google Chrome'), 'browser valor');
  assert(html.includes('Sistema operacional'), 'so');
  assert(html.includes('Dispositivo'), 'device');
  assert(html.includes('Localização aproximada'), 'localização');
  assert(html.includes('ID único da assinatura'), 'event id');
  console.log('OK testCertificateShowsEvidence');
}

function testLegacyCertificateFallback() {
  const legacy = readClientEvidenceFromRow({
    signer_email: 'legacy@test.com',
    ip_address: '1.2.3.4',
    signed_at: '2026-01-01T10:00:00.000Z',
  });
  assert(legacy.browser === 'Não informado', 'legacy browser');
  assert(legacy.location === 'Não identificado', 'legacy location');
  const html = buildSaleContractSignatureCertificateHtml({
    contractNumber: '1',
    projectName: 'P',
    quadra: '1',
    lote: '1',
    buyerName: 'Legacy',
    buyerDocument: '12345678901',
    signerEmail: legacy.email,
    browser: legacy.browser,
    os: legacy.os,
    device: legacy.device,
    approxLocation: legacy.location,
    signatureEventId: legacy.signatureEventId,
    signatureStatus: 'ASSINADO',
    signedAt: legacy.signedAt,
    ipAddress: legacy.ipAddress,
    signatureToken: 'legacy',
    signatureHash: 'b'.repeat(64),
  });
  assert(html.includes('Não informado'), 'legacy exibe fallback');
  console.log('OK testLegacyCertificateFallback');
}

function testPublicMasking() {
  assert(maskCpfPublic('98765432100') === '987.***.***-00', 'cpf mask');
  assert(maskEmailPublic('severino@nortesultopografia.com.br') === 'sev***@nortesultopografia.com.br', 'email mask');
  assert(maskIpPublic('177.54.10.20') === '177.54.***.***', 'ip mask');
  assert(maskPhonePublic('94991955918') === '(94) *****-5918', 'phone mask');
  console.log('OK testPublicMasking');
}

function testVerifyUrlAndQrTarget() {
  const url = buildSignatureVerifyUrl('my-token-xyz');
  assert(url.includes('/verify/my-token-xyz'), 'verify url');
  assert(!url.includes('/sign/sale/'), 'nao usa sign/sale no qr');
  console.log('OK testVerifyUrlAndQrTarget');
}

function testHashUnchanged() {
  const payload = buildSignatureHashPayload({
    contractId: 'c1',
    contractNumber: '001/2026',
    signerName: 'João',
    signerDocument: '98765432100',
    signerEmail: 'joao@test.com',
    signedAt: '2026-06-08T15:30:00.000Z',
    ipAddress: '177.54.10.20',
    party: 'CLIENT',
  });
  const hash = computeSignatureHashSync(payload);
  assert(hash.length === 64, 'sha256 length');
  assert(hash === computeSignatureHashSync(payload), 'hash determinístico');
  console.log('OK testHashUnchanged');
}

function testSaasCertificateEvidenceRows() {
  const rows = buildCertificateRows({
    contractNumber: '001/2026',
    signerName: 'Cliente',
    signerDocument: '12345678901',
    signerEmail: 'cliente@test.com',
    ipAddress: '177.54.10.20',
    signedDate: '08/06/2026',
    signedTime: '15:30:00',
    signatureHash: 'a'.repeat(64),
    browser: 'Google Chrome',
    os: 'Windows',
    device: 'Desktop',
    phone: '(94) 99999-9999',
    approxLocation: 'Parauapebas, Pará',
  });
  const labels = rows.map((r) => r.label);
  assert(labels.includes('Navegador'), 'saas cert browser');
  assert(labels.includes('Sistema operacional'), 'saas cert os');
  assert(labels.includes('Dispositivo'), 'saas cert device');
  console.log('OK testSaasCertificateEvidenceRows');
}

function testParseUserAgent() {
  const parsed = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  assert(parsed.browser === 'Google Chrome', 'ua browser');
  assert(parsed.os === 'Windows', 'ua os');
  console.log('OK testParseUserAgent');
}

function main() {
  testSaleEvidencePatch();
  testSaasEvidencePatch();
  testCertificateShowsEvidence();
  testLegacyCertificateFallback();
  testPublicMasking();
  testVerifyUrlAndQrTarget();
  testHashUnchanged();
  testSaasCertificateEvidenceRows();
  testParseUserAgent();
  console.log('OK — mandatory-signature-verify-evidence-tests passed');
}

main();
