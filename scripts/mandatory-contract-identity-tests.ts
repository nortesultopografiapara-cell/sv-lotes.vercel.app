/**
 * Contrato — qualificação com RG, órgão emissor e UF.
 * Executar: npx tsx scripts/mandatory-contract-identity-tests.ts
 */

import { generateContractHTML } from '../lib/contractTemplate';
import {
  formatContractIdentityDocumentPhrase,
  formatContractSpouseQualificationSuffix,
  formatSellerRepresentativeIdentitySuffix,
} from '../lib/contractIdentity';

let pass = 0;
let total = 0;

function assert(name: string, ok: boolean) {
  total++;
  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — ${name}`);
  if (ok) pass++;
}

assert(
  'RG + órgão + UF completos',
  formatContractIdentityDocumentPhrase({
    rg: '3658956',
    rg_issuer: 'PC',
    rg_issuer_state: 'PA',
  }) ===
    'Portador da Cédula de Identidade RG nº 3658956, expedida pela PC/PA',
);

assert(
  'aliases rg_number / issuing_authority / issuing_state',
  formatContractIdentityDocumentPhrase({
    rg_number: '1234567',
    issuing_authority: 'SSP',
    issuing_state: 'SP',
  }) ===
    'Portador da Cédula de Identidade RG nº 1234567, expedida pela SSP/SP',
);

assert(
  'somente RG',
  formatContractIdentityDocumentPhrase({ rg: '999' }) ===
    'Portador da Cédula de Identidade RG nº 999',
);

assert(
  'omite undefined/null',
  formatContractIdentityDocumentPhrase({
    rg: '111',
    rg_issuer: 'undefined',
    rg_issuer_state: null,
  }) === 'Portador da Cédula de Identidade RG nº 111',
);

assert(
  'sem dados retorna vazio',
  formatContractIdentityDocumentPhrase({}) === '',
);

assert(
  'cônjuge com RG emissor',
  formatContractSpouseQualificationSuffix({
    spouse_name: 'Maria Silva',
    spouse_cpf: '111.222.333-44',
    spouse_rg: '7654321',
    spouse_rg_issuer: 'PC',
    spouse_rg_issuer_state: 'PA',
  }).includes(
    'casado(a) com Maria Silva, CPF n° 111.222.333-44, Portador da Cédula de Identidade RG nº 7654321, expedida pela PC/PA',
  ),
);

assert(
  'representante vendedor com RG',
  formatSellerRepresentativeIdentitySuffix({
    representative_rg: '5555555',
    representative_rg_issuer: 'SSP',
    representative_rg_issuer_state: 'PA',
  }).includes('Portador da Cédula de Identidade RG nº 5555555, expedida pela SSP/PA'),
);

const html = generateContractHTML({
  tenant: {
    name: 'Imobiliária Teste LTDA',
    cnpj: '00.000.000/0001-00',
    city: 'Parauapebas',
    state: 'PA',
    address: 'Rua A, 100',
    zip_code: '68515-000',
    legal_representative: 'João Representante',
    representative_cpf: '111.111.111-11',
    representative_rg: '8888888',
    representative_rg_issuer: 'PC',
    representative_rg_issuer_state: 'PA',
  },
  customer: {
    name: 'Cliente Teste',
    document: '222.222.222-22',
    rg: '3658956',
    rg_issuer: 'PC',
    rg_issuer_state: 'PA',
    profession: 'Engenheiro',
    civil_state: 'Casado(a)',
    spouse_name: 'Esposa Teste',
    spouse_cpf: '333.333.333-33',
    spouse_rg: '7777777',
    spouse_rg_issuer: 'SSP',
    spouse_rg_issuer_state: 'PA',
    address: 'Rua B',
    neighborhood: 'Centro',
    city: 'Parauapebas',
    state_uf: 'PA',
    zip_code: '68515-000',
  },
  project: { name: 'LOTEAMENTO TESTE', city: 'Parauapebas', uf: 'PA' },
  block: {
    number: '5',
    block_name: '123',
    area: 240,
    frente: 10,
    fundo: 10,
    'Lado Dir.': 24,
    'Lado Esq.': 24,
  },
  sale: {
    total_value: 50000,
    down_payment: 5000,
    installments_count: 12,
    payment_type: 'Parcelada',
  },
  contractSnapshot: { contract_number: '000000001/2026' },
  contractDate: '2026-05-01',
});

assert(
  'HTML do comprador contém RG + PC/PA',
  html.includes(
    'Portador da Cédula de Identidade RG nº 3658956, expedida pela PC/PA',
  ),
);

assert(
  'HTML contém qualificação do cônjuge',
  html.includes('casado(a) com Esposa Teste') &&
    html.includes('RG nº 7777777, expedida pela SSP/PA'),
);

assert(
  'HTML não contém undefined/null',
  !html.includes('undefined') && !html.includes('null'),
);

assert(
  'HTML antigo não usa "Portador cédula de identidade n°"',
  !html.includes('Portador cédula de identidade n°'),
);

console.log(`\nTotal: ${pass} PASSOU / ${total - pass} FALHOU de ${total}`);
process.exit(pass === total ? 0 : 1);
