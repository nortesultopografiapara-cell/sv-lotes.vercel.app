/**
 * Bolepix v2 simulado. Nenhuma chamada real ao C6.
 * npx tsx scripts/mandatory-c6-bolepix-v2-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  executeC6BolepixV2Create,
  executeC6BolepixV2Get,
  executeC6BolepixV2Pdf,
  C6BolepixV2LiveDisabledError,
} from '../lib/banking/c6/c6BolepixV2Client';
import { C6BolepixV2ValidationError } from '../lib/banking/c6/c6BolepixV2Validation';
import { c6BolepixV2CanShare, decideC6BolepixV2Settlement } from '../lib/banking/c6/c6BolepixV2Status';
import { C6_BOLEPIX_V2_LIVE_CALLS_ENABLED } from '../lib/banking/c6/c6BolepixV2OpenApi';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const NOW = new Date('2026-11-23T12:00:00-03:00');
const REFERENCE = '01KP640RNSYXH9G41GR27RTAWP';
const payer = {
  name: 'Pagador Teste',
  taxId: '52998224725',
  address: 'Rua A, 10',
  neighborhood: 'Centro',
  city: 'Sao Paulo',
  state: 'SP',
  zipCode: '01310100',
};

const base = {
  environment: 'PRODUCTION' as const,
  externalReferenceId: REFERENCE,
  amount: 10,
  dueDate: '2026-11-23',
  description: 'Parcela de teste',
  payer,
};

function json(status: number, body: unknown) {
  return async () => ({ status, bodyText: JSON.stringify(body), contentType: 'application/json' });
}

async function main() {
  assert(C6_BOLEPIX_V2_LIVE_CALLS_ENABLED === true, 'a chamada real fica compilada e ainda exige a parcela nomeada');
  let liveBlocked = false;
  try {
    await executeC6BolepixV2Create({ input: base, now: NOW });
  } catch (error) {
    liveBlocked = error instanceof C6BolepixV2LiveDisabledError;
  }
  assert(liveBlocked, 'sem fetch simulado a emissão não sai do processo');
  let injectedCalls = 0;
  let injectedBlocked = false;
  try {
    await executeC6BolepixV2Create({
      input: base,
      now: NOW,
      fetchFn: async () => {
        injectedCalls += 1;
        return { status: 201, bodyText: '{}', contentType: 'application/json' };
      },
    });
  } catch (error) {
    injectedBlocked = error instanceof C6BolepixV2LiveDisabledError;
  }
  assert(injectedBlocked && injectedCalls === 0, 'fetch injetado sem simulação não chama o banco');

  const spec = fs.readFileSync(path.join(process.cwd(), 'docs/c6/bankslip-v2-api.yaml'), 'utf8');
  assert(spec.includes('title: Boleto com Liquidação via Barra ou Pix'), 'a spec oficial está no repositório');
  assert(spec.includes('version: 1.2.0'), 'a versão lida é 1.2.0');
  assert(spec.includes('Carteira para **produção** sendo a carteira do número: 15'), 'a carteira 15 está na spec');

  const created = await executeC6BolepixV2Create({
    input: { ...base, pixKey: '123e4567-e89b-12d3-a456-426614174000' },
    now: NOW,
    allowSimulatedHttp: true, fetchFn: json(201, {
      id: '01HVSBSTN8CCTCTEQT6MC7TD4B',
      external_reference_id: REFERENCE,
      amount: 10,
      due_date: '2026-11-23',
      status: 'CREATED',
      payment_method: {
        bank_slip: {
          billing_scheme: '15',
          billing_type: '3',
          digitable_line: '33690000000000000000000000000000000000000000000',
          bar_code: '33690000000000000000000000000000000000000000',
          our_number: '356077509',
        },
        pix: { qr_code: '00020126580014BR.GOV.BCB.PIX', image_content: 'aW1n' },
      },
    }),
  });
  const sent = created.body as {
    payment_method: { bank_slip: { billing_scheme: string }; pix?: { type: string; key: string } };
  };
  assert(created.disposition === 'succeeded' && created.fields?.ourNumber === '356077509', 'sucesso só com id oficial');
  assert(sent.payment_method.bank_slip.billing_scheme === '15', 'produção usa a carteira 15 da spec');
  assert(sent.payment_method.pix?.type === 'EVP', 'Pix só segue com chave EVP informada');
  assert(!JSON.stringify(sent).includes('wallet_code'), 'o payload não inventa carteira 10');

  const withoutPix = await executeC6BolepixV2Create({
    input: base,
    now: NOW,
    allowSimulatedHttp: true, fetchFn: json(201, { id: '01HVSBSTN8CCTCTEQT6MC7TD4C', status: 'CREATED', payment_method: { bank_slip: {} } }),
  });
  assert(!('pix' in (withoutPix.body.payment_method as object)), 'sem chave Pix o bloco não é enviado');
  assert(withoutPix.fields?.pixCopyPaste == null, 'Pix ausente não é fabricado');

  let invalidPix = false;
  try {
    await executeC6BolepixV2Create({
      input: { ...base, pixKey: 'email@exemplo.com' },
      now: NOW,
      allowSimulatedHttp: true, fetchFn: json(201, { id: 'x' }),
    });
  } catch (error) {
    invalidPix = error instanceof C6BolepixV2ValidationError;
  }
  assert(invalidPix, 'chave Pix que não é EVP é recusada antes da chamada');

  const built = (await import('../lib/banking/c6/c6BolepixV2Validation')).buildC6BolepixV2CreateBody(base, NOW) as {
    payment_method: { bank_slip: { billing_scheme: string } };
  };
  assert(built.payment_method.bank_slip.billing_scheme === '15', 'o construtor fixa 15 em produção');
  const sandbox = (await import('../lib/banking/c6/c6BolepixV2Validation')).buildC6BolepixV2CreateBody(
    { ...base, environment: 'SANDBOX' },
    NOW,
  ) as { payment_method: { bank_slip: { billing_scheme: string } } };
  assert(sandbox.payment_method.bank_slip.billing_scheme === '21', 'sandbox usa a carteira 21 da spec');

  let calls = 0;
  const ambiguous = await executeC6BolepixV2Create({
    input: base,
    now: NOW,
    allowSimulatedHttp: true, fetchFn: async () => {
      calls += 1;
      return { status: 201, bodyText: '{"amount":10}', contentType: 'application/json' };
    },
  });
  assert(ambiguous.disposition === 'uncertain' && calls === 1, 'HTTP 201 sem id fica incerto');
  assert(ambiguous.disposition !== 'rejected', 'resposta incerta não libera nova emissão automática');

  const rejected = await executeC6BolepixV2Create({
    input: base,
    now: NOW,
    allowSimulatedHttp: true, fetchFn: json(422, { error: 'invalid' }),
  });
  assert(rejected.disposition === 'rejected' && rejected.httpStatus === 422, '422 sem id é rejeição definitiva');

  const unavailable = await executeC6BolepixV2Create({
    input: base,
    now: NOW,
    allowSimulatedHttp: true, fetchFn: async () => {
      throw new Error('timeout');
    },
  });
  assert(unavailable.disposition === 'uncertain' && unavailable.httpStatus === null, 'timeout não confirma a cobrança');

  const server = await executeC6BolepixV2Create({
    input: base,
    now: NOW,
    allowSimulatedHttp: true, fetchFn: json(503, { error: 'down' }),
  });
  assert(server.disposition === 'uncertain', '5xx permanece incerto');

  const queried = await executeC6BolepixV2Get({
    environment: 'PRODUCTION',
    externalReferenceId: REFERENCE,
    allowSimulatedHttp: true, fetchFn: json(200, {
      id: '01HVSBSTN8CCTCTEQT6MC7TD4B',
      external_reference_id: REFERENCE,
      status: 'CREATED',
      payment_method: { bank_slip: { billing_type: '3', billing_scheme: '15' }, pix: null },
    }),
  });
  assert(queried.httpStatus === 200 && queried.fields?.billingType === '3', 'a consulta lê a modalidade oficial');

  const pdf = await executeC6BolepixV2Pdf({
    environment: 'PRODUCTION',
    externalReferenceId: REFERENCE,
    allowSimulatedHttp: true, fetchFn: async (url, init) => {
      assert(url.endsWith(`/${REFERENCE}/pdf`), 'o PDF usa a referência externa');
      assert(init.headers.Accept === 'application/pdf', 'o PDF pede application/pdf');
      return { status: 200, bodyText: '%PDF-1.4', contentType: 'application/pdf' };
    },
  });
  assert(pdf.ok && pdf.pdfBytes != null, 'PDF oficial só vale com %PDF');
  const missingPdf = await executeC6BolepixV2Pdf({
    environment: 'PRODUCTION',
    externalReferenceId: REFERENCE,
    allowSimulatedHttp: true, fetchFn: async () => ({ status: 404, bodyText: '{"error":"missing"}', contentType: 'application/json' }),
  });
  assert(!missingPdf.ok && missingPdf.httpStatus === 404, 'o status real do PDF é preservado');

  assert(!decideC6BolepixV2Settlement({ status: 'CREATED', billingType: '3' }).settleCash, 'CREATED não baixa');
  assert(
    !decideC6BolepixV2Settlement({ status: 'WAITING_CONFIRMATION' }).settleCash,
    'confirmação sem crédito não baixa',
  );
  const paid = decideC6BolepixV2Settlement({
    status: 'PAID',
    payments: [{ amount: '10.00', paymentType: 'PIX', paymentDate: '2026-11-23' }],
  });
  assert(paid.settleCash && paid.paymentType === 'PIX', 'Pix liquidado é evidência oficial');
  assert(!decideC6BolepixV2Settlement({ status: 'PAID', payments: [] }).settleCash, 'PAID sem pagamento não baixa');
  assert(
    c6BolepixV2CanShare({ status: 'CREATED', billingType: '3', digitableLine: '33690' }) &&
      !c6BolepixV2CanShare({ status: 'CREATED', billingType: null, digitableLine: '33690' }),
    'compartilhar exige a modalidade registrada devolvida pelo banco',
  );

  const v1 = fs.readFileSync(path.join(process.cwd(), 'lib/banking/c6/c6BoletoEndpoints.ts'), 'utf8');
  assert(v1.includes('/v1/bank_slips/'), 'a cobrança antiga continua na API v1');
  const emit = fs.readFileSync(path.join(process.cwd(), 'lib/banking/c6/c6InstallmentCharge.ts'), 'utf8');
  assert(emit.includes('recoverC6BolepixEmissionKey') || emit.includes('c6BolepixV2PayloadFromSealedKey'), 'a emissão decifra a EVP no servidor');
  assert(emit.includes('reserve_c6_bolepix'), 'a emissão nova reserva só o Bolepix');
  assert(!emit.includes('executeC6BankSlipCreate') && !emit.includes('reserve_c6_boleto'), 'a emissão nova não usa a v1');

  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261123120000_c6_bolepix_v2_reservation.sql'),
    'utf8',
  );
  assert(sql.includes("external_reference_id ~ '^[A-Z0-9]{26}$'"), 'a reserva v2 exige 26 caracteres');
  assert(sql.includes('c6_bolepix_reservations_receipt_unique'), 'a mesma parcela não pode ter duas reservas');
  assert(sql.includes('company_id'), 'a reserva isola a empresa');
  assert(!sql.includes('UPDATE public.finance_receipts'), 'a migration não altera recebível');
  assert(!sql.includes('UPDATE public.c6_boleto_reservations'), 'a migration não altera a reserva v1');
  assert(!sql.includes('UPDATE public.bank_charges'), 'a migration não altera cobrança já gravada');
  assert(sql.includes('c6_bolepix_reservations_company_fk'), 'a reserva referencia a empresa');
  assert(sql.includes('REVOKE ALL ON TABLE public.c6_bolepix_pix_keys FROM PUBLIC, anon, authenticated, service_role'), 'anon e authenticated não recebem a tabela');
  assert(!sql.includes('GRANT TRUNCATE') && !sql.includes('GRANT ALL'), 'a migration não concede TRUNCATE nem ALL');
  assert(sql.includes('trg_c6_boleto_reservations_block_bolepix'), 'um insert v1 é recusado quando a v2 já existe');
  assert(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS fica ligado nas três tabelas');

  const reservation = await import('../lib/banking/c6/c6BolepixV2Reservation');
  const fingerprint = reservation.c6BolepixRequestFingerprint({
    amount: '10.00',
    dueDate: '2026-11-23',
    taxId: '52998224725',
    reference: REFERENCE,
    receiptId: 'receipt-1',
  });
  const first = reservation.reserveC6Bolepix([], {
    companyId: 'company-a',
    integrationId: 'integration-a',
    integrationCompanyId: 'company-a',
    receiptCompanyId: 'company-a',
    financeReceiptId: 'receipt-1',
    externalReferenceId: REFERENCE,
    requestFingerprint: fingerprint,
  });
  const second = reservation.reserveC6Bolepix(first.rows, {
    companyId: 'company-a',
    integrationId: 'integration-a',
    integrationCompanyId: 'company-a',
    receiptCompanyId: 'company-a',
    financeReceiptId: 'receipt-1',
    externalReferenceId: REFERENCE,
    requestFingerprint: fingerprint,
  });
  assert(first.accepted && !second.accepted && second.rows.length === 1, 'a segunda reserva da mesma parcela é bloqueada');
  const blockedByV1 = reservation.reserveC6Bolepix([], {
    companyId: 'company-a',
    integrationId: 'integration-a',
    integrationCompanyId: 'company-a',
    receiptCompanyId: 'company-a',
    financeReceiptId: 'receipt-old',
    externalReferenceId: '01KP640RNSYXH9G41GR27RTAWQ',
    requestFingerprint: fingerprint,
    v1Status: 'SUCCEEDED',
    v1SlipId: '01M8OLD',
  });
  assert(!blockedByV1.accepted && blockedByV1.rows.length === 0, 'reserva v1 impede a v2 da mesma parcela');
  const blockedByCharge = reservation.reserveC6Bolepix([], {
    companyId: 'company-a',
    integrationId: 'integration-a',
    integrationCompanyId: 'company-a',
    receiptCompanyId: 'company-a',
    financeReceiptId: 'receipt-paid',
    externalReferenceId: '01KP640RNSYXH9G41GR27RTAWR',
    requestFingerprint: fingerprint,
    bankChargeExternalId: 'charge-1',
    bankChargeStatus: 'PAID',
  });
  assert(!blockedByCharge.accepted, 'parcela já cobrada no C6 não recebe outra versão');
  let otherCompany = false;
  try {
    reservation.reserveC6Bolepix([], {
      companyId: 'company-a',
      integrationId: 'integration-b',
      integrationCompanyId: 'company-b',
      receiptCompanyId: 'company-a',
      financeReceiptId: 'receipt-1',
      externalReferenceId: REFERENCE,
      requestFingerprint: fingerprint,
    });
  } catch (error) {
    otherCompany = error instanceof Error && error.message.includes('outra empresa');
  }
  assert(otherCompany, 'integração de outra empresa não reserva');
  const failed = reservation.completeC6Bolepix(first.rows, {
    companyId: 'company-a',
    integrationId: 'integration-a',
    externalReferenceId: REFERENCE,
    status: 'FAILED',
    httpStatus: 422,
    retryAllowed: true,
  });
  const retried = reservation.reserveC6Bolepix(failed.rows, {
    companyId: 'company-a',
    integrationId: 'integration-a',
    integrationCompanyId: 'company-a',
    receiptCompanyId: 'company-a',
    financeReceiptId: 'receipt-1',
    externalReferenceId: REFERENCE,
    requestFingerprint: fingerprint,
  });
  assert(retried.reason === 'retry' && retried.rows[0].attemptCount === 2, 'rejeição definitiva permite uma nova tentativa');
  const uncertainReserve = reservation.completeC6Bolepix(first.rows, {
    companyId: 'company-a',
    integrationId: 'integration-a',
    externalReferenceId: REFERENCE,
    status: 'UNKNOWN',
    httpStatus: null,
  });
  const blockedUncertain = reservation.reserveC6Bolepix(uncertainReserve.rows, {
    companyId: 'company-a',
    integrationId: 'integration-a',
    integrationCompanyId: 'company-a',
    receiptCompanyId: 'company-a',
    financeReceiptId: 'receipt-1',
    externalReferenceId: REFERENCE,
    requestFingerprint: fingerprint,
  });
  assert(blockedUncertain.reason === 'needs_reconciliation', 'resultado incerto continua bloqueado');

  const pix = await import('../lib/banking/c6/c6BolepixV2PixKey');
  let writeBlocked = false;
  try {
    pix.stageC6BolepixPixKey({
      companyId: 'company-a',
      integrationCompanyId: 'company-a',
      integrationId: 'integration-a',
      pixKey: '123e4567-e89b-12d3-a456-426614174000',
    });
  } catch (error) {
    writeBlocked = error instanceof pix.C6BolepixConfigWriteDisabledError;
  }
  assert(writeBlocked, 'a chave Pix não é gravada enquanto o cadastro está desligado');
  const staged = pix.stageC6BolepixPixKey(
    {
      companyId: 'company-a',
      integrationCompanyId: 'company-a',
      integrationId: 'integration-a',
      pixKey: '123e4567-e89b-12d3-a456-426614174000',
    },
    { allowSimulatedWrite: true, seal: () => 'v1:simulated' },
  );
  assert(staged.fingerprint.length === 12 && !staged.encryptedKey.includes('123e4567'), 'a chave não aparece no registro');
  assert(pix.inspectC6BolepixPixKey('email@exemplo.com'), 'e-mail não é chave EVP');
  let foreignKey = false;
  try {
    pix.presentC6BolepixPixKey(staged, 'company-b');
  } catch (error) {
    foreignKey = error instanceof Error && error.message.includes('outra empresa');
  }
  assert(foreignKey, 'a chave Pix não atravessa empresa');
  const sample = '123e4567-e89b-12d3-a456-426614174000';
  const ownerKey = pix.evaluateC6BolepixPixKeyRegistration({
    role: 'OWNER',
    encryptionConfigured: true,
    replace: true,
    existing: false,
  });
  const brokerKey = pix.evaluateC6BolepixPixKeyRegistration({
    role: 'BROKER',
    encryptionConfigured: true,
    replace: true,
    existing: false,
  });
  const missingSecret = pix.evaluateC6BolepixPixKeyRegistration({
    role: 'ADMIN',
    encryptionConfigured: false,
    replace: false,
    existing: false,
  });
  assert(!ownerKey.allowed && ownerKey.status === 403, 'OWNER não cadastra a EVP');
  assert(!brokerKey.allowed, 'usuário comum não cadastra a EVP');
  assert(!missingSecret.allowed && missingSecret.status === 503, 'sem a chave de criptografia a EVP não é gravada');
  assert(!missingSecret.reason.includes('=') && missingSecret.reason.includes('BANKING_CREDENTIALS_ENCRYPTION_KEY'), 'o nome da variável não revela o segredo');
  const previousSecret = process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
  process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = 'teste-fase-4a-chave-bancaria';
  try {
    const linked = {
      integration: { companyId: 'company-a', provider: 'C6' },
      account: { companyId: 'company-a', integrationId: 'integration-a', active: true },
      existing: null,
    };
    const saved = pix.prepareC6BolepixPixKeyWrite({
      role: 'ADMIN',
      companyId: 'company-a',
      integrationId: 'integration-a',
      financialAccountId: 'account-a',
      pixKey: sample,
      replace: false,
      encryptionConfigured: true,
      lookup: linked,
    });
    assert(saved.publicView.configured && saved.publicView.emissionEnabled === false, 'cadastrar a EVP não liga a emissão');
    assert(!saved.publicView.mask?.includes(sample) && !JSON.stringify(saved.publicView).includes(sample), 'a resposta não devolve a chave');
    assert(saved.record.encryptedKey.startsWith('v1:') && !saved.record.encryptedKey.includes(sample), 'a chave fica cifrada');
    assert(pix.openC6BolepixPixKey(saved.record.encryptedKey) === sample, 'a cifra autenticada abre a mesma EVP');
    const masked = pix.maskC6BolepixPixKey(saved.record);
    assert(masked.mask === `EVP ••••${saved.record.fingerprint.slice(-4)}` && !masked.mask.includes(sample), 'a tela só mostra a máscara');
    let otherAccount = false;
    try {
      pix.prepareC6BolepixPixKeyWrite({
        role: 'ADMIN',
        companyId: 'company-a',
        integrationId: 'integration-a',
        financialAccountId: 'account-b',
        pixKey: sample,
        replace: false,
        encryptionConfigured: true,
        lookup: {
          integration: linked.integration,
          account: { companyId: 'company-a', integrationId: 'integration-b', active: true },
          existing: null,
        },
      });
    } catch (error) {
      otherAccount = error instanceof Error && error.message.includes('CNPJ igual não basta');
    }
    assert(otherAccount, 'conta de outra integração C6 não recebe a EVP');
    let replacedBlocked = false;
    try {
      pix.prepareC6BolepixPixKeyWrite({
        role: 'COMPANY_ADMIN',
        companyId: 'company-a',
        integrationId: 'integration-a',
        financialAccountId: 'account-a',
        pixKey: '123e4567-e89b-12d3-a456-426614174001',
        replace: false,
        encryptionConfigured: true,
        lookup: { ...linked, existing: { encryptedKey: saved.record.encryptedKey, fingerprint: saved.record.fingerprint } },
      });
    } catch (error) {
      replacedBlocked = error instanceof pix.C6BolepixPixKeyAccessError && error.status === 409;
    }
    assert(replacedBlocked, 'substituir a EVP exige autorização explícita');
    const replaced = pix.prepareC6BolepixPixKeyWrite({
      role: 'ADMIN_EMPRESA',
      companyId: 'company-a',
      integrationId: 'integration-a',
      financialAccountId: 'account-a',
      pixKey: '123e4567-e89b-12d3-a456-426614174001',
      replace: true,
      encryptionConfigured: true,
      lookup: { ...linked, existing: { encryptedKey: saved.record.encryptedKey, fingerprint: saved.record.fingerprint } },
    });
    assert(
      replaced.publicView.replaced &&
        pix.openC6BolepixPixKey(replaced.record.encryptedKey) === '123e4567-e89b-12d3-a456-426614174001',
      'o administrador substitui a EVP',
    );
    const foreignSecret = (await import('../lib/banking/credentialsCrypto')).encryptBankingSecret('segredo-de-outra-funcao');
    let purposeBlocked = false;
    try {
      pix.openC6BolepixPixKey(foreignSecret);
    } catch (error) {
      purposeBlocked = error instanceof pix.C6BolepixPixKeyAccessError;
    }
    assert(purposeBlocked, 'um segredo bancário de outra função não vale como EVP');
  } finally {
    if (previousSecret == null) delete process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = previousSecret;
  }

  const official = await import('../lib/banking/c6/c6BolepixV2Official');
  const stored = official.officialC6BolepixFromResponse({
    companyId: 'company-a',
    integrationId: 'integration-a',
    financeReceiptId: 'receipt-2',
    body: {
      id: '01HVSBSTN8CCTCTEQT6MC7TD4B',
      external_reference_id: REFERENCE,
      amount: 10,
      due_date: '2026-11-23',
      status: 'CREATED',
      payment_method: { bank_slip: { billing_scheme: '15', billing_type: '3', our_number: '356077509' } },
    },
    pdfBytes: Buffer.from('%PDF-1.4'),
  });
  assert(stored.pixCopyPaste == null && stored.ourNumber === '356077509', 'persistência não fabrica Pix');
  assert(stored.pdfSha256 != null && stored.settlementMethod == null, 'PDF oficial não liquida a parcela');
  const legacy = {
    id: 'charge-v1',
    companyId: 'company-a',
    customerId: null,
    saleId: null,
    installmentId: 'receipt-old',
    asaasPaymentId: '01M8OLD',
    billingType: 'BOLETO' as const,
    status: 'REGISTERED' as const,
    value: 10,
    dueDate: '2026-11-22',
    invoiceUrl: null,
    bankSlipUrl: null,
    bankSlipIdentification: '33690',
    pixQrCode: null,
    pixCopyPaste: null,
    financialAccountId: null,
    paymentLink: null,
    paidAt: null,
    createdAt: '',
    updatedAt: '',
  };
  const merged = official.mergeC6BolepixOfficial([legacy], [stored], 'company-a');
  assert(merged[0].asaasPaymentId === '01M8OLD' && merged[0].pixCopyPaste == null, 'cobrança v1 permanece intacta');
  assert(merged[1]?.c6Bolepix?.api === 'v2' && merged[1].value === 10, 'cobrança v2 entra só com dados oficiais');

  const reconcile = await import('../lib/banking/c6/c6BolepixV2Reconcile');
  const createdDecision = reconcile.reconcileC6BolepixV2Query({ status: 'CREATED', billingType: '3' });
  const waiting = reconcile.reconcileC6BolepixV2Query({ status: 'WAITING_CONFIRMATION' });
  const settled = reconcile.reconcileC6BolepixV2Query({
    status: 'PAID',
    payments: [{ amount: '10.00', paymentType: 'BANK_SLIP', paymentDate: '2026-11-23' }],
  });
  assert(!createdDecision.settleCash && !createdDecision.writesFinance, 'CREATED não baixa');
  assert(!waiting.settleCash, 'WAITING_CONFIRMATION não baixa');
  assert(settled.settleCash && settled.writesFinance === false && settled.paymentType === 'BANK_SLIP', 'a evidência de boleto não grava caixa');
  assert(!reconcile.reconcileC6BolepixV2Webhook().settleCash, 'webhook sem contrato não baixa');
  assert(!reconcile.reconcileC6BolepixV2Query({ status: 'CANCELED' }).settleCash, 'cancelamento não baixa');
  const foreignSettlement = reconcile.reconcileC6BolepixV2Query({
    status: 'PAID',
    expectedCompanyId: 'company-a',
    companyId: 'company-b',
    payments: [{ amount: '10.00', paymentType: 'PIX', paymentDate: '2026-11-23', externalPaymentId: 'pay-1' }],
  });
  const duplicateSettlement = reconcile.reconcileC6BolepixV2Query({
    status: 'PAID',
    expectedCompanyId: 'company-a',
    companyId: 'company-a',
    payments: [{ amount: '10.00', paymentType: 'PIX', paymentDate: '2026-11-23', externalPaymentId: 'pay-1' }],
    settledPaymentIds: ['pay-1'],
  });
  assert(!foreignSettlement.settleCash && !duplicateSettlement.settleCash, 'empresa diferente e pagamento repetido não baixam');

  const actions = await import('../lib/charges/c6ChargeActions');
  const v2Actions = actions.resolveC6ChargeActions({
    externalId: '01HVSBSTN8CCTCTEQT6MC7TD4B',
    status: 'REGISTERED',
    digitableLine: '33690',
    installmentPaid: false,
    ownerReadOnly: false,
    uncertain: false,
    bolepix: {
      api: 'v2',
      bankStatus: 'CREATED',
      billingType: null,
      pixCopyPaste: '000201',
      pixQrAvailable: false,
      pdfAvailable: true,
      statusMessage: 'Cobrança criada. O contrato não afirma registro na rede bancária.',
    },
  });
  assert(v2Actions.showView && v2Actions.showCopyPix && !v2Actions.showWhatsApp && !v2Actions.showGenerate, 'Bolepix criado não é compartilhado como pagamento na rede');
  const route = fs.readFileSync(path.join(process.cwd(), 'app/api/banking/c6/bolepix/pix-key/route.ts'), 'utf8');
  const pixSource = fs.readFileSync(path.join(process.cwd(), 'lib/banking/c6/c6BolepixV2PixKey.ts'), 'utf8');
  assert(route.includes('request.json') && route.includes('prepareC6BolepixPixKeyWrite'), 'a rota grava a EVP só depois da validação');
  assert(!route.includes('console.') && !pixSource.includes('console.'), 'a chave não é escrita em log');
  assert(!route.includes('executeC6Bolepix') && route.includes('emissionEnabled: false'), 'cadastrar a EVP não emite boleto');
  assert(!route.includes('client_secret') && !route.includes('certificate'), 'a rota não altera credencial C6');
  const panel = fs.readFileSync(path.join(process.cwd(), 'components/finance/C6BankConfigPanel.tsx'), 'utf8');
  assert(panel.includes('Bolepix v2 — Chave Pix'), 'o painel tem a seção da chave');
  assert(panel.includes('Cadastrar a chave não ativa a emissão'), 'a tela avisa que a emissão continua desligada');
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261123120000_c6_bolepix_v2_reservation.sql'),
    'utf8',
  );
  const raceA = reservation.reserveC6Bolepix([], {
    companyId: 'company-a',
    integrationId: 'integration-a',
    integrationCompanyId: 'company-a',
    receiptCompanyId: 'company-a',
    financeReceiptId: 'receipt-race',
    externalReferenceId: '01KP640RNSYXH9G41GR27RTAXA',
    requestFingerprint: fingerprint,
  });
  const raceB = reservation.reserveC6Bolepix([], {
    companyId: 'company-a',
    integrationId: 'integration-a',
    integrationCompanyId: 'company-a',
    receiptCompanyId: 'company-a',
    financeReceiptId: 'receipt-race',
    externalReferenceId: '01KP640RNSYXH9G41GR27RTAYA',
    requestFingerprint: fingerprint,
  });
  assert(raceA.accepted && raceB.accepted, 'o modelo em memória não serializa duas reservas simultâneas');
  assert(
    migration.includes('c6_bolepix_reservations_receipt_unique') && migration.includes('pg_advisory_xact_lock'),
    'o banco aplica unicidade e trava transacional na reserva',
  );

  const retryableV1 = reservation.reserveC6Bolepix([], {
    companyId: 'company-a',
    integrationId: 'integration-a',
    integrationCompanyId: 'company-a',
    receiptCompanyId: 'company-a',
    financeReceiptId: 'receipt-retry',
    externalReferenceId: '01KP640RNSYXH9G41GR27RTAXB',
    requestFingerprint: fingerprint,
    v1Status: 'FAILED',
    v1RetryAllowed: true,
  });
  assert(!retryableV1.accepted, 'reserva v1 com nova tentativa impede a v2');
  const otherCompanyReserve = reservation.reserveC6Bolepix([], {
    companyId: 'company-b',
    integrationId: 'integration-b',
    integrationCompanyId: 'company-b',
    receiptCompanyId: 'company-b',
    financeReceiptId: 'receipt-other',
    externalReferenceId: '01KP640RNSYXH9G41GR27RTAXC',
    requestFingerprint: fingerprint,
  });
  assert(otherCompanyReserve.accepted, 'outra empresa reserva a própria parcela');

  const emission = await import('../lib/banking/c6/c6BolepixV2Emission');
  let pixRequired = false;
  try {
    emission.buildC6BolepixV2EmissionBody({
      environment: 'SANDBOX',
      externalReferenceId: emission.c6BolepixV2ReferenceForInstallment('receipt-1'),
      amount: 10,
      dueDate: '2026-11-23',
      description: 'Parcela',
      payer,
    });
  } catch (error) {
    pixRequired = error instanceof emission.C6BolepixPixKeyRequiredError;
  }
  assert(pixRequired, 'sem EVP a emissão Bolepix não segue sem Pix');
  const bolepixBody = emission.buildC6BolepixV2EmissionBody(
    {
      environment: 'PRODUCTION',
      externalReferenceId: emission.c6BolepixV2ReferenceForInstallment('receipt-1'),
      amount: 10,
      dueDate: '2026-11-23',
      description: 'Parcela',
      payer,
      pixKey: '123e4567-e89b-12d3-a456-426614174000',
    },
    NOW,
  ) as { payment_method: { bank_slip: { billing_scheme: string }; pix: { type: string; key: string } } };
  assert(bolepixBody.payment_method.bank_slip.billing_scheme === '15', 'produção usa a carteira 15');
  assert(bolepixBody.payment_method.pix.type === 'EVP', 'a EVP cadastrada entra no pedido');
  assert(!JSON.stringify(bolepixBody).includes('"10"'), 'a carteira impressa 10 não é enviada');
  const emitter = fs.readFileSync(path.join(process.cwd(), 'lib/banking/c6/c6InstallmentCharge.ts'), 'utf8');
  const creator = fs.readFileSync(path.join(process.cwd(), 'lib/banking/c6/c6BoletoClient.ts'), 'utf8');
  assert(!emitter.includes('executeC6BankSlipCreate'), 'o fluxo da parcela não emite pela v1');
  assert(creator.includes('C6V1EmissionRetiredError'), 'o POST v1 está desativado no cliente');
  const raceMigration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261123193000_c6_bolepix_close_v1_retry_race.sql'),
    'utf8',
  );
  assert(raceMigration.includes("status = 'FAILED' AND retry_allowed IS TRUE"), 'a migration fecha a tentativa v1');
  assert(raceMigration.includes('BEFORE UPDATE'), 'a migration protege o UPDATE da reserva v1');
  assert(raceMigration.includes("pg_advisory_xact_lock"), 'a migration usa o mesmo lock da reserva v1');
  assert(!/update\s+public\.finance_receipts/i.test(raceMigration), 'a migration não altera recebíveis');
  assert(!/delete\s+from\s+public\.c6_boleto_reservations/i.test(raceMigration), 'a migration não apaga o histórico v1');

  const issue = await import('../lib/banking/c6/c6BolepixV2Issue');
  const openApi = await import('../lib/banking/c6/c6BolepixV2OpenApi');
  assert(openApi.C6_BOLEPIX_V2_LIVE_CALLS_ENABLED === true, 'a chamada real fica compilada');
  assert(openApi.C6_BOLEPIX_V2_RELEASED_INTEGRATIONS.length === 1, 'uma integração está nomeada');
  assert(openApi.C6_BOLEPIX_V2_RELEASED_RECEIPTS.length === 1, 'uma parcela está nomeada');
  const released = openApi.C6_BOLEPIX_V2_RELEASED_RECEIPTS[0];
  assert(
    openApi.isC6BolepixV2LiveReceipt(released.companyId, released.integrationId, released.receiptId),
    'a parcela nomeada passa no servidor',
  );
  for (const other of [
    '25c9d7c7-fd95-43b1-97ba-8a1953469e0e',
    '4f1f6dea-53c1-4a96-91d3-c31d1dd1dca3',
    '10c81966-7ced-4e09-9f45-df04496dcefe',
    'fb76a549-399c-4f08-975a-0b0191b096b3',
  ]) {
    assert(
      !openApi.isC6BolepixV2LiveReceipt(released.companyId, released.integrationId, other),
      'as outras parcelas da mesma venda ficam bloqueadas',
    );
  }
  assert(
    !openApi.isC6BolepixV2LiveReceipt('company-b', released.integrationId, released.receiptId),
    'outra empresa não usa a parcela autorizada',
  );
  assert(!issue.c6BolepixV2MayCallBank('company-a', 'integration-a', false), 'sem simulação a chamada não sai');
  assert(
    !issue.c6BolepixV2MayCallBank(released.companyId, released.integrationId, false),
    'a integração sem o recibo não chama o banco',
  );
  const previousKey = process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
  process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = 'teste-fase-4c-chave-bancaria';
  const saved = pix.prepareC6BolepixPixKeyWrite({
    role: 'ADMIN',
    companyId: 'company-a',
    integrationId: 'integration-a',
    financialAccountId: 'account-a',
    pixKey: sample,
    replace: false,
    encryptionConfigured: true,
    lookup: {
      integration: { companyId: 'company-a', provider: 'C6' },
      account: { companyId: 'company-a', integrationId: 'integration-a', active: true },
      existing: null,
    },
  });
  const sealedPayload = issue.c6BolepixV2PayloadFromSealedKey(
    {
      companyId: 'company-a',
      environment: 'PRODUCTION',
      externalReferenceId: emission.c6BolepixV2ReferenceForInstallment('receipt-1'),
      amount: 10,
      dueDate: '2026-11-23',
      description: 'Parcela',
      payer,
      encryptedKey: saved.record.encryptedKey,
      fingerprint: saved.record.fingerprint,
    },
    NOW,
  );
  const sentPix = (sealedPayload.body.payment_method as { pix: { type: string; key: string }; bank_slip: { billing_scheme: string } }).pix;
  assert(sentPix.type === 'EVP' && sentPix.key === sample, 'a EVP decifrada entra no pedido');
  assert(sentPix.key !== saved.record.fingerprint, 'a impressão digital não é a chave Pix');
  assert(sealedPayload.endpoint.includes('/v2/bank_slips/') && !sealedPayload.endpoint.includes('/v1/'), 'o pedido aponta para o endpoint v2');
  assert(!JSON.stringify(issue.redactC6BolepixV2Body(sealedPayload.body)).includes(sample), 'a evidência pública não leva a EVP');
  assert(issue.redactC6BolepixSecret(`falha ${sample}`).includes('[chave]'), 'mensagem de erro não conserva a EVP');
  let bankCalls = 0;
  const issued = await executeC6BolepixV2Create({
    input: {
      environment: 'PRODUCTION',
      externalReferenceId: emission.c6BolepixV2ReferenceForInstallment('receipt-1'),
      amount: 10,
      dueDate: '2026-11-23',
      description: 'Parcela',
      payer,
      pixKey: sealedPayload.pixKey,
    },
    now: NOW,
    allowSimulatedHttp: true,
    fetchFn: async (url, init) => {
      bankCalls += 1;
      assert(url.includes('/v2/bank_slips/') && !url.includes('/v1/bank_slips/'), 'o HTTP simulado não usa a v1');
      assert(String(init.body || '').includes(sample), 'o corpo enviado leva a EVP decifrada');
      return {
        status: 201,
        bodyText: JSON.stringify({
          id: '01HVSBSTN8CCTCTEQT6MC7TD4B',
          external_reference_id: emission.c6BolepixV2ReferenceForInstallment('receipt-1'),
          status: 'CREATED',
          amount: 10,
          due_date: '2026-11-23',
          payment_method: {
            bank_slip: { billing_scheme: '15', billing_type: '3', digitable_line: '33691', bar_code: '33692', our_number: '1' },
            pix: { qr_code: '000201', image_content: 'aW1n', mime_type: 'image/png' },
          },
        }),
        contentType: 'application/json',
      };
    },
  });
  const done = issue.completionForC6BolepixV2({
    disposition: issued.disposition,
    httpStatus: issued.httpStatus,
    chargeId: issued.fields?.id,
  });
  assert(done.status === 'SUCCEEDED' && done.automaticRetry === false && bankCalls === 1, 'HTTP 201 encerra a tentativa');
  assert(issued.fields?.status === 'CREATED', 'CREATED não é tratado como pagamento');
  const timed = await executeC6BolepixV2Create({
    input: base,
    now: NOW,
    allowSimulatedHttp: true,
    fetchFn: async () => {
      bankCalls += 1;
      throw new Error('timeout');
    },
  });
  const uncertain = issue.completionForC6BolepixV2({
    disposition: timed.disposition,
    httpStatus: timed.httpStatus,
    chargeId: timed.fields?.id,
  });
  assert(uncertain.status === 'UNKNOWN' && uncertain.automaticRetry === false, 'timeout não dispara outra emissão');
  const refused = issue.completionForC6BolepixV2({ disposition: 'rejected', httpStatus: 422, chargeId: null });
  assert(refused.status === 'FAILED' && refused.retryAllowed && refused.automaticRetry === false, 'rejeição definitiva não repete sozinha');
  const htmlPdf = await executeC6BolepixV2Pdf({
    environment: 'PRODUCTION',
    externalReferenceId: REFERENCE,
    allowSimulatedHttp: true,
    fetchFn: async () => ({ status: 200, bodyText: '<html></html>', contentType: 'text/html' }),
  });
  assert(!htmlPdf.ok && htmlPdf.pdfBody == null, 'arquivo que não é PDF oficial é recusado');

  const transport = await import('../lib/banking/c6/c6BolepixV2Transport');
  const officialBody = (await import('../lib/banking/c6/c6BolepixV2Validation')).buildC6BolepixV2CreateBody(
    { ...base, pixKey: sample },
    NOW,
  );
  const plan = transport.planC6BolepixV2Request({
    companyId: 'company-a',
    integrationId: 'integration-a',
    creds: { companyId: 'company-a', integrationId: 'integration-a', environment: 'PRODUCTION' },
    operation: 'create',
    accessToken: 'token-de-teste',
    body: officialBody,
  });
  assert(plan.url === 'https://baas-api.c6bank.info/v2/bank_slips/', 'produção usa o host oficial v2');
  assert(plan.method === 'POST', 'a emissão é POST');
  assert(plan.headers.Authorization === 'Bearer token-de-teste', 'o pedido leva o Bearer');
  assert(plan.redactedHeaders.Authorization === 'Bearer [redacted]', 'o cabeçalho público não leva o token');
  assert(plan.headers['partner-software-name'] === 'SV LOTES', 'o cabeçalho do software parceiro está presente');
  assert(String(plan.body || '').includes(sample), 'o corpo oficial leva a EVP');
  assert(!JSON.stringify(plan.redactedBody).includes(sample), 'a evidência do transporte não leva a EVP');
  assert(!JSON.stringify(plan.redactedHeaders).includes('token-de-teste'), 'a evidência do transporte não leva o token');
  const pdfPlan = transport.planC6BolepixV2Request({
    companyId: 'company-a',
    integrationId: 'integration-a',
    creds: { companyId: 'company-a', integrationId: 'integration-a', environment: 'SANDBOX' },
    operation: 'pdf',
    accessToken: 'token-de-teste',
    externalReferenceId: REFERENCE,
  });
  assert(pdfPlan.url.endsWith(`/${REFERENCE}/pdf`) && pdfPlan.url.includes('baas-api-sandbox.c6bank.info'), 'o PDF usa a referência no sandbox');
  assert(pdfPlan.headers.Accept === 'application/pdf', 'o PDF pede application/pdf');
  let foreignTransport = false;
  try {
    transport.planC6BolepixV2Request({
      companyId: 'company-a',
      integrationId: 'integration-a',
      creds: { companyId: 'company-b', integrationId: 'integration-a', environment: 'PRODUCTION' },
      operation: 'get',
      accessToken: 'token-de-teste',
      externalReferenceId: REFERENCE,
    });
  } catch (error) {
    foreignTransport = error instanceof Error && error.message.includes('outra empresa');
  }
  assert(foreignTransport, 'o transporte não atravessa empresa');
  let transportCalls = 0;
  let timedOut = false;
  try {
    await transport.performC6BolepixV2Https(plan, async () => {
      transportCalls += 1;
      const { C6BoletoTransportError } = await import('../lib/banking/c6/c6BoletoClient');
      throw new C6BoletoTransportError('TIMEOUT', 'Timeout ao contatar o C6 Bank (boleto).');
    });
  } catch (error) {
    const { C6BoletoTransportError } = await import('../lib/banking/c6/c6BoletoClient');
    timedOut = error instanceof C6BoletoTransportError && error.code === 'TIMEOUT';
  }
  assert(timedOut && transportCalls === 1, 'timeout de transporte não repete a chamada');
  let liveTransportBlocked = false;
  let liveFetchCalls = 0;
  try {
    await transport.postC6BolepixV2Charge({
      companyId: 'company-a',
      integrationId: 'integration-a',
      environment: 'PRODUCTION',
      input: { ...base, pixKey: sample },
      fetchFn: async () => {
        liveFetchCalls += 1;
        return { status: 201, bodyText: '{}', contentType: 'application/json' };
      },
      now: NOW,
    });
  } catch (error) {
    const { C6BolepixV2LiveDisabledError } = await import('../lib/banking/c6/c6BolepixV2Client');
    liveTransportBlocked = error instanceof C6BolepixV2LiveDisabledError;
  }
  assert(liveTransportBlocked && liveFetchCalls === 0, 'sem liberação o mTLS não é chamado');
  const named = (await import('../lib/banking/c6/c6BolepixV2OpenApi')).C6_BOLEPIX_V2_RELEASED_RECEIPTS[0];
  let namedWithoutGrant = false;
  try {
    await transport.postC6BolepixV2Charge({
      companyId: named.companyId,
      integrationId: named.integrationId,
      receiptId: named.receiptId,
      environment: 'PRODUCTION',
      input: { ...base, pixKey: sample },
      fetchFn: async () => {
        liveFetchCalls += 1;
        return { status: 201, bodyText: '{}', contentType: 'application/json' };
      },
      now: NOW,
    });
  } catch (error) {
    const { C6BolepixV2LiveDisabledError } = await import('../lib/banking/c6/c6BolepixV2Client');
    namedWithoutGrant = error instanceof C6BolepixV2LiveDisabledError;
  }
  let siblingBlocked = false;
  try {
    await transport.postC6BolepixV2Charge({
      companyId: named.companyId,
      integrationId: named.integrationId,
      receiptId: '25c9d7c7-fd95-43b1-97ba-8a1953469e0e',
      activationGranted: true,
      environment: 'PRODUCTION',
      input: { ...base, pixKey: sample },
      fetchFn: async () => {
        liveFetchCalls += 1;
        return { status: 201, bodyText: '{}', contentType: 'application/json' };
      },
      now: NOW,
    });
  } catch (error) {
    const { C6BolepixV2LiveDisabledError } = await import('../lib/banking/c6/c6BolepixV2Client');
    siblingBlocked = error instanceof C6BolepixV2LiveDisabledError;
  }
  let namedWithoutCredentials = false;
  try {
    await transport.postC6BolepixV2Charge({
      companyId: named.companyId,
      integrationId: named.integrationId,
      receiptId: named.receiptId,
      activationGranted: true,
      environment: 'PRODUCTION',
      input: { ...base, pixKey: sample },
      now: NOW,
    });
  } catch (error) {
    const { C6BolepixV2LiveDisabledError } = await import('../lib/banking/c6/c6BolepixV2Client');
    namedWithoutCredentials = error instanceof C6BolepixV2LiveDisabledError;
  }
  assert(
    namedWithoutGrant && siblingBlocked && namedWithoutCredentials && liveFetchCalls === 0,
    'a parcela nomeada não chama o banco sem autorização nem credencial, e a parcela vizinha permanece bloqueada',
  );
  const agent = transport.createC6BolepixMtlsAgent({
    certificatePem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
    privateKeyPem: '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----',
  });
  agent.destroy();
  assert(agent instanceof (await import('node:https')).Agent, 'o agente reutiliza o certificado mTLS');

  const readiness = (await import('../lib/banking/c6/c6BolepixV2OpenApi')).evaluateC6BolepixV2ControlledEmission({
    companyId: 'company-a',
    integrationId: 'integration-a',
    pixConfigured: true,
    beneficiaryLinked: true,
    integrationActive: true,
    credentialsPresent: true,
    migrationConfirmed: true,
    reservationReady: true,
    adminAuthorized: true,
    testParcelNamed: true,
  });
  assert(readiness.postAllowed === false, 'o POST continua desligado sem liberação individual');
  const unnamed = (await import('../lib/banking/c6/c6BolepixV2OpenApi')).evaluateC6BolepixV2ControlledEmission({
    companyId: 'company-a',
    integrationId: 'integration-a',
    pixConfigured: true,
    beneficiaryLinked: true,
    integrationActive: true,
    credentialsPresent: true,
    migrationConfirmed: true,
    reservationReady: true,
    adminAuthorized: true,
    testParcelNamed: false,
  });
  assert(unnamed.missing.includes('parcela de teste indicada'), 'sem parcela indicada a emissão não abre');

  const creds = {
    companyId: 'company-a',
    integrationId: 'integration-a',
    environment: 'SANDBOX' as const,
    clientId: 'client',
    clientSecret: 'secret',
    certificatePem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
    privateKeyPem: '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----',
  };
  let readCalls = 0;
  const read = await transport.readC6BolepixV2Charge({
    companyId: 'company-a',
    integrationId: 'integration-a',
    environment: 'SANDBOX',
    externalReferenceId: REFERENCE,
    ownedByCompany: true,
    credentials: creds,
    requestFn: async (plan) => {
      readCalls += 1;
      assert(plan.method === 'GET', 'a consulta oficial é GET');
      assert(plan.url.endsWith(`/${REFERENCE}`), 'a consulta usa a referência da própria cobrança');
      assert(!plan.url.includes('/v1/bank_slips/'), 'a consulta nova não usa o POST v1');
      return {
        status: 200,
        bodyText: JSON.stringify({ id: 'charge', external_reference_id: REFERENCE, status: 'CREATED' }),
        contentType: 'application/json',
      };
    },
  });
  assert(read.ok && readCalls === 1 && read.fields?.status === 'CREATED', 'a consulta v2 lê o JSON oficial');
  let foreignReads = 0;
  let foreignReadBlocked = false;
  try {
    await transport.readC6BolepixV2Charge({
      companyId: 'company-a',
      integrationId: 'integration-a',
      environment: 'SANDBOX',
      externalReferenceId: REFERENCE,
      ownedByCompany: true,
      credentials: { ...creds, companyId: 'company-b' },
      requestFn: async () => {
        foreignReads += 1;
        return { status: 200, bodyText: '{}', contentType: 'application/json' };
      },
    });
  } catch (error) {
    foreignReadBlocked = error instanceof Error && error.message.includes('outra empresa');
  }
  assert(foreignReadBlocked && foreignReads === 0, 'referência de outra empresa não consulta o banco');
  let unownedReads = 0;
  let unownedBlocked = false;
  try {
    await transport.readC6BolepixV2Charge({
      companyId: 'company-a',
      integrationId: 'integration-a',
      environment: 'SANDBOX',
      externalReferenceId: REFERENCE,
      credentials: creds,
      requestFn: async () => {
        unownedReads += 1;
        return { status: 200, bodyText: '{}', contentType: 'application/json' };
      },
    });
  } catch (error) {
    unownedBlocked = error instanceof Error && error.message.includes('desta empresa');
  }
  assert(unownedBlocked && unownedReads === 0, 'sem prova de posse a consulta não sai');
  const officialPdf = await transport.readC6BolepixV2Charge({
    companyId: 'company-a',
    integrationId: 'integration-a',
    environment: 'SANDBOX',
    externalReferenceId: REFERENCE,
    pdf: true,
    ownedByCompany: true,
    credentials: creds,
    requestFn: async (plan) => {
      assert(plan.url.endsWith(`/${REFERENCE}/pdf`), 'o PDF oficial usa a referência e /pdf');
      assert(plan.headers.Accept === 'application/pdf', 'o PDF pede o arquivo do banco');
      return { status: 200, bodyText: '%PDF-1.4 oficial', contentType: 'application/pdf' };
    },
  });
  assert(officialPdf.ok && officialPdf.pdfBody?.startsWith('%PDF'), 'o download devolve o PDF original');
  const inventedPdf = await transport.readC6BolepixV2Charge({
    companyId: 'company-a',
    integrationId: 'integration-a',
    environment: 'SANDBOX',
    externalReferenceId: REFERENCE,
    pdf: true,
    ownedByCompany: true,
    credentials: creds,
    requestFn: async () => ({ status: 200, bodyText: 'boleto ficticio', contentType: 'text/plain' }),
  });
  assert(!inventedPdf.ok && inventedPdf.pdfBody == null, 'arquivo que não é o PDF do banco é recusado');
  assert(panel.includes('financialAccountId'), 'o cadastro da chave continua exigindo a conta');
  assert(panel.includes('A emissão real permanece desligada'), 'o painel não promete emissão ligada');
  assert(!panel.includes('emissionEnabled || !pixKey'), 'a chave não fica bloqueada pela emissão desligada');
  assert(panel.includes('listC6BolepixActivationPending'), 'o painel lista cada requisito pendente');
  assert(panel.includes('emissionPending.map'), 'cada requisito pendente aparece na tela');
  assert(!panel.includes('Emissão ATIVADA'), 'o painel não anuncia emissão ativada');
  assert(!panel.includes('Emissão ativada somente para esta empresa.'), 'o sucesso não afirma que o POST abriu');
  const openApiState = await import('../lib/banking/c6/c6BolepixV2OpenApi');
  const waitingPassword = openApiState.listC6BolepixActivationPending({
    loading: false,
    persistBlocked: false,
    integrationPresent: true,
    integrationDisabled: false,
    clientIdConfigured: true,
    hasClientSecret: true,
    hasCertificate: true,
    beneficiaryLinked: true,
    pixConfigured: true,
    passwordProvided: false,
  });
  assert(
    waitingPassword.length === 1 && waitingPassword[0].includes('senha do administrador'),
    'com a EVP pronta o botão espera somente a senha',
  );
  const missingAccount = openApiState.listC6BolepixActivationPending({
    loading: false,
    persistBlocked: false,
    integrationPresent: true,
    integrationDisabled: false,
    clientIdConfigured: true,
    hasClientSecret: true,
    hasCertificate: true,
    beneficiaryLinked: false,
    pixConfigured: true,
    passwordProvided: true,
  });
  assert(missingAccount.some((item) => item.includes('conta financeira')), 'sem conta o botão continua bloqueado');
  const ready = openApiState.listC6BolepixActivationPending({
    loading: false,
    persistBlocked: false,
    integrationPresent: true,
    integrationDisabled: false,
    clientIdConfigured: true,
    hasClientSecret: true,
    hasCertificate: true,
    beneficiaryLinked: true,
    pixConfigured: true,
    passwordProvided: true,
  });
  assert(ready.length === 0, 'com todos os requisitos o botão pode ser usado');
  const described = openApiState.describeC6BolepixPanel({
    companyId: 'company-a',
    integrationId: 'integration-a',
    integrationPresent: true,
    credentialsPresent: true,
    beneficiaryLinked: true,
    pixConfigured: true,
    activationRequested: true,
    testParcelNamed: true,
  });
  assert(
    described.postAllowed === false && described.phase === 'aguardando_autorizacao',
    'parcela indicada sem liberação individual não abre o POST',
  );
  const releasedReceipt = openApiState.C6_BOLEPIX_V2_RELEASED_RECEIPTS[0];
  const operational = openApiState.describeC6BolepixPanel({
    companyId: releasedReceipt.companyId,
    integrationId: releasedReceipt.integrationId,
    integrationPresent: true,
    credentialsPresent: true,
    beneficiaryLinked: true,
    pixConfigured: true,
    activationRequested: true,
    testParcelNamed: true,
  });
  assert(
    operational.postAllowed === true && operational.phase === 'emissao_operacional',
    'a empresa autorizada com a parcela nomeada reflete o POST',
  );
  const waitingAdmin = openApiState.describeC6BolepixPanel({
    companyId: releasedReceipt.companyId,
    integrationId: releasedReceipt.integrationId,
    integrationPresent: true,
    credentialsPresent: true,
    beneficiaryLinked: true,
    pixConfigured: true,
    activationRequested: false,
    testParcelNamed: true,
  });
  assert(waitingAdmin.postAllowed === false, 'sem o pedido do administrador o POST fica fechado');
  const reference = (await import('../lib/banking/c6/c6BolepixV2Emission')).c6BolepixV2ReferenceForInstallment(
    releasedReceipt.receiptId,
  );
  assert(/^[A-Z0-9]{26}$/.test(reference), 'a referência externa da parcela autorizada tem 26 caracteres');
  const batch = fs.readFileSync(path.join(process.cwd(), 'lib/finance/saleChargesService.ts'), 'utf8');
  assert(batch.includes('Emissão C6 em lote permanece bloqueada'), 'a emissão em lote continua bloqueada');
  assert(!batch.includes('emitC6InstallmentBoleto'), 'o lote não chama a emissão individual');
  const configured = openApiState.describeC6BolepixPanel({
    companyId: 'company-a',
    integrationId: 'integration-a',
    integrationPresent: true,
    credentialsPresent: true,
    beneficiaryLinked: true,
    pixConfigured: true,
    activationRequested: false,
    testParcelNamed: false,
  });
  assert(configured.phase === 'evp_configurada' && configured.postAllowed === false, 'EVP configurada não é emissão operacional');

  if (previousKey == null) delete process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
  else process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = previousKey;

  console.log('C6_BOLEPIX_V2_OK');
  console.log('SIMULADO: criação, Pix, PDF, consulta, baixa e bloqueio real. Nenhum HTTP ao banco.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
