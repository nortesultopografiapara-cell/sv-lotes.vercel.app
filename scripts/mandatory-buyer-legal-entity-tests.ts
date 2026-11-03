/**
 * Comprador pessoa jurídica: PF sem regressão, qualificação, representantes,
 * consulta de CNPJ, devedor financeiro e status de assinatura.
 * Não emite cobrança, não envia documento e não acessa Production.
 * npx tsx scripts/mandatory-buyer-legal-entity-tests.ts
 */

import { generateContractHTML } from '../lib/contractTemplate';
import {
  buildBuyerLegalEntityView,
  buyerSnapshotFromForm,
  isBuyerLegalEntity,
  isValidCpfCheckDigits,
  representativesDesignatedToSign,
  resolveBuyerPersonType,
  resolveChargePayer,
  validateBuyerRepresentatives,
  type BuyerRepresentativeInput,
} from '../lib/buyerLegalEntity';
import { lookupCustomerCnpjFromBackend } from '../lib/cnpjLookup';
import { buildCustomerPayload, emptyCustomerFormValues } from '../lib/customerIdentity';
import { validateCustomerForContract } from '../lib/validateCustomerForContract';
import {
  canVendorSignFromParties,
  computeAggregateSaleSignatureStatus,
  type PartyStatusSnapshot,
} from '../lib/saleContractSignaturePartyStatus';
import type { SaleSignaturePartyRole } from '../lib/saleContractSignaturePartyTypes';

const CNPJ = '11222333000181';
const CPF = '52998224725';
const CPF_2 = '39053344705';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertIncludes(html: string, needle: string, msg: string) {
  if (!html.includes(needle)) throw new Error(`${msg}: faltou "${needle}"`);
}

function assertNotIncludes(html: string, needle: string, msg: string) {
  if (html.includes(needle)) throw new Error(`${msg}: não deveria conter "${needle}"`);
}

const rep = (overrides: Partial<BuyerRepresentativeInput> = {}): BuyerRepresentativeInput => ({
  full_name: 'Ana Representante',
  cpf: CPF,
  rg: '1234567',
  rg_issuer: 'SSP',
  rg_issuer_state: 'PA',
  nationality: 'Brasileira',
  marital_status: 'Solteira',
  profession: 'Administradora',
  role_title: 'Sócia administradora',
  phone: '94999990000',
  email: 'ana@example.test',
  representation_document: 'Contrato social registrado',
  signs: true,
  ...overrides,
});

const pfCustomer = {
  name: 'João Comprador',
  document: CPF,
  cpf_cnpj: CPF,
  rg: '1234567',
  profession: 'Engenheiro',
  civil_state: 'Casado(a)',
  phone: '94988887777',
  email: 'joao@example.test',
  address: 'Rua B, 200',
  neighborhood: 'Centro',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
};

function pjCustomer(name: string, mode: 'INDIVIDUAL' | 'JOINT' = 'INDIVIDUAL', reps = [rep()]) {
  return {
    name,
    document: CNPJ,
    cpf_cnpj: CNPJ,
    address: 'Rua das Empresas, 10',
    neighborhood: 'Centro',
    city: 'Parauapebas',
    state: 'PA',
    zip_code: '68515000',
    buyer_signature_mode: mode,
    legal_representatives: reps,
  };
}

const project = {
  name: 'Residencial Horizonte',
  city: 'Parauapebas',
  uf: 'PA',
  seller_parties_json: [
    { name: 'VENDEDOR UM', cpf: CPF },
    { name: 'VENDEDOR DOIS', cpf: CPF_2 },
  ],
};
const block = { quadra: '05', lot: '12', area: 300, frente: 12, fundo: 25 };
const sale = {
  payment_type: 'Parcelado',
  installments_count: 12,
  total_value: 120000,
  down_payment: 10000,
  created_at: '2026-06-08',
};

function htmlFor(model: string, customer: Record<string, unknown>) {
  return generateContractHTML({
    tenant: {
      name: 'LOTEAMENTO EXEMPLO LTDA',
      razao_social: 'LOTEAMENTO EXEMPLO LTDA',
      cnpj: '12631238000102',
      legal_representative: 'Maria Empresária',
      representative_cpf: CPF,
      address: 'Av. Principal, 100',
      city: 'Parauapebas',
      state: 'PA',
      zip_code: '68515000',
      contract_model: model,
    },
    customer,
    project,
    block,
    sale,
    contractDate: '2026-06-08',
  });
}

function testPersonTypeAndPfRegression() {
  assert(resolveBuyerPersonType(CPF) === 'PF', '11 dígitos é PF');
  assert(resolveBuyerPersonType(CNPJ) === 'PJ', '14 dígitos é PJ');
  assert(!isBuyerLegalEntity(pfCustomer), 'PF não é PJ');
  assert(isValidCpfCheckDigits(CPF), 'CPF de teste válido');
  const html = htmlFor('PADRAO', pfCustomer);
  assertIncludes(html, 'João Comprador', 'nome PF');
  assertIncludes(html, 'Engenheiro', 'profissão PF');
  assertNotIncludes(html, 'COMPRADORA', 'PF não usa qualificação de PJ');
  assertNotIncludes(html, 'REPRESENTANTE LEGAL', 'PF não cria signatário de representante');
  const validation = validateCustomerForContract({ ...pfCustomer, rg: '' });
  assert(validation.missingRequired.includes('RG'), 'PF continua exigindo RG');
  console.log('OK testPersonTypeAndPfRegression');
}

function testLegalEntityQualification() {
  const ltda = pjCustomer('HORIZONTE EMPREENDIMENTOS LTDA');
  const church = pjCustomer('IGREJA EVANGELICA TESTE');
  const association = pjCustomer('ASSOCIACAO DOS MORADORES TESTE');
  for (const [label, customer] of [
    ['LTDA', ltda],
    ['igreja', church],
    ['associacao', association],
  ] as const) {
    const view = buildBuyerLegalEntityView(customer);
    const text = view?.qualificationText || '';
    assert(text.includes('pessoa jurídica de direito privado'), `${label} natureza`);
    assert(text.includes(customer.name), `${label} razão social`);
    assert(text.includes('11.222.333/0001-81'), `${label} CNPJ`);
    assert(text.includes('Ana Representante'), `${label} representante`);
    assert(text.includes('Contrato social registrado'), `${label} documento de poderes`);
    assert(text.includes('529.982.247-25'), `${label} CPF do representante`);
  }

  const models = ['PADRAO', 'MENESES', 'RECANTO_PRIMAVERA', 'SV_LOTES_2', 'ARAGUAIA', 'MUNDO_NOVO', 'CUSTOM'];
  for (const model of models) {
    const html = htmlFor(model, ltda);
    assertIncludes(html, 'HORIZONTE EMPREENDIMENTOS LTDA', `${model} razão social`);
    assertIncludes(html, '11.222.333/0001-81', `${model} CNPJ`);
    assertIncludes(html, 'Ana Representante', `${model} representante`);
    assertIncludes(html, 'pessoa jurídica de direito privado', `${model} qualificação`);
    assertNotIncludes(html, 'Engenheiro', `${model} não qualifica PJ como PF`);
  }

  const pfAraguaia = htmlFor('ARAGUAIA', pfCustomer);
  const pfMundo = htmlFor('MUNDO_NOVO', pfCustomer);
  assertIncludes(pfAraguaia, 'João Comprador', 'ARAGUAIA PF');
  assertIncludes(pfMundo, 'João Comprador', 'MUNDO_NOVO PF');
  assertNotIncludes(pfAraguaia, 'COMPRADORA', 'ARAGUAIA PF sem rótulo PJ');
  assertNotIncludes(pfMundo, 'COMPRADORA', 'MUNDO_NOVO PF sem rótulo PJ');
  assertIncludes(pfMundo, 'VENDEDOR UM', 'MUNDO_NOVO preserva vendedor');
  console.log('OK testLegalEntityQualification');
}

function testRepresentatives() {
  const second = rep({
    full_name: 'Bruno Representante',
    cpf: CPF_2,
    signs: true,
  });
  const individual = representativesDesignatedToSign(
    [rep({ signs: true }), { ...second, signs: false }],
    'INDIVIDUAL',
  );
  assert(individual.length === 1, 'assinatura individual usa o representante marcado');

  const joint = representativesDesignatedToSign(
    [rep({ signs: false }), { ...second, signs: false }],
    'JOINT',
  );
  assert(joint.length === 2, 'assinatura conjunta usa todos os representantes');
  const jointView = buildBuyerLegalEntityView(pjCustomer('EMPRESA CONJUNTA LTDA', 'JOINT', [rep(), second]));
  assert(
    Boolean(jointView?.qualificationText.includes('conjuntamente')),
    'texto de assinatura conjunta',
  );

  const invalid = validateBuyerRepresentatives([rep({ cpf: '11111111111' })], 'INDIVIDUAL');
  assert(!invalid.ok, 'CPF inválido do representante é recusado');

  const missingSigner = validateBuyerRepresentatives(
    [rep({ signs: false }), { ...second, signs: false }],
    'INDIVIDUAL',
  );
  assert(!missingSigner.ok, 'individual sem representante marcado é recusado');

  const pfSnap = buyerSnapshotFromForm({ cpf_cnpj: CPF });
  assert(pfSnap.buyer_person_type === 'PF', 'snapshot PF');
  assert(pfSnap.buyer_representatives_json == null, 'PF não grava representantes na venda');
  const pjSnap = buyerSnapshotFromForm({
    cpf_cnpj: CNPJ,
    buyer_signature_mode: 'JOINT',
    legal_representatives: [rep(), second],
  });
  assert(pjSnap.buyer_person_type === 'PJ', 'snapshot PJ');
  assert(Array.isArray(pjSnap.buyer_representatives_json), 'snapshot guarda representantes');
  console.log('OK testRepresentatives');
}

async function testCnpjLookup() {
  const invalid = await lookupCustomerCnpjFromBackend('11222333000100', async () => {
    throw new Error('não deveria consultar CNPJ inválido');
  });
  assert(!invalid.ok && invalid.reason === 'invalid', 'CNPJ com dígito inválido não consulta');

  const cpf = await lookupCustomerCnpjFromBackend(CPF, async () => {
    throw new Error('não deveria consultar CPF');
  });
  assert(!cpf.ok && cpf.reason === 'not_cnpj', 'CPF não dispara consulta de CNPJ');

  const found = await lookupCustomerCnpjFromBackend(CNPJ, async () =>
    new Response(
      JSON.stringify({
        name: 'IGREJA TESTE',
        fantasy_name: 'IGREJA',
        address: 'Rua A',
        city: 'Parauapebas',
        state: 'PA',
        zip_code: '68515000',
        neighborhood: 'Centro',
        address_number: '10',
        registration_status: 'ATIVA',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );
  assert(found.ok, 'consulta válida preenche dados');
  if (found.ok) {
    assert(found.fields.name === 'IGREJA TESTE', 'razão social da consulta');
    assert(found.fields.trade_name === 'IGREJA', 'nome fantasia');
    assert(!('legal_representatives' in found.fields), 'consulta não inventa poderes');
  }

  const missing = await lookupCustomerCnpjFromBackend(CNPJ, async () => new Response('', { status: 404 }));
  assert(!missing.ok && missing.reason === 'not_found', 'CNPJ não encontrado permite preenchimento manual');
  console.log('OK testCnpjLookup');
}

function testChargePayerAndTenant() {
  const payer = resolveChargePayer({
    name: 'HORIZONTE EMPREENDIMENTOS LTDA',
    cpf_cnpj: CNPJ,
    representative_cpf: CPF,
    legal_representatives_json: [rep()],
  });
  assert(payer.documentDigits === CNPJ, 'devedor permanece com o CNPJ');
  assert(payer.name.includes('HORIZONTE'), 'devedor permanece com a razão social');
  assert(payer.documentDigits !== CPF, 'CPF do representante não substitui o CNPJ');

  const companyA = buildCustomerPayload(
    {
      ...emptyCustomerFormValues(),
      ...pjCustomer('EMPRESA A'),
      name: 'EMPRESA A',
      cpf_cnpj: CNPJ,
    },
    { tenantId: 'tenant-a', projectId: 'project-a' },
  );
  const companyB = buildCustomerPayload(
    {
      ...emptyCustomerFormValues(),
      ...pjCustomer('EMPRESA B'),
      name: 'EMPRESA B',
      cpf_cnpj: CNPJ,
    },
    { tenantId: 'tenant-b', projectId: 'project-b' },
  );
  assert(companyA.company_id === 'tenant-a', 'cliente isolado na empresa A');
  assert(companyB.company_id === 'tenant-b', 'cliente isolado na empresa B');
  assert(companyA.company_id !== companyB.company_id, 'empresas não compartilham o cadastro');
  console.log('OK testChargePayerAndTenant');
}

function party(role: SaleSignaturePartyRole, status: string): PartyStatusSnapshot {
  return { role, status };
}

function testSignatureAggregate() {
  const vendor = party('VENDOR', 'PENDING');
  const buyer = party('BUYER', 'PENDING');
  const one = computeAggregateSaleSignatureStatus([
    buyer,
    vendor,
    party('LEGAL_REPRESENTATIVE', 'SIGNED'),
  ]);
  assert(one === 'CLIENT_SIGNED', 'representante único assinado libera o vendedor');

  const partial = computeAggregateSaleSignatureStatus([
    buyer,
    vendor,
    party('LEGAL_REPRESENTATIVE', 'SIGNED'),
    party('LEGAL_REPRESENTATIVE', 'PENDING'),
  ]);
  assert(partial === 'PARTIALLY_SIGNED', 'assinatura conjunta incompleta');

  const joint = computeAggregateSaleSignatureStatus([
    buyer,
    vendor,
    party('LEGAL_REPRESENTATIVE', 'SIGNED'),
    party('LEGAL_REPRESENTATIVE', 'SIGNED'),
  ]);
  assert(joint === 'CLIENT_SIGNED', 'assinatura conjunta completa');

  const pf = computeAggregateSaleSignatureStatus([
    party('BUYER', 'SIGNED'),
    vendor,
  ]);
  assert(pf === 'CLIENT_SIGNED', 'PF continua pelo comprador');

  const blocked = canVendorSignFromParties([
    buyer,
    vendor,
    party('LEGAL_REPRESENTATIVE', 'PENDING'),
  ]);
  assert(!blocked.ok, 'vendedor espera o representante');
  console.log('OK testSignatureAggregate');
}

async function main() {
  testPersonTypeAndPfRegression();
  testLegalEntityQualification();
  testRepresentatives();
  await testCnpjLookup();
  testChargePayerAndTenant();
  testSignatureAggregate();
  console.log('OK buyer legal entity');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
