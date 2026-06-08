export interface Segment {
    p1: number[];
    p2: number[];
    length: number;
    azimuth: number;
    originalIndex: number;
    isExternal: boolean;
}

/**
 * Calcula a distância geodésica (Haversine) entre dois pontos.
 */
export function calculateDistance(coord1: number[], coord2: number[]): number {
    const R = 6371e3; // Raio da Terra em metros
    const lat1 = coord1[1] * Math.PI / 180;
    const lat2 = coord2[1] * Math.PI / 180;
    const deltaLat = (coord2[1] - coord1[1]) * Math.PI / 180;
    const deltaLon = (coord2[0] - coord1[0]) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Calcula o azimute (bearing) entre dois pontos (0-360)
 */
export function calculateBearing(startCoord: number[], endCoord: number[]): number {
    const lat1 = startCoord[1] * Math.PI / 180;
    const lon1 = startCoord[0] * Math.PI / 180;
    const lat2 = endCoord[1] * Math.PI / 180;
    const lon2 = endCoord[0] * Math.PI / 180;
    
    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    let brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
}

/**
 * Diferença mínima entre dois ângulos
 */
function diffAngle(a1: number, a2: number): number {
    let diff = Math.abs(a1 - a2) % 360;
    return diff > 180 ? 360 - diff : diff;
}

const PARALLEL_TOL_DEG = 28;
const CHANFRE_MIN_M = 2;
const CHANFRE_MAX_M = 15;

function isOppositeParallel(az1: number, az2: number, tol = PARALLEL_TOL_DEG): boolean {
    const diff = diffAngle(az1, az2);
    return Math.abs(diff - 180) <= tol;
}

function isPerpendicular(az1: number, az2: number, tol = PARALLEL_TOL_DEG): boolean {
    const diff = diffAngle(az1, az2);
    return Math.abs(diff - 90) <= tol;
}

function crossSignRelativeToFront(front: Segment, seg: Segment): number {
    const fx = front.p2[0] - front.p1[0];
    const fy = front.p2[1] - front.p1[1];
    const mx =
        (seg.p1[0] + seg.p2[0]) / 2 - (front.p1[0] + front.p2[0]) / 2;
    const my =
        (seg.p1[1] + seg.p2[1]) / 2 - (front.p1[1] + front.p2[1]) / 2;
    return fx * my - fy * mx;
}

function pickSegmentByLengthHint(
    segments: Segment[],
    targetLen: number,
    toleranceRatio = 0.4,
): Segment | null {
    if (!targetLen || targetLen <= 0 || segments.length === 0) return null;
    const match = segments.reduce((best, s) => {
        const d = Math.abs(s.length - targetLen);
        const bd = Math.abs(best.length - targetLen);
        return d < bd ? s : best;
    });
    if (Math.abs(match.length - targetLen) <= Math.max(targetLen * toleranceRatio, 4)) {
        return match;
    }
    return null;
}

export type LotSideRole =
    | "frente"
    | "fundo"
    | "ladoDireito"
    | "ladoEsquerdo"
    | "chanfre"
    | "other";

export type SegmentMeasureDebug = {
    index: number;
    length: number;
    angle: number;
    role: LotSideRole;
};

export type RingPathMeasure = {
    indexes: number[];
    totalLength: number;
};

export type RingPathClassification = {
    frente: number;
    fundo: number;
    ladoDireito: number;
    ladoEsquerdo: number;
    chanfro: number;
    frontIndex: number;
    backIndex: number;
    pathA: RingPathMeasure;
    pathB: RingPathMeasure;
};

export type ClassifiedLotDimensions = {
    frente: number;
    fundo: number;
    ladoDireito: number;
    ladoEsquerdo: number;
    chanfro: number;
    segmentDebug: SegmentMeasureDebug[];
    ringPaths: RingPathClassification;
};

function findSegmentIndex(segments: Segment[], target: Segment | null): number {
    if (!target) return -1;
    const byRef = segments.indexOf(target);
    if (byRef >= 0) return byRef;
    return segments.findIndex(
        (s) =>
            s.originalIndex === target.originalIndex &&
            Math.abs(s.length - target.length) < 0.05,
    );
}

/** Percorre o anel entre frente e fundo em um sentido (segmentos consecutivos). */
function collectRingPathIndexes(
    segmentCount: number,
    startIdx: number,
    endIdx: number,
    step: 1 | -1,
): number[] {
    if (segmentCount < 3 || startIdx < 0 || endIdx < 0 || startIdx === endIdx) {
        return [];
    }
    const path: number[] = [];
    let i = startIdx;
    for (let guard = 0; guard < segmentCount; guard++) {
        i = (i + step + segmentCount) % segmentCount;
        if (i === endIdx) break;
        path.push(i);
    }
    return path;
}

function sumPathLength(segments: Segment[], indexes: number[]): number {
    return indexes.reduce((sum, idx) => sum + (segments[idx]?.length || 0), 0);
}

/**
 * Lados = dois caminhos consecutivos no anel (frente → fundo), sem somar lados opostos.
 */
export function classifySidesByRingPaths(
    segments: Segment[],
    frontIndex: number,
    backIndex: number,
): RingPathClassification {
    const round = (n: number) => Math.round(n * 100) / 100;
    const n = segments.length;
    const empty: RingPathClassification = {
        frente: 0,
        fundo: 0,
        ladoDireito: 0,
        ladoEsquerdo: 0,
        chanfro: 0,
        frontIndex,
        backIndex,
        pathA: { indexes: [], totalLength: 0 },
        pathB: { indexes: [], totalLength: 0 },
    };
    if (n < 3 || frontIndex < 0 || backIndex < 0) return empty;

    const pathAIndexes = collectRingPathIndexes(n, frontIndex, backIndex, 1);
    const pathBIndexes = collectRingPathIndexes(n, backIndex, frontIndex, 1);

    const pathA: RingPathMeasure = {
        indexes: pathAIndexes,
        totalLength: round(sumPathLength(segments, pathAIndexes)),
    };
    const pathB: RingPathMeasure = {
        indexes: pathBIndexes,
        totalLength: round(sumPathLength(segments, pathBIndexes)),
    };

    const mainIndexes = new Set([frontIndex, backIndex, ...pathAIndexes, ...pathBIndexes]);
    let chanfroTotal = 0;
    for (let i = 0; i < n; i++) {
        if (mainIndexes.has(i)) continue;
        const len = segments[i].length;
        if (len >= CHANFRE_MIN_M && len <= CHANFRE_MAX_M) {
            chanfroTotal += len;
        }
    }

    return {
        frente: round(segments[frontIndex]?.length || 0),
        fundo: round(segments[backIndex]?.length || 0),
        ladoDireito: pathA.totalLength,
        ladoEsquerdo: pathB.totalLength,
        chanfro: round(chanfroTotal),
        frontIndex,
        backIndex,
        pathA,
        pathB,
    };
}

/**
 * Classifica frente/fundo/lados a partir dos segmentos do anel (ordem consecutiva).
 */
export function classifyLotSidesFromSegments(
    segments: Segment[],
    options?: {
        frenteLengthHint?: number | null;
        fundoLengthHint?: number | null;
        pickFrontSegment?: (segments: Segment[]) => Segment | null;
        lotNumber?: unknown;
    },
): ClassifiedLotDimensions {
    const round = (n: number) => Math.round(n * 100) / 100;
    const emptyRing: RingPathClassification = {
        frente: 0,
        fundo: 0,
        ladoDireito: 0,
        ladoEsquerdo: 0,
        chanfro: 0,
        frontIndex: -1,
        backIndex: -1,
        pathA: { indexes: [], totalLength: 0 },
        pathB: { indexes: [], totalLength: 0 },
    };
    const empty: ClassifiedLotDimensions = {
        frente: 0,
        fundo: 0,
        ladoDireito: 0,
        ladoEsquerdo: 0,
        chanfro: 0,
        segmentDebug: [],
        ringPaths: emptyRing,
    };
    if (segments.length === 0) return empty;

    let front: Segment | null = null;
    if (options?.pickFrontSegment) {
        front = options.pickFrontSegment(segments);
    }
    const frenteHint = options?.frenteLengthHint ?? null;
    if (!front && frenteHint && frenteHint > 0) {
        front = pickSegmentByLengthHint(segments, frenteHint);
    }
    if (!front) {
        const external = segments.filter((s) => s.isExternal);
        const candidates = external.length > 0 ? external : segments;
        front = candidates.reduce((a, b) => (a.length < b.length ? a : b));
    }

    let frontIndex = findSegmentIndex(segments, front);
    if (frontIndex < 0) frontIndex = 0;

    const fundoHint = options?.fundoLengthHint ?? null;
    let back: Segment | null = null;
    const backCandidates = segments.filter(
        (s, idx) => idx !== frontIndex && isOppositeParallel(s.azimuth, segments[frontIndex].azimuth),
    );
    if (backCandidates.length > 0) {
        back = backCandidates.reduce((best, s) => {
            const dLen = Math.abs(s.length - segments[frontIndex].length);
            const bLen = best ? Math.abs(best.length - segments[frontIndex].length) : Infinity;
            if (dLen < bLen) return s;
            if (fundoHint && fundoHint > 0) {
                const sd = Math.abs(s.length - fundoHint);
                const bd = Math.abs(best.length - fundoHint);
                return sd < bd ? s : best;
            }
            return best;
        }, null as Segment | null);
    } else {
        back = segments
            .filter((_, idx) => idx !== frontIndex)
            .reduce((best, s) => {
                const dev = Math.abs(diffAngle(s.azimuth, segments[frontIndex].azimuth) - 180);
                const bDev = best
                    ? Math.abs(diffAngle(best.azimuth, segments[frontIndex].azimuth) - 180)
                    : Infinity;
                return dev < bDev ? s : best;
            }, null as Segment | null);
    }

    let backIndex = findSegmentIndex(segments, back);
    if (backIndex < 0 || backIndex === frontIndex) {
        backIndex = (frontIndex + Math.floor(segments.length / 2)) % segments.length;
    }

    const ring = classifySidesByRingPaths(segments, frontIndex, backIndex);

    if (options?.lotNumber !== undefined) {
        console.log("MEASURE_RING_PATHS", options.lotNumber, {
            frontIndex: ring.frontIndex,
            backIndex: ring.backIndex,
            pathA: ring.pathA,
            pathB: ring.pathB,
        });
    }

    const roleByIndex = new Map<number, LotSideRole>();
    roleByIndex.set(frontIndex, "frente");
    roleByIndex.set(backIndex, "fundo");
    for (const idx of ring.pathA.indexes) roleByIndex.set(idx, "ladoDireito");
    for (const idx of ring.pathB.indexes) roleByIndex.set(idx, "ladoEsquerdo");
    for (let i = 0; i < segments.length; i++) {
        if (roleByIndex.has(i)) continue;
        const len = segments[i].length;
        if (len >= CHANFRE_MIN_M && len <= CHANFRE_MAX_M) {
            roleByIndex.set(i, "chanfre");
        }
    }

    const segmentDebug: SegmentMeasureDebug[] = segments.map((s, index) => ({
        index,
        length: round(s.length),
        angle: round(s.azimuth),
        role: roleByIndex.get(index) || "other",
    }));

    return {
        frente: ring.frente,
        fundo: ring.fundo,
        ladoDireito: ring.ladoDireito,
        ladoEsquerdo: ring.ladoEsquerdo,
        chanfro: ring.chanfro,
        segmentDebug,
        ringPaths: ring,
    };
}

/**
 * 1. Extrair TODOS os segmentos ignorando irrelevantes
 */
function safeCoordRing(coords: unknown): number[][] {
    if (!Array.isArray(coords)) return [];
    const out: number[][] = [];
    for (const c of coords) {
        if (!Array.isArray(c) || c.length < 2) continue;
        const x = Number(c[0]);
        const y = Number(c[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        out.push([x, y]);
    }
    return out;
}

export function extractSegments(coords: number[][], allPolys: number[][][]): Segment[] {
    const FATOR_CORRECAO = 0.9984089101034208;
    const segments: Segment[] = [];
    const safeCoords = safeCoordRing(coords);
    const safePolys = Array.isArray(allPolys)
        ? allPolys
            .map((p) => safeCoordRing(p))
            .filter((p) => p.length >= 2)
        : [];

    for (let i = 0; i < safeCoords.length - 1; i++) {
        const rawLength = calculateDistance(safeCoords[i], safeCoords[i+1]);
        const length = rawLength * FATOR_CORRECAO;
        if (length < 0.5) continue; // Ignorar segmentos extremamente pequenos
        
        segments.push({
            p1: safeCoords[i],
            p2: safeCoords[i+1],
            length,
            azimuth: calculateBearing(safeCoords[i], safeCoords[i+1]),
            originalIndex: i,
            isExternal: true
        });
    }

    // Verificar externalidade
    for (let seg of segments) {
        let matched = false;
        for (let other of safePolys) {
            if (other === safeCoords) continue;
            for (let j = 0; j < other.length - 1; j++) {
                const d1 = calculateDistance(seg.p1, other[j]);
                const d2 = calculateDistance(seg.p2, other[j+1]);
                const d3 = calculateDistance(seg.p1, other[j+1]);
                const d4 = calculateDistance(seg.p2, other[j]);
                if ((d1 < 1.0 && d2 < 1.0) || (d3 < 1.0 && d4 < 1.0)) {
                    matched = true;
                    break;
                }
            }
            if (matched) break;
        }
        seg.isExternal = !matched;
    }

    return segments;
}

/**
 * Agrupar segmentos com base em curvas e polígonos complexos
 */
export function mergeCurvedSegments(segments: Segment[], tolerance: number = 20): Segment[] {
    if (segments.length <= 1) return segments;
    const merged: Segment[] = [];
    
    let currentGroup = [segments[0]];
    
    for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        const refAzimuth = currentGroup[0].azimuth;
        
        let diff = diffAngle(seg.azimuth, refAzimuth);
        let diffRev = Math.abs(diff - 180);
        let isCollinear = Math.min(diff, diffRev) <= tolerance;
        
        if (isCollinear && seg.originalIndex === currentGroup[currentGroup.length - 1].originalIndex + 1) {
            currentGroup.push(seg);
        } else {
            merged.push(createMergedSegment(currentGroup));
            currentGroup = [seg];
        }
    }
    
    if (currentGroup.length > 0) {
        if (merged.length > 0) {
            const firstGroup = merged[0];
            const refAzimuth = currentGroup[0].azimuth;
            let diff = diffAngle(firstGroup.azimuth, refAzimuth);
            let diffRev = Math.abs(diff - 180);
            let isCollinear = Math.min(diff, diffRev) <= tolerance;

            if (isCollinear && currentGroup[currentGroup.length - 1].originalIndex === segments[segments.length - 1].originalIndex) {
                merged[0] = createMergedSegment([...currentGroup, ...firstGroup]);
            } else {
                merged.push(createMergedSegment(currentGroup));
            }
        } else {
            merged.push(createMergedSegment(currentGroup));
        }
    }
    
    return merged;
}

function createMergedSegment(group: Segment[]): Segment {
    const totalLength = group.reduce((sum, s) => sum + s.length, 0);
    const dominant = [...group].sort((a,b) => b.length - a.length)[0];
    
    return {
        ...group[0],
        p2: group[group.length - 1].p2,
        length: totalLength,
        azimuth: dominant.azimuth,
        isExternal: group.some(g => g.isExternal)
    };
}

/**
 * 2. Identificar automaticamente a FRENTE
 */
export function detectFront(segments: Segment[]): Segment {
    const externalSegs = segments.filter(s => s.isExternal);
    
    if (externalSegs.length > 0) {
        return externalSegs.reduce((a, b) => {
            const yA = (a.p1[1] + a.p2[1]) / 2;
            const yB = (b.p1[1] + b.p2[1]) / 2;
            // Assumir sul como frente na ausência de rua conhecida
            return yB < yA ? b : a; 
        });
    }
    // Fallback: menor segmento horizontal (menor lado)
    return segments.reduce((a, b) => a.length < b.length ? a : b); 
}

/**
 * 3. Identificar o FUNDO
 */
export function detectBack(segments: Segment[], front: Segment): Segment | null {
    const parallelOpposite = segments.filter(
        (s) => s !== front && isOppositeParallel(s.azimuth, front.azimuth),
    );
    if (parallelOpposite.length > 0) {
        return parallelOpposite.reduce((best, s) => {
            const dLen = Math.abs(s.length - front.length);
            const bLen = best ? Math.abs(best.length - front.length) : Infinity;
            return dLen < bLen ? s : best;
        }, null as Segment | null);
    }

    const fundoCandidates = segments.filter((s) => s !== front);
    if (fundoCandidates.length === 0) return null;

    return fundoCandidates.reduce((best, s) => {
        const dev1 = Math.abs(diffAngle(s.azimuth, front.azimuth) - 180);
        const dev2 = best
            ? Math.abs(diffAngle(best.azimuth, front.azimuth) - 180)
            : Infinity;
        return dev1 < dev2 ? s : best;
    }, null as Segment | null);
}

/**
 * 4. Identificar LADOS
 */
export function detectSides(segments: Segment[], front: Segment | null, back: Segment | null) {
    const sides = segments.filter((s) => s !== front && s !== back);

    let ladoDirVal = 0;
    let ladoEsqVal = 0;

    if (sides.length === 0 && front && back) {
        ladoDirVal = back.length / 2;
        ladoEsqVal = back.length / 2;
    } else if (sides.length === 1 && back) {
        ladoDirVal = sides[0].length / 2;
        ladoEsqVal = sides[0].length / 2;
    } else if (sides.length >= 2 && front) {
        const sorted = [...sides].sort((a, b) => b.length - a.length);
        for (const s of sorted.slice(0, 2)) {
            const sign = crossSignRelativeToFront(front, s);
            if (sign >= 0) ladoDirVal += s.length;
            else ladoEsqVal += s.length;
        }
    }

    if (ladoDirVal === 0 && ladoEsqVal > 0) ladoDirVal = ladoEsqVal;
    if (ladoEsqVal === 0 && ladoDirVal > 0) ladoEsqVal = ladoDirVal;

    return { ladoDireito: ladoDirVal, ladoEsquerdo: ladoEsqVal };
}

export function normalizeDimensions(val: number, fallback: number): number {
    return val > 0 ? parseFloat(val.toFixed(2)) : parseFloat(fallback.toFixed(2));
}

/**
 * PRINCIPAL: Resolve e retorna as dimensões completas sem valores vazios
 */
export function calculateLotDimensions(coords: number[][], allPolys: number[][][], geomProps: any = {}) {
    if (!coords || coords.length < 4) return { frente: 10, fundo: 10, ladoDireito: 25, ladoEsquerdo: 25 };
    
    const extractProp = (keys: string[]) => {
        for (let key of keys) {
            for (let prop in geomProps) {
                if (prop.toUpperCase().includes(key)) {
                    const valStr = geomProps[prop];
                    if (typeof valStr === 'string' || typeof valStr === 'number') {
                        const match = String(valStr).replace(/\s/g, '').match(/^[\d.,]+/);
                        if (match) {
                            const val = parseFloat(match[0].replace(',', '.'));
                            if (!isNaN(val) && val > 0) return val;
                        }
                    }
                }
            }
        }
        return null;
    };

    const propFrente = extractProp(['FRENTE', 'FRONT']);
    const propFundo = extractProp(['FUNDO', 'BACK']);
    const propDir = extractProp(['DIR', 'DIREITA', 'LADO_DIR', 'LDIREITO', 'COMPR_DIR', 'COMPRIMENTO_DIR']);
    const propEsq = extractProp(['ESQ', 'ESQUERDA', 'LADO_ESQ', 'LESQUERDO', 'COMPR_ESQ', 'MEDIDA_ESQ']);

    if (propFrente && propFundo && propDir && propEsq) {
        let calculatedChanfro = 0;
        try {
            const rawSegments = extractSegments(coords, allPolys);
            const segments = mergeCurvedSegments(rawSegments, 20);
            if (segments.length > 4) {
                const frenteRaw = detectFront(segments);
                const fundoRaw = detectBack(segments, frenteRaw);
                const chanfroSegments = segments.filter((s, idx) => {
                    if (s === frenteRaw || s === fundoRaw) return false;
                    const prevSeg = segments[(idx - 1 + segments.length) % segments.length];
                    const nextSeg = segments[(idx + 1) % segments.length];
                    const deflPrev = diffAngle(s.azimuth, prevSeg.azimuth);
                    const deflNext = diffAngle(s.azimuth, nextSeg.azimuth);
                    const relAzimuth = (s.azimuth - (frenteRaw?.azimuth || 0) + 360) % 360;
                    const dev = Math.min(
                        relAzimuth,
                        Math.abs(relAzimuth - 90),
                        Math.abs(relAzimuth - 180),
                        Math.abs(relAzimuth - 270),
                        Math.abs(relAzimuth - 360)
                    );
                    return s.length < 8 && (deflPrev < 40 || deflNext < 40 || dev > 25);
                });
                calculatedChanfro = chanfroSegments.reduce((sum, s) => sum + s.length, 0);
            }
        } catch (e) {
            console.error("Erro calcular chanfro para TXT_CIVIL3D", e);
        }
        return {
            frente: propFrente,
            fundo: propFundo,
            ladoDireito: propDir,
            ladoEsquerdo: propEsq,
            chanfro: parseFloat(calculatedChanfro.toFixed(2))
        };
    }

    // Calcular via geometria
    const rawSegments = extractSegments(coords, allPolys);
    console.log("LOT_DIMENSION_SEGMENTS", rawSegments.length, "segments extracted");
    
    let result = { 
        frente: propFrente || 0, 
        fundo: propFundo || 0, 
        ladoDireito: propDir || 0, 
        ladoEsquerdo: propEsq || 0 
    };

    let finalChanfro = 0;

    if (rawSegments.length > 0) {
        const classified = classifyLotSidesFromSegments(rawSegments, {
            frenteLengthHint: propFrente,
            fundoLengthHint: propFundo,
        });

        finalChanfro = classified.chanfro;
        if (!result.frente) result.frente = classified.frente;
        if (!result.fundo) result.fundo = classified.fundo;
        if (!result.ladoDireito) result.ladoDireito = classified.ladoDireito;
        if (!result.ladoEsquerdo) result.ladoEsquerdo = classified.ladoEsquerdo;
    }

    // Nunca devolver lados vazios, fallback p/ Centroid ou maior lado
    if (result.ladoDireito === 0 && result.ladoEsquerdo === 0 && rawSegments.length > 0) {
        const longest = rawSegments.sort((a,b) => b.length - a.length)[0].length;
        result.ladoDireito = longest;
        result.ladoEsquerdo = longest;
    } else if (result.ladoDireito === 0 && result.ladoEsquerdo > 0) {
        result.ladoDireito = result.ladoEsquerdo;
    } else if (result.ladoEsquerdo === 0 && result.ladoDireito > 0) {
        result.ladoEsquerdo = result.ladoDireito;
    }

    const finalFrente = normalizeDimensions(result.frente, 10);
    const finalFundo = normalizeDimensions(result.fundo, finalFrente);
    const finalDir = normalizeDimensions(result.ladoDireito, finalFrente * 2);
    const finalEsq = normalizeDimensions(result.ladoEsquerdo, finalDir);

    console.log("LOT_DIMENSION_FINAL_WITH_20_DEGREE_TOLERANCE", {
        frente: finalFrente,
        fundo: finalFundo,
        ladoDireito: finalDir,
        ladoEsquerdo: finalEsq,
        chanfro: finalChanfro
    });

    console.log("LOT_DIMENSION_FINAL_RESULT", {
        frente: finalFrente,
        fundo: finalFundo,
        ladoDireito: finalDir,
        ladoEsquerdo: finalEsq,
        chanfro: finalChanfro
    });

    return {
        frente: finalFrente,
        fundo: finalFundo,
        ladoDireito: finalDir,
        ladoEsquerdo: finalEsq,
        chanfro: finalChanfro
    };
}
