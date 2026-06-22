/**
 * Testes — certificado digital profissional SV LOTES.
 * npx tsx scripts/mandatory-sale-contract-certificate-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  buildSaleContractSignatureCertificateHtml,
  buildSaleContractSignatureCertificateHtmlWithQr,
} from '../lib/saleContractSignatureCertificateHtml';
import {
  resolveSaleContractCertificatePublicUrl,
  resolveSaleContractCertificateQrUrl,
  SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE,
} from '../lib/saleContractSignatureVerify';
import { buildSaleSignUrl } from '../lib/saleContractUrls';
import { buildSaleSignatureHistory } from '../lib/saleContractSignatureService';
import type { ContractSignatureRow } from '../lib/saleContractSignatureService';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function signatureFixture(): ContractSignatureRow {
  return {
    id: 'sig-uuid-001',
    contract_id: 'contract-1',
    tenant_id: 'tenant-1',
    customer_id: 'cust-1',
    signer_name: 'João Comprador',
    signer_email: 'joao@test.com',
    signer_document: '98765432100',
    signature_status: 'SIGNED',
    signature_token: 'abc123token456def789',
    signature_url: 'https://www.svlotes.com.br/sign/sale/abc123token456def789',
    ip_address: '177.1.2.3',
    user_agent: 'Mozilla/5.0',
    viewed_at: '2026-06-08T15:20:00.000Z',
    signed_at: '2026-06-08T15:30:00.000Z',
    expires_at: '2026-07-08T15:00:00.000Z',
    signature_hash: 'a'.repeat(64),
    created_at: '2026-06-08T14:00:00.000Z',
    updated_at: '2026-06-08T15:30:00.000Z',
  };
}

function testPublicUrlHelpers() {
  const token = 'abc123token456def789';
  const stored = 'https://www.svlotes.com.br/sign/sale/abc123token456def789';
  assert(
    resolveSaleContractCertificatePublicUrl(token, stored) === stored,
    'prioriza signature_url armazenada',
  );
  const built = resolveSaleContractCertificatePublicUrl(token);
  assert(built.includes('/sign/sale/'), 'url pública sign/sale');
  assert(built.includes(token), 'url contém token');
  assert(
    resolveSaleContractCertificateQrUrl(token, stored) === stored,
    'qr usa mesma url pública',
  );
  assert(buildSaleSignUrl(token).includes('/sign/sale/'), 'buildSaleSignUrl');
  console.log('OK testPublicUrlHelpers');
}

function testProfessionalCertificateStructure() {
  const sig = signatureFixture();
  const publicUrl = resolveSaleContractCertificatePublicUrl(
    sig.signature_token,
    sig.signature_url,
  );
  const cert = buildSaleContractSignatureCertificateHtml({
    contractNumber: '000000050/2026',
    projectName: 'Residencial Horizonte',
    quadra: '05',
    lote: '12',
    buyerName: sig.signer_name!,
    buyerDocument: sig.signer_document!,
    signerEmail: sig.signer_email,
    companyName: 'LOTEAMENTO EXEMPLO LTDA',
    companyCnpj: '12345678000199',
    representativeName: 'Maria Empresária',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    signedAt: sig.signed_at,
    ipAddress: sig.ip_address,
    signatureToken: sig.signature_token,
    signatureHash: sig.signature_hash,
    signatureUrl: sig.signature_url,
    publicUrl,
    issuedAt: sig.created_at,
    documentVersion: 2,
    uniqueId: sig.id,
    historyEvents: buildSaleSignatureHistory(sig),
    qrCodeDataUrl: 'data:image/png;base64,TESTQR',
  });

  assert(cert.includes(SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE), 'título');
  assert(cert.includes('registro de integridade'), 'subtítulo');
  assert(cert.includes('sv-cert-frame'), 'layout profissional');
  assert(cert.includes('000000050/2026'), 'contrato nº');
  assert(cert.includes('Residencial Horizonte'), 'empreendimento');
  assert(cert.includes('Vendedor'), 'bloco vendedor');
  assert(cert.includes('Comprador'), 'bloco comprador');
  assert(cert.includes('Segurança'), 'bloco segurança');
  assert(cert.includes('Validação'), 'bloco validação');
  assert(cert.includes('Histórico'), 'bloco histórico');
  assert(cert.includes('abc123token456def789'), 'token completo');
  assert(cert.includes('a'.repeat(64)), 'hash completo');
  assert(cert.includes('sig-uuid-001'), 'identificador único');
  assert(cert.includes('VALIDADO'), 'status validado');
  assert(cert.includes('177.1.2.3'), 'IP comprador');
  assert(cert.includes('Contrato criado'), 'evento criado');
  assert(cert.includes('Contrato enviado'), 'evento enviado');
  assert(cert.includes('Assinado pelo comprador'), 'evento assinatura');
  assert(cert.includes('data:image/png;base64,TESTQR'), 'qr renderizado');
  assert(cert.includes('/sign/sale/'), 'url pública sign/sale');
  assertNotIncludes(cert, '/verify/', 'sem rota verify');
  assert(
    cert.includes('assinado eletronicamente através da plataforma SV LOTES'),
    'declaração jurídica preservada',
  );
  console.log('OK testProfessionalCertificateStructure');
}

function assertNotIncludes(html: string, needle: string, msg: string) {
  if (html.includes(needle)) {
    throw new Error(`${msg}: não deveria conter "${needle}"`);
  }
}

async function testCertificateWithQrGeneration() {
  const sig = signatureFixture();
  const cert = await buildSaleContractSignatureCertificateHtmlWithQr({
    contractNumber: '000000051/2026',
    projectName: 'Teste QR',
    quadra: '01',
    lote: '01',
    buyerName: sig.signer_name!,
    buyerDocument: sig.signer_document!,
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    signedAt: sig.signed_at,
    signatureToken: sig.signature_token,
    signatureHash: sig.signature_hash,
    signatureUrl: sig.signature_url,
    issuedAt: sig.created_at,
    historyEvents: buildSaleSignatureHistory(sig),
  });
  assert(cert.includes('data:image/png;base64,'), 'qr gerado automaticamente');
  assert(cert.includes('/sign/sale/'), 'qr aponta sign/sale');
  console.log('OK testCertificateWithQrGeneration');
}

async function writeSampleArtifact() {
  const sig = signatureFixture();
  const html = await buildSaleContractSignatureCertificateHtmlWithQr({
    contractNumber: '000000099/2026',
    projectName: 'Amostra Certificado',
    quadra: '10',
    lote: '20',
    buyerName: sig.signer_name!,
    buyerDocument: sig.signer_document!,
    signerEmail: sig.signer_email,
    companyName: 'SV LOTES DEMO LTDA',
    companyCnpj: '12345678000199',
    representativeName: 'Representante Legal',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    signedAt: sig.signed_at,
    ipAddress: sig.ip_address,
    signatureToken: sig.signature_token,
    signatureHash: sig.signature_hash,
    signatureUrl: sig.signature_url,
    issuedAt: sig.created_at,
    documentVersion: 1,
    uniqueId: sig.id,
    historyEvents: buildSaleSignatureHistory(sig),
  });
  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'certificado-digital-sv-lotes-amostra.html');
  fs.writeFileSync(
    outPath,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Certificado SV LOTES</title></head><body><div class="sv-contract-document">${html}</div></body></html>`,
  );
  console.log('OK writeSampleArtifact', outPath);
}

async function main() {
  testPublicUrlHelpers();
  testProfessionalCertificateStructure();
  await testCertificateWithQrGeneration();
  await writeSampleArtifact();
  console.log('OK — mandatory-sale-contract-certificate-tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
