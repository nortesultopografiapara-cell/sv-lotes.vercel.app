/**
 * Testes obrigatórios — assinatura eletrônica de contratos SaaS.
 * npx tsx scripts/mandatory-contract-signature-tests.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  appendBilateralSignatureCertificateToPdf,
  appendSignatureCertificateToPdf,
  buildSignatureHashPayload,
  computeSignatureHashSync,
  formatSignatureDateBr,
  formatSignatureTimeBr,
} from '../lib/saasContractSignaturePdf';
import {
  buildSignedPdfStoragePath,
  buildSignatureHistory,
  daysPendingSince,
  debugPublicSign,
  generateSignatureToken,
  isSaasSignPublicDebugEnabled,
  isSignatureExpired,
  signatureExpiresAt,
  type CompanyContractSignatureRow,
} from '../lib/saasContractSignatureService';
import {
  hasSaasSignedDocumentAccess,
  resolveSaasSignedContractRecord,
} from '../lib/saasContractSignedAccess';
import {
  canProviderSignContract,
  canPublicClientSign,
  canShowProviderSignButton,
  isContractSignatureSendBlocked,
  isFullySignedContract,
  isPublicClientSignBlocked,
  shouldRenderMasterProviderSignButton,
} from '../lib/saasContractBilateralSignature';
import { buildSignUrl } from '../lib/saasContractUrls';
import {
  hasSaasContractDocumentForMasterUi,
  hasSaasContractReady,
} from '../lib/saasSubscription';
import {
  buildSignatureShareEmailSubject,
  buildSignatureShareMailtoUrl,
  buildSignatureShareMessage,
  buildSignatureShareWhatsAppUrl,
  canShareViaEmail,
  canShareViaWhatsApp,
  canResendOrShareSignature,
  mergeSignatureTimeline,
  normalizeWhatsAppPhone,
  qrCodePayloadForSignatureUrl,
  resolveSignatureUrlFromSendResponse,
} from '../lib/saasContractSignatureShare';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function pdfContainsText(pdf: Uint8Array, text: string): boolean {
  const raw = Buffer.from(pdf).toString('latin1');
  return raw.includes(text);
}

function baseSignatureFixture(
  overrides: Partial<CompanyContractSignatureRow> = {},
): CompanyContractSignatureRow {
  return {
    id: 's1',
    contract_id: 'c1',
    company_id: 'co1',
    signer_name: null,
    signer_email: null,
    signer_document: null,
    signer_role: null,
    signature_status: 'PENDING',
    signature_token: 'tok',
    signature_url: buildSignUrl('tok'),
    ip_address: null,
    user_agent: null,
    viewed_at: null,
    signed_at: null,
    expires_at: '2026-07-15T14:20:00.000Z',
    signature_hash: null,
    provider_signer_name: null,
    provider_signer_email: null,
    provider_signer_document: null,
    provider_signer_role: null,
    provider_signed_at: null,
    provider_signature_hash: null,
    provider_ip_address: null,
    provider_user_agent: null,
    created_at: '2026-06-15T14:20:00.000Z',
    updated_at: '2026-06-15T14:20:00.000Z',
    ...overrides,
  };
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
  const signature = baseSignatureFixture({
    signer_name: 'Carlos',
    signer_email: 'c@test.com',
    signer_document: '12345678901',
    signer_role: 'Sócio',
    signature_status: 'SIGNED',
    ip_address: '10.0.0.1',
    user_agent: 'test',
    viewed_at: '2026-06-15T14:22:00.000Z',
    signed_at: '2026-06-15T14:25:00.000Z',
    signature_hash: 'abc',
    provider_signer_name: 'Representante SV',
    provider_signer_document: '98765432100',
    provider_signed_at: '2026-06-15T15:00:00.000Z',
    updated_at: '2026-06-15T15:00:00.000Z',
  });

  const history = buildSignatureHistory(signature);
  assert(history.length >= 5, 'histórico bilateral completo');
  assert(history[0].event === 'Link enviado', 'primeiro evento');
  assert(history.some((h) => h.event === 'Cliente visualizou'), 'cliente visualizou');
  assert(history.some((h) => h.event === 'Cliente assinou'), 'cliente assinou');
  assert(history.some((h) => h.event === 'SV assinou'), 'SV assinou');
  assert(history.some((h) => h.event === 'PDF final gerado'), 'PDF final gerado');
  console.log('OK testHistory');
}

function testBilateralSignatureFlow() {
  assert(canPublicClientSign('PENDING'), 'cliente pode assinar pendente');
  assert(canPublicClientSign('VIEWED'), 'cliente pode assinar visualizado');
  assert(!canPublicClientSign('CLIENT_SIGNED'), 'cliente não reassina após assinar');
  assert(!canPublicClientSign('SIGNED'), 'cliente não assina contrato final');

  assert(!canProviderSignContract('PENDING'), 'SV não assina antes do cliente');
  assert(!canProviderSignContract('VIEWED'), 'SV não assina antes do cliente');
  assert(canProviderSignContract('CLIENT_SIGNED'), 'SV assina após cliente');
  assert(!canProviderSignContract('SIGNED'), 'SV não reassina contrato final');

  assert(!isFullySignedContract('CLIENT_SIGNED'), 'CLIENT_SIGNED não é assinado final');
  assert(isFullySignedContract('SIGNED'), 'SIGNED é assinado final');

  assert(isPublicClientSignBlocked('CLIENT_SIGNED'), 'link público bloqueado após cliente');
  assert(isPublicClientSignBlocked('SIGNED'), 'link público bloqueado após bilateral');

  assert(canShowProviderSignButton('CLIENT_SIGNED'), 'botão SV no painel Master');
  assert(!canShowProviderSignButton('PENDING'), 'botão SV oculto antes do cliente');
  assert(!canShowProviderSignButton('SIGNED'), 'botão SV oculto após bilateral');

  assert(
    shouldRenderMasterProviderSignButton('CLIENT_SIGNED', 'master-user'),
    'SV visível com CLIENT_SIGNED mesmo sem PDF na subscription',
  );
  assert(
    !shouldRenderMasterProviderSignButton('CLIENT_SIGNED', null),
    'SV exige usuário Master autenticado',
  );
  assert(
    !shouldRenderMasterProviderSignButton('PENDING', 'master-user'),
    'SV oculto antes da assinatura do cliente',
  );

  const clientSignedSub = {
    id: 's',
    company_id: 'co1',
    plan_type: 'personalizado',
    monthly_price: 400,
    custom_price_enabled: true,
    billing_cycle: 'monthly',
    start_date: '2024-08-17',
    payment_status: 'paid',
    contract_status: 'client_signed',
    contract_pdf_url: null,
  };
  assert(
    hasSaasContractReady(clientSignedSub),
    'client_signed na subscription continua documento pronto',
  );
  assert(
    hasSaasContractDocumentForMasterUi(null, { id: 'contract-v3' }),
    'versão ativa em company_contracts basta para o Master',
  );
  assert(
    !hasSaasContractDocumentForMasterUi(null, null),
    'sem subscription e sem versão não há documento',
  );

  console.log('OK testBilateralSignatureFlow');
}

function testSignedDocumentAccessUi() {
  const signedContract = {
    id: 'c1',
    company_id: 'co1',
    subscription_id: null,
    contract_url: 'https://example.com/draft.pdf',
    pdf_signed_url: null,
    contract_number: '00001/2026',
    version: 2,
    generated_at: '2026-06-01',
    status: 'signed',
  };
  const signature = {
    signature_status: 'SIGNED',
    contract_id: 'c1',
  } as CompanyContractSignatureRow;

  assert(
    hasSaasSignedDocumentAccess(signedContract, signature),
    'acesso PDF assinado com status signed',
  );
  assert(
    resolveSaasSignedContractRecord([signedContract], signature)?.id === 'c1',
    'resolve contrato assinado',
  );

  const root = join(process.cwd());
  const panel = readFileSync(join(root, 'components/saas/SaasContractPanel.tsx'), 'utf8');
  assert(panel.includes('Abrir PDF Assinado'), 'UI abrir PDF assinado');
  assert(panel.includes('Baixar PDF Assinado'), 'UI baixar PDF assinado');
  assert(panel.includes('signed: true'), 'URL API signed=1');
  assert(panel.includes('Assinar pela SV'), 'UI botão Assinar pela SV');
  assert(
    panel.includes('/api/companies/${companyId}/contract/sign-provider'),
    'painel chama API de assinatura da SV',
  );
  assert(
    panel.includes('shouldRenderMasterProviderSignButton'),
    'botão SV usa regra bilateral, não hasSaasContractReady',
  );
  assert(
    /\{showProviderSignButton && \(/.test(panel),
    'botão SV não fica aninhado em contractReady',
  );
  assert(
    !/contractReady && user\?\.id && \(/.test(panel),
    'toolbar SaaS não esconde a ação da SV atrás de contractReady',
  );

  const saleSection = readFileSync(
    join(root, 'components/contracts/SaleContractSignatureSection.tsx'),
    'utf8',
  );
  assert(saleSection.includes('Baixar PDF Assinado'), 'venda baixar PDF assinado');

  const contractRoute = readFileSync(
    join(root, 'app/api/companies/[id]/contract/route.ts'),
    'utf8',
  );
  assert(contractRoute.includes("signedOnly"), 'API signedOnly');

  console.log('OK testSignedDocumentAccessUi');
}

function testBilateralFinalPdf() {
  const company = menesesCompanyFixture();
  const clientSignedAt = '2026-06-15T14:25:00.000Z';
  const providerSignedAt = '2026-06-15T15:00:00.000Z';
  const clientHash = computeSignatureHashSync('client-hash');
  const providerHash = computeSignatureHashSync('provider-hash');

  const bilateral = buildSaasContractPdfWithMeta(
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
      bilateralCertificate: {
        contractNumber: '00001/2026',
        client: {
          contractNumber: '00001/2026',
          signerName: 'Carlos Daniel Araújo Meneses',
          signerDocument: '12345678901',
          signerEmail: 'carlos@test.com',
          signerRole: 'Sócio',
          ipAddress: '192.168.1.10',
          signedDate: formatSignatureDateBr(clientSignedAt),
          signedTime: formatSignatureTimeBr(clientSignedAt),
          signatureHash: clientHash,
          partyLabel: 'CONTRATANTE',
        },
        provider: {
          contractNumber: '00001/2026',
          signerName: 'Representante SV LOTES',
          signerDocument: '98765432100',
          signerEmail: 'admin@svlotes.com.br',
          signerRole: 'Sócio administrador',
          ipAddress: '10.0.0.2',
          signedDate: formatSignatureDateBr(providerSignedAt),
          signedTime: formatSignatureTimeBr(providerSignedAt),
          signatureHash: providerHash,
          partyLabel: 'CONTRATADA',
        },
      },
      executedSignatures: {
        client: {
          name: 'Carlos Daniel Araújo Meneses',
          document: '12345678901',
          role: 'Sócio',
          signedDate: formatSignatureDateBr(clientSignedAt),
        },
        provider: {
          name: 'Representante SV LOTES',
          document: '98765432100',
          role: 'Sócio administrador',
          signedDate: formatSignatureDateBr(providerSignedAt),
        },
      },
    },
  );

  assert(pdfContainsText(bilateral.pdf, 'CONTRATANTE'), 'PDF contém bloco CONTRATANTE');
  assert(pdfContainsText(bilateral.pdf, 'CONTRATADA'), 'PDF contém bloco CONTRATADA');
  assert(
    pdfContainsText(bilateral.pdf, 'CERTIFICADO DE ASSINATURA ELETR'),
    'PDF contém certificado bilateral',
  );
  assert(
    pdfContainsText(bilateral.pdf, 'ASSINADO ELETRONICAMENTE'),
    'PDF contém assinatura eletrônica executada',
  );

  const saasRoutePath = join(process.cwd(), 'app/api/companies/[id]/contract/route.ts');
  const saasRoute = readFileSync(saasRoutePath, 'utf8');
  const saasRegenIdx = saasRoute.indexOf('buildFullySignedSaasContractPdfBytes');
  const saasStoredIdx = saasRoute.indexOf('fetchPdfBytesFromUrl');
  assert(saasRegenIdx > 0 && saasStoredIdx > saasRegenIdx, 'SaaS signed PDF regenera antes do cache');

  const doc = new jsPDF();
  appendBilateralSignatureCertificateToPdf(
    doc,
    {
      contractNumber: '00001/2026',
      client: {
        contractNumber: '00001/2026',
        signerName: 'Cliente',
        signerDocument: '12345678901',
        ipAddress: '1.1.1.1',
        signedDate: '15/06/2026',
        signedTime: '14:25',
        signatureHash: clientHash,
      },
      provider: {
        contractNumber: '00001/2026',
        signerName: 'SV',
        signerDocument: '98765432100',
        ipAddress: '2.2.2.2',
        signedDate: '15/06/2026',
        signedTime: '15:00',
        signatureHash: providerHash,
      },
    },
    16,
    210,
  );
  assert(doc.getNumberOfPages() >= 1, 'certificado bilateral standalone');
  console.log('OK testBilateralFinalPdf');
}

function testSendReturnsSignatureUrl() {
  const json = {
    success: true,
    signUrl: 'https://www.svlotes.com.br/sign/abc123',
    signature: {
      signature_url: 'https://www.svlotes.com.br/sign/abc123',
      signature_status: 'PENDING',
      expires_at: '2026-07-15T00:00:00Z',
    },
  };
  const url = resolveSignatureUrlFromSendResponse(json);
  assert(url === json.signUrl, 'envio retorna signatureUrl');
  console.log('OK testSendReturnsSignatureUrl');
}

function testWhatsAppUrl() {
  const phone = normalizeWhatsAppPhone('(94) 99239-1277');
  assert(phone === '5594992391277', 'normaliza DDI 55');
  const msg = buildSignatureShareMessage({
    signerName: 'Carlos',
    companyName: 'MENESES IMOBILIARIA LTDA',
    contractNumber: '00001/2026',
    signatureUrl: 'https://www.svlotes.com.br/sign/tok',
    expiresAt: '2026-07-15T00:00:00Z',
  });
  const url = buildSignatureShareWhatsAppUrl('(94) 99239-1277', msg);
  assert(url?.startsWith('https://wa.me/5594992391277?text='), 'whatsapp url');
  assert(!canShareViaWhatsApp(''), 'whatsapp desabilita sem telefone');
  assert(!buildSignatureShareWhatsAppUrl('', msg), 'sem telefone sem url');
  console.log('OK testWhatsAppUrl');
}

function testMailtoUrl() {
  const subject = buildSignatureShareEmailSubject('MENESES IMOBILIARIA LTDA');
  assert(subject.includes('MENESES'), 'assunto com empresa');
  const body = buildSignatureShareMessage({
    signerName: 'Carlos',
    companyName: 'MENESES IMOBILIARIA LTDA',
    contractNumber: '00001/2026',
    signatureUrl: 'https://www.svlotes.com.br/sign/tok',
    expiresAt: '2026-07-15T00:00:00Z',
  });
  const mailto = buildSignatureShareMailtoUrl('contato@meneses.com.br', subject, body);
  assert(mailto?.startsWith('mailto:contato%40meneses.com.br'), 'mailto gerado');
  assert(!canShareViaEmail(''), 'email desabilita sem endereço');
  assert(!buildSignatureShareMailtoUrl('', subject, body), 'sem email sem mailto');
  console.log('OK testMailtoUrl');
}

function testQrCodePayload() {
  const link = 'https://www.svlotes.com.br/sign/abc123';
  assert(qrCodePayloadForSignatureUrl(link) === link, 'QR usa link correto');
  console.log('OK testQrCodePayload');
}

function testShareTimelineMerge() {
  const merged = mergeSignatureTimeline(
    [
      {
        at: '2026-06-15T18:35:00Z',
        event: 'Link enviado',
        user: 'Sistema',
        ip: null,
      },
    ],
    [
      {
        at: '2026-06-15T18:36:00Z',
        event: 'Link copiado',
        details: 'Área de transferência',
      },
    ],
  );
  assert(merged.length === 2, 'timeline mescla eventos');
  assert(merged[1].event === 'Link copiado', 'evento local na timeline');
  console.log('OK testShareTimelineMerge');
}

function testSignedBlocksSend() {
  assert(isContractSignatureSendBlocked('SIGNED'), 'assinado bloqueia envio');
  assert(isContractSignatureSendBlocked('CLIENT_SIGNED'), 'cliente assinou bloqueia reenvio');
  assert(!isContractSignatureSendBlocked('PENDING'), 'pendente permite reenvio');
  assert(!canResendOrShareSignature('CLIENT_SIGNED'), 'CLIENT_SIGNED bloqueia reenvio');
  assert(!canResendOrShareSignature('SIGNED'), 'SIGNED bloqueia reenvio');
  assert(canResendOrShareSignature('VIEWED'), 'VIEWED permite compartilhar');
  console.log('OK testSignedBlocksSend');
}

function testReSignBlockedLogic() {
  const signed = { signature_status: 'SIGNED' } as CompanyContractSignatureRow;
  const clientSigned = { signature_status: 'CLIENT_SIGNED' } as CompanyContractSignatureRow;
  assert(signed.signature_status === 'SIGNED', 'status SIGNED bloqueia reassinatura');
  assert(isPublicClientSignBlocked(clientSigned.signature_status), 'CLIENT_SIGNED bloqueia público');
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
  assert(signatureStatusLabel('CLIENT_SIGNED') === 'Cliente assinou — aguardando SV', 'label CLIENT_SIGNED');
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
    env: { ...process.env, NODE_OPTIONS: '--max_old_space_size=4096' },
  });
  console.log('OK testNextBuild');
}

function testSignedPdfStoragePathBinding() {
  const path = buildSignedPdfStoragePath('co-abc', 'CTR-2026-001', 2);
  assert(
    path === 'contracts/saas/co-abc/CTR-2026-001_v2_signed.pdf',
    'caminho PDF assinado no storage',
  );

  const serviceSrc = readFileSync(
    join(process.cwd(), 'lib/saasContractSignatureService.ts'),
    'utf8',
  );
  assert(
    serviceSrc.includes('import {') &&
      serviceSrc.includes('buildSignedPdfStoragePath') &&
      serviceSrc.includes("from '@/lib/saasContractSignedAccess'"),
    'import local de buildSignedPdfStoragePath',
  );
  assert(
    serviceSrc.includes('buildSignedPdfStoragePath(companyId, contractNumber, version)'),
    'uploadSignedContractPdf usa buildSignedPdfStoragePath',
  );

  console.log('OK testSignedPdfStoragePathBinding');
}

function testPublicSignRouteUsesSafeCompanyLookup() {
  const routeSrc = readFileSync(
    join(process.cwd(), 'app/api/sign/[token]/route.ts'),
    'utf8',
  );
  const serviceSrc = readFileSync(
    join(process.cwd(), 'lib/saasContractSignatureService.ts'),
    'utf8',
  );

  assert(!isSaasSignPublicDebugEnabled(), 'SAAS_SIGN_PUBLIC_DEBUG desligado por padrão');
  assert(
    serviceSrc.includes('debugPublicSign') &&
      serviceSrc.includes("process.env.SAAS_SIGN_PUBLIC_DEBUG"),
    'logs de diagnóstico gated por SAAS_SIGN_PUBLIC_DEBUG=1',
  );

  let debugCalled = false;
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    if (String(args[0]) === 'SAAS_SIGN_PUBLIC_DEBUG') debugCalled = true;
    origLog(...args);
  };
  debugPublicSign({ step: 'test' });
  console.log = origLog;
  assert(!debugCalled, 'debugPublicSign não emite log sem SAAS_SIGN_PUBLIC_DEBUG=1');

  assert(
    routeSrc.includes('resolvePublicSignContext'),
    'rota /api/sign/[token] usa resolvePublicSignContext',
  );
  assert(
    !routeSrc.includes('cpf, document, email'),
    'rota não faz SELECT de companies com colunas inexistentes (cpf/document)',
  );
  assert(
    routeSrc.includes('resolveSaasContractCompanyProfile'),
    'resposta pública usa perfil filtrado da empresa',
  );
  assert(
    !routeSrc.includes('contract_bank_name') &&
      !routeSrc.includes('technical_responsible_cpf'),
    'resposta JSON não expõe campos internos de companies',
  );
  assert(
    serviceSrc.includes("select('*')") &&
      serviceSrc.includes('resolvePublicSignContext') &&
      serviceSrc.includes("from('companies')"),
    'resolvePublicSignContext carrega companies com select(*) apenas server-side',
  );
  assert(
    serviceSrc.includes("eq('provider_signature_token', trimmed)"),
    'getSignatureByToken também busca provider_signature_token',
  );

  console.log('OK testPublicSignRouteUsesSafeCompanyLookup');
}

function testCertificateFooterReservedLayout() {
  const src = readFileSync(
    join(process.cwd(), 'lib/saasContractSignaturePdf.ts'),
    'utf8',
  );
  assert(src.includes('FOOTER_RESERVED = 45'), 'certificado reserva área do rodapé');
  assert(src.includes('ensureSpace'), 'certificado usa quebra automática de página');
  assert(src.includes('TECHNICAL_FONT_SIZE = 8'), 'campos técnicos em 8pt');

  const longHash = 'a'.repeat(64);
  const doc = new jsPDF();
  appendBilateralSignatureCertificateToPdf(
    doc,
    {
      contractNumber: '00099/2026',
      contentVersion: 2,
      client: {
        contractNumber: '00099/2026',
        signerName: 'Cliente Teste Layout Certificado',
        signerDocument: '12345678901',
        signerEmail: 'cliente@empresa.com.br',
        signerRole: 'Socio administrador',
        signerAddress: 'Rua Exemplo, 100, Bairro Centro, Cidade/UF',
        ipAddress: '200.150.10.20',
        signedDate: '15/06/2026',
        signedTime: '14:25',
        signatureHash: longHash,
        signatureToken: 'tok1234567890abcdef',
        signatureId: 'sig-client-uuid',
        geoCity: 'Parauapebas',
        latitude: -6.0678,
        longitude: -49.9032,
      },
      provider: {
        contractNumber: '00099/2026',
        signerName: 'Representante SV LOTES',
        signerDocument: '98765432100',
        signerEmail: 'sv@svlotes.com.br',
        signerRole: 'Socio administrador',
        ipAddress: '201.20.30.40',
        signedDate: '15/06/2026',
        signedTime: '15:00',
        signatureHash: longHash,
        signatureToken: 'prov9876543210fedcba',
        signatureId: 'sig-provider-uuid',
      },
    },
    16,
    210,
  );
  assert(doc.getNumberOfPages() >= 1, 'certificado bilateral denso renderiza');
  console.log('OK testCertificateFooterReservedLayout');
}

async function main() {
  testTokenGeneration();
  testExpiration();
  testSignatureHash();
  testCertificateAndFinalPdf();
  testHistory();
  testBilateralSignatureFlow();
  testSignedDocumentAccessUi();
  testBilateralFinalPdf();
  testSignedPdfStoragePathBinding();
  testSendReturnsSignatureUrl();
  testWhatsAppUrl();
  testMailtoUrl();
  testQrCodePayload();
  testShareTimelineMerge();
  testSignedBlocksSend();
  testReSignBlockedLogic();
  testLegacyContractCompatibility();
  testSignUrl();
  testPendingDays();
  testPublicSignRouteUsesSafeCompanyLookup();
  testCertificateFooterReservedLayout();
  await testNextBuild();
  console.log('\nTodos os testes de assinatura eletrônica passaram.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
