/**
 * Camadas Google/Esri/OSM do mapa GIS.
 * npx tsx scripts/mandatory-gis-google-base-layer-tests.ts
 */

import {
  DEFAULT_GIS_BASE_LAYER,
  GIS_BASE_LAYER_LABELS,
  GIS_BASE_LAYER_ORDER,
  GIS_ESRI_MAX_NATIVE_ZOOM,
  GIS_GOOGLE_MAX_NATIVE_ZOOM,
  GIS_MAP_MAX_ZOOM,
  GIS_OSM_MAX_NATIVE_ZOOM,
  getGisBaseLayerRuntimeState,
  isGoogleBaseLayer,
  logGisBaseLayerDiagnostics,
  normalizeGisBaseLayer,
  resetGisBaseLayerRuntimeState,
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

function testMapMaxZoom() {
  assert(GIS_MAP_MAX_ZOOM === 22, 'maxZoom 22');
  assert(GIS_GOOGLE_MAX_NATIVE_ZOOM === 20, 'Google maxNativeZoom 20');
  assert(GIS_ESRI_MAX_NATIVE_ZOOM === 17, 'Esri maxNativeZoom 17');
  assert(GIS_OSM_MAX_NATIVE_ZOOM === 19, 'OSM maxNativeZoom 19');
  assert(isGoogleBaseLayer('google_satellite'), 'google_satellite é google');
  assert(isGoogleBaseLayer('google_hybrid'), 'google_hybrid é google');
  assert(!isGoogleBaseLayer('esri_satellite'), 'esri não é google');
  console.log('OK testMapMaxZoom');
}

function testBaseLayerNativeZoomWiring() {
  const fs = require('node:fs');
  const path = require('node:path');
  const base = fs.readFileSync(
    path.join(__dirname, '../components/map/GisBaseLayer.tsx'),
    'utf8',
  );
  assert(base.includes('GIS_GOOGLE_MAX_NATIVE_ZOOM'), 'Google usa constante');
  assert(base.includes('GIS_ESRI_MAX_NATIVE_ZOOM'), 'Esri usa constante');
  assert(base.includes('GIS_OSM_MAX_NATIVE_ZOOM'), 'OSM usa constante');
  assert(!base.includes('maxNativeZoom: 21'), 'Google não usa 21');
  assert(!/maxNativeZoom:\s*19/.test(base), 'Esri/OSM não hardcodam 19');
  console.log('OK testBaseLayerNativeZoomWiring');
}

function testGoogleMapsLoaderModuleExists() {
  const fs = require('node:fs');
  const path = require('node:path');
  const loaderPath = path.join(__dirname, '../lib/gisGoogleMapsLoader.ts');
  const mutantPath = path.join(__dirname, '../lib/gisGoogleMutant.ts');
  assert(fs.existsSync(loaderPath), 'gisGoogleMapsLoader.ts');
  assert(fs.existsSync(mutantPath), 'gisGoogleMutant.ts');
  console.log('OK testGoogleMapsLoaderModuleExists');
}

function testRuntimeDiagnosticsShape() {
  resetGisBaseLayerRuntimeState();
  logGisBaseLayerDiagnostics({
    activeBaseLayer: 'google_satellite',
    currentZoom: 19,
    googleLayerMounted: true,
    esriFallbackActive: false,
    googleMutantError: null,
    effectiveBaseLayer: 'google_satellite',
  });
  const state = getGisBaseLayerRuntimeState();
  assert(state.activeBaseLayer === 'google_satellite', 'activeBaseLayer');
  assert(state.currentZoom === 19, 'currentZoom');
  assert(state.googleLayerMounted === true, 'googleLayerMounted');
  assert(state.esriFallbackActive === false, 'esriFallbackActive');
  assert(state.googleMutantError === null, 'googleMutantError');
  console.log('OK testRuntimeDiagnosticsShape');
}

function testGoogleFallbackWiring() {
  const fs = require('node:fs');
  const path = require('node:path');
  const base = fs.readFileSync(
    path.join(__dirname, '../components/map/GisBaseLayer.tsx'),
    'utf8',
  );
  assert(base.includes('fallBackToEsri'), 'fallback Esri');
  assert(base.includes('subscribeGoogleMapsAuthFailure'), 'auth failure hook');
  assert(base.includes('google_tiles_missing'), 'tiles missing → fallback');
  assert(base.includes("pane: 'tilePane'"), 'tilePane explícito');
  const loader = fs.readFileSync(
    path.join(__dirname, '../lib/gisGoogleMapsLoader.ts'),
    'utf8',
  );
  assert(
    loader.includes('subscribeGoogleMapsAuthFailure'),
    'loader exporta subscribe',
  );
  const page = fs.readFileSync(
    path.join(__dirname, '../app/map/page.tsx'),
    'utf8',
  );
  assert(page.includes('vercel.app'), 'Preview usa Esri no 1º paint');
  console.log('OK testGoogleFallbackWiring');
}

function main() {
  testDefaultLayerIsGoogleSatellite();
  testLayerSelectorOptions();
  testLegacyLayerNormalization();
  testMapMaxZoom();
  testBaseLayerNativeZoomWiring();
  testGoogleMapsLoaderModuleExists();
  testRuntimeDiagnosticsShape();
  testGoogleFallbackWiring();
  console.log('mandatory-gis-google-base-layer-tests: all passed');
}

main();
