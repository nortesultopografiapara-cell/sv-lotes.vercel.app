/**
 * Camadas Google/Esri/OSM do mapa GIS.
 * npx tsx scripts/mandatory-gis-google-base-layer-tests.ts
 */

import {
  DEFAULT_GIS_BASE_LAYER,
  GIS_BASE_LAYER_LABELS,
  GIS_BASE_LAYER_ORDER,
  normalizeGisBaseLayer,
} from '../lib/gisBaseLayers';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testDefaultLayerIsGoogleSatellite() {
  assert(
    DEFAULT_GIS_BASE_LAYER === 'google_satellite',
    `padrão: ${DEFAULT_GIS_BASE_LAYER}`,
  );
  console.log('OK testDefaultLayerIsGoogleSatellite');
}

function testLayerSelectorOptions() {
  assert(GIS_BASE_LAYER_ORDER.length === 4, '4 camadas');
  assert(
    GIS_BASE_LAYER_ORDER.includes('google_satellite'),
    'google_satellite',
  );
  assert(GIS_BASE_LAYER_ORDER.includes('google_hybrid'), 'google_hybrid');
  assert(GIS_BASE_LAYER_ORDER.includes('esri_satellite'), 'esri_satellite');
  assert(GIS_BASE_LAYER_ORDER.includes('osm'), 'osm');
  assert(
    GIS_BASE_LAYER_LABELS.google_satellite === 'Google Satélite',
    'rótulo google',
  );
  console.log('OK testLayerSelectorOptions');
}

function testLegacyLayerNormalization() {
  assert(
    normalizeGisBaseLayer('satellite') === 'google_satellite',
    'satellite legado',
  );
  assert(normalizeGisBaseLayer('streets') === 'osm', 'streets legado');
  assert(normalizeGisBaseLayer('google_hybrid') === 'google_hybrid', 'híbrido');
  assert(
    normalizeGisBaseLayer(undefined) === 'google_satellite',
    'undefined → padrão',
  );
  console.log('OK testLegacyLayerNormalization');
}

function main() {
  testDefaultLayerIsGoogleSatellite();
  testLayerSelectorOptions();
  testLegacyLayerNormalization();
  console.log('mandatory-gis-google-base-layer-tests: all passed');
}

main();
