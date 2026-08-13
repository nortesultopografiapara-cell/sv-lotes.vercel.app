/**
 * Emissão de cobranças Inter Cobrança V3 → bank_charges.
 * Isolado de company_asaas_charges / Asaas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createInterCobranca,
  pollInterCobrancaUntilReady,
  type InterCreateCobrancaInput,
} from '@/lib/banking/inter/interCobrancaClient';
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

export function mapInterSituacaoToBankStatus(situacao: string): string {
  const s = String(situacao || '').toUpperCase();
  if (s === 'RECEBIDO' || s === 'PAGO') return 'PAID';
  if (s === 'CANCELADO') return 'CANCELLED';
  if (s === 'EXPIRADO') return 'EXPIRED';
  if (s === 'A_RECEBER') return 'REGISTERED';
  if (s === 'EM_PROCESSAMENTO') return 'PENDING';
  return 'PENDING';
}

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
  if (byIdem?.id && ACTIVE_BANK_CHARGE_STATUSES.has(String(byIdem.status))) {
    return byIdem as Record<string, unknown>;
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

async function listInterChargesForInstallments(
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

function bankChargeToSummaryLike(
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
    pixQrCode: null,
    pixCopyPaste: (row.pix_copy_paste as string) || null,
    financialAccountId: null,
    paymentLink: null,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    nossoNumero: (row.our_number as string) || null,
    barCode: (row.barcode as string) || null,
    asaasRemoteStatus: String((row.metadata as Record<string, unknown>)?.interSituacao || status),
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

  const secrets = await loadInterSecretsForServer(admin, companyId);
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
  return {
    ...summary,
    chargeProvider: 'INTER' as const,
    financialAccountName: providerInfo.financialAccountName || summary.financialAccountName,
    carneReady: false,
    carneBlockReason:
      'Carnê PDF Inter ainda não está disponível nesta fase (somente emissão/consulta).',
    uiState:
      summary.uiState === 'carne_ready'
        ? summary.chargesMissing > 0
          ? 'partial'
          : 'complete'
        : summary.uiState,
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
): Promise<{ chargeId: string; codigoSolicitacao: string; reused: boolean }> {
  const existing = await findActiveInterBankChargeForReceipt(
    admin,
    input.companyId,
    input.installmentId,
  );
  if (existing?.id) {
    return {
      chargeId: String(existing.id),
      codigoSolicitacao: String(existing.external_id || ''),
      reused: true,
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

  const secrets = await loadInterSecretsForServer(admin, input.companyId);
  if (!secrets) throw new Error('Credenciais Inter ausentes.');

  const creds: InterOAuthCredentials = {
    companyId: input.companyId,
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
  const polled = await pollInterCobrancaUntilReady(creds, created.codigoSolicitacao, {
    fetchFn: input.fetchFn,
    maxAttempts: input.pollOptions?.maxAttempts ?? 6,
    initialDelayMs: input.pollOptions?.initialDelayMs ?? 800,
    sleepFn: input.pollOptions?.sleepFn,
  });

  const idempotencyKey = buildInterChargeIdempotencyKey(input.companyId, input.installmentId);
  const now = new Date().toISOString();
  const insertRow = {
    company_id: input.companyId,
    integration_id: resolved.bankIntegrationId,
    finance_receipt_id: input.installmentId,
    sale_id: saleId || null,
    customer_id: receipt.customer_id || null,
    charge_type: 'BOLETO_PIX',
    provider: 'INTER',
    environment: secrets.environment,
    external_id: created.codigoSolicitacao,
    our_number: polled.nossoNumero || null,
    txid: polled.txid || null,
    amount,
    due_date: dueDate,
    status: mapInterSituacaoToBankStatus(polled.situacao),
    barcode: polled.codigoBarras || null,
    digitable_line: polled.linhaDigitavel || null,
    pix_copy_paste: polled.pixCopiaECola || null,
    idempotency_key: idempotencyKey,
    metadata: {
      codigoSolicitacao: created.codigoSolicitacao,
      seuNumero,
      interSituacao: polled.situacao,
      createRaw: created.raw,
      pollRaw: {
        situacao: polled.situacao,
        nossoNumero: polled.nossoNumero,
        linhaDigitavel: polled.linhaDigitavel,
        codigoBarras: polled.codigoBarras,
      },
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
        return {
          chargeId: String(again.id),
          codigoSolicitacao: String(again.external_id || created.codigoSolicitacao),
          reused: true,
        };
      }
    }
    throw new Error(insertErr.message);
  }

  return {
    chargeId: String(inserted.id),
    codigoSolicitacao: created.codigoSolicitacao,
    reused: false,
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

  const summary = await getInterSaleChargesSummary(admin, params.companyId, params.saleId);
  const limit = Math.min(
    Math.max(1, Number(params.limit || SALE_CHARGES_GENERATE_BATCH_LIMIT)),
    SALE_CHARGES_GENERATE_BATCH_LIMIT,
  );
  const plan = planGenerateMissingCharges({
    missingOrdered: summary.missingInstallments,
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
