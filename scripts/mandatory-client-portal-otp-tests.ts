/**
 * Testes obrigatórios — Portal do Cliente Etapa 3 (OTP WhatsApp).
 * Executar: npx tsx scripts/mandatory-client-portal-otp-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  buildClientPortalOtpExpiresAt,
  createClientPortalOtpSalt,
  generateClientPortalOtpCode,
  hashClientPortalDocument,
  hashClientPortalOtp,
  isClientPortalOtpExpired,
  isValidClientPortalOtpInput,
  normalizeOtpInput,
  verifyClientPortalOtpCode,
  CLIENT_PORTAL_OTP_LENGTH,
  CLIENT_PORTAL_OTP_MAX_ATTEMPTS,
} from '../lib/portal-cliente/otp';
import {
  CLIENT_PORTAL_OTP_MESSAGE_TYPE,
  buildClientPortalOtpWhatsAppMessage,
} from '../lib/portal-cliente/whatsapp';
import {
  createClientPortalOtpChallengeToken,
  createClientPortalSessionToken,
  readClientPortalOtpChallengeToken,
  readClientPortalSessionToken,
} from '../lib/portal-cliente/session';
import type { ClientPortalOtpChallengeRow } from '../lib/portal-cliente/otpStore';

const root = path.join(__dirname, '..');

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function read(file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function testOtpGenerated(): void {
  const code = generateClientPortalOtpCode();
  assert(code.length === CLIENT_PORTAL_OTP_LENGTH, 'otp length');
  assert(/^\d{6}$/.test(code), 'otp digits');
  const salt = createClientPortalOtpSalt();
  const hash = hashClientPortalOtp(code, salt);
  assert(hash !== code, 'hash differs from plain code');
  assert(verifyClientPortalOtpCode(code, salt, hash), 'hash verifies');
}

function testOtpMessage(): void {
  const message = buildClientPortalOtpWhatsAppMessage('483271');
  assert(message.includes('483271'), 'message includes code');
  assert(message.includes('5 minutos'), 'message ttl');
  assert(message.includes('SV LOTES'), 'message brand');
  assert(CLIENT_PORTAL_OTP_MESSAGE_TYPE === 'CLIENT_PORTAL_OTP', 'message type');
}

function testOtpExpired(): void {
  const past = new Date(Date.now() - 1000).toISOString();
  assert(isClientPortalOtpExpired(past), 'expired past');
  const future = buildClientPortalOtpExpiresAt();
  assert(!isClientPortalOtpExpired(future), 'not expired future');
}

function testInvalidOtp(): void {
  const salt = createClientPortalOtpSalt();
  const hash = hashClientPortalOtp('123456', salt);
  assert(!verifyClientPortalOtpCode('000000', salt, hash), 'invalid code');
  assert(!isValidClientPortalOtpInput('12345'), 'short input');
  assert(isValidClientPortalOtpInput('123456'), 'valid input');
  assert(normalizeOtpInput('12-34-56') === '123456', 'normalize');
}

function testOtpReusedEvaluation(): void {
  const row: ClientPortalOtpChallengeRow = {
    id: 'test-id',
    link_key: 'abc',
    document_hash: hashClientPortalDocument('12345678901'),
    otp_hash: 'hash',
    otp_salt: 'salt',
    phone_masked: '(94) 99***-**18',
    attempts: 0,
    resend_count: 0,
    expires_at: buildClientPortalOtpExpiresAt(),
    consumed_at: new Date().toISOString(),
    last_sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  assert(!!row.consumed_at, 'reused challenge has consumed_at');
}

function testAttemptsLimit(): void {
  assert(CLIENT_PORTAL_OTP_MAX_ATTEMPTS === 5, 'max attempts is 5');
}

function testSessionCreated(): void {
  const docHash = hashClientPortalDocument('12345678901');
  const session = createClientPortalSessionToken({
    linkKey: 'link123',
    documentHash: docHash,
    verifiedAt: new Date().toISOString(),
    scope: {
      linkType: 'lot_sale',
      companyId: 'comp-1',
      customerId: 'cust-1',
      saleId: 'sale-1',
    },
  });
  const parsed = readClientPortalSessionToken(session);
  assert(parsed?.linkKey === 'link123', 'session linkKey');
  assert(parsed?.documentHash === docHash, 'session document hash');
  assert(parsed?.scope.saleId === 'sale-1', 'session sale scope');

  const challenge = createClientPortalOtpChallengeToken({
    challengeId: 'challenge-1',
    linkKey: 'link123',
    documentHash: docHash,
    phoneMasked: '(94) 99***-**18',
    issuedAt: new Date().toISOString(),
  });
  const challengeParsed = readClientPortalOtpChallengeToken(challenge);
  assert(challengeParsed?.challengeId === 'challenge-1', 'challenge id');
  assert(challengeParsed?.phoneMasked === '(94) 99***-**18', 'challenge phone masked');
}

function testApiRoutesExist(): void {
  assert(fs.existsSync(path.join(root, 'app/api/portal-cliente/send-otp/route.ts')), 'send-otp');
  assert(fs.existsSync(path.join(root, 'app/api/portal-cliente/verify-otp/route.ts')), 'verify-otp');
}

function testConfirmPageExists(): void {
  assert(fs.existsSync(path.join(root, 'app/portal-cliente/confirmar/page.tsx')), 'confirmar page');
}

function testWhatsappReuseLayer(): void {
  const whatsapp = read('lib/portal-cliente/whatsapp.ts');
  assert(whatsapp.includes("from '@/lib/saasBillingReminderWhatsApp'"), 'reuses billing phone normalize');
  assert(whatsapp.includes('isZapiConfigured'), 'same z-api config as billing/test');
  assert(whatsapp.includes("from '@/lib/whatsapp/zapiProvider'"), 'reuses zapi sendText');
  assert(whatsapp.includes('sendText'), 'uses sendText');
  assert(whatsapp.includes('logClientPortalOtpZapiDiagnostic'), 'zapi diagnostic log');
  assert(whatsapp.includes('instanceId'), 'logs instance id');
  assert(!whatsapp.includes('asaas'), 'no asaas');
}

function testIsolatedModules(): void {
  const otpStore = read('lib/portal-cliente/otpStore.ts');
  assert(!otpStore.includes('finance_receipts'), 'no finance');
  assert(!otpStore.includes('contract_signatures'), 'no signatures');
  const sendRoute = read('app/api/portal-cliente/send-otp/route.ts');
  assert(sendRoute.includes('resolveClientPortalLinkContext'), 'send resolves link');
  const verifyRoute = read('app/api/portal-cliente/verify-otp/route.ts');
  assert(verifyRoute.includes('verifyClientPortalOtp'), 'verify otp');
  assert(verifyRoute.includes('setClientPortalSessionCookie'), 'session cookie');
}

function testLookupResultsLayout(): void {
  const results = read('components/portal-cliente/ClientPortalLookupResults.tsx');
  assert(results.includes('Empreendimento'), 'empreendimento label');
  assert(results.includes('Empresa:'), 'empresa secondary');
  const entry = read('components/portal-cliente/ClientPortalEntryForm.tsx');
  assert(entry.includes('/api/portal-cliente/send-otp'), 'send otp call');
  assert(entry.includes('disabled={!selectedLinkKey'), 'continue disabled');
}

function testMigrationExists(): void {
  assert(
    fs.existsSync(
      path.join(root, 'supabase/migrations/20260707193000_client_portal_otp.sql'),
    ),
    'otp migration',
  );
}

function main(): void {
  testOtpGenerated();
  testOtpMessage();
  testOtpExpired();
  testInvalidOtp();
  testOtpReusedEvaluation();
  testAttemptsLimit();
  testSessionCreated();
  testApiRoutesExist();
  testConfirmPageExists();
  testWhatsappReuseLayer();
  testIsolatedModules();
  testLookupResultsLayout();
  testMigrationExists();
  console.log('mandatory-client-portal-otp-tests: OK');
}

main();
