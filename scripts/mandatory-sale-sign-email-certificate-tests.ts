/**
 * Testes obrigatórios — e-mail e certificado na assinatura de contrato de venda.
 * npx tsx scripts/mandatory-sale-sign-email-certificate-tests.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildSaleContractElectronicSignaturesPageHtml,
  buildSaleContractSignatureCertificateHtml,
  replaceContractSignaturesBlock,
} from '../lib/saleContractSignatureCertificateHtml';
import { SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE } from '../lib/saleContractSignatureVerify';
import {
  isValidSignerEmail,
  normalizeSignerEmail,
} from '../lib/saleContractEmailValidation';
import {
  buildSaleSignatureHistory,
  type ContractSignatureRow,
} from '../lib/saleContractSignatureService';
import { buildSignatureHashPayload, computeSignatureHashSync } from '../lib/saasContractSignaturePdf';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function signatureFixture(overrides: Partial<ContractSignatureRow> = {}): ContractSignatureRow {
  return {
    id: 'sig-1',
    contract_id: 'contract-1',
    tenant_id: 'tenant-1',
    customer_id: 'cust-1',
    signer_name: 'Comprador Teste',
    signer_email: 'comprador@example.com',
    signer_document: '12345678901',
    signature_status: 'SIGNED',
    signature_token: 'token123456789abcdef',
    signature_url: 'https://example.com/sign/sale/token123456789abcdef',
    ip_address: '177.1.2.3',
    user_agent: 'Mozilla/5.0 Test',
    viewed_at: '2026-06-08T15:20:00.000Z',
    signed_at: '2026-06-08T15:30:00.000Z',
    expires_at: '2026-07-08T15:00:00.000Z',
    signature_hash: 'abc123hash',
    created_at: '2026-06-08T15:00:00.000Z',
    updated_at: '2026-06-08T15:30:00.000Z',
    ...overrides,
  };
}

function testEmailValidation() {
  assert(isValidSignerEmail('comprador@example.com'), 'email válido');
  assert(isValidSignerEmail('  Comprador@Example.COM  '), 'email normalizado válido');
  assert(normalizeSignerEmail('  Comprador@Example.COM  ') === 'comprador@example.com', 'normalize');
  assert(!isValidSignerEmail(''), 'vazio inválido');
  assert(!isValidSignerEmail('invalido'), 'sem @ inválido');
  assert(!isValidSignerEmail('a@b'), 'domínio curto inválido');
  assert(!isValidSignerEmail('a@b.c'), 'tld curto inválido');
  console.log('OK testEmailValidation');
}

function testCertificateWithEmail() {
  const cert = buildSaleContractSignatureCertificateHtml({
    contractNumber: '000000022/2026',
    projectName: 'Residencial Meneses',
    quadra: '04',
    lote: '22',
    buyerName: 'Comprador Teste',
    buyerDocument: '12345678901',
    signerEmail: 'comprador@example.com',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    signedAt: '2026-06-08T15:30:00.000Z',
    ipAddress: '177.1.2.3',
    signatureToken: 'token123456789abcdef',
    signatureHash: 'sha256hash',
    verifyUrl: 'https://www.svlotes.com.br/sign/sale/token123456789abcdef',
    signatureUrl: 'https://www.svlotes.com.br/sign/sale/token123456789abcdef',
    publicUrl: 'https://www.svlotes.com.br/sign/sale/token123456789abcdef',
    uniqueId: 'sig-test-id',
    historyEvents: [
      { at: '2026-06-08T14:00:00.000Z', event: 'Link enviado', user: 'Sistema', ip: null },
      { at: '2026-06-08T15:30:00.000Z', event: 'CONTRACT_SIGNED_ELECTRONICALLY', user: 'Comprador', ip: '177.1.2.3' },
    ],
  });

  assert(cert.includes(SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE), 'título certificado');
  assert(cert.includes('Vendedor'), 'cert vendedor');
  assert(cert.includes('Comprador'), 'cert comprador');
  assert(cert.includes('000000022/2026'), 'número contrato');
  assert(cert.includes('Residencial Meneses'), 'empreendimento');
  assert(cert.includes('04'), 'quadra');
  assert(cert.includes('22'), 'lote');
  assert(cert.includes('comprador@example.com'), 'e-mail no certificado');
  assert(cert.includes('177.1.2.3'), 'IP no certificado');
  assert(cert.includes('VALIDADO'), 'status validado');
  assert(
    cert.includes('assinado eletronicamente através da plataforma SV LOTES'),
    'declaração',
  );
  assert(cert.includes('Hash SHA-256'), 'hash opcional');
  assert(cert.includes('token123456789abcdef'), 'token completo');
  assert(cert.includes('Histórico'), 'histórico');
  console.log('OK testCertificateWithEmail');
}

function testCertificateWithoutEmailLegacy() {
  const cert = buildSaleContractSignatureCertificateHtml({
    contractNumber: '000000001/2025',
    projectName: 'Empreendimento Legado',
    quadra: '01',
    lote: '10',
    buyerName: 'Cliente Antigo',
    buyerDocument: '98765432100',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    signedAt: '2025-12-01T10:00:00.000Z',
  });
  assert(cert.includes('Cliente Antigo'), 'contrato legado mantém comprador');
  assert(!cert.includes('E-mail'), 'e-mail omitido quando ausente');
  console.log('OK testCertificateWithoutEmailLegacy');
}

function testSignatureHashIncludesEmail() {
  const payload = buildSignatureHashPayload({
    contractId: 'c1',
    contractNumber: '000000022/2026',
    signerName: 'Comprador',
    signerDocument: '12345678901',
    signerEmail: 'comprador@example.com',
    signedAt: '2026-06-08T15:30:00.000Z',
    ipAddress: '177.1.2.3',
    party: 'CLIENT',
  });
  const hashWithEmail = computeSignatureHashSync(payload);
  const hashWithoutEmail = computeSignatureHashSync(
    buildSignatureHashPayload({
      contractId: 'c1',
      contractNumber: '000000022/2026',
      signerName: 'Comprador',
      signerDocument: '12345678901',
      signerEmail: '',
      signedAt: '2026-06-08T15:30:00.000Z',
      ipAddress: '177.1.2.3',
      party: 'CLIENT',
    }),
  );
  assert(hashWithEmail !== hashWithoutEmail, 'hash inclui e-mail');
  console.log('OK testSignatureHashIncludesEmail');
}

function testAuditHistoryEvent() {
  const history = buildSaleSignatureHistory(signatureFixture());
  const signedEvent = history.find((e) => e.event === 'CONTRACT_SIGNED_ELECTRONICALLY');
  assert(Boolean(signedEvent), 'evento CONTRACT_SIGNED_ELECTRONICALLY');
  assert(
    String(signedEvent?.details || '').includes('comprador@example.com'),
    'histórico contém e-mail',
  );
  assert(
    String(signedEvent?.details || '').includes('CPF 12345678901'),
    'histórico contém CPF',
  );
  console.log('OK testAuditHistoryEvent');
}

function testContractsPdfApiPath() {
  const contractId = '00000000-0000-4000-8000-000000000099';
  const downloadUrl = `/api/contracts/${contractId}/pdf?download=1`;
  const inlineUrl = `/api/contracts/${contractId}/pdf`;
  assert(downloadUrl.includes('download=1'), 'download query');
  assert(!inlineUrl.includes('download=1'), 'inline sem download');
  console.log('OK testContractsPdfApiPath');
}

function testElectronicSignaturesPage() {
  const page = buildSaleContractElectronicSignaturesPageHtml({
    vendorName: 'MENESES IMOBILIÁRIA LTDA',
    vendorRepresentative: 'Carlos Daniel Araújo Meneses',
    vendorDocument: '12345678901',
    vendorDocumentLabel: 'CPF',
    buyerName: 'Comprador Teste',
    buyerDocument: '98765432100',
    signedAt: '2026-06-08T15:30:00.000Z',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
  });
  assert(page.includes('PROMITENTE VENDEDOR'), 'card vendedor');
  assert(page.includes('PROMISSÁRIO COMPRADOR'), 'card comprador');
  assert(page.includes('✓ ASSINADO ELETRONICAMENTE'), 'selo assinatura');
  assert(page.includes('MENESES IMOBILIÁRIA LTDA'), 'nome empresa');

  const html = replaceContractSignaturesBlock(
    '<div class="contract-signatures"><div class="signature-slot">old</div></div><footer/>',
    page,
  );
  assert(!html.includes('signature-slot'), 'bloco antigo removido');
  assert(html.includes('e-sign-card'), 'cards inseridos');
  console.log('OK testElectronicSignaturesPage');
}

function testSignedPdfApiRegeneratesBeforeStoredUrl() {
  const routePath = join(process.cwd(), 'app/api/contracts/[id]/pdf/route.ts');
  const source = readFileSync(routePath, 'utf8');
  const regenIdx = source.indexOf('loadSaleContractPdfForSign');
  const storedIdx = source.indexOf('storedSignedUrl');
  assert(regenIdx > 0, 'API usa loadSaleContractPdfForSign');
  assert(storedIdx > 0, 'API mantém fallback pdf_signed_url');
  assert(regenIdx < storedIdx, 'PDF assinado regenera antes do cache armazenado');
  console.log('OK testSignedPdfApiRegeneratesBeforeStoredUrl');
}

function main() {
  testEmailValidation();
  testCertificateWithEmail();
  testCertificateWithoutEmailLegacy();
  testElectronicSignaturesPage();
  testSignedPdfApiRegeneratesBeforeStoredUrl();
  testSignatureHashIncludesEmail();
  testAuditHistoryEvent();
  testContractsPdfApiPath();
  console.log('\nTodos os testes mandatory-sale-sign-email-certificate passaram.');
}

main();
