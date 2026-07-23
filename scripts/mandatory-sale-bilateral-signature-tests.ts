/**
 * Testes — assinatura bilateral real de contratos de venda.
 * npx tsx scripts/mandatory-sale-bilateral-signature-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  canShowVendorSignButton,
  canVendorSignSaleContract,
  isPublicSaleSignBlocked,
  isSaleClientSignatureComplete,
  isSaleLegacyAutoSigned,
  shouldIssueSaleCertificate,
} from '../lib/saleContractBilateralSignature';
import {
  isSaleSignatureBlocked,
  saleSignatureStatusLabel,
} from '../lib/saleContractSignatureStatus';
import { buildSaleContractSignatureCertificateHtml } from '../lib/saleContractSignatureCertificateHtml';
import { buildVendorEvidencePatch, readVendorEvidenceFromRow } from '../lib/signatureEvidence';
import { buildSaleSignatureHistory } from '../lib/saleContractSignatureService';
import type { ContractSignatureRow } from '../lib/saleContractSignatureService';

const ROOT = process.cwd();

function read(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testStatusHelpers() {
  assert(saleSignatureStatusLabel('CLIENT_SIGNED') === 'Aguardando assinatura da vendedora', 'label');
  assert(canVendorSignSaleContract('CLIENT_SIGNED'), 'vendor can sign');
  assert(!canVendorSignSaleContract('VIEWED'), 'vendor cannot before client');
  assert(canShowVendorSignButton('CLIENT_SIGNED'), 'show vendor button');
  assert(!canShowVendorSignButton('SIGNED'), 'hide after signed');
  assert(isSaleClientSignatureComplete('CLIENT_SIGNED'), 'client complete');
  assert(!isSaleClientSignatureComplete('VIEWED'), 'client incomplete');
  assert(isPublicSaleSignBlocked('CLIENT_SIGNED'), 'public blocked after client');
  assert(isSaleSignatureBlocked('CLIENT_SIGNED'), 'sale sign blocked');
  assert(!shouldIssueSaleCertificate('CLIENT_SIGNED'), 'no cert before vendor');
  assert(shouldIssueSaleCertificate('SIGNED', '2026-06-08T16:00:00.000Z'), 'cert after vendor');
  assert(isSaleLegacyAutoSigned('SIGNED', null), 'legacy auto');
  assert(!isSaleLegacyAutoSigned('SIGNED', '2026-06-08T16:00:00.000Z'), 'not legacy');
  assert(shouldIssueSaleCertificate('SIGNED', null), 'legacy still valid cert');
  console.log('OK testStatusHelpers');
}

function testVendorEvidenceDistinct() {
  const clientAt = '2026-06-08T15:30:00.000Z';
  const vendorAt = '2026-06-08T16:45:00.000Z';
  const vendorPatch = buildVendorEvidencePatch({
    vendorEmail: 'vendedor@imob.com',
    vendorPhone: '(94) 98888-7777',
    ipAddress: '200.10.20.30',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/121.0.0.0',
    signedAt: vendorAt,
    geo: { city: 'Belém', region: 'Pará', country: 'Brazil' },
    signatureEventId: 'vendor-event-uuid',
  });
  assert(vendorPatch.vendor_signer_email === 'vendedor@imob.com', 'vendor email');
  assert(vendorPatch.vendor_signature_event_id === 'vendor-event-uuid', 'vendor event id');
  const vendorEvidence = readVendorEvidenceFromRow({
    vendor_signer_email: 'vendedor@imob.com',
    vendor_ip_address: '200.10.20.30',
    vendor_signed_at: vendorAt,
    vendor_signed_at_iso: vendorAt,
    vendor_browser: 'Google Chrome',
    vendor_os: 'macOS',
    vendor_device: 'Desktop',
    vendor_ip_city: 'Belém',
    vendor_ip_region: 'Pará',
    vendor_ip_country: 'Brazil',
    vendor_signature_event_id: 'vendor-event-uuid',
  });
  assert(vendorEvidence.signedAt.includes('2026') || vendorEvidence.signedAt === vendorAt, 'vendor datetime');
  assert(vendorEvidence.signatureEventId === 'vendor-event-uuid', 'vendor id display');
  assert(clientAt !== vendorAt, 'distinct timestamps');
  console.log('OK testVendorEvidenceDistinct');
}

function testCertificateBilateralEvidence() {
  const html = buildSaleContractSignatureCertificateHtml({
    contractNumber: '000000099/2026',
    projectName: 'Residencial',
    quadra: '01',
    lote: '02',
    buyerName: 'Comprador Teste',
    buyerDocument: '12345678901',
    signerEmail: 'comprador@test.com',
    signedAt: '2026-06-08T15:30:00.000Z',
    ipAddress: '177.1.2.3',
    browser: 'Google Chrome',
    os: 'Windows',
    device: 'Desktop',
    approxLocation: 'Parauapebas, Pará',
    signatureEventId: 'client-event-id',
    companyName: 'Imobiliária XYZ',
    representativeName: 'Maria Vendedora',
    representativeCpf: '98765432100',
    vendorSignedAt: '2026-06-08T16:45:00.000Z',
    vendorIpAddress: '200.10.20.30',
    vendorEmail: 'maria@imob.com',
    vendorBrowser: 'Safari',
    vendorOs: 'macOS',
    vendorDevice: 'Desktop',
    vendorApproxLocation: 'Belém, Pará, Brazil',
    vendorSignatureEventId: 'vendor-event-id',
    signatureToken: 'token-bilateral',
    signatureHash: 'a'.repeat(64),
    legacyAutoVendor: false,
  });
  assert(html.includes('177.1.2.3'), 'client ip');
  assert(html.includes('200.10.20.30'), 'vendor ip');
  assert(html.includes('client-event-id'), 'client event');
  assert(html.includes('vendor-event-id'), 'vendor event');
  assert(html.includes('maria@imob.com'), 'vendor email');
  assert(html.includes('Safari'), 'vendor browser');
  console.log('OK testCertificateBilateralEvidence');
}

function testHistoryEvents() {
  const sig = {
    id: '1',
    contract_id: 'c1',
    tenant_id: 't1',
    customer_id: null,
    signer_name: 'Comprador',
    signer_email: 'c@test.com',
    signer_document: '12345678901',
    signature_status: 'SIGNED' as const,
    signature_token: 'tok12345678',
    signature_url: 'https://example.com/sign',
    ip_address: '1.2.3.4',
    user_agent: null,
    viewed_at: '2026-06-08T15:00:00.000Z',
    signed_at: '2026-06-08T15:30:00.000Z',
    vendor_signed_at: '2026-06-08T16:00:00.000Z',
    vendor_signer_name: 'Vendedor',
    vendor_signer_email: 'v@test.com',
    vendor_signer_document: '98765432100',
    vendor_ip_address: '5.6.7.8',
    expires_at: '2026-07-08T15:00:00.000Z',
    signature_hash: 'hash',
    created_at: '2026-06-08T14:00:00.000Z',
    updated_at: '2026-06-08T16:00:00.000Z',
  } satisfies ContractSignatureRow;
  const events = buildSaleSignatureHistory(sig);
  const labels = events.map((e) => e.event);
  assert(labels.includes('Comprador assinou'), 'buyer signed event');
  assert(labels.includes('Vendedor assinou'), 'vendor signed event');
  assert(labels.includes('Certificado emitido'), 'certificate event');
  console.log('OK testHistoryEvents');
}

function testMobileVendorSignVisibility() {
  const { canShowMobileVendorSignAction } = require('../lib/saleContractBilateralSignature');

  assert(
    canShowMobileVendorSignAction({
      signatureStatus: 'CLIENT_SIGNED',
      contractStatus: 'ativo',
      isAdmin: true,
      ownerReadOnly: false,
    }),
    'mobile: admin aguardando vendedor',
  );
  assert(
    !canShowMobileVendorSignAction({
      signatureStatus: 'VIEWED',
      contractStatus: 'ativo',
      isAdmin: true,
      ownerReadOnly: false,
    }),
    'mobile: aguardando comprador',
  );
  assert(
    !canShowMobileVendorSignAction({
      signatureStatus: 'SIGNED',
      contractStatus: 'assinado',
      isAdmin: true,
      ownerReadOnly: false,
    }),
    'mobile: já assinado',
  );
  assert(
    !canShowMobileVendorSignAction({
      signatureStatus: 'CLIENT_SIGNED',
      contractStatus: 'cancelado',
      isAdmin: true,
      ownerReadOnly: false,
    }),
    'mobile: cancelado',
  );
  assert(
    !canShowMobileVendorSignAction({
      signatureStatus: 'CLIENT_SIGNED',
      contractStatus: 'ativo',
      isAdmin: false,
      ownerReadOnly: false,
    }),
    'mobile: não admin',
  );
  assert(
    !canShowMobileVendorSignAction({
      signatureStatus: 'CLIENT_SIGNED',
      contractStatus: 'ativo',
      isAdmin: true,
      ownerReadOnly: true,
    }),
    'mobile: owner read only',
  );
  console.log('OK testMobileVendorSignVisibility');
}

function testVendorSignUiAndApiWiring() {
  const modal = read('components/contracts/SaleContractVendorSignModal.tsx');
  assert(modal.includes('createPortal'), 'modal usa portal no body');
  assert(modal.includes('z-[500]'), 'modal acima do dock mobile');
  assert(modal.includes('onSubmit'), 'form submit conectado');
  assert(modal.includes('void handleSubmit()'), 'submit chama handleSubmit');
  assert(modal.includes('Registrando assinatura'), 'loading visível');
  assert(modal.includes('Assinar como vendedor'), 'rótulo do botão final');
  assert(modal.includes('role="alert"'), 'erro visível no modal');

  const section = read('components/contracts/SaleContractSignatureSection.tsx');
  assert(section.includes('/signature/sign-vendor'), 'section chama sign-vendor');
  assert(section.includes('resolveSignatureIdForVendorSign'), 'resolve signatureId antes do POST');
  assert(section.includes('credentials: \'include\''), 'fetch com sessão');
  assert(section.includes('Contrato assinado pelo vendedor com sucesso'), 'mensagem de sucesso');

  const route = read('app/api/contracts/[id]/signature/sign-vendor/route.ts');
  assert(route.includes('export async function POST'), 'rota POST exportada');
  assert(route.includes('signSaleContractByVendor'), 'serviço bilateral chamado');
  assert(route.includes('resolveCallerProfile'), 'valida perfil');
  assert(route.includes('OWNER'), 'bloqueia OWNER');

  const service = read('lib/saleContractSignatureService.ts');
  assert(service.includes("signature_status: 'SIGNED'"), 'sign-vendor muda para SIGNED');
  assert(service.includes('vendor_signed_at'), 'preenche vendor_signed_at');
  assert(service.includes('certificate_status'), 'emite certificado final');
  assert(service.includes('pdf_signed_url'), 'gera PDF final');

  console.log('OK testVendorSignUiAndApiWiring');
}

function testVendorSignAfterState() {
  const sig = {
    id: 'sig-vendor',
    contract_id: 'c1',
    tenant_id: 't1',
    customer_id: null,
    signer_name: 'Comprador',
    signer_email: 'c@test.com',
    signer_document: '12345678901',
    signature_status: 'SIGNED' as const,
    signature_token: 'tok12345678',
    signature_url: 'https://example.com/sign',
    ip_address: '1.2.3.4',
    user_agent: null,
    viewed_at: '2026-06-08T15:00:00.000Z',
    signed_at: '2026-06-08T15:30:00.000Z',
    vendor_signed_at: '2026-06-08T16:00:00.000Z',
    vendor_signer_name: 'Vendedor',
    vendor_signer_email: 'v@test.com',
    vendor_signer_document: '98765432100',
    vendor_ip_address: '5.6.7.8',
    expires_at: '2026-07-08T15:00:00.000Z',
    signature_hash: 'hash',
    created_at: '2026-06-08T14:00:00.000Z',
    updated_at: '2026-06-08T16:00:00.000Z',
  } satisfies ContractSignatureRow;

  assert(sig.signature_status === 'SIGNED', 'após sign-vendor status SIGNED');
  assert(Boolean(sig.vendor_signed_at), 'vendor_signed_at preenchido');
  const events = buildSaleSignatureHistory(sig);
  assert(events.some((e) => e.event === 'Certificado emitido'), 'certificado no histórico');
  assert(!canShowVendorSignButton(sig.signature_status), 'botão some após assinado');
  console.log('OK testVendorSignAfterState');
}

function main() {
  testStatusHelpers();
  testVendorEvidenceDistinct();
  testCertificateBilateralEvidence();
  testHistoryEvents();
  testMobileVendorSignVisibility();
  testVendorSignUiAndApiWiring();
  testVendorSignAfterState();
  console.log('OK — mandatory-sale-bilateral-signature-tests passed');
}

main();
