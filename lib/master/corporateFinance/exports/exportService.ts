/** Orquestração das exportações — reutiliza services de listagem. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { roundMoney } from '../arApMath';
import {
  corporatePayableStatusLabel,
  corporatePaymentMethodLabel,
  corporateReceivableStatusLabel,
  type MasterCorporateArApListFilters,
  type MasterCorporatePayable,
  type MasterCorporateReceivable,
} from '../arApTypes';
import { listCashMovementsWithRunningBalance } from '../cashMovementsService';
import {
  corporateCashOriginLabel,
  corporateCashTypeLabel,
  type MasterCorporateCashListFilters,
} from '../cashTypes';
import { pnlCashEffect } from '../cashMath';
import { listPayables } from '../payablesService';
import { listReceivables } from '../receivablesService';
import { logCorporateFinanceAudit } from '../service';
import {
  CORPORATE_BRAND,
  formatCorporateDateBr,
  formatCorporatePeriodLabel,
} from './corporateBranding';
import { buildCorporateCsv, csvNumberBr } from './csvExport';
import {
  buildCashFlowExcelBuffer,
  buildPayablesExcelBuffer,
  buildReceivablesExcelBuffer,
} from './excelExport';
import { buildCorporateExportFilename, mimeForCorporateExport } from './exportFilename';
import {
  buildExportAuditPayload,
  humanizeFilterSummary,
  summarizeArApFilters,
  summarizeCashFilters,
} from './exportFilters';
import { loadCorporateExportNameMaps, mapName } from './exportLookups';
import {
  buildCashFlowPdfBuffer,
  buildPayablesPdfBuffer,
  buildReceivablesPdfBuffer,
} from './pdfExport';
import {
  clampExportLimit,
  CorporateExportEmptyError,
  type CorporateArApExportSummary,
  type CorporateCashExportRow,
  type CorporateCashExportSummary,
  type CorporateExportFormat,
  type CorporateExportMeta,
  type CorporatePayableExportRow,
  type CorporateReceivableExportRow,
} from './exportTypes';

function monthBounds(ref = new Date()) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { from, to };
}

function buildMeta(params: {
  title: string;
  module: CorporateExportMeta['module'];
  format: CorporateExportFormat;
  fromDate?: string;
  toDate?: string;
  filtersLabel: string;
  filterSummary: Record<string, string | boolean | number | null | undefined>;
  rowCount: number;
  generatedAt?: Date;
}): CorporateExportMeta {
  const generatedAt = params.generatedAt || new Date();
  return {
    companyName: CORPORATE_BRAND.companyName,
    legalName: CORPORATE_BRAND.legalName,
    title: params.title,
    module: params.module,
    format: params.format,
    periodLabel: formatCorporatePeriodLabel(params.fromDate, params.toDate),
    generatedAt,
    generatedAtLabel: generatedAt.toISOString(),
    filtersLabel: params.filtersLabel,
    filterSummary: params.filterSummary,
    rowCount: params.rowCount,
  };
}

export type CorporateExportFileResult = {
  filename: string;
  mime: string;
  body: Buffer | string;
  meta: CorporateExportMeta;
};

export async function exportCorporateCashMovements(
  supabase: SupabaseClient,
  params: {
    filters: MasterCorporateCashListFilters;
    format: CorporateExportFormat;
    userId: string | null;
  },
): Promise<CorporateExportFileResult> {
  const limit = clampExportLimit(params.filters.limit);
  const list = await listCashMovementsWithRunningBalance(supabase, {
    ...params.filters,
    page: 1,
    limit,
  });

  if (!list.movements.length) {
    throw new CorporateExportEmptyError();
  }

  const maps = await loadCorporateExportNameMaps(supabase, {
    accountIds: list.movements.map((m) => m.financial_account_id),
    categoryIds: list.movements.map((m) => m.category_id || '').filter(Boolean),
    costCenterIds: list.movements.map((m) => m.cost_center_id || '').filter(Boolean),
    projectIds: list.movements.map((m) => m.project_id || '').filter(Boolean),
  });

  const rows: CorporateCashExportRow[] = list.movements.map((m) => {
    const pnl = pnlCashEffect(m);
    return {
      date: formatCorporateDateBr(m.movement_date),
      code: m.code,
      description: m.description,
      type: corporateCashTypeLabel(m.type),
      origin: corporateCashOriginLabel(m.origin),
      category: mapName(maps.categories, m.category_id),
      account: mapName(maps.accounts, m.financial_account_id),
      costCenter: mapName(maps.costCenters, m.cost_center_id),
      project: mapName(maps.projects, m.project_id),
      paymentMethod: corporatePaymentMethodLabel(m.payment_method),
      income: pnl.income > 0 ? pnl.income : null,
      expense: pnl.expense > 0 ? pnl.expense : null,
      runningBalance: m.running_balance,
      status: m.is_reversed ? 'Estornado' : 'Ativo',
    };
  });

  const summary: CorporateCashExportSummary = {
    openingBalance: list.kpis.openingBalanceInPeriod,
    periodIncome: list.kpis.periodIncome,
    periodExpense: list.kpis.periodExpense,
    netResult: roundMoney(list.kpis.periodIncome - list.kpis.periodExpense),
    closingBalance: list.kpis.closingBalance,
    movementCount: list.movements.length,
  };

  const filterSummary = summarizeCashFilters(params.filters);
  const meta = buildMeta({
    title: 'Fluxo de Caixa Corporativo',
    module: 'cash-flow',
    format: params.format,
    fromDate: params.filters.fromDate,
    toDate: params.filters.toDate,
    filtersLabel: humanizeFilterSummary(filterSummary),
    filterSummary,
    rowCount: rows.length,
  });

  await logCorporateFinanceAudit(supabase, {
    userId: params.userId,
    action: 'CORPORATE_CASH_EXPORTED',
    entityId: 'cash-movements-export',
    description: `Exportação fluxo de caixa (${params.format}, ${rows.length} linhas)`,
    newData: buildExportAuditPayload({
      format: params.format,
      module: 'cash-flow',
      rowCount: rows.length,
      periodLabel: meta.periodLabel,
      filters: filterSummary,
    }),
  });

  const filename = buildCorporateExportFilename('cash-flow', params.format, meta.generatedAt);
  const mime = mimeForCorporateExport(params.format);

  if (params.format === 'csv') {
    const body = buildCorporateCsv({
      headers: [
        'Data',
        'Código',
        'Descrição',
        'Tipo',
        'Origem',
        'Categoria',
        'Conta',
        'Centro de resultado',
        'Projeto',
        'Forma de pagamento',
        'Entrada',
        'Saída',
        'Saldo acumulado',
        'Status',
      ],
      rows: rows.map((r) => [
        r.date,
        r.code,
        r.description,
        r.type,
        r.origin,
        r.category,
        r.account,
        r.costCenter,
        r.project,
        r.paymentMethod,
        csvNumberBr(r.income),
        csvNumberBr(r.expense),
        csvNumberBr(r.runningBalance),
        r.status,
      ]),
      summaryLines: [
        ['Saldo inicial', csvNumberBr(summary.openingBalance)],
        ['Entradas', csvNumberBr(summary.periodIncome)],
        ['Saídas', csvNumberBr(summary.periodExpense)],
        ['Resultado líquido', csvNumberBr(summary.netResult)],
        ['Saldo final', csvNumberBr(summary.closingBalance)],
        ['Movimentos', summary.movementCount],
      ],
    });
    return { filename, mime, body, meta };
  }

  if (params.format === 'xlsx') {
    const body = await buildCashFlowExcelBuffer({ meta, summary, rows });
    return { filename, mime, body, meta };
  }

  const body = await buildCashFlowPdfBuffer({ meta, summary, rows });
  return { filename, mime, body, meta };
}

function summarizeArApFromRows(
  rows: Array<{
    status: string;
    remaining: number;
    dueDateIso: string;
    settled: number;
    settledInMonth: boolean;
  }>,
): CorporateArApExportSummary {
  const { from, to } = monthBounds();
  const today = new Date().toISOString().slice(0, 10);
  const statusCounts: Record<string, number> = {};
  let openAmount = 0;
  let dueThisMonthAmount = 0;
  let overdueAmount = 0;
  let settledThisMonthAmount = 0;

  for (const r of rows) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    if (r.remaining > 0) {
      openAmount = roundMoney(openAmount + r.remaining);
      if (r.dueDateIso >= from && r.dueDateIso <= to) {
        dueThisMonthAmount = roundMoney(dueThisMonthAmount + r.remaining);
      }
      if (r.dueDateIso < today) {
        overdueAmount = roundMoney(overdueAmount + r.remaining);
      }
    }
    if (r.settledInMonth) {
      settledThisMonthAmount = roundMoney(settledThisMonthAmount + r.settled);
    }
  }

  return {
    openAmount,
    dueThisMonthAmount,
    settledThisMonthAmount,
    overdueAmount,
    statusCounts,
    rowCount: rows.length,
  };
}

function receivableSettledInMonth(r: MasterCorporateReceivable): boolean {
  // Aproximação: se recebido > 0 e status RECEIVED/PARTIAL no mês corrente via updated_at
  const { from, to } = monthBounds();
  const updated = String(r.updated_at || '').slice(0, 10);
  return r.received_amount > 0 && updated >= from && updated <= to;
}

function payableSettledInMonth(r: MasterCorporatePayable): boolean {
  const { from, to } = monthBounds();
  const updated = String(r.updated_at || '').slice(0, 10);
  return r.paid_amount > 0 && updated >= from && updated <= to;
}

export async function exportCorporateReceivables(
  supabase: SupabaseClient,
  params: {
    filters: MasterCorporateArApListFilters;
    format: CorporateExportFormat;
    userId: string | null;
  },
): Promise<CorporateExportFileResult> {
  const limit = clampExportLimit(params.filters.limit);
  const list = await listReceivables(supabase, {
    ...params.filters,
    page: 1,
    limit,
  });

  if (!list.receivables.length) {
    throw new CorporateExportEmptyError();
  }

  const maps = await loadCorporateExportNameMaps(supabase, {
    accountIds: list.receivables.map((r) => r.financial_account_id || '').filter(Boolean),
    projectIds: list.receivables.map((r) => r.project_id || '').filter(Boolean),
    quoteIds: list.receivables.map((r) => r.quote_id || '').filter(Boolean),
  });

  const rows: CorporateReceivableExportRow[] = list.receivables.map((r) => ({
    code: r.code,
    businessUnit: r.business_unit || 'SV_TOPOGRAFIA',
    customer: r.customer_name,
    project: mapName(maps.projects, r.project_id),
    quote: mapName(maps.quotes, r.quote_id),
    description: r.description,
    issueDate: formatCorporateDateBr(r.issue_date),
    dueDate: formatCorporateDateBr(r.due_date),
    originalAmount: r.original_amount,
    discount: r.discount_amount,
    interest: r.interest_amount,
    fine: r.fine_amount,
    netAmount: r.net_amount,
    received: r.received_amount,
    remaining: r.remaining_amount,
    status: corporateReceivableStatusLabel(r.status),
    account: mapName(maps.accounts, r.financial_account_id),
    paymentMethod: corporatePaymentMethodLabel(r.payment_method),
  }));

  const summary = summarizeArApFromRows(
    list.receivables.map((r) => ({
      status: corporateReceivableStatusLabel(r.status),
      remaining: r.remaining_amount,
      dueDateIso: String(r.due_date).slice(0, 10),
      settled: r.received_amount,
      settledInMonth: receivableSettledInMonth(r),
    })),
  );
  // Preferir KPI global do mês quando disponível para "recebido no mês"
  summary.settledThisMonthAmount = list.kpis.receivedThisMonth;

  const filterSummary = summarizeArApFilters(params.filters);
  const meta = buildMeta({
    title: 'Contas a Receber',
    module: 'receivables',
    format: params.format,
    fromDate: params.filters.fromDate,
    toDate: params.filters.toDate,
    filtersLabel: humanizeFilterSummary(filterSummary),
    filterSummary,
    rowCount: rows.length,
  });

  await logCorporateFinanceAudit(supabase, {
    userId: params.userId,
    action: 'CORPORATE_RECEIVABLES_EXPORTED',
    entityId: 'receivables-export',
    description: `Exportação contas a receber (${params.format}, ${rows.length} linhas)`,
    newData: buildExportAuditPayload({
      format: params.format,
      module: 'receivables',
      rowCount: rows.length,
      periodLabel: meta.periodLabel,
      filters: filterSummary,
    }),
  });

  const filename = buildCorporateExportFilename('receivables', params.format, meta.generatedAt);
  const mime = mimeForCorporateExport(params.format);

  if (params.format === 'csv') {
    const body = buildCorporateCsv({
      headers: [
        'Código',
        'Unidade',
        'Cliente',
        'Projeto',
        'Orçamento',
        'Descrição',
        'Emissão',
        'Vencimento',
        'Valor original',
        'Desconto',
        'Juros',
        'Multa',
        'Valor líquido',
        'Recebido',
        'Saldo',
        'Status',
        'Conta financeira',
        'Forma de pagamento',
      ],
      rows: rows.map((r) => [
        r.code,
        r.businessUnit,
        r.customer,
        r.project,
        r.quote,
        r.description,
        r.issueDate,
        r.dueDate,
        csvNumberBr(r.originalAmount),
        csvNumberBr(r.discount),
        csvNumberBr(r.interest),
        csvNumberBr(r.fine),
        csvNumberBr(r.netAmount),
        csvNumberBr(r.received),
        csvNumberBr(r.remaining),
        r.status,
        r.account,
        r.paymentMethod,
      ]),
    });
    return { filename, mime, body, meta };
  }

  if (params.format === 'xlsx') {
    const body = await buildReceivablesExcelBuffer({ meta, summary, rows });
    return { filename, mime, body, meta };
  }

  const body = await buildReceivablesPdfBuffer({ meta, summary, rows });
  return { filename, mime, body, meta };
}

export async function exportCorporatePayables(
  supabase: SupabaseClient,
  params: {
    filters: MasterCorporateArApListFilters;
    format: CorporateExportFormat;
    userId: string | null;
  },
): Promise<CorporateExportFileResult> {
  const limit = clampExportLimit(params.filters.limit);
  const list = await listPayables(supabase, {
    ...params.filters,
    page: 1,
    limit,
  });

  if (!list.payables.length) {
    throw new CorporateExportEmptyError();
  }

  const maps = await loadCorporateExportNameMaps(supabase, {
    accountIds: list.payables.map((r) => r.financial_account_id || '').filter(Boolean),
    projectIds: list.payables.map((r) => r.project_id || '').filter(Boolean),
  });

  const rows: CorporatePayableExportRow[] = list.payables.map((r) => ({
    code: r.code,
    supplier: r.supplier_name,
    project: mapName(maps.projects, r.project_id),
    description: r.description,
    issueDate: formatCorporateDateBr(r.issue_date),
    dueDate: formatCorporateDateBr(r.due_date),
    originalAmount: r.original_amount,
    discount: r.discount_amount,
    interest: r.interest_amount,
    fine: r.fine_amount,
    netAmount: r.net_amount,
    paid: r.paid_amount,
    remaining: r.remaining_amount,
    status: corporatePayableStatusLabel(r.status),
    account: mapName(maps.accounts, r.financial_account_id),
    paymentMethod: corporatePaymentMethodLabel(r.payment_method),
  }));

  const summary = summarizeArApFromRows(
    list.payables.map((r) => ({
      status: corporatePayableStatusLabel(r.status),
      remaining: r.remaining_amount,
      dueDateIso: String(r.due_date).slice(0, 10),
      settled: r.paid_amount,
      settledInMonth: payableSettledInMonth(r),
    })),
  );
  summary.settledThisMonthAmount = list.kpis.paidThisMonth;

  const filterSummary = summarizeArApFilters(params.filters);
  const meta = buildMeta({
    title: 'Contas a Pagar',
    module: 'payables',
    format: params.format,
    fromDate: params.filters.fromDate,
    toDate: params.filters.toDate,
    filtersLabel: humanizeFilterSummary(filterSummary),
    filterSummary,
    rowCount: rows.length,
  });

  await logCorporateFinanceAudit(supabase, {
    userId: params.userId,
    action: 'CORPORATE_PAYABLES_EXPORTED',
    entityId: 'payables-export',
    description: `Exportação contas a pagar (${params.format}, ${rows.length} linhas)`,
    newData: buildExportAuditPayload({
      format: params.format,
      module: 'payables',
      rowCount: rows.length,
      periodLabel: meta.periodLabel,
      filters: filterSummary,
    }),
  });

  const filename = buildCorporateExportFilename('payables', params.format, meta.generatedAt);
  const mime = mimeForCorporateExport(params.format);

  if (params.format === 'csv') {
    const body = buildCorporateCsv({
      headers: [
        'Código',
        'Fornecedor',
        'Projeto',
        'Descrição',
        'Emissão',
        'Vencimento',
        'Valor original',
        'Desconto',
        'Juros',
        'Multa',
        'Valor líquido',
        'Pago',
        'Saldo',
        'Status',
        'Conta financeira',
        'Forma de pagamento',
      ],
      rows: rows.map((r) => [
        r.code,
        r.supplier,
        r.project,
        r.description,
        r.issueDate,
        r.dueDate,
        csvNumberBr(r.originalAmount),
        csvNumberBr(r.discount),
        csvNumberBr(r.interest),
        csvNumberBr(r.fine),
        csvNumberBr(r.netAmount),
        csvNumberBr(r.paid),
        csvNumberBr(r.remaining),
        r.status,
        r.account,
        r.paymentMethod,
      ]),
    });
    return { filename, mime, body, meta };
  }

  if (params.format === 'xlsx') {
    const body = await buildPayablesExcelBuffer({ meta, summary, rows });
    return { filename, mime, body, meta };
  }

  const body = await buildPayablesPdfBuffer({ meta, summary, rows });
  return { filename, mime, body, meta };
}
