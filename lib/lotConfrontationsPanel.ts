/**
 * Carga de confrontações para o modal do lote (popup GIS).
 * Independente de ferramentas globais da toolbar MapGIS
 * (não usa modos de seleção no mapa nem estados de ferramenta lateral).
 */
import {
  buildLotConfrontationAudit,
  buildOfficialLotConfrontationSegmentRows,
  buildCompleteLotConfrontationSegmentRows,
  UNCLASSIFIED_CONFRONTANT_LABEL,
  type LotConfrontationAudit,
  type OfficialLotConfrontationSegmentRow,
  type SideRole,
} from '@/lib/assistedConfrontation';

export type LotConfrontationsLoadStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'error';

export type LotConfrontationsLoadResult = {
  status: LotConfrontationsLoadStatus;
  audit: LotConfrontationAudit | null;
  rows: OfficialLotConfrontationSegmentRow[];
  error: string | null;
};

function toBlockShape(lot: Record<string, unknown>): Record<string, unknown> {
  return {
    ...lot,
    id: lot.id,
    number: lot.number,
    block_name: lot.block ?? lot.block_name,
    segments_json: lot.segments_json,
    front_segment_index: lot.front_segment_index,
    front_street_name: lot.frontStreetName ?? lot.front_street_name,
  };
}

/**
 * Monta auditoria + linhas da aba Confrontações a partir do lote atual.
 * Não depende de liveStreetAudits / estados de toolbar.
 */
export function loadLotConfrontations(params: {
  lot: Record<string, unknown> | null | undefined;
  allBlocks?: Record<string, unknown>[];
  streetGuides?: Record<string, unknown>[];
  frenteConfrontLabel?: string | null;
  frontStreetLabel?: string | null;
}): LotConfrontationsLoadResult {
  const lot = params.lot;
  const lotId = lot?.id != null ? String(lot.id) : '';
  if (!lot || !lotId) {
    return {
      status: 'empty',
      audit: null,
      rows: [],
      error: null,
    };
  }

  try {
    const block = toBlockShape(lot);
    const incoming = Array.isArray(params.allBlocks) ? params.allBlocks : [];
    const allBlocks = incoming.map((b) =>
      String(b?.id) === lotId ? { ...b, ...block } : b,
    );
    if (!allBlocks.some((b) => String(b?.id) === lotId)) {
      allBlocks.push(block);
    }

    const streetGuides = Array.isArray(params.streetGuides)
      ? params.streetGuides
      : [];

    const audit = buildLotConfrontationAudit(
      block,
      lotId,
      allBlocks,
      streetGuides,
    );
    const officialSideOpts = {
      streetGuides: streetGuides as never,
      frenteConfrontLabel: params.frenteConfrontLabel ?? null,
      frontStreetLabel: params.frontStreetLabel ?? null,
    };
    // Soma oficial por lado permanece em buildOfficialLotConfrontationSegmentRows.
    // A lista editável da aba usa todas as arestas (órfãos/chanfros/sem lado).
    void buildOfficialLotConfrontationSegmentRows;
    const rows = buildCompleteLotConfrontationSegmentRows(
      block,
      audit,
      allBlocks,
      officialSideOpts,
    );

    if (rows.length === 0) {
      return {
        status: 'empty',
        audit,
        rows: [],
        error: null,
      };
    }

    return {
      status: 'ready',
      audit,
      rows,
      error: null,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Falha ao carregar confrontações do lote.';
    return {
      status: 'error',
      audit: null,
      rows: [],
      error: message,
    };
  }
}

/** Indica se a linha tem confrontante preenchido (não vazio / A DEFINIR). */
export function confrontationRowHasData(
  row: OfficialLotConfrontationSegmentRow,
): boolean {
  const text = String(row.text ?? '')
    .trim()
    .toUpperCase();
  const unclassified = UNCLASSIFIED_CONFRONTANT_LABEL.trim().toUpperCase();
  return (
    Boolean(text) &&
    text !== 'A DEFINIR' &&
    text !== '—' &&
    text !== unclassified
  );
}

export type { OfficialLotConfrontationSegmentRow, SideRole };
