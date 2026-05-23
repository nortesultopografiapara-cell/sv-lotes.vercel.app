const https = require('https');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

function fetch(path) {
  return new Promise((resolve, reject) => {
    const url = `${supabaseUrl}/rest/v1/${path}`;
    const options = {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          reject(new Error(`HTML/text response: ${data.substring(0, 500)}`));
        }
      });
    }).on('error', reject);
  });
}

// Matching algorithm
function matchDimensions(coords, dbFrente, dbFundo, dbDir, dbEsq) {
  // Convert coordinates to UTM
  const utmPts = coords.map(p => wgs84ToUtm(p[0], p[1], 22));
  const n = utmPts.length;
  const rawSegments = [];
  for (let i = 0; i < n; i++) {
    rawSegments.push(dist(utmPts[i], utmPts[(i + 1) % n]));
  }

  // Get all reduced 4-segment options
  let options = [];
  if (rawSegments.length === 4) {
    options.push([...rawSegments]);
  } else if (rawSegments.length > 4) {
    // We need to merge consecutive segments to reduce them to 4
    const diff = rawSegments.length - 4;
    // For simplicity, handle length 5 by merging 1 pair
    if (rawSegments.length === 5) {
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
      // General fallback if polygon has too many vertices
      options.push([rawSegments[0], rawSegments[1], rawSegments[2], rawSegments.slice(3).reduce((sum, v) => sum + v, 0)]);
    }
  } else {
    // Under 4 (triangle, etc), pad with 0s
    const padded = [...rawSegments];
    while (padded.length < 4) padded.push(0);
    options.push(padded);
  }

  // Permutation generator for 4 elements
  const dbTargets = [dbFrente, dbEsq, dbFundo, dbDir]; // ordering: frente, esq, fundo, dir (consecutive order of side naming)
  
  let best = null;
  let minErr = Infinity;

  for (const segs4 of options) {
    // Generate cyclic permutations (and reversed) of segs4
    const perms = [];
    for (let c = 0; c < 4; c++) {
      // Forward
      const fwd = [segs4[c], segs4[(c + 1) % 4], segs4[(c + 2) % 4], segs4[(c + 3) % 4]];
      perms.push({ values: fwd, reverse: false });
      // Reverse
      const rev = [segs4[c], segs4[(c + 3) % 4], segs4[(c + 2) % 4], segs4[(c + 1) % 4]];
      perms.push({ values: rev, reverse: true });
    }

    for (const p of perms) {
      const err = Math.abs(p.values[0] - dbFrente) +
                  Math.abs(p.values[1] - dbEsq) +
                  Math.abs(p.values[2] - dbFundo) +
                  Math.abs(p.values[3] - dbDir);
      if (err < minErr) {
        minErr = err;
        best = {
          frente: p.values[0],
          esq: p.values[1],
          fundo: p.values[2],
          dir: p.values[3],
          err: err
        };
      }
    }
  }

  return best;
}

async function run() {
  try {
    const blocks = await fetch('blocks?block_name=eq.01&limit=5');
    console.log("=== TESTING MATCHING ALGORITHM ON DATABASE LOTS ===");
    for (const block of blocks) {
      if (!block.geometry || !block.geometry.coordinates) continue;
      // Coordinates of outermost ring of polygon
      const coords = block.geometry.coordinates[0];
      // Note: GeoJSON polygons close themselves (first and last coordinate is same). Strip the duplicate last element.
      const closedCoords = coords.slice(0, coords.length - 1);
      
      console.log(`\nLote ${block.lot_number}:`);
      console.log(`  Database Brute: Frente = ${block.frente}, Fundo = ${block.fundo}, Dir = ${block.lado_direito}, Esq = ${block.lado_esquerdo}`);
      
      const matched = matchDimensions(closedCoords, block.frente, block.fundo, block.lado_direito, block.lado_esquerdo);
      
      if (matched) {
        console.log(`  UTM Calculated: Frente = ${matched.frente.toFixed(2)}, Fundo = ${matched.fundo.toFixed(2)}, Dir = ${matched.dir.toFixed(2)}, Esq = ${matched.esq.toFixed(2)}`);
        console.log(`  Total Absolute Difference: ${matched.err.toFixed(3)} meters`);
      } else {
        console.log("  Failed to match.");
      }
    }
  } catch (e) {
    console.log("Error:", e.message);
  }
}

run();
