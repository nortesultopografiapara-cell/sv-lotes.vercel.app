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
  assert(gis.includes('onEditOfficialSides(lot)'), 'Resumo ainda chama o editor oficial');
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
  assert(preview.includes('pad = 0.06'), 'fit-to-bounds com margem reduzida');
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

function main() {
  testPopupTabsAndResumoButton();
  testSingleEditorEngine();
  testGeometryReuse();
  testNoSchemaOrDomainLeak();
  testSegmentClickKeepsPopupOpen();
  testInlineSegmentWorkspace();
  console.log('OK — mandatory-gis-lot-popup-confrontations-workspace-tests passed');
}

main();
