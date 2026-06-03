/**
 * Texto narrativo do memorial descritivo.
 */

import { isPendingConfrontantLabel } from '@/lib/confrontantTypes';
import type { MemorialIdentification, MemorialSegmentRow, MemorialSideSummary } from '@/lib/memorial/memorialTypes';

const UTM_FOOTNOTE =
  'Todas as coordenadas aqui descritas estão referenciadas ao Sistema Geodésico Brasileiro, datum SIRGAS2000, no sistema UTM, fuso correspondente ao projeto. Todos os azimutes, distâncias, área e perímetro foram calculados no plano de projeção UTM.';

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

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const confront = seg.confrontant.toUpperCase();
    const target = seg.toVertex;
    const coords = `N ${seg.coordNEnd} e E ${seg.coordEEnd}`;

    if (seg.isCurve && seg.curveDescription) {
      paragraphs.push(
        `deste, ${seg.curveDescription}, confrontando com ${confront}, até o vértice ${target}, de coordenadas ${coords};`,
      );
    } else {
      paragraphs.push(
        `deste, segue confrontando com ${confront}, com azimute ${seg.azimuth} e distância de ${seg.distanceLabel} até o vértice ${target}, de coordenadas ${coords};`,
      );
    }
  }

  const last = segments[segments.length - 1]!;
  paragraphs.push(
    `deste, retorna ao vértice ${first.fromVertex}, ponto inicial da descrição deste perímetro.`,
  );
  paragraphs.push(UTM_FOOTNOTE);

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
    'As confrontações foram obtidas a partir da geometria oficial do lote e da confrontação assistida do sistema SV LOTES.',
    'Este memorial foi gerado automaticamente pelo sistema SV LOTES, com base nos dados cadastrados pela empresa responsável.',
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

export function buildMemorialSideSummary(
  auditSides: {
    frente: string;
    fundo: string;
    ladoDireito: string;
    ladoEsquerdo: string;
  } | null,
  measures: {
    frente: number | null;
    fundo: number | null;
    ladoDireito: number | null;
    ladoEsquerdo: number | null;
    chanfre: string;
  },
  formatDist: (n: number) => string,
): MemorialSideSummary {
  return {
    frente: auditSides?.frente ?? (measures.frente != null ? formatDist(measures.frente) : '—'),
    fundo: auditSides?.fundo ?? (measures.fundo != null ? formatDist(measures.fundo) : '—'),
    ladoDireito:
      auditSides?.ladoDireito ??
      (measures.ladoDireito != null ? formatDist(measures.ladoDireito) : '—'),
    ladoEsquerdo:
      auditSides?.ladoEsquerdo ??
      (measures.ladoEsquerdo != null ? formatDist(measures.ladoEsquerdo) : '—'),
    chanfre: measures.chanfre,
  };
}

export const MEMORIAL_PENDING_CONFIRM_MESSAGE =
  'Este lote possui confrontações pendentes. Deseja gerar mesmo assim?';
