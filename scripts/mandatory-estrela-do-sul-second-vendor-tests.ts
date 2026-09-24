/**
 * Segundo vendedor — ESTRELA_DO_SUL usa companies.contract_second_vendor_json.
 * npx tsx scripts/mandatory-estrela-do-sul-second-vendor-tests.ts
 */
import { generateContractHTML } from '../lib/contractTemplate';
import {
  isContractSecondVendorComplete,
  parseContractSecondVendorJson,
} from '../lib/contractSecondVendor';
import { buildEstrelaDoSulEsignVendorPartyInputs } from '../lib/estrelaDoSulContractEsign';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

const complete = {
  name: 'Antonio Ferreira Silva',
  cpf: '71877312215',
  email: 'antonio@estrela.test',
  phone: '94991001122',
};

const company = {
  razao_social: 'L.F. IMOVEIS LTDA',
  cnpj: '47052349000130',
  legal_representative: 'Luzia Felipe',
  representative_cpf: '11144477735',
  contract_model: 'ESTRELA_DO_SUL',
  city: 'Parauapebas',
  state: 'PA',
};

const sale = {
  payment_type: 'Parcelado',
  installments_count: 4,
  total_value: 20000,
  down_payment: 2000,
  sale_date: '2026-02-20',
};

const base = {
  customer: { name: 'Comprador', cpf: '52998224725', document: '52998224725' },
  project: { name: 'Estrela do Sul', city: 'Parauapebas', uf: 'PA' },
  block: { quadra: '01', lot: '01', area: 1000, frente: 20, fundo: 20, 'Lado Dir.': 50, 'Lado Esq.': 50 },
  sale,
};

assert(!isContractSecondVendorComplete(parseContractSecondVendorJson(null)), 'null = ausente');
assert(
  !isContractSecondVendorComplete(parseContractSecondVendorJson({ name: 'Só Nome' })),
  'sem CPF = incompleto',
);
assert(isContractSecondVendorComplete(parseContractSecondVendorJson(complete)), 'nome+CPF = completo');

const htmlEmpty = generateContractHTML({
  tenant: { ...company, contract_second_vendor_json: null },
  ...base,
});
assert(!htmlEmpty.includes('Antonio Ferreira Silva'), 'sem segundo vendedor no HTML');
assert(!htmlEmpty.includes('40%'), 'sem narrativa 40/60 sem segundo vendedor');

const htmlPartial = generateContractHTML({
  tenant: {
    ...company,
    contract_second_vendor_json: { name: 'Antonio Ferreira Silva' },
  },
  ...base,
});
assert(!htmlPartial.includes('Antonio Ferreira Silva'), 'JSON incompleto não entra no contrato');

const htmlFull = generateContractHTML({
  tenant: { ...company, contract_second_vendor_json: complete },
  ...base,
});
assert(htmlFull.includes('Antonio Ferreira Silva'), 'segundo vendedor completo no HTML');
assert(htmlFull.includes('40%'), 'narrativa de parceria só com segundo vendedor');
assert(!htmlFull.includes('revenueSplit') && !htmlFull.includes('Split de Recebimentos'), 'não cita split financeiro');

const vendors = buildEstrelaDoSulEsignVendorPartyInputs({
  company: { ...company, contract_second_vendor_json: complete },
});
assert(vendors.length === 2, 'e-sign cria segundo VENDOR');
assert(
  buildEstrelaDoSulEsignVendorPartyInputs({
    company: { ...company, contract_second_vendor_json: { name: 'X' } },
  }).length === 1,
  'incompleto não cria VENDOR 2',
);

console.log('\nOK mandatory-estrela-do-sul-second-vendor-tests');
