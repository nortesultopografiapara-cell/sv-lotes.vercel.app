import {
  UNCLASSIFIED_CONFRONTATION_ROLE,
  UNCLASSIFIED_CONFRONTANT_LABEL,
  type ConfrontationListRole,
} from '@/lib/assistedConfrontation';
import { isPendingConfrontantLabel } from '@/lib/confrontantTypes';
import { loadLotConfrontations } from '@/lib/lotConfrontationsPanel';
import {
  normalizeOfficialSideKind,
  parseOfficialSegmentsFromBlock,
} from '@/lib/officialLotMeasurements';
import { getSegmentConfrontantRecord } from '@/lib/segmentConfrontantPersist';

const extenso = require('extenso');

export function escEstrelaHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function estrelaStrong(value: string): string {
  const clean = String(value || '').trim();
  if (!clean) return '';
  return `<strong>${escEstrelaHtml(clean)}</strong>`;
}

export function formatEstrelaBRL(val: number): string {
  if (!Number.isFinite(val) || val < 0) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
}

export function formatEstrelaExtensoCurrency(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '';
  try {
    return String(
      extenso(val.toFixed(2).replace('.', ','), { mode: 'currency' }),
    );
  } catch {
    return '';
  }
}

export function formatEstrelaMoneyPhrase(val: number): string {
  const fmt = formatEstrelaBRL(val);
  const words = formatEstrelaExtensoCurrency(val);
  if (words) return `${fmt} (${words})`;
  return fmt;
}

export function formatEstrelaNumber(val: number, digits = 2): string {
  if (!Number.isFinite(val)) return '';
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function extensoInteger(val: number): string {
  if (!Number.isFinite(val) || val < 0) return '';
  try {
    return String(extenso(Math.round(val), { mode: 'number' }));
  } catch {
    return '';
  }
}

function extensoCardinal(val: number): string {
  if (!Number.isFinite(val) || val < 0) return '';
  try {
    return String(extenso(String(val), { mode: 'number' }));
  } catch {
    return '';
  }
}

/**
 * Medida linear por extenso a partir do decimal GIS exato (2 casas).
 * Não arredonda metros: 10,05 → "dez metros e cinco centímetros".
 */
export function formatEstrelaMetersExtenso(
  meters: number | string | null | undefined,
): string {
  const num = Number(meters);
  if (!Number.isFinite(num) || num <= 0) return '';
  const [metersRaw, cmRaw] = num.toFixed(2).split('.');
  const whole = Number(metersRaw);
  const cm = Number(cmRaw);
  if (!Number.isFinite(whole) || !Number.isFinite(cm)) return '';

  const metersWords = extensoCardinal(whole);
  const cmWords = extensoCardinal(cm);
  if (!metersWords) return '';

  if (cm === 0) {
    return whole === 1 ? `${metersWords} metro` : `${metersWords} metros`;
  }
  if (!cmWords) return whole === 1 ? `${metersWords} metro` : `${metersWords} metros`;
  const mUnit = whole === 1 ? 'metro' : 'metros';
  const cUnit = cm === 1 ? 'centímetro' : 'centímetros';
  if (whole === 0) {
    return `${cmWords} ${cUnit}`;
  }
  return `${metersWords} ${mUnit} e ${cmWords} ${cUnit}`;
}

export function formatEstrelaMetersPhrase(meters: number | string | null | undefined): string {
  const num = Number(meters);
  if (!Number.isFinite(num) || num <= 0) return '';
  const fmt = `${formatEstrelaNumber(num)}m`;
  const words = formatEstrelaMetersExtenso(num);
  if (words) return `${fmt} (${words})`;
  return fmt;
}

export function formatEstrelaAreaPhrase(areaM2: number | string | null | undefined): string {
  const num = Number(areaM2);
  if (!Number.isFinite(num) || num <= 0) return '';
  const fmt = `${formatEstrelaNumber(num)}m²`;
  const words = extensoInteger(num);
  if (words) return `${fmt} (${words} metros quadrados)`;
  return fmt;
}

export function formatEstrelaUpperDate(longDate: string): string {
  const raw = String(longDate || '').trim();
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\bDE\b/g, 'DE');
}

const EMPTY_LOCATION_TOKENS = new Set([
  '',
  'undefined',
  'null',
  'nan',
  'n/a',
  'na',
  '-',
  '—',
]);

function cleanEstrelaLocationPart(value: unknown): string {
  if (value == null) return '';
  const text = String(value).trim().replace(/\s+/g, ' ');
  if (!text || EMPTY_LOCATION_TOKENS.has(text.toLowerCase())) return '';
  return text;
}

function pickEstrelaLocationPart(...values: unknown[]): string {
  for (const value of values) {
    const clean = cleanEstrelaLocationPart(value);
    if (clean) return clean;
  }
  return '';
}

type EstrelaSideKey = ConfrontationListRole;

type EstrelaConfrontacaoPiece = {
  index: number;
  key: EstrelaSideKey;
  distance: number;
  curve: boolean;
  confrontant: string;
};

function cleanEstrelaConfrontant(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const unclassified = UNCLASSIFIED_CONFRONTANT_LABEL.trim().toUpperCase();
  if (text.toUpperCase() === unclassified) return '';
  if (isPendingConfrontantLabel(text)) return '';
  return text;
}

function sideKeyFromOfficial(
  raw: unknown,
): EstrelaSideKey {
  const kind = normalizeOfficialSideKind(raw);
  if (kind === 'front') return 'frente';
  if (kind === 'back') return 'fundo';
  if (kind === 'right') return 'ladoDireito';
  if (kind === 'left') return 'ladoEsquerdo';
  return UNCLASSIFIED_CONFRONTATION_ROLE;
}

function joinEstrelaList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] || '';
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

function estrelaSideAdverb(key: EstrelaSideKey): string {
  if (key === 'frente') return 'pela frente';
  if (key === 'fundo') return 'pelos fundos';
  if (key === 'ladoDireito') return 'pelo lado direito';
  if (key === 'ladoEsquerdo') return 'pelo lado esquerdo';
  return 'sem classificação de lado';
}

function estrelaSideGroupLabel(key: EstrelaSideKey): { noun: string; composed: string } {
  if (key === 'frente') return { noun: 'frente', composed: 'composta' };
  if (key === 'fundo') return { noun: 'fundo', composed: 'composto' };
  if (key === 'ladoDireito') return { noun: 'lado direito', composed: 'composto' };
  if (key === 'ladoEsquerdo') return { noun: 'lado esquerdo', composed: 'composto' };
  return { noun: 'trecho sem classificação de lado', composed: 'composto' };
}

function collectEstrelaConfrontacaoPieces(
  block: Record<string, unknown>,
  options?: {
    projectBlocks?: Record<string, unknown>[] | null;
    streetGuides?: Record<string, unknown>[] | null;
    project?: Record<string, unknown> | null;
  },
): EstrelaConfrontacaoPiece[] {
  const parsed = parseOfficialSegmentsFromBlock(block);
  if (!parsed.length) return [];

  const byIndex = new Map(parsed.map((seg) => [Number(seg.segment_index), seg]));
  const allBlocks = [
    ...(Array.isArray(options?.projectBlocks) ? options.projectBlocks : []),
    block,
  ].filter((row, i, arr) => {
    const id = String(row?.id ?? '');
    if (!id) return i === arr.length - 1;
    return arr.findIndex((item) => String(item?.id ?? '') === id) === i;
  });

  const panel = loadLotConfrontations({
    lot: block,
    allBlocks,
    streetGuides: (options?.streetGuides || []) as Record<string, unknown>[],
  });

  const pieces: EstrelaConfrontacaoPiece[] = [];
  const seen = new Set<number>();
  for (const row of panel.rows) {
    const index = Number(row.segmentIndex);
    if (!Number.isFinite(index) || index < 0) continue;
    const seg = byIndex.get(index);
    const distance = Number(seg?.distance);
    if (!seg || !Number.isFinite(distance) || distance <= 0) continue;
    seen.add(index);
    pieces.push({
      index,
      key: row.key,
      distance,
      curve: seg.segment_type === 'CURVE',
      confrontant: cleanEstrelaConfrontant(row.text),
    });
  }

  if (!pieces.length) {
    for (const seg of parsed) {
      const index = Number(seg.segment_index);
      const distance = Number(seg.distance);
      if (!Number.isFinite(index) || !Number.isFinite(distance) || distance <= 0) {
        continue;
      }
      const rec = getSegmentConfrontantRecord(block, index);
      pieces.push({
        index,
        key: sideKeyFromOfficial(seg.official_side),
        distance,
        curve: seg.segment_type === 'CURVE',
        confrontant: cleanEstrelaConfrontant(rec?.confrontant),
      });
    }
  } else {
    for (const seg of parsed) {
      const index = Number(seg.segment_index);
      if (seen.has(index)) continue;
      const distance = Number(seg.distance);
      if (!Number.isFinite(index) || !Number.isFinite(distance) || distance <= 0) {
        continue;
      }
      const rec = getSegmentConfrontantRecord(block, index);
      pieces.push({
        index,
        key: sideKeyFromOfficial(seg.official_side),
        distance,
        curve: seg.segment_type === 'CURVE',
        confrontant: cleanEstrelaConfrontant(rec?.confrontant),
      });
    }
  }

  pieces.sort((a, b) => a.index - b.index);
  return pieces;
}

function formatEstrelaConfrontacaoGroup(group: EstrelaConfrontacaoPiece[]): string {
  if (!group.length) return '';
  const key = group[0].key;
  const confrontant = group[0].confrontant;
  const measures = group.map((piece) => formatEstrelaMetersPhrase(piece.distance));
  const curveAll = group.every((piece) => piece.curve);
  const curveSome = group.some((piece) => piece.curve);
  const curveBit = curveAll || (group.length === 1 && curveSome) ? ', em curva' : '';
  const confrontBit = confrontant
    ? group.length > 1
      ? `, ${group.length === 2 ? 'ambos' : 'todos'} confrontando com ${confrontant}`
      : `, confrontando com ${confrontant}`
    : '';

  if (group.length === 1) {
    return `${measures[0]} ${estrelaSideAdverb(key)}${curveBit}${confrontBit}`;
  }

  const { noun, composed } = estrelaSideGroupLabel(key);
  const mixedCurve =
    curveSome && !curveAll
      ? `, incluindo trecho em curva`
      : curveAll
        ? ', em curva'
        : '';
  return `${noun} ${composed} pelos segmentos de ${joinEstrelaList(measures)}${mixedCurve}${confrontBit}`;
}

/**
 * MEDIDAS E CONFRONTAÇÕES a partir de blocks.segments_json,
 * na mesma leitura da aba Confrontações (ordem geométrica, sem somar).
 */
export function formatEstrelaMedidasConfrontacoes(
  block: Record<string, unknown> | null | undefined,
  options?: {
    projectBlocks?: Record<string, unknown>[] | null;
    streetGuides?: Record<string, unknown>[] | null;
    project?: Record<string, unknown> | null;
  },
): string {
  if (!block || typeof block !== 'object') return '';
  const pieces = collectEstrelaConfrontacaoPieces(block, options);
  if (!pieces.length) return '';

  const groups: EstrelaConfrontacaoPiece[][] = [];
  for (const piece of pieces) {
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    if (
      prev &&
      prev.key === piece.key &&
      prev.confrontant === piece.confrontant
    ) {
      last.push(piece);
    } else {
      groups.push([piece]);
    }
  }

  return groups
    .map((group) => formatEstrelaConfrontacaoGroup(group))
    .filter(Boolean)
    .join('; ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Localização física do empreendimento a partir do cadastro do projeto.
 * Não usa foro nem endereço da empresa. Sem hardcode de empreendimento.
 * Formato: [Endereço/Referência], [Bairro/Localidade], [Cidade]/[UF]
 */
export function formatEstrelaEnterpriseLocation(
  project: Record<string, unknown> | null | undefined,
): string {
  const rec = project && typeof project === 'object' ? project : {};
  const address = pickEstrelaLocationPart(
    rec.address,
    rec.address_reference,
    rec.reference,
    rec.endereco,
  );
  const neighborhood = pickEstrelaLocationPart(
    rec.neighborhood,
    rec.locality,
    rec.bairro,
  );
  const city = pickEstrelaLocationPart(rec.city, rec.cidade);
  const uf = pickEstrelaLocationPart(rec.uf, rec.state).toUpperCase();
  const cityUf = [city, uf].filter(Boolean).join('/');
  return [address, neighborhood, cityUf]
    .filter(Boolean)
    .join(', ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,+/g, ',')
    .replace(/^,\s*|\s*,$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
