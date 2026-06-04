/**
 * Texto narrativo do memorial descritivo (padrão SIGEF/INCRA).
 */

import { isPendingConfrontantLabel } from '@/lib/confrontantTypes';
import type {
  MemorialIdentification,
  MemorialSegmentRow,
  MemorialSideSummary,
} from '@/lib/memorial/memorialTypes';

export const MEMORIAL_GEODESIC_FOOTNOTE =
  'Todas as coordenadas aqui descritas estão georreferenciadas ao Sistema Geodésico Brasileiro, datum SIRGAS2000, representadas no Sistema UTM, fuso correspondente ao projeto. Todos os azimutes, distâncias, área e perímetro foram calculados no plano de projeção UTM.';

function confrontantForText(label: string): string {
  return label.trim().toUpperCase();
}

function segmentRunText(seg: MemorialSegmentRow): string {
  const target = seg.toVertex;
  const coords = `N ${seg.coordNEnd} e E ${seg.coordEEnd}`;
  if (seg.isCurve && seg.curveDescription) {
    return `${seg.curveDescription}, até o vértice ${target}, de coordenadas ${coords}`;
  }
  return `azimute ${seg.azimuth} e distância de ${seg.distanceLabel} até o vértice ${target}, de coordenadas ${coords}`;
}

type ConfrontantGroup = {
  confrontant: string;
  segments: MemorialSegmentRow[];
};

function groupConsecutiveByConfrontant(
  segments: MemorialSegmentRow[],
): ConfrontantGroup[] {
  const groups: ConfrontantGroup[] = [];
  for (const seg of segments) {
    const key = seg.confrontant;
    const last = groups[groups.length - 1];
    if (last && last.confrontant === key) {
      last.segments.push(seg);
    } else {
      groups.push({ confrontant: key, segments: [seg] });
    }
  }
  return groups;
}

export function buildMemorialDescriptionParagraphs(
  segments: MemorialSegmentRow[],
): string[] {
  if (!segments.length) {
    return ['Perímetro sem segmentos oficiais válidos para descrição.'];
  }

  const paragraphs: string[] = [];
  const first = segments[0]!;
  paragraphs.push(
    `Inicia-se a descrição deste perímetro no vértice ${first.fromVertex}, de coordenadas N ${first.coordNStart} e E ${first.coordEStart};`,
  );

  const groups = groupConsecutiveByConfrontant(segments);

  for (const group of groups) {
    const confront = confrontantForText(group.confrontant);
    const items = group.segments;

    if (items.length === 1) {
      const seg = items[0]!;
      paragraphs.push(
        `Deste segue confrontando com ${confront}, com ${segmentRunText(seg)};`,
      );
      continue;
    }

    paragraphs.push(
      `Deste segue confrontando com ${confront}, com os seguintes azimutes e distâncias:`,
    );
    for (const seg of items) {
      paragraphs.push(`— ${segmentRunText(seg)};`);
    }
  }

  paragraphs.push(
    `Deste, retorna ao vértice ${first.fromVertex}, ponto inicial da descrição deste perímetro.`,
  );
  paragraphs.push(MEMORIAL_GEODESIC_FOOTNOTE);

  return paragraphs;
}

export function buildMemorialDescriptionText(segments: MemorialSegmentRow[]): string {
  return buildMemorialDescriptionParagraphs(segments).join('\n\n');
}

export function buildMemorialObservations(
  segments: MemorialSegmentRow[],
  hasPending: boolean,
): string[] {
  const obs: string[] = [
    'A planta anexa é parte integrante deste memorial descritivo.',
    'As confrontações foram obtidas a partir da geometria oficial do lote e das confrontações confirmadas no sistema SV LOTES.',
    'Este documento foi gerado automaticamente pelo sistema SV LOTES.',
  ];
  if (hasPending) {
    const pendingCount = segments.filter((s) =>
      isPendingConfrontantLabel(s.confrontant),
    ).length;
    obs.push(
      `ATENÇÃO: Este lote possui ${pendingCount} segmento(s) com confrontação pendente (A DEFINIR). Recomenda-se revisar no mapa antes de uso em documento definitivo.`,
    );
  }
  return obs;
}

export function buildMemorialIdentificationFields(
  block: Record<string, unknown>,
  project: Record<string, unknown>,
  measures: {
    area: number | null;
    perimeter: number | null;
    frente: number | null;
    fundo: number | null;
    ladoDireito: number | null;
    ladoEsquerdo: number | null;
  },
  formatArea: (n: number) => string,
  formatDist: (n: number) => string,
): MemorialIdentification {
  const quadra = String(block.block_name ?? block.block ?? block.quadra ?? '—');
  const lote = String(block.number ?? block.lot ?? '—');
  const city = String(project.city ?? project.municipio ?? '').trim();
  const state = String(project.state ?? project.uf ?? '').trim();
  const mun =
    city && state ? `${city}/${state}` : city || state || 'Não informado';

  return {
    owner: String(block.owner_name ?? block.customer_name ?? 'Não informado'),
    property: `QUADRA ${quadra} LOTE ${lote}`,
    project: String(project.name ?? project.title ?? 'Não informado'),
    quadra,
    lote,
    municipality: mun,
    matricula: String(block.matricula ?? block.registry ?? 'Não informado'),
    areaM2: measures.area != null ? formatArea(measures.area) : 'Não informado',
    perimeterM:
      measures.perimeter != null
        ? formatDist(measures.perimeter)
        : 'Não informado',
  };
}

/** Quadro resumo — confrontantes do mapa (nunca medidas numéricas dos lados). */
export function buildMemorialSideSummary(
  auditSides: {
    frente: string;
    fundo: string;
    ladoDireito: string;
    ladoEsquerdo: string;
  } | null,
  chanfre: string,
): MemorialSideSummary {
  return {
    frente: auditSides?.frente?.trim() || '—',
    fundo: auditSides?.fundo?.trim() || '—',
    ladoDireito: auditSides?.ladoDireito?.trim() || '—',
    ladoEsquerdo: auditSides?.ladoEsquerdo?.trim() || '—',
    chanfre,
  };
}

export const MEMORIAL_PENDING_CONFIRM_MESSAGE =
  'Este lote possui confrontações pendentes. Deseja gerar mesmo assim?';
