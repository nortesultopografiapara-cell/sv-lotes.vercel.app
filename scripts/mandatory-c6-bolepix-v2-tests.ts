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
  assert(C6_BOLEPIX_V2_LIVE_CALLS_ENABLED === false, 'a chamada real do Bolepix permanece desligada');
  let liveBlocked = false;
  try {
    await executeC6BolepixV2Create({ input: base, now: NOW });
  } catch (error) {
    liveBlocked = error instanceof C6BolepixV2LiveDisabledError;
  }
  assert(liveBlocked, 'sem fetch simulado a emissão não sai do processo');

  const spec = fs.readFileSync(path.join(process.cwd(), 'docs/c6/bankslip-v2-api.yaml'), 'utf8');
  assert(spec.includes('title: Boleto com Liquidação via Barra ou Pix'), 'a spec oficial está no repositório');
  assert(spec.includes('version: 1.2.0'), 'a versão lida é 1.2.0');
  assert(spec.includes('Carteira para **produção** sendo a carteira do número: 15'), 'a carteira 15 está na spec');

  const created = await executeC6BolepixV2Create({
    input: { ...base, pixKey: '123e4567-e89b-12d3-a456-426614174000' },
    now: NOW,
    fetchFn: json(201, {
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
    fetchFn: json(201, { id: '01HVSBSTN8CCTCTEQT6MC7TD4C', status: 'CREATED', payment_method: { bank_slip: {} } }),
  });
  assert(!('pix' in (withoutPix.body.payment_method as object)), 'sem chave Pix o bloco não é enviado');
  assert(withoutPix.fields?.pixCopyPaste == null, 'Pix ausente não é fabricado');

  let invalidPix = false;
  try {
    await executeC6BolepixV2Create({
      input: { ...base, pixKey: 'email@exemplo.com' },
      now: NOW,
      fetchFn: json(201, { id: 'x' }),
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
    fetchFn: async () => {
      calls += 1;
      return { status: 201, bodyText: '{"amount":10}', contentType: 'application/json' };
    },
  });
  assert(ambiguous.disposition === 'uncertain' && calls === 1, 'HTTP 201 sem id fica incerto');
  assert(ambiguous.disposition !== 'rejected', 'resposta incerta não libera nova emissão automática');

  const rejected = await executeC6BolepixV2Create({
    input: base,
    now: NOW,
    fetchFn: json(422, { error: 'invalid' }),
  });
  assert(rejected.disposition === 'rejected' && rejected.httpStatus === 422, '422 sem id é rejeição definitiva');

  const unavailable = await executeC6BolepixV2Create({
    input: base,
    now: NOW,
    fetchFn: async () => {
      throw new Error('timeout');
    },
  });
  assert(unavailable.disposition === 'uncertain' && unavailable.httpStatus === null, 'timeout não confirma a cobrança');

  const server = await executeC6BolepixV2Create({
    input: base,
    now: NOW,
    fetchFn: json(503, { error: 'down' }),
  });
  assert(server.disposition === 'uncertain', '5xx permanece incerto');

  const queried = await executeC6BolepixV2Get({
    environment: 'PRODUCTION',
    externalReferenceId: REFERENCE,
    fetchFn: json(200, {
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
    fetchFn: async (url, init) => {
      assert(url.endsWith(`/${REFERENCE}/pdf`), 'o PDF usa a referência externa');
      assert(init.headers.Accept === 'application/pdf', 'o PDF pede application/pdf');
      return { status: 200, bodyText: '%PDF-1.4', contentType: 'application/pdf' };
    },
  });
  assert(pdf.ok && pdf.pdfBytes != null, 'PDF oficial só vale com %PDF');
  const missingPdf = await executeC6BolepixV2Pdf({
    environment: 'PRODUCTION',
    externalReferenceId: REFERENCE,
    fetchFn: async () => ({ status: 404, bodyText: '{"error":"missing"}', contentType: 'application/json' }),
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
  assert(!emit.includes('/v2/bank_slips'), 'a emissão atual não foi convertida para v2');

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
  assert(route.includes('status: 409') && !route.includes('request.json'), 'a rota da chave não lê nem grava o segredo');
  const panel = fs.readFileSync(path.join(process.cwd(), 'components/finance/C6BankConfigPanel.tsx'), 'utf8');
  assert(panel.includes('A emissão Bolepix permanece desligada'), 'a tela avisa que a emissão continua desligada');

  console.log('C6_BOLEPIX_V2_OK');
  console.log('SIMULADO: criação, Pix, PDF, consulta, baixa e bloqueio real. Nenhum HTTP ao banco.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
