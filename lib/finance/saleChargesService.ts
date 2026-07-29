/**
 * Cobranças Asaas por venda (server) — reutiliza createCompanyInstallmentCharge.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createCompanyInstallmentCharge,
  CompanyAsaasChargePaidError,
  CompanyAsaasCustomerDocumentMissingError,
  CompanyAsaasIntegrationInactiveError,
} from '@/lib/finance/asaasCompanyChargeService';
import {
  listCompanyAsaasChargesForInstallments,
  updateCompanyAsaasCharge,
} from '@/lib/finance/companyAsaasChargeRepository';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  resolveFinancialAccountForInstallment,
  resolveFinancialAccountForSaleOptional,
} from '@/lib/finance/companyFinancialAccountResolver';
import { bulkUpdateCompanyChargeStatuses } from '@/lib/finance/companyAsaasBulkStatusUpdate';
import { formatSaleLotsLabel } from '@/lib/saleBlockLotLabel';
import {
  getCompanyFinancialAccountById,
  loadAsaasApiKeyForFinancialAccount,
} from '@/lib/finance/companyFinancialAccountRepository';
import {
  asaasCompanyEnrichPaymentArtifacts,
  asaasCompanyFetchCommercialInfo,
} from '@/lib/finance/asaasCompanyClient';
import { isOfficialDigitableLine } from '@/lib/finance/asaasCompanyLateFees';
import {
  resolveSaleCarneBeneficiaryFromSources,
  type SaleCarneBeneficiaryResolved,
} from '@/lib/finance/saleCarneBeneficiary';
import { formatPayerAddressForCarne } from '@/lib/finance/saleCarnePayerAddress';
import {
  SALE_CHARGES_AUDIT_GENERATE,
  SALE_CHARGES_AUDIT_SYNC,
  SALE_CHARGES_GENERATE_BATCH_LIMIT,
  buildSaleChargesSummaryFromRows,
  chargeHasOfficialBoletoLine,
  isPrintablePendingCharge,
  type SaleChargeInstallmentRow,
  type SaleChargesSummary,
} from '@/lib/finance/saleChargesShared';

export * from '@/lib/finance/saleChargesShared';

export type GenerateMissingSaleChargesResult = {
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
};

export async function loadSaleScopedInstallments(
  admin: SupabaseClient,
  companyId: string,
  saleId: string,
): Promise<SaleChargeInstallmentRow[]> {
  const { data, error } = await admin
    .from('finance_receipts')
    .select(
      'id, sale_id, company_id, tenant_id, customer_id, project_id, block_id, financial_account_id, installment_number, due_date, amount, status, paid_at',
    )
    .eq('sale_id', saleId)
    .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
    .order('installment_number', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as SaleChargeInstallmentRow[];
}

export async function loadSaleContext(
  admin: SupabaseClient,
  companyId: string,
  saleId: string,
): Promise<{
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  projectName: string | null;
  quadra: string | null;
  lote: string | null;
  lotLabel: string | null;
  contractNumber: string | null;
  financialAccountId: string | null;
}> {
  const { data: sale, error } = await admin
    .from('sales')
    .select(
      'id, company_id, tenant_id, customer_id, project_id, block_id, lot_id, financial_account_id, contract_id',
    )
    .eq('id', saleId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!sale) throw new Error('Venda não encontrada.');

  const saleCompany = String(sale.company_id || sale.tenant_id || '');
  if (saleCompany && saleCompany !== companyId) {
    throw new Error('Venda não pertence a esta empresa.');
  }

  const customerId = sale.customer_id ? String(sale.customer_id) : null;
  const projectId = sale.project_id ? String(sale.project_id) : null;
  const blockId = sale.block_id ? String(sale.block_id) : null;

  const [customerRes, projectRes, blockRes, contractRes] = await Promise.all([
    customerId
      ? admin
          .from('customers')
          .select('name, email, phone')
          .eq('id', customerId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    projectId
      ? admin.from('projects').select('id, name').eq('id', projectId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    blockId
      ? admin
          .from('blocks')
          .select('id, block_name, name, number, lot_number')
          .eq('id', blockId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from('contracts')
      .select('contract_number, sale_id')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const block = blockRes.data as {
    block_name?: string;
    name?: string;
    number?: string;
    lot_number?: string;
  } | null;

  const quadra = block?.block_name || block?.name || null;
  const lote = block?.number || block?.lot_number || null;
  const lotLabel =
    formatSaleLotsLabel(
      {
        id: saleId,
        block_id: blockId,
        lot_id: (sale.lot_id as string | null) ?? null,
      },
      blockRes.data ? [blockRes.data] : [],
    ) || (quadra && lote ? `QD ${quadra} - LT ${lote}` : null);

  return {
    customerName: customerRes.data?.name ? String(customerRes.data.name) : null,
    customerEmail: customerRes.data?.email ? String(customerRes.data.email) : null,
    customerPhone: customerRes.data?.phone ? String(customerRes.data.phone) : null,
    projectName: projectRes.data?.name ? String(projectRes.data.name) : null,
    quadra,
    lote,
    lotLabel,
    contractNumber: contractRes.data?.contract_number
      ? String(contractRes.data.contract_number)
      : null,
    financialAccountId: sale.financial_account_id
      ? String(sale.financial_account_id)
      : null,
  };
}

export async function getSaleChargesSummary(
  admin: SupabaseClient,
  companyId: string,
  saleId: string,
): Promise<SaleChargesSummary> {
  const context = await loadSaleContext(admin, companyId, saleId);
  const installments = await loadSaleScopedInstallments(admin, companyId, saleId);
  const installmentIds = installments.map((r) => String(r.id));
  const charges = await listCompanyAsaasChargesForInstallments(
    admin,
    companyId,
    installmentIds,
  );

  let hasFinancialAccount = false;
  let financialAccountName: string | null = null;
  let financialAccountBlockReason: string | null = null;
  let resolvedAccountId: string | null = context.financialAccountId;

  const resolvedSale = await resolveFinancialAccountForSaleOptional(admin, companyId, {
    financialAccountId: context.financialAccountId,
    projectId: null,
  });
  if (resolvedSale?.account) {
    hasFinancialAccount = true;
    financialAccountName = resolvedSale.account.name || null;
    resolvedAccountId = resolvedSale.account.id || resolvedAccountId;
  }

  if (!hasFinancialAccount && installments.length > 0) {
    try {
      const first = installments[0];
      const resolved = await resolveFinancialAccountForInstallment(admin, companyId, {
        financial_account_id: first.financial_account_id,
        sale_id: saleId,
        project_id: first.project_id,
        sales: { financial_account_id: context.financialAccountId },
      });
      hasFinancialAccount = true;
      financialAccountName = resolved.account.name || null;
      resolvedAccountId = resolved.account.id || resolvedAccountId;
    } catch (err) {
      financialAccountBlockReason =
        err instanceof Error
          ? err.message
          : 'Configure uma conta financeira recebedora na venda ou no empreendimento antes de gerar cobranças.';
    }
  }

  if (!hasFinancialAccount && !financialAccountBlockReason) {
    financialAccountBlockReason =
      'Esta venda não possui conta financeira configurada. Defina a conta recebedora na aba Dados (ou conta padrão da empresa) antes de gerar cobranças.';
  }

  const beneficiary = resolvedAccountId
    ? await resolveSaleCarneBeneficiary(admin, companyId, resolvedAccountId)
    : resolveSaleCarneBeneficiaryFromSources({});

  if (beneficiary.warnings.length) {
    console.warn('[sale-charges] beneficiary cadastral', {
      sale_id: saleId,
      company_id: companyId,
      document_source: beneficiary.documentSource,
      missing_document: beneficiary.missingDocument,
      divergence: beneficiary.companyDocumentDivergence,
    });
  }

  return buildSaleChargesSummaryFromRows({
    saleId,
    companyId,
    installments,
    charges,
    context,
    financialAccountName,
    hasFinancialAccount,
    financialAccountBlockReason,
    beneficiaryDocumentMissing: beneficiary.missingDocument,
    beneficiaryDocumentDivergence: beneficiary.companyDocumentDivergence,
    beneficiaryWarnings: beneficiary.warnings,
    beneficiaryDocumentSource: beneficiary.documentSource,
  });
}

/**
 * Resolve nome/CPF-CNPJ do beneficiário (Asaas commercialInfo → conta → empresa).
 * Não persiste retorno do Asaas. Uma chamada commercialInfo por conta/request.
 */
export async function resolveSaleCarneBeneficiary(
  admin: SupabaseClient,
  companyId: string,
  financialAccountId: string,
): Promise<SaleCarneBeneficiaryResolved> {
  let asaas: { cpfCnpj?: string | null; companyName?: string | null } | null = null;
  let financialAccount: {
    document?: string | null;
    beneficiaryName?: string | null;
    name?: string | null;
  } | null = null;

  try {
    const account = await getCompanyFinancialAccountById(
      admin,
      companyId,
      financialAccountId,
    );
    if (account) {
      financialAccount = {
        document: account.document,
        beneficiaryName: account.beneficiaryName,
        name: account.name,
      };
      try {
        const { apiKey, environment } = await loadAsaasApiKeyForFinancialAccount(
          admin,
          financialAccountId,
          companyId,
        );
        const commercial = await asaasCompanyFetchCommercialInfo(apiKey, environment);
        if (commercial) {
          asaas = {
            cpfCnpj: commercial.cpfCnpj || null,
            companyName: commercial.companyName || commercial.name || null,
          };
        }
      } catch (err) {
        console.warn(
          '[sale-charges] commercialInfo fallback',
          err instanceof Error ? err.message : 'erro',
        );
      }
    }
  } catch (err) {
    console.warn(
      '[sale-charges] financial account load',
      err instanceof Error ? err.message : 'erro',
    );
  }

  const { data: company } = await admin
    .from('companies')
    .select('id, cnpj, razao_social, fantasy_name, name')
    .eq('id', companyId)
    .maybeSingle();

  return resolveSaleCarneBeneficiaryFromSources({
    asaas,
    financialAccount,
    company: company
      ? {
          cnpj: company.cnpj ? String(company.cnpj) : null,
          razaoSocial: company.razao_social
            ? String(company.razao_social)
            : company.name
              ? String(company.name)
              : null,
          fantasyName: company.fantasy_name ? String(company.fantasy_name) : null,
        }
      : null,
  });
}

export async function generateMissingSaleChargesBatch(
  admin: SupabaseClient,
  params: {
    companyId: string;
    saleId: string;
    userId?: string | null;
    limit?: number;
    confirmed: boolean;
  },
): Promise<GenerateMissingSaleChargesResult> {
  if (!params.confirmed) {
    throw new Error('Confirmação obrigatória para gerar cobranças faltantes.');
  }

  const limit = Math.min(
    Math.max(1, Number(params.limit) || SALE_CHARGES_GENERATE_BATCH_LIMIT),
    SALE_CHARGES_GENERATE_BATCH_LIMIT,
  );

  const summary = await getSaleChargesSummary(admin, params.companyId, params.saleId);
  if (!summary.hasFinancialAccount) {
    throw new Error(
      summary.financialAccountBlockReason ||
        'Conta financeira não configurada para esta venda.',
    );
  }

  const missing = summary.missingInstallmentIds;
  const batch = missing.slice(0, limit);
  const progressTotal = summary.chargesMissing + summary.chargesGenerated;
  let created = 0;
  let reused = 0;
  let skipped = 0;
  const errors: Array<{ installmentId: string; message: string }> = [];

  for (const installmentId of batch) {
    try {
      const before = await listCompanyAsaasChargesForInstallments(admin, params.companyId, [
        installmentId,
      ]);
      const existing = before[0] || null;
      const charge = await createCompanyInstallmentCharge(admin, {
        companyId: params.companyId,
        installmentId,
        billingType: 'BOLETO',
        userId: params.userId,
      });
      if (
        existing &&
        (existing.id === charge.id ||
          existing.asaasPaymentId === charge.asaasPaymentId)
      ) {
        reused += 1;
      } else {
        created += 1;
      }
    } catch (err) {
      if (err instanceof CompanyAsaasChargePaidError) {
        skipped += 1;
        continue;
      }
      if (err instanceof CompanyAsaasIntegrationInactiveError) {
        throw err;
      }
      const message =
        err instanceof CompanyAsaasCustomerDocumentMissingError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Erro ao gerar cobrança';
      errors.push({ installmentId, message });
    }
  }

  const after = await getSaleChargesSummary(admin, params.companyId, params.saleId);

  try {
    await admin.from('audit_logs').insert({
      tenant_id: params.companyId,
      company_id: params.companyId,
      user_id: params.userId || null,
      module: 'FINANCE',
      action: SALE_CHARGES_AUDIT_GENERATE,
      reference_id: params.saleId,
      description: JSON.stringify({
        sale_id: params.saleId,
        batch_limit: limit,
        requested: batch.length,
        created,
        reused,
        skipped,
        errors: errors.length,
        remaining_missing: after.chargesMissing,
      }),
    });
  } catch (auditErr) {
    console.warn('[sale-charges] audit', auditErr);
  }

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
    progressTotal: Math.max(progressTotal, after.eligibleInstallments),
  };
}

export async function syncSaleChargesStatuses(
  admin: SupabaseClient,
  params: { companyId: string; saleId: string; userId?: string | null },
) {
  const installments = await loadSaleScopedInstallments(
    admin,
    params.companyId,
    params.saleId,
  );
  const ids = installments.map((r) => String(r.id));
  const result = await bulkUpdateCompanyChargeStatuses(admin, params.companyId, ids);

  try {
    await admin.from('audit_logs').insert({
      tenant_id: params.companyId,
      company_id: params.companyId,
      user_id: params.userId || null,
      module: 'FINANCE',
      action: SALE_CHARGES_AUDIT_SYNC,
      reference_id: params.saleId,
      description: JSON.stringify({
        sale_id: params.saleId,
        paid: result.paid,
        pending: result.pending,
        failed: result.failed,
        skipped: result.skipped,
      }),
    });
  } catch (auditErr) {
    console.warn('[sale-charges] sync audit', auditErr);
  }

  const summary = await getSaleChargesSummary(admin, params.companyId, params.saleId);
  return { sync: result, summary };
}

export async function listPrintableSaleCharges(
  admin: SupabaseClient,
  companyId: string,
  saleId: string,
): Promise<{
  summary: SaleChargesSummary;
  charges: CompanyAsaasChargeResponse[];
  installments: SaleChargeInstallmentRow[];
}> {
  const summary = await getSaleChargesSummary(admin, companyId, saleId);
  const installments = await loadSaleScopedInstallments(admin, companyId, saleId);
  const charges = await listCompanyAsaasChargesForInstallments(
    admin,
    companyId,
    installments.map((r) => String(r.id)),
  );
  const printable = charges.filter(isPrintablePendingCharge);
  return { summary, charges: printable, installments };
}

/**
 * Garante linha digitável / barcode / nosso número oficiais via
 * GET /payments/{id}/identificationField antes de montar o carnê.
 */
export async function enrichSaleChargesForCarnePdf(
  admin: SupabaseClient,
  companyId: string,
  charges: CompanyAsaasChargeResponse[],
): Promise<CompanyAsaasChargeResponse[]> {
  const out: CompanyAsaasChargeResponse[] = [];

  for (const charge of charges) {
    if (chargeHasOfficialBoletoLine(charge) && charge.nossoNumero) {
      out.push(charge);
      continue;
    }

    const accountId = charge.financialAccountId;
    if (!accountId || !charge.asaasPaymentId) {
      out.push(charge);
      continue;
    }

    try {
      const { apiKey, environment } = await loadAsaasApiKeyForFinancialAccount(
        admin,
        accountId,
        companyId,
      );
      const enriched = await asaasCompanyEnrichPaymentArtifacts(
        apiKey,
        environment,
        charge.asaasPaymentId,
        {
          billingType: charge.billingType,
          existingPixCopy: charge.pixCopyPaste,
        },
      );

      const digitable =
        enriched.bankSlipIdentification ||
        (isOfficialDigitableLine(charge.bankSlipIdentification)
          ? charge.bankSlipIdentification
          : null);

      const rawPayload = {
        ...(enriched.payment as Record<string, unknown>),
        identificationField: enriched.payment.identificationField,
        nossoNumero: enriched.payment.nossoNumero,
        barCode: enriched.payment.barCode,
        invoiceNumber: enriched.payment.invoiceNumber,
      };

      const updated = await updateCompanyAsaasCharge(admin, charge.id, companyId, {
        bankSlipIdentification: digitable,
        bankSlipUrl: enriched.payment.bankSlipUrl ?? charge.bankSlipUrl,
        invoiceUrl: enriched.payment.invoiceUrl ?? charge.invoiceUrl,
        pixQrCode: enriched.pixQrCode || charge.pixQrCode,
        pixCopyPaste: enriched.pixCopyPaste || charge.pixCopyPaste,
        rawPayload,
      });
      out.push(updated);
    } catch (err) {
      console.warn('[sale-charges] enrich carne', charge.id, err);
      out.push(charge);
    }
  }

  return out.filter(chargeHasOfficialBoletoLine);
}

export async function loadSaleCarnePayerInfo(
  admin: SupabaseClient,
  _companyId: string,
  customerId: string | null | undefined,
): Promise<{
  name: string;
  document: string;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  formattedAddress?: string;
} | null> {
  if (!customerId) return null;
  const { data, error } = await admin
    .from('customers')
    .select(
      'name, cpf_cnpj, document, address, neighborhood, city, state, state_uf, cep, zip_code',
    )
    .eq('id', customerId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const address = row.address ? String(row.address) : null;
  const neighborhood = row.neighborhood ? String(row.neighborhood) : null;
  const city = row.city ? String(row.city) : null;
  const state = String(row.state_uf || row.state || '') || null;
  const zip = String(row.cep || row.zip_code || '') || null;
  return {
    name: String(row.name || '').trim(),
    document: String(row.cpf_cnpj || row.document || '').trim(),
    address,
    neighborhood,
    city,
    state,
    zip,
    formattedAddress: formatPayerAddressForCarne({
      address,
      neighborhood,
      city,
      state,
      stateUf: row.state_uf ? String(row.state_uf) : state,
      cep: zip,
      zipCode: row.zip_code ? String(row.zip_code) : zip,
    }),
  };
}
