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
 * 5. PRINCIPAL: Resolve e retorna as dimensões completas
 * Usa o ALGORITMO INTELIGENTE que agrupa todos os segmentos nas 4 faces principais,
 * resolvendo o problema de fundos ou lados com múltiplos segmentos colineares ou irregulares.
 */
export function calculateLotDimensions(
  coords: number[][], 
  allPolys: number[][][], 
  geomProps: any = {}, 
  extra: { streetGuides?: any[]; lineStrings?: any[] } = {}
) {
    return calculateLotDimensionsAdvanced(coords, allPolys, geomProps, extra);
}

function minAngleDiff180(a1: number, a2: number): number {
    let diff = Math.abs(a1 - a2) % 180;
    return diff > 90 ? 180 - diff : diff;
}

function getDistancePointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
        return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
    }
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
}

export function calculateLotDimensionsAdvanced(
  coords: number[][], 
  allPolys: number[][][], 
  geomProps: any = {}, 
  extra: { streetGuides?: any[]; lineStrings?: any[] } = {}
) {
    if (!coords || coords.length < 4) return { frente: 10, fundo: 10, ladoDireito: 25, ladoEsquerdo: 25 };
    
    // 1. Tentar extrair do banco de dados/propriedades primeiro
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

    // 2. Extrair TODOS os segmentos do polígono
    const rawSegments = extractSegments(coords, allPolys);
    if (rawSegments.length === 0) return { frente: 10, fundo: 10, ladoDireito: 25, ladoEsquerdo: 25 };

    // 3. Obter centroid dos lotes para cálculo em cartesiano local (metro)
    let sumX = 0, sumY = 0;
    const n = coords.length - 1;
    for (let i = 0; i < n; i++) {
        sumX += coords[i][0];
        sumY += coords[i][1];
    }
    const centroid = [sumX / n, sumY / n];

    // Converter para cartesiano local em relação ao centroid para precisão em metros
    const latRad = (centroid[1] * Math.PI) / 180;
    const kx = 111320 * Math.cos(latRad);
    const ky = 111320;
    const getLocal = (pt: number[]) => {
        return {
            x: (pt[0] - centroid[0]) * kx,
            y: (pt[1] - centroid[1]) * ky
        };
    };

    const segmentsCartesian = rawSegments.map((s) => {
        const p1L = getLocal(s.p1);
        const p2L = getLocal(s.p2);
        const mid = { x: (p1L.x + p2L.x) / 2, y: (p1L.y + p2L.y) / 2 };
        const dx = p2L.x - p1L.x;
        const dy = p2L.y - p1L.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dx, dy) * 180 / Math.PI;
        const azimuth = (angle + 360) % 360;

        return {
            ...s,
            p1L,
            p2L,
            mid,
            length,
            azimuth
        };
    });

    // 4. Identificar as ruas/vias das camadas recebidas em extra
    const roadLines: any[] = [];
    if (extra && extra.streetGuides && Array.isArray(extra.streetGuides)) {
        for (const r of extra.streetGuides) {
            if (r.geometry_geojson && r.geometry_geojson.coordinates) {
                roadLines.push(r.geometry_geojson);
            } else if (r.geometry && r.geometry.coordinates) {
                roadLines.push(r.geometry);
            }
        }
    }
    if (extra && extra.lineStrings && Array.isArray(extra.lineStrings)) {
        for (const r of extra.lineStrings) {
            if (r.geometry && r.geometry.coordinates) {
                roadLines.push(r.geometry);
            } else if (r.geometry_geojson && r.geometry_geojson.coordinates) {
                roadLines.push(r.geometry_geojson);
            }
        }
    }

    // Converter as vias para cartesiano
    const cartesianRoads: { x: number; y: number }[][] = [];
    for (const rLine of roadLines) {
        if (rLine && Array.isArray(rLine.coordinates)) {
            cartesianRoads.push(rLine.coordinates.map((c: number[]) => getLocal(c)));
        }
    }

    let frontRefSegment = segmentsCartesian[0];
    let hasRoads = cartesianRoads.length > 0;

    if (hasRoads) {
        let bestScore = Infinity;
        for (const s of segmentsCartesian) {
            let minDist = Infinity;
            let closestRoadAzimuth = 0;

            for (const rPoints of cartesianRoads) {
                for (let j = 0; j < rPoints.length - 1; j++) {
                    const rA = rPoints[j];
                    const rB = rPoints[j + 1];
                    const dist = getDistancePointToSegment(s.mid.x, s.mid.y, rA.x, rA.y, rB.x, rB.y);
                    if (dist < minDist) {
                        minDist = dist;

                        const rdx = rB.x - rA.x;
                        const rdy = rB.y - rA.y;
                        const rLen = Math.sqrt(rdx * rdx + rdy * rdy);
                        if (rLen > 0.1) {
                            const rAngle = Math.atan2(rdx, rdy) * 180 / Math.PI;
                            closestRoadAzimuth = (rAngle + 360) % 360;
                        }
                    }
                }
            }

            // Penalizar o desvio angular em relação à rua para priorizar paralelismo
            const angleDiff = minAngleDiff180(s.azimuth, closestRoadAzimuth);
            const score = minDist + angleDiff * 1.5;

            if (score < bestScore) {
                bestScore = score;
                frontRefSegment = s;
            }
        }
    } else {
        // Fallback: usar o segmento mais ao Sul (bottom-most)
        const externalSegs = segmentsCartesian.filter(s => s.isExternal);
        if (externalSegs.length > 0) {
            frontRefSegment = externalSegs.reduce((a, b) => b.mid.y < a.mid.y ? b : a);
        } else {
            frontRefSegment = segmentsCartesian.reduce((a, b) => a.length < b.length ? a : b);
        }
    }

    const frontAngle = frontRefSegment.azimuth;
    const midFront = frontRefSegment.mid;

    // Vetor apontando da frente para dentro do lote (do midFront para o centroide [0, 0])
    const vecInward = { x: -midFront.x, y: -midFront.y };
    const inwardLen = Math.sqrt(vecInward.x * vecInward.x + vecInward.y * vecInward.y);
    const uInward = inwardLen > 0.1 ? { x: vecInward.x / inwardLen, y: vecInward.y / inwardLen } : { x: 0, y: 1 };
    
    // Vetor lateral à direita do vetor de entrada (rotacionado 90 graus no sentido horário)
    const uRight = { x: uInward.y, y: -uInward.x };

    let maxDepth = -Infinity;
    for (const s of segmentsCartesian) {
        const vecFromF = { x: s.mid.x - midFront.x, y: s.mid.y - midFront.y };
        const pDepth = vecFromF.x * uInward.x + vecFromF.y * uInward.y;
        if (pDepth > maxDepth) maxDepth = pDepth;
    }
    if (maxDepth <= 0.1) maxDepth = 10;

    let sumFrente = 0;
    let sumFundo = 0;
    let sumDir = 0;
    let sumEsq = 0;

    const debugSegments: any[] = [];

    // Classificar e somar as faces dentro da tolerância angular e posições projetadas
    for (const s of segmentsCartesian) {
        const diff = minAngleDiff180(s.azimuth, frontAngle);
        const vecFromF = { x: s.mid.x - midFront.x, y: s.mid.y - midFront.y };
        const pDepth = vecFromF.x * uInward.x + vecFromF.y * uInward.y;
        const pLat = vecFromF.x * uRight.x + vecFromF.y * uRight.y;

        let classification = "";

        if (diff <= 45) { // Tolerância de até 45 graus define a família da face (Frente/Fundo)
            if (pDepth < maxDepth * 0.35) { // Proximidade à frente determina se é Frente
                classification = "frente";
                sumFrente += s.length;
            } else {
                classification = "fundo";
                sumFundo += s.length;
            }
        } else { // Laterais
            if (pLat >= 0) {
                classification = "ladoDireito";
                sumDir += s.length;
            } else {
                classification = "ladoEsquerdo";
                sumEsq += s.length;
            }
        }

        debugSegments.push({
            p1: s.p1,
            p2: s.p2,
            length: s.length,
            azimuth: s.azimuth,
            classification,
            projDepth: pDepth,
            projLateral: pLat,
            angleDiffToFront: diff
        });
    }

    const result = {
        frente: propFrente || sumFrente,
        fundo: propFundo || sumFundo,
        ladoDireito: propDir || sumDir,
        ladoEsquerdo: propEsq || sumEsq
    };

    // Garantir preenchimentos lógicos (fallback para polígonos degenerados)
    if (result.frente === 0 && rawSegments.length > 0) {
        result.frente = frontRefSegment.length;
    }
    if (result.fundo === 0) {
        result.fundo = result.frente;
    }

    if (result.ladoDireito === 0 && result.ladoEsquerdo === 0 && rawSegments.length > 0) {
        const longest = Math.max(...rawSegments.map(s => s.length));
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

    console.log("ALGORITMO GIS INTELIGENTE ROAD-ORIENTED:");
    console.log(`Ref Azimuth da rua: ${frontAngle.toFixed(2)}° | Segmentos somados: ${rawSegments.length}`);
    console.log(`Frente: ${finalFrente} | Fundo: ${finalFundo} | Dir: ${finalDir} | Esq: ${finalEsq}`);

    if (typeof window !== "undefined") {
        (window as any)._lastLotDebug = {
            centroid,
            frontAngle,
            maxDepth,
            debugSegments
        };
    }

    return {
        frente: finalFrente,
        fundo: finalFundo,
        ladoDireito: finalDir,
        ladoEsquerdo: finalEsq,
        debugSegments // retornado para o mapa desenhar se debug ativo
    };
}

