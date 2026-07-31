/**
 * Hotfix UI — Documentos na aba Documentação do EquipmentFormModal.
 * npm run test:master-topography-equipment-form-docs
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function main() {
  const form = read('components/master/topography/equipment/EquipmentFormModal.tsx');
  const panel = read('components/master/topography/equipment/EquipmentDocumentsPanel.tsx');
  const detail = read('components/master/topography/equipment/EquipmentDetailPage.tsx');
  const css = read('components/master/topography/equipment/equipment.module.css');

  assert(form.includes("from './EquipmentDocumentsPanel'"), 'FormModal importa DocumentsPanel');
  assert(form.includes('<EquipmentDocumentsPanel'), 'FormModal renderiza DocumentsPanel');
  assert(
    form.includes('Salve o equipamento primeiro para anexar documentos.'),
    'create sem ID orienta salvar primeiro',
  );
  assert(form.includes("mode === 'edit' && initial?.id"), 'upload só com equipmentId');
  assert(
    form.includes('/documents?userId='),
    'carrega documentos via API existente',
  );
  assert(!form.includes('fora do escopo 1B'), 'sem texto 1B');
  assert(!form.includes('entram em fase posterior'), 'sem fase posterior');
  assert(!form.includes('Situação ANAC / ANATEL / Manual'), 'sem bloco placeholder ANAC');

  assert(panel.includes('embedded'), 'painel aceita embedded');
  assert(panel.includes('/documents'), 'painel chama API documents');
  assert(panel.includes('soft delete') || panel.includes('DELETE'), 'exclusão via DELETE');
  assert(panel.includes('createSignedUrl') || panel.includes('documents/${docId}'), 'download/signed');

  assert(detail.includes('<EquipmentDocumentsPanel'), 'detalhe mantém painel');
  assert(css.includes('modalBodyDocs'), 'scroll interno no modal docs');
  assert(css.includes('modalOverlayNested'), 'overlay aninhado para upload');

  console.log('OK mandatory-master-topography-equipment-form-docs-tests');
}

main();
