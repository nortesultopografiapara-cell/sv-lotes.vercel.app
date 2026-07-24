/**
 * Cônjuge anuente global — Meneses, Recanto, SV LOTES 2.0.
 * npx tsx scripts/mandatory-global-sale-spouse-contract-models-tests.ts
 */

import { generateContractHTML } from '../lib/contractTemplate';
import {
  resolveSaleSpouseContext,
  hasSaleSpouseData,
} from '../lib/saleSpouseFields';
import {
  shouldCreateSpouseSignatureParty,
  supportsSpouseElectronicSignature,
} from '../lib/saleContractSignaturePartyRules';
import {
  applyElectronicSignatureStampsToContractHtml,
  buildElectronicStampsFromSignatureParties,
} from '../lib/saleContractSignaturePartySlots';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const SPOUSE = {
  has_spouse: true,
  sale_spouse_name: 'Maria Souza Anuente',
  sale_spouse_cpf: '39053344705',
  sale_spouse_nationality: 'Brasileira',
  sale_spouse_marital_status: 'Casada',
  sale_spouse_profession: 'Comerciante',
  sale_spouse_rg: '1234567',
  sale_spouse_rg_issuer: 'SSP/GO',
  sale_spouse_phone: '64999998888',
  sale_spouse_email: 'maria@test.com',
  sale_spouse_address: 'Rua das Flores, 100',
};

const CUSTOMER = {
  name: 'João Comprador',
  document: '11144477735',
  cpf: '11144477735',
  profession: 'Agricultor',
  civil_state: 'Casado',
  address: 'Rua A',
  neighborhood: 'Centro',
  city: 'Rio Verde',
  state: 'GO',
  zip_code: '75900000',
};

const PROJECT = { name: 'Loteamento Teste', city: 'Rio Verde', uf: 'GO' };
const BLOCK = { block_name: '01', number: '02', area: 500 };

function baseSale(extra: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    total_value: 100000,
    down_payment: 10000,
    installments_count: 10,
    installment_value: 9000,
    sale_date: '2026-07-01',
    ...extra,
  };
}

function tenant(model: string) {
  return {
    name: 'Empresa Teste LTDA',
    fantasy_name: 'Empresa Teste',
    cnpj: '12345678000199',
    contract_model: model,
    city: 'Rio Verde',
    state: 'GO',
    address: 'Av Central',
    phone: '6433334444',
    email: 'contato@teste.com',
    legal_representative: 'Rep Legal',
    representative_cpf: '52998224725',
  };
}

function testResolveSaleSpouseContext() {
  const ok = resolveSaleSpouseContext(SPOUSE);
  assert(ok.hasSpouse === true, 'hasSpouse true');
  assert(ok.spouse?.name === 'Maria Souza Anuente', 'nome');
  assert(hasSaleSpouseData(SPOUSE), 'alias hasSaleSpouseData');

  assert(
    !resolveSaleSpouseContext({
      has_spouse: true,
      sale_spouse_name: 'Só Nome',
    }).hasSpouse,
    'sem CPF → false',
  );

  assert(
    !resolveSaleSpouseContext({
      has_spouse: true,
      sale_spouse_cpf: '39053344705',
    }).hasSpouse,
    'sem nome → false',
  );

  assert(
    !resolveSaleSpouseContext({
      ...SPOUSE,
      has_spouse: false,
    }).hasSpouse,
    'checkbox false → false',
  );

  assert(
    !resolveSaleSpouseContext({
      sale_spouse_name: '',
      sale_spouse_cpf: '',
      civil_state: 'Casado',
    }).hasSpouse,
    'casado sem dados de cônjuge → false',
  );

  console.log('OK testResolveSaleSpouseContext');
}

function testMenesesWithSpouse() {
  const html = generateContractHTML({
    tenant: tenant('MENESES'),
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: baseSale(SPOUSE),
  });

  assert(html.includes('CÔNJUGE ANUENTE'), 'qualificação/slot cônjuge');
  assert(html.includes('Maria Souza Anuente') || html.includes('Maria Souza'), 'nome cônjuge');
  assert(html.includes('data-party-role="SPOUSE"'), 'data-party-role SPOUSE');
  assert(html.includes('data-party-role="VENDOR"'), 'data-party-role VENDOR');
  assert(html.includes('data-party-role="BUYER"'), 'data-party-role BUYER');
  assert(html.includes('PROMITENTE VENDEDOR'), 'vendedor');
  assert(html.includes('PROMISSÁRIO COMPRADOR'), 'comprador');
  assert(html.includes('TESTEMUNHA'), 'testemunhas');

  const buyerSlotIdx = html.indexOf('data-party-role="BUYER"');
  const spouseSlotIdx = html.indexOf(
    'class="signature-slot" data-party-role="SPOUSE"',
  );
  const witnessIdx = html.indexOf('TESTEMUNHA 1');
  assert(buyerSlotIdx >= 0 && spouseSlotIdx >= 0, 'slots buyer/spouse');
  assert(spouseSlotIdx > buyerSlotIdx, 'slot cônjuge após comprador');
  assert(witnessIdx > spouseSlotIdx, 'testemunhas após cônjuge');

  console.log('OK testMenesesWithSpouse');
}

function testMenesesWithoutSpouse() {
  const html = generateContractHTML({
    tenant: tenant('MENESES'),
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: baseSale({ has_spouse: false }),
  });

  assert(!html.includes('CÔNJUGE ANUENTE'), 'sem texto cônjuge');
  assert(!html.includes('data-party-role="SPOUSE"'), 'sem slot SPOUSE');
  assert(html.includes('data-party-role="VENDOR"'), 'vendedor ok');
  assert(html.includes('data-party-role="BUYER"'), 'comprador ok');
  assert(html.includes('TESTEMUNHA'), 'testemunhas ok');

  console.log('OK testMenesesWithoutSpouse');
}

function testRecantoWithAndWithoutSpouse() {
  const withSpouse = generateContractHTML({
    tenant: tenant('RECANTO_PRIMAVERA'),
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: baseSale(SPOUSE),
  });
  assert(withSpouse.includes('CÔNJUGE ANUENTE'), 'recanto com cônjuge');
  assert(withSpouse.includes('data-party-role="SPOUSE"'), 'recanto data-role');

  const without = generateContractHTML({
    tenant: tenant('RECANTO_PRIMAVERA'),
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: baseSale({ has_spouse: false }),
  });
  assert(!without.includes('CÔNJUGE ANUENTE'), 'recanto sem cônjuge');
  assert(!without.includes('data-party-role="SPOUSE"'), 'recanto sem slot');

  console.log('OK testRecantoWithAndWithoutSpouse');
}

function testSv2WithAndWithoutSpouse() {
  const withSpouse = generateContractHTML({
    tenant: tenant('SV_LOTES_2'),
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: baseSale(SPOUSE),
  });
  assert(withSpouse.includes('CÔNJUGE ANUENTE'), 'sv2 com cônjuge');
  assert(withSpouse.includes('data-party-role="SPOUSE"'), 'sv2 data-role');

  const without = generateContractHTML({
    tenant: tenant('SV_LOTES_2'),
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: baseSale({}),
  });
  assert(!without.includes('CÔNJUGE ANUENTE'), 'sv2 sem cônjuge');

  console.log('OK testSv2WithAndWithoutSpouse');
}

function testElectronicPartyGateGlobal() {
  for (const model of ['MENESES', 'PADRAO', 'SV_LOTES_2', 'RECANTO_PRIMAVERA']) {
    assert(supportsSpouseElectronicSignature(model), `supports ${model}`);
    assert(
      shouldCreateSpouseSignatureParty({
        contractModel: model,
        sale: SPOUSE,
      }),
      `party ${model}`,
    );
    assert(
      !shouldCreateSpouseSignatureParty({
        contractModel: model,
        sale: { ...SPOUSE, has_spouse: false },
      }),
      `no party ${model} when unchecked`,
    );
  }
  console.log('OK testElectronicPartyGateGlobal');
}

function testStampByDataPartyRoleOnMenesesHtml() {
  const html = generateContractHTML({
    tenant: tenant('MENESES'),
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: baseSale(SPOUSE),
  });

  const stamped = applyElectronicSignatureStampsToContractHtml(
    html,
    buildElectronicStampsFromSignatureParties({
      parties: [
        {
          id: 'v',
          role: 'VENDOR',
          status: 'SIGNED',
          signer_name: 'Rep Legal',
          signed_at: '2026-07-23T12:00:00.000Z',
        },
        {
          id: 'b',
          role: 'BUYER',
          status: 'SIGNED',
          signer_name: 'João Comprador',
          signed_at: '2026-07-23T13:00:00.000Z',
        },
        {
          id: 's',
          role: 'SPOUSE',
          status: 'SIGNED',
          signer_name: 'Maria Souza Anuente',
          signed_at: '2026-07-23T14:00:00.000Z',
        },
      ],
    }),
  );

  assert(
    (stamped.match(/Assinado eletronicamente/g) || []).length === 3,
    '3 selos Meneses',
  );
  console.log('OK testStampByDataPartyRoleOnMenesesHtml');
}

function testPadraoSameAsMeneses() {
  const html = generateContractHTML({
    tenant: tenant('PADRAO'),
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: baseSale(SPOUSE),
  });
  assert(html.includes('data-party-role="SPOUSE"'), 'padrão com SPOUSE');
  console.log('OK testPadraoSameAsMeneses');
}

function main() {
  testResolveSaleSpouseContext();
  testMenesesWithSpouse();
  testMenesesWithoutSpouse();
  testRecantoWithAndWithoutSpouse();
  testSv2WithAndWithoutSpouse();
  testElectronicPartyGateGlobal();
  testStampByDataPartyRoleOnMenesesHtml();
  testPadraoSameAsMeneses();
  console.log('mandatory-global-sale-spouse-contract-models-tests: all passed');
}

main();
