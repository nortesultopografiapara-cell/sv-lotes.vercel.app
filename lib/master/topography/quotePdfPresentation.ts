/**
 * Helpers de apresentação PDF (cronograma, profissional, categorias, %) — sem alterar cálculos.
 */

import {
  deliverablesCatalog,
  findCatalogOptionByLabel,
  normalizeQuoteScopeLabelKey,
  technicalResourcesCatalog,
  type QuoteScopeSelectedItem,
} from './quoteScopeCatalog';
import { isMeaningfulQuotePdfText, preserveQuotePdfUserText } from './quotePdfSyntheticLayout';
import type { MasterTopographyQuote } from './quoteTypes';

export const EQUIPMENT_CATEGORY_ORDER = [
  'Aeronave',
  'Sensor',
  'Posicionamento',
  'Topografia',
  'Apoio',
  'Software',
  'Outros',
] as const;

export const PRODUCT_CATEGORY_ORDER = [
  'Dados brutos',
  'Nuvem de pontos',
  'Modelos digitais',
  'Cartografia',
  'Relatórios',
  'Formatos digitais',
  'Outros',
] as const;

const LEGACY_EQUIPMENT_CATEGORY: Record<string, string> = {
  drone: 'Aeronave',
  aeronave: 'Aeronave',
  sensor: 'Sensor',
  gnss: 'Posicionamento',
  posicionamento: 'Posicionamento',
  topografia: 'Topografia',
  apoio: 'Apoio',
  software: 'Software',
  outros: 'Outros',
};

const LEGACY_PRODUCT_CATEGORY: Record<string, string> = {
  'dados brutos': 'Dados brutos',
  'nuvem de pontos': 'Nuvem de pontos',
  'modelos digitais': 'Modelos digitais',
  cartografia: 'Cartografia',
  documentos: 'Relatórios',
  relatorios: 'Relatórios',
  relatórios: 'Relatórios',
  'arquivos digitais': 'Formatos digitais',
  'formatos digitais': 'Formatos digitais',
  outros: 'Outros',
};

function mapCategoryLabel(
  raw: string | undefined,
  legacy: Record<string, string>,
  allowed: readonly string[],
): string {
  if (!raw) return 'Outros';
  const key = normalizeQuoteScopeLabelKey(raw);
  const mapped = legacy[key] || raw;
  const found = allowed.find((a) => normalizeQuoteScopeLabelKey(a) === normalizeQuoteScopeLabelKey(mapped));
  return found || 'Outros';
}

export function resolveEquipmentCategory(item: QuoteScopeSelectedItem): string {
  const fromCatalog = technicalResourcesCatalog.find((o) => o.id === item.id);
  if (fromCatalog?.category) {
    return mapCategoryLabel(fromCatalog.category, LEGACY_EQUIPMENT_CATEGORY, EQUIPMENT_CATEGORY_ORDER);
  }
  const byLabel = findCatalogOptionByLabel(technicalResourcesCatalog, item.label);
  if (byLabel?.category) {
    return mapCategoryLabel(byLabel.category, LEGACY_EQUIPMENT_CATEGORY, EQUIPMENT_CATEGORY_ORDER);
  }
  return 'Outros';
}

export function resolveProductCategory(item: QuoteScopeSelectedItem): string {
  const fromCatalog = deliverablesCatalog.find((o) => o.id === item.id);
  if (fromCatalog?.category) {
    return mapCategoryLabel(fromCatalog.category, LEGACY_PRODUCT_CATEGORY, PRODUCT_CATEGORY_ORDER);
  }
  const byLabel = findCatalogOptionByLabel(deliverablesCatalog, item.label);
  if (byLabel?.category) {
    return mapCategoryLabel(byLabel.category, LEGACY_PRODUCT_CATEGORY, PRODUCT_CATEGORY_ORDER);
  }
  return 'Outros';
}

export type QuoteScheduleRow = { phase: string; prevision: string };

/**
 * Monta linhas de cronograma sem repetir o prazo global em todas as fases.
 */
export function buildQuoteScheduleRows(quote: MasterTopographyQuote): QuoteScheduleRow[] {
  const mob = preserveQuotePdfUserText(quote.mobilization_deadline_text);
  const field = preserveQuotePdfUserText(quote.field_duration_text);
  const proc = preserveQuotePdfUserText(quote.processing_deadline_text);
  const deliv = preserveQuotePdfUserText(quote.delivery_deadline_text);
  const totalStructured = preserveQuotePdfUserText(quote.total_deadline_text);
  const estimated = preserveQuotePdfUserText(quote.estimated_deadline);

  const phaseRows: QuoteScheduleRow[] = [];
  if (isMeaningfulQuotePdfText(mob)) phaseRows.push({ phase: 'Mobilização', prevision: mob });
  if (isMeaningfulQuotePdfText(field)) phaseRows.push({ phase: 'Campo / aquisição', prevision: field });
  if (isMeaningfulQuotePdfText(proc)) phaseRows.push({ phase: 'Processamento', prevision: proc });
  if (isMeaningfulQuotePdfText(deliv)) phaseRows.push({ phase: 'Entrega', prevision: deliv });

  if (phaseRows.length) {
    if (isMeaningfulQuotePdfText(totalStructured)) {
      phaseRows.push({ phase: 'Prazo global', prevision: totalStructured });
    } else if (
      isMeaningfulQuotePdfText(estimated) &&
      !phaseRows.some((r) => normalizeQuoteScopeLabelKey(r.prevision) === normalizeQuoteScopeLabelKey(estimated))
    ) {
      // Não replica o estimado nas fases; só acrescenta prazo global se distinto.
      phaseRows.push({ phase: 'Prazo global', prevision: estimated });
    }
    return phaseRows;
  }

  if (isMeaningfulQuotePdfText(totalStructured)) {
    return [{ phase: 'Prazo global', prevision: totalStructured }];
  }
  if (isMeaningfulQuotePdfText(estimated)) {
    return [{ phase: 'Prazo global', prevision: estimated }];
  }
  return [];
}

export function buildProfessionalIdentityLines(quote: MasterTopographyQuote): string[] {
  const lines: string[] = [];
  const name = preserveQuotePdfUserText(quote.professional_name);
  const title = preserveQuotePdfUserText(quote.professional_title);
  const council = preserveQuotePdfUserText(quote.professional_council);
  const reg = preserveQuotePdfUserText(quote.professional_registration);
  const uf = preserveQuotePdfUserText(quote.professional_registration_uf);

  if (isMeaningfulQuotePdfText(name)) lines.push(name);
  if (isMeaningfulQuotePdfText(title)) lines.push(title);

  const councilParts: string[] = [];
  if (isMeaningfulQuotePdfText(council)) councilParts.push(council);
  if (isMeaningfulQuotePdfText(reg)) {
    councilParts.push(isMeaningfulQuotePdfText(uf) ? `${reg}/${uf}` : reg);
  } else if (isMeaningfulQuotePdfText(uf) && isMeaningfulQuotePdfText(council)) {
    councilParts.push(uf);
  }
  if (councilParts.length) lines.push(councilParts.join(' '));

  return lines;
}

/** Percentual no padrão brasileiro (ex.: 100,00%). */
export function formatQuotePercentBr(value: number, digits = 2): string {
  const n = Number.isFinite(value) ? value : 0;
  return `${n.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export const SUGGESTED_METHODOLOGY_TEMPLATE =
  'O serviço contempla mobilização, aquisição de dados em campo, processamento e entrega dos produtos acordados, conforme escopo e equipamentos deste orçamento. Os parâmetros técnicos (precisão, densificação e formatos) seguem o projeto executivo e as premissas informadas pelo cliente.';

export function emptyPhase53QuoteFields(): Pick<
  MasterTopographyQuote,
  | 'mobilization_deadline_text'
  | 'field_duration_text'
  | 'processing_deadline_text'
  | 'delivery_deadline_text'
  | 'total_deadline_text'
  | 'methodology_notes'
  | 'professional_name'
  | 'professional_title'
  | 'professional_council'
  | 'professional_registration'
  | 'professional_registration_uf'
> {
  return {
    mobilization_deadline_text: null,
    field_duration_text: null,
    processing_deadline_text: null,
    delivery_deadline_text: null,
    total_deadline_text: null,
    methodology_notes: null,
    professional_name: null,
    professional_title: null,
    professional_council: null,
    professional_registration: null,
    professional_registration_uf: null,
  };
}
