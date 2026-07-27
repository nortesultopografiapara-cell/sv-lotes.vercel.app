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
import { listCompanyAsaasChargesForInstallments } from '@/lib/finance/companyAsaasChargeRepository';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  resolveFinancialAccountForInstallment,
  resolveFinancialAccountForSaleOptional,
} from '@/lib/finance/companyFinancialAccountResolver';
import { bulkUpdateCompanyChargeStatuses } from '@/lib/finance/companyAsaasBulkStatusUpdate';
import { formatSaleLotsLabel } from '@/lib/saleBlockLotLabel';
import {
  SALE_CHARGES_AUDIT_GENERATE,
  SALE_CHARGES_AUDIT_SYNC,
  SALE_CHARGES_GENERATE_BATCH_LIMIT,
  buildSaleChargesSummaryFromRows,
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

async function loadSaleScopedInstallments(
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

async function loadSaleContext(
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

  const resolvedSale = await resolveFinancialAccountForSaleOptional(admin, companyId, {
    financialAccountId: context.financialAccountId,
    projectId: null,
  });
  if (resolvedSale?.account) {
    hasFinancialAccount = true;
    financialAccountName = resolvedSale.account.name || null;
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

  return buildSaleChargesSummaryFromRows({
    saleId,
    companyId,
    installments,
    charges,
    context,
    financialAccountName,
    hasFinancialAccount,
    financialAccountBlockReason,
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
