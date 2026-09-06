/**
 * Apresentação da aba Histórico do lote (somente UI).
 * Não altera lot_audit_logs, APIs nem ordenação de auditoria.
 */

import type { FormattedLotAuditEvent, LotAuditAction, LotAuditSource } from '@/lib/lotAudit';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import {
  terminationDocumentPdfHref,
  terminationDocumentSignedPdfHref,
  terminationDocumentViewHref,
} from '@/lib/saleDocuments';

export type LotHistoryFilterId = 'all' | 'comercial' | 'gis' | 'contrato' | 'financeiro';

export type LotHistoryFilterChip = {
  id: LotHistoryFilterId;
  label: string;
};

export type LotHistoryDayGroup = {
  dateKey: string;
  dateLabel: string;
  events: FormattedLotAuditEvent[];
};

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const COMERCIAL_ACTIONS = new Set<LotAuditAction>([
  'sold',
  'reserved',
  'sale_edited',
  'sale_cancelled',
  'customer_changed',
  'status_changed',
]);

const CONTRATO_ACTIONS = new Set<LotAuditAction>([
  'contract_generated',
  'contract_regenerated',
  'contract_viewed',
]);

const FINANCEIRO_ACTIONS = new Set<LotAuditAction>([
  'finance_created',
  'payment_received',
  'payment_reversed',
]);

const FILTER_CHIPS: LotHistoryFilterChip[] = [
  { id: 'all', label: 'Todos' },
  { id: 'comercial', label: 'Comercial' },
  { id: 'gis', label: 'GIS' },
  { id: 'contrato', label: 'Contrato' },
  { id: 'financeiro', label: 'Financeiro' },
];

const LONG_DESCRIPTION_CHARS = 180;

export function classifyLotHistoryFilter(
  event: Pick<FormattedLotAuditEvent, 'action' | 'source'>,
): Exclude<LotHistoryFilterId, 'all'> {
  const source = event.source as LotAuditSource;
  if (source === 'finance_flow' || FINANCEIRO_ACTIONS.has(event.action)) {
    return 'financeiro';
  }
  if (source === 'contract_flow' || CONTRATO_ACTIONS.has(event.action)) {
    return 'contrato';
  }
  if (
    source === 'sale_flow' ||
    source === 'customer_flow' ||
    COMERCIAL_ACTIONS.has(event.action)
  ) {
    return 'comercial';
  }
  return 'gis';
}

export function listLotHistoryFilterChips(
  events: FormattedLotAuditEvent[],
): LotHistoryFilterChip[] {
  const present = new Set(events.map((event) => classifyLotHistoryFilter(event)));
  const extra = FILTER_CHIPS.filter((chip) => chip.id !== 'all' && present.has(chip.id));
  if (extra.length === 0) return [FILTER_CHIPS[0]];
  return [FILTER_CHIPS[0], ...extra];
}

export function filterLotHistoryEvents(
  events: FormattedLotAuditEvent[],
  filterId: LotHistoryFilterId,
  query: string,
): FormattedLotAuditEvent[] {
  const needle = query.trim().toLowerCase();
  return events.filter((event) => {
    if (filterId !== 'all' && classifyLotHistoryFilter(event) !== filterId) {
      return false;
    }
    if (!needle) return true;
    const haystack = [
      event.title,
      event.description || '',
      event.actionLabel,
      event.sourceLabel,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function lotHistoryDateKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'invalid';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function lotHistoryDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function lotHistoryTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Preserva ordem de entrada (já mais recente primeiro). */
export function groupLotHistoryByDate(
  events: FormattedLotAuditEvent[],
): LotHistoryDayGroup[] {
  const groups: LotHistoryDayGroup[] = [];
  const index = new Map<string, LotHistoryDayGroup>();
  for (const event of events) {
    const dateKey = lotHistoryDateKey(event.createdAt);
    let group = index.get(dateKey);
    if (!group) {
      group = {
        dateKey,
        dateLabel: lotHistoryDateLabel(event.createdAt),
        events: [],
      };
      index.set(dateKey, group);
      groups.push(group);
    }
    group.events.push(event);
  }
  return groups;
}

export function formatLotHistoryEventCount(count: number): string {
  return count === 1 ? '1 evento' : `${count} eventos`;
}

export function splitLotHistoryDescription(formatted: string): {
  preview: string;
  full: string;
  hasTechnical: boolean;
  isLong: boolean;
} {
  const full = formatted.trim();
  const hasTechnical = UUID_RE.test(full);
  UUID_RE.lastIndex = 0;
  const withoutIds = full.replace(UUID_RE, ' ').replace(/\s{2,}/g, ' ').trim();
  const preview = withoutIds || full;
  return {
    preview,
    full,
    hasTechnical,
    isLong: preview.length > LONG_DESCRIPTION_CHARS,
  };
}

export function resolveLotHistoryActor(
  userId: string | null,
  userNames: Record<string, string>,
): string | null {
  if (!userId) return null;
  const label = String(userNames[userId] || '').trim();
  if (!label) return null;
  if (label === userId) return null;
  if (label === userId.slice(0, 8)) return null;
  UUID_RE.lastIndex = 0;
  if (UUID_RE.test(label)) return null;
  return label;
}

/** Mesmo sale_id/settlement.document_id das APIs de termo — sem segundo PDF. */
export function lotHistoryImprovementsLine(
  event: Pick<FormattedLotAuditEvent, 'improvementsTotal'>,
): string | null {
  const total = Number(event.improvementsTotal);
  if (!Number.isFinite(total) || total <= 0) return null;
  const money = formatCurrencyBRL(total) || 'R$ 0,00';
  return `Benfeitorias reconhecidas: ${money}`;
}

export type LotHistoryTerminationDocumentLinks = {
  saleId: string;
  signed: boolean;
  viewHref: string;
  pdfHref: string;
  signedPdfHref: string;
  signedPdfDownloadHref: string;
};

/** Mesmo sale_id do evento/settlement — nunca blocks.sale_id após a liberação. */
export function lotHistoryTerminationDocumentLinks(
  event: Pick<FormattedLotAuditEvent, 'action' | 'saleId' | 'motiveCode'>,
  options?: { signed?: boolean },
): LotHistoryTerminationDocumentLinks | null {
  if (event.action !== 'sale_cancelled') return null;
  const motive = String(event.motiveCode || '').trim();
  if (motive !== 'desistencia' && motive !== 'distrato' && motive !== 'inadimplencia') return null;
  const saleId = String(event.saleId || '').trim();
  if (!saleId) return null;
  return {
    saleId,
    signed: Boolean(options?.signed),
    viewHref: terminationDocumentViewHref(saleId),
    pdfHref: terminationDocumentPdfHref(saleId),
    signedPdfHref: terminationDocumentSignedPdfHref(saleId),
    signedPdfDownloadHref: terminationDocumentSignedPdfHref(saleId, { download: true }),
  };
}

export function lotHistoryTerminationSaleIds(
  events: Array<Pick<FormattedLotAuditEvent, 'action' | 'saleId' | 'motiveCode'>>,
): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    const links = lotHistoryTerminationDocumentLinks(event);
    if (links) ids.add(links.saleId);
  }
  return [...ids];
}
