import { calibrateDistance, calibrateArea } from './measurementCalibration';

const PI = Math.PI;
const a = 6378137.0; // semi-major axis
const f = 1.0 / 298.257223563; // flattening
const bDef = a * (1.0 - f); // semi-minor axis
const e2 = (a*a - bDef*bDef) / (a*a);
const ePrime2 = (a*a - bDef*bDef) / (bDef*bDef);

export interface LatLng {
  lng: number;
  lat: number;
}

export interface UtmPoint {
  easting: number;
  northing: number;
}

export interface CalibratedLotData {
  raw: {
    frente: number;
    fundo: number;
    lado_direito: number;
    lado_esquerdo: number;
    area: number;
  };
  calibrated: {
    frente: number;
    fundo: number;
    lado_direito: number;
    lado_esquerdo: number;
    area: number;
  };
  frente?: number;
  fundo?: number;
  ladoDireito?: number;
  ladoEsquerdo?: number;
  area?: number;
}

export interface GISSegment {
  p1: [number, number];
  p2: [number, number];
  length: number;
}

// Global project factors local state for dynamic scaling
const globalProjectFactors: Record<string, number> = {};

export function getProjectMeasurementFactor(projectId?: string): number {
  if (!projectId) return 1.0;
  return globalProjectFactors[projectId] ?? 1.0;
}

export function applyProjectMeasurementFactor(value: number, projectId?: string): void {
  if (projectId) {
    globalProjectFactors[projectId] = value;
  }
}

function degreesToRadians(deg: number): number {
  return deg * PI / 180.0;
}

export function wgs84ToUtm(lng: number, lat: number, zone: number = 22): UtmPoint {
  const latRad = degreesToRadians(lat);
  const lngRad = degreesToRadians(lng);
  const lambda0 = degreesToRadians((zone - 1) * 6 - 180 + 3);
  const k0 = 0.9996;
  const falseEasting = 500000.0;
  const falseNorthing = 10000000.0; // Southern Hemisphere

  const N = a / Math.sqrt(1.0 - e2 * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = ePrime2 * Math.cos(latRad) * Math.cos(latRad);
  const A = Math.cos(latRad) * (lngRad - lambda0);

  const M = a * (
    (1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256) * latRad
    - (3*e2/8 + 3*e2*e2/32 + 45*e2*e2*e2/1024) * Math.sin(2*latRad)
    + (15*e2*e2/256 + 45*e2*e2*e2/1024) * Math.sin(4*latRad)
    - (35*e2*e2*e2/3072) * Math.sin(6*latRad)
  );

  const easting = falseEasting + k0 * N * (
    A + (1 - T + C) * A*A*A/6 + (5 - 18 * T + T*T + 72 * C - 58 * ePrime2) * A*A*A*A*A/120
  );

  const northing = falseNorthing + k0 * (
    M + N * Math.tan(latRad) * (
      A*A/2 + (5 - T + 9*C + 4*C*C) * A*A*A*A/24
      + (61 - 58 * T + T*T + 600 * C - 330 * ePrime2) * A*A*A*A*A*A/720
    )
  );

  return { easting, northing };
}

export function dist(p1: UtmPoint, p2: UtmPoint): number {
  const dx = p1.easting - p2.easting;
  const dy = p1.northing - p2.northing;
  return Math.sqrt(dx*dx + dy*dy);
}

export function areaShoelace(pts: UtmPoint[]): number {
  let sum = 0.0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    sum += p1.easting * p2.northing - p2.easting * p1.northing;
  }
  return Math.abs(sum) / 2.0;
}

export function extractSegments(coords: [number, number][], polygons?: any[], projectId?: string): GISSegment[] {
  let workingCoords = [...coords];
  if (
    workingCoords.length > 2 &&
    workingCoords[0][0] === workingCoords[workingCoords.length - 1][0] &&
    workingCoords[0][1] === workingCoords[workingCoords.length - 1][1]
  ) {
    workingCoords = workingCoords.slice(0, workingCoords.length - 1);
  }
  const utmPts = workingCoords.map(c => wgs84ToUtm(c[0], c[1], 22));
  const n = utmPts.length;
  const segments: GISSegment[] = [];
  for (let i = 0; i < n; i++) {
    const p1_utm = utmPts[i];
    const p2_utm = utmPts[(i + 1) % n];
    const distance = dist(p1_utm, p2_utm);
    segments.push({
      p1: workingCoords[i],
      p2: workingCoords[(i + 1) % n],
      length: Number(distance.toFixed(2))
    });
  }
  return segments;
}

export function detectSides(segments: GISSegment[], frontSeg: GISSegment, backSeg: GISSegment | null): { ladoDireito: number; ladoEsquerdo: number } {
  const otherSegs = segments.filter(s => s !== frontSeg && s !== backSeg);
  let ladoDireito = 0;
  let ladoEsquerdo = 0;
  if (otherSegs.length >= 2) {
    ladoDireito = otherSegs[0].length;
    ladoEsquerdo = otherSegs[1].length;
  } else if (otherSegs.length === 1) {
    ladoDireito = otherSegs[0].length;
    ladoEsquerdo = otherSegs[0].length;
  } else {
    ladoDireito = frontSeg.length;
    ladoEsquerdo = frontSeg.length;
  }
  return { ladoDireito, ladoEsquerdo };
}

export function normalizeDimensions(value: number, reference: number = 0): number {
  return Number(value.toFixed(2));
}

export function calculateCorrectedArea(area: number, projectId?: string): number {
  return Number(area.toFixed(2));
}

function parseOfficial(value: any): number | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === "" || str.toLowerCase() === "null") return null;
  const cleaned = str.replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Calculates and calibrates structural lot boundaries from coordinates,
 * prioritizing official database metrics if present.
 */
export function calculateLotDimensions(
  coords: [number, number][],
  allPolys?: any,
  dbDefault?: any,
  extraOptions?: any,
  moreOptions?: any
): CalibratedLotData {
  // Extract Project ID
  const projectId = dbDefault?.project_id || extraOptions?.projectId || moreOptions?.projectId || "";

  // Look for any passed official properties/values
  const searchSources = [dbDefault, extraOptions, moreOptions].filter(src => src && typeof src === 'object');
  
  let dbFrenteOficial: number | null = null;
  let dbFundoOficial: number | null = null;
  let dbDirOficial: number | null = null;
  let dbEsqOficial: number | null = null;
  let dbAreaOficial: number | null = null;

  for (const src of searchSources) {
    if (dbFrenteOficial === null && src.frente_oficial !== undefined) dbFrenteOficial = parseOfficial(src.frente_oficial);
    if (dbFundoOficial === null && src.fundo_oficial !== undefined) dbFundoOficial = parseOfficial(src.fundo_oficial);
    if (dbDirOficial === null && src.dir_oficial !== undefined) dbDirOficial = parseOfficial(src.dir_oficial);
    if (dbEsqOficial === null && src.esq_oficial !== undefined) dbEsqOficial = parseOfficial(src.esq_oficial);
    if (dbAreaOficial === null && src.area !== undefined) dbAreaOficial = parseOfficial(src.area);
    
    if (src.properties && typeof src.properties === 'object') {
      const p = src.properties;
      if (dbFrenteOficial === null && p.frente_oficial !== undefined) dbFrenteOficial = parseOfficial(p.frente_oficial);
      if (dbFundoOficial === null && p.fundo_oficial !== undefined) dbFundoOficial = parseOfficial(p.fundo_oficial);
      if (dbDirOficial === null && p.dir_oficial !== undefined) dbDirOficial = parseOfficial(p.dir_oficial);
      if (dbEsqOficial === null && p.esq_oficial !== undefined) dbEsqOficial = parseOfficial(p.esq_oficial);
      if (dbAreaOficial === null && p.area !== undefined) dbAreaOficial = parseOfficial(p.area);
    }
  }

  // Clear any redundant closed loop point
  let workingCoords = [...coords];
  if (
    workingCoords.length > 2 &&
    workingCoords[0][0] === workingCoords[workingCoords.length - 1][0] &&
    workingCoords[0][1] === workingCoords[workingCoords.length - 1][1]
  ) {
    workingCoords = workingCoords.slice(0, workingCoords.length - 1);
  }

  const utmPts = workingCoords.map(c => wgs84ToUtm(c[0], c[1], 22));
  const n = utmPts.length;

  const rawSegments: number[] = [];
  for (let i = 0; i < n; i++) {
    rawSegments.push(dist(utmPts[i], utmPts[(i + 1) % n]));
  }

  // Calculate planar raw area
  const rawArea = areaShoelace(utmPts);

  // Targets for search/comparison (using parsed official values or legacy fields as backdoors)
  const dbF = dbFrenteOficial ?? parseOfficial(dbDefault?.frente) ?? 0;
  const dbFu = dbFundoOficial ?? parseOfficial(dbDefault?.fundo) ?? 0;
  const dbR = dbDirOficial ?? parseOfficial(dbDefault?.lado_direito) ?? parseOfficial(dbDefault?.ladoDireito) ?? 0;
  const dbL = dbEsqOficial ?? parseOfficial(dbDefault?.lado_esquerdo) ?? parseOfficial(dbDefault?.ladoEsquerdo) ?? 0;

  // Align segments which best correspond to layout (Frente, Esq, Fundo, Dir)
  let matched = { frente: 0, esq: 0, fundo: 0, dir: 0 };
  let minErr = Infinity;

  // Support 4-sided standard bounding, if 5 segments, test merged configurations
  let options: number[][] = [];
  if (rawSegments.length === 4) {
    options.push([...rawSegments]);
  } else if (rawSegments.length === 5) {
    for (let i = 0; i < 5; i++) {
      const copy = [...rawSegments];
      const mergedVal = copy[i] + copy[(i + 1) % 5];
      if (i === 4) {
        copy[4] = mergedVal;
        copy.splice(0, 1);
      } else {
        copy[i] = mergedVal;
        copy.splice(i + 1, 1);
      }
      options.push(copy);
    }
  } else {
    const padded = [...rawSegments];
    while (padded.length < 4) padded.push(0);
    options.push(padded.slice(0, 4));
  }

  for (const segs4 of options) {
    for (let c = 0; c < 4; c++) {
      // Forward alignment
      const fwd = [segs4[c], segs4[(c + 1) % 4], segs4[(c + 2) % 4], segs4[(c + 3) % 4]];
      const errFwd = Math.abs(fwd[0] - dbF) + Math.abs(fwd[1] - dbL) + Math.abs(fwd[2] - dbFu) + Math.abs(fwd[3] - dbR);
      if (errFwd < minErr) {
        minErr = errFwd;
        matched = { frente: fwd[0], esq: fwd[1], fundo: fwd[2], dir: fwd[3] };
      }

      // Reverse alignment
      const rev = [segs4[c], segs4[(c + 3) % 4], segs4[(c + 2) % 4], segs4[(c + 1) % 4]];
      const errRev = Math.abs(rev[0] - dbF) + Math.abs(rev[1] - dbL) + Math.abs(rev[2] - dbFu) + Math.abs(rev[3] - dbR);
      if (errRev < minErr) {
        minErr = errRev;
        matched = { frente: rev[0], esq: rev[1], fundo: rev[2], dir: rev[3] };
      }
    }
  }

  // Fallback defaults if mismatch is total
  if (matched.frente === 0 && rawSegments.length >= 4) {
    matched = {
      frente: rawSegments[0],
      esq: rawSegments[1],
      fundo: rawSegments[2],
      dir: rawSegments[3]
    };
  }

  const rawFront = matched.frente;
  const rawBack = matched.fundo;
  const rawRight = matched.dir;
  const rawLeft = matched.esq;

  // Determine calibration factor
  const factor = projectId ? getProjectMeasurementFactor(projectId) : 1.0;

  // 1. Resolve Frente
  let frenteCal: number;
  let frenteRaw: number;
  if (dbFrenteOficial !== null) {
    frenteCal = dbFrenteOficial;
    frenteRaw = dbFrenteOficial;
    console.log("GIS_OFFICIAL_MEASUREMENTS_USED", "frente_oficial");
  } else {
    if (factor !== 1.0) {
      frenteCal = Number((rawFront * factor).toFixed(2));
      frenteRaw = Number(rawFront.toFixed(2));
      console.log("GIS_FACTOR_K_FALLBACK_USED", "frente");
    } else {
      const globCal = calibrateDistance(rawFront);
      if (globCal !== rawFront) {
        frenteCal = globCal;
        frenteRaw = Number(rawFront.toFixed(2));
        console.log("GIS_FACTOR_K_FALLBACK_USED", "frente");
      } else {
        frenteCal = Number(rawFront.toFixed(2));
        frenteRaw = Number(rawFront.toFixed(2));
        console.log("GIS_GEOMETRY_FALLBACK_USED", "frente");
      }
    }
  }

  // 2. Resolve Fundo
  let fundoCal: number;
  let fundoRaw: number;
  if (dbFundoOficial !== null) {
    fundoCal = dbFundoOficial;
    fundoRaw = dbFundoOficial;
    console.log("GIS_OFFICIAL_MEASUREMENTS_USED", "fundo_oficial");
  } else {
    if (factor !== 1.0) {
      fundoCal = Number((rawBack * factor).toFixed(2));
      fundoRaw = Number(rawBack.toFixed(2));
      console.log("GIS_FACTOR_K_FALLBACK_USED", "fundo");
    } else {
      const globCal = calibrateDistance(rawBack);
      if (globCal !== rawBack) {
        fundoCal = globCal;
        fundoRaw = Number(rawBack.toFixed(2));
        console.log("GIS_FACTOR_K_FALLBACK_USED", "fundo");
      } else {
        fundoCal = Number(rawBack.toFixed(2));
        fundoRaw = Number(rawBack.toFixed(2));
        console.log("GIS_GEOMETRY_FALLBACK_USED", "fundo");
      }
    }
  }

  // 3. Resolve Lado Direito
  let dirCal: number;
  let dirRaw: number;
  if (dbDirOficial !== null) {
    dirCal = dbDirOficial;
    dirRaw = dbDirOficial;
    console.log("GIS_OFFICIAL_MEASUREMENTS_USED", "dir_oficial");
  } else {
    if (factor !== 1.0) {
      dirCal = Number((rawRight * factor).toFixed(2));
      dirRaw = Number(rawRight.toFixed(2));
      console.log("GIS_FACTOR_K_FALLBACK_USED", "lado_direito");
    } else {
      const globCal = calibrateDistance(rawRight);
      if (globCal !== rawRight) {
        dirCal = globCal;
        dirRaw = Number(rawRight.toFixed(2));
        console.log("GIS_FACTOR_K_FALLBACK_USED", "lado_direito");
      } else {
        dirCal = Number(rawRight.toFixed(2));
        dirRaw = Number(rawRight.toFixed(2));
        console.log("GIS_GEOMETRY_FALLBACK_USED", "lado_direito");
      }
    }
  }

  // 4. Resolve Lado Esquerdo
  let esqCal: number;
  let esqRaw: number;
  if (dbEsqOficial !== null) {
    esqCal = dbEsqOficial;
    esqRaw = dbEsqOficial;
    console.log("GIS_OFFICIAL_MEASUREMENTS_USED", "esq_oficial");
  } else {
    if (factor !== 1.0) {
      esqCal = Number((rawLeft * factor).toFixed(2));
      esqRaw = Number(rawLeft.toFixed(2));
      console.log("GIS_FACTOR_K_FALLBACK_USED", "lado_esquerdo");
    } else {
      const globCal = calibrateDistance(rawLeft);
      if (globCal !== rawLeft) {
        esqCal = globCal;
        esqRaw = Number(rawLeft.toFixed(2));
        console.log("GIS_FACTOR_K_FALLBACK_USED", "lado_esquerdo");
      } else {
        esqCal = Number(rawLeft.toFixed(2));
        esqRaw = Number(rawLeft.toFixed(2));
        console.log("GIS_GEOMETRY_FALLBACK_USED", "lado_esquerdo");
      }
    }
  }

  // 5. Resolve Area
  let areaCal: number;
  let areaRaw: number;
  if (dbAreaOficial !== null) {
    areaCal = dbAreaOficial;
    areaRaw = dbAreaOficial;
    console.log("GIS_OFFICIAL_MEASUREMENTS_USED", "area");
  } else {
    areaCal = calibrateArea(rawArea);
    areaRaw = Number(rawArea.toFixed(2));
    console.log("GIS_GEOMETRY_FALLBACK_USED", "area");
  }

  return {
    raw: {
      frente: frenteRaw,
      fundo: fundoRaw,
      lado_direito: dirRaw,
      lado_esquerdo: esqRaw,
      area: areaRaw
    },
    calibrated: {
      frente: frenteCal,
      fundo: fundoCal,
      lado_direito: dirCal,
      lado_esquerdo: esqCal,
      area: areaCal
    },
    frente: frenteCal,
    fundo: fundoCal,
    ladoDireito: dirCal,
    ladoEsquerdo: esqCal,
    area: areaCal
  };
}
