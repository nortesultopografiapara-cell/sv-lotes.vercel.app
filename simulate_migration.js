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

function fetchAll(path) {
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
          reject(new Error(`HTML response or bad format: ${data.substring(0, 500)}`));
        }
      });
    }).on('error', reject);
  });
}

function matchDimensions(coords, dbFrente, dbFundo, dbDir, dbEsq) {
  const utmPts = coords.map(p => wgs84ToUtm(p[0], p[1], 22));
  const n = utmPts.length;
  const rawSegments = [];
  for (let i = 0; i < n; i++) {
    rawSegments.push(dist(utmPts[i], utmPts[(i + 1) % n]));
  }

  let options = [];
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

  let best = null;
  let minErr = Infinity;

  for (const segs4 of options) {
    const perms = [];
    for (let c = 0; c < 4; c++) {
      const fwd = [segs4[c], segs4[(c + 1) % 4], segs4[(c + 2) % 4], segs4[(c + 3) % 4]];
      perms.push({ values: fwd, reverse: false });
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
          err: err,
          calculatedArea: areaShoelace(utmPts)
        };
      }
    }
  }

  return best;
}

async function run() {
  try {
    console.log("=== SCANNING FOR ALL BLOCKS / LOTS TO UPDATE ===");
    const blocks = await fetchAll('blocks');
    const projects = await fetchAll('projects');
    const projectMap = {};
    projects.forEach(p => { projectMap[p.id] = p.name; });

    console.log(`Successfully fetched ${blocks.length} blocks/lots from database.`);

    let matchingCount = 0;
    const simUpdates = [];

    for (const block of blocks) {
      if (!block.geometry || !block.geometry.coordinates) continue;
      const ring = block.geometry.coordinates[0];
      if (!ring || ring.length < 4) continue;
      const closedCoords = ring.slice(0, ring.length - 1);

      const dbFrente = block.frente || 0;
      const dbFundo = block.fundo || 0;
      const dbDir = block.lado_direito || 0;
      const dbEsq = block.lado_esquerdo || 0;

      const matched = matchDimensions(closedCoords, dbFrente, dbFundo, dbDir, dbEsq);
      if (matched && matched.err < 10) { // Keep matching realistic
         matchingCount++;
         simUpdates.push({
           id: block.id,
           project_name: projectMap[block.project_id] || "Unknown",
           block_name: block.block_name,
           lot_number: block.lot_number,
           old: { frente: dbFrente, fundo: dbFundo, dir: dbDir, esq: dbEsq, area: block.area },
           new: { 
             frente: parseFloat(matched.frente.toFixed(2)), 
             fundo: parseFloat(matched.fundo.toFixed(2)), 
             dir: parseFloat(matched.dir.toFixed(2)), 
             esq: parseFloat(matched.esq.toFixed(2)),
             area: parseFloat(matched.calculatedArea.toFixed(2))
           }
         });
      }
    }

    console.log(`\nMatched ${matchingCount} blocks with valid geometries out of ${blocks.length} total blocks.`);
    console.log("\n=== SAMPLE UPDATES (FIRST 15) ===");
    simUpdates.slice(0, 15).forEach(up => {
      console.log(`[${up.project_name}] Quadra ${up.block_name}, Lote ${up.lot_number}:`);
      console.log(`   Old: Frente: ${up.old.frente} | Fundo: ${up.old.fundo} | Dir: ${up.old.dir} | Esq: ${up.old.esq} | Area: ${up.old.area}`);
      console.log(`   New: Frente: ${up.new.frente} | Fundo: ${up.new.fundo} | Dir: ${up.new.dir} | Esq: ${up.new.esq} | Area: ${up.new.area}`);
    });

  } catch (e) {
    console.log("Error:", e.message);
  }
}

run();
