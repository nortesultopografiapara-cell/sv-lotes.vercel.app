/**
 * Fase 2B — layout amplo do modal Novo/Editar Projeto (somente UI).
 * npx tsx scripts/mandatory-gis-project-form-layout-tests.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

const modal = read('components/projects/GisProjectFormModal.tsx');
const mapPage = read('app/map/page.tsx');
const lfFields = read('components/projects/ProjectLfContractConfigFields.tsx');
const splitPanel = read('components/projects/ProjectRevenueSplitPanel.tsx');

console.log('\n=== formulário compartilhado ===');
assert(mapPage.includes('GisProjectFormModal'), 'GIS usa o modal compartilhado');
assert(
  mapPage.includes('const renderProjectFormModal = () => (') &&
    mapPage.includes('<GisProjectFormModal'),
  'create e edit passam pelo mesmo render',
);
assert(!mapPage.includes('max-w-2xl'), 'mapa não usa mais modal estreito de edição');
assert(
  (mapPage.match(/<form /g) || []).length === 0 ||
    !mapPage.includes('Nome do Projeto *'),
  'mapa não duplica o formulário inline',
);
assert(mapPage.includes('handleCreateProject'), 'create preservado');
assert(mapPage.includes('handleSaveProjectEdit'), 'update preservado');
assert(mapPage.includes('handleProjectFormSubmit'), 'submit único preservado');

console.log('\n=== layout amplo e responsivo ===');
assert(modal.includes('w-[min(90vw,1500px)]'), 'largura ampla min(90vw, 1500px)');
assert(modal.includes('max-h-[90vh]'), 'altura máxima 90vh');
assert(!modal.includes('inset-0') || modal.includes('flex items-center justify-center'), 'overlay de modal, não tela absoluta do GIS');
assert(modal.includes('grid-cols-1'), '1 coluna no estreito');
assert(modal.includes('lg:grid-cols-2'), '2 colunas no intermediário');
assert(modal.includes('xl:grid-cols-3'), '3 colunas no desktop largo');
assert(modal.includes('overflow-y-auto'), 'scroll interno do conteúdo');
assert(modal.includes('overflow-x-hidden'), 'sem scroll horizontal');
assert(modal.includes('gis-project-col-empreendimento'), 'coluna 1 empreendimento');
assert(modal.includes('gis-project-col-contrato'), 'coluna 2 contrato');
assert(modal.includes('gis-project-col-financeiro'), 'coluna 3 financeiro');

console.log('\n=== colunas ===');
const col1 = modal.slice(
  modal.indexOf('gis-project-col-empreendimento'),
  modal.indexOf('gis-project-col-contrato'),
);
const col2 = modal.slice(
  modal.indexOf('gis-project-col-contrato'),
  modal.indexOf('gis-project-col-financeiro'),
);
const col3 = modal.slice(modal.indexOf('gis-project-col-financeiro'));
assert(col1.includes('Nome do Projeto'), 'col1 nome');
assert(col1.includes('Cidade'), 'col1 cidade');
assert(col1.includes('UF'), 'col1 UF');
assert(col1.includes('Bairro/Localidade'), 'col1 bairro');
assert(col1.includes('Endereço/Referência'), 'col1 endereço');
assert(col1.includes('Município / Foro do Contrato'), 'col1 foro');
assert(!col1.includes('Conta financeira padrão'), 'conta financeira não está na col1');
assert(col2.includes('Modelo de contrato padrão do empreendimento'), 'col2 modelo');
assert(col2.includes('ProjectLfContractConfigFields'), 'col2 bloco LF');
assert(col2.includes('PROMITENTES VENDEDORES'), 'col2 e-sign Mundo Novo');
assert(!col2.includes('ProjectRevenueSplitPanel'), 'Split não está na col2');
assert(!col2.includes('Conta financeira padrão'), 'conta financeira não está na col2');
assert(col3.includes('Conta financeira padrão do empreendimento'), 'col3 conta financeira');
assert(col3.includes('ProjectRevenueSplitPanel'), 'col3 Split');
assert(!col3.includes('ProjectLfContractConfigFields'), 'LF não está na col3');
assert(!col3.includes('Participação LF Imóveis'), 'percentuais LF não estão na col3');

console.log('\n=== percentuais separados ===');
assert(lfFields.includes('Participação LF Imóveis (%)'), 'percentual contratual LF no bloco LF');
assert(lfFields.includes('Participação segundo vendedor (%)'), 'percentual segundo vendedor no bloco LF');
assert(!lfFields.includes('sharePercent') && !lfFields.includes('shareInput'), 'bloco LF não sincroniza Split');
assert(splitPanel.includes('Distribuição de Recebimentos') || splitPanel.includes('shareInput'), 'percentuais Split no painel');
assert(!modal.includes('firstVendorPercent') || modal.includes('lfContractConfig'), 'form não duplica percentuais LF');

console.log('\n=== header/footer fixos ===');
assert(modal.includes('Editar Projeto') && modal.includes('Novo Projeto'), 'mesmo header para os dois modos');
assert(modal.includes('Cancelar'), 'botão Cancelar no rodapé');
assert(modal.includes('Salvar Alterações'), 'salvar no modo edição');
assert(modal.includes('Criar Projeto'), 'criar no modo novo');
assert(modal.includes('type="submit"'), 'submit no rodapé do form');
assert((modal.match(/shrink-0/g) || []).length >= 2, 'header e footer shrink-0');

console.log('\n=== lógica de persistência intacta no GIS ===');
assert(mapPage.includes('lf_contract_config:'), 'payload LF no create/update');
assert(mapPage.includes('lf_contract_config_json'), 'hydrate LF JSON');
assert(mapPage.includes('hasOwnProperty.call'), 'hydrate usa hasOwnProperty');
assert(mapPage.includes('updateProjectThroughApi'), 'update via API existente');
assert(mapPage.includes('createProjectThroughApi'), 'create via API existente');

console.log('\n=== arquivos protegidos / backend não reescritos nesta fase ===');
const resolver = read('lib/lfImoveisContractConfig.ts');
assert(resolver.includes('resolveLfContractConfig'), 'resolver LF intacto');
assert(!modal.includes('resolveLfContractConfig'), 'modal não chama resolver');
const mundo = read('lib/mundoNovoContractSellers.ts');
assert(!mundo.includes('GisProjectFormModal'), 'Mundo Novo não acoplado ao layout');
assert(!mundo.includes('lf_contract_config'), 'Mundo Novo sellers intocado');

console.log('\nOK mandatory-gis-project-form-layout-tests');
