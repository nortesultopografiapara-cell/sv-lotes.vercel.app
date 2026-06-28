import type { SupabaseClient } from '@supabase/supabase-js';
import type { BankEnvironment } from '@/lib/banking/types';
import {
  getCompanyAsaasIntegrationConfig,
  loadAsaasApiKeyForEnvironment,
} from './asaasIntegrationRepository';
import {
  asaasCompanyCancelPayment,
  asaasCompanyCreatePayment,
  asaasCompanyFindOrCreateCustomer,
  asaasCompanyGetPayment,
} from './asaasCompanyClient';
import {
  getCompanyAsaasChargeByPaymentId,
  getLatestCompanyAsaasChargeForInstallment,
  insertCompanyAsaasCharge,
  listPendingCompanyAsaasCharges,
  updateCompanyAsaasCharge,
} from './companyAsaasChargeRepository';
import {
  type CreateCompanyInstallmentChargeInput,
  type CompanyAsaasChargeResponse,
  isCompanyAsaasIntegrationReady,
  mapAsaasPaymentStatusToCompanyCharge,
} from './companyAsaasChargeTypes';

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
  customers?: { name?: string; cpf?: string; cnpj?: string; email?: string } | null;
  sales?: { contracts?: Array<{ contract_number?: string }> } | null;
};

export class CompanyAsaasIntegrationInactiveError extends Error {
  constructor(message = 'Integração Asaas Company não está ativa para esta empresa.') {
    super(message);
    this.name = 'CompanyAsaasIntegrationInactiveError';
  }
}

async function resolveCompanyAsaasCredentials(
  admin: SupabaseClient,
  companyId: string,
): Promise<{ apiKey: string; environment: BankEnvironment; integrationId: string }> {
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
    .select(
      'id, company_id, tenant_id, sale_id, customer_id, installment_number, due_date, amount, status, customers(name, cpf, cnpj, email), sales: sale_id(contracts(contract_number))',
    )
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
  return String(customer?.cpf || customer?.cnpj || '').replace(/\D/g, '');
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
  if (
    existing &&
    existing.billingType === billingType &&
    ['PENDING', 'REGISTERED', 'OVERDUE'].includes(existing.status)
  ) {
    return existing;
  }

  const dueDate = String(installment.due_date || '').split('T')[0];
  const customerName = installment.customers?.name || 'Cliente';
  const customerId = await asaasCompanyFindOrCreateCustomer(apiKey, environment, {
    name: customerName,
    cpfCnpj: resolvePayerDocument(installment.customers),
    email: installment.customers?.email || undefined,
    externalReference: input.companyId,
  });

  const { payment, pixQrCode, pixCopyPaste } = await asaasCompanyCreatePayment(
    apiKey,
    environment,
    {
      customerId,
      billingType,
      value: Number(installment.amount),
      dueDate,
      description: buildChargeDescription(installment),
      externalReference: input.installmentId,
    },
  );

  if (!payment.id) throw new Error('Asaas Company não retornou cobrança.');

  return insertCompanyAsaasCharge(admin, {
    companyId: input.companyId,
    customerId: installment.customer_id,
    saleId: installment.sale_id,
    installmentId: input.installmentId,
    asaasPaymentId: payment.id,
    billingType,
    status: mapAsaasPaymentStatusToCompanyCharge(payment.status),
    value: Number(installment.amount),
    dueDate,
    invoiceUrl: payment.invoiceUrl ?? null,
    bankSlipUrl: payment.bankSlipUrl ?? null,
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
  const payment = await asaasCompanyGetPayment(
    apiKey,
    environment,
    (data as { asaas_payment_id: string }).asaas_payment_id,
  );

  return updateCompanyAsaasCharge(admin, chargeId, companyId, {
    status: mapAsaasPaymentStatusToCompanyCharge(payment.status),
    invoiceUrl: payment.invoiceUrl ?? null,
    bankSlipUrl: payment.bankSlipUrl ?? null,
    rawPayload: payment as Record<string, unknown>,
    paidAt:
      mapAsaasPaymentStatusToCompanyCharge(payment.status) === 'PAID'
        ? payment.paymentDate || payment.clientPaymentDate || new Date().toISOString()
        : null,
  });
}

export async function getCompanyChargeStatusByInstallment(
  admin: SupabaseClient,
  companyId: string,
  installmentId: string,
): Promise<CompanyAsaasChargeResponse | null> {
  const charge = await getLatestCompanyAsaasChargeForInstallment(admin, companyId, installmentId);
  if (!charge) return null;
  if (charge.status === 'PAID' || charge.status === 'CANCELLED') return charge;
  return getCompanyChargeStatus(admin, companyId, charge.id);
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
  options?: { paidAt?: string | null; userId?: string | null },
): Promise<{ ok: boolean; duplicate: boolean; chargeId?: string; cashMovementId?: string }> {
  const charge = await getCompanyAsaasChargeByPaymentId(admin, companyId, asaasPaymentId);
  if (!charge) return { ok: false, duplicate: false };

  if (charge.status === 'PAID' && charge.paidAt) {
    return { ok: true, duplicate: true, chargeId: charge.id, cashMovementId: undefined };
  }

  const paidAt = options?.paidAt || new Date().toISOString();
  const updatedCharge = await updateCompanyAsaasCharge(admin, charge.id, companyId, {
    status: 'PAID',
    paidAt,
  });

  const { data: receipt } = await admin
    .from('finance_receipts')
    .select('id, status, amount, installment_number, sale_id, customer_id, block_id, project_id, sales: sale_id(contracts(contract_number))')
    .eq('id', charge.installmentId)
    .maybeSingle();

  if (!receipt) {
    return { ok: true, duplicate: false, chargeId: charge.id };
  }

  const receiptStatus = String((receipt as { status?: string }).status || '').toLowerCase();
  if (receiptStatus !== 'pago' && receiptStatus !== 'paid') {
    const { error: receiptError } = await admin
      .from('finance_receipts')
      .update({
        status: 'pago',
        paid_amount: charge.value,
        paid_at: paidAt,
      })
      .eq('id', charge.installmentId);
    if (receiptError) throw new Error(receiptError.message);
  }

  const { data: existingMovement } = await admin
    .from('cash_movements')
    .select('id')
    .eq('company_id', companyId)
    .eq('source_table', 'company_asaas_charges')
    .eq('source_id', charge.id)
    .eq('status', 'ativo')
    .maybeSingle();

  if (existingMovement?.id) {
    await updateCompanyAsaasCharge(admin, charge.id, companyId, {
      cashMovementId: existingMovement.id as string,
    });
    return {
      ok: true,
      duplicate: true,
      chargeId: charge.id,
      cashMovementId: existingMovement.id as string,
    };
  }

  const contractNo =
    (receipt as { sales?: { contracts?: Array<{ contract_number?: string }> } }).sales?.contracts?.[0]
      ?.contract_number || 'S/N';
  const installmentNumber = (receipt as { installment_number?: number }).installment_number ?? 1;

  const { data: movement, error: movementError } = await admin
    .from('cash_movements')
    .insert({
      tenant_id: companyId,
      company_id: companyId,
      type: 'entrada',
      category: 'Venda de Lote',
      description: `Pagamento Asaas — Parcela ${installmentNumber} - CT ${contractNo}`,
      amount: charge.value,
      customer_id: charge.customerId,
      sale_id: charge.saleId,
      finance_receipt_id: charge.installmentId,
      movement_date: paidAt.split('T')[0],
      source_table: 'company_asaas_charges',
      source_id: charge.id,
      status: 'ativo',
      created_by: options?.userId ?? null,
    })
    .select('id')
    .single();

  if (movementError) throw new Error(movementError.message);

  await updateCompanyAsaasCharge(admin, charge.id, companyId, {
    cashMovementId: movement.id as string,
  });

  console.info('[company-asaas-charge] parcela baixada via webhook', {
    companyId,
    chargeId: updatedCharge.id,
    installmentId: charge.installmentId,
    asaasPaymentId: charge.asaasPaymentId,
  });

  return {
    ok: true,
    duplicate: false,
    chargeId: charge.id,
    cashMovementId: movement.id as string,
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
