/**
 * Testes — workspace visual da aba Confrontações + editor de lados (somente UI).
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
  assert(gis.includes('variant={isWideDesktop ? "embedded" : "overlay"}'), 'desktop embedded / mobile overlay');
  assert(gis.includes('portalTarget={isWideDesktop ? officialSidesEditorSlot : null}'), 'portal no slot da aba');
  assert(gis.includes('useIsWideDesktop'), 'breakpoint desktop largo');
  assert(editor.includes("variant?: 'overlay' | 'embedded'"), 'variant no editor');
  assert(editor.includes('portalTarget'), 'portalTarget no editor');
  assert(editor.includes('createPortal'), 'portal reutiliza o mesmo painel');
  assert(editor.includes('Editar lados do lote'), 'título interno preservado');
  assert(editor.includes("label: 'Frente'"), 'ação Frente');
  assert(editor.includes("label: 'Fundo'"), 'ação Fundo');
  assert(editor.includes("label: 'Lado direito'"), 'ação Lado direito');
  assert(editor.includes("label: 'Lado esquerdo'"), 'ação Lado esquerdo');
  assert(editor.includes("label: 'Limpar'"), 'ação Limpar');
  assert(editor.includes('Restaurar classificação automática'), 'restaurar preservado');
  assert(gis.includes('persistBlockSegmentsJson'), 'persistência original');
  assert(gis.includes('restoreAutomaticOfficialSides'), 'restore original');
  assert(gis.includes('snapshotSegmentsJson'), 'snapshot original');
  assert(panel.includes('loadLotConfrontations'), 'consulta ainda usa o serviço');
  assert(panel.includes('Tentar novamente'), 'retry de erro');
  assert(panel.includes('onStartOfficialSidesEdit'), 'aba inicia o editor existente');
  assert(panel.includes('editingOfficialSides'), 'modo edição no slot');
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
    'hooks/use-mobile.ts',
  ];
  for (const rel of files) {
    const src = read(rel);
    assert(!src.includes('sale_release_settlements'), `${rel} sem settlements`);
    assert(!src.includes('create table'), `${rel} sem SQL`);
    assert(!src.includes('from("sales")'), `${rel} sem sales`);
  }
}

function main() {
  testPopupTabsAndResumoButton();
  testSingleEditorEngine();
  testGeometryReuse();
  testNoSchemaOrDomainLeak();
  console.log('OK — mandatory-gis-lot-popup-confrontations-workspace-tests passed');
}

main();
