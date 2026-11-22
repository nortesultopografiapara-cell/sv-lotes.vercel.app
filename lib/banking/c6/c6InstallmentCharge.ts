/**
 * Emissão do boleto C6 de uma parcela já existente.
 * Valor e vencimento saem de finance_receipts e não são alterados.
 * HTTP real só ocorre com a concessão de emissão da empresa.
 * Teste simulado exige fetchFn e não usa a rede.
 */

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveChargePayer } from '@/lib/buyerLegalEntity';
import { isC6EmissionActivated } from '@/lib/banking/c6/c6EmissionAuthorization';
import {
  executeC6BankSlipCreate,
  executeC6BankSlipGet,
  executeC6BankSlipPdf,
  type C6BoletoExecuteOptions,
  type C6BoletoFetchFn,
} from '@/lib/banking/c6/c6BoletoClient';
import { C6EmissionNotHomologatedError } from '@/lib/banking/c6/c6EmitGuard';
import type { C6AuthCredentials, C6AuthFetchFn } from '@/lib/banking/c6/c6AuthClient';
import { loadC6SecretsForGrantedOperation } from '@/lib/banking/c6/c6ConfigRepository';
import {
  C6_BOLEPIX_OFFICIAL_SPEC_IN_REPO,
  C6_BOLEPIX_UNAVAILABLE_MESSAGE,
  c6PixCopyPasteFromBankSlip,
} from '@/lib/banking/c6/c6BolepixContract';
import { readOfficialC6BankSlip, settleC6PaidSlip, type C6SettlementResult } from '@/lib/banking/c6/c6PaymentSettlement';
import type { C6BoletoEvidencePublic } from '@/lib/banking/c6/c6BoletoEvidence';
import { buildC6BankSlipCreateBody } from '@/lib/banking/c6/c6BoletoValidation';
import { c6BankRejectionMessage } from '@/lib/banking/c6/c6PublicMessage';
import { classifyC6CreateResponse } from '@/lib/banking/c6/c6CreateOutcome';
import type { BankEnvironment } from '@/lib/banking/types';

export type C6InstallmentEmitResult = {
  emitted: boolean;
  reused: boolean;
  duplicate: boolean;
  needsReconciliation: boolean;
  bankSlipId: string | null;
  digitableLine: string | null;
  barCode: string | null;
  pixCopyPaste: null;
  bolepixSpecInRepo: false;
  amount: number;
  dueDate: string;
  installmentId: string;
  companyId: string;
  message: string;
};

export type C6InstallmentChargeOptions = {
  allowSimulatedHttp?: boolean;
  fetchFn?: C6BoletoFetchFn;
  authFetchFn?: C6AuthFetchFn;
  credentials?: C6AuthCredentials;
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

function missingRetryRpc(error: { code?: string; message?: string } | null): boolean {
  const message = String(error?.message || '');
  return (
    error?.code === 'PGRST202' ||
    error?.code === '42883' ||
    /could not find the function/i.test(message) ||
    /p_retry_allowed/i.test(message)
  );
}

async function completeReservation(
  admin: SupabaseClient,
  args: {
    p_company_id: string;
    p_integration_id: string;
    p_external_reference_id: string;
    p_status: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
    p_http_status: number | null;
    p_c6_bank_slip_id: string | null;
  },
  retryAllowed: boolean,
) {
  if (retryAllowed) {
    const marked = await admin.rpc('complete_c6_boleto', { ...args, p_retry_allowed: true });
    if (!marked.error || !missingRetryRpc(marked.error)) return marked;
  }
  return admin.rpc('complete_c6_boleto', args);
}

function slipField(evidence: C6BoletoEvidencePublic, key: string): string | null {
  const body = evidence.responseBody;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = (body as Record<string, unknown>)[key];
  return value == null || value === '' ? null : String(value);
}

function simulated(options?: C6InstallmentChargeOptions): boolean {
  return options?.allowSimulatedHttp === true && typeof options.fetchFn === 'function';
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
  const emissionActivated = live && (await isC6EmissionActivated(admin, companyId));
  if (live && !emissionActivated) {
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
    .select('id, company_id, bank_integration_id')
    .eq('id', accountId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (accountError) throw new Error(accountError.message);
  if (!account?.bank_integration_id) throw new Error('A parcela não tem conta financeira C6.');

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
    .select('id, company_id, name, cpf_cnpj, document, email, address, address_number, city, state, state_uf, cep, zip_code')
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
  const createInput = {
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
  };
  buildC6BankSlipCreateBody(createInput, options?.now);

  const fingerprint = c6BoletoRequestFingerprint({
    amount,
    dueDate,
    taxId: payer.documentDigits,
    reference,
  });
  const reserved = await admin.rpc('reserve_c6_boleto', {
    p_company_id: companyId,
    p_integration_id: integration.id,
    p_external_reference_id: reference,
    p_request_fingerprint: fingerprint,
  });
  if (reserved.error) throw new Error(reserved.error.message);
  const reservation = (reserved.data || {}) as { accepted?: boolean; reason?: string };
  if (reservation.accepted !== true) {
    return {
      emitted: false,
      reused: false,
      duplicate: true,
      needsReconciliation: reservation.reason === 'needs_reconciliation',
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
        reservation.reason === 'needs_reconciliation'
          ? 'Reserva C6 ambígua. Nova emissão bloqueada até a conciliação.'
          : 'Emissão C6 duplicada bloqueada.',
    };
  }

  const secrets =
    options?.credentials ||
    (await loadC6SecretsForGrantedOperation(admin, companyId, 'emission'));
  if (!secrets) throw new Error('Credenciais C6 ausentes para esta empresa.');
  const creds: C6AuthCredentials = {
    companyId,
    integrationId: integration.id,
    environment,
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
    certificatePem: secrets.certificatePem,
    privateKeyPem: secrets.privateKeyPem,
  };
  const executeOptions: C6BoletoExecuteOptions = {
    companyId,
    allowSimulatedHttp: options?.allowSimulatedHttp,
    fetchFn: options?.fetchFn,
    authFetchFn: options?.authFetchFn,
    now: options?.now,
    emissionActivated,
  };

  let result: Awaited<ReturnType<typeof executeC6BankSlipCreate>>;
  try {
    result = await executeC6BankSlipCreate(creds, createInput, executeOptions);
  } catch (error) {
    await completeReservation(
      admin,
      {
        p_company_id: companyId,
        p_integration_id: integration.id,
        p_external_reference_id: reference,
        p_status: 'UNKNOWN',
        p_http_status: null,
        p_c6_bank_slip_id: null,
      },
      false,
    );
    throw error;
  }

  const httpStatus = result.httpStatus;
  const outcome = classifyC6CreateResponse(httpStatus, result.evidence.responseBody);
  const bankSlipId = outcome.disposition === 'succeeded' ? outcome.bankSlipId : null;
  const status =
    outcome.disposition === 'succeeded'
      ? 'SUCCEEDED'
      : outcome.disposition === 'definitive_rejection'
        ? 'FAILED'
        : 'UNKNOWN';
  const completed = await completeReservation(
    admin,
    {
      p_company_id: companyId,
      p_integration_id: integration.id,
      p_external_reference_id: reference,
      p_status: status,
      p_http_status: httpStatus,
      p_c6_bank_slip_id: outcome.bankSlipId,
    },
    outcome.disposition === 'definitive_rejection',
  );
  if (completed.error) throw new Error(completed.error.message);

  if (receipt.amount !== original.amount || receipt.due_date !== original.dueDate) {
    throw new Error('A emissão C6 alteraria valor ou vencimento da parcela.');
  }

  if (!bankSlipId) {
    return {
      emitted: false,
      reused: false,
      duplicate: false,
      needsReconciliation: outcome.disposition === 'uncertain',
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
        outcome.disposition === 'uncertain'
          ? 'Resposta ambígua do C6. Nenhuma segunda emissão será feita.'
          : c6BankRejectionMessage(result.evidence.responseBody, httpStatus),
    };
  }

  const digitableLine = slipField(result.evidence, 'digitable_line');
  const barCode = slipField(result.evidence, 'bar_code');
  const { error: insertError } = await admin.from('bank_charges').insert({
    company_id: companyId,
    integration_id: integration.id,
    financial_account_id: account.id,
    finance_receipt_id: installmentId,
    sale_id: receipt.sale_id || null,
    customer_id: receipt.customer_id || null,
    charge_type: 'BOLETO',
    provider: 'C6',
    environment: creds.environment,
    external_id: bankSlipId,
    amount,
    due_date: dueDate,
    status: 'REGISTERED',
    barcode: barCode,
    digitable_line: digitableLine,
    pix_copy_paste: null,
    idempotency_key: `C6:${companyId}:${installmentId}`,
    metadata: {
      external_reference_id: reference,
      bolepix: C6_BOLEPIX_UNAVAILABLE_MESSAGE,
    },
  });
  if (insertError) throw new Error(insertError.message);

  return {
    emitted: true,
    reused: false,
    duplicate: false,
    needsReconciliation: false,
    bankSlipId,
    digitableLine,
    barCode,
    pixCopyPaste: null,
    bolepixSpecInRepo: C6_BOLEPIX_OFFICIAL_SPEC_IN_REPO,
    amount,
    dueDate,
    installmentId,
    companyId,
    message: 'Boleto C6 registrado para a parcela.',
  };
}

export async function queryC6InstallmentBoleto(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
  options?: C6InstallmentChargeOptions,
): Promise<{ slip: ReturnType<typeof readOfficialC6BankSlip>; settlement: C6SettlementResult | null }> {
  const emissionActivated = simulated(options) || (await isC6EmissionActivated(admin, companyId));
  if (!emissionActivated) {
    throw new C6EmissionNotHomologatedError();
  }
  await loadReceipt(admin, companyId, installmentId);
  const charge = await existingCharge(admin, companyId, installmentId);
  const bankSlipId = clean(charge?.external_id);
  if (!charge || !bankSlipId) throw new Error('Parcela sem boleto C6.');
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
  const emissionActivated = simulated(options) || (await isC6EmissionActivated(admin, companyId));
  if (!emissionActivated) {
    throw new C6EmissionNotHomologatedError();
  }
  const charge = await existingCharge(admin, companyId, installmentId);
  const bankSlipId = clean(charge?.external_id);
  if (!charge || !bankSlipId || clean(charge.company_id) !== companyId) {
    throw new Error('Parcela sem boleto C6 desta empresa.');
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
