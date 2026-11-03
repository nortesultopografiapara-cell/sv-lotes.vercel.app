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
import { captureLfContractSnapshotForSale } from '../lib/lfImoveisContractConfig';
import { LF_CONTRACT_SNAPSHOT_COLUMN } from '../lib/lfImoveisContractSnapshot';

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
assert(
  !htmlEmpty.includes('Será repassado ao primeiro vendedor'),
  'sem narrativa de parceria sem segundo vendedor',
);

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
assert(htmlFull.includes('Será repassado ao primeiro vendedor'), 'narrativa de parceria só com segundo vendedor');
assert(htmlFull.includes('30%') && htmlFull.includes('70%'), 'legado sem config do projeto → fallback 30/70');
assert(!htmlFull.includes('revenueSplit') && !htmlFull.includes('Split de Recebimentos'), 'não cita split financeiro');

const project4060 = {
  ...base.project,
  lf_contract_config_json: {
    participation: { firstVendorPercent: 40, secondVendorPercent: 60 },
  },
};
const html4060 = generateContractHTML({
  tenant: { ...company, contract_second_vendor_json: complete },
  ...base,
  project: project4060,
});
assert(
  html4060.includes('40% do valor e 60% ao segundo vendedor'),
  'empreendimento 40/60 sem snapshot → HTML 40/60',
);
assert(
  !html4060.includes('30% do valor e 70% ao segundo vendedor'),
  'config válida não cai no fallback 30/70',
);

const snap4060 = captureLfContractSnapshotForSale({
  project: project4060,
  company,
});
const htmlFrozen = generateContractHTML({
  tenant: { ...company, contract_second_vendor_json: complete },
  ...base,
  project: {
    ...base.project,
    lf_contract_config_json: {
      participation: { firstVendorPercent: 50, secondVendorPercent: 50 },
    },
  },
  sale: { ...sale, [LF_CONTRACT_SNAPSHOT_COLUMN]: snap4060 },
});
assert(
  htmlFrozen.includes('40% do valor e 60% ao segundo vendedor'),
  'snapshot 40/60 prevalece sobre empreendimento 50/50',
);
assert(
  !htmlFrozen.includes('50% do valor e 50% ao segundo vendedor'),
  'não relê percentuais atuais do empreendimento',
);

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
