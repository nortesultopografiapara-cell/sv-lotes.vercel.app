/**
 * Resolução de cliente na venda — evita falsa duplicidade por nome/telefone/e-mail.
 * npx tsx scripts/mandatory-sale-customer-resolution-tests.ts
 */

import {
  buildDuplicateCustomerError,
  getFormSelectedCustomerId,
  resolveSaleCustomerDecision,
  type CustomerFormValues,
} from '../lib/customerIdentity';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function baseForm(
  patch: Partial<CustomerFormValues> & { customer_id?: string | null } = {},
): CustomerFormValues & { customer_id?: string | null } {
  return {
    selected_customer_id: null,
    name: 'JOÃO DA SILVA',
    cpf_cnpj: '123.456.789-01',
    rg: '',
    rg_issuer: '',
    rg_issuer_state: '',
    profession: '',
    civil_state: '',
    phone: '94999999999',
    email: 'joao@email.com',
    address: '',
    neighborhood: '',
    city: '',
    state_uf: '',
    zip_code: '',
    ...patch,
  };
}

function testSaleWithValidSelectedCustomerId() {
  const form = baseForm({ selected_customer_id: 'cust-valid-uuid' });
  const id = getFormSelectedCustomerId(form);
  assert(id === 'cust-valid-uuid', `id selecionado: ${id}`);
  const decision = resolveSaleCustomerDecision(form);
  assert(decision.action === 'use_selected', `ação: ${decision.action}`);
  if (decision.action === 'use_selected') {
    assert(decision.customerId === 'cust-valid-uuid', 'usa ID do formulário');
  }
  console.log('OK testSaleWithValidSelectedCustomerId');
}

function testSaleWithCustomerIdAliasField() {
  const form = baseForm({
    selected_customer_id: null,
    customer_id: 'cust-alias-uuid',
  });
  const id = getFormSelectedCustomerId(form);
  assert(id === 'cust-alias-uuid', `alias customer_id: ${id}`);
  const decision = resolveSaleCustomerDecision(form);
  assert(decision.action === 'use_selected', 'aceita customer_id como alias');
  console.log('OK testSaleWithCustomerIdAliasField');
}

function testSaleWithSimilarNamesUsesCpfNotName() {
  const form = baseForm({
    selected_customer_id: null,
    name: 'MARIA SILVA',
    phone: '94988887777',
    email: 'maria@email.com',
    cpf_cnpj: '987.654.321-00',
  });
  const decision = resolveSaleCustomerDecision(form);
  assert(decision.action === 'lookup_cpf', 'não bloqueia por nome parecido');
  if (decision.action === 'lookup_cpf') {
    assert(decision.normalizedCpf === '98765432100', 'busca só por CPF');
  }
  console.log('OK testSaleWithSimilarNamesUsesCpfNotName');
}

function testSaleWithUniqueCpfLookup() {
  const form = baseForm({
    selected_customer_id: null,
    cpf_cnpj: '11.444.777/0001-61',
  });
  const decision = resolveSaleCustomerDecision(form);
  assert(decision.action === 'lookup_cpf', 'CNPJ único dispara lookup');
  if (decision.action === 'lookup_cpf') {
    assert(
      decision.normalizedCpf === '11444777000161',
      `cnpj normalizado: ${decision.normalizedCpf}`,
    );
  }
  console.log('OK testSaleWithUniqueCpfLookup');
}

function testSaleWithoutCustomerRequiresSelection() {
  const form = baseForm({
    selected_customer_id: null,
    cpf_cnpj: '',
    name: 'CLIENTE SEM DOCUMENTO',
  });
  const decision = resolveSaleCustomerDecision(form);
  assert(decision.action === 'reject', 'exige seleção manual');
  if (decision.action === 'reject') {
    assert(
      decision.reason === 'no_customer_no_cpf',
      `motivo: ${decision.reason}`,
    );
    assert(
      decision.message.includes('Selecione um cliente'),
      'mensagem orienta busca manual',
    );
  }
  console.log('OK testSaleWithoutCustomerRequiresSelection');
}

function testSaleWithIncompleteCpfRejected() {
  const form = baseForm({
    selected_customer_id: null,
    cpf_cnpj: '12345',
  });
  const decision = resolveSaleCustomerDecision(form);
  assert(decision.action === 'reject', 'cpf curto rejeitado');
  if (decision.action === 'reject') {
    assert(decision.reason === 'cpf_too_short', `motivo: ${decision.reason}`);
  }
  console.log('OK testSaleWithIncompleteCpfRejected');
}

function testDuplicateCustomerErrorMessage() {
  const msg = buildDuplicateCustomerError('12345678901', [
    { id: 'id-a' },
    { id: 'id-b' },
  ]);
  assert(msg.includes('CPF/CNPJ'), 'cita documento');
  assert(msg.includes('id-a'), 'lista ID a');
  assert(msg.includes('id-b'), 'lista ID b');
  assert(msg.includes('2 registros'), 'informa quantidade');
  assert(!msg.includes('mesmos dados'), 'não usa mensagem genérica antiga');
  console.log('OK testDuplicateCustomerErrorMessage');
}

function testSelectedCustomerSkipsLookupEvenWithSharedCpf() {
  const form = baseForm({
    selected_customer_id: 'cust-picked',
    cpf_cnpj: '123.456.789-01',
  });
  const decision = resolveSaleCustomerDecision(form);
  assert(decision.action === 'use_selected', 'ID selecionado tem prioridade');
  if (decision.action === 'use_selected') {
    assert(decision.customerId === 'cust-picked', 'não faz lookup por CPF');
  }
  console.log('OK testSelectedCustomerSkipsLookupEvenWithSharedCpf');
}

function main() {
  testSaleWithValidSelectedCustomerId();
  testSaleWithCustomerIdAliasField();
  testSaleWithSimilarNamesUsesCpfNotName();
  testSaleWithUniqueCpfLookup();
  testSaleWithoutCustomerRequiresSelection();
  testSaleWithIncompleteCpfRejected();
  testDuplicateCustomerErrorMessage();
  testSelectedCustomerSkipsLookupEvenWithSharedCpf();
  console.log('mandatory-sale-customer-resolution-tests: all passed');
}

main();
