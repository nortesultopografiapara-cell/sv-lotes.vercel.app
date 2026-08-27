/**
 * Medidas e confrontações — exclusivo do modelo MUNDO_NOVO.
 * Reutiliza auditoria GIS genérica; não importa resolveAraguaiaLotDescription.
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
import { loadLotConfrontations } from '@/lib/lotConfrontationsPanel';

export type MundoNovoLotDescription = {
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

export function resolveMundoNovoLotDescription(input: {
  block?: Record<string, unknown> | null;
  project?: Record<string, unknown> | null;
  projectBlocks?: Record<string, unknown>[] | null;
  streetGuides?: Record<string, unknown>[] | null;
}): MundoNovoLotDescription {
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

  const allBlocksIncoming = Array.isArray(input.projectBlocks)
    ? input.projectBlocks
    : [];
  const allBlocks =
    allBlocksIncoming.length > 0
      ? allBlocksIncoming
      : block.id
        ? [block]
        : [];
  const fromSeg = confrontantsFromSegments(block);

  if (allBlocks.length > 0 && block.id) {
    try {
      const frontStreetLabel =
        String(
          block.front_street_name ??
            block.frontStreetName ??
            block.front_street ??
            '',
        ).trim() || null;
      const panel = loadLotConfrontations({
        lot: block,
        allBlocks,
        streetGuides: (input.streetGuides || []) as Record<string, unknown>[],
        frenteConfrontLabel: frontStreetLabel,
        frontStreetLabel,
      });
      const audit =
        panel.audit ||
        buildLotConfrontationAudit(
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
        frenteConfrontLabel: frontStreetLabel,
        frontStreetLabel,
      });
      const mergeSide = (official: string, segment: string) => {
        const o = pendingOr(official);
        if (o !== 'a definir') return o;
        return pendingOr(segment);
      };
      return {
        sides,
        confrontations: {
          frente: mergeSide(conf.frente, fromSeg.frente),
          fundo: mergeSide(conf.fundo, fromSeg.fundo),
          ladoDireito: mergeSide(conf.ladoDireito, fromSeg.ladoDireito),
          ladoEsquerdo: mergeSide(conf.ladoEsquerdo, fromSeg.ladoEsquerdo),
        },
        areaM2,
        source: 'official_bundle',
      };
    } catch {
      /* fallback */
    }
  }

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

export function formatMundoNovoSideMeters(value: unknown): string {
  if (value == null || value === '') return 'não informado';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return (
    num.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' metros'
  );
}

export function formatMundoNovoMetersExtenso(value: unknown): string {
  if (value == null || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return '';
  try {
    const rounded = Math.round(num * 100) / 100;
    let meters = Math.floor(rounded + 1e-9);
    let cm = Math.round((rounded - meters) * 100);
    if (cm >= 100) {
      meters += 1;
      cm = 0;
    }
    if (meters === 0 && cm === 0) return 'zero metros';
    const extenso = require('extenso') as (n: string) => string;
    if (cm === 0) {
      const t = String(extenso(String(meters)));
      return meters === 1 ? `${t} metro` : `${t} metros`;
    }
    if (meters === 0) {
      const t = String(extenso(String(cm)));
      return cm === 1 ? `${t} centímetro` : `${t} centímetros`;
    }
    const mText = String(extenso(String(meters)));
    const cText = String(extenso(String(cm)));
    const mUnit = meters === 1 ? 'metro' : 'metros';
    const cUnit = cm === 1 ? 'centímetro' : 'centímetros';
    return `${mText} ${mUnit} e ${cText} ${cUnit}`;
  } catch {
    return '';
  }
}
