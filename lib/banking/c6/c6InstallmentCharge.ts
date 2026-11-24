/**
 * Emissão nova de cobrança C6.
 * O POST /v1/bank_slips/ não é mais usado. O motor é o Bolepix v2,
 * e a chamada real só existe para a parcela nomeada. Consulta e PDF de cobrança
 * histórica continuam na leitura v1.
 */

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveChargePayer } from '@/lib/buyerLegalEntity';
import {
  isC6EmissionActivated,
  readC6BolepixActivationRequested,
} from '@/lib/banking/c6/c6EmissionAuthorization';
import {
  executeC6BankSlipGet,
  executeC6BankSlipPdf,
  type C6BoletoExecuteOptions,
  type C6BoletoFetchFn,
} from '@/lib/banking/c6/c6BoletoClient';
import { executeC6BolepixV2Get, executeC6BolepixV2Pdf, C6BolepixV2LiveDisabledError } from '@/lib/banking/c6/c6BolepixV2Client';
import { postC6BolepixV2Charge, readC6BolepixV2Charge, type C6BolepixV2HttpPlan } from '@/lib/banking/c6/c6BolepixV2Transport';
import {
  isC6BolepixV2LiveReceipt,
  isC6BolepixV2ReceiptCandidate,
} from '@/lib/banking/c6/c6BolepixV2OpenApi';
import { C6BolepixPixKeyRequiredError, c6BolepixV2ReferenceForInstallment } from '@/lib/banking/c6/c6BolepixV2Emission';
import {
  c6BolepixV2MayCallBank,
  c6BolepixV2PayloadFromSealedKey,
  completionForC6BolepixV2,
  captureC6BankDiagnostic,
  describeC6BolepixV2Outcome,
  type C6BankDiagnostic,
} from '@/lib/banking/c6/c6BolepixV2Issue';
import { officialC6BolepixFromResponse } from '@/lib/banking/c6/c6BolepixV2Official';
import { c6BolepixRequestFingerprint } from '@/lib/banking/c6/c6BolepixV2Reservation';
import { reconcileC6BolepixV2Query, readC6BolepixV2Payments } from '@/lib/banking/c6/c6BolepixV2Reconcile';
import { C6EmissionNotHomologatedError } from '@/lib/banking/c6/c6EmitGuard';
import type { C6AuthCredentials, C6AuthFetchFn } from '@/lib/banking/c6/c6AuthClient';
import { loadC6SecretsForGrantedOperation, loadC6SecretsForIntegration } from '@/lib/banking/c6/c6ConfigRepository';
import {
  C6_BOLEPIX_OFFICIAL_SPEC_IN_REPO,
  c6PixCopyPasteFromBankSlip,
} from '@/lib/banking/c6/c6BolepixContract';
import { readOfficialC6BankSlip, settleC6PaidSlip, type C6SettlementResult } from '@/lib/banking/c6/c6PaymentSettlement';
import { buildC6BankSlipCreateBody } from '@/lib/banking/c6/c6BoletoValidation';
import type { BankEnvironment } from '@/lib/banking/types';

export type C6InstallmentEmitResult = {
  emitted: boolean;
  reused: boolean;
  duplicate: boolean;
  needsReconciliation: boolean;
  bankSlipId: string | null;
  digitableLine: string | null;
  barCode: string | null;
  pixCopyPaste: string | null;
  bolepixSpecInRepo: false;
  amount: number;
  dueDate: string;
  installmentId: string;
  companyId: string;
  message: string;
  outcome?: 'succeeded' | 'rejected' | 'authentication' | 'configuration' | 'timeout' | 'uncertain' | 'waiting';
  httpStatus?: number | null;
  bankCode?: string | null;
  stage?: string | null;
  externalReference?: string | null;
  traceId?: string | null;
  bankDiagnostic?: C6BankDiagnostic | null;
};

export type C6InstallmentChargeOptions = {
  allowSimulatedHttp?: boolean;
  fetchFn?: C6BoletoFetchFn;
  authFetchFn?: C6AuthFetchFn;
  credentials?: C6AuthCredentials;
  transportRequest?: (plan: C6BolepixV2HttpPlan) => Promise<{ status: number; bodyText: string; contentType?: string | null }>;
  now?: Date;
};

function clean(value: unknown): string {
  return String(value || '').trim();
}

export function c6ExternalReferenceForInstallment(installmentId: string): string {
  const compact = clean(installmentId).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return compact.slice(-10);
}

export function c6BoletoRequestFingerprint(input: {
  amount: number;
  dueDate: string;
  taxId: string;
  reference: string;
}): string {
  const canonical = JSON.stringify({
    amount: Number(input.amount).toFixed(2),
    dueDate: input.dueDate,
    taxId: input.taxId.replace(/\D/g, ''),
    reference: input.reference,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function dueDateOf(value: unknown): string {
  return clean(value).slice(0, 10);
}

function simulated(options?: C6InstallmentChargeOptions): boolean {
  return options?.allowSimulatedHttp === true && typeof options.fetchFn === 'function';
}

async function claimUnsentBolepixReservation(
  admin: SupabaseClient,
  companyId: string,
  integrationId: string,
  installmentId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('c6_bolepix_reservations')
    .update({ status: 'PROCESSING', updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('integration_id', integrationId)
    .eq('finance_receipt_id', installmentId)
    .eq('status', 'RESERVED')
    .is('c6_charge_id', null)
    .is('last_http_status', null)
    .select('id');
  if (error) throw new Error('Não foi possível reservar o Bolepix.');
  return Array.isArray(data) && data.length === 1;
}

async function releaseUnsentBolepixReservation(
  admin: SupabaseClient,
  companyId: string,
  integrationId: string,
  installmentId: string,
): Promise<void> {
  await admin
    .from('c6_bolepix_reservations')
    .update({ status: 'RESERVED', updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('integration_id', integrationId)
    .eq('finance_receipt_id', installmentId)
    .eq('status', 'PROCESSING')
    .is('c6_charge_id', null)
    .is('last_http_status', null);
}

async function loadOpenBolepixAttempt(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
): Promise<Record<string, unknown> | null> {
  const result = await admin
    .from('c6_bolepix_attempts')
    .select('id, status, c6_charge_id, last_http_status, external_reference_id')
    .eq('company_id', companyId)
    .eq('finance_receipt_id', installmentId);
  if (result.error) {
    const message = String(result.error.message || '');
    if (/c6_bolepix_attempts|does not exist|schema cache|Could not find the table/i.test(message)) return null;
    throw new Error('Não foi possível verificar a tentativa Bolepix.');
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return (
    rows.find((row) =>
      ['RESERVED', 'PROCESSING', 'SUCCEEDED', 'UNKNOWN'].includes(clean((row as { status?: string }).status).toUpperCase()),
    ) || null
  ) as Record<string, unknown> | null;
}

async function claimPreparedBolepixAttempt(
  admin: SupabaseClient,
  companyId: string,
  integrationId: string,
  installmentId: string,
): Promise<boolean> {
  const claimed = await admin.rpc('claim_c6_bolepix_attempt', {
    p_company_id: companyId,
    p_integration_id: integrationId,
    p_finance_receipt_id: installmentId,
  });
  if (claimed.error) throw new Error('Não foi possível reservar a nova tentativa.');
  return claimed.data?.accepted === true;
}

async function releasePreparedBolepixAttempt(
  admin: SupabaseClient,
  companyId: string,
  integrationId: string,
  installmentId: string,
): Promise<void> {
  await admin
    .from('c6_bolepix_attempts')
    .update({ status: 'RESERVED', updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('integration_id', integrationId)
    .eq('finance_receipt_id', installmentId)
    .eq('status', 'PROCESSING')
    .is('c6_charge_id', null)
    .is('last_http_status', null);
}

async function loadReceipt(admin: SupabaseClient, companyId: string, installmentId: string) {
  const { data, error } = await admin
    .from('finance_receipts')
    .select('id, company_id, tenant_id, sale_id, customer_id, financial_account_id, amount, due_date, status, installment_number')
    .eq('id', installmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('Parcela não encontrada.');
  const owner = clean(data.company_id || data.tenant_id);
  if (owner !== companyId) throw new Error('Parcela de outra empresa.');
  return data;
}

async function existingCharge(admin: SupabaseClient, companyId: string, installmentId: string) {
  const { data, error } = await admin
    .from('bank_charges')
    .select('*')
    .eq('company_id', companyId)
    .eq('provider', 'C6')
    .eq('finance_receipt_id', installmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

export async function emitC6InstallmentBoleto(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
  options?: C6InstallmentChargeOptions,
): Promise<C6InstallmentEmitResult> {
  const live = !simulated(options);
  if (live && !isC6BolepixV2ReceiptCandidate(companyId, installmentId)) {
    throw new C6EmissionNotHomologatedError();
  }

  const receipt = await loadReceipt(admin, companyId, installmentId);
  if (clean(receipt.status).toLowerCase() === 'pago') {
    throw new Error('Parcela já está paga.');
  }
  const amount = Number(receipt.amount);
  const dueDate = dueDateOf(receipt.due_date);
  const original = { amount: receipt.amount, dueDate: receipt.due_date };

  const accountId = clean(receipt.financial_account_id);
  const { data: account, error: accountError } = await admin
    .from('company_financial_accounts')
    .select('id, company_id, bank_integration_id, active')
    .eq('id', accountId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (accountError) throw new Error(accountError.message);
  if (!account?.bank_integration_id) throw new Error('A parcela não tem conta financeira C6.');
  if (account.active === false) {
    throw new Error('A chave Pix precisa da conta beneficiária vinculada a esta integração C6. CNPJ igual não basta.');
  }

  const { data: integration, error: integrationError } = await admin
    .from('bank_integrations')
    .select('id, company_id, provider, environment, metadata')
    .eq('id', account.bank_integration_id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (integrationError) throw new Error(integrationError.message);
  if (clean(integration?.provider).toUpperCase() !== 'C6') {
    throw new Error('A conta financeira não é do C6 Bank.');
  }

  const { data: customer, error: customerError } = await admin
    .from('customers')
    .select('id, company_id, name, cpf_cnpj, document, email, address, address_number, neighborhood, city, state, state_uf, cep, zip_code')
    .eq('id', receipt.customer_id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);
  if (!customer?.id) throw new Error('Pagador não encontrado nesta empresa.');
  const payer = resolveChargePayer(customer as Record<string, unknown>);
  const reference = c6ExternalReferenceForInstallment(installmentId);
  const state = clean(customer.state_uf || customer.state).toUpperCase();
  const zip = clean(customer.cep || customer.zip_code).replace(/\D/g, '');

  const current = await existingCharge(admin, companyId, installmentId);
  let resumeUnsent = false;
  let preparedAttempt: { id: string; external_reference_id: string } | null = null;
  const bolepixReservation = await admin
    .from('c6_bolepix_reservations')
    .select('id, status, c6_charge_id, retry_allowed, external_reference_id, last_http_status')
    .eq('company_id', companyId)
    .eq('finance_receipt_id', installmentId)
    .maybeSingle();
  if (bolepixReservation.error) {
    const reservationError = String(bolepixReservation.error.message || '');
    if (!/c6_bolepix_reservations|does not exist|schema cache|Could not find the table/i.test(reservationError)) {
      throw new Error('Não foi possível verificar a reserva Bolepix.');
    }
  } else if (bolepixReservation.data?.id) {
    const reservedStatus = clean(bolepixReservation.data.status).toUpperCase();
    const chargeId = clean(bolepixReservation.data.c6_charge_id);
    const httpStatus = bolepixReservation.data.last_http_status;
    const uncertain =
      reservedStatus === 'UNKNOWN' ||
      reservedStatus === 'PROCESSING' ||
      Boolean(chargeId && reservedStatus !== 'SUCCEEDED');
    const unsent = reservedStatus === 'RESERVED' && !chargeId && httpStatus == null;
    if (reservedStatus === 'FAILED' && !chargeId) {
      const openAttempt = await loadOpenBolepixAttempt(admin, companyId, installmentId);
      if (
        openAttempt &&
        clean(openAttempt.status).toUpperCase() === 'RESERVED' &&
        !clean(openAttempt.c6_charge_id) &&
        openAttempt.last_http_status == null
      ) {
        preparedAttempt = {
          id: clean(openAttempt.id),
          external_reference_id: clean(openAttempt.external_reference_id),
        };
      } else if (openAttempt) {
        return {
          emitted: false,
          reused: false,
          duplicate: true,
          needsReconciliation: true,
          bankSlipId: clean(openAttempt.c6_charge_id) || null,
          digitableLine: null,
          barCode: null,
          pixCopyPaste: null,
          bolepixSpecInRepo: C6_BOLEPIX_OFFICIAL_SPEC_IN_REPO,
          amount,
          dueDate,
          installmentId,
          companyId,
          message: 'Há uma tentativa Bolepix em aberto ou com resultado incerto. Nenhuma nova emissão foi feita.',
        };
      }
    }
    if (!unsent && !preparedAttempt) {
      return {
        emitted: false,
        reused: reservedStatus === 'SUCCEEDED',
        duplicate: true,
        needsReconciliation: uncertain || reservedStatus === 'FAILED' || reservedStatus === 'UNKNOWN',
        bankSlipId: chargeId || null,
        digitableLine: null,
        barCode: null,
        pixCopyPaste: null,
        bolepixSpecInRepo: C6_BOLEPIX_OFFICIAL_SPEC_IN_REPO,
        amount,
        dueDate,
        installmentId,
        companyId,
        message:
          reservedStatus === 'FAILED'
            ? 'A referência anterior permanece arquivada. Prepare uma nova tentativa com referência inédita. Nenhuma emissão foi feita.'
            : uncertain
              ? 'O resultado desta cobrança está incerto. Nenhuma nova emissão foi feita.'
              : 'Esta parcela já tem reserva Bolepix v2.',
      };
    }
    if (unsent) resumeUnsent = true;
  }
  if (clean(current?.external_id)) {
    return {
      emitted: false,
      reused: true,
      duplicate: true,
      needsReconciliation: false,
      bankSlipId: clean(current.external_id),
      digitableLine: clean(current.digitable_line) || null,
      barCode: clean(current.barcode) || null,
      pixCopyPaste: c6PixCopyPasteFromBankSlip(current),
      bolepixSpecInRepo: C6_BOLEPIX_OFFICIAL_SPEC_IN_REPO,
      amount,
      dueDate,
      installmentId,
      companyId,
      message: 'Boleto C6 já vinculado a esta parcela.',
    };
  }

  const environment = clean(integration.environment).toUpperCase() as BankEnvironment;
  if (environment !== 'SANDBOX' && environment !== 'PRODUCTION') {
    throw new Error('Ambiente C6 inválido.');
  }
  buildC6BankSlipCreateBody(
    {
      companyId,
      environment,
      external_reference_id: reference,
      amount,
      due_date: dueDate,
      payer: {
        name: payer.name,
        tax_id: payer.documentDigits,
        email: clean(customer.email) || undefined,
        address: {
          street: clean(customer.address),
          number: clean(customer.address_number),
          city: clean(customer.city),
          state,
          zip_code: zip,
        },
      },
    },
    options?.now,
  );
  if (receipt.amount !== original.amount || receipt.due_date !== original.dueDate) {
    throw new Error('A emissão C6 alteraria valor ou vencimento da parcela.');
  }
  const storedKey = await admin
    .from('c6_bolepix_pix_keys')
    .select('company_id, integration_id, encrypted_key, key_fingerprint')
    .eq('company_id', companyId)
    .eq('integration_id', integration.id)
    .maybeSingle();
  if (storedKey.error) {
    const pixError = String(storedKey.error.message || '');
    if (!/c6_bolepix_pix_keys|does not exist|schema cache|Could not find the table/i.test(pixError)) {
      throw new Error('Não foi possível verificar a chave Pix.');
    }
  }
  const sealed = storedKey.data;
  if (
    !sealed ||
    clean(sealed.company_id) !== companyId ||
    clean(sealed.integration_id) !== clean(integration.id) ||
    !clean(sealed.encrypted_key) ||
    !clean(sealed.key_fingerprint)
  ) {
    throw new C6BolepixPixKeyRequiredError();
  }
  const street = clean(customer.address);
  const number = clean(customer.address_number);
  const addressLine = street.includes(number) ? street : `${street}, ${number}`.trim();
  const bolepixReference = preparedAttempt
    ? preparedAttempt.external_reference_id
    : c6BolepixV2ReferenceForInstallment(installmentId);
  const prepared = c6BolepixV2PayloadFromSealedKey(
    {
      companyId,
      environment,
      externalReferenceId: bolepixReference,
      amount,
      dueDate,
      description: `Parcela ${clean(receipt.installment_number) || ''}`.trim().slice(0, 100),
      payer: {
        name: payer.name,
        taxId: payer.documentDigits,
        email: clean(customer.email) || undefined,
        address: addressLine,
        neighborhood: clean(customer.neighborhood),
        city: clean(customer.city),
        state,
        zipCode: zip,
      },
      encryptedKey: clean(sealed.encrypted_key),
      fingerprint: clean(sealed.key_fingerprint),
    },
    options?.now,
  );
  const activationGranted =
    !live ||
    (isC6BolepixV2LiveReceipt(companyId, clean(integration.id), installmentId) &&
      readC6BolepixActivationRequested(integration.metadata));
  if (live && !activationGranted) {
    throw new C6EmissionNotHomologatedError();
  }
  let credentials = options?.credentials
    ? { ...options.credentials, integrationId: clean(integration.id) }
    : null;
  if (live && !credentials) {
    const secrets = await loadC6SecretsForIntegration(admin, companyId, clean(integration.id));
    if (!secrets || secrets.environment !== environment || !secrets.clientId || !secrets.clientSecret) {
      throw new C6BolepixV2LiveDisabledError();
    }
    credentials = {
      companyId,
      integrationId: secrets.integrationId,
      environment: secrets.environment,
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      certificatePem: secrets.certificatePem,
      privateKeyPem: secrets.privateKeyPem,
    };
  }
  const fingerprint = c6BolepixRequestFingerprint({
    amount: amount.toFixed(2),
    dueDate,
    taxId: payer.documentDigits,
    reference: bolepixReference,
    receiptId: installmentId,
  });
  if (!resumeUnsent && !preparedAttempt) {
    const reserved = await admin.rpc('reserve_c6_bolepix', {
      p_company_id: companyId,
      p_integration_id: integration.id,
      p_finance_receipt_id: installmentId,
      p_external_reference_id: bolepixReference,
      p_request_fingerprint: fingerprint,
    });
    if (reserved.error) throw new Error('Não foi possível reservar o Bolepix.');
    const reserveReason = clean(reserved.data?.reason);
    if (reserved.data?.accepted !== true) {
      return {
        emitted: false,
        reused: false,
        duplicate: reserveReason !== 'needs_reconciliation',
        needsReconciliation: reserveReason === 'needs_reconciliation',
        bankSlipId: null,
        digitableLine: null,
        barCode: null,
        pixCopyPaste: null,
        bolepixSpecInRepo: C6_BOLEPIX_OFFICIAL_SPEC_IN_REPO,
        amount,
        dueDate,
        installmentId,
        companyId,
        message:
          reserveReason === 'needs_reconciliation'
            ? 'O resultado desta cobrança está incerto. Nenhuma nova emissão foi feita.'
            : 'Esta parcela já tem reserva Bolepix v2.',
      };
    }
  }
  const claimed = preparedAttempt
    ? await claimPreparedBolepixAttempt(admin, companyId, clean(integration.id), installmentId)
    : await claimUnsentBolepixReservation(admin, companyId, clean(integration.id), installmentId);
  if (!claimed) {
    return {
      emitted: false,
      reused: false,
      duplicate: true,
      needsReconciliation: false,
      bankSlipId: null,
      digitableLine: null,
      barCode: null,
      pixCopyPaste: null,
      bolepixSpecInRepo: C6_BOLEPIX_OFFICIAL_SPEC_IN_REPO,
      amount,
      dueDate,
      installmentId,
      companyId,
      message: 'Outra emissão desta parcela já está em andamento.',
    };
  }
  let created;
  try {
    created = await postC6BolepixV2Charge({
      companyId,
      integrationId: clean(integration.id),
      receiptId: installmentId,
      activationGranted,
      environment,
      input: {
        environment,
        externalReferenceId: bolepixReference,
        amount,
        dueDate,
        description: `Parcela ${clean(receipt.installment_number) || ''}`.trim().slice(0, 100),
        payer: {
          name: payer.name,
          taxId: payer.documentDigits,
          email: clean(customer.email) || undefined,
          address: addressLine,
          neighborhood: clean(customer.neighborhood),
          city: clean(customer.city),
          state,
          zipCode: zip,
        },
        pixKey: prepared.pixKey,
      },
      fetchFn: options?.fetchFn,
      allowSimulatedHttp: options?.allowSimulatedHttp,
      credentials,
      requestFn: options?.transportRequest,
      now: options?.now,
    });
  } catch (error) {
    if (preparedAttempt) {
      await releasePreparedBolepixAttempt(admin, companyId, clean(integration.id), installmentId);
    } else {
      await releaseUnsentBolepixReservation(admin, companyId, clean(integration.id), installmentId);
    }
    throw error;
  }
  const finished = completionForC6BolepixV2({
    disposition: created.disposition,
    httpStatus: created.httpStatus,
    chargeId: created.fields?.id,
  });
  if (finished.automaticRetry) {
    throw new Error('Uma emissão incerta não pode ser repetida.');
  }
  if (preparedAttempt) {
    await admin.rpc('complete_c6_bolepix_attempt', {
      p_company_id: companyId,
      p_integration_id: integration.id,
      p_external_reference_id: bolepixReference,
      p_status: finished.status,
      p_http_status: created.httpStatus,
      p_c6_charge_id: finished.chargeId,
      p_bank_diagnostic: null,
    });
  } else {
    await admin.rpc('complete_c6_bolepix', {
      p_company_id: companyId,
      p_integration_id: integration.id,
      p_external_reference_id: bolepixReference,
      p_status: finished.status,
      p_http_status: created.httpStatus,
      p_c6_charge_id: finished.chargeId,
      p_retry_allowed: finished.retryAllowed,
    });
  }
  if (!preparedAttempt && finished.status === 'SUCCEEDED' && created.responseBody) {
    const official = officialC6BolepixFromResponse({
      companyId,
      integrationId: clean(integration.id),
      financeReceiptId: installmentId,
      body: created.responseBody,
    });
    const reservationRow = await admin
      .from('c6_bolepix_reservations')
      .select('id')
      .eq('company_id', companyId)
      .eq('finance_receipt_id', installmentId)
      .maybeSingle();
    if (
      reservationRow.data?.id &&
      official.externalReferenceId &&
      ['CREATED', 'PAID', 'CANCELED', 'WAITING_CONFIRMATION'].includes(String(official.bankStatus || ''))
    ) {
      await admin.from('c6_bolepix_official').insert({
        reservation_id: reservationRow.data.id,
        company_id: companyId,
        integration_id: integration.id,
        finance_receipt_id: installmentId,
        c6_id: official.c6Id,
        external_reference_id: official.externalReferenceId,
        digitable_line: official.digitableLine,
        bar_code: official.barCode,
        our_number: official.ourNumber,
        pix_copy_paste: official.pixCopyPaste,
        pix_qr_image: official.pixQrImage,
        pix_mime_type: official.pixMimeType,
        pix_reference: official.pixReference,
        pdf_path: official.pdfPath,
        pdf_sha256: official.pdfSha256,
        bank_status: official.bankStatus,
        settlement_method: null,
        billing_type: official.billingType,
        billing_scheme: official.billingScheme,
        amount: official.amount,
        due_date: official.dueDate,
      });
    }
  }
  const stage = created.transportCode
    ? 'transport'
    : created.httpStatus === 401 || created.httpStatus === 403
      ? 'bank_slip_authorization'
      : 'bank_slip_post';
  const bankDiagnostic = captureC6BankDiagnostic({
    httpStatus: created.httpStatus,
    contentType: created.contentType,
    bodyText: created.bodyText,
    stage,
    externalReference: bolepixReference,
    traceId: created.traceId,
  });
  const described = describeC6BolepixV2Outcome({
    status: finished.status,
    httpStatus: created.httpStatus,
    chargeId: finished.chargeId,
    transportCode: created.transportCode || null,
    bankCode: bankDiagnostic.code,
    bankMessage: bankDiagnostic.message,
  });
  if (described.kind !== 'succeeded') {
    console.info(
      JSON.stringify({
        source: 'c6_bolepix_v2',
        stage: bankDiagnostic.stage,
        httpStatus: bankDiagnostic.httpStatus,
        contentType: bankDiagnostic.contentType,
        bankCode: bankDiagnostic.code,
        message: bankDiagnostic.message,
        details: bankDiagnostic.details,
        fields: bankDiagnostic.fields,
        recordedAt: bankDiagnostic.recordedAt,
        externalReference: bankDiagnostic.externalReference,
        traceId: bankDiagnostic.traceId,
      }),
    );
  }
  return {
    emitted: finished.status === 'SUCCEEDED',
    reused: false,
    duplicate: false,
    needsReconciliation: finished.status === 'UNKNOWN',
    bankSlipId: finished.chargeId,
    digitableLine: created.fields?.digitableLine || null,
    barCode: created.fields?.barCode || null,
    pixCopyPaste: created.fields?.pixCopyPaste || null,
    bolepixSpecInRepo: C6_BOLEPIX_OFFICIAL_SPEC_IN_REPO,
    amount,
    dueDate,
    installmentId,
    companyId,
    message: described.message,
    outcome: described.kind,
    httpStatus: created.httpStatus,
    bankCode: bankDiagnostic.code,
    stage,
    externalReference: bolepixReference,
    traceId: bankDiagnostic.traceId,
    bankDiagnostic,
  };
}

async function loadBolepixV2Reference(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
): Promise<{ reference: string; environment: BankEnvironment; integrationId: string } | null> {
  const { data, error } = await admin
    .from('c6_bolepix_reservations')
    .select('external_reference_id, environment, integration_id, status')
    .eq('company_id', companyId)
    .eq('finance_receipt_id', installmentId)
    .maybeSingle();
  if (error) {
    const message = String(error.message || '');
    if (/c6_bolepix_reservations|does not exist|schema cache|Could not find the table/i.test(message)) return null;
    throw new Error('Não foi possível verificar a reserva Bolepix.');
  }
  const reference = clean(data?.external_reference_id);
  const environment = clean(data?.environment).toUpperCase();
  if (!reference || (environment !== 'SANDBOX' && environment !== 'PRODUCTION')) return null;
  if (clean(data?.status).toUpperCase() !== 'SUCCEEDED') return null;
  return {
    reference,
    environment: environment as BankEnvironment,
    integrationId: clean(data?.integration_id),
  };
}

async function consultOwnedBolepix(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
  options: C6InstallmentChargeOptions | undefined,
  pdf: boolean,
  missingMessage: string,
) {
  const bolepix = await loadBolepixV2Reference(admin, companyId, installmentId);
  if (!bolepix) throw new Error(missingMessage);
  if (simulated(options)) {
    if (!c6BolepixV2MayCallBank(companyId, bolepix.integrationId, true)) {
      throw new C6BolepixV2LiveDisabledError();
    }
    const result = pdf
      ? await executeC6BolepixV2Pdf({
          environment: bolepix.environment,
          externalReferenceId: bolepix.reference,
          fetchFn: options?.fetchFn,
          allowSimulatedHttp: options?.allowSimulatedHttp,
        })
      : await executeC6BolepixV2Get({
          environment: bolepix.environment,
          externalReferenceId: bolepix.reference,
          fetchFn: options?.fetchFn,
          allowSimulatedHttp: options?.allowSimulatedHttp,
        });
    return { result, integrationId: bolepix.integrationId };
  }
  const supplied = options?.credentials;
  if (supplied && (supplied.companyId !== companyId || supplied.integrationId !== bolepix.integrationId)) {
    throw new Error('Integração de outra empresa.');
  }
  const secrets =
    supplied || (await loadC6SecretsForGrantedOperation(admin, companyId, 'connection'));
  if (
    !secrets ||
    secrets.integrationId !== bolepix.integrationId ||
    secrets.environment !== bolepix.environment
  ) {
    throw new Error('Integração de outra empresa.');
  }
  const result = await readC6BolepixV2Charge({
    companyId,
    integrationId: bolepix.integrationId,
    environment: bolepix.environment,
    externalReferenceId: bolepix.reference,
    pdf,
    ownedByCompany: true,
    credentials: {
      companyId,
      integrationId: bolepix.integrationId,
      environment: secrets.environment,
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      certificatePem: secrets.certificatePem,
      privateKeyPem: secrets.privateKeyPem,
    },
  });
  return { result, integrationId: bolepix.integrationId };
}

export async function consultC6BolepixSituation(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
  options?: C6InstallmentChargeOptions,
): Promise<{
  consulted: true;
  emitted: false;
  settled: false;
  emissionBlocked: true;
  referenceReusable: false;
  titleFound: boolean;
  httpStatus: number | null;
  bankStatus: string | null;
  bankId: string | null;
  externalReference: string;
  message: string;
  bankDiagnostic: C6BankDiagnostic;
}> {
  await loadReceipt(admin, companyId, installmentId);
  const { data: reservation, error } = await admin
    .from('c6_bolepix_reservations')
    .select('company_id, integration_id, finance_receipt_id, external_reference_id, environment, status')
    .eq('company_id', companyId)
    .eq('finance_receipt_id', installmentId)
    .maybeSingle();
  if (error) throw new Error('Não foi possível verificar a reserva Bolepix.');
  const reference = clean(reservation?.external_reference_id);
  const environment = clean(reservation?.environment).toUpperCase();
  const integrationId = clean(reservation?.integration_id);
  if (!reservation || !reference || (environment !== 'SANDBOX' && environment !== 'PRODUCTION')) {
    throw new Error('Parcela sem reserva Bolepix desta empresa.');
  }
  const { data: account, error: accountError } = await admin
    .from('finance_receipts')
    .select('financial_account_id')
    .eq('id', installmentId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (accountError) throw new Error(accountError.message);
  const { data: financial, error: financialError } = await admin
    .from('company_financial_accounts')
    .select('id, company_id, bank_integration_id')
    .eq('id', clean(account?.financial_account_id))
    .eq('company_id', companyId)
    .maybeSingle();
  if (financialError) throw new Error(financialError.message);
  if (clean(financial?.bank_integration_id) !== integrationId) {
    throw new Error('Integração de outra empresa.');
  }
  const simulatedCall = simulated(options);
  const supplied = options?.credentials;
  if (supplied && (supplied.companyId !== companyId || supplied.integrationId !== integrationId)) {
    throw new Error('Integração de outra empresa.');
  }
  const secrets = simulatedCall
    ? null
    : supplied || (await loadC6SecretsForIntegration(admin, companyId, integrationId));
  if (!simulatedCall && (!secrets || secrets.integrationId !== integrationId || secrets.environment !== environment)) {
    throw new Error('Integração de outra empresa.');
  }
  let result;
  try {
    result = await readC6BolepixV2Charge({
    companyId,
    integrationId,
    environment: environment as BankEnvironment,
    externalReferenceId: reference,
    pdf: false,
    allowSimulatedHttp: options?.allowSimulatedHttp,
    fetchFn: options?.fetchFn,
    ownedByCompany: true,
    credentials: secrets
      ? {
          companyId,
          integrationId,
          environment: secrets.environment,
          clientId: secrets.clientId,
          clientSecret: secrets.clientSecret,
          certificatePem: secrets.certificatePem,
          privateKeyPem: secrets.privateKeyPem,
        }
      : supplied || null,
  });
  } catch (error) {
    if (error instanceof C6BolepixV2LiveDisabledError) throw error;
    const bankDiagnostic = captureC6BankDiagnostic({
      httpStatus: null,
      stage: 'bank_slip_get',
      externalReference: reference,
      bodyText: '',
    });
    return {
      consulted: true,
      emitted: false,
      settled: false,
      emissionBlocked: true,
      referenceReusable: false,
      titleFound: false,
      httpStatus: null,
      bankStatus: null,
      bankId: null,
      externalReference: reference,
      message: 'O C6 não respondeu à consulta. Nova emissão permanece bloqueada.',
      bankDiagnostic,
    };
  }
  const raw = result as typeof result & {
    bodyText?: string;
    contentType?: string | null;
    traceId?: string | null;
  };
  const bankDiagnostic = captureC6BankDiagnostic({
    httpStatus: result.httpStatus,
    contentType: raw.contentType,
    bodyText: raw.bodyText || (result.responseBody ? JSON.stringify(result.responseBody) : ''),
    stage: 'bank_slip_get',
    externalReference: reference,
    traceId: raw.traceId,
  });
  const bankId = clean(result.fields?.id) || null;
  const titleFound = result.httpStatus === 200 && Boolean(bankId);
  const http = result.httpStatus;
  const message =
    titleFound
      ? 'O C6 localizou o título. Nova emissão bloqueada até a reconciliação.'
      : http === 404
        ? 'O C6 não localizou o título. A referência não foi autorizada para reutilização.'
        : http === 401 || http === 403
          ? `O C6 não autorizou a consulta (HTTP ${http}).`
          : http != null && http >= 500
            ? `O C6 não confirmou a consulta (HTTP ${http}). Nova emissão permanece bloqueada.`
            : http == null
              ? 'O C6 não respondeu à consulta. Nova emissão permanece bloqueada.'
              : bankDiagnostic.message || `O C6 respondeu HTTP ${http}.`;
  return {
    consulted: true,
    emitted: false,
    settled: false,
    emissionBlocked: true,
    referenceReusable: false,
    titleFound,
    httpStatus: http,
    bankStatus: clean(result.fields?.status) || null,
    bankId,
    externalReference: reference,
    message,
    bankDiagnostic,
  };
}

export async function queryC6InstallmentBoleto(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
  options?: C6InstallmentChargeOptions,
): Promise<{
  slip: ReturnType<typeof readOfficialC6BankSlip>;
  settlement: C6SettlementResult | null;
  bolepix?: { writesFinance: false; settleCash: boolean; message: string };
}> {
  await loadReceipt(admin, companyId, installmentId);
  const charge = await existingCharge(admin, companyId, installmentId);
  const bankSlipId = clean(charge?.external_id);
  if (!charge || !bankSlipId) {
    const owned = await consultOwnedBolepix(
      admin,
      companyId,
      installmentId,
      options,
      false,
      'Parcela sem boleto C6.',
    );
    const decision = reconcileC6BolepixV2Query({
      status: owned.result.fields?.status,
      billingType: owned.result.fields?.billingType,
      payments: readC6BolepixV2Payments(owned.result.responseBody),
      companyId,
      integrationId: owned.integrationId,
      receiptId: installmentId,
      expectedCompanyId: companyId,
      expectedIntegrationId: owned.integrationId,
      expectedReceiptId: installmentId,
    });
    return { slip: null, settlement: null, bolepix: decision };
  }
  const emissionActivated = simulated(options) || (await isC6EmissionActivated(admin, companyId));
  if (!emissionActivated) {
    throw new C6EmissionNotHomologatedError();
  }
  if (clean(charge.company_id) !== companyId) throw new Error('Cobrança de outra empresa.');

  const secrets =
    options?.credentials ||
    (await loadC6SecretsForGrantedOperation(admin, companyId, 'emission'));
  if (!secrets) throw new Error('Credenciais C6 ausentes para esta empresa.');
  const result = await executeC6BankSlipGet(
    {
      companyId,
      integrationId: clean(charge.integration_id),
      environment: secrets.environment,
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      certificatePem: secrets.certificatePem,
      privateKeyPem: secrets.privateKeyPem,
    },
    bankSlipId,
    {
      companyId,
      allowSimulatedHttp: options?.allowSimulatedHttp,
      fetchFn: options?.fetchFn,
      authFetchFn: options?.authFetchFn,
      emissionActivated,
    },
  );
  const slip = readOfficialC6BankSlip(result.evidence.responseBody);
  if (!slip) throw new Error('Consulta C6 sem o contrato oficial do boleto.');
  const settlement =
    String(slip.status || '').toUpperCase() === 'PAID'
      ? await settleC6PaidSlip(admin, { companyId, charge, slip })
      : null;
  return { slip, settlement };
}

export async function fetchC6InstallmentPdf(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
  options?: C6InstallmentChargeOptions,
): Promise<{ ok: boolean; httpStatus: number | null; bytes: Buffer | null }> {
  const charge = await existingCharge(admin, companyId, installmentId);
  const bankSlipId = clean(charge?.external_id);
  if (!charge || !bankSlipId || clean(charge.company_id) !== companyId) {
    const owned = await consultOwnedBolepix(
      admin,
      companyId,
      installmentId,
      options,
      true,
      'Parcela sem boleto C6 desta empresa.',
    );
    return {
      ok: owned.result.ok && Boolean(owned.result.pdfBody?.startsWith('%PDF')),
      httpStatus: owned.result.httpStatus,
      bytes:
        owned.result.ok && owned.result.pdfBody?.startsWith('%PDF')
          ? Buffer.from(owned.result.pdfBody, 'latin1')
          : null,
    };
  }
  const emissionActivated = simulated(options) || (await isC6EmissionActivated(admin, companyId));
  if (!emissionActivated) {
    throw new C6EmissionNotHomologatedError();
  }
  const secrets =
    options?.credentials ||
    (await loadC6SecretsForGrantedOperation(admin, companyId, 'emission'));
  if (!secrets) throw new Error('Credenciais C6 ausentes para esta empresa.');
  const result = await executeC6BankSlipPdf(
    {
      companyId,
      environment: secrets.environment,
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      certificatePem: secrets.certificatePem,
      privateKeyPem: secrets.privateKeyPem,
    },
    bankSlipId,
    {
      companyId,
      allowSimulatedHttp: options?.allowSimulatedHttp,
      fetchFn: options?.fetchFn,
      authFetchFn: options?.authFetchFn,
      emissionActivated,
    },
  );
  return {
    ok: result.ok && Boolean(result.pdfBuffer?.length),
    httpStatus: result.httpStatus,
    bytes: result.ok ? result.pdfBuffer || null : null,
  };
}
