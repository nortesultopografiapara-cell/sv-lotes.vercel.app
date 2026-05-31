import fs from "fs";
import {
  parseCivil3dTxtLots,
  civil3dLotToImportPayload,
  computeOfficialChainClosureErrorM,
  civil3dParsedToOfficialSegments,
  buildUtmRingFromOfficialSegments,
  logLotDebugChain30_31,
  parseLotHeaderStart,
} from "../lib/civil3dTxtParser";

const PROJ =
  "+proj=utm +zone=22 +south +datum=WGS84 +units=m +no_defs";

const path = process.argv[2] ?? "scripts/fixtures/Q04-lote31-real.txt";
const text = fs.readFileSync(path, "utf8");
const lots = parseCivil3dTxtLots(text);

for (const name of ["30", "31", "32"]) {
  const lot = lots.find((l) => String(l.name).trim() === name);
  if (!lot) {
    console.log(`missing lot ${name}`);
    continue;
  }
  const official = civil3dParsedToOfficialSegments(lot.segments, lot.name);
  const payload = civil3dLotToImportPayload(lot, PROJ, null);
  const ring = buildUtmRingFromOfficialSegments(official, lot.name);
  const chunkMarker = `Name: ${lot.name}`;
  const chunkIdx = text.indexOf(chunkMarker);
  const nextName = text.indexOf("\nName:", chunkIdx + 1);
  const chunk =
    chunkIdx >= 0
      ? text.slice(chunkIdx, nextName > chunkIdx ? nextName : undefined)
      : "";
  const lotStart = chunk ? parseLotHeaderStart(chunk, lot.name) : null;
  if (name === "30" || name === "31") {
    logLotDebugChain30_31(lot.name, lot.segments, lotStart, {
      geometrySaved: payload.geometrySaved,
    });
  }
  console.log(`\n=== Lote ${name} ===`);
  console.log({
    closureErrorM: computeOfficialChainClosureErrorM(official),
    geometrySaved: payload.geometrySaved,
    ringVertices: ring.length,
    segments: lot.segments.map((s) => ({
      n: s.segmentNumber,
      type: s.type,
      start: { n: s.north, e: s.east },
      end: { n: s.endNorth, e: s.endEast },
      length: s.length,
    })),
  });
}
