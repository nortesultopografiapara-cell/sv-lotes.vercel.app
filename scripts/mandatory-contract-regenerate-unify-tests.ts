/**
 * Unificação da regeneração de contrato — GIS e aba Contratos.
 * npx tsx scripts/mandatory-contract-regenerate-unify-tests.ts
 */

import fs from 'node:fs';
import {
  validateCustomerForContract,
  validateCustomerForContractFromContract,
} from '../lib/validateCustomerForContract';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testContractsPageAllButtonsShareHandler() {
  const page = fs.readFileSync('app/contracts/page.tsx', 'utf8');
  const openCalls = page.match(/onClick=\{openRegenerateModal\}/g) || [];
  assert(openCalls.length >= 3, `todos os botões usam openRegenerateModal (got ${openCalls.length})`);
  assert(page.includes('confirmRegenerateContract'), 'confirmação única');
  assert(
    page.includes('/api/contracts/${selectedContract.id}/regenerate'),
    'endpoint canônico',
  );
  console.log('OK testContractsPageAllButtonsShareHandler');
}

function testContractsPageDoesNotGateRegenerateOnListObject() {
  const page = fs.readFileSync('app/contracts/page.tsx', 'utf8');
  const confirmStart = page.indexOf('const confirmRegenerateContract');
  const confirmEnd = page.indexOf('const processContractsFromRows');
  assert(confirmStart > 0 && confirmEnd > confirmStart, 'bloco confirm encontrado');
  const confirmBody = page.slice(confirmStart, confirmEnd);
  assert(
    !confirmBody.includes('ensureCustomerValidForContractAction'),
    'regenerar NÃO valida objeto resumido da lista',
  );
  assert(
    confirmBody.includes('NÃO validar o objeto resumido') ||
      confirmBody.includes('loader canônico'),
    'comentário de intenção presente',
  );
  console.log('OK testContractsPageDoesNotGateRegenerateOnListObject');
}

function testHtmlPreviewDoesNotForceRefreshOnRetryAlone() {
  const page = fs.readFileSync('app/contracts/page.tsx', 'utf8');
  assert(
    !page.includes('contractHtmlRetryKey > 0 ||'),
    'retryKey sozinho não força refresh=1',
  );
  assert(
    page.includes('selectedContract.needs_regenerar === true'),
    'refresh só com needs_regenerar',
  );
  assert(
    page.includes('setContractHtmlRetryKey(0)'),
    'troca de contrato zera retry key',
  );
  console.log('OK testHtmlPreviewDoesNotForceRefreshOnRetryAlone');
}

function testGisAndContractsShareSameEndpoint() {
  const gis = fs.readFileSync('components/map/GISMap.tsx', 'utf8');
  const page = fs.readFileSync('app/contracts/page.tsx', 'utf8');
  assert(
    gis.includes('/api/contracts/${lot.contractId}/regenerate'),
    'GIS usa /regenerate',
  );
  assert(
    page.includes('/api/contracts/${selectedContract.id}/regenerate'),
    'Contratos usa /regenerate',
  );
  console.log('OK testGisAndContractsShareSameEndpoint');
}

function testSharedCustomerLoaderWired() {
  const loader = fs.readFileSync('lib/loadCustomerForSaleContract.ts', 'utf8');
  const viewHtml = fs.readFileSync('lib/buildContractViewHtml.ts', 'utf8');
  const regen = fs.readFileSync('lib/contractRegeneration.ts', 'utf8');
  assert(loader.includes('select(\'*\')'), 'loader usa select *');
  assert(loader.includes("from('clients')"), 'loader mescla clients');
  assert(viewHtml.includes('loadCustomerForSaleContract'), 'preview usa loader');
  assert(regen.includes('loadCustomerForSaleContract'), 'regeneração usa loader');
  assert(loader.includes('cpf_cnpj'), 'loader resolve cpf_cnpj');
  console.log('OK testSharedCustomerLoaderWired');
}

function testCompleteCustomerPassesValidation() {
  const validation = validateCustomerForContract({
    name: 'Cliente Completo',
    cpf_cnpj: '12345678901',
    rg: '1234567',
    civil_state: 'Solteiro',
    profession: 'Comerciante',
    address: 'Rua A, 100',
    city: 'Parauapebas',
    state_uf: 'PA',
  });
  assert(validation.valid, 'cliente completo válido');
  assert(validation.missingRequired.length === 0, 'sem pendências');
  console.log('OK testCompleteCustomerPassesValidation');
}

function testIncompleteCustomerListsOnlyMissing() {
  const validation = validateCustomerForContract({
    name: 'Cliente Parcial',
    cpf_cnpj: '12345678901',
  });
  assert(!validation.valid, 'incompleto inválido');
  assert(validation.missingRequired.includes('RG'), 'falta RG');
  assert(validation.missingRequired.includes('Estado Civil'), 'falta estado civil');
  assert(!validation.missingRequired.includes('Nome Completo'), 'nome ok');
  assert(!validation.missingRequired.includes('CPF'), 'cpf ok');
  console.log('OK testIncompleteCustomerListsOnlyMissing');
}

function testListStubLooksIncompleteButMustNotGateApi() {
  // Simula selectedContract enriquecido só com nome/documento (stub da lista).
  const stubContract = {
    customer_id: 'cust-1',
    customers: { id: 'cust-1', name: 'Fulano', document: '12345678901' },
    sales: {},
  };
  const fromList = validateCustomerForContractFromContract(stubContract);
  assert(!fromList.valid, 'stub da lista parece incompleto');
  assert(
    fromList.missingRequired.includes('RG'),
    'stub marca RG ausente — por isso o gate client era falso positivo',
  );
  console.log('OK testListStubLooksIncompleteButMustNotGateApi');
}

function testCanonicalAliasesAccepted() {
  const withAliases = validateCustomerForContract({
    full_name: 'Nome Alias',
    document: '12345678901',
    rg_number: '999',
    marital_status: 'Casado',
    profession: 'Engenheiro',
    street: 'Av. Central',
    city: 'Belém',
    state: 'PA',
  });
  assert(withAliases.valid, 'aliases aceitos');
  console.log('OK testCanonicalAliasesAccepted');
}

function main() {
  testContractsPageAllButtonsShareHandler();
  testContractsPageDoesNotGateRegenerateOnListObject();
  testHtmlPreviewDoesNotForceRefreshOnRetryAlone();
  testGisAndContractsShareSameEndpoint();
  testSharedCustomerLoaderWired();
  testCompleteCustomerPassesValidation();
  testIncompleteCustomerListsOnlyMissing();
  testListStubLooksIncompleteButMustNotGateApi();
  testCanonicalAliasesAccepted();
  console.log('ALL mandatory-contract-regenerate-unify-tests PASSED');
}

main();
