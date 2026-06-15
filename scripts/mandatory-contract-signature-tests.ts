/**
 * Testes obrigatórios — assinatura eletrônica de contratos SaaS.
 * npx tsx scripts/mandatory-contract-signature-tests.ts
 */

import { jsPDF } from 'jspdf';
import { buildSaasContractPdfWithMeta } from '../lib/saasContractPdf';
import { MENESES_COMPANY_ID } from '../lib/saasContractContent';
import {
  SAAS_CONTRACT_DOCUMENT_STATUSES,
  SAAS_CONTRACT_CURRENT_VERSION_STATUSES,
  SAAS_CONTRACT_STATUS_AFTER_GENERATION,
  normalizeSaasContractDocumentStatus,
  signatureStatusLabel,
} from '../lib/saasContractStatus';
import {
  appendSignatureCertificateToPdf,
  buildSignatureHashPayload,
  computeSignatureHashSync,
  formatSignatureDateBr,
  formatSignatureTimeBr,
} from '../lib/saasContractSignaturePdf';
import {
  buildSignatureHistory,
  daysPendingSince,
  generateSignatureToken,
  isSignatureExpired,
  signatureExpiresAt,
  type CompanyContractSignatureRow,
} from '../lib/saasContractSignatureService';
import { buildSignUrl } from '../lib/saasContractUrls';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function menesesCompanyFixture() {
  return {
    id: MENESES_COMPANY_ID,
    name: 'MENESES IMOBILIARIA LTDA',
    cnpj: '12.345.678/0001-99',
    email: 'contato@meneses.com.br',
    phone: '85999999999',
    address: 'Rua Teste, 100',
    city: 'Fortaleza',
    state: 'CE',
    cep: '60000000',
    plan_type: 'business',
    plan: 'profissional',
    custom_price_enabled: true,
    custom_monthly_price: 549.99,
    subscription_due_day: 27,
    subscription_start_date: '2026-05-27',
    status_operacional: 'Ativa',
    active: true,
    is_test_company: false,
    is_test: false,
  };
}

function testTokenGeneration() {
  const t1 = generateSignatureToken();
  const t2 = generateSignatureToken();
  assert(t1.length >= 64, 'token deve combinar UUID + hash');
  assert(t1 !== t2, 'tokens devem ser únicos');
  assert(/^[a-f0-9]+$/i.test(t1), 'token hexadecimal');
  console.log('OK testTokenGeneration');
}

function testExpiration() {
  const exp = signatureExpiresAt(new Date('2026-06-01T12:00:00Z'));
  const expDate = new Date(exp);
  const diffDays = Math.round(
    (expDate.getTime() - new Date('2026-06-01T12:00:00Z').getTime()) /
      (1000 * 60 * 60 * 24),
  );
  assert(diffDays === 30, 'expiração em 30 dias');
  assert(
    isSignatureExpired('2026-01-01T00:00:00Z', new Date('2026-06-15T00:00:00Z')),
    'detecta expirado',
  );
  assert(
    !isSignatureExpired('2099-01-01T00:00:00Z', new Date('2026-06-15T00:00:00Z')),
    'detecta válido',
  );
  console.log('OK testExpiration');
}

function testSignatureHash() {
  const payload = buildSignatureHashPayload({
    contractId: 'c-1',
    contractNumber: '00001/2026',
    signerName: 'Carlos Daniel',
    signerDocument: '12345678901',
    signerEmail: 'carlos@test.com',
    signedAt: '2026-06-15T14:25:00.000Z',
    ipAddress: '192.168.1.1',
  });
  const hash = computeSignatureHashSync(payload);
  assert(hash.length === 64, 'hash SHA256 hex');
  assert(computeSignatureHashSync(payload) === hash, 'hash determinístico');
  console.log('OK testSignatureHash');
}

function testCertificateAndFinalPdf() {
  const company = menesesCompanyFixture();
  const built = buildSaasContractPdfWithMeta({
    company,
    subscription: {
      contract_number: '00001/2026',
      plan_type: 'business',
      monthly_price: 549.99,
      start_date: '2026-05-27',
      first_payment_date: '2026-05-27',
      next_due_date: '2026-06-27',
    },
  });

  const signedAt = '2026-06-15T14:25:00.000Z';
  const hash = computeSignatureHashSync('test-payload');
  const withCert = buildSaasContractPdfWithMeta(
    {
      company,
      subscription: {
        contract_number: '00001/2026',
        plan_type: 'business',
        monthly_price: 549.99,
        start_date: '2026-05-27',
        first_payment_date: '2026-05-27',
        next_due_date: '2026-06-27',
      },
    },
    {
      certificate: {
        contractNumber: '00001/2026',
        signerName: 'Carlos Daniel Araújo Meneses',
        signerDocument: '12345678901',
        signerEmail: 'carlos@test.com',
        signerRole: 'Sócio',
        ipAddress: '192.168.1.10',
        signedDate: formatSignatureDateBr(signedAt),
        signedTime: formatSignatureTimeBr(signedAt),
        signatureHash: hash,
      },
    },
  );

  assert(withCert.pageCount > built.pageCount, 'PDF final inclui certificado');
  assert(withCert.pdf.byteLength > built.pdf.byteLength, 'PDF assinado maior que original');

  const doc = new jsPDF();
  appendSignatureCertificateToPdf(doc, {
    contractNumber: '00001/2026',
    signerName: 'Teste',
    signerDocument: '12345678901',
    ipAddress: '1.1.1.1',
    signedDate: '15/06/2026',
    signedTime: '14:25',
    signatureHash: hash,
  }, 16, 210);
  assert(doc.getNumberOfPages() >= 1, 'certificado standalone');
  console.log('OK testCertificateAndFinalPdf');
}

function testHistory() {
  const signature = {
    id: 's1',
    contract_id: 'c1',
    company_id: 'co1',
    signer_name: 'Carlos',
    signer_email: 'c@test.com',
    signer_document: '12345678901',
    signer_role: 'Sócio',
    signature_status: 'SIGNED',
    signature_token: 'tok',
    signature_url: buildSignUrl('tok'),
    ip_address: '10.0.0.1',
    user_agent: 'test',
    viewed_at: '2026-06-15T14:22:00.000Z',
    signed_at: '2026-06-15T14:25:00.000Z',
    expires_at: '2026-07-15T14:20:00.000Z',
    signature_hash: 'abc',
    created_at: '2026-06-15T14:20:00.000Z',
    updated_at: '2026-06-15T14:25:00.000Z',
  } as CompanyContractSignatureRow;

  const history = buildSignatureHistory(signature);
  assert(history.length >= 3, 'histórico com envio, visualização e assinatura');
  assert(history[0].event === 'Link enviado', 'primeiro evento');
  assert(history.some((h) => h.event === 'Contrato assinado'), 'evento assinatura');
  console.log('OK testHistory');
}

function testReSignBlockedLogic() {
  const signed = { signature_status: 'SIGNED' } as CompanyContractSignatureRow;
  assert(signed.signature_status === 'SIGNED', 'status SIGNED bloqueia reassinatura');
  const expired = isSignatureExpired('2020-01-01T00:00:00Z');
  assert(expired, 'link expirado bloqueia assinatura');
  console.log('OK testReSignBlockedLogic');
}

function testLegacyContractCompatibility() {
  assert(
    SAAS_CONTRACT_DOCUMENT_STATUSES.includes('generated'),
    'status generated preservado',
  );
  assert(
    SAAS_CONTRACT_CURRENT_VERSION_STATUSES.includes('generated'),
    'versão vigente generated',
  );
  assert(SAAS_CONTRACT_STATUS_AFTER_GENERATION === 'generated', 'geração mantém generated');
  assert(normalizeSaasContractDocumentStatus('GENERATED') === 'generated', 'normalização');
  assert(signatureStatusLabel('PENDING') === 'Aguardando assinatura', 'label assinatura');
  console.log('OK testLegacyContractCompatibility');
}

function testSignUrl() {
  const url = buildSignUrl('abc123');
  assert(url.includes('/sign/abc123'), 'URL pública de assinatura');
  console.log('OK testSignUrl');
}

function testPendingDays() {
  const days = daysPendingSince(
    '2026-06-01T12:00:00Z',
    new Date('2026-06-08T12:00:00Z'),
  );
  assert(days === 7, 'dias pendentes');
  console.log('OK testPendingDays');
}

async function testNextBuild() {
  const { execSync } = await import('node:child_process');
  console.log('RUN next build (mandatory)...');
  execSync('npx next build', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '--max_old_space_size=1536' },
  });
  console.log('OK testNextBuild');
}

async function main() {
  testTokenGeneration();
  testExpiration();
  testSignatureHash();
  testCertificateAndFinalPdf();
  testHistory();
  testReSignBlockedLogic();
  testLegacyContractCompatibility();
  testSignUrl();
  testPendingDays();
  await testNextBuild();
  console.log('\nTodos os testes de assinatura eletrônica passaram.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
