const Math2 = Math;
const PI = Math.PI;

// WGS84 Ellipsoid constants
const a = 6378137.0; // semi-major axis
const f = 1.0 / 298.257223563; // flattening
const b = a * (1.0 - f); // semi-minor axis
const e2 = (a*a - b*b) / (a*a); // first eccentricity squared
const ePrime2 = (a*a - b*b) / (b*b); // second eccentricity squared

function degreesToRadians(deg) {
  return deg * PI / 180.0;
}

function wgs84ToUtm(lng, lat, zone) {
  const latRad = degreesToRadians(lat);
  const lngRad = degreesToRadians(lng);
  
  const lambda0 = degreesToRadians((zone - 1) * 6 - 180 + 3);
  
  const k0 = 0.9996; // scale factor
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

// Lote 2 coordinates
const pts = [
  [-49.8925693137043, -6.18358309853593],
  [-49.8928410296326, -6.18379246111839],
  [-49.8924569499232, -6.18425003968933],
  [-49.8921867219051, -6.18403890424202]
];

const utmPts = pts.map(p => wgs84ToUtm(p[0], p[1], 22));

console.log("=== LOTE 2 UTM POINTS ===");
utmPts.forEach((pt, i) => console.log(`Pt ${i+1}: Easting = ${pt.easting.toFixed(3)}, Northing = ${pt.northing.toFixed(3)}`));

function dist(p1, p2) {
  const dx = p1.easting - p2.easting;
  const dy = p1.northing - p2.northing;
  return Math.sqrt(dx*dx + dy*dy);
}

console.log("\n=== SIDE LENGTHS IN UTM ZONE 22S ===");
console.log(`Side 1-2 (Frente?): ${dist(utmPts[0], utmPts[1]).toFixed(3)}`);
console.log(`Side 2-3 (Direito?): ${dist(utmPts[1], utmPts[2]).toFixed(3)}`);
console.log(`Side 3-4 (Fundo?): ${dist(utmPts[2], utmPts[3]).toFixed(3)}`);
console.log(`Side 4-1 (Esquerdo?): ${dist(utmPts[3], utmPts[0]).toFixed(3)}`);
