/**
 * Vinculação manual — contratos antigos (Migração de Dados).
 */

import { lookupBlockInIndex } from '@/lib/imports/modules/sales/blockMatch';
import { lookupLegacyContractCustomerByName } from '@/lib/imports/modules/legacy-contracts/lookupIndex';
import {
  buildLegacyContractSaleKey,
  normalizeImportEntityName,
  normalizeImportLoteNumber,
  normalizeImportQuadra,
} from '@/lib/imports/modules/legacy-contracts/normalize';
import type {
  LegacyContractImportContext,
  LegacyContractImportSummary,
  LegacyContractManualLinkInput,
  LegacyContractManualLinkOverride,
  ValidatedLegacyContractRow,
} from '@/lib/imports/modules/legacy-contracts/types';

export type LegacyContractManualLinkResolution = {
  project_id: string;
  project_name: string;
  block_id: string;
  customer_id: string;
  customer_name: string;
  sale_id: string;
};

export function canLegacyContractRowBeManuallyLinked(
  row: ValidatedLegacyContractRow,
): boolean {
  if (row.manual_link_applied) return false;
  if (row.status === 'existing' || row.status === 'duplicate') return false;
  if (!row.nome_arquivo_pdf.trim()) return false;
  return !row.sale_id || row.status === 'error';
}

export function resolveLegacyContractManualLink(
  context: LegacyContractImportContext,
  input: LegacyContractManualLinkInput,
): { ok: true; resolution: LegacyContractManualLinkResolution } | { ok: false; error: string } {
  const projectId = String(input.project_id || '').trim();
  const quadra = String(input.quadra || '').trim();
  const lote = String(input.lote || '').trim();
  const customerName = String(input.customer_name || '').trim();

  if (!projectId) return { ok: false, error: 'Selecione o empreendimento.' };
  if (!quadra) return { ok: false, error: 'Informe a quadra.' };
  if (!lote) return { ok: false, error: 'Informe o lote.' };
  if (!customerName) return { ok: false, error: 'Informe o nome do cliente.' };

  const project = context.projectsById.get(projectId);
  if (!project) {
    return { ok: false, error: 'Empreendimento não encontrado no sistema.' };
  }

  const block =
    lookupBlockInIndex(context.blocks, projectId, quadra, lote) ||
    lookupBlockInIndex(
      context.blocks,
      projectId,
      normalizeImportQuadra(quadra),
      normalizeImportLoteNumber(lote),
    );

  if (!block) {
    return {
      ok: false,
      error: 'Quadra/lote não encontrado no empreendimento informado.',
    };
  }

  const customer = lookupLegacyContractCustomerByName(context, customerName);
  if (!customer) {
    return {
      ok: false,
      error: 'Cliente não encontrado. Verifique o nome informado.',
    };
  }

  const sale =
    context.salesByCustomerBlock.get(
      buildLegacyContractSaleKey(customer.id, block.id),
    ) || null;

  if (!sale) {
    return {
      ok: false,
      error: 'Venda não encontrada para este cliente no lote informado.',
    };
  }

  if (context.legacyDocumentBySaleId.has(sale.id)) {
    return {
      ok: false,
      error: 'Contrato antigo já anexado para esta venda.',
    };
  }

  return {
    ok: true,
    resolution: {
      project_id: project.id,
      project_name: project.name,
      block_id: block.id,
      customer_id: customer.id,
      customer_name: customer.name,
      sale_id: sale.id,
    },
  };
}

export function applyLegacyContractManualLinkToRow(
  row: ValidatedLegacyContractRow,
  input: LegacyContractManualLinkInput,
  resolution: LegacyContractManualLinkResolution,
): ValidatedLegacyContractRow {
  const observacoes = String(input.observacoes || '').trim();
  const mergedObservacoes = observacoes
    ? [row.observacoes, observacoes].filter(Boolean).join(' | ')
    : row.observacoes;

  return {
    ...row,
    empreendimento: resolution.project_name,
    empreendimento_normalized: normalizeImportEntityName(resolution.project_name),
    quadra: input.quadra.trim(),
    quadra_normalized: normalizeImportQuadra(input.quadra),
    lote: input.lote.trim(),
    lote_normalized: normalizeImportLoteNumber(input.lote),
    customer_id: resolution.customer_id,
    customer_name: resolution.customer_name,
    project_id: resolution.project_id,
    project_name: resolution.project_name,
    block_id: resolution.block_id,
    sale_id: resolution.sale_id,
    existing_legacy_document_id: null,
    manual_link_applied: true,
    manual_link_notes: observacoes || null,
    status: 'valid',
    importable: row.pdf_found,
    messages: [
      {
        level: 'info',
        text: 'Vinculado manualmente durante a migração.',
      },
      ...(mergedObservacoes
        ? [{ level: 'info' as const, text: `Observações: ${mergedObservacoes}` }]
        : []),
    ],
    observacoes: mergedObservacoes,
  };
}

export function recalculateLegacyContractImportSummary(
  rows: ValidatedLegacyContractRow[],
): LegacyContractImportSummary {
  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === 'valid').length,
    warningRows: rows.filter((row) => row.status === 'warning').length,
    errorRows: rows.filter((row) => row.status === 'error').length,
    duplicateRows: rows.filter((row) => row.status === 'duplicate').length,
    existingRows: rows.filter((row) => row.status === 'existing').length,
    ignoredRows: rows.filter((row) => !row.importable).length,
    importableRows: rows.filter((row) => row.importable).length,
  };
}

export function buildLegacyContractManualLinkOverrides(
  rows: ValidatedLegacyContractRow[],
): LegacyContractManualLinkOverride[] {
  return rows
    .filter((row) => row.manual_link_applied)
    .map((row) => ({
      lineNumber: row.lineNumber,
      project_id: row.project_id || '',
      quadra: row.quadra,
      lote: row.lote,
      customer_name: row.customer_name || '',
      observacoes: row.manual_link_notes || row.observacoes || undefined,
    }))
    .filter(
      (entry) =>
        entry.project_id &&
        entry.quadra.trim() &&
        entry.lote.trim() &&
        entry.customer_name.trim(),
    );
}

export function applyManualLinkOverridesToValidationRows(
  rows: ValidatedLegacyContractRow[],
  overrides: LegacyContractManualLinkOverride[],
  context: LegacyContractImportContext,
): ValidatedLegacyContractRow[] {
  if (overrides.length === 0) return rows;

  const overrideByLine = new Map(
    overrides.map((override) => [override.lineNumber, override]),
  );

  return rows.map((row) => {
    const override = overrideByLine.get(row.lineNumber);
    if (!override) return row;

    const resolved = resolveLegacyContractManualLink(context, override);
    if (!resolved.ok) {
      return {
        ...row,
        status: 'error',
        importable: false,
        messages: [
          ...row.messages,
          { level: 'error', text: resolved.error },
        ],
      };
    }

    return applyLegacyContractManualLinkToRow(row, override, resolved.resolution);
  });
}
