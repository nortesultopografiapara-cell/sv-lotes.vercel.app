/**
 * Testes — painel visual do popup de lote no GIS (somente apresentação).
 * npx tsx scripts/mandatory-gis-lot-popup-visual-panel-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  GIS_LOT_LEAFLET_POPUP_CLASS,
  GIS_LOT_POPUP_CONTAINER_CLASS,
  GIS_LOT_POPUP_MAX_WIDTH_PX,
  GIS_LOT_POPUP_MIN_WIDTH_PX,
  gisPopupContractLabel,
  gisPopupDisplayOrDash,
  gisPopupDisplayText,
} from '../lib/gisLotPopupLayout';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function testDisplayHelpers() {
  assert(gisPopupDisplayText(null) === '', 'null vazio');
  assert(gisPopupDisplayText(undefined) === '', 'undefined vazio');
  assert(gisPopupDisplayText('?') === '', '? vazio');
  assert(gisPopupDisplayText('undefined') === '', 'string undefined vazia');
  assert(gisPopupDisplayText('NaN') === '', 'NaN vazio');
  assert(gisPopupDisplayText(Number.NaN) === '', 'number NaN vazio');
  assert(gisPopupDisplayText('—') === '', 'em-dash placeholder vazio');
  assert(gisPopupDisplayOrDash(null) === '—', 'dash para vazio');
  assert(gisPopupDisplayText('SEVERINO JOSE DE FRANCA') === 'SEVERINO JOSE DE FRANCA', 'nome real');
  assert(gisPopupContractLabel(null) === '', 'contrato nulo omitido');
  assert(gisPopupContractLabel('?') === '', 'contrato ? omitido');
  assert(
    gisPopupContractLabel('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee') === '',
    'UUID de contrato omitido',
  );
  assert(
    gisPopupContractLabel('000000007/2026') === '000000007/2026',
    'número de contrato real',
  );
}

function testPanelChrome() {
  assert(GIS_LOT_POPUP_MAX_WIDTH_PX === 1000, 'maxWidth Leaflet 1000');
  assert(GIS_LOT_POPUP_MIN_WIDTH_PX === 280, 'minWidth 280');
  assert(GIS_LOT_LEAFLET_POPUP_CLASS === 'gis-lot-leaflet-popup', 'classe Leaflet isolada');
  assert(
    GIS_LOT_POPUP_CONTAINER_CLASS.includes('w-[min(calc(100vw-24px),960px)]'),
    'largura 960px limitada ao viewport',
  );
  assert(GIS_LOT_POPUP_CONTAINER_CLASS.includes('flex flex-col'), 'header/tabs fixos + corpo rolável');
  assert(
    GIS_LOT_POPUP_CONTAINER_CLASS.includes('max-h-[min(82vh,720px)]'),
    'altura dinâmica limitada',
  );

  const css = read('app/globals.css');
  assert(css.includes('.gis-lot-leaflet-popup'), 'globals estiliza popup de lote');
  assert(!css.includes('position: fixed'), 'não transforma popup em fullscreen');
}

function testGisMapVisualStructure() {
  const source = read('components/map/GISMap.tsx');

  assert(source.includes('label: "Resumo"'), 'aba Resumo');
  assert(source.includes('label: "Confrontações"'), 'aba Confrontações');
  assert(source.includes('label: "Comercial"'), 'aba Comercial');
  assert(source.includes('label: "Histórico"'), 'aba Histórico');
  assert(source.includes('grid-cols-4'), 'abas ocupam a largura por igual');

  assert(source.includes('Imóvel'), 'card Imóvel');
  assert(source.includes('Dimensões'), 'card Dimensões');
  assert(source.includes('Situação comercial'), 'card Situação comercial');
  assert(source.includes('lg:grid-cols-3'), '3 colunas no desktop');
  assert(source.includes('Frente para'), 'destaque da frente');

  assert(source.includes('Ações do lote'), 'seção Ações do lote');
  assert(source.includes('Cadastro e geometria'), 'grupo cadastro');
  assert(source.includes('Documentos'), 'grupo documentos');
  assert(source.includes('Corrigir frente'), 'label visual Corrigir frente');
  assert(!source.includes('Editar confrontações'), 'Resumo sem botão Editar confrontações');
  assert(source.includes('Gerar memorial'), 'label visual Gerar memorial');
  assert(source.includes('Gerar prancha'), 'label visual Gerar prancha');

  assert(source.includes('onStartCorrectFront(lot)'), 'callback corrigir frente');
  assert(source.includes('onEditOfficialSides'), 'callback editar lados permanece na aba Confrontações');
  assert(source.includes('onGenerateMemorial(lot)'), 'callback memorial');
  assert(source.includes('onGenerateLotSheet(lot)'), 'callback prancha');

  assert(source.includes('maxWidth={GIS_LOT_POPUP_MAX_WIDTH_PX}'), 'Leaflet maxWidth no lote');
  assert(source.includes('className={GIS_LOT_LEAFLET_POPUP_CLASS}'), 'classe só no popup de lote');
  assert(source.includes('LotConfrontationsPanel'), 'aba Confrontações preservada');
  assert(source.includes('popupTab === "comercial"'), 'aba Comercial preservada');
  assert(source.includes('popupTab === "historico"'), 'aba Histórico preservada');

  assert(
    !source.includes('sale_release_settlements'),
    'popup não toca settlements',
  );
}

function testOfficialSidesEditorTitleUnchanged() {
  const source = read('components/map/LotOfficialSidesEditor.tsx');
  assert(source.includes('Editar lados do lote'), 'título interno do editor preservado');
}

function testStreetPopupUntouched() {
  const source = read('components/map/GISMap.tsx');
  const streetIdx = source.indexOf('Logradouro');
  assert(streetIdx > 0, 'popup de logradouro existe');
  const window = source.slice(streetIdx - 400, streetIdx + 200);
  assert(
    !window.includes('GIS_LOT_LEAFLET_POPUP_CLASS'),
    'popup de rua não usa chrome do lote',
  );
}

function main() {
  testDisplayHelpers();
  testPanelChrome();
  testGisMapVisualStructure();
  testOfficialSidesEditorTitleUnchanged();
  testStreetPopupUntouched();
  console.log('OK — mandatory-gis-lot-popup-visual-panel-tests passed');
}

main();
