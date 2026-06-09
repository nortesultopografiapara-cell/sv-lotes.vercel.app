/**
 * Lookup CEP (ViaCEP) — cliente/venda.
 * npx tsx scripts/mandatory-cep-lookup-tests.ts
 */

import {
  isCompleteCep,
  lookupCep,
  mapViaCepToAddressFields,
} from '../lib/cepLookup';
import { formatCep } from '../lib/inputMasks';
import { mergeAutofillOnlyEmpty } from '../lib/mergeAutofillFields';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testIsCompleteCep() {
  assert(!isCompleteCep('6851500'), '7 dígitos incompleto');
  assert(isCompleteCep('68515000'), '8 dígitos completo');
  assert(isCompleteCep('68.515-000'), 'mascarado completo');
  console.log('OK testIsCompleteCep');
}

function testMapViaCepToAddressFields() {
  const fields = mapViaCepToAddressFields({
    cep: '68515-000',
    logradouro: 'Rua Exemplo',
    bairro: 'Centro',
    localidade: 'Paragominas',
    uf: 'pa',
  });
  assert(fields.address === 'Rua Exemplo', 'logradouro');
  assert(fields.neighborhood === 'Centro', 'bairro');
  assert(fields.city === 'Paragominas', 'cidade');
  assert(fields.state === 'PA', 'uf');
  assert(fields.zip_code === formatCep('68515000'), 'cep formatado');
  console.log('OK testMapViaCepToAddressFields');
}

function testMergeDoesNotOverwriteFilledFields() {
  const current = {
    address: 'Rua Manual, 10',
    neighborhood: '',
    city: 'Belém',
    state: 'PA',
  };
  const merged = mergeAutofillOnlyEmpty(current, {
    address: 'Rua ViaCEP',
    neighborhood: 'Novo Bairro',
    city: 'Paragominas',
    state: 'PA',
  });
  assert(merged.address === 'Rua Manual, 10', 'não sobrescreve endereço');
  assert(merged.neighborhood === 'Novo Bairro', 'preenche vazio');
  assert(merged.city === 'Belém', 'não sobrescreve cidade');
  console.log('OK testMergeDoesNotOverwriteFilledFields');
}

async function testLookupCepSuccess() {
  const mockFetch: typeof fetch = async () =>
    ({
      ok: true,
      json: async () => ({
        cep: '68515-000',
        logradouro: 'Avenida Brasil',
        bairro: 'Centro',
        localidade: 'Paragominas',
        uf: 'PA',
      }),
    }) as Response;

  const result = await lookupCep('68515000', mockFetch);
  assert(result.ok === true, 'sucesso');
  if (result.ok) {
    assert(result.fields.city === 'Paragominas', 'cidade API');
  }
  console.log('OK testLookupCepSuccess');
}

async function testLookupCepNotFound() {
  const mockFetch: typeof fetch = async () =>
    ({
      ok: true,
      json: async () => ({ erro: true }),
    }) as Response;

  const result = await lookupCep('00000000', mockFetch);
  assert(!result.ok && result.reason === 'not_found', 'não encontrado');
  console.log('OK testLookupCepNotFound');
}

async function testLookupCepApiErrorDoesNotThrow() {
  const mockFetch: typeof fetch = async () => {
    throw new Error('network');
  };

  const result = await lookupCep('68515000', mockFetch);
  assert(!result.ok && result.reason === 'error', 'erro API');
  console.log('OK testLookupCepApiErrorDoesNotThrow');
}

async function main() {
  testIsCompleteCep();
  testMapViaCepToAddressFields();
  testMergeDoesNotOverwriteFilledFields();
  await testLookupCepSuccess();
  await testLookupCepNotFound();
  await testLookupCepApiErrorDoesNotThrow();
  console.log('mandatory-cep-lookup-tests: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
