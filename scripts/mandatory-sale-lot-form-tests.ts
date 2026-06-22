/**
 * Testes — formulário de venda GIS (e-mail opcional e campos obrigatórios).
 * npx tsx scripts/mandatory-sale-lot-form-tests.ts
 */

import {
  buildCustomerPayload,
  customerEmailFromForm,
  customerToFormValues,
  mergeCustomerPatchFromForm,
  type CustomerRecord,
} from '../lib/customerIdentity';
import {
  validateOptionalCustomerEmail,
  validateSaleLotFormBasics,
  validateSaleLotFormSubmission,
} from '../lib/saleLotFormValidation';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const FULL_CUSTOMER: CustomerRecord = {
  id: 'cust-1',
  name: 'JOÃO DA SILVA',
  cpf_cnpj: '12345678901',
  document: '12345678901',
  rg: '3658956',
  rg_issuer: 'PC',
  rg_issuer_state: 'PA',
  profession: 'Engenheiro Civil',
  civil_state: 'Casado(a)',
  marital_status: 'Casado(a)',
  address: 'RUA A, 100',
  neighborhood: 'CENTRO',
  city: 'PARAUAPEBAS',
  state_uf: 'PA',
  state: 'PA',
  zip_code: '68515-000',
  cep: '68515-000',
  phone: '94999999999',
  email: 'JOAO@EMAIL.COM',
};

function testEmailFromFormEmptyBecomesNull() {
  assert(customerEmailFromForm('') === null, 'vazio -> null');
  assert(customerEmailFromForm('   ') === null, 'espaços -> null');
  assert(customerEmailFromForm('a@b.com') === 'A@B.COM', 'normaliza maiúsculas');
  console.log('OK testEmailFromFormEmptyBecomesNull');
}

function testEmailClearsOnEditSaleMerge() {
  const merged = mergeCustomerPatchFromForm(FULL_CUSTOMER, {
    ...customerToFormValues(FULL_CUSTOMER),
    email: '',
  });
  assert(merged.email === null, 'edição com e-mail vazio limpa no patch');
  assert(merged.rg === FULL_CUSTOMER.rg, 'RG preservado ao limpar e-mail');
  console.log('OK testEmailClearsOnEditSaleMerge');
}

function testEmailClearsInBuildCustomerPayload() {
  const payload = buildCustomerPayload(
    { ...customerToFormValues(FULL_CUSTOMER), email: '' },
    { tenantId: 't1', projectId: 'p1' },
    FULL_CUSTOMER,
  );
  assert(payload.email === null, 'payload limpa e-mail existente');
  console.log('OK testEmailClearsInBuildCustomerPayload');
}

function testOptionalEmailValidation() {
  assert(validateOptionalCustomerEmail('').valid, 'vazio permitido');
  assert(validateOptionalCustomerEmail('cliente@test.com').valid, 'válido ok');
  assert(!validateOptionalCustomerEmail('teste@').valid, 'inválido bloqueado');
  console.log('OK testOptionalEmailValidation');
}

function testSaleFormBlocksMissingNameAndCpf() {
  const noName = validateSaleLotFormBasics({ cpf_cnpj: '12345678901' });
  assert(!noName.valid, 'sem nome bloqueia');
  const noCpf = validateSaleLotFormBasics({ name: 'João' });
  assert(!noCpf.valid, 'sem cpf bloqueia');
  console.log('OK testSaleFormBlocksMissingNameAndCpf');
}

function testSaleFormBlocksInvalidEmailBeforeContractChecks() {
  const result = validateSaleLotFormSubmission({
    form: {
      ...customerToFormValues(FULL_CUSTOMER),
      email: 'teste@',
    },
    finalValue: 50000,
  });
  assert(!result.valid, 'e-mail inválido bloqueia');
  assert(
    String(result.message || '').toLowerCase().includes('e-mail'),
    'mensagem de e-mail inválido',
  );
  console.log('OK testSaleFormBlocksInvalidEmailBeforeContractChecks');
}

function testSaleFormAllowsMissingEmail() {
  const result = validateSaleLotFormSubmission({
    form: {
      ...customerToFormValues(FULL_CUSTOMER),
      email: '',
    },
    finalValue: 50000,
  });
  assert(result.valid, 'venda sem e-mail permitida');
  console.log('OK testSaleFormAllowsMissingEmail');
}

function testSaleFormBlocksMissingContractFields() {
  const result = validateSaleLotFormSubmission({
    form: {
      name: 'João',
      cpf_cnpj: '12345678901',
      email: '',
      rg: '',
      profession: '',
      civil_state: '',
      address: '',
      city: '',
      state_uf: '',
    },
    finalValue: 50000,
  });
  assert(!result.valid, 'campos de contrato ausentes bloqueiam');
  assert((result.contractValidation?.missingRequired.length || 0) > 0, 'lista campos');
  console.log('OK testSaleFormBlocksMissingContractFields');
}

function main() {
  testEmailFromFormEmptyBecomesNull();
  testEmailClearsOnEditSaleMerge();
  testEmailClearsInBuildCustomerPayload();
  testOptionalEmailValidation();
  testSaleFormBlocksMissingNameAndCpf();
  testSaleFormBlocksInvalidEmailBeforeContractChecks();
  testSaleFormAllowsMissingEmail();
  testSaleFormBlocksMissingContractFields();
  console.log('OK — mandatory-sale-lot-form-tests passed');
}

main();
