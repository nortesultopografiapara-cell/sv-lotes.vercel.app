/**
 * Modo exclusivo Medir distância / Medir área — lotes não capturam clique.
 * npx tsx scripts/mandatory-gis-measure-exclusive-mode-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  isGisMeasureInteractionMode,
  isLotPolygonHitTestEnabled,
  resolveGisMapInteractionMode,
  syncLeafletPathInteractive,
} from '../lib/gis/mapInteractionMode';

const ROOT = path.resolve(__dirname, '..');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function testModeResolution() {
  assert(
    resolveGisMapInteractionMode({ measureActive: true }) === 'measure-distance',
    'distância',
  );
  assert(
    resolveGisMapInteractionMode({ areaMeasureActive: true }) === 'measure-area',
    'área',
  );
  assert(
    isGisMeasureInteractionMode('measure-distance') &&
      isGisMeasureInteractionMode('measure-area'),
    'flags de medição',
  );
  assert(!isGisMeasureInteractionMode('default'), 'default não é medição');
  console.log('OK testModeResolution');
}

function testLotHitTestDisabledDuringMeasure() {
  assert(
    !isLotPolygonHitTestEnabled({ measureActive: true }),
    'distância desliga hit-test',
  );
  assert(
    !isLotPolygonHitTestEnabled({ areaMeasureActive: true }),
    'área desliga hit-test',
  );
  assert(
    !isLotPolygonHitTestEnabled({ drawStreetActive: true }),
    'desenho de rua desliga hit-test',
  );
  assert(
    isLotPolygonHitTestEnabled({ mapLotPickActive: true, measureActive: true }),
    'pick de prancha mantém hit-test',
  );
  assert(isLotPolygonHitTestEnabled({}), 'default com hit-test');
  console.log('OK testLotHitTestDisabledDuringMeasure');
}

function testSyncLeafletPathInteractive() {
  const classes = new Set<string>(['leaflet-interactive']);
  const layer = {
    options: { interactive: true },
    getElement: () =>
      ({
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c),
        },
      }) as unknown as Element,
    closePopup: () => {
      (layer as { closed?: boolean }).closed = true;
    },
  };
  syncLeafletPathInteractive(layer, false);
  assert(layer.options.interactive === false, 'options.interactive false');
  assert(!classes.has('leaflet-interactive'), 'classe removida');
  assert((layer as { closed?: boolean }).closed === true, 'fecha popup');

  syncLeafletPathInteractive(layer, true);
  assert(layer.options.interactive === true, 'options.interactive true');
  assert(classes.has('leaflet-interactive'), 'classe restaurada');
  console.log('OK testSyncLeafletPathInteractive');
}

function testGisMapWiresExclusiveMode() {
  const gis = read('components/map/GISMap.tsx');
  assert(gis.includes('GisMeasureExclusiveController'), 'controller exclusivo');
  assert(gis.includes('SyncPathHitTest'), 'sync hit-test');
  assert(gis.includes('isLotPolygonHitTestEnabled'), 'helper hit-test');
  assert(gis.includes('gisMeasureToolActiveRef'), 'ref anti-closure');
  assert(gis.includes('suspendLotHitTest'), 'arestas suspensas');
  assert(gis.includes('setCustomerForm(null)'), 'fecha modal ao medir');
  assert(gis.includes('doubleClickZoom.disable'), 'dblclick do mapa desligado');
  assert(gis.includes('lotHitTest'), 'lotHitTest no polígono');
  assert(
    gis.includes('!mapLotPickActive && lotHitTest'),
    'Popup omitido durante medição',
  );
  console.log('OK testGisMapWiresExclusiveMode');
}

function testToolbarMutualExclusion() {
  const page = read('app/map/page.tsx');
  assert(
    page.includes('setAreaMeasureActive(false)') &&
      page.includes('setMeasureActive(true)'),
    'distância desliga área e ativa medida',
  );
  assert(
    page.includes('setMeasureActive(false)') &&
      page.includes('setAreaMeasureActive(true)'),
    'área desliga distância e ativa área',
  );
  console.log('OK testToolbarMutualExclusion');
}

function testMeasureToolsClosePopupOnActivate() {
  const dist = read('components/map/DistanceMeasureTool.tsx');
  const area = read('components/map/AreaMeasureTool.tsx');
  assert(dist.includes('map.closePopup()'), 'distância fecha popup');
  assert(area.includes('map.closePopup()'), 'área fecha popup');
  assert(dist.includes("e.key === 'Escape'"), 'ESC distância');
  assert(area.includes("e.key === 'Escape'"), 'ESC área');
  console.log('OK testMeasureToolsClosePopupOnActivate');
}

function main() {
  testModeResolution();
  testLotHitTestDisabledDuringMeasure();
  testSyncLeafletPathInteractive();
  testGisMapWiresExclusiveMode();
  testToolbarMutualExclusion();
  testMeasureToolsClosePopupOnActivate();
  console.log('ALL mandatory-gis-measure-exclusive-mode-tests PASSED');
}

main();
