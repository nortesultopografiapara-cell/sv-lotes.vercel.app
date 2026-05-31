/**
 * Diagnóstico local do parser Civil 3D — uso:
 *   npx tsx scripts/diagnose-civil3d-import.ts [caminho/Q04.txt]
 */
import fs from "fs";
import path from "path";
import {
  parseCivil3dTxtLots,
  civil3dLotToImportPayload,
  computeOfficialChainClosureErrorM,
  buildValidatedLotRing,
  computeLngLatCentroidFromRings,
  civil3dParsedToOfficialSegments,
} from "../lib/civil3dTxtParser";

const PROJ4 =
  "+proj=utm +zone=22 +south +datum=WGS84 +units=m +no_defs";

const DEFAULT_PATHS = [
  path.join(process.cwd(), "scripts", "Q04.txt"),
  path.join(process.cwd(), "Q04.txt"),
  path.join(process.cwd(), "..", "Q04.txt"),
  "d:\\SV LOTE SISTEMA\\Q04.txt",
];

function resolveTxtPath(): string {
  const arg = process.argv[2];
  if (arg && fs.existsSync(arg)) return path.resolve(arg);
  for (const p of DEFAULT_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `Q04.txt não encontrado. Passe o caminho: npx tsx scripts/diagnose-civil3d-import.ts "C:\\caminho\\Q04.txt"`,
  );
}

function failureReason(
  lotName: string,
  officialSegs: ReturnType<typeof civil3dParsedToOfficialSegments>,
  built: ReturnType<typeof buildValidatedLotRing>,
  geometrySaved: boolean,
): string {
  if (officialSegs.length < 2) return "few_official_segments";
  const closure = computeOfficialChainClosureErrorM(officialSegs);
  if (closure > 0.1) return `closure_${closure.toFixed(4)}m`;
  if (!built) return "ring_build_null";
  if (!built.locationOk) return "location_rejected";
  if (!geometrySaved) return "ring_too_few_vertices";
  return "ok";
}

async function main() {
  const txtPath = resolveTxtPath();
  console.log("=== DIAGNÓSTICO CIVIL3D TXT ===");
  console.log("Arquivo:", txtPath);
  const text = fs.readFileSync(txtPath, "utf8");
  const lots = parseCivil3dTxtLots(text);
  console.log("Lotes parseados:", lots.length);

  const projectCenter = null;

  const focus = new Set(["30", "31"]);
  for (const lot of lots) {
    const showDetail = focus.has(String(lot.name).trim());
    const officialSegs = civil3dParsedToOfficialSegments(
      lot.segments,
      lot.name,
    );
    const closureErrorM = computeOfficialChainClosureErrorM(officialSegs);
    const built = buildValidatedLotRing(
      officialSegs,
      PROJ4,
      lot.name,
      projectCenter,
    );
    const payload = civil3dLotToImportPayload(lot, PROJ4, projectCenter);
    const reason = failureReason(
      lot.name,
      officialSegs,
      built,
      payload.geometrySaved,
    );
    const centroid = payload.coords.length
      ? computeLngLatCentroidFromRings([payload.coords])
      : built?.lngLat?.length
        ? computeLngLatCentroidFromRings([built.lngLat])
        : null;

    if (!showDetail && reason === "ok") continue;

    console.log("\n--- Lote", lot.name, "---");
    console.log({
      geometrySaved: payload.geometrySaved,
      closureErrorM: Number(closureErrorM.toFixed(4)),
      failureReason: reason,
      ringVertices: payload.coords.length,
      officialSegmentCount: officialSegs.length,
      parsedSegmentCount: lot.segments.length,
      centroid,
    });

    if (showDetail || reason !== "ok") {
      console.log("Segmentos (parsed):");
      for (const s of lot.segments) {
        console.log({
          seg: s.segmentNumber,
          type: s.type,
          start: { n: s.north, e: s.east },
          end: { n: s.endNorth, e: s.endEast },
          length: s.length,
        });
      }
      if (built?.utmRing) {
        console.log(
          "Ring UTM pontos:",
          built.utmRing.map(([e, n]) => ({ east: e, north: n })),
        );
      }
    }
  }

  const ok = lots.filter((l) => {
    const p = civil3dLotToImportPayload(l, PROJ4, projectCenter);
    return p.geometrySaved;
  }).length;
  console.log("\n=== RESUMO ===");
  console.log({
    total: lots.length,
    geometrySavedTrue: ok,
    geometrySavedFalse: lots.length - ok,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
