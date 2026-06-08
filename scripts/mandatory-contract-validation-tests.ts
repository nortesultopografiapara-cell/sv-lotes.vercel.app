/**
 * Validação obrigatória do comprador antes de gerar/regenerar contrato + auditoria.
 * npx tsx scripts/mandatory-contract-validation-tests.ts
 */

import { generateContractHTML } from '../lib/contractTemplate';
import {
  customerPatchFromForm,
  emptyCustomerFormValues,
  mergeCustomerData,
  mergePreservingCustomerFields,
  type CustomerRecord,
} from '../lib/customerIdentity';
import {
  assertCustomerValidForContract,
  CustomerContractValidationError,
  validateCustomerForContract,
} from '../lib/validateCustomerForContract';
import {
  buildCustomerAuditSnapshot,
  customerAuditHasTrackedChanges,
  extractCustomerAuditChanges,
} from '../lib/customerAudit';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const FULL_CUSTOMER: CustomerRecord = {
  id: 'cust-full',
  name: 'MARIA SILVA',
  cpf_cnpj: '12345678901',
  document: '12345678901',
  rg: '1234567',
  profession: 'ADVOGADA',
  civil_state: 'CASADO(A)',
  marital_status: 'CASADO(A)',
  address: 'RUA B, 50',
  city: 'BELEM',
  state_uf: 'PA',
  state: 'PA',
  zip_code: '66000-000',
  cep: '66000-000',
  phone: '91999999999',
  email: 'MARIA@EMAIL.COM',
};

/** 1. Cliente completo → contrato gera normalmente */
function testCompleteCustomerGeneratesContract() {
  const validation = validateCustomerForContract(FULL_CUSTOMER);
  assert(validation.valid, 'cliente completo deve ser válido');
  assert(validation.missingRequired.length === 0, 'sem campos obrigatórios faltando');

  const html = generateContractHTML({
    tenant: {
      name: 'Empresa Teste',
      cnpj: '00000000000100',
      city: 'Belem',
      state: 'PA',
      address: 'Rua X',
      zip_code: '66000-000',
    },
    customer: mergeCustomerData(FULL_CUSTOMER),
    project: { name: 'Projeto X', city: 'Belem', uf: 'PA' },
    block: { block_name: 'A', number: '1', area: 250, frente: 10 },
    sale: {
      total_value: 100000,
      down_payment: 0,
      installments_count: 1,
      payment_type: 'À vista',
    },
    contractSnapshot: { contract_number: '000000001/2026' },
    contractDate: '2026-06-08',
  });
  assert(html.length > 500, 'HTML do contrato deve ser gerado');
  assert(html.includes('ADVOGADA') || html.includes('Advogada'), 'profissão no HTML');
  assert(
    !html.toLowerCase().includes('profissão não informada'),
    'sem placeholder de profissão',
  );
  console.log('OK testCompleteCustomerGeneratesContract');
}

/** 2. Cliente sem RG → bloqueado */
function testMissingRgBlocksContract() {
  const customer = { ...FULL_CUSTOMER, rg: '' };
  const validation = validateCustomerForContract(customer);
  assert(!validation.valid, 'sem RG deve ser inválido');
  assert(validation.missingRequired.includes('RG'), 'RG na lista de pendentes');
  let threw = false;
  try {
    assertCustomerValidForContract(customer);
  } catch (e) {
    threw = e instanceof CustomerContractValidationError;
  }
  assert(threw, 'assertCustomerValidForContract deve lançar');
  console.log('OK testMissingRgBlocksContract');
}

/** 3. Cliente sem profissão → bloqueado */
function testMissingProfessionBlocksContract() {
  const customer = { ...FULL_CUSTOMER, profession: null };
  const validation = validateCustomerForContract(customer);
  assert(!validation.valid, 'sem profissão deve ser inválido');
  assert(validation.missingRequired.includes('Profissão'), 'Profissão pendente');
  console.log('OK testMissingProfessionBlocksContract');
}

/** 4. Cliente sem estado civil → bloqueado */
function testMissingCivilStateBlocksContract() {
  const customer = {
    ...FULL_CUSTOMER,
    civil_state: '',
    marital_status: '',
  };
  const validation = validateCustomerForContract(customer);
  assert(!validation.valid, 'sem estado civil deve ser inválido');
  assert(
    validation.missingRequired.includes('Estado Civil'),
    'Estado Civil pendente',
  );
  console.log('OK testMissingCivilStateBlocksContract');
}

/** 5. Editar cliente → auditoria detecta alteração */
function testCustomerFormAuditChanges() {
  const before = buildCustomerAuditSnapshot(FULL_CUSTOMER);
  const after = buildCustomerAuditSnapshot({
    ...FULL_CUSTOMER,
    rg: '9999999',
    profession: 'MÉDICA',
  });
  assert(
    customerAuditHasTrackedChanges(before, after),
    'deve haver alterações rastreadas',
  );
  const changes = extractCustomerAuditChanges(before, after);
  const fields = changes.map((c) => c.field);
  assert(fields.includes('rg'), 'RG alterado');
  assert(fields.includes('profession'), 'profissão alterada');
  console.log('OK testCustomerFormAuditChanges');
}

/** 6. Editar venda → auditoria detecta alteração cadastral */
function testSaleEditAuditChanges() {
  const customerBefore = { ...FULL_CUSTOMER };
  const patch = customerPatchFromForm({
    ...emptyCustomerFormValues(),
    name: FULL_CUSTOMER.name!,
    cpf_cnpj: FULL_CUSTOMER.cpf_cnpj!,
    address: 'RUA NOVA, 200',
    city: 'ANANINDEUA',
  });
  const customerAfter = mergePreservingCustomerFields(customerBefore, patch);
  const before = buildCustomerAuditSnapshot(customerBefore);
  const after = buildCustomerAuditSnapshot(customerAfter);
  assert(customerAuditHasTrackedChanges(before, after), 'edição de venda gera diff');
  const changes = extractCustomerAuditChanges(before, after);
  assert(
    changes.some((c) => c.field === 'address' || c.field === 'city'),
    'endereço ou cidade alterados',
  );
  console.log('OK testSaleEditAuditChanges');
}

/** 7. Regenerar contrato → dados do cliente preservados no merge */
function testRegenerationPreservesCustomerData() {
  const dbCustomer = { ...FULL_CUSTOMER };
  const emptySale = { profession: '', city: '', rg: '' };
  const merged = mergeCustomerData(dbCustomer, emptySale);
  assert(merged.rg === FULL_CUSTOMER.rg, 'RG preservado na regeneração');
  assert(merged.profession === FULL_CUSTOMER.profession, 'profissão preservada');
  assert(merged.city === FULL_CUSTOMER.city, 'cidade preservada');
  const validation = validateCustomerForContract(merged);
  assert(validation.valid, 'cliente mesclado permanece válido');
  console.log('OK testRegenerationPreservesCustomerData');
}

/** 8. Campo preenchido não pode ser apagado por formulário vazio */
function testFilledFieldNotErasedByEmptyForm() {
  const existing = { ...FULL_CUSTOMER };
  const patch = customerPatchFromForm({
    ...emptyCustomerFormValues(),
    name: FULL_CUSTOMER.name!,
    cpf_cnpj: FULL_CUSTOMER.cpf_cnpj!,
  });
  const merged = mergePreservingCustomerFields(existing, patch);
  assert(merged.rg === FULL_CUSTOMER.rg, 'RG não apagado');
  assert(merged.profession === FULL_CUSTOMER.profession, 'profissão não apagada');
  assert(merged.civil_state === FULL_CUSTOMER.civil_state, 'estado civil preservado');
  assert(merged.city === FULL_CUSTOMER.city, 'cidade preservada');
  console.log('OK testFilledFieldNotErasedByEmptyForm');
}

function testNaoInformadoTreatedAsMissing() {
  const customer = {
    ...FULL_CUSTOMER,
    profession: 'Não Informada',
    city: 'Cidade Não Informada',
  };
  const validation = validateCustomerForContract(customer);
  assert(!validation.valid, 'Não Informado conta como faltante');
  assert(validation.missingRequired.includes('Profissão'), 'profissão pendente');
  assert(validation.missingRequired.includes('Cidade'), 'cidade pendente');
  console.log('OK testNaoInformadoTreatedAsMissing');
}

function main() {
  testCompleteCustomerGeneratesContract();
  testMissingRgBlocksContract();
  testMissingProfessionBlocksContract();
  testMissingCivilStateBlocksContract();
  testCustomerFormAuditChanges();
  testSaleEditAuditChanges();
  testRegenerationPreservesCustomerData();
  testFilledFieldNotErasedByEmptyForm();
  testNaoInformadoTreatedAsMissing();
  console.log('\nTodos os testes de validação de contrato passaram.');
}

main();
