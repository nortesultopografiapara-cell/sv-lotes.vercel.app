import { calibrateDistance, calibrateArea } from './measurementCalibration';

const PI = Math.PI;
const a = 6378137.0; // semi-major axis
const f = 1.0 / 298.257223563; // flattening
const b = a * (1.0 - f); // semi-minor axis
const e2 = (a*a - b*b) / (a*a);
const ePrime2 = (a*a - b*b) / (b*b);

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

/**
 * Calculates and calibrates structural lot boundaries from coordinates
 */
export function calculateLotDimensions(coords: [number, number][], dbDefault?: { frente?: number, fundo?: number, lado_direito?: number, lado_esquerdo?: number }): CalibratedLotData {
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

  // Default db comparison targets
  const dbF = dbDefault?.frente ?? 0;
  const dbFu = dbDefault?.fundo ?? 0;
  const dbR = dbDefault?.lado_direito ?? 0;
  const dbL = dbDefault?.lado_esquerdo ?? 0;

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

  // Perform calibration
  const frenteCal = calibrateDistance(rawFront);
  const fundoCal = calibrateDistance(rawBack);
  const dirCal = calibrateDistance(rawRight);
  const esqCal = calibrateDistance(rawLeft);
  const areaCal = calibrateArea(rawArea);

  // REQUIRED LOGGING IN ASSIGNED FORMAT
  console.log({ rawFront, calibratedFront: frenteCal });
  console.log({ rawArea, calibratedArea: areaCal });

  return {
    raw: {
      frente: Number(rawFront.toFixed(2)),
      fundo: Number(rawBack.toFixed(2)),
      lado_direito: Number(rawRight.toFixed(2)),
      lado_esquerdo: Number(rawLeft.toFixed(2)),
      area: Number(rawArea.toFixed(2))
    },
    calibrated: {
      frente: frenteCal,
      fundo: fundoCal,
      lado_direito: dirCal,
      lado_esquerdo: esqCal,
      area: areaCal
    }
  };
}
