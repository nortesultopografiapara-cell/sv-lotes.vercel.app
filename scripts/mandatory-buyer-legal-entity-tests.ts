/**
 * Comprador pessoa jurídica: PF sem regressão, qualificação, representantes,
 * consulta de CNPJ, devedor financeiro e status de assinatura.
 * Não emite cobrança, não envia documento e não acessa Production.
 * npx tsx scripts/mandatory-buyer-legal-entity-tests.ts
 */

import { generateContractHTML } from '../lib/contractTemplate';
import {
  buildBuyerAddressLine,
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
  buyerProcessEvidenceFromLegalRepresentatives,
  canVendorSignFromParties,
  computeAggregateSaleSignatureStatus,
  countSignedParties,
  type PartyStatusSnapshot,
} from '../lib/saleContractSignaturePartyStatus';
import {
  isVendorWaitingForBuyers,
  type SaleSignaturePartyRole,
} from '../lib/saleContractSignaturePartyTypes';
import { buildElectronicStampsFromSignatureParties } from '../lib/saleContractSignaturePartySlots';
import { buildSaleContractSignatureCertificateHtml } from '../lib/saleContractSignatureCertificateHtml';

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
    assert(text.includes('na qualidade de Sócia administradora'), `${label} função`);
    const repeated = (text.match(/Centro/g) || []).length;
    assert(repeated === 1, `${label} bairro não duplica no endereço`);
    assert(text.includes('Contrato social registrado'), `${label} documento de poderes`);
    assert(text.includes('529.982.247-25'), `${label} CPF do representante`);
  }

  const composed = buildBuyerAddressLine({
    address: 'Rua das Empresas, 10 — Centro',
    address_number: '10',
    address_complement: 'Sala 2',
    neighborhood: 'Centro',
    city: 'Parauapebas',
    state_uf: 'PA',
    zip_code: '68515000',
  });
  assert((composed.match(/\b10\b/g) || []).length === 1, 'número já presente não repete');
  assert((composed.match(/Centro/g) || []).length === 1, 'bairro já presente não repete');
  assert(composed.includes('Sala 2'), 'complemento ausente é acrescentado');
  assert(composed.includes('Parauapebas/PA'), 'cidade e UF entram uma vez');

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

  const released = canVendorSignFromParties([
    buyer,
    vendor,
    party('LEGAL_REPRESENTATIVE', 'SIGNED'),
  ]);
  assert(released.ok, 'vendedor assina depois do representante, sem assinatura do CNPJ');

  const vendorFirst = canVendorSignFromParties([
    party('BUYER', 'PENDING'),
    party('VENDOR', 'PENDING'),
    party('LEGAL_REPRESENTATIVE', 'PENDING'),
  ]);
  assert(!vendorFirst.ok, 'vendedor antes do representante continua bloqueado');

  const pfBlocked = canVendorSignFromParties([
    party('BUYER', 'PENDING'),
    party('VENDOR', 'PENDING'),
  ]);
  assert(!pfBlocked.ok, 'pessoa física continua exigindo a assinatura do comprador');

  const evidence = buyerProcessEvidenceFromLegalRepresentatives([
    {
      role: 'BUYER',
      status: 'PENDING',
      signer_name: 'S.V TOPOGRAFIA E PROJETO LTDA',
      signer_cpf: CNPJ,
    },
    {
      role: 'LEGAL_REPRESENTATIVE',
      status: 'SIGNED',
      signer_name: 'SEVERINO JOSE DE FRANÇA',
      signer_cpf: CPF,
      signed_at: '2026-11-03T18:00:00.000Z',
    },
    { role: 'VENDOR', status: 'PENDING' },
  ]);
  assert(evidence?.signerName === 'S.V TOPOGRAFIA E PROJETO LTDA', 'processo guarda a razão social');
  assert(evidence?.signerDocument === CNPJ, 'processo guarda o CNPJ');
  assert(Boolean(evidence?.signedAt), 'processo recebe a data do representante');
  assert(
    buyerProcessEvidenceFromLegalRepresentatives([
      { role: 'BUYER', status: 'SIGNED', signer_name: 'Fulano', signer_cpf: CPF, signed_at: '2026-11-03T18:00:00.000Z' },
      { role: 'VENDOR', status: 'PENDING' },
    ]) === null,
    'pessoa física não usa a evidência de representante',
  );
  const recovered = buyerProcessEvidenceFromLegalRepresentatives(
    [
      { role: 'BUYER', status: 'PENDING', signer_name: '', signer_cpf: '' },
      {
        role: 'LEGAL_REPRESENTATIVE',
        status: 'SIGNED',
        signer_name: 'SEVERINO JOSE DE FRANÇA',
        signer_cpf: CPF,
        signed_at: '2026-11-03T18:00:00.000Z',
      },
    ],
    {
      signerName: 'S.V TOPOGRAFIA E PROJETO LTDA',
      signerDocument: CNPJ,
    },
  );
  assert(recovered?.signerDocument === CNPJ, 'contrato antigo recupera o CNPJ do cadastro');
  assert(recovered?.signerName.includes('TOPOGRAFIA'), 'contrato antigo recupera a razão social');
  assert(
    buyerProcessEvidenceFromLegalRepresentatives(
      [
        { role: 'BUYER', status: 'PENDING', signer_cpf: CPF },
        {
          role: 'LEGAL_REPRESENTATIVE',
          status: 'SIGNED',
          signer_name: 'SEVERINO',
          signed_at: '2026-11-03T18:00:00.000Z',
        },
      ],
      { signerName: 'EMPRESA', signerDocument: CPF },
    ) === null,
    'CPF do representante não substitui o CNPJ',
  );

  const progress = countSignedParties([
    buyer,
    vendor,
    party('LEGAL_REPRESENTATIVE', 'SIGNED'),
  ]);
  assert(progress.signed === 1 && progress.total === 2, 'contagem ignora a party BUYER da PJ');

  assert(
    !isVendorWaitingForBuyers([
      { role: 'BUYER', status: 'PENDING' },
      { role: 'VENDOR', status: 'PENDING' },
      { role: 'LEGAL_REPRESENTATIVE', status: 'SIGNED' },
    ]),
    'vendedor não espera o CNPJ depois do representante',
  );
  assert(
    isVendorWaitingForBuyers([
      { role: 'BUYER', status: 'PENDING' },
      { role: 'VENDOR', status: 'PENDING' },
      { role: 'LEGAL_REPRESENTATIVE', status: 'PENDING' },
    ]),
    'vendedor espera o representante pendente',
  );
  assert(
    isVendorWaitingForBuyers([
      { role: 'BUYER', status: 'PENDING' },
      { role: 'VENDOR', status: 'PENDING' },
    ]),
    'pessoa física continua aguardando o comprador',
  );

  const stamps = buildElectronicStampsFromSignatureParties({
    parties: [
      { role: 'BUYER', status: 'PENDING', signer_name: 'S.V TOPOGRAFIA E PROJETO LTDA', signer_cpf: CNPJ },
      { role: 'LEGAL_REPRESENTATIVE', status: 'SIGNED', signer_name: 'SEVERINO JOSE DE FRANÇA', signer_cpf: CPF, signed_at: '2026-11-03T18:00:00.000Z' },
      { role: 'VENDOR', status: 'PENDING', signer_name: 'MENESES IMOBILIARIA LTDA' },
    ],
    legacyBuyerSigned: false,
  });
  const buyerStamp = stamps.find((stamp) => stamp.role === 'BUYER');
  const repStamp = stamps.find((stamp) => stamp.dataPartyRole === 'LEGAL_REPRESENTATIVE');
  assert(buyerStamp?.signed !== true, 'não cria carimbo de assinatura na role BUYER');
  assert(repStamp?.signed === true, 'carimba o representante legal');

  const certificate = buildSaleContractSignatureCertificateHtml({
    contractNumber: '000000090/2026',
    projectName: 'CHACARAS E LOTES MARTINI I',
    quadra: '03',
    lote: '32',
    buyerName: 'S.V TOPOGRAFIA E PROJETO LTDA',
    buyerDocument: CNPJ,
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    signedAt: '2026-11-03T18:00:00.000Z',
    companyName: 'MENESES IMOBILIARIA LTDA',
    representativeName: 'Representante da imobiliária',
    representativeCpf: CPF_2,
    vendorSignedAt: '2026-11-03T19:00:00.000Z',
    buyerLegalRepresentativeCards: [
      {
        name: 'SEVERINO JOSE DE FRANÇA',
        cpf: CPF,
        roleTitle: 'Presidente',
        signedAt: '2026-11-03T18:00:00.000Z',
        signatureEventId: 'rep-event',
      },
    ],
  });
  assertIncludes(certificate, 'CNPJ', 'certificado identifica o CNPJ da compradora');
  assertIncludes(certificate, 'COMPRADORA', 'certificado trata a PJ como compradora');
  assertIncludes(certificate, 'REPRESENTANTE LEGAL', 'certificado registra o representante');
  assertIncludes(certificate, 'SEVERINO JOSE DE FRANÇA', 'certificado nomeia o signatário');
  assertIncludes(certificate, 'REPRESENTADA PELO REPRESENTANTE LEGAL', 'certificado não trata o CNPJ como signatário');
  assertIncludes(certificate, 'Presidente', 'certificado mostra a função do representante');
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
