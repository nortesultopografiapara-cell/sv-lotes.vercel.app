/**
 * Validação linha a linha — importação de vendas.
 */

import {
  brokerFieldsProvided,
  lookupBroker,
  lookupCustomer,
} from '@/lib/imports/modules/sales/lookupIndex';
import {
  buildBlockNotFoundMessage,
  lookupBlockInIndex,
  suggestSimilarBlocks,
} from '@/lib/imports/modules/sales/blockMatch';
import {
  buildSpreadsheetBlockKey,
  isBlockOccupiedStatus,
  parseSaleImportCurrency,
  parseSaleImportDate,
  parseSaleImportStatus,
} from '@/lib/imports/modules/sales/normalize';
import type {
  ParsedSaleRow,
  ResolvedSaleRow,
  SalesImportContext,
  SaleImportRowMessage,
  SaleImportSummary,
  SaleRowStatus,
  ValidatedSaleRow,
} from '@/lib/imports/modules/sales/types';
import { isValidBrazilianTaxDocument } from '@/lib/inputMasks';

function resolveRowEntities(
  row: ParsedSaleRow,
  context: SalesImportContext,
): ResolvedSaleRow {
  const customer = lookupCustomer(
    context.customers,
    row.cliente_cpf_cnpj_digits,
    row.cliente_email_normalized,
    row.cliente_telefone_digits,
  );

  const brokerProvided = brokerFieldsProvided(
    row.corretor_cpf_cnpj_digits,
    row.corretor_email_normalized,
    row.corretor_nome_normalized,
  );
  const broker = brokerProvided
    ? lookupBroker(
        context.brokers,
        row.corretor_cpf_cnpj_digits,
        row.corretor_email_normalized,
        row.corretor_nome_normalized,
      )
    : null;

  const project = context.projects.get(row.empreendimento_normalized) || null;
  let block = null;
  if (project) {
    block =
      lookupBlockInIndex(context.blocks, project.id, row.quadra, row.lote) || null;
  }

  const statusParsed = parseSaleImportStatus(row.status_raw);
  const paymentType: 'À vista' | 'Parcelado' =
    row.quantidade_parcelas > 1 ? 'Parcelado' : 'À vista';

  const commissionPercent =
    row.percentual_comissao != null
      ? row.percentual_comissao
      : broker?.commission_percent != null
        ? Number(broker.commission_percent) || 0
        : 0;

  return {
    ...row,
    customer_id: customer?.id ?? null,
    customer_name: customer?.name ?? null,
    broker_id: broker?.id ?? null,
    broker_name: broker?.name ?? null,
    project_id: project?.id ?? null,
    project_name: project?.name ?? null,
    block_id: block?.id ?? null,
    block_status: block?.status ?? null,
    resolved_block_status: statusParsed.value,
    resolved_commission_percent: commissionPercent,
    payment_type: paymentType,
  };
}

function validateSingleRow(
  row: ResolvedSaleRow,
  context: SalesImportContext,
  spreadsheetBlockCounts: Map<string, number>,
): ValidatedSaleRow {
  const messages: SaleImportRowMessage[] = [];
  let status: SaleRowStatus = 'valid';

  const pushMessage = (message: SaleImportRowMessage) => {
    messages.push(message);
    if (message.level === 'error') status = 'error';
    else if (message.level === 'warning' && status === 'valid') status = 'warning';
  };

  const valorTotal = parseSaleImportCurrency(row.valor_total_raw);
  if (!valorTotal.value || valorTotal.value <= 0) {
    pushMessage({ level: 'error', text: 'Valor total é obrigatório e deve ser maior que zero.' });
  }

  if (row.cliente_cpf_cnpj_digits && !isValidBrazilianTaxDocument(row.cliente_cpf_cnpj_digits)) {
    pushMessage({
      level: 'error',
      text: 'CPF/CNPJ do cliente informado não possui quantidade válida de dígitos (11 ou 14).',
    });
  }

  if (
    row.corretor_cpf_cnpj_digits &&
    !isValidBrazilianTaxDocument(row.corretor_cpf_cnpj_digits)
  ) {
    pushMessage({
      level: 'error',
      text: 'CPF/CNPJ do corretor informado não possui quantidade válida de dígitos (11 ou 14).',
    });
  }

  if (row.data_venda_raw.trim() && !row.data_venda) {
    const parsedDate = parseSaleImportDate(row.data_venda_raw);
    if (parsedDate.error) pushMessage({ level: 'error', text: parsedDate.error });
  }

  if (row.status_raw) {
    const parsedStatus = parseSaleImportStatus(row.status_raw);
    if (parsedStatus.error) pushMessage({ level: 'warning', text: parsedStatus.error });
  }

  const hasCustomerIdentifier =
    row.cliente_cpf_cnpj_digits || row.cliente_email_normalized || row.cliente_telefone_digits;
  if (!hasCustomerIdentifier) {
    pushMessage({
      level: 'error',
      text: 'Informe CPF/CNPJ, e-mail ou telefone do cliente para localização.',
    });
  } else if (!row.customer_id) {
    pushMessage({ level: 'error', text: 'Cliente não localizado.' });
  }

  const brokerProvided = brokerFieldsProvided(
    row.corretor_cpf_cnpj_digits,
    row.corretor_email_normalized,
    row.corretor_nome_normalized,
  );
  if (brokerProvided && !row.broker_id) {
    pushMessage({ level: 'error', text: 'Corretor não localizado.' });
  }

  if (!row.empreendimento.trim()) {
    pushMessage({ level: 'error', text: 'Empreendimento é obrigatório.' });
  } else if (!row.project_id) {
    pushMessage({ level: 'error', text: 'Empreendimento não encontrado no sistema.' });
  }

  if (!row.quadra.trim()) {
    pushMessage({ level: 'error', text: 'Quadra é obrigatória.' });
  }

  if (!row.lote.trim()) {
    pushMessage({ level: 'error', text: 'Lote é obrigatório.' });
  }

  if (row.project_id && row.quadra.trim() && row.lote.trim() && !row.block_id) {
    const projectBlocks = context.blocksByProject.get(row.project_id) || [];
    const suggestions = suggestSimilarBlocks(projectBlocks, row.quadra, row.lote);
    pushMessage({
      level: 'error',
      text: buildBlockNotFoundMessage(row.quadra, row.lote, suggestions),
    });
  }

  if (row.block_id) {
    const blockKey = buildSpreadsheetBlockKey(
      row.empreendimento_normalized,
      row.quadra_normalized,
      row.lote_normalized,
    );
    const dupCount = spreadsheetBlockCounts.get(blockKey) ?? 0;
    if (dupCount > 1 && status !== 'error') {
      status = 'duplicate';
      messages.push({
        level: 'error',
        text: 'Lote duplicado dentro da planilha.',
      });
    }

    const occupied =
      isBlockOccupiedStatus(row.block_status) || context.activeSaleBlockIds.has(row.block_id);
    if (occupied && status !== 'error') {
      status = 'existing';
      messages.push({
        level: 'error',
        text: `Lote já está ${row.block_status || 'vendido/reservado'} no sistema.`,
      });
    }
  }

  if (row.observacoes.trim()) {
    pushMessage({
      level: 'warning',
      text: 'Observações serão registradas apenas no histórico da migração.',
    });
  }

  if (row.vencimento_primeira_parcela_raw && !row.vencimento_primeira_parcela) {
    pushMessage({
      level: 'warning',
      text: 'Vencimento da primeira parcela inválido — será ignorado nesta versão.',
    });
  }

  const importable = status === 'valid' || status === 'warning';

  return {
    ...row,
    data_venda: row.data_venda || new Date().toISOString().slice(0, 10),
    status,
    messages,
    importable,
  };
}

export function validateSaleRows(
  rows: ParsedSaleRow[],
  context: SalesImportContext,
): { rows: ValidatedSaleRow[]; summary: SaleImportSummary } {
  const spreadsheetBlockCounts = new Map<string, number>();

  for (const row of rows) {
    const key = buildSpreadsheetBlockKey(
      row.empreendimento_normalized,
      row.quadra_normalized,
      row.lote_normalized,
    );
    spreadsheetBlockCounts.set(key, (spreadsheetBlockCounts.get(key) ?? 0) + 1);
  }

  const validatedRows = rows.map((row) => {
    try {
      const resolved = resolveRowEntities(row, context);
      return validateSingleRow(resolved, context, spreadsheetBlockCounts);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro interno ao validar a linha.';
      return {
        ...row,
        customer_id: null,
        customer_name: null,
        broker_id: null,
        broker_name: null,
        project_id: null,
        project_name: null,
        block_id: null,
        block_status: null,
        resolved_block_status: 'Vendido' as const,
        resolved_commission_percent: 0,
        payment_type: 'À vista' as const,
        status: 'error' as const,
        messages: [{ level: 'error' as const, text: message }],
        importable: false,
      };
    }
  });

  const summary: SaleImportSummary = {
    totalRows: validatedRows.length,
    validRows: validatedRows.filter((row) => row.status === 'valid').length,
    warningRows: validatedRows.filter((row) => row.status === 'warning').length,
    errorRows: validatedRows.filter((row) => row.status === 'error').length,
    duplicateRows: validatedRows.filter((row) => row.status === 'duplicate').length,
    existingRows: validatedRows.filter((row) => row.status === 'existing').length,
    ignoredRows: validatedRows.filter((row) => !row.importable).length,
    importableRows: validatedRows.filter((row) => row.importable).length,
  };

  return { rows: validatedRows, summary };
}

export function buildSaleInsertPayload(
  row: ValidatedSaleRow,
  tenantId: string,
  userId: string,
): Record<string, unknown> {
  const downPayment = Math.round((row.entrada + row.sinal) * 100) / 100;
  const saleDate = row.data_venda
    ? `${row.data_venda}T12:00:00.000Z`
    : new Date().toISOString();

  return {
    tenant_id: tenantId,
    company_id: tenantId,
    project_id: row.project_id,
    block_id: row.block_id,
    lot_id: row.block_id,
    block_number: row.quadra,
    lot_number: row.lote,
    customer_id: row.customer_id,
    broker_id: row.broker_id,
    user_id: userId,
    agreed_price: row.valor_total,
    lot_price: row.valor_total,
    total_value: row.valor_total,
    down_payment: downPayment,
    discount: 0,
    payment_type: row.payment_type,
    installments_count: row.quantidade_parcelas,
    status: 'ACTIVE',
    sale_date: saleDate,
  };
}

export function buildBlockUpdatePayload(row: ValidatedSaleRow): Record<string, unknown> {
  if (row.resolved_block_status === 'Reservado') {
    const expires = new Date();
    expires.setHours(expires.getHours() + 48);
    return {
      status: 'Reservado',
      price: row.valor_total,
      customer_id: row.customer_id,
      broker_id: row.broker_id,
      reservation_expires_at: expires.toISOString(),
      reservation_date: row.data_venda || new Date().toISOString().slice(0, 10),
    };
  }

  return {
    status: 'Vendido',
    price: row.valor_total,
    customer_id: row.customer_id,
    broker_id: row.broker_id,
  };
}

export function mapSaleRowToFinanceFormData(row: ValidatedSaleRow): Record<string, unknown> {
  const downPayment = Math.round((row.entrada + row.sinal) * 100) / 100;
  return {
    payment_type: row.payment_type,
    final_value: row.valor_total,
    down_payment: downPayment,
    installments_count: String(row.quantidade_parcelas),
    down_payment_due_date: row.data_venda || new Date().toISOString().slice(0, 10),
    first_installment_due_date:
      row.vencimento_primeira_parcela || row.data_venda || new Date().toISOString().slice(0, 10),
    reservation_signal_paid: 0,
  };
}

export function buildSaleMigrationRowDetail(row: ValidatedSaleRow) {
  return {
    lineNumber: row.lineNumber,
    customer_name: row.customer_name,
    broker_name: row.broker_name,
    empreendimento: row.empreendimento,
    quadra: row.quadra,
    lote: row.lote,
    valor_total: row.valor_total,
    status: row.status,
    resolved_block_status: row.resolved_block_status,
    messages: row.messages.map((message) => message.text),
    observacoes: row.observacoes || null,
  };
}
