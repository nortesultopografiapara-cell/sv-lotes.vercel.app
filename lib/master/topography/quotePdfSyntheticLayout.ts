/**
 * Layout compacto do PDF sintético — grade, prosa técnica e preservação de texto.
 */

import { topographyCategoryLabel } from './categories';
import { topographyServiceTypeLabel } from './serviceTypes';
import {
  itemTotalWithBdi,
  itemUnitWithBdi,
  type QuoteFinancialSummary,
} from './quoteFinancials';
import {
  formatQuoteScopeLabelsProse,
  type QuoteScopeSelectedItem,
} from './quoteScopeCatalog';
import type {
  MasterTopographyQuote,
  MasterTopographyQuoteStageWithItems,
} from './quoteTypes';

export type QuotePdfSummaryField = {
  label: string;
  value: string;
  /** Largura relativa na grade (1 = coluna simples; 2 = campo largo). */
  span?: 1 | 2;
};

export type QuotePdfCompositionItemRow = {
  kind: 'item';
  stageName: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: number;
  total: number;
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
  /** commercial = grade; prose = texto corrido; checklist = produtos em colunas */
  layout?: 'prose' | 'commercial-grid' | 'checklist';
  fields?: QuotePdfSummaryField[];
  /** Itens de checklist (produtos entregues). */
  checklistItems?: string[];
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

import {
  sanitizeQuotePdfText,
} from './quotePdfText';

/** Texto útil para o PDF do cliente (sem null/undefined/traços vazios). */
export function isMeaningfulQuotePdfText(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text) return false;
  if (/^(null|undefined|n\/a|na|-|—|–)$/i.test(text)) return false;
  return true;
}

/**
 * Preserva texto cadastrado (incl. percentuais como "50%") sem interpolação/printf.
 * Normaliza para Helvetica/WinAnsi (ex.: − → -) sem alterar o sentido técnico.
 */
export function preserveQuotePdfUserText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return sanitizeQuotePdfText(value).trim();
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
 * Converte listas curtas (uma por linha) em texto corrido com ponto e vírgula.
 * Listas longas / parágrafos reais permanecem como estão.
 */
export function compactListTextToProse(raw: string): string {
  const text = preserveQuotePdfUserText(raw);
  if (!text) return '';

  const lines = text
    .split('\n')
    .map((l) => l.replace(/^[\s•\-\*]+/, '').trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const avgLen = lines.reduce((a, l) => a + l.length, 0) / lines.length;
  const looksLikeShortList =
    lines.length <= 14 &&
    avgLen <= 72 &&
    lines.filter((l) => l.length > 120).length === 0;

  if (!looksLikeShortList) {
    return text;
  }

  const first = lines[0].replace(/[:;.\s]+$/, '');
  const rest = lines.slice(1).map((l) => l.replace(/[;.\s]+$/, ''));

  if (rest.length === 0) return first;

  // "Equipamentos previstos" + itens → "Equipamentos previstos: a; b; c."
  const introLooksLikeHeader =
    first.length <= 48 && !/[.!?]$/.test(lines[0]) && rest.every((r) => r.length < 90);

  if (introLooksLikeHeader) {
    return `${first}: ${rest.join('; ')}.`;
  }

  return `${lines.map((l) => l.replace(/[;.\s]+$/, '')).join('; ')}.`;
}

/**
 * RESUMO DA PROPOSTA — somente campos preenchidos (para grade horizontal).
 * Forma de pagamento ocupa span 2 (texto geralmente maior).
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
    fields.push({
      label: 'Prazo estimado',
      value: preserveQuotePdfUserText(quote.estimated_deadline),
    });
  }
  if (isMeaningfulQuotePdfText(quote.internal_manager)) {
    fields.push({
      label: 'Responsável',
      value: preserveQuotePdfUserText(quote.internal_manager),
    });
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
    fields.push({ label: 'Validade', value: validity });
  }

  // Preferir o texto completo cadastrado — sem reinterpretar percentuais.
  const paymentMethod = preserveQuotePdfUserText(quote.payment_method);
  if (isMeaningfulQuotePdfText(paymentMethod)) {
    fields.push({
      label: 'Forma de pagamento',
      value: paymentMethod,
      span: 2,
    });
  }

  return fields;
}

/** Monta linhas da grade (5 colunas padrão; span 2 para campos largos). */
export function buildQuotePdfSummaryGridRows(
  fields: QuotePdfSummaryField[],
  columns = 5,
): QuotePdfSummaryField[][] {
  const rows: QuotePdfSummaryField[][] = [];
  let current: QuotePdfSummaryField[] = [];
  let used = 0;

  for (const field of fields) {
    const span = Math.min(field.span ?? 1, columns);
    if (used + span > columns && current.length) {
      rows.push(current);
      current = [];
      used = 0;
    }
    current.push({ ...field, span });
    used += span;
    if (used >= columns) {
      rows.push(current);
      current = [];
      used = 0;
    }
  }
  if (current.length) rows.push(current);
  return rows;
}

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

export const QUOTE_PDF_CLIENT_TABLE_HEADERS = [
  'Descrição',
  'Qtd.',
  'Un.',
  'Valor unitário',
  'Total',
] as const;

/**
 * Frações da largura útil da tabela financeira (somam 1).
 * Usadas tanto no cabeçalho quanto nas linhas — nunca duplicar medidas.
 */
export const QUOTE_PDF_TABLE_WIDTH_FRACTIONS = {
  description: 0.62,
  quantity: 0.06,
  unit: 0.06,
  unitPrice: 0.13,
  total: 0.13,
} as const;

export type QuotePdfTableColumnWidths = {
  description: number;
  quantity: number;
  unit: number;
  unitPrice: number;
  total: number;
};

/** Larguras absolutas (mm) a partir da largura útil — cabeçalho e corpo compartilham. */
export function resolveQuotePdfTableColumnWidths(
  contentWidth: number,
): QuotePdfTableColumnWidths {
  const fr = QUOTE_PDF_TABLE_WIDTH_FRACTIONS;
  const description = contentWidth * fr.description;
  const quantity = contentWidth * fr.quantity;
  const unit = contentWidth * fr.unit;
  const unitPrice = contentWidth * fr.unitPrice;
  // Absorve residual de ponto flutuante na última coluna.
  const total = contentWidth - description - quantity - unit - unitPrice;
  return { description, quantity, unit, unitPrice, total };
}

export function quotePdfCompositionUsesClientColumnsOnly(
  rows: QuotePdfCompositionRow[],
): boolean {
  return rows.every((row) => row.kind === 'stage' || row.kind === 'item');
}

/**
 * Campos exclusivos de CONDIÇÕES COMERCIAIS (sem repetir o RESUMO).
 * Pagamento, prazo, validade e condições de pagamento ficam só no resumo
 * (ou ocultos no sintético) — esta função não os inclui.
 */
export function buildQuotePdfCommercialFields(
  _quote: MasterTopographyQuote,
): QuotePdfSummaryField[] {
  // Modelo sintético: sem bloco comercial duplicado. Mantém a API para extensão futura.
  void _quote;
  return [];
}

/** Normalização segura para comparar texto livre × recursos estruturados (sem IA). */
export function normalizeQuoteTextKey(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitTechnicalNotesUnits(raw: string): string[] {
  const fromLines = raw
    .split(/\n+/)
    .map((l) => l.replace(/^[\s•\-\*]+/, '').trim())
    .filter(Boolean);
  const units: string[] = [];
  for (const line of fromLines) {
    const sentences = line
      .split(/(?<=[.!;])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length > 1) units.push(...sentences);
    else units.push(line);
  }
  return units;
}

/**
 * True quando a unidade de texto só repete (quase) integralmente um ou mais rótulos
 * já presentes nos recursos estruturados — ex.: "DJI Terra e softwares especializados…".
 */
export function isTechnicalNotesUnitRedundant(
  unit: string,
  resourceKeys: string[],
): boolean {
  const key = normalizeQuoteTextKey(unit);
  if (!key) return true;
  if (/^equipamentos?\b/.test(key) && key.length < 48) return true;
  if (resourceKeys.includes(key)) return true;

  // Unidade curta que contém exatamente um rótulo estruturado (quase igual).
  for (const rk of resourceKeys) {
    if (!rk) continue;
    if (key === rk) return true;
    if (key.includes(rk) && key.length <= rk.length + 12) return true;
  }

  // Frase composta só por rótulos estruturados unidos por "e"/vírgulas/"para processamento".
  let remainder = key;
  const sorted = [...resourceKeys].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const rk of sorted) {
    if (remainder.includes(rk)) {
      remainder = remainder.replace(rk, ' ').replace(/\s+/g, ' ').trim();
    }
  }
  remainder = remainder
    .replace(/\b(e|ou|com|para|de|do|da|dos|das|processamento|especializados?|softwares?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Se após remover rótulos + conectores sobra pouco/nada → redundante.
  if (remainder.length <= 2) return true;

  return false;
}

/**
 * Seções pós-tabela — Observações internas NUNCA entram no PDF do cliente.
 * Equipamentos estruturados têm prioridade; texto livre só entra como complementar
 * (sentenças que repetem rótulos estruturados são omitidas na renderização, sem apagar o banco).
 */
export function filterComplementaryTechnicalNotes(
  technicalNotes: string | null | undefined,
  resources: QuoteScopeSelectedItem[],
): string {
  const raw = preserveQuotePdfUserText(technicalNotes);
  if (!raw) return '';
  if (!resources.length) return compactListTextToProse(raw);

  const resourceKeys = resources
    .map((r) => normalizeQuoteTextKey(String(r.label || '')))
    .filter(Boolean);

  const kept: string[] = [];
  for (const unit of splitTechnicalNotesUnits(raw)) {
    if (isTechnicalNotesUnitRedundant(unit, resourceKeys)) continue;
    kept.push(unit);
  }

  if (!kept.length) return '';
  return compactListTextToProse(kept.join(' '));
}

export function buildQuotePdfNarrativeSections(
  quote: MasterTopographyQuote,
  options?: { deliveredProducts?: string | null },
): QuotePdfTextSection[] {
  const sections: QuotePdfTextSection[] = [];

  if (isMeaningfulQuotePdfText(quote.description)) {
    sections.push({
      title: 'DESCRIÇÃO DOS SERVIÇOS',
      body: preserveQuotePdfUserText(quote.description).replace(/\n{3,}/g, '\n\n'),
      layout: 'prose',
    });
  }

  const resources = Array.isArray(quote.technical_resources)
    ? (quote.technical_resources as QuoteScopeSelectedItem[])
    : [];
  const resourcesProse = formatQuoteScopeLabelsProse(resources);

  const technicalParts: string[] = [];
  if (resourcesProse) {
    technicalParts.push(`Equipamentos e recursos previstos: ${resourcesProse}.`);
    const complementary = filterComplementaryTechnicalNotes(quote.technical_notes, resources);
    if (complementary) technicalParts.push(complementary);
  } else if (isMeaningfulQuotePdfText(quote.technical_notes)) {
    technicalParts.push(compactListTextToProse(String(quote.technical_notes)));
  }
  if (isMeaningfulQuotePdfText(options?.deliveredProducts)) {
    technicalParts.push(compactListTextToProse(String(options?.deliveredProducts)));
  }
  if (technicalParts.length) {
    sections.push({
      title: 'INFORMAÇÕES TÉCNICAS',
      body: technicalParts.join(' '),
      layout: 'prose',
    });
  }

  const deliverables = Array.isArray(quote.deliverables) ? quote.deliverables : [];
  const deliverableLabels = deliverables
    .map((d) => preserveQuotePdfUserText(d?.label))
    .filter((l) => isMeaningfulQuotePdfText(l));
  if (deliverableLabels.length) {
    sections.push({
      title: 'PRODUTOS E DADOS ENTREGUES',
      // Bullet ASCII compatível com Helvetica/WinAnsi (evita ✓ quebrado).
      body: deliverableLabels.map((l) => `- ${l}`).join('\n'),
      layout: 'checklist',
      checklistItems: deliverableLabels,
    });
  }

  const commercial = buildQuotePdfCommercialFields(quote);
  if (commercial.length) {
    sections.push({
      title: 'CONDIÇÕES COMERCIAIS',
      body: commercial.map((f) => `${f.label}: ${f.value}`).join(' · '),
      layout: 'commercial-grid',
      fields: commercial,
    });
  }

  return sections;
}

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

export function quotePdfClientTextExcludesInternalNotes(
  quote: MasterTopographyQuote,
  renderedTexts: string[],
): boolean {
  const notes = String(quote.internal_notes || '').trim();
  if (!notes) return true;
  return !renderedTexts.some((t) => t.includes(notes));
}

export function resolveQuotePdfDisplayUnitPrice(
  adopted: number,
  bdiPercent: number,
): number {
  void bdiPercent;
  void itemUnitWithBdi;
  return adopted;
}

/**
 * Heurística: orçamento “pequeno” (poucos itens / poucas etapas) deve caber em 1 página
 * com o layout compacto — usada em testes e documentação; o PDF não força escala de fonte.
 */
export function isCompactSinglePageQuoteCandidate(input: {
  itemCount: number;
  stageCount: number;
  hasLongNarrative?: boolean;
}): boolean {
  if (input.itemCount <= 0) return true;
  if (input.itemCount <= 8 && input.stageCount <= 2 && !input.hasLongNarrative) return true;
  if (input.itemCount <= 12 && input.stageCount <= 1 && !input.hasLongNarrative) return true;
  return false;
}
