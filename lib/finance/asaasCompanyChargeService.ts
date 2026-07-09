import type { SupabaseClient } from '@supabase/supabase-js';
import type { BankEnvironment } from '@/lib/banking/types';
import {
  getCompanyAsaasIntegrationConfig,
  loadAsaasApiKeyForEnvironment,
} from './asaasIntegrationRepository';
import {
  asaasCompanyCancelPayment,
  asaasCompanyCreatePayment,
  asaasCompanyEnrichPaymentArtifacts,
  asaasCompanyFindOrCreateCustomer,
} from './asaasCompanyClient';
import {
  getCompanyAsaasChargeByPaymentId,
  getLatestCompanyAsaasChargeForInstallment,
  insertCompanyAsaasCharge,
  listPendingCompanyAsaasCharges,
  updateCompanyAsaasCharge,
} from './companyAsaasChargeRepository';
import {
  assertCanCreateCompanyAsaasCharge,
  assertCanRegenerateCompanyAsaasCharge,
  type CompanyAsaasChargeSummary,
  isActiveCompanyAsaasChargeStatus,
} from './companyAsaasChargeWorkflow';
import {
  executeCompanyAsaasPaymentReconciliation,
  ensureCompanyAsaasInstallmentReconciled,
} from './companyAsaasPaymentReconciliation';
import {
  type CreateCompanyInstallmentChargeInput,
  type CompanyAsaasChargeResponse,
  type CompanyAsaasChargeRow,
  isCompanyAsaasIntegrationReady,
  mapAsaasPaymentStatusToCompanyCharge,
} from './companyAsaasChargeTypes';
import {
  resolveAsaasApiBillingType,
  resolveStoredCompanyBillingType,
} from './asaasCompanyLateFees';
import { assertCompanyAsaasEnabled } from './companyAsaasAccess';
import { ASAAS_BOLETO_MIN_AMOUNT } from '@/lib/saasMasterConfig';
import { FINANCE_RECEIPTS_CHARGE_SELECT } from './financeReceiptsEmbed';
import {
  isValidBrazilianTaxDocument,
  resolveCustomerDocumentDigits,
  type CustomerRecord,
} from '@/lib/customerIdentity';

type InstallmentRow = {
  id: string;
  company_id?: string | null;
  tenant_id?: string | null;
  sale_id: string | null;
  customer_id: string | null;
  installment_number: number | null;
  due_date: string;
  amount: number;
  status: string;
  customers?: Pick<CustomerRecord, 'name' | 'cpf_cnpj' | 'document' | 'email' | 'phone'> | null;
  sales?: { contracts?: Array<{ contract_number?: string }> } | null;
};

export class CompanyAsaasIntegrationInactiveError extends Error {
  constructor(message = 'Integração Asaas Company não está ativa para esta empresa.') {
    super(message);
    this.name = 'CompanyAsaasIntegrationInactiveError';
  }
}

export class CompanyAsaasChargePaidError extends Error {
  constructor(message = 'Esta parcela já foi paga.') {
    super(message);
    this.name = 'CompanyAsaasChargePaidError';
  }
}

export class CompanyAsaasCustomerDocumentMissingError extends Error {
  constructor(message = 'Complete o CPF/CNPJ do cliente antes de gerar a cobrança Asaas.') {
    super(message);
    this.name = 'CompanyAsaasCustomerDocumentMissingError';
  }
}

async function resolveCompanyAsaasCredentials(
  admin: SupabaseClient,
  companyId: string,
): Promise<{ apiKey: string; environment: BankEnvironment; integrationId: string }> {
  assertCompanyAsaasEnabled(companyId);
  const config = await getCompanyAsaasIntegrationConfig(admin, companyId);
  if (!isCompanyAsaasIntegrationReady(config)) {
    throw new CompanyAsaasIntegrationInactiveError();
  }
  const apiKey = await loadAsaasApiKeyForEnvironment(admin, companyId, config.environment);
  if (!apiKey) {
    throw new CompanyAsaasIntegrationInactiveError('API Key Asaas Company não configurada.');
  }
  if (!config.id) throw new CompanyAsaasIntegrationInactiveError();
  return { apiKey, environment: config.environment, integrationId: config.id };
}

async function loadInstallment(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
): Promise<InstallmentRow> {
  const { data, error } = await admin
    .from('finance_receipts')
    .select(FINANCE_RECEIPTS_CHARGE_SELECT)
    .eq('id', installmentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Parcela não encontrada.');

  const row = data as InstallmentRow;
  const rowCompanyId = row.company_id || row.tenant_id;
  if (rowCompanyId && rowCompanyId !== companyId) {
    throw new Error('Parcela não pertence a esta empresa.');
  }

  const status = String(row.status || '').toLowerCase();
  if (status === 'pago' || status === 'paid') {
    throw new Error('Parcela já está paga.');
  }

  return row;
}

function resolvePayerDocument(customer: InstallmentRow['customers']): string {
  return resolveCustomerDocumentDigits(customer);
}

function assertPayerDocumentPresent(customer: InstallmentRow['customers']): string {
  const doc = resolvePayerDocument(customer);
  if (!isValidBrazilianTaxDocument(doc)) {
    const customerName = customer?.name?.trim() || 'Cliente';
    throw new CompanyAsaasCustomerDocumentMissingError(
      `Cadastro incompleto: informe o CPF ou CNPJ de "${customerName}" em Clientes antes de gerar a cobrança Asaas.`,
    );
  }
  return doc;
}

function buildChargeDescription(installment: InstallmentRow): string {
  const contractNo = installment.sales?.contracts?.[0]?.contract_number || 'S/N';
  const parcel =
    installment.installment_number === 0 ? 'Entrada' : `Parcela ${installment.installment_number ?? 1}`;
  return `${parcel} — Contrato ${contractNo}`;
}

export async function createCompanyInstallmentCharge(
  admin: SupabaseClient,
  input: CreateCompanyInstallmentChargeInput,
): Promise<CompanyAsaasChargeResponse> {
  if (input.billingType === 'PIX') {
    return createCompanyPixCharge(admin, input);
  }
  return createCompanyBoletoCharge(admin, input);
}

export async function createCompanyPixCharge(
  admin: SupabaseClient,
  input: CreateCompanyInstallmentChargeInput,
): Promise<CompanyAsaasChargeResponse> {
  return createCompanyChargeWithBillingType(admin, input, 'PIX');
}

export async function createCompanyBoletoCharge(
  admin: SupabaseClient,
  input: CreateCompanyInstallmentChargeInput,
): Promise<CompanyAsaasChargeResponse> {
  return createCompanyChargeWithBillingType(admin, input, 'BOLETO');
}

async function createCompanyChargeWithBillingType(
  admin: SupabaseClient,
  input: CreateCompanyInstallmentChargeInput,
  billingType: 'PIX' | 'BOLETO',
): Promise<CompanyAsaasChargeResponse> {
  const { apiKey, environment } = await resolveCompanyAsaasCredentials(admin, input.companyId);
  const installment = await loadInstallment(admin, input.companyId, input.installmentId);

  const existing = await getLatestCompanyAsaasChargeForInstallment(
    admin,
    input.companyId,
    input.installmentId,
  );
  try {
    const reusable = assertCanCreateCompanyAsaasCharge(existing);
    if (reusable) return reusable;
  } catch (err) {
    if (err instanceof Error && err.message === 'Esta parcela já foi paga.') {
      throw new CompanyAsaasChargePaidError(err.message);
    }
    throw err;
  }

  const amount = Number(installment.amount);
  const asaasBillingType = resolveAsaasApiBillingType(billingType);
  if (asaasBillingType !== 'PIX' && amount < ASAAS_BOLETO_MIN_AMOUNT) {
    throw new Error(
      `O valor mínimo para cobrança com boleto é R$ ${ASAAS_BOLETO_MIN_AMOUNT.toFixed(2).replace('.', ',')}.`,
    );
  }

  const dueDate = String(installment.due_date || '').split('T')[0];
  const customerName = installment.customers?.name || 'Cliente';
  const payerDocument = assertPayerDocumentPresent(installment.customers);
  const customerId = await asaasCompanyFindOrCreateCustomer(apiKey, environment, {
    name: customerName,
    cpfCnpj: payerDocument,
    email: installment.customers?.email || undefined,
    externalReference: input.companyId,
  });

  const { payment, pixQrCode, pixCopyPaste, bankSlipIdentification } =
    await asaasCompanyCreatePayment(apiKey, environment, {
      customerId,
      billingType: asaasBillingType,
      value: amount,
      dueDate,
      description: buildChargeDescription(installment),
      externalReference: input.installmentId,
    });

  if (!payment.id) throw new Error('Asaas Company não retornou cobrança.');

  const storedBillingType = resolveStoredCompanyBillingType(billingType, payment.billingType);

  return insertCompanyAsaasCharge(admin, {
    companyId: input.companyId,
    customerId: installment.customer_id,
    saleId: installment.sale_id,
    installmentId: input.installmentId,
    asaasPaymentId: payment.id,
    billingType: storedBillingType,
    status: mapAsaasPaymentStatusToCompanyCharge(payment.status),
    value: amount,
    dueDate,
    invoiceUrl: payment.invoiceUrl ?? null,
    bankSlipUrl: payment.bankSlipUrl ?? null,
    bankSlipIdentification,
    pixQrCode: pixQrCode || null,
    pixCopyPaste: pixCopyPaste || null,
    rawPayload: payment as Record<string, unknown>,
  });
}

export async function getCompanyChargeStatus(
  admin: SupabaseClient,
  companyId: string,
  chargeId: string,
): Promise<CompanyAsaasChargeResponse> {
  const { data, error } = await admin
    .from('company_asaas_charges')
    .select('*')
    .eq('id', chargeId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Cobrança não encontrada.');

  const { apiKey, environment } = await resolveCompanyAsaasCredentials(admin, companyId);
  const existingRow = data as CompanyAsaasChargeRow;
  const enriched = await asaasCompanyEnrichPaymentArtifacts(
    apiKey,
    environment,
    existingRow.asaas_payment_id,
    {
      billingType: existingRow.billing_type,
      existingPixCopy: existingRow.pix_copy_paste,
    },
  );
  const payment = enriched.payment;

  const mappedStatus = mapAsaasPaymentStatusToCompanyCharge(payment.status);
  const updated = await updateCompanyAsaasCharge(admin, chargeId, companyId, {
    status: mappedStatus,
    invoiceUrl: payment.invoiceUrl ?? existingRow.invoice_url ?? null,
    bankSlipUrl: payment.bankSlipUrl ?? existingRow.bank_slip_url ?? null,
    bankSlipIdentification:
      enriched.bankSlipIdentification ?? existingRow.bank_slip_identification ?? null,
    pixQrCode: enriched.pixQrCode || existingRow.pix_qr_code || null,
    pixCopyPaste: enriched.pixCopyPaste || existingRow.pix_copy_paste || null,
    rawPayload: payment as Record<string, unknown>,
    paidAt:
      mappedStatus === 'PAID'
        ? payment.paymentDate || payment.clientPaymentDate || new Date().toISOString()
        : null,
  });

  if (mappedStatus === 'PAID') {
    const paidAt =
      payment.paymentDate || payment.clientPaymentDate || new Date().toISOString();
    await ensureCompanyAsaasInstallmentReconciled(admin, companyId, updated.installmentId, {
      asaasPaymentId: payment.id || (data as { asaas_payment_id: string }).asaas_payment_id,
      eventType: 'MANUAL_STATUS_SYNC',
      paidAt,
      paymentPayload: payment as Record<string, unknown>,
      paymentDate: payment.paymentDate ?? null,
      creditedDate: payment.creditDate ?? payment.estimatedCreditDate ?? null,
    });
    const refreshed = await getLatestCompanyAsaasChargeForInstallment(
      admin,
      companyId,
      updated.installmentId,
    );
    return refreshed ?? updated;
  }

  return updated;
}

export async function getCompanyChargeStatusByInstallment(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
): Promise<CompanyAsaasChargeResponse | null> {
  const charge = await getLatestCompanyAsaasChargeForInstallment(admin, companyId, installmentId);
  if (!charge) return null;
  if (charge.status === 'CANCELLED') return charge;

  if (charge.status === 'PAID') {
    await ensureCompanyAsaasInstallmentReconciled(admin, companyId, installmentId, {
      asaasPaymentId: charge.asaasPaymentId,
      eventType: 'INSTALLMENT_RECONCILE_PREFETCH',
      paidAt: charge.paidAt,
    });
  }

  try {
    return await getCompanyChargeStatus(admin, companyId, charge.id);
  } catch (err) {
    if (charge.status === 'PAID') {
      await ensureCompanyAsaasInstallmentReconciled(admin, companyId, installmentId, {
        asaasPaymentId: charge.asaasPaymentId,
        eventType: 'MANUAL_STATUS_SYNC_FALLBACK',
        paidAt: charge.paidAt,
      });
      return (
        (await getLatestCompanyAsaasChargeForInstallment(admin, companyId, installmentId)) ??
        charge
      );
    }
    throw err;
  }
}

export async function regenerateCompanyInstallmentCharge(
  admin: SupabaseClient,
  input: CreateCompanyInstallmentChargeInput,
): Promise<CompanyAsaasChargeResponse> {
  const existing = await getLatestCompanyAsaasChargeForInstallment(
    admin,
    input.companyId,
    input.installmentId,
  );

  try {
    assertCanRegenerateCompanyAsaasCharge(existing);
  } catch (err) {
    if (err instanceof Error && err.message === 'Esta parcela já foi paga.') {
      throw new CompanyAsaasChargePaidError(err.message);
    }
    throw err;
  }

  if (existing && isActiveCompanyAsaasChargeStatus(existing.status)) {
    await cancelCompanyCharge(admin, input.companyId, existing.id);
  }

  return createCompanyChargeWithBillingType(admin, input, input.billingType);
}

export async function getCompanyAsaasChargeDashboardSummary(
  admin: SupabaseClient,
  companyId: string,
): Promise<CompanyAsaasChargeSummary> {
  const { count, error } = await admin
    .from('company_asaas_charges')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId);

  if (error) throw new Error(error.message);

  const pending = await listPendingCompanyAsaasCharges(admin, companyId);
  return {
    totalCharges: count ?? 0,
    pendingCount: pending.length,
    openValue: pending.reduce((sum, charge) => sum + Number(charge.value || 0), 0),
  };
}

export async function cancelCompanyCharge(
  admin: SupabaseClient,
  companyId: string,
  chargeId: string,
): Promise<CompanyAsaasChargeResponse> {
  const { data, error } = await admin
    .from('company_asaas_charges')
    .select('asaas_payment_id, status')
    .eq('id', chargeId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Cobrança não encontrada.');
  if ((data as { status: string }).status === 'PAID') {
    throw new Error('Cobrança já paga — cancelamento não permitido.');
  }

  const { apiKey, environment } = await resolveCompanyAsaasCredentials(admin, companyId);
  try {
    await asaasCompanyCancelPayment(
      apiKey,
      environment,
      (data as { asaas_payment_id: string }).asaas_payment_id,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes('404') && !msg.toLowerCase().includes('not found')) {
      throw err;
    }
  }

  return updateCompanyAsaasCharge(admin, chargeId, companyId, {
    status: 'CANCELLED',
  });
}

export async function syncCompanyCharges(
  admin: SupabaseClient,
  companyId: string,
): Promise<{ synced: number; updated: number }> {
  await resolveCompanyAsaasCredentials(admin, companyId);
  const pending = await listPendingCompanyAsaasCharges(admin, companyId);
  let updated = 0;
  for (const charge of pending) {
    const refreshed = await getCompanyChargeStatus(admin, companyId, charge.id);
    if (refreshed.status !== charge.status) updated += 1;
  }
  return { synced: pending.length, updated };
}

export async function reconcileCompanyAsaasPaidCharge(
  admin: SupabaseClient,
  companyId: string,
  asaasPaymentId: string,
  options?: {
    paidAt?: string | null;
    userId?: string | null;
    eventType?: string | null;
    paymentDate?: string | null;
    creditedDate?: string | null;
    paymentPayload?: Record<string, unknown> | null;
    installmentId?: string | null;
  },
): Promise<{ ok: boolean; duplicate: boolean; chargeId?: string; cashMovementId?: string }> {
  const result = await executeCompanyAsaasPaymentReconciliation(admin, {
    companyId,
    asaasPaymentId,
    installmentId: options?.installmentId ?? null,
    paidAt: options?.paidAt,
    userId: options?.userId,
    eventType: options?.eventType,
    paymentDate: options?.paymentDate,
    creditedDate: options?.creditedDate,
    paymentPayload: options?.paymentPayload,
  });

  return {
    ok: result.ok,
    duplicate: result.duplicate,
    chargeId: result.chargeId,
    cashMovementId: result.cashMovementId,
  };
}

/** Garante resposta segura — nunca incluir segredos ou raw_payload completo na API pública. */
export function assertCompanyAsaasChargeResponseSafe(response: CompanyAsaasChargeResponse): void {
  const forbidden = ['apiKey', 'access_token', 'encrypted_payload', 'raw_payload'];
  const json = JSON.stringify(response);
  for (const key of forbidden) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Resposta de cobrança expõe campo proibido: ${key}`);
    }
  }
}
