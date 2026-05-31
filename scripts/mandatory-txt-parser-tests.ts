/**
 * Testes obrigatórios do parser TXT Civil 3D.
 *   npx tsx scripts/mandatory-txt-parser-tests.ts
 */
import {
  parseCivil3dTxtLots,
  civil3dLotToImportPayload,
  computeOfficialChainClosureErrorM,
  civil3dParsedToOfficialSegments,
  buildUtmRingFromOfficialSegments,
  computeQuadraUtmCentroidFromParsedLots,
  validateQuadraImportAgainstProject,
  readCoordPairFromLine,
} from "../lib/civil3dTxtParser";

const PROJ4 =
  "+proj=utm +zone=22 +south +datum=WGS84 +units=m +no_defs";

type Result = { id: number; name: string; pass: boolean; detail: string };

const results: Result[] = [];

function assert(id: number, name: string, ok: boolean, detail: string) {
  results.push({ id, name, pass: ok, detail });
}

function ringAreaM2(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [e1, n1] = ring[i];
    const [e2, n2] = ring[(i + 1) % n];
    sum += e1 * n2 - e2 * n1;
  }
  return Math.abs(sum) * 0.5;
}

function evaluateLot(txt: string, lotName: string) {
  const lots = parseCivil3dTxtLots(txt);
  const lot = lots.find((l) => String(l.name).trim() === lotName) ?? lots[0];
  const official = civil3dParsedToOfficialSegments(lot.segments, lot.name);
  const closure = computeOfficialChainClosureErrorM(official);
  const payload = civil3dLotToImportPayload(lot, PROJ4, null);
  const usedLegacy =
    lot.segments.length > 0 &&
    lot.segments.every((s) => s.type === "LINE") &&
    official.length < lot.segments.length;
  const legacySuspect =
    lot.segments.length >= 2 &&
    lot.segments.every((s) => s.north === 0 && s.east === 0 && s.segmentNumber > 1);
  return {
    lot,
    lots,
    official,
    closure,
    payload,
    usedLegacy,
    legacySuspect,
  };
}

// --- Fixtures ---

const RECT_4_LINES = `Name: RET-4L
Area: 5000.00
Perimeter: 300.00
North: 1000.0000m     East: 500000.0000m

Segment #1  :  Line
Length: 50.000m
North: 1050.0000m     East: 500000.0000m

Segment #2  :  Line
Length: 100.000m
North: 1050.0000m     East: 500100.0000m

Segment #3  :  Line
Length: 50.000m
North: 1000.0000m     East: 500100.0000m

Segment #4  :  Line
Length: 100.000m
North: 1000.0000m     East: 500000.0000m
`;

const CORNER_CHAMFRE = `Name: ESQ-CHAN
Area: 800.00
Perimeter: 120.00
North: 2000.0000m     East: 600000.0000m

Segment #1  :  Line
Length: 40.000m
North: 2040.0000m     East: 600000.0000m

Segment #2  :  Line
Length: 8.000m
North: 2045.6569m     East: 600005.6569m

Segment #3  :  Line
Length: 30.000m
North: 2045.6569m     East: 600035.6569m

Segment #4  :  Line
Length: 50.000m
North: 2000.0000m     East: 600035.6569m

Segment #5  :  Line
Length: 35.6569m
North: 2000.0000m     East: 600000.0000m
`;

const ONE_CURVE = `Name: CURVE-1
Area: 400.00
Perimeter: 80.00
North: 3000.0000m     East: 610000.0000m

Segment #1  :  Line
Length: 20.000m
North: 3020.0000m     East: 610000.0000m

Segment #2  :  Curve
Length: 15.000m     Radius: 30.000m
End North: 3010.0000m     End East: 610015.0000m
RP North: 3025.0000m     RP East: 610020.0000m

Segment #3  :  Line
Length: 25.000m
North: 3000.0000m     East: 610015.0000m

Segment #4  :  Line
Length: 20.000m
North: 3000.0000m     East: 610000.0000m
`;

const CURVE_SEG1 = `Name: CURVE-S1
Area: 350.00
Perimeter: 75.00
End North: 4000.0000m     End East: 620000.0000m

Segment #1  :  Curve
Length: 20.000m     Radius: 40.000m
End North: 4015.0000m     End East: 620010.0000m
RP North: 4020.0000m     RP East: 620020.0000m

Segment #2  :  Line
Length: 30.000m
North: 4015.0000m     East: 620040.0000m

Segment #3  :  Line
Length: 25.000m
North: 4000.0000m     East: 620040.0000m

Segment #4  :  Line
Length: 30.000m
North: 4000.0000m     East: 620000.0000m
`;

const TWO_CURVES = `Name: CURVE-2X
Area: 600.00
Perimeter: 100.00
North: 5000.0000m     East: 630000.0000m

Segment #1  :  Line
Length: 25.000m
North: 5025.0000m     East: 630000.0000m

Segment #2  :  Curve
Length: 12.000m
End North: 5020.0000m     End East: 630012.0000m
RP North: 5030.0000m     RP East: 630015.0000m

Segment #3  :  Line
Length: 20.000m
North: 5020.0000m     East: 630032.0000m

Segment #4  :  Curve
Length: 12.000m
End North: 5008.0000m     End East: 630032.0000m
RP North: 5005.0000m     RP East: 630025.0000m

Segment #5  :  Line
Length: 25.000m
North: 5000.0000m     East: 630000.0000m
`;

const INLINE_NE_HEADER = `Name: INLINE-NE
Area: 100.00
Perimeter: 40.00
North: 6000.0000m     East: 640000.0000m

Segment #1  :  Line
Length: 10.000m
North: 6010.0000m     East: 640000.0000m

Segment #2  :  Line
Length: 10.000m
North: 6010.0000m     East: 640010.0000m

Segment #3  :  Line
Length: 10.000m
North: 6000.0000m     East: 640010.0000m

Segment #4  :  Line
Length: 10.000m
North: 6000.0000m     East: 640000.0000m
`;

/** Civil 3D Q04: End North + East na mesma linha (sem rótulo "End East"). */
const INLINE_END_NORTH_EAST = `Name: INLINE-END
Area: 120.00
Perimeter: 44.00
North: 7000.0000m     East: 650000.0000m

Segment #1  :  Line
Length: 11.000m
North: 7011.0000m     East: 650000.0000m

Segment #2  :  Curve
Length: 11.000m
End North: 7011.0000m     East: 650011.0000m
RP North: 7020.0000m     East: 650015.0000m

Segment #3  :  Line
Length: 11.000m
North: 7000.0000m     East: 650011.0000m

Segment #4  :  Line
Length: 11.000m
North: 7000.0000m     East: 650000.0000m
`;

/** Último segmento com rodapé Civil 3D (não confundir Error North com fim da Line). */
const LINE_WITH_ERROR_FOOTER = `Name: ERR-FOOT
Area: 100.00
Perimeter: 40.00
North: 1000.0000m     East: 500000.0000m

Segment #1  :  Line
Length: 10.000m
North: 1010.0000m     East: 500000.0000m

Segment #2  :  Line
Length: 10.000m
North: 1010.0000m     East: 500010.0000m

Segment #3  :  Line
Length: 10.000m
North: 1000.0000m     East: 500010.0000m

Segment #4  :  Line
Length: 10.000m
North: 1000.0000m     East: 500000.0000m
Perimeter: 40.000m     Area: 100.00sq.m
Error Closure: 0.0001     Course: 090°
Error North: -0.00049m     East: 0.00038m
`;

const HEADER_END_NORTH_EAST = `Name: HDR-END-NE
Area: 100.00
Perimeter: 40.00
End North: 9316103.4553m     East: 624008.2611m

Segment #1  :  Line
Length: 10.000m
North: 9316113.4553m     East: 624008.2611m

Segment #2  :  Line
Length: 10.000m
North: 9316113.4553m     East: 624018.2611m

Segment #3  :  Line
Length: 10.000m
North: 9316103.4553m     East: 624018.2611m

Segment #4  :  Line
Length: 10.000m
North: 9316103.4553m     East: 624008.2611m
`;

function buildQuadra20Lots(): string {
  const chunks: string[] = [];
  for (let i = 1; i <= 22; i++) {
    const baseN = 8000 + i * 50;
    const baseE = 660000 + i * 30;
    chunks.push(`Name: Q20-${i}
Area: 100.00
Perimeter: 40.00
North: ${baseN}.0000m     East: ${baseE}.0000m

Segment #1  :  Line
Length: 10.000m
North: ${baseN + 10}.0000m     East: ${baseE}.0000m

Segment #2  :  Line
Length: 10.000m
North: ${baseN + 10}.0000m     East: ${baseE + 10}.0000m

Segment #3  :  Line
Length: 10.000m
North: ${baseN}.0000m     East: ${baseE + 10}.0000m

Segment #4  :  Line
Length: 10.000m
North: ${baseN}.0000m     East: ${baseE}.0000m
`);
  }
  return chunks.join("\n");
}

function runTests() {
  // 1. Retangular 4 linhas
  {
    const { closure, payload, official, legacySuspect } = evaluateLot(
      RECT_4_LINES,
      "RET-4L",
    );
    assert(
      1,
      "Lote retangular simples (4 linhas)",
      payload.geometrySaved &&
        closure <= 0.1 &&
        official.length === 4 &&
        !legacySuspect,
      `geom=${payload.geometrySaved} closure=${closure.toFixed(4)}m segs=${official.length}`,
    );
  }

  // 2. Esquina com chanfre (5 lados, fechamento)
  {
    const { closure, payload, official } = evaluateLot(
      CORNER_CHAMFRE,
      "ESQ-CHAN",
    );
    assert(
      2,
      "Lote de esquina com chanfre",
      payload.geometrySaved &&
        closure <= 0.1 &&
        official.length === 5,
      `geom=${payload.geometrySaved} closure=${closure.toFixed(4)}m segs=${official.length}`,
    );
  }

  // 3. Uma curva
  {
    const { closure, payload, lot } = evaluateLot(ONE_CURVE, "CURVE-1");
    const hasCurve = lot.segments.some((s) => s.type === "CURVE");
    assert(
      3,
      "Lote com 1 curva",
      payload.geometrySaved &&
        closure <= 0.1 &&
        hasCurve &&
        lot.segments.filter((s) => s.type === "CURVE").length === 1,
      `geom=${payload.geometrySaved} curve=${hasCurve} closure=${closure.toFixed(4)}m`,
    );
  }

  // 4. Curva como Segment #1
  {
    const { closure, payload, lot } = evaluateLot(CURVE_SEG1, "CURVE-S1");
    const seg1 = lot.segments.find((s) => s.segmentNumber === 1);
    assert(
      4,
      "Lote com curva como Segment #1",
      payload.geometrySaved &&
        closure <= 0.1 &&
        seg1?.type === "CURVE" &&
        lot.segments[0].north > 3999,
      `geom=${payload.geometrySaved} seg1=${seg1?.type} startN=${lot.segments[0].north}`,
    );
  }

  // 5. Duas curvas
  {
    const { closure, payload, lot } = evaluateLot(TWO_CURVES, "CURVE-2X");
    const curves = lot.segments.filter((s) => s.type === "CURVE");
    assert(
      5,
      "Lote com 2 curvas",
      payload.geometrySaved &&
        closure <= 0.1 &&
        curves.length === 2,
      `geom=${payload.geometrySaved} curves=${curves.length} closure=${closure.toFixed(4)}m`,
    );
  }

  // 6. North/East mesma linha (cabeçalho)
  {
    const { closure, payload, lot } = evaluateLot(INLINE_NE_HEADER, "INLINE-NE");
    const startOk =
      Math.abs(lot.segments[0].north - 6000) < 0.01 &&
      Math.abs(lot.segments[0].east - 640000) < 0.01;
    assert(
      6,
      "Lote onde North/East estão na mesma linha",
      payload.geometrySaved && closure <= 0.1 && startOk,
      `geom=${payload.geometrySaved} start=(${lot.segments[0].north},${lot.segments[0].east})`,
    );
  }

  // 7. End North + East na mesma linha (formato Civil 3D Q04, sem End East)
  {
    const pair = readCoordPairFromLine(
      "End North: 9316103.4553m     East: 624008.2611m",
      "End North",
    );
    const { closure, payload, lot } = evaluateLot(
      INLINE_END_NORTH_EAST,
      "INLINE-END",
    );
    const curve = lot.segments.find((s) => s.type === "CURVE");
    const endOk =
      curve?.endNorth != null &&
      curve?.endEast != null &&
      Math.abs(curve.endNorth - 7011) < 0.01 &&
      Math.abs(curve.endEast - 650011) < 0.01;
    assert(
      7,
      "End North + East na mesma linha (Curve, sem End East)",
      pair != null &&
        Math.abs(pair.north - 9316103.4553) < 0.01 &&
        Math.abs(pair.east - 624008.2611) < 0.01 &&
        payload.geometrySaved &&
        closure <= 0.1 &&
        endOk,
      `geom=${payload.geometrySaved} curveEnd=(${curve?.endNorth},${curve?.endEast})`,
    );
  }

  // 7b. Cabeçalho End North + East (lote 30)
  {
    const { closure, payload, lot } = evaluateLot(
      HEADER_END_NORTH_EAST,
      "HDR-END-NE",
    );
    const startOk =
      Math.abs(lot.segments[0].north - 9316103.4553) < 0.01 &&
      Math.abs(lot.segments[0].east - 624008.2611) < 0.01;
    assert(
      7.1,
      "Cabeçalho End North + East (início do lote)",
      payload.geometrySaved && closure <= 0.1 && startOk,
      `geom=${payload.geometrySaved} start=(${lot.segments[0].north},${lot.segments[0].east})`,
    );
  }

  // 7c. Rodapé Error North/East não é vértice do último segmento
  {
    const { closure, payload, lot } = evaluateLot(
      LINE_WITH_ERROR_FOOTER,
      "ERR-FOOT",
    );
    const last = lot.segments[lot.segments.length - 1];
    const endOk =
      Math.abs(last.endNorth! - 1000) < 0.01 &&
      Math.abs(last.endEast! - 500000) < 0.01;
    assert(
      7.2,
      "Ignorar Error North/East no rodapé do bloco",
      payload.geometrySaved && closure <= 0.1 && endOk,
      `geom=${payload.geometrySaved} lastEnd=(${last.endNorth},${last.endEast})`,
    );
  }

  // 8. Quadra 22 lotes
  {
    const txt = buildQuadra20Lots();
    const lots = parseCivil3dTxtLots(txt);
    let saved = 0;
    let failed = 0;
    for (const lot of lots) {
      const p = civil3dLotToImportPayload(lot, PROJ4, null);
      if (p.geometrySaved) saved++;
      else failed++;
    }
    const centroid = computeQuadraUtmCentroidFromParsedLots(lots);
    assert(
      8,
      "Quadra inteira com 20+ lotes",
      lots.length >= 20 && saved >= 20 && failed === 0 && centroid != null,
      `lotes=${lots.length} saved=${saved} failed=${failed}`,
    );
  }

  // 9. Reimportação (parse idêntico 2x, sem degeneração legado)
  {
    const txt = buildQuadra20Lots();
    const run1 = parseCivil3dTxtLots(txt);
    const run2 = parseCivil3dTxtLots(txt);
    let identical = run1.length === run2.length;
    if (identical) {
      for (let i = 0; i < run1.length; i++) {
        const a = run1[i];
        const b = run2[i];
        if (
          a.segments.length !== b.segments.length ||
          a.segments.some(
            (s, j) =>
              s.type !== b.segments[j].type ||
              Math.abs(s.north - b.segments[j].north) > 0.001,
          )
        ) {
          identical = false;
          break;
        }
      }
    }
    const payloads1 = run1.map((l) => civil3dLotToImportPayload(l, PROJ4, null));
    const payloads2 = run2.map((l) => civil3dLotToImportPayload(l, PROJ4, null));
    const geomStable =
      payloads1.every((p, i) => p.geometrySaved === payloads2[i].geometrySaved);
    const projectUtm = computeQuadraUtmCentroidFromParsedLots(run1);
    const reimportBlocks = payloads1.map((p) => ({
      coords: p.coords,
      geometrySaved: p.geometrySaved,
    }));
    const quadraCheck = validateQuadraImportAgainstProject(
      reimportBlocks,
      null,
      "Q20",
      run1,
      PROJ4,
      projectUtm,
    );
    assert(
      9,
      "Reimportação de uma quadra já existente",
      identical && geomStable && quadraCheck.ok,
      `identical=${identical} geomStable=${geomStable} quadraOk=${quadraCheck.ok}`,
    );
  }

  // 10. Área TXT vs anel UTM (retângulo 50x100 = 5000)
  {
    const { lot, payload } = evaluateLot(RECT_4_LINES, "RET-4L");
    const segs = civil3dParsedToOfficialSegments(lot.segments, lot.name);
    const ring = buildUtmRingFromOfficialSegments(segs, lot.name);
    const computed = ringAreaM2(ring);
    const txtArea = lot.area;
    const diffPct =
      txtArea > 0 ? (Math.abs(computed - txtArea) / txtArea) * 100 : 100;
    assert(
      10,
      "Conferência da área final comparada ao Civil 3D",
      payload.geometrySaved && diffPct <= 2,
      `txtArea=${txtArea} ringArea=${computed.toFixed(2)} diff=${diffPct.toFixed(2)}%`,
    );
  }
}

runTests();

console.log("\n========================================");
console.log("RELATÓRIO — TESTES OBRIGATÓRIOS TXT CIVIL 3D");
console.log("========================================\n");

let passed = 0;
let failed = 0;
for (const r of results.sort((a, b) => a.id - b.id)) {
  const status = r.pass ? "PASSOU" : "FALHOU";
  if (r.pass) passed++;
  else failed++;
  console.log(`${r.id}. ${r.name}`);
  console.log(`   ${status} — ${r.detail}\n`);
}

console.log("----------------------------------------");
console.log(`Total: ${passed} PASSOU / ${failed} FALHOU de ${results.length}`);
console.log("----------------------------------------\n");

process.exit(failed > 0 ? 1 : 0);
