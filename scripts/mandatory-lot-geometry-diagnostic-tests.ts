/**
 * Testes do módulo de diagnóstico de geometria (somente leitura).
 * Executar: npx tsx scripts/mandatory-lot-geometry-diagnostic-tests.ts
 */

import {
  analyzeLotGeometryBlock,
  buildLotGeometryDiagnosticSummary,
  gisMapRingFromBlock,
} from '../lib/lotGeometryDiagnostic';

const LAT0 = -23.5;
const LNG0 = -46.6;

function blockWithGeoJsonPolygon(): Record<string, unknown> {
  const ring = [
    [LNG0, LAT0],
    [LNG0 + 0.0001, LAT0],
    [LNG0 + 0.0001, LAT0 + 0.0002],
    [LNG0, LAT0 + 0.0002],
    [LNG0, LAT0],
  ];
  return {
    id: 'd1',
    number: '1',
    source_import: 'TXT_CIVIL3D',
    geometry: { type: 'Polygon', coordinates: [ring] },
    segments_json: [{ north: 1, east: 2, distance: 10 }],
  };
}

let pass = 0;
let total = 0;

total++;
{
  const b = blockWithGeoJsonPolygon();
  const gis = gisMapRingFromBlock(b);
  const ok = gis.ok && gis.ring.length >= 3;
  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — GIS detecta Polygon lat/lng`);
  if (ok) pass++;
}

total++;
{
  const summary = buildLotGeometryDiagnosticSummary([
    blockWithGeoJsonPolygon(),
    { id: 'd2', number: '2', geometry: null, segments_json: null },
  ]);
  const ok =
    summary.total === 2 &&
    summary.gisMapRingOk >= 1 &&
    summary.geometryEmpty >= 1;
  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — resumo conta OK/vazio`);
  if (ok) pass++;
}

total++;
{
  const b = blockWithGeoJsonPolygon();
  b.segments_json = JSON.stringify([
    { north: LAT0, east: LNG0, distance: 10 },
    { north: LAT0, east: LNG0 + 0.0001, distance: 10 },
  ]);
  const a = analyzeLotGeometryBlock(b);
  const ok = a.segs.ok && a.perimeter.field === 'geometry';
  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — segments_json string + perímetro geometry`);
  if (ok) pass++;
}

console.log(`\nTotal: ${pass} PASSOU / ${total - pass} FALHOU de ${total}`);
process.exit(pass === total ? 0 : 1);
