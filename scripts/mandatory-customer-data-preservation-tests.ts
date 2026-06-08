/**
 * Preservação de dados do cliente em venda, edição e contrato.
 * npx tsx scripts/mandatory-customer-data-preservation-tests.ts
 */

import { generateContractHTML } from '../lib/contractTemplate';
import {
  buildCustomerPayload,
  customerPatchFromForm,
  customerToFormValues,
  emptyCustomerFormValues,
  mergeCustomerData,
  mergePreservingCustomerFields,
  type CustomerRecord,
} from '../lib/customerIdentity';

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

function testMergeCustomerDataPriority() {
  const merged = mergeCustomerData(
    { profession: 'Engenheiro Civil', city: 'PARAUAPEBAS' },
    { profession: '', city: 'Outra Cidade' },
    { profession: 'Arquiteto', neighborhood: 'JARDIM' },
  );
  assert(merged.profession === 'Engenheiro Civil', 'customers tem prioridade');
  assert(merged.city === 'PARAUAPEBAS', 'customers vence sale vazio');
  assert(merged.neighborhood === 'JARDIM', 'preenche de camada inferior');
  console.log('OK testMergeCustomerDataPriority');
}

function testMergePreservesExistingOnEmptyIncoming() {
  const existing = { ...FULL_CUSTOMER };
  const patch = customerPatchFromForm({
    ...emptyCustomerFormValues(),
    name: 'JOÃO DA SILVA',
    cpf_cnpj: '12345678901',
  });
  const merged = mergePreservingCustomerFields(existing, patch);
  assert(merged.rg === FULL_CUSTOMER.rg, 'RG preservado');
  assert(merged.profession === FULL_CUSTOMER.profession, 'profissão preservada');
  assert(merged.neighborhood === FULL_CUSTOMER.neighborhood, 'bairro preservado');
  assert(merged.zip_code === FULL_CUSTOMER.zip_code, 'CEP preservado');
  console.log('OK testMergePreservesExistingOnEmptyIncoming');
}

function testBuildCustomerPayloadPreservesExisting() {
  const form = {
    ...customerToFormValues(FULL_CUSTOMER),
    rg: '',
    profession: '',
    neighborhood: '',
    city: '',
    zip_code: '',
    civil_state: '',
  };
  const payload = buildCustomerPayload(
    form,
    { tenantId: 't1', projectId: 'p1' },
    FULL_CUSTOMER,
  );
  assert(payload.rg === FULL_CUSTOMER.rg, 'payload mantém RG');
  assert(payload.profession === FULL_CUSTOMER.profession, 'payload mantém profissão');
  assert(payload.neighborhood === FULL_CUSTOMER.neighborhood, 'payload mantém bairro');
  assert(payload.city === FULL_CUSTOMER.city, 'payload mantém cidade');
  assert(payload.zip_code === FULL_CUSTOMER.zip_code, 'payload mantém CEP');
  console.log('OK testBuildCustomerPayloadPreservesExisting');
}

function testSaleFormOverlayDoesNotWipeDbCustomer() {
  const dbCustomer = { ...FULL_CUSTOMER };
  const incompleteForm = {
    name: 'JOÃO DA SILVA',
    cpf_cnpj: '12345678901',
    rg: '',
    profession: '',
    civil_state: '',
    neighborhood: '',
    city: '',
    state_uf: '',
    zip_code: '',
  };
  const forContract = mergeCustomerData(dbCustomer, incompleteForm);
  assert(
    forContract.profession === 'Engenheiro Civil',
    `profissão no contrato: ${forContract.profession}`,
  );
  assert(forContract.neighborhood === 'CENTRO', 'bairro no contrato');
  assert(forContract.city === 'PARAUAPEBAS', 'cidade no contrato');
  assert(forContract.zip_code === '68515-000', 'CEP no contrato');
  console.log('OK testSaleFormOverlayDoesNotWipeDbCustomer');
}

function testContractHtmlWithFullCustomer() {
  const html = generateContractHTML({
    tenant: {
      name: 'Meneses Imobiliária LTDA',
      cnpj: '00.000.000/0001-00',
      city: 'Parauapebas',
      state: 'PA',
      address: 'Rua X',
      zip_code: '68515-000',
    },
    customer: mergeCustomerData(FULL_CUSTOMER),
    project: { name: 'LOTEAMENTO TESTE', city: 'Parauapebas', uf: 'PA' },
    block: {
      number: '5',
      block_name: '123',
      area: 240,
      frente: 10,
    },
    sale: {
      total_value: 80000,
      down_payment: 10000,
      installments_count: 12,
      payment_type: 'Parcelada',
    },
    contractSnapshot: { contract_number: '000000003/2026' },
    contractDate: '2026-06-01',
  });

  const forbidden = [
    'profissão não informada',
    'estado civil não informado',
    'bairro não informado',
    'cidade não informada',
    'cep não informado',
  ];
  for (const token of forbidden) {
    assert(
      !html.toLowerCase().includes(token),
      `HTML não deve conter "${token}"`,
    );
  }
  assert(html.includes('Engenheiro Civil'), 'HTML contém profissão');
  assert(html.includes('Centro') || html.includes('CENTRO'), 'HTML contém bairro');
  assert(html.includes('Parauapebas') || html.includes('PARAUAPEBAS'), 'HTML cidade');
  assert(html.includes('68515-000'), 'HTML CEP');
  assert(
    html.includes('RG nº 3658956'),
    'HTML contém RG',
  );
  console.log('OK testContractHtmlWithFullCustomer');
}

function testEditSalePatchPreservesFields() {
  const before = { ...FULL_CUSTOMER };
  const editPayload = customerPatchFromForm({
    ...customerToFormValues(FULL_CUSTOMER),
    profession: '',
    civil_state: '',
    neighborhood: '',
    city: '',
    zip_code: '',
    rg: '',
  });
  const after = mergePreservingCustomerFields(before, editPayload);
  assert(after.rg === FULL_CUSTOMER.rg, 'edit sale RG');
  assert(after.profession === FULL_CUSTOMER.profession, 'edit sale profissão');
  assert(after.civil_state === FULL_CUSTOMER.civil_state, 'edit sale estado civil');
  assert(after.neighborhood === FULL_CUSTOMER.neighborhood, 'edit sale bairro');
  assert(after.city === FULL_CUSTOMER.city, 'edit sale cidade');
  assert(after.zip_code === FULL_CUSTOMER.zip_code, 'edit sale CEP');
  console.log('OK testEditSalePatchPreservesFields');
}

function testRegenerateMergeFromLayers() {
  const wipedDb = {
    id: 'cust-1',
    name: 'JOÃO DA SILVA',
    cpf_cnpj: '12345678901',
    profession: null,
    city: null,
    neighborhood: null,
    zip_code: null,
    civil_state: null,
  };
  const clientBackup = {
    profession: 'Engenheiro Civil',
    civil_state: 'Casado(a)',
    neighborhood: 'CENTRO',
    city: 'PARAUAPEBAS',
    zip_code: '68515-000',
    rg: '3658956',
    rg_issuer: 'PC',
    rg_issuer_state: 'PA',
  };
  const merged = mergeCustomerData(wipedDb, clientBackup);
  assert(merged.profession === 'Engenheiro Civil', 'regen profissão');
  assert(merged.neighborhood === 'CENTRO', 'regen bairro');
  assert(merged.city === 'PARAUAPEBAS', 'regen cidade');
  assert(merged.zip_code === '68515-000', 'regen CEP');
  console.log('OK testRegenerateMergeFromLayers');
}

testMergeCustomerDataPriority();
testMergePreservesExistingOnEmptyIncoming();
testBuildCustomerPayloadPreservesExisting();
testSaleFormOverlayDoesNotWipeDbCustomer();
testContractHtmlWithFullCustomer();
testEditSalePatchPreservesFields();
testRegenerateMergeFromLayers();
console.log('mandatory-customer-data-preservation-tests: all passed');
