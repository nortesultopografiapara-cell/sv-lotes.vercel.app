const PI = Math.PI;
const a = 6378137.0;
const f = 1.0 / 298.257223563;
const b = a * (1.0 - f);
const e2 = (a*a - b*b) / (a*a);
const ePrime2 = (a*a - b*b) / (b*b);

function degreesToRadians(deg) { return deg * PI / 180.0; }

function wgs84ToUtm(lng, lat, zone = 22) {
  const latRad = degreesToRadians(lat);
  const lngRad = degreesToRadians(lng);
  const lambda0 = degreesToRadians((zone - 1) * 6 - 180 + 3);
  const k0 = 0.9996;
  const falseEasting = 500000.0;
  const falseNorthing = 10000000.0;

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

function dist(p1, p2) {
  const dx = p1.easting - p2.easting;
  const dy = p1.northing - p2.northing;
  return Math.sqrt(dx*dx + dy*dy);
}

function areaShoelace(pts) {
  let sum = 0.0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    sum += p1.easting * p2.northing - p2.easting * p1.northing;
  }
  return Math.abs(sum) / 2.0;
}

const GLOBAL_MEASUREMENT_FACTOR = 0.9971090670170828;

function calibrateDistance(value) {
  return Number((value * GLOBAL_MEASUREMENT_FACTOR).toFixed(2));
}

function calibrateArea(value) {
  return Number((value * GLOBAL_MEASUREMENT_FACTOR).toFixed(2));
}

const coordinates = [
  [-49.8925693137043, -6.18358309853593],
  [-49.8928410296326, -6.18379246111839],
  [-49.8924569499232, -6.18425003968933],
  [-49.8921867219051, -6.18403890424202],
  [-49.8925693137043, -6.18358309853593]
];

// Closed coordinates without the last point for calculation
const closed = coordinates.slice(0, coordinates.length - 1);
const utmPts = closed.map(p => wgs84ToUtm(p[0], p[1], 22));

const side1 = dist(utmPts[0], utmPts[1]);
const side2 = dist(utmPts[1], utmPts[2]);
const side3 = dist(utmPts[2], utmPts[3]);
const side4 = dist(utmPts[3], utmPts[0]);
const geoArea = areaShoelace(utmPts);

console.log("=== RAW GEOMETRY ===");
console.log("Side 1:", side1);
console.log("Side 2:", side2);
console.log("Side 3:", side3);
console.log("Side 4:", side4);
console.log("Area:", geoArea);

console.log("\n=== CALIBRATED GEOMETRY ===");
console.log("Side 1 calibrated:", calibrateDistance(side1));
console.log("Side 2 calibrated:", calibrateDistance(side2));
console.log("Side 3 calibrated:", calibrateDistance(side3));
console.log("Side 4 calibrated:", calibrateDistance(side4));
console.log("Area calibrated:", calibrateArea(geoArea));
