/**
 * Validação linha a linha — contratos antigos.
 */

import { lookupBlockInIndex, suggestSimilarBlocks } from '@/lib/imports/modules/sales/blockMatch';
import {
  lookupLegacyContractCustomer,
} from '@/lib/imports/modules/legacy-contracts/lookupIndex';
import {
  buildLegacyContractSaleKey,
  parseLegacyContractDate,
} from '@/lib/imports/modules/legacy-contracts/normalize';
import {
  lookupLegacyContractPdf,
  suggestSimilarPdfNames,
} from '@/lib/imports/modules/legacy-contracts/pdfIndex';
import type {
  LegacyContractImportContext,
  LegacyContractImportRowMessage,
  LegacyContractImportSummary,
  LegacyContractPdfIndex,
  LegacyContractRowStatus,
  ParsedLegacyContractRow,
  ResolvedLegacyContractRow,
  ValidatedLegacyContractRow,
} from '@/lib/imports/modules/legacy-contracts/types';
import { isValidBrazilianTaxDocument } from '@/lib/inputMasks';

function resolveRow(
  row: ParsedLegacyContractRow,
  context: LegacyContractImportContext,
  pdfIndex: LegacyContractPdfIndex,
): ResolvedLegacyContractRow {
  const customer = lookupLegacyContractCustomer(
    context,
    row.cliente_cpf_cnpj_digits,
    row.cliente_email_normalized,
  );

  const project = context.projects.get(row.empreendimento_normalized) || null;
  let block = null;
  if (project) {
    block =
      lookupBlockInIndex(context.blocks, project.id, row.quadra, row.lote) || null;
  }

  let sale = null;
  if (customer && block) {
    sale = context.salesByCustomerBlock.get(buildLegacyContractSaleKey(customer.id, block.id)) || null;
  }

  if (!sale && row.nome_arquivo_pdf_normalized) {
    const saleKey = row.nome_arquivo_pdf_normalized.replace(/\.pdf$/i, '');
    sale = context.salesById.get(saleKey) || null;
  }

  let resolvedCustomer = customer;
  let resolvedProject = project;
  let resolvedBlock = block;

  if (sale) {
    resolvedCustomer =
      (sale.customer_id ? context.customersById.get(sale.customer_id) : null) ?? resolvedCustomer;
    resolvedProject =
      (sale.project_id ? context.projectsById.get(sale.project_id) : null) ?? resolvedProject;
    resolvedBlock =
      (sale.block_id ? context.blocksById.get(sale.block_id) : null) ?? resolvedBlock;
  }

  const pdfBuffer = lookupLegacyContractPdf(pdfIndex, row.nome_arquivo_pdf);
  const existingLegacy = sale
    ? context.legacyDocumentBySaleId.get(sale.id) || null
    : null;

  return {
    ...row,
    customer_id: resolvedCustomer?.id ?? null,
    customer_name: resolvedCustomer?.name ?? null,
    project_id: resolvedProject?.id ?? null,
    project_name: resolvedProject?.name ?? null,
    block_id: resolvedBlock?.id ?? null,
    sale_id: sale?.id ?? null,
    pdf_found: Boolean(pdfBuffer),
    pdf_buffer_key: row.nome_arquivo_pdf_normalized,
    existing_legacy_document_id: existingLegacy?.id ?? null,
  };
}

function validateSingleRow(
  row: ResolvedLegacyContractRow,
  context: LegacyContractImportContext,
  pdfIndex: LegacyContractPdfIndex,
  spreadsheetPdfCounts: Map<string, number>,
): ValidatedLegacyContractRow {
  const messages: LegacyContractImportRowMessage[] = [];
  let status: LegacyContractRowStatus = 'valid';

  const pushMessage = (message: LegacyContractImportRowMessage) => {
    messages.push(message);
    if (message.level === 'error') status = 'error';
    else if (message.level === 'warning' && status === 'valid') status = 'warning';
  };

  if (row.cliente_cpf_cnpj_digits && !isValidBrazilianTaxDocument(row.cliente_cpf_cnpj_digits)) {
    pushMessage({
      level: 'error',
      text: 'CPF/CNPJ do cliente informado não possui quantidade válida de dígitos (11 ou 14).',
    });
  }

  const hasCustomerIdentifier = row.cliente_cpf_cnpj_digits || row.cliente_email_normalized;
  if (!row.sale_id) {
    if (!hasCustomerIdentifier) {
      pushMessage({
        level: 'error',
        text: 'Informe CPF/CNPJ ou e-mail do cliente para localização.',
      });
    } else if (!row.customer_id) {
      pushMessage({ level: 'error', text: 'Cliente não localizado.' });
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
      const hint =
        suggestions.length > 0 ? ` Sugestões: ${suggestions.join(', ')}` : '';
      pushMessage({
        level: 'error',
        text: `Quadra/lote não encontrado no empreendimento informado.${hint}`,
      });
    }

    if (row.customer_id && row.block_id && !row.sale_id) {
      pushMessage({ level: 'error', text: 'Venda não localizada.' });
    }
  } else if (!row.customer_id) {
    pushMessage({ level: 'error', text: 'Venda localizada, mas cliente não encontrado.' });
  }

  if (!row.nome_arquivo_pdf.trim()) {
    pushMessage({ level: 'error', text: 'Nome do arquivo PDF é obrigatório.' });
  } else if (!row.pdf_found) {
    const suggestions = suggestSimilarPdfNames(pdfIndex, row.nome_arquivo_pdf);
    const hint =
      suggestions.length > 0 ? ` Sugestões: ${suggestions.join(', ')}` : '';
    pushMessage({
      level: 'error',
      text: `PDF não encontrado no upload/ZIP: ${row.nome_arquivo_pdf}.${hint}`,
    });
  }

  if (row.data_contrato_raw.trim() && !row.data_contrato) {
    const parsedDate = parseLegacyContractDate(row.data_contrato_raw);
    if (parsedDate.error) pushMessage({ level: 'warning', text: parsedDate.error });
  }

  if (row.status_contrato_raw) {
    const normalizedStatus = row.status_contrato_raw.trim().toUpperCase();
    const allowed = ['ASSINADO', 'PENDENTE', 'CANCELADO', 'QUITADO', 'ANTIGO'];
    if (!allowed.includes(normalizedStatus)) {
      pushMessage({
        level: 'warning',
        text: `Status não reconhecido ("${row.status_contrato_raw}") — será registrado como ANTIGO.`,
      });
    }
  }

  if (row.existing_legacy_document_id && status !== 'error') {
    status = 'existing';
    messages.push({
      level: 'info',
      text: 'Contrato antigo já anexado para esta venda — linha ignorada.',
    });
  }

  if (row.nome_arquivo_pdf_normalized) {
    const dupCount = spreadsheetPdfCounts.get(row.nome_arquivo_pdf_normalized) ?? 0;
    if (dupCount > 1 && status !== 'error') {
      status = 'duplicate';
      pushMessage({ level: 'error', text: 'PDF duplicado dentro da planilha.' });
    }
  }

  if (row.observacoes.trim()) {
    pushMessage({
      level: 'info',
      text: 'Observações serão registradas no histórico da migração.',
    });
  }

  return {
    ...row,
    status,
    messages,
    importable: status === 'valid' || status === 'warning',
  };
}

export function validateLegacyContractRows(
  rows: ParsedLegacyContractRow[],
  context: LegacyContractImportContext,
  pdfIndex: LegacyContractPdfIndex,
): { rows: ValidatedLegacyContractRow[]; summary: LegacyContractImportSummary } {
  const spreadsheetPdfCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.nome_arquivo_pdf_normalized) continue;
    spreadsheetPdfCounts.set(
      row.nome_arquivo_pdf_normalized,
      (spreadsheetPdfCounts.get(row.nome_arquivo_pdf_normalized) ?? 0) + 1,
    );
  }

  const validatedRows = rows.map((row) => {
    try {
      const resolved = resolveRow(row, context, pdfIndex);
      return validateSingleRow(resolved, context, pdfIndex, spreadsheetPdfCounts);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro interno ao validar a linha.';
      return {
        ...row,
        customer_id: null,
        customer_name: null,
        project_id: null,
        project_name: null,
        block_id: null,
        sale_id: null,
        pdf_found: false,
        pdf_buffer_key: null,
        existing_legacy_document_id: null,
        status: 'error' as const,
        messages: [{ level: 'error' as const, text: message }],
        importable: false,
      };
    }
  });

  const summary: LegacyContractImportSummary = {
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

export function buildLegacyContractMigrationRowDetail(row: ValidatedLegacyContractRow) {
  return {
    lineNumber: row.lineNumber,
    customer_name: row.customer_name,
    empreendimento: row.empreendimento,
    quadra: row.quadra,
    lote: row.lote,
    sale_id: row.sale_id,
    numero_contrato_antigo: row.numero_contrato_antigo,
    nome_arquivo_pdf: row.nome_arquivo_pdf,
    status_contrato: row.status_contrato,
    status: row.status,
    messages: row.messages.map((message) => message.text),
    observacoes: row.observacoes || null,
  };
}
