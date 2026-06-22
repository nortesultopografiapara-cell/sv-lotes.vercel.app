/**
 * Testes — certificado digital compacto SV LOTES.
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

function assertNotIncludes(html: string, needle: string, msg: string) {
  if (html.includes(needle)) {
    throw new Error(`${msg}: não deveria conter "${needle}"`);
  }
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

function testCompactCertificateStructure() {
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
    historyEvents: buildSaleSignatureHistory(sig),
    qrCodeDataUrl: 'data:image/png;base64,TESTQR',
  });

  assert(cert.includes(SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE), 'título');
  assert(cert.includes('Documento assinado eletronicamente'), 'subtítulo compacto');
  assert(cert.includes('sv-cert-compact'), 'layout compacto');
  assert(cert.includes('#f0fff4') || cert.includes('f0fff4'), 'fundo verde nos estilos');
  assertNotIncludes(cert, 'IP:</strong> —', 'IP vazio oculto');
  assertNotIncludes(cert, 'IP: —', 'IP vazio oculto');
  assertNotIncludes(cert, 'sv-cert-frame', 'sem layout antigo');
  assertNotIncludes(cert, 'sv-cert-header-logo', 'sem logo no certificado');
  assertNotIncludes(cert, '<img src="data:image/png;base64,iVBOR', 'sem logo tenant');
  assert(cert.includes('000000050/2026'), 'contrato nº');
  assert(cert.includes('Residencial Horizonte'), 'empreendimento');
  assert(cert.includes('Vendedor'), 'bloco vendedor');
  assert(cert.includes('Comprador'), 'bloco comprador');
  assert(cert.includes('Hash SHA-256'), 'hash label');
  assert(cert.includes('Token'), 'token label');
  assert(cert.includes('abc123token456def789'), 'token completo');
  assert(cert.includes('a'.repeat(64)), 'hash completo');
  assert(cert.includes('ASSINADO'), 'status assinado');
  assert(cert.includes('177.1.2.3'), 'IP comprador');
  assert(cert.includes('data:image/png;base64,TESTQR'), 'qr renderizado');
  assert(cert.includes('/sign/sale/'), 'url pública sign/sale');
  assertNotIncludes(cert, '/verify/', 'sem rota verify');
  assert(
    cert.includes('A autenticidade deste documento pode ser confirmada'),
    'rodapé autenticidade',
  );
  console.log('OK testCompactCertificateStructure');
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
    historyEvents: buildSaleSignatureHistory(sig),
  });
  assert(cert.includes('data:image/png;base64,'), 'qr gerado automaticamente');
  assert(cert.includes('/sign/sale/'), 'qr aponta sign/sale');
  console.log('OK testCertificateWithQrGeneration');
}

async function writeSampleArtifacts() {
  const sig = signatureFixture();
  const { buildSaleContractElectronicSignaturesPageHtml } = await import(
    '../lib/saleContractSignatureCertificateHtml'
  );
  const eSignPage = buildSaleContractElectronicSignaturesPageHtml({
    vendorName: 'Sv Topografia E Projetos',
    vendorRepresentative: 'severino jose de frança',
    vendorDocument: '65082028200',
    vendorDocumentLabel: 'CPF',
    buyerName: 'IVANILDE DE MORA SILVA',
    buyerDocument: '25365481252',
    signedAt: sig.signed_at,
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
  });
  const cert = await buildSaleContractSignatureCertificateHtmlWithQr({
    contractNumber: '000000099/2026',
    projectName: 'Amostra Certificado',
    quadra: '10',
    lote: '20',
    buyerName: sig.signer_name!,
    buyerDocument: sig.signer_document!,
    companyName: 'SV LOTES DEMO LTDA',
    companyCnpj: '12345678000199',
    representativeName: 'Representante Legal',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    signedAt: sig.signed_at,
    ipAddress: sig.ip_address,
    signatureToken: sig.signature_token,
    signatureHash: sig.signature_hash,
    signatureUrl: sig.signature_url,
    historyEvents: buildSaleSignatureHistory(sig),
  });

  const { generateContractHTML } = await import('../lib/contractTemplate');
  const firstPage = generateContractHTML({
    tenant: {
      name: 'LOTEAMENTO EXEMPLO LTDA',
      contract_model: 'SV_LOTES_2',
      cnpj: '12345678000199',
      legal_representative: 'Maria Empresária',
      representative_cpf: '12345678901',
      address: 'Av. Principal, 100',
      city: 'Parauapebas',
      state: 'PA',
    },
    customer: {
      name: 'João Comprador',
      document: '98765432100',
      cpf: '98765432100',
      rg: '1234567',
      profession: 'Engenheiro',
      civil_state: 'Casado(a)',
      phone: '(94) 98888-7777',
      email: 'joao@test.com',
      address: 'Rua B, 200',
      city: 'Parauapebas',
      state: 'PA',
    },
    project: { name: 'Residencial Horizonte', city: 'Parauapebas', uf: 'PA' },
    block: { quadra: '05', lot: '12', area: 300 },
    sale: {
      payment_type: 'Parcelado',
      installments_count: 12,
      total_value: 120000,
      down_payment: 10000,
    },
    contractDate: '2026-06-08',
    contractSnapshot: { contract_number: '000000099/2026' },
  });

  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const wrap = (body: string, title: string) =>
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body><div class="sv-contract-document">${body}</div></body></html>`;

  const p1 = path.join(outDir, 'refino-pagina-inicial-sv2.html');
  const p2 = path.join(outDir, 'refino-certificado-compacto.html');
  const p3 = path.join(outDir, 'refino-contrato-completo-preview.html');
  const p4 = path.join(outDir, 'refino-cartoes-assinatura-verdes.html');
  fs.writeFileSync(p1, wrap(firstPage, 'Página inicial SV 2.0'));
  fs.writeFileSync(p2, wrap(cert, 'Certificado compacto'));
  fs.writeFileSync(p3, wrap(`${firstPage}${cert}`, 'Contrato + certificado'));
  fs.writeFileSync(p4, wrap(`${eSignPage}${cert}`, 'Cartões + certificado'));
  console.log('OK writeSampleArtifacts', { p1, p2, p3, p4 });
}

async function main() {
  testPublicUrlHelpers();
  testCompactCertificateStructure();
  await testCertificateWithQrGeneration();
  await writeSampleArtifacts();
  console.log('OK — mandatory-sale-contract-certificate-tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
