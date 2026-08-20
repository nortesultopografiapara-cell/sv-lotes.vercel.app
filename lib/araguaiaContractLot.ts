/**
 * Medidas e confrontações — exclusivo do modelo ARAGUAIA.
 * Não altera contractLotBoundaries (outros modelos continuam sem confrontantes).
 */

import {
  buildLotConfrontationAudit,
  buildOfficialLotConfrontations,
} from '@/lib/assistedConfrontation';
import {
  resolveContractLotSides,
  type ContractLotSides,
} from '@/lib/contractLotBoundaries';
import {
  getOfficialLotMeasurements,
  parseOfficialSegmentsFromBlock,
} from '@/lib/officialLotMeasurements';

export type AraguaiaLotDescription = {
  sides: ContractLotSides;
  confrontations: {
    frente: string;
    fundo: string;
    ladoDireito: string;
    ladoEsquerdo: string;
  };
  areaM2: number | null;
  source: 'official_bundle' | 'segments_fallback' | 'measures_only';
};

function pendingOr(value: unknown, fallback = 'a definir'): string {
  const text = String(value ?? '').trim();
  if (!text || text === '—' || /^a\s*definir$/i.test(text)) return fallback;
  return text;
}

function confrontantsFromSegments(block: Record<string, unknown>): {
  frente: string;
  fundo: string;
  ladoDireito: string;
  ladoEsquerdo: string;
} {
  let segments: Array<Record<string, unknown>> = [];
  try {
    segments = parseOfficialSegmentsFromBlock(block) as Array<Record<string, unknown>>;
  } catch {
    segments = [];
  }
  if (!segments.length) {
    const raw = block.segments_json ?? block.segments;
    if (Array.isArray(raw)) {
      segments = raw.filter((row) => row && typeof row === 'object') as Array<
        Record<string, unknown>
      >;
    }
  }
  const acc: Record<string, string[]> = {
    frente: [],
    fundo: [],
    ladoDireito: [],
    ladoEsquerdo: [],
  };
  for (const seg of segments) {
    const side = String(seg.official_side || seg.officialSide || '').toLowerCase();
    const label = String(
      seg.confrontant || seg.confrontante || seg.manual_confrontant || '',
    ).trim();
    if (!label) continue;
    if (side.includes('frente') || side === 'front') acc.frente.push(label);
    else if (side.includes('fundo') || side === 'back') acc.fundo.push(label);
    else if (side.includes('dir') || side === 'right') acc.ladoDireito.push(label);
    else if (side.includes('esq') || side === 'left') acc.ladoEsquerdo.push(label);
  }
  const uniq = (arr: string[]) => [...new Set(arr)].join('; ');
  return {
    frente: uniq(acc.frente),
    fundo: uniq(acc.fundo),
    ladoDireito: uniq(acc.ladoDireito),
    ladoEsquerdo: uniq(acc.ladoEsquerdo),
  };
}

/** Resolução isolada para o contrato Araguaia (medidas + confrontantes). */
export function resolveAraguaiaLotDescription(input: {
  block?: Record<string, unknown> | null;
  project?: Record<string, unknown> | null;
  projectBlocks?: Record<string, unknown>[] | null;
  streetGuides?: Record<string, unknown>[] | null;
}): AraguaiaLotDescription {
  const block = input.block || {};
  const sides = resolveContractLotSides(block);

  let areaM2: number | null = null;
  try {
    const measures = getOfficialLotMeasurements(block);
    if (measures.area != null && Number.isFinite(Number(measures.area))) {
      areaM2 = Number(measures.area);
    }
  } catch {
    /* ignore */
  }
  if (areaM2 == null && block.area != null && Number.isFinite(Number(block.area))) {
    areaM2 = Number(block.area);
  }

  const allBlocks = Array.isArray(input.projectBlocks) ? input.projectBlocks : [];
  if (allBlocks.length > 0 && block.id) {
    try {
      const audit = buildLotConfrontationAudit(
        block,
        String(block.id),
        allBlocks,
        (input.streetGuides || []) as Record<string, unknown>[],
        input.project || {},
      );
      const conf = buildOfficialLotConfrontations(audit, {
        block,
        allBlocks,
        project: input.project,
        streetGuides: (input.streetGuides || []) as never[],
      });
      return {
        sides,
        confrontations: {
          frente: pendingOr(conf.frente),
          fundo: pendingOr(conf.fundo),
          ladoDireito: pendingOr(conf.ladoDireito),
          ladoEsquerdo: pendingOr(conf.ladoEsquerdo),
        },
        areaM2,
        source: 'official_bundle',
      };
    } catch {
      /* fallback abaixo */
    }
  }

  const fromSeg = confrontantsFromSegments(block);
  const hasAny =
    fromSeg.frente || fromSeg.fundo || fromSeg.ladoDireito || fromSeg.ladoEsquerdo;
  return {
    sides,
    confrontations: {
      frente: pendingOr(fromSeg.frente),
      fundo: pendingOr(fromSeg.fundo),
      ladoDireito: pendingOr(fromSeg.ladoDireito),
      ladoEsquerdo: pendingOr(fromSeg.ladoEsquerdo),
    },
    areaM2,
    source: hasAny ? 'segments_fallback' : 'measures_only',
  };
}

export function formatAraguaiaSideMeters(value: unknown): string {
  if (value == null || value === '') return 'não informado';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return (
    num.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' m'
  );
}
