/**
 * Emissão de cobranças Inter Cobrança V3 → bank_charges.
 * Isolado de company_asaas_charges / Asaas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createInterCobranca,
  fetchInterCobrancaByCodigo,
  pollInterCobrancaUntilReady,
  cancelInterCobranca,
  type InterCobrancaDetail,
  type InterCreateCobrancaInput,
} from '@/lib/banking/inter/interCobrancaClient';
import { isInterSituacaoRecebido, mapInterSituacaoToBankStatus } from '@/lib/banking/inter/interStatus';
import { settleInterPaidCharge } from '@/lib/banking/inter/interPaymentSettlement';
import { loadInterSecretsForServer } from '@/lib/banking/inter/interConfigRepository';
import type { InterOAuthCredentials, InterOAuthFetchFn } from '@/lib/banking/inter/interOAuthClient';
import { resolveCustomerDocumentDigits } from '@/lib/customerIdentity';
import { isValidBrazilianTaxDocument } from '@/lib/inputMasks';
import {
  COMPANY_ASAAS_FINE_PERCENT,
  COMPANY_ASAAS_INTEREST_PERCENT_MONTHLY,
} from '@/lib/finance/asaasCompanyLateFees';
import {
  planGenerateMissingCharges,
  SALE_CHARGES_GENERATE_BATCH_LIMIT,
  type MissingChargeInstallmentPreview,
} from '@/lib/finance/generateMissingSaleChargesPlan';
import { resolveSaleChargesProvider } from '@/lib/finance/saleChargesProvider';
import {
  buildSaleChargesSummaryFromRows,
  type SaleChargeInstallmentRow,
  type SaleChargesSummary,
} from '@/lib/finance/saleChargesShared';
import { loadSaleContext, loadSaleScopedInstallments } from '@/lib/finance/saleChargesService';

const ACTIVE_BANK_CHARGE_STATUSES = new Set([
  'PENDING',
  'REGISTERED',
  'OVERDUE',
  'PAID',
]);

export function buildInterChargeIdempotencyKey(
  companyId: string,
  financeReceiptId: string,
): string {
  return `INTER:${companyId}:${financeReceiptId}`;
}

export { mapInterSituacaoToBankStatus } from '@/lib/banking/inter/interStatus';

function onlyDigits(v: unknown): string {
  return String(v || '').replace(/\D/g, '');
}

function buildPagadorFromCustomer(customer: Record<string, unknown>): InterCreateCobrancaInput['pagador'] {
  const doc = resolveCustomerDocumentDigits({
    cpf_cnpj: customer.cpf_cnpj as string | null,
    document: customer.document as string | null,
  });
  if (!isValidBrazilianTaxDocument(doc)) {
    throw new Error(
      `Cadastro incompleto: informe CPF/CNPJ de "${String(customer.name || 'Cliente')}" antes de emitir no Inter.`,
    );
  }
  const cep = onlyDigits(customer.cep || customer.zip_code);
  const cidade = String(customer.city || '').trim();
  const uf = String(customer.state_uf || customer.state || '')
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const endereco = String(customer.address || '').trim();
  if (!endereco || cep.length !== 8 || !cidade || uf.length !== 2) {
    throw new Error(
      `Endereço incompleto do cliente "${String(customer.name || '')}". Informe endereço, cidade, UF e CEP para emitir no Inter.`,
    );
  }
  const phone = onlyDigits(customer.phone);
  return {
    cpfCnpj: doc,
    tipoPessoa: doc.length === 14 ? 'JURIDICA' : 'FISICA',
    nome: String(customer.name || '').trim().slice(0, 100),
    email: customer.email ? String(customer.email).trim() : undefined,
    endereco: endereco.slice(0, 100),
    numero: 'S/N',
    bairro: String(customer.neighborhood || 'NAO INFORMADO').trim().slice(0, 60) || 'NAO INFORMADO',
    cidade: cidade.slice(0, 60),
    uf,
    cep,
    ddd: phone.length >= 10 ? phone.slice(0, 2) : undefined,
    telefone: phone.length >= 10 ? phone.slice(2, 11) : undefined,
  };
}

export async function findActiveInterBankChargeForReceipt(
  admin: SupabaseClient,
  companyId: string,
  financeReceiptId: string,
): Promise<Record<string, unknown> | null> {
  const idem = buildInterChargeIdempotencyKey(companyId, financeReceiptId);
  const { data: byIdem } = await admin
    .from('bank_charges')
    .select('*')
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .eq('idempotency_key', idem)
    .maybeSingle();
  if (byIdem?.id) {
    const ext = String(byIdem.external_id || '').trim();
    if (ext || ACTIVE_BANK_CHARGE_STATUSES.has(String(byIdem.status))) {
      return byIdem as Record<string, unknown>;
    }
  }

  const { data: byReceipt } = await admin
    .from('bank_charges')
    .select('*')
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .eq('finance_receipt_id', financeReceiptId)
    .in('status', ['PENDING', 'REGISTERED', 'OVERDUE', 'PAID'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (byReceipt as Record<string, unknown>) || null;
}

export async function listInterChargesForInstallments(
  admin: SupabaseClient,
  companyId: string,
  installmentIds: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!installmentIds.length) return map;
  const { data, error } = await admin
    .from('bank_charges')
    .select('*')
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .in('finance_receipt_id', installmentIds);
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    const rid = String(row.finance_receipt_id || '');
    if (!rid) continue;
    const prev = map.get(rid);
    if (!prev) {
      map.set(rid, row as Record<string, unknown>);
      continue;
    }
    // prefer active over cancelled
    const prevActive = ACTIVE_BANK_CHARGE_STATUSES.has(String(prev.status));
    const curActive = ACTIVE_BANK_CHARGE_STATUSES.has(String(row.status));
    if (curActive && !prevActive) map.set(rid, row as Record<string, unknown>);
  }
  return map;
}

export function bankChargeToSummaryLike(
  row: Record<string, unknown>,
  companyId: string,
): import('@/lib/finance/companyAsaasChargeTypes').CompanyAsaasChargeResponse {
  const statusRaw = String(row.status || '').toUpperCase();
  const status =
    statusRaw === 'PAID'
      ? 'PAID'
      : statusRaw === 'CANCELLED'
        ? 'CANCELLED'
        : statusRaw === 'EXPIRED'
          ? 'EXPIRED'
          : statusRaw === 'FAILED'
            ? 'FAILED'
            : statusRaw === 'REGISTERED'
              ? 'REGISTERED'
              : 'PENDING';
  return {
    id: String(row.id),
    companyId,
    customerId: row.customer_id ? String(row.customer_id) : null,
    saleId: row.sale_id ? String(row.sale_id) : null,
    installmentId: String(row.finance_receipt_id || ''),
    asaasPaymentId: String(row.external_id || ''),
    billingType: 'BOLETO',
    status: status as import('@/lib/finance/companyAsaasChargeTypes').CompanyAsaasChargeStatus,
    value: Number(row.amount || 0),
    dueDate: String(row.due_date || ''),
    invoiceUrl: null,
    bankSlipUrl: null,
    bankSlipIdentification: (row.digitable_line as string) || null,
    pixQrCode: (row.pix_qr_code as string) || null,
    pixCopyPaste: (row.pix_copy_paste as string) || null,
    financialAccountId: null,
    paymentLink: null,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    nossoNumero: (row.our_number as string) || null,
    barCode: (row.barcode as string) || null,
    invoiceNumber: (() => {
      const meta =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      const seu = String(meta.seuNumero || '').trim();
      return seu || null;
    })(),
    asaasRemoteStatus: String((row.metadata as Record<string, unknown>)?.interSituacao || status),
  };
}

function asMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function interBankChargeMissingArtifacts(row: Record<string, unknown>): boolean {
  return !(
    String(row.digitable_line || '').trim() &&
    String(row.barcode || '').trim() &&
    String(row.pix_copy_paste || '').trim() &&
    String(row.our_number || '').trim() &&
    String(row.txid || '').trim()
  );
}

export function buildInterBankChargeArtifactPatch(
  existing: Record<string, unknown>,
  detail: InterCobrancaDetail,
): Record<string, unknown> {
  const prevMeta = asMeta(existing.metadata);
  const existingPaid = String(existing.status || '').toUpperCase() === 'PAID';
  const nextStatus = existingPaid
    ? 'PAID'
    : mapInterSituacaoToBankStatus(detail.situacao);
  return {
    status: nextStatus,
    our_number: detail.nossoNumero || existing.our_number || null,
    txid: detail.txid || existing.txid || null,
    barcode: detail.codigoBarras || existing.barcode || null,
    digitable_line: detail.linhaDigitavel || existing.digitable_line || null,
    pix_copy_paste: detail.pixCopiaECola || existing.pix_copy_paste || null,
    metadata: {
      ...prevMeta,
      codigoSolicitacao:
        detail.codigoSolicitacao || prevMeta.codigoSolicitacao || existing.external_id,
      seuNumero: detail.seuNumero || prevMeta.seuNumero || null,
      interSituacao: detail.situacao || prevMeta.interSituacao || null,
      lastMaterializedAt: new Date().toISOString(),
      interArtifacts: {
        codigoBarras: detail.codigoBarras || null,
        linhaDigitavel: detail.linhaDigitavel || null,
        pixCopiaECola: detail.pixCopiaECola || null,
        nossoNumero: detail.nossoNumero || null,
        txid: detail.txid || null,
        seuNumero: detail.seuNumero || null,
      },
    },
    updated_at: new Date().toISOString(),
  };
}

async function loadInterCredsForIntegration(
  admin: SupabaseClient,
  companyId: string,
  integrationId: string | null | undefined,
  financialAccountId?: string | null,
): Promise<InterOAuthCredentials> {
  const secrets = await loadInterSecretsForServer(admin, companyId, {
    integrationId: integrationId || null,
    financialAccountId: financialAccountId || null,
  });
  if (!secrets) throw new Error('Credenciais Inter ausentes para esta conta financeira.');
  return {
    companyId,
    integrationId: secrets.integrationId,
    environment: secrets.environment,
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
    certificatePem: secrets.certificatePem,
    privateKeyPem: secrets.privateKeyPem,
  };
}

async function loadInterCredsForCompany(
  admin: SupabaseClient,
  companyId: string,
): Promise<InterOAuthCredentials> {
  return loadInterCredsForIntegration(admin, companyId, null);
}

/**
 * GET-only: materializa artefatos na linha bank_charges já existente.
 * Nunca cria cobrança Inter nem insere outro bank_charges.
 */
export async function refreshInterChargeArtifacts(
  admin: SupabaseClient,
  input: {
    companyId: string;
    installmentId?: string | null;
    externalId?: string | null;
    fetchFn?: InterOAuthFetchFn;
    detail?: InterCobrancaDetail | null;
  },
): Promise<{
  charge: import('@/lib/finance/companyAsaasChargeTypes').CompanyAsaasChargeResponse;
  reused: true;
  created: false;
  bankChargeId: string;
  externalId: string;
  inserted: false;
  paid?: boolean;
  receiptUpdated?: boolean;
  receiptStatus?: string | null;
  receiptPaidAt?: string | null;
  receiptPaidAmount?: number | null;
}> {
  const companyId = String(input.companyId || '').trim();
  const installmentId = String(input.installmentId || '').trim();
  let externalId = String(input.externalId || '').trim();

  let existing: Record<string, unknown> | null = null;
  if (externalId) {
    const { data, error } = await admin
      .from('bank_charges')
      .select('*')
      .eq('company_id', companyId)
      .eq('provider', 'INTER')
      .eq('external_id', externalId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    existing = (data as Record<string, unknown>) || null;
  }
  if (!existing && installmentId) {
    existing = await findActiveInterBankChargeForReceipt(admin, companyId, installmentId);
  }
  if (!existing?.id) {
    throw new Error(
      'Cobrança Inter local não encontrada. Nenhuma nova cobrança será emitida.',
    );
  }
  externalId = String(existing.external_id || externalId || '').trim();
  if (!externalId) {
    throw new Error(
      'Cobrança Inter sem external_id. Nenhuma nova cobrança será emitida.',
    );
  }

  const detail =
    input.detail ||
    (await fetchInterCobrancaByCodigo(
      await loadInterCredsForIntegration(
        admin,
        companyId,
        existing.integration_id ? String(existing.integration_id) : null,
        existing.financial_account_id ? String(existing.financial_account_id) : null,
      ),
      externalId,
      { fetchFn: input.fetchFn },
    ));

  const patch = buildInterBankChargeArtifactPatch(existing, detail);
  const { data: updated, error: updateErr } = await admin
    .from('bank_charges')
    .update(patch)
    .eq('id', existing.id)
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .select('*')
    .maybeSingle();
  if (updateErr) throw new Error(updateErr.message);

  const row = (updated as Record<string, unknown>) || { ...existing, ...patch };

  let paid = String(row.status || '').toUpperCase() === 'PAID';
  let receiptUpdated = false;
  let receiptStatus: string | null = null;
  let receiptPaidAt: string | null = null;
  let receiptPaidAmount: number | null = null;
  if (isInterSituacaoRecebido(detail.situacao)) {
    const settled = await settleInterPaidCharge(admin, {
      companyId,
      charge: row,
      detail,
    });
    paid = settled.paid;
    receiptUpdated = settled.receiptUpdated;
    receiptStatus = settled.receiptStatus;
    receiptPaidAt = settled.receiptPaidAt;
    receiptPaidAmount = settled.receiptPaidAmount;
    if (paid) {
      row.status = 'PAID';
    }
  }

  return {
    charge: bankChargeToSummaryLike(row, companyId),
    reused: true,
    created: false,
    inserted: false,
    paid,
    receiptUpdated,
    receiptStatus,
    receiptPaidAt,
    receiptPaidAmount,
    bankChargeId: String(row.id),
    externalId,
  };
}

export async function getInterSaleChargesSummary(
  admin: SupabaseClient,
  companyId: string,
  saleId: string,
): Promise<SaleChargesSummary & { chargeProvider: 'INTER' }> {
  const installments = await loadSaleScopedInstallments(admin, companyId, saleId);
  const ctx = await loadSaleContext(admin, companyId, saleId);
  const providerInfo = await resolveSaleChargesProvider(admin, companyId, saleId);
  if (providerInfo.provider !== 'INTER') {
    throw new Error('Conta financeira desta venda não está vinculada ao Banco Inter.');
  }

  const secrets = await loadInterSecretsForServer(admin, companyId, {
    integrationId: providerInfo.bankIntegrationId,
    financialAccountId: providerInfo.financialAccountId,
  });
  const interConfigured = Boolean(secrets?.clientId && secrets.clientSecret);

  const chargeMap = await listInterChargesForInstallments(
    admin,
    companyId,
    installments.map((i) => i.id),
  );

  const charges = [...chargeMap.values()].map((row) => bankChargeToSummaryLike(row, companyId));

  const summary = buildSaleChargesSummaryFromRows({
    saleId,
    companyId,
    installments,
    charges,
    context: {
      customerName: ctx.customerName,
      customerEmail: ctx.customerEmail,
      customerPhone: ctx.customerPhone,
      projectName: ctx.projectName,
      quadra: ctx.quadra,
      lote: ctx.lote,
      lotLabel: ctx.lotLabel || (ctx.quadra && ctx.lote ? `QD ${ctx.quadra} — LT ${ctx.lote}` : null),
      contractNumber: ctx.contractNumber,
      financialAccountId: providerInfo.financialAccountId,
    },
    financialAccountName: providerInfo.financialAccountName,
    hasFinancialAccount: Boolean(providerInfo.financialAccountId),
    financialAccountBlockReason: interConfigured
      ? null
      : 'Configure e verifique as credenciais do Banco Inter.',
    installmentCorrectionType: ctx.installmentCorrectionType,
  });

  // providerInfo.financialAccountName já vem com "— Banco Inter"
  const issuedMaterialized = charges.filter(
    (c) =>
      Boolean(String(c.asaasPaymentId || '').trim()) &&
      c.status !== 'CANCELLED' &&
      c.status !== 'FAILED' &&
      c.status !== 'EXPIRED',
  );
  const carneOverride =
    issuedMaterialized.length >= 1
      ? {
          carneReady: true as const,
          carneBlockReason:
            summary.chargesMissing > 0
              ? `${issuedMaterialized.length} de ${summary.totalInstallments} parcelas com cobrança emitida.`
              : summary.carneBlockReason,
          uiState:
            summary.uiState === 'none' || summary.uiState === 'partial'
              ? summary.chargesMissing > 0
                ? ('partial' as const)
                : ('carne_ready' as const)
              : summary.uiState,
        }
      : {};

  return {
    ...summary,
    ...carneOverride,
    chargeProvider: 'INTER' as const,
    financialAccountName: providerInfo.financialAccountName || summary.financialAccountName,
  };
}

export type GenerateInterMissingResult = {
  saleId: string;
  batchLimit: number;
  requested: number;
  processed: number;
  created: number;
  reused: number;
  skipped: number;
  errors: Array<{ installmentId: string; message: string }>;
  remainingMissing: number;
  progressDone: number;
  progressTotal: number;
  chargeProvider: 'INTER';
};

export async function createInterInstallmentCharge(
  admin: SupabaseClient,
  input: {
    companyId: string;
    installmentId: string;
    userId?: string | null;
    fetchFn?: InterOAuthFetchFn;
    pollOptions?: {
      maxAttempts?: number;
      initialDelayMs?: number;
      sleepFn?: (ms: number) => Promise<void>;
    };
  },
): Promise<{ chargeId: string; codigoSolicitacao: string; reused: boolean; artifactsReady?: boolean }> {
  const existing = await findActiveInterBankChargeForReceipt(
    admin,
    input.companyId,
    input.installmentId,
  );
  if (existing?.id) {
    const codigo = String(existing.external_id || '').trim();
    if (codigo && interBankChargeMissingArtifacts(existing)) {
      try {
        const refreshed = await refreshInterChargeArtifacts(admin, {
          companyId: input.companyId,
          installmentId: input.installmentId,
          externalId: codigo,
          fetchFn: input.fetchFn,
        });
        return {
          chargeId: refreshed.bankChargeId,
          codigoSolicitacao: refreshed.externalId,
          reused: true,
          artifactsReady: Boolean(
            refreshed.charge.bankSlipIdentification ||
              refreshed.charge.barCode ||
              refreshed.charge.pixCopyPaste ||
              refreshed.charge.nossoNumero,
          ),
        };
      } catch {
        /* reuso sem reemitir mesmo se GET falhar */
      }
    }
    return {
      chargeId: String(existing.id),
      codigoSolicitacao: codigo,
      reused: true,
      artifactsReady: !interBankChargeMissingArtifacts(existing),
    };
  }

  const { data: receipt, error: receiptErr } = await admin
    .from('finance_receipts')
    .select(
      `
      id, company_id, tenant_id, sale_id, customer_id, project_id, financial_account_id,
      installment_number, due_date, amount, status,
      customers!finance_receipts_customer_id_fkey(
        name, cpf_cnpj, document, email, phone, address, neighborhood, city, state, state_uf, cep, zip_code
      )
    `,
    )
    .eq('id', input.installmentId)
    .maybeSingle();
  if (receiptErr) throw new Error(receiptErr.message);
  if (!receipt) throw new Error('Parcela não encontrada.');
  const rowCompany = String(receipt.company_id || receipt.tenant_id || '');
  if (rowCompany && rowCompany !== input.companyId) {
    throw new Error('Parcela não pertence a esta empresa.');
  }
  if (String(receipt.status || '').toLowerCase() === 'pago') {
    throw new Error('Parcela já está paga.');
  }

  const saleId = String(receipt.sale_id || '');
  const resolved = await resolveSaleChargesProvider(admin, input.companyId, saleId);
  if (resolved.provider !== 'INTER' || !resolved.bankIntegrationId) {
    throw new Error('Conta financeira não vinculada ao Banco Inter.');
  }

  const secrets = await loadInterSecretsForServer(admin, input.companyId, {
    integrationId: resolved.bankIntegrationId,
    financialAccountId: resolved.financialAccountId,
  });
  if (!secrets) throw new Error('Credenciais Inter ausentes para esta conta financeira.');

  const creds: InterOAuthCredentials = {
    companyId: input.companyId,
    integrationId: secrets.integrationId,
    environment: secrets.environment,
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
    certificatePem: secrets.certificatePem,
    privateKeyPem: secrets.privateKeyPem,
  };

  const customerRaw = receipt.customers as
    | Record<string, unknown>
    | Record<string, unknown>[]
    | null;
  const customer = (Array.isArray(customerRaw) ? customerRaw[0] : customerRaw) || {};
  const pagador = buildPagadorFromCustomer(customer as Record<string, unknown>);
  const amount = Number(receipt.amount || 0);
  if (!(amount > 0)) throw new Error('Valor da parcela inválido.');
  const dueDate = String(receipt.due_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('Vencimento inválido.');

  const seuNumero = onlyDigits(String(receipt.installment_number ?? '') + input.installmentId.replace(/-/g, ''))
    .slice(-15) || input.installmentId.replace(/-/g, '').slice(0, 15);

  const createPayload: InterCreateCobrancaInput = {
    seuNumero,
    valorNominal: Math.round(amount * 100) / 100,
    dataVencimento: dueDate,
    numDiasAgenda: 60,
    pagador,
    formasRecebimento: ['BOLETO', 'PIX'],
    multa: { codigo: 'PERCENTUAL', taxa: COMPANY_ASAAS_FINE_PERCENT },
    mora: { codigo: 'TAXAMENSAL', taxa: COMPANY_ASAAS_INTEREST_PERCENT_MONTHLY },
  };

  const created = await createInterCobranca(creds, createPayload, { fetchFn: input.fetchFn });
  const idempotencyKey = buildInterChargeIdempotencyKey(input.companyId, input.installmentId);
  const now = new Date().toISOString();
  const insertRow = {
    company_id: input.companyId,
    integration_id: resolved.bankIntegrationId,
    financial_account_id: resolved.financialAccountId || null,
    finance_receipt_id: input.installmentId,
    sale_id: saleId || null,
    customer_id: receipt.customer_id || null,
    charge_type: 'BOLETO_PIX',
    provider: 'INTER',
    environment: secrets.environment,
    external_id: created.codigoSolicitacao,
    our_number: null,
    txid: null,
    amount,
    due_date: dueDate,
    status: 'PENDING',
    barcode: null,
    digitable_line: null,
    pix_copy_paste: null,
    idempotency_key: idempotencyKey,
    metadata: {
      codigoSolicitacao: created.codigoSolicitacao,
      seuNumero,
      interSituacao: 'EM_PROCESSAMENTO',
      createRaw: created.raw,
      providerLabel: 'Banco Inter',
    },
    created_by: input.userId || null,
    created_at: now,
    updated_at: now,
  };

  const { data: inserted, error: insertErr } = await admin
    .from('bank_charges')
    .insert(insertRow)
    .select('id')
    .single();

  if (insertErr) {
    if (String(insertErr.code) === '23505' || /duplicate/i.test(insertErr.message)) {
      const again = await findActiveInterBankChargeForReceipt(
        admin,
        input.companyId,
        input.installmentId,
      );
      if (again?.id) {
        try {
          await refreshInterChargeArtifacts(admin, {
            companyId: input.companyId,
            installmentId: input.installmentId,
            externalId: String(again.external_id || created.codigoSolicitacao),
            fetchFn: input.fetchFn,
          });
        } catch {
          /* GET-only best-effort */
        }
        return {
          chargeId: String(again.id),
          codigoSolicitacao: String(again.external_id || created.codigoSolicitacao),
          reused: true,
        };
      }
    }
    throw new Error(insertErr.message);
  }

  const polled = await pollInterCobrancaUntilReady(creds, created.codigoSolicitacao, {
    fetchFn: input.fetchFn,
    maxAttempts: input.pollOptions?.maxAttempts ?? 6,
    initialDelayMs: input.pollOptions?.initialDelayMs ?? 800,
    sleepFn: input.pollOptions?.sleepFn,
  });

  try {
    await refreshInterChargeArtifacts(admin, {
      companyId: input.companyId,
      installmentId: input.installmentId,
      externalId: created.codigoSolicitacao,
      fetchFn: input.fetchFn,
      detail: polled,
    });
  } catch {
    /* external_id já persistido; artefatos podem chegar via Atualizar dados */
  }

  return {
    chargeId: String(inserted.id),
    codigoSolicitacao: created.codigoSolicitacao,
    reused: false,
    artifactsReady: Boolean(
      polled.linhaDigitavel || polled.codigoBarras || polled.pixCopiaECola || polled.nossoNumero,
    ),
  };
}

export async function generateMissingInterSaleChargesBatch(
  admin: SupabaseClient,
  params: {
    companyId: string;
    saleId: string;
    userId?: string | null;
    limit?: number;
    confirmed: boolean;
    fetchFn?: InterOAuthFetchFn;
    pollOptions?: {
      maxAttempts?: number;
      initialDelayMs?: number;
      sleepFn?: (ms: number) => Promise<void>;
    };
  },
): Promise<GenerateInterMissingResult> {
  if (params.confirmed !== true) {
    throw new Error('Confirmação obrigatória.');
  }

  const providerInfo = await resolveSaleChargesProvider(
    admin,
    params.companyId,
    params.saleId,
  );
  if (providerInfo.provider !== 'INTER') {
    throw new Error('Conta financeira desta venda não está vinculada ao Banco Inter.');
  }

  const installments = await loadSaleScopedInstallments(admin, params.companyId, params.saleId);
  const chargeMap = await listInterChargesForInstallments(
    admin,
    params.companyId,
    installments.map((i) => i.id),
  );
  for (const [installmentId, row] of chargeMap.entries()) {
    if (!interBankChargeMissingArtifacts(row as Record<string, unknown>)) continue;
    const codigo = String((row as Record<string, unknown>).external_id || '').trim();
    if (!codigo) continue;
    try {
      await refreshInterChargeArtifacts(admin, {
        companyId: params.companyId,
        installmentId,
        externalId: codigo,
        fetchFn: params.fetchFn,
      });
    } catch {
      /* GET-only; não reemite */
    }
  }

  const afterRefresh = await getInterSaleChargesSummary(admin, params.companyId, params.saleId);
  const limit = Math.min(
    Math.max(1, Number(params.limit || SALE_CHARGES_GENERATE_BATCH_LIMIT)),
    SALE_CHARGES_GENERATE_BATCH_LIMIT,
  );
  const plan = planGenerateMissingCharges({
    missingOrdered: afterRefresh.missingInstallments,
    quantityRequested: limit,
  });
  const batch = plan.selected;

  let created = 0;
  let reused = 0;
  let skipped = 0;
  const errors: Array<{ installmentId: string; message: string }> = [];

  for (const item of batch) {
    const installmentId = item.id;
    try {
      const result = await createInterInstallmentCharge(admin, {
        companyId: params.companyId,
        installmentId,
        userId: params.userId,
        fetchFn: params.fetchFn,
        pollOptions: params.pollOptions,
      });
      if (result.reused) reused += 1;
      else created += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao emitir Inter.';
      if (/já está paga/i.test(message)) {
        skipped += 1;
        continue;
      }
      errors.push({ installmentId, message });
    }
  }

  const after = await getInterSaleChargesSummary(admin, params.companyId, params.saleId);
  return {
    saleId: params.saleId,
    batchLimit: limit,
    requested: batch.length,
    processed: batch.length,
    created,
    reused,
    skipped,
    errors,
    remainingMissing: after.chargesMissing,
    progressDone: after.chargesGenerated,
    progressTotal: after.eligibleInstallments,
    chargeProvider: 'INTER',
  };
}

export type { MissingChargeInstallmentPreview };

export async function refreshInterSaleCharges(
  admin: SupabaseClient,
  params: {
    companyId: string;
    saleId: string;
    fetchFn?: InterOAuthFetchFn;
  },
): Promise<{ refreshed: number; paidSettled: number; errors: string[] }> {
  const installments = await loadSaleScopedInstallments(admin, params.companyId, params.saleId);
  const chargeMap = await listInterChargesForInstallments(
    admin,
    params.companyId,
    installments.map((i) => i.id),
  );
  let refreshed = 0;
  let paidSettled = 0;
  const errors: string[] = [];
  for (const [installmentId, row] of chargeMap.entries()) {
    const codigo = String((row as Record<string, unknown>).external_id || '').trim();
    if (!codigo) continue;
    try {
      const result = await refreshInterChargeArtifacts(admin, {
        companyId: params.companyId,
        installmentId,
        externalId: codigo,
        fetchFn: params.fetchFn,
      });
      refreshed += 1;
      if (result.paid) paidSettled += 1;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { refreshed, paidSettled, errors };
}

/**
 * Cancela uma cobrança Inter da empresa (não é ReleaseLot).
 * Motivo padrão ACERTOS. Recusa paga. Idempotente se já CANCELLED.
 */
export async function cancelInterInstallmentCharge(
  admin: SupabaseClient,
  input: {
    companyId: string;
    chargeId: string;
    fetchFn?: InterOAuthFetchFn;
  },
): Promise<{ ok: true; reused: boolean; chargeId: string; status: string }> {
  const companyId = String(input.companyId || '').trim();
  const chargeId = String(input.chargeId || '').trim();
  if (!companyId || !chargeId) {
    throw new Error('companyId e chargeId obrigatórios.');
  }
  const { data, error } = await admin
    .from('bank_charges')
    .select(
      'id, company_id, provider, status, external_id, financial_account_id, integration_id, metadata',
    )
    .eq('id', chargeId)
    .eq('company_id', companyId)
    .eq('provider', 'INTER')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Cobrança Inter não encontrada nesta empresa.');
  const status = String(data.status || '').toUpperCase();
  if (status === 'PAID') {
    throw new Error('Cobrança já paga — cancelamento não permitido.');
  }
  if (status === 'CANCELLED' || status === 'EXPIRED' || status === 'FAILED') {
    return { ok: true, reused: true, chargeId, status };
  }
  const codigo = String(data.external_id || '').trim();
  if (!codigo) {
    throw new Error('Cobrança Inter sem identificador remoto.');
  }
  const secrets = await loadInterSecretsForServer(admin, companyId, {
    integrationId: data.integration_id ? String(data.integration_id) : null,
    financialAccountId: data.financial_account_id
      ? String(data.financial_account_id)
      : null,
  });
  if (!secrets) {
    throw new Error('Credenciais Inter ausentes para esta conta financeira.');
  }
  const creds: InterOAuthCredentials = {
    companyId,
    integrationId: secrets.integrationId,
    environment: secrets.environment,
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
    certificatePem: secrets.certificatePem,
    privateKeyPem: secrets.privateKeyPem,
  };
  await cancelInterCobranca(creds, codigo, {
    fetchFn: input.fetchFn,
    motivoCancelamento: 'ACERTOS',
  });
  const prevMeta =
    data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  const updated = await admin
    .from('bank_charges')
    .update({
      status: 'CANCELLED',
      metadata: {
        ...prevMeta,
        interSituacao: 'CANCELADO',
        lotSwapCancelledAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', chargeId)
    .eq('company_id', companyId)
    .select('status')
    .maybeSingle();
  if (updated.error) throw new Error(updated.error.message);
  return {
    ok: true,
    reused: false,
    chargeId,
    status: String(updated.data?.status || 'CANCELLED'),
  };
}
