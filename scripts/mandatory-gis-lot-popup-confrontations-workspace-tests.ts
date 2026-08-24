/**
 * Testes — workspace visual da aba Confrontações + edição inline por segmento (somente UI).
 * npx tsx scripts/mandatory-gis-lot-popup-confrontations-workspace-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function testPopupTabsAndResumoButton() {
  const gis = read('components/map/GISMap.tsx');
  assert(gis.includes('label: "Resumo"'), 'aba Resumo');
  assert(gis.includes('label: "Confrontações"'), 'aba Confrontações');
  assert(gis.includes('label: "Comercial"'), 'aba Comercial');
  assert(gis.includes('label: "Histórico"'), 'aba Histórico');
  assert(gis.includes('setPopupTab("confrontacoes")'), 'Resumo troca para Confrontações');
  assert(!gis.includes('Editar confrontações'), 'Resumo não tem mais o botão Editar confrontações');
  assert(gis.includes('onEditOfficialSides'), 'Confrontações ainda usa o editor oficial');
  assert(gis.includes('onStartCorrectFront(lot)'), 'Corrigir frente intacto');
  assert(gis.includes('onGenerateMemorial(lot)'), 'Gerar memorial intacto');
  assert(gis.includes('onGenerateLotSheet(lot)'), 'Gerar prancha intacto');
  assert(!gis.includes('sale_release_settlements'), 'não toca settlements');
}

function testSingleEditorEngine() {
  const gis = read('components/map/GISMap.tsx');
  const editor = read('components/map/LotOfficialSidesEditor.tsx');
  const panel = read('components/map/LotConfrontationsPanel.tsx');

  assert(gis.includes('<LotOfficialSidesEditor'), 'um editor montado no GISMap');
  assert(
    (gis.match(/<LotOfficialSidesEditor/g) || []).length === 1,
    'não duplica o motor do editor',
  );
  assert(gis.includes('!isWideDesktop && ('), 'desktop nao monta overlay');
  assert(gis.includes('variant={"overlay"}'), 'mobile overlay preservado');
  assert(gis.includes('useIsWideDesktop'), 'breakpoint desktop largo');
  assert(editor.includes("variant?: 'overlay' | 'embedded'"), 'variant no editor');
  assert(editor.includes('portalTarget'), 'portalTarget no editor');
  assert(editor.includes('createPortal'), 'portal reutiliza o mesmo painel');
  assert(editor.includes('Editar lados do lote'), 'título interno preservado');
  const persist = read('lib/officialSidePersist.ts');
  assert(persist.includes("label: 'Frente'"), 'ação Frente');
  assert(persist.includes("label: 'Fundo'"), 'ação Fundo');
  assert(persist.includes("label: 'Lado direito'"), 'ação Lado direito');
  assert(persist.includes("label: 'Lado esquerdo'"), 'ação Lado esquerdo');
  assert(persist.includes("label: 'Limpar'"), 'ação Limpar');
  assert(editor.includes('Restaurar classificação automática'), 'restaurar preservado');
  assert(gis.includes('persistBlockSegmentsJson'), 'persistência original');
  assert(gis.includes('restoreAutomaticOfficialSides'), 'restore original');
  assert(gis.includes('snapshotSegmentsJson'), 'snapshot original');
  assert(panel.includes('loadLotConfrontations'), 'consulta ainda usa o serviço');
  assert(panel.includes('Tentar novamente'), 'retry de erro');
  assert(panel.includes('onStartOfficialSidesEdit'), 'mobile ainda abre o overlay');
  assert(panel.includes('onPersistOfficialSides'), 'desktop persiste por segmento');
}

function testGeometryReuse() {
  const preview = read('components/map/LotConfrontationGeometryPreview.tsx');
  const panel = read('components/map/LotConfrontationsPanel.tsx');
  assert(preview.includes('positions'), 'reusa coordinates do popup');
  assert(!preview.includes('turf'), 'sem Turf.js novo');
  assert(!preview.includes('segments_json'), 'não recalcula segments_json');
  assert(panel.includes('LotConfrontationGeometryPreview'), 'preview na aba');
  assert(panel.includes('cleanedCoords'), 'geometria já disponível no popup');
}

function testNoSchemaOrDomainLeak() {
  const files = [
    'components/map/GISMap.tsx',
    'components/map/LotOfficialSidesEditor.tsx',
    'components/map/LotConfrontationsPanel.tsx',
    'components/map/LotConfrontationGeometryPreview.tsx',
    'components/map/LotSegmentInlineEditor.tsx',
    'hooks/use-mobile.ts',
  ];
  for (const rel of files) {
    const src = read(rel);
    assert(!src.includes('sale_release_settlements'), `${rel} sem settlements`);
    assert(!src.includes('create table'), `${rel} sem SQL`);
    assert(!src.includes('from("sales")'), `${rel} sem sales`);
  }
}

function testSegmentClickKeepsPopupOpen() {
  const gis = read('components/map/GISMap.tsx');
  const panel = read('components/map/LotConfrontationsPanel.tsx');
  const editor = read('components/map/LotOfficialSidesEditor.tsx');

  assert(gis.includes('closeOnClick={false}'), 'popup do lote nao fecha no clique do mapa');
  assert(gis.includes('disableClickPropagation'), 'clique interno nao propaga ao Leaflet');
  assert(gis.includes('sameLot'), 'troca de segmento no mesmo lote nao reseta draft');
  assert(gis.includes('if (isWideDesktop)'), 'desktop nao abre overlay ao clicar');
  assert(panel.includes('stopPropagation'), 'clique do segmento nao vaza para o mapa');
  assert(panel.includes('Segmentos do lote'), 'lista de segmentos permanece visivel');
  assert(!panel.includes('data-testid="official-sides-editor-slot"'), 'sem slot de editor grande no desktop');
  assert(editor.includes('sticky bottom-0'), 'Salvar permanece visivel no overlay');
  assert(editor.includes('Salvar alterações'), 'rotulo Salvar alteracoes no overlay');
  assert(editor.includes('Cancelar alterações'), 'rotulo Cancelar alteracoes no overlay');
  assert(editor.includes('a.side != null'), 'Limpar nao aparece pre-selecionado');
  assert(editor.includes('{!embedded ? ('), 'lista interna so no overlay mobile');
  assert(gis.includes('persistBlockSegmentsJson'), 'mesmo persist existente');
  assert(editor.includes('applyOfficialEditorDraftToBlock'), 'mesmo motor de draft');
  assert(editor.includes('previewOfficialSideDraft'), 'agregacao por lado inalterada');
}

function testInlineSegmentWorkspace() {
  const panel = read('components/map/LotConfrontationsPanel.tsx');
  const editor = read('components/map/LotOfficialSidesEditor.tsx');
  const gis = read('components/map/GISMap.tsx');
  const preview = read('components/map/LotConfrontationGeometryPreview.tsx');
  const inline = read('components/map/LotSegmentInlineEditor.tsx');
  const persist = read('lib/officialSidePersist.ts');

  assert(
    panel.includes('lg:grid-cols-[minmax(0,38%)_minmax(0,62%)]'),
    'geometria esquerda e segmentos direita',
  );
  assert(
    !panel.includes('data-testid="confrontations-editor-column"'),
    'sem editor grande na coluna direita',
  );
  assert(panel.includes('LotSegmentInlineEditor'), 'edicao inline no card');
  assert(panel.includes('data-testid="segment-card"'), 'card normal persistido');
  assert(panel.includes('data-testid="segment-card-selected"'), 'card selecionado expandido');
  assert(inline.includes('data-testid="segment-inline-editor"'), 'controles inline no card');
  assert(inline.includes('data-testid="segment-side-select"'), 'seletor de classificacao');
  assert(inline.includes('data-testid="segment-confrontant-input"'), 'campo confrontante');
  assert(inline.includes('data-testid="segment-save"'), 'salvar por segmento');
  assert(inline.includes('!dirty || saving'), 'salvar desabilitado sem mudanca');
  assert(panel.includes('applySingleOfficialSegmentDraftToBlock'), 'reusa motor oficial por segmento');
  assert(
    persist.includes('export function applySingleOfficialSegmentDraftToBlock'),
    'helper no persist oficial',
  );
  assert(inline.includes('antes de'), 'guarda draft pendente');
  assert(preview.includes('onSelectIndex'), 'geometria seleciona aresta sem recalcular');
  assert(preview.includes('pad = 0.12'), 'fit-to-bounds com margem reduzida');
  assert(editor.includes('{embedded ? null : ('), 'cabecalho/X so no overlay mobile');
  assert(editor.includes('Editar lados do lote'), 'titulo overlay preservado');
  assert(editor.includes('sticky bottom-0'), 'Salvar sticky no overlay');
  assert(gis.includes('variant={"overlay"}'), 'mobile overlay preservado');
  assert(gis.includes('if (isWideDesktop)'), 'desktop nao abre overlay');
  assert(gis.includes('sameLot'), 'troca Seg.1 para Seg.2 nao fecha');
  assert(gis.includes('persistBlockSegmentsJson'), 'persistencia original');
  assert(gis.includes('persistOfficialSidesForLot'), 'salvar por segmento usa persist oficial');
  assert(editor.includes('applyOfficialEditorDraftToBlock'), 'mesmo motor');
  assert(editor.includes('previewOfficialSideDraft'), 'agregacao por lado');
  assert(panel.includes('loadLotConfrontations'), 'resumo segue o servico existente');
}


function popupMaxHeightPx(viewportHeight: number, vh = 82, cap = 720) {
  return Math.min((vh / 100) * viewportHeight, cap);
}

function testDesktopHeightAndFraming() {
  const panel = read('components/map/LotConfrontationsPanel.tsx');
  const preview = read('components/map/LotConfrontationGeometryPreview.tsx');
  const inline = read('components/map/LotSegmentInlineEditor.tsx');
  const gis = read('components/map/GISMap.tsx');
  const layout = read('lib/gisLotPopupLayout.ts');
  const mobile = read('hooks/use-mobile.ts');

  assert(preview.includes('pad = 0.12'), 'margem uniforme para o poligono caber inteiro');
  assert(preview.includes('preserveAspectRatio="xMidYMid meet"'), 'fit-to-bounds sem distorcer');
  assert(preview.includes('overflow-visible'), 'aresta selecionada nao e cortada no SVG');
  assert(preview.includes('data-testid="lot-geometry-preview"'), 'preview identificavel');
  assert(preview.includes('flex flex-col'), 'titulo + svg em coluna sem overflow');
  assert(!preview.includes('h-[calc(100%-18px)]'), 'altura do svg nao empurra o poligono para fora');
  assert(preview.includes('selectedIndexes'), 'geometria mantem selecao');
  assert(panel.includes('selectedIndexes={[...selectedSet]}'), 'preview recebe o segmento selecionado');

  assert(panel.includes('overflow-hidden lg:min-h-0'), 'workspace ocupa o resto do popup sem min-height 70vh');
  assert(!panel.includes('lg:min-h-[min(70vh,520px)]'), 'remove min-height que cortava o ultimo segmento');
  assert(panel.includes('lg:h-full lg:min-h-0 lg:flex-1'), 'altura da geometria acompanha o workspace');
  assert(panel.includes('h-[220px] min-h-[170px]'), 'altura mobile da geometria preservada');
  assert(panel.includes('overflow-y-auto'), 'lista tem scroll interno');
  assert(panel.includes('overscroll-contain'), 'scroll da lista nao empurra o mapa');
  assert(panel.includes('pb-8'), 'padding inferior para o ultimo card expandido');
  assert(panel.includes('scroll-mb-3'), 'card selecionado tem folga no fim da lista');
  assert(panel.includes('requestAnimationFrame'), 'scrollIntoView controlado apos expandir');
  assert(panel.includes('container.scrollTop'), 'rola so o container da lista');
  assert(!panel.includes('window.scrollTo'), 'nao move a pagina');
  assert(!panel.includes('scrollIntoView'), 'nao usa scrollIntoView da window/mapa');
  assert(panel.includes('stopPropagation'), 'nao fecha o popup');
  assert(panel.includes('px-2 py-1'), 'cards de resumo compactos');
  assert(panel.includes('data-testid="segment-card-selected"'), 'card selecionado expandido');
  assert(panel.includes('data-testid="confrontations-segment-list"'), 'lista identificavel');
  assert(inline.includes('data-testid="segment-side-select"'), 'seletor visivel');
  assert(inline.includes('data-testid="segment-confrontant-input"'), 'confrontante visivel');
  assert(inline.includes('data-testid="segment-save"'), 'Salvar visivel');
  assert(inline.includes('lg:sticky'), 'Salvar permanece visivel no card desktop');
  assert(inline.includes('Confrontante'), 'label do confrontante presente');
  assert(gis.includes('lg:pt-2.5'), 'cabecalho desktop compacto');
  assert(gis.includes('lg:py-1.5'), 'abas desktop compactas');
  assert(gis.includes('lg:text-base'), 'titulo compacto no desktop');
  assert(gis.includes('setPopupTab("confrontacoes")'), 'aba Confrontacoes preservada');
  assert(gis.includes('overflow-hidden flex flex-col'), 'corpo da aba nao estoura a viewport');
  assert(layout.includes('max-h-[min(82vh,720px)]'), 'popup 82vh / 720px');
  assert(layout.includes('overflow-hidden'), 'popup nao estoura a viewport');
  assert(!layout.includes('fixed'), 'popup nao vira fullscreen');
  assert(gis.includes('!isWideDesktop && ('), 'mobile overlay preservado');
  assert(gis.includes('variant={"overlay"}'), 'mobile overlay preservado');
  assert(mobile.includes('WIDE_DESKTOP_BREAKPOINT = 1024'), 'desktop >=1024');

  assert(popupMaxHeightPx(1080) === 720, '1920x1080: cap 720px, mapa visivel ao redor');
  assert(Math.round(popupMaxHeightPx(768)) === 630, '1366x768: 82vh cabe no viewport');
  assert(Math.round(popupMaxHeightPx(700)) === 574, 'desktop menor: 82vh sem fullscreen');
  assert(popupMaxHeightPx(1080) < 1080, 'nao ocupa 100% da altura em 1080p');
  assert(popupMaxHeightPx(768) < 768, 'nao ocupa 100% da altura em 768p');
}

function main() {
  testPopupTabsAndResumoButton();
  testSingleEditorEngine();
  testGeometryReuse();
  testNoSchemaOrDomainLeak();
  testSegmentClickKeepsPopupOpen();
  testInlineSegmentWorkspace();
  testDesktopHeightAndFraming();
  console.log('OK — mandatory-gis-lot-popup-confrontations-workspace-tests passed');
}

main();
