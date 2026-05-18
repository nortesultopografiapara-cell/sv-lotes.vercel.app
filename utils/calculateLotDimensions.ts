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

/**
 * 1. Extrair TODOS os segmentos ignorando irrelevantes
 */
export function extractSegments(coords: number[][], allPolys: number[][][]): Segment[] {
    const FATOR_CORRECAO = 0.9984089101034208;
    const segments: Segment[] = [];
    
    for (let i = 0; i < coords.length - 1; i++) {
        const rawLength = calculateDistance(coords[i], coords[i+1]);
        const length = rawLength * FATOR_CORRECAO;
        if (length < 0.5) continue; // Ignorar segmentos extremamente pequenos
        
        segments.push({
            p1: coords[i],
            p2: coords[i+1],
            length,
            azimuth: calculateBearing(coords[i], coords[i+1]),
            originalIndex: i,
            isExternal: true
        });
    }

    // Verificar externalidade
    for (let seg of segments) {
        let matched = false;
        for (let other of allPolys) {
            if (other === coords) continue;
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
        const lastInGroup = currentGroup[currentGroup.length - 1];
        
        if (diffAngle(seg.azimuth, lastInGroup.azimuth) <= tolerance && 
            (seg.originalIndex === lastInGroup.originalIndex + 1 ||
             seg.originalIndex === 0 && lastInGroup.originalIndex > 1)) {
            currentGroup.push(seg);
        } else {
            merged.push(createMergedSegment(currentGroup));
            currentGroup = [seg];
        }
    }
    
    if (currentGroup.length > 0) {
        merged.push(createMergedSegment(currentGroup));
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
        azimuth: dominant.azimuth
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
    let fundoCandidates = segments.filter(s => s !== front);
    if (fundoCandidates.length === 0) return null;
    
    return fundoCandidates.reduce(
       (best, s) => {
           let diff = diffAngle(s.azimuth, front.azimuth);
           let bestDiff = best ? diffAngle(best.azimuth, front.azimuth) : -1;
           if (!best) return s;
           // Procurar o ângulo mais oposto (invertido ~180°)
           let dev1 = Math.abs(diff - 180);
           let dev2 = Math.abs(bestDiff - 180);
           return dev1 < dev2 ? s : best;
       }, null as Segment | null
    );
}

/**
 * 4. Identificar LADOS
 */
export function detectSides(segments: Segment[], front: Segment | null, back: Segment | null) {
    const sides = segments.filter(s => s !== front && s !== back);
    
    let ladoDirVal = 0;
    let ladoEsqVal = 0;

    if (sides.length === 0 && front && back) {
        // Fallback: triângulo (fundo calculado dividido) ou fallback geral
        ladoDirVal = back.length / 2;
        ladoEsqVal = back.length / 2;
    } else if (sides.length === 1 && back) {
        ladoDirVal = sides[0].length / 2;
        ladoEsqVal = sides[0].length / 2;
    } else if (sides.length >= 2 && front) {
        // Ordenar sentido horário ou ângulo de base da frente
        for (let s of sides) {
            let diff = (s.azimuth - front.azimuth + 360) % 360;
            // Paralelismo ou agrupamento em tolerância de 15 a 180 graus dita os lados
            if (diff >= 45 && diff < 180) {
                ladoDirVal += s.length;
            } else {
                ladoEsqVal += s.length;
            }
        }
    }

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
        return {
            frente: propFrente,
            fundo: propFundo,
            ladoDireito: propDir,
            ladoEsquerdo: propEsq
        };
    }

    // Calcular via geometria
    const rawSegments = extractSegments(coords, allPolys);
    const segments = mergeCurvedSegments(rawSegments, 20); // 20° tolerância
    
    let result = { 
        frente: propFrente || 0, 
        fundo: propFundo || 0, 
        ladoDireito: propDir || 0, 
        ladoEsquerdo: propEsq || 0 
    };

    if (segments.length > 0) {
        const frenteRaw = detectFront(segments);
        const fundoRaw = detectBack(segments, frenteRaw);
        const calcSides = detectSides(segments, frenteRaw, fundoRaw);

        if (!result.frente) result.frente = frenteRaw ? frenteRaw.length : 0;
        if (!result.fundo) result.fundo = fundoRaw ? fundoRaw.length : result.frente;
        if (!result.ladoDireito) result.ladoDireito = calcSides.ladoDireito;
        if (!result.ladoEsquerdo) result.ladoEsquerdo = calcSides.ladoEsquerdo;
    }

    // Nunca devolver lados vazios, fallback p/ Centroid ou maior lado
    if (result.ladoDireito === 0 && result.ladoEsquerdo === 0 && segments.length > 0) {
        const longest = segments.sort((a,b) => b.length - a.length)[0].length;
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

    return {
        frente: finalFrente,
        fundo: finalFundo,
        ladoDireito: finalDir,
        ladoEsquerdo: finalEsq
    };
}
