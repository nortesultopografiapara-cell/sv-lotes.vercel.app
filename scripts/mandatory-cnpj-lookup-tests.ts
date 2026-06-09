/**
 * Lookup CNPJ (BrasilAPI) — cliente/venda.
 * npx tsx scripts/mandatory-cnpj-lookup-tests.ts
 */

import {
  isCompleteCnpj,
  lookupCnpj,
  mapBrasilApiCnpjToCustomerFields,
} from '../lib/cnpjLookup';
import { formatCpfCnpj } from '../lib/inputMasks';
import { mergeAutofillOnlyEmpty } from '../lib/mergeAutofillFields';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testIsCompleteCnpj() {
  assert(!isCompleteCnpj('12345678901'), 'CPF 11 não é CNPJ completo');
  assert(isCompleteCnpj('12345678000199'), 'CNPJ 14 completo');
  assert(
    isCompleteCnpj(formatCpfCnpj('12345678000199')),
    'CNPJ mascarado completo',
  );
  console.log('OK testIsCompleteCnpj');
}

function testMapBrasilApiCnpjToCustomerFields() {
  const fields = mapBrasilApiCnpjToCustomerFields({
    razao_social: 'EMPRESA TESTE LTDA',
    nome_fantasia: 'EMPRESA TESTE',
    cnpj: '12345678000199',
    descricao_tipo_de_logradouro: 'RUA',
    logradouro: 'DAS FLORES',
    numero: '100',
    bairro: 'CENTRO',
    municipio: 'BELEM',
    uf: 'PA',
    cep: '66000000',
    email: 'contato@empresa.com',
    ddd_telefone_1: '9199999999',
  });
  assert(fields.name === 'EMPRESA TESTE LTDA', 'razão social');
  assert(fields.trade_name === 'EMPRESA TESTE', 'fantasia');
  assert(fields.cpf_cnpj === formatCpfCnpj('12345678000199'), 'cnpj formatado');
  assert(fields.address?.includes('DAS FLORES'), 'endereço');
  assert(fields.city === 'BELEM', 'cidade');
  assert(fields.state === 'PA', 'uf');
  assert(fields.email === 'contato@empresa.com', 'email');
  console.log('OK testMapBrasilApiCnpjToCustomerFields');
}

function testMergeDoesNotOverwriteFilledFields() {
  const current = {
    name: 'Nome Manual',
    address: 'Rua X',
    email: '',
    phone: '(91) 99999-9999',
  };
  const merged = mergeAutofillOnlyEmpty(current, {
    name: 'EMPRESA API',
    address: 'Rua API',
    email: 'api@empresa.com',
    phone: '(91) 88888-8888',
  });
  assert(merged.name === 'Nome Manual', 'não sobrescreve nome');
  assert(merged.address === 'Rua X', 'não sobrescreve endereço');
  assert(merged.email === 'api@empresa.com', 'preenche email vazio');
  assert(merged.phone === '(91) 99999-9999', 'não sobrescreve telefone');
  console.log('OK testMergeDoesNotOverwriteFilledFields');
}

async function testLookupCnpjDoesNotRunForCpf() {
  const result = await lookupCnpj('12551515500');
  assert(!result.ok && result.reason === 'not_cnpj', 'CPF não busca CNPJ');
  console.log('OK testLookupCnpjDoesNotRunForCpf');
}

async function testLookupCnpjSuccess() {
  const mockFetch: typeof fetch = async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        razao_social: 'NORTE SUL LTDA',
        nome_fantasia: 'NORTE SUL',
        cnpj: '12345678000199',
        logradouro: 'BRASIL',
        numero: '50',
        bairro: 'CENTRO',
        municipio: 'PARAGOMINAS',
        uf: 'PA',
        cep: '68515000',
      }),
    }) as Response;

  const result = await lookupCnpj('12345678000199', mockFetch);
  assert(result.ok === true, 'sucesso');
  if (result.ok) {
    assert(result.fields.name === 'NORTE SUL LTDA', 'razão social API');
  }
  console.log('OK testLookupCnpjSuccess');
}

async function testLookupCnpjNotFound() {
  const mockFetch: typeof fetch = async () =>
    ({
      ok: false,
      status: 404,
      json: async () => ({}),
    }) as Response;

  const result = await lookupCnpj('12345678000199', mockFetch);
  assert(!result.ok && result.reason === 'not_found', 'não encontrado');
  console.log('OK testLookupCnpjNotFound');
}

async function testLookupCnpjApiErrorDoesNotThrow() {
  const mockFetch: typeof fetch = async () => {
    throw new Error('network');
  };

  const result = await lookupCnpj('12345678000199', mockFetch);
  assert(!result.ok && result.reason === 'error', 'erro API');
  console.log('OK testLookupCnpjApiErrorDoesNotThrow');
}

async function main() {
  testIsCompleteCnpj();
  testMapBrasilApiCnpjToCustomerFields();
  testMergeDoesNotOverwriteFilledFields();
  await testLookupCnpjDoesNotRunForCpf();
  await testLookupCnpjSuccess();
  await testLookupCnpjNotFound();
  await testLookupCnpjApiErrorDoesNotThrow();
  console.log('mandatory-cnpj-lookup-tests: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
