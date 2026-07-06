/**
 * Validação linha a linha — atualização de parcelas.
 */

import { lookupBlockInIndex } from '@/lib/imports/modules/sales/blockMatch';
import { normalizeInstallmentCustomerName } from '@/lib/imports/modules/installments/normalize';
import type {
  InstallmentImportContext,
  InstallmentImportRowMessage,
  InstallmentImportSummary,
  InstallmentReceiptRecord,
  InstallmentRowStatus,
  ParsedInstallmentRow,
  ValidatedInstallmentRow,
} from '@/lib/imports/modules/installments/types';

function buildLookupKey(row: ParsedInstallmentRow, saleId?: string | null): string {
  if (row.parcela_id) return `receipt:${row.parcela_id}`;
  if (saleId && row.numero_parcela != null) return `sale:${saleId}::${row.numero_parcela}`;
  return `loc:${row.empreendimento_normalized}::${row.quadra_normalized}::${row.lote_normalized}::${row.cliente_normalized}::${row.numero_parcela}`;
}

function hasLocationLookupFields(row: ParsedInstallmentRow): boolean {
  return Boolean(
    row.empreendimento_normalized &&
      row.quadra_normalized &&
      row.lote_normalized &&
      row.cliente_normalized,
  );
}

function resolveReceiptByLocation(
  row: ParsedInstallmentRow,
  context: InstallmentImportContext,
): {
  receipt: InstallmentReceiptRecord | null;
  saleId: string | null;
  projectId: string | null;
  projectName: string | null;
  blockId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerMismatch: boolean;
} {
  const project = context.projectsByName.get(row.empreendimento_normalized);
  if (!project) {
    return {
      receipt: null,
      saleId: null,
      projectId: null,
      projectName: null,
      blockId: null,
      customerId: null,
      customerName: null,
      customerMismatch: false,
    };
  }

  const block = lookupBlockInIndex(
    context.blocks,
    project.id,
    row.quadra,
    row.lote,
  );
  if (!block) {
    return {
      receipt: null,
      saleId: null,
      projectId: project.id,
      projectName: project.name,
      blockId: null,
      customerId: null,
      customerName: null,
      customerMismatch: false,
    };
  }

  const sale =
    (block.sale_id ? context.salesById.get(String(block.sale_id)) : null) ||
    context.salesByBlockId.get(String(block.id)) ||
    null;

  if (!sale) {
    return {
      receipt: null,
      saleId: null,
      projectId: project.id,
      projectName: project.name,
      blockId: String(block.id),
      customerId: null,
      customerName: null,
      customerMismatch: false,
    };
  }

  const customerMismatch =
    Boolean(row.cliente_normalized) &&
    normalizeInstallmentCustomerName(sale.customer_name) !== row.cliente_normalized;

  if (row.numero_parcela == null) {
    return {
      receipt: null,
      saleId: sale.id,
      projectId: project.id,
      projectName: project.name,
      blockId: String(block.id),
      customerId: sale.customer_id,
      customerName: sale.customer_name,
      customerMismatch,
    };
  }

  const receipt =
    context.receiptsBySaleAndNumber.get(`${sale.id}::${row.numero_parcela}`) || null;

  if (receipt && row.vencimento && receipt.due_date !== row.vencimento) {
    // vencimento é dica de lookup — não invalida se divergir, apenas aviso depois
  }

  return {
    receipt,
    saleId: sale.id,
    projectId: project.id,
    projectName: project.name,
    blockId: String(block.id),
    customerId: sale.customer_id,
    customerName: sale.customer_name,
    customerMismatch,
  };
}

function resolveReceipt(
  row: ParsedInstallmentRow,
  context: InstallmentImportContext,
): ReturnType<typeof resolveReceiptByLocation> {
  if (row.parcela_id) {
    const receipt = context.receiptsById.get(row.parcela_id) || null;
    const sale = receipt ? context.salesById.get(receipt.sale_id) || null : null;
    const project = receipt?.project_id
      ? context.projects.get(receipt.project_id) || null
      : null;
    return {
      receipt,
      saleId: receipt?.sale_id || null,
      projectId: receipt?.project_id || null,
      projectName: project?.name || null,
      blockId: receipt?.block_id || null,
      customerId: receipt?.customer_id || sale?.customer_id || null,
      customerName: sale?.customer_name || null,
      customerMismatch: false,
    };
  }

  if (row.venda_id) {
    const sale = context.salesById.get(row.venda_id) || null;
    const receipt =
      sale && row.numero_parcela != null
        ? context.receiptsBySaleAndNumber.get(`${sale.id}::${row.numero_parcela}`) || null
        : null;
    const project = sale?.project_id ? context.projects.get(sale.project_id) || null : null;
    const customerMismatch =
      Boolean(row.cliente_normalized && sale) &&
      normalizeInstallmentCustomerName(sale.customer_name) !== row.cliente_normalized;

    return {
      receipt,
      saleId: sale?.id || null,
      projectId: sale?.project_id || null,
      projectName: project?.name || null,
      blockId: sale?.block_id || null,
      customerId: sale?.customer_id || null,
      customerName: sale?.customer_name || null,
      customerMismatch,
    };
  }

  return resolveReceiptByLocation(row, context);
}

function hasUpdateFields(row: ParsedInstallmentRow): boolean {
  return Boolean(
    row.novo_vencimento ||
      row.status_normalized ||
      row.valor != null ||
      row.valor_pago != null ||
      row.data_pagamento ||
      row.observacoes.trim(),
  );
}

function validateSingleRow(
  row: ParsedInstallmentRow,
  context: InstallmentImportContext,
  spreadsheetKeyCounts: Map<string, number>,
): ValidatedInstallmentRow {
  const messages: InstallmentImportRowMessage[] = [];
  let status: InstallmentRowStatus = 'valid';

  const pushMessage = (message: InstallmentImportRowMessage) => {
    messages.push(message);
    if (message.level === 'error') status = 'error';
    else if (message.level === 'warning' && status === 'valid') status = 'warning';
  };

  if (row.numero_parcela == null) {
    pushMessage({ level: 'error', text: 'Número da parcela é obrigatório.' });
  }

  if (row.status_raw && !row.status_normalized) {
    pushMessage({
      level: 'error',
      text: `Status "${row.status_raw}" não reconhecido. Use pendente, pago, atrasado ou cancelado.`,
    });
  }

  if (!row.venda_id && !row.parcela_id && !hasLocationLookupFields(row)) {
    pushMessage({
      level: 'error',
      text: 'Informe parcela_id, venda_id ou a combinação empreendimento + quadra + lote + cliente.',
    });
  }

  if (!hasUpdateFields(row)) {
    pushMessage({
      level: 'error',
      text: 'Informe ao menos um campo para atualizar (vencimento, status, valor, pagamento ou observações).',
    });
  }

  const resolved = resolveReceipt(row, context);
  const located = Boolean(resolved.receipt);

  if (!located) {
    if (resolved.saleId && row.numero_parcela != null) {
      pushMessage({
        level: 'error',
        text: 'Venda localizada, mas a parcela não foi encontrada. Este fluxo não cria parcelas novas.',
      });
    } else if (resolved.projectId && !resolved.blockId) {
      pushMessage({ level: 'error', text: 'Quadra/lote não localizado no empreendimento informado.' });
    } else if (resolved.blockId && !resolved.saleId) {
      pushMessage({ level: 'error', text: 'Lote localizado, mas não há venda vinculada.' });
    } else {
      pushMessage({ level: 'error', text: 'Parcela não localizada para os dados informados.' });
    }
  }

  if (resolved.customerMismatch) {
    pushMessage({
      level: 'warning',
      text: 'Cliente da planilha difere do cliente da venda localizada.',
    });
  }

  if (located && resolved.receipt && row.vencimento && resolved.receipt.due_date !== row.vencimento) {
    pushMessage({
      level: 'warning',
      text: `Vencimento informado (${row.vencimento}) difere do vencimento atual (${resolved.receipt.due_date}).`,
    });
  }

  if (row.observacoes.trim()) {
    pushMessage({
      level: 'info',
      text: 'Observações serão registradas no histórico da migração.',
    });
  }

  const lookupKey = buildLookupKey(row, resolved.saleId);
  if ((spreadsheetKeyCounts.get(lookupKey) ?? 0) > 1) {
    status = 'duplicate';
    pushMessage({ level: 'error', text: 'Parcela duplicada dentro da planilha.' });
  }

  const importable = located && status !== 'error' && status !== 'duplicate';

  return {
    ...row,
    status,
    messages,
    importable,
    located,
    receipt_id: resolved.receipt?.id || null,
    sale_id: resolved.saleId,
    project_id: resolved.projectId,
    project_name: resolved.projectName,
    block_id: resolved.blockId,
    customer_id: resolved.customerId,
    customer_name: resolved.customerName,
    current_due_date: resolved.receipt?.due_date || null,
    current_status: resolved.receipt?.status || null,
    current_amount: resolved.receipt?.amount ?? null,
    current_paid_amount: resolved.receipt?.paid_amount ?? null,
    resolved_status: row.status_normalized || null,
  };
}

export function validateInstallmentRows(
  rows: ParsedInstallmentRow[],
  context: InstallmentImportContext,
): { rows: ValidatedInstallmentRow[]; summary: InstallmentImportSummary } {
  const spreadsheetKeyCounts = new Map<string, number>();
  for (const row of rows) {
    const key = buildLookupKey(row, row.venda_id || null);
    spreadsheetKeyCounts.set(key, (spreadsheetKeyCounts.get(key) ?? 0) + 1);
  }

  const validatedRows = rows.map((row) =>
    validateSingleRow(row, context, spreadsheetKeyCounts),
  );

  const summary: InstallmentImportSummary = {
    totalRows: validatedRows.length,
    validRows: 0,
    warningRows: 0,
    errorRows: 0,
    duplicateRows: 0,
    existingRows: 0,
    ignoredRows: 0,
    importableRows: 0,
    locatedRows: 0,
    notLocatedRows: 0,
    updateRows: 0,
  };

  for (const row of validatedRows) {
    if (row.located) summary.locatedRows += 1;
    else summary.notLocatedRows += 1;

    if (row.importable) {
      summary.importableRows += 1;
      summary.updateRows += 1;
      if (row.status === 'warning') summary.warningRows += 1;
      else summary.validRows += 1;
    } else {
      summary.ignoredRows += 1;
      if (row.status === 'duplicate') summary.duplicateRows += 1;
      else if (row.status === 'error') summary.errorRows += 1;
      else if (row.status === 'warning') summary.warningRows += 1;
    }
  }

  return { rows: validatedRows, summary };
}

export function buildInstallmentMigrationRowDetail(row: ValidatedInstallmentRow) {
  return {
    lineNumber: row.lineNumber,
    empreendimento: row.empreendimento,
    quadra: row.quadra,
    lote: row.lote,
    cliente: row.cliente,
    numero_parcela: row.numero_parcela,
    vencimento_atual: row.current_due_date,
    novo_vencimento: row.novo_vencimento,
    status_atual: row.current_status,
    novo_status: row.resolved_status,
    valor_atual: row.current_amount,
    valor_pago: row.valor_pago,
    resultado: row.importable ? 'atualizar' : 'ignorar',
    messages: row.messages.map((message) => message.text),
    observacoes: row.observacoes || null,
  };
}

export function buildInstallmentUpdatePayload(row: ValidatedInstallmentRow): Record<string, unknown> {
  const update: Record<string, unknown> = {};

  if (row.novo_vencimento) update.due_date = row.novo_vencimento;
  if (row.resolved_status) update.status = row.resolved_status;
  if (row.valor != null && row.valor > 0) update.amount = row.valor;

  const paidStatus = row.resolved_status === 'pago';
  if (row.valor_pago != null && row.valor_pago >= 0) {
    update.paid_amount = row.valor_pago;
  } else if (paidStatus) {
    update.paid_amount = row.valor ?? row.current_amount ?? 0;
  }

  if (row.data_pagamento) {
    update.paid_at = row.data_pagamento;
  } else if (paidStatus && !update.paid_at) {
    update.paid_at = new Date().toISOString();
  }

  if (paidStatus) update.status = 'pago';

  return update;
}
