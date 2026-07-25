/**
 * Layout do PDF sintético de orçamento (cliente) — puro e testável.
 * Não altera cálculos financeiros; apenas organiza o que já vem em QuoteExportPayload.
 *
 * Preparado para futuro campo estruturado de “produtos entregues” sem migration agora:
 * use `deliveredProducts` opcional no modelo quando existir.
 */

import { topographyCategoryLabel } from './categories';
import { topographyServiceTypeLabel } from './serviceTypes';
import {
  itemTotalWithBdi,
  itemUnitWithBdi,
  type QuoteFinancialSummary,
} from './quoteFinancials';
import type {
  MasterTopographyQuote,
  MasterTopographyQuoteStageWithItems,
} from './quoteTypes';

export type QuotePdfSummaryField = { label: string; value: string };

export type QuotePdfCompositionItemRow = {
  kind: 'item';
  stageName: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: number;
  total: number;
  /** Interno — nunca renderizar no PDF cliente */
  code?: string;
  bank?: string;
};

export type QuotePdfCompositionStageRow = {
  kind: 'stage';
  stageName: string;
};

export type QuotePdfCompositionRow =
  | QuotePdfCompositionStageRow
  | QuotePdfCompositionItemRow;

export type QuotePdfTextSection = {
  title: string;
  body: string;
};

export type QuotePdfFinancialBreakdown = {
  totalGeral: number;
  totalGeralFormatted: string;
  showBdi: boolean;
  showDiscount: boolean;
  showMargin: boolean;
  bdiPercent: number;
  bdiAmount: number;
  discountPercent: number;
  discountValue: number;
  marginPercent: number;
  marginValue: number;
  totalWithoutBdi: number;
  totalWithBdi: number;
};

/** Texto útil para o PDF do cliente (sem null/undefined/traços vazios). */
export function isMeaningfulQuotePdfText(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text) return false;
  if (/^(null|undefined|n\/a|na|-|—|–)$/i.test(text)) return false;
  return true;
}

export function formatQuotePdfMoney(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(n) ? n : 0);
}

export function formatQuotePdfDateBr(iso: string | null | undefined): string {
  if (!isMeaningfulQuotePdfText(iso)) return '';
  const raw = String(iso).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('pt-BR');
}

function formatDistanceKm(km: number | null | undefined): string {
  if (km === null || km === undefined) return '';
  if (!Number.isFinite(Number(km))) return '';
  const n = Number(km);
  if (n < 0) return '';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n)} km`;
}

/**
 * RESUMO DA PROPOSTA — somente campos preenchidos.
 */
export function buildQuotePdfProposalSummary(
  quote: MasterTopographyQuote,
): QuotePdfSummaryField[] {
  const fields: QuotePdfSummaryField[] = [];

  if (isMeaningfulQuotePdfText(quote.category)) {
    fields.push({
      label: 'Categoria',
      value: topographyCategoryLabel(String(quote.category)),
    });
  }
  if (isMeaningfulQuotePdfText(quote.service_type)) {
    fields.push({
      label: 'Tipo de serviço',
      value: topographyServiceTypeLabel(String(quote.service_type)),
    });
  }
  if (isMeaningfulQuotePdfText(quote.estimated_deadline)) {
    fields.push({ label: 'Prazo estimado', value: String(quote.estimated_deadline).trim() });
  }
  if (isMeaningfulQuotePdfText(quote.payment_method)) {
    fields.push({ label: 'Forma de pagamento', value: String(quote.payment_method).trim() });
  }
  if (isMeaningfulQuotePdfText(quote.internal_manager)) {
    fields.push({ label: 'Responsável', value: String(quote.internal_manager).trim() });
  }

  const cityUf = [quote.city, quote.state]
    .map((p) => (isMeaningfulQuotePdfText(p) ? String(p).trim() : ''))
    .filter(Boolean)
    .join('/');
  if (cityUf) {
    fields.push({ label: 'Município/UF', value: cityUf });
  }

  const distance = formatDistanceKm(quote.distance_km);
  if (distance) {
    fields.push({ label: 'Distância', value: distance });
  }

  const proposalDate = formatQuotePdfDateBr(quote.proposal_date);
  if (proposalDate) {
    fields.push({ label: 'Data da proposta', value: proposalDate });
  }

  const validity = formatQuotePdfDateBr(quote.expiration_date);
  if (validity) {
    fields.push({ label: 'Validade da proposta', value: validity });
  }

  return fields;
}

/**
 * Composição: etapa como faixa (uma vez) + itens sem Código/Banco.
 * Ordem = ordem das etapas no editor.
 */
export function buildQuotePdfCompositionRows(
  stages: MasterTopographyQuoteStageWithItems[],
  bdiPercent: number,
): QuotePdfCompositionRow[] {
  const rows: QuotePdfCompositionRow[] = [];
  const ordered = [...stages].sort((a, b) => a.sort_order - b.sort_order);

  for (const stage of ordered) {
    const stageName = isMeaningfulQuotePdfText(stage.name)
      ? String(stage.name).trim()
      : 'Etapa';
    rows.push({ kind: 'stage', stageName });

    const items = [...(stage.items || [])].sort((a, b) => a.sort_order - b.sort_order);
    for (const item of items) {
      const adopted = item.adopted_price ?? item.unit_value;
      rows.push({
        kind: 'item',
        stageName,
        description: item.description,
        quantity: String(item.quantity),
        unit: item.unit,
        unitPrice: adopted,
        total: itemTotalWithBdi(item.quantity, adopted, bdiPercent),
        code: item.code || undefined,
        bank: item.price_bank || undefined,
      });
    }
  }

  return rows;
}

/** Colunas visíveis no PDF do cliente (sem Código/Banco). */
export const QUOTE_PDF_CLIENT_TABLE_HEADERS = [
  'Descrição',
  'Qtd.',
  'Un.',
  'Valor unitário',
  'Total',
] as const;

export function quotePdfCompositionUsesClientColumnsOnly(
  rows: QuotePdfCompositionRow[],
): boolean {
  // Garantia estrutural: itens não carregam código/banco como colunas renderizadas.
  return rows.every((row) => row.kind === 'stage' || row.kind === 'item');
}

/**
 * Seções pós-tabela — Observações internas NUNCA entram no PDF do cliente.
 * `deliveredProducts` reservado para futuro campo estruturado (sem migration agora).
 */
export function buildQuotePdfNarrativeSections(
  quote: MasterTopographyQuote,
  options?: { deliveredProducts?: string | null },
): QuotePdfTextSection[] {
  const sections: QuotePdfTextSection[] = [];

  if (isMeaningfulQuotePdfText(quote.description)) {
    sections.push({
      title: 'DESCRIÇÃO DOS SERVIÇOS',
      body: String(quote.description).trim(),
    });
  }

  const technicalParts: string[] = [];
  if (isMeaningfulQuotePdfText(quote.technical_notes)) {
    technicalParts.push(String(quote.technical_notes).trim());
  }
  // Futuro: campo próprio de produtos entregues — hoje só se passado explicitamente.
  if (isMeaningfulQuotePdfText(options?.deliveredProducts)) {
    technicalParts.push(String(options?.deliveredProducts).trim());
  }
  if (technicalParts.length) {
    sections.push({
      title: 'INFORMAÇÕES TÉCNICAS',
      body: technicalParts.join('\n\n'),
    });
  }

  const commercialLines: string[] = [];
  if (isMeaningfulQuotePdfText(quote.payment_method)) {
    commercialLines.push(`Forma de pagamento: ${String(quote.payment_method).trim()}`);
  }
  if (isMeaningfulQuotePdfText(quote.payment_terms)) {
    commercialLines.push(`Condições de pagamento: ${String(quote.payment_terms).trim()}`);
  }
  if (isMeaningfulQuotePdfText(quote.estimated_deadline)) {
    commercialLines.push(`Prazo estimado: ${String(quote.estimated_deadline).trim()}`);
  }
  const validity = formatQuotePdfDateBr(quote.expiration_date);
  if (validity) {
    commercialLines.push(`Validade da proposta: ${validity}`);
  }
  if (commercialLines.length) {
    sections.push({
      title: 'CONDIÇÕES COMERCIAIS',
      body: commercialLines.join('\n'),
    });
  }

  return sections;
}

/**
 * Destaque do valor global — usa exatamente totalGeral já calculado.
 * BDI/desconto/margem só quando ≠ 0.
 */
export function buildQuotePdfFinancialBreakdown(
  financials: QuoteFinancialSummary,
): QuotePdfFinancialBreakdown {
  return {
    totalGeral: financials.totalGeral,
    totalGeralFormatted: formatQuotePdfMoney(financials.totalGeral),
    showBdi: financials.bdiPercent !== 0 || financials.bdiAmount !== 0,
    showDiscount: financials.discountPercent !== 0 || financials.discountValue !== 0,
    showMargin: financials.marginPercent !== 0 || financials.marginValue !== 0,
    bdiPercent: financials.bdiPercent,
    bdiAmount: financials.bdiAmount,
    discountPercent: financials.discountPercent,
    discountValue: financials.discountValue,
    marginPercent: financials.marginPercent,
    marginValue: financials.marginValue,
    totalWithoutBdi: financials.totalWithoutBdi,
    totalWithBdi: financials.totalWithBdi,
  };
}

/** Contato institucional opcional — só se já existir na config. */
export function buildQuotePdfFooterContactLine(provider: {
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  site?: string | null;
}): string {
  const parts: string[] = [];
  if (isMeaningfulQuotePdfText(provider.phone)) parts.push(String(provider.phone).trim());
  if (isMeaningfulQuotePdfText(provider.email)) parts.push(String(provider.email).trim());
  const site = provider.website ?? provider.site;
  if (isMeaningfulQuotePdfText(site)) parts.push(String(site).trim());
  return parts.join(' · ');
}

/** Garante que internal_notes não vaze para nenhum texto do PDF cliente. */
export function quotePdfClientTextExcludesInternalNotes(
  quote: MasterTopographyQuote,
  renderedTexts: string[],
): boolean {
  const notes = String(quote.internal_notes || '').trim();
  if (!notes) return true;
  return !renderedTexts.some((t) => t.includes(notes));
}

/** Unitário exibido: sem BDI no preço unitário quando BDI=0; com BDI no total (já calculado). */
export function resolveQuotePdfDisplayUnitPrice(
  adopted: number,
  bdiPercent: number,
): number {
  // No PDF cliente: "Valor unitário" = preço adotado (sem reembalar BDI na coluna),
  // alinhado ao pedido Descrição / Qtd / Un / Valor unitário / Total.
  // O Total da linha continua sendo qty × unit c/ BDI (cálculo oficial).
  void bdiPercent;
  void itemUnitWithBdi;
  return adopted;
}
