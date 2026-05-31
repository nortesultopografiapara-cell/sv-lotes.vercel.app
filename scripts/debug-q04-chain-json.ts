/**
 * Debug Q04 real — imprime LOT_DEBUG_CHAIN_30/31 em JSON legível.
 * Uso: npx tsx scripts/debug-q04-chain-json.ts "d:\...\Q04.txt"
 */
import fs from "fs";
import {
  parseLotChunk,
  civil3dLotToImportPayload,
  computeOfficialChainClosureErrorM,
  civil3dParsedToOfficialSegments,
  parseLotHeaderStart,
} from "../lib/civil3dTxtParser";

const PROJ =
  "+proj=utm +zone=22 +south +datum=WGS84 +units=m +no_defs";

const txtPath = process.argv[2];
if (!txtPath || !fs.existsSync(txtPath)) {
  console.error("Informe o caminho do Q04.txt real.");
  process.exit(1);
}

const text = fs.readFileSync(txtPath, "utf8");

function chunkForLot(name: string): string {
  const re = new RegExp(`Name:\\s*${name}\\b`, "i");
  const m = text.match(re);
  if (!m || m.index == null) return "";
  const bodyStart = m.index + m[0].length;
  const next = text.slice(bodyStart).search(/\nName:\s*\d+/i);
  const body =
    next >= 0 ? text.slice(bodyStart, bodyStart + next) : text.slice(bodyStart);
  return `${name}${body}`;
}

for (const lotName of ["30", "31"]) {
  const chunk = chunkForLot(lotName);
  const lot = chunk ? parseLotChunk(chunk) : null;
  if (!lot) {
    console.log(JSON.stringify({ error: `lote ${lotName} não encontrado` }, null, 2));
    continue;
  }
  const lotStart = parseLotHeaderStart(chunk, lotName);
  const payload = civil3dLotToImportPayload(lot, PROJ, null);
  const official = civil3dParsedToOfficialSegments(lot.segments, lot.name);
  const closureErr = computeOfficialChainClosureErrorM(official);

  const logKey =
    lotName === "30" ? "LOT_DEBUG_CHAIN_30" : "LOT_DEBUG_CHAIN_31";

  const out = {
    [logKey]: {
      closureErrorM: Math.round(closureErr * 10000) / 10000,
      geometrySaved: payload.geometrySaved,
      start: lotStart
        ? {
            north: lotStart.north,
            east: lotStart.east,
            source: lotStart.source,
          }
        : null,
      segments: lot.segments.map((s) => ({
        segmento: s.segmentNumber,
        type: s.type,
        start: { north: s.north, east: s.east },
        end:
          s.endNorth != null
            ? { north: s.endNorth, east: s.endEast }
            : null,
        length: s.length,
      })),
    },
  };
  console.log(JSON.stringify(out, null, 2));
}
