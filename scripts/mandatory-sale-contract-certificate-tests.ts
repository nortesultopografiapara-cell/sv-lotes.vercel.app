/**
 * Testes — certificado digital oficial SV LOTES (layout unificado).
 * npx tsx scripts/mandatory-sale-contract-certificate-tests.ts
 * PDF real: RUN_SALE_PDF_BROWSER_TESTS=1 npx tsx scripts/mandatory-sale-contract-certificate-tests.ts
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
import { isPdfBytes } from '../lib/saasContractPdfHttp';

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

function testOfficialCertificateStructure() {
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
  assert(cert.includes('sv-cert-official'), 'layout oficial unificado');
  assert(cert.includes('sv-cert-card'), 'cartões verdes');
  assert(cert.includes('#f0fff4') || cert.includes('f0fff4'), 'fundo verde nos estilos');
  assert(cert.includes('PROMITENTE VENDEDOR'), 'card vendedor');
  assert(cert.includes('PROMISSÁRIO COMPRADOR'), 'card comprador');
  assert(cert.includes('✓ ASSINADO ELETRONICAMENTE'), 'selo assinatura');
  assert(
    cert.includes('DOCUMENTO ASSINADO ELETRONICAMENTE COM VALIDADE JURÍDICA'),
    'rodapé jurídico do cartão',
  );
  assertNotIncludes(cert, 'sv-cert-compact', 'sem layout compacto antigo');
  assertNotIncludes(cert, 'e-sign-card', 'sem cartões duplicados');
  assertNotIncludes(cert, 'IP:</strong> —', 'IP vazio oculto');
  assertNotIncludes(cert, 'sv-cert-frame', 'sem layout antigo');
  assertNotIncludes(cert, 'sv-cert-header-logo', 'sem logo no certificado');
  assert(cert.includes('Hash do documento (SHA-256)'), 'hash label');
  assert(cert.includes('Token de assinatura'), 'token label');
  assert(cert.includes('abc123token456def789'), 'token completo');
  assert(cert.includes('a'.repeat(64)), 'hash completo');
  assert(cert.includes('VALIDADO'), 'status validado');
  assert(cert.includes('177.1.2.3'), 'IP comprador');
  assert(cert.includes('data:image/png;base64,TESTQR'), 'qr renderizado');
  assert(cert.includes('/sign/sale/'), 'url pública sign/sale');
  assertNotIncludes(cert, '/verify/', 'sem rota verify');
  assert(
    cert.includes('MP 2.200-2/2001 e Lei 14.063/2020'),
    'rodapé autenticidade legal',
  );
  assert(cert.includes('page-break-inside: avoid'), 'evita quebra de página');
  console.log('OK testOfficialCertificateStructure');
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
  const cert = await buildSaleContractSignatureCertificateHtmlWithQr({
    contractNumber: '000000099/2026',
    projectName: 'Amostra Certificado',
    quadra: '10',
    lote: '20',
    buyerName: 'IVANILDE DE MORA SILVA',
    buyerDocument: '75996821395',
    companyName: 'Sv Topografia E Projetos',
    companyCnpj: '12345678000199',
    representativeName: 'Silvio de Azevedo Rodrigues',
    representativeCpf: '05255513818',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    signedAt: '2025-05-30T13:24:58.000Z',
    vendorSignedAt: '2025-05-30T13:24:21.000Z',
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

  const fullHtml = `${firstPage.replace(/<div class="contract-signatures[\s\S]*?<\/div>\s*(?=<)/, '')}${cert}`;
  const p1 = path.join(outDir, 'certificado-oficial-preview.html');
  const p2 = path.join(outDir, 'certificado-oficial-contrato-completo.html');
  fs.writeFileSync(p1, wrap(cert, 'Certificado oficial SV LOTES'));
  fs.writeFileSync(p2, wrap(fullHtml, 'Contrato + certificado oficial'));

  if (process.env.RUN_SALE_PDF_BROWSER_TESTS === '1') {
    const {
      buildSaleContractPdfFromHtml,
      launchSaleContractPdfBrowser,
      wrapSaleContractHtmlDocument,
    } = await import('../lib/saleContractPdf');

    const pdf = await buildSaleContractPdfFromHtml(fullHtml, {
      tenantName: 'Sv Topografia E Projetos',
      tenantCnpj: '12.345.678/0001-99',
      addressLine: 'Av. Principal, 100',
      cityUfLine: 'Parauapebas - PA',
      contractNumber: '000000099/2026',
      logoBase64: null,
      printStyle: 'sv-lotes-2',
    });
    assert(isPdfBytes(pdf), 'pdf bytes válidos');
    const pdfPath = path.join(outDir, 'certificado-digital-pdf-real.pdf');
    fs.writeFileSync(pdfPath, pdf);

    const browser = await launchSaleContractPdfBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    await page.setContent(
      wrapSaleContractHtmlDocument(`<div class="sv-contract-document">${cert}</div>`, 'Certificado'),
      {
        waitUntil: 'load',
        timeout: 45_000,
      },
    );
    const certEl = await page.$('.sv-cert-official');
    if (certEl) {
      const pngPath = path.join(outDir, 'certificado-digital-pdf-real.png');
      await certEl.screenshot({ path: pngPath, type: 'png' });
      console.log('OK screenshot certificado', pngPath);
    }
    await browser.close();
    console.log('OK PDF real gerado', pdfPath);
  }

  console.log('OK writeSampleArtifacts', { p1, p2 });
}

async function main() {
  testPublicUrlHelpers();
  testOfficialCertificateStructure();
  await testCertificateWithQrGeneration();
  await writeSampleArtifacts();
  console.log('OK — mandatory-sale-contract-certificate-tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
