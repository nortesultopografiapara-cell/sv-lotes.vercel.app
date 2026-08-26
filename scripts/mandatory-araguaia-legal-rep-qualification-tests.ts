/**
 * Qualificação individual dos vendedores ARAGUAIA (Representante Legal + 2º Promitente).
 * npx tsx scripts/mandatory-araguaia-legal-rep-qualification-tests.ts
 *
 * Fixtures deliberadamente diferentes de ARAGUAIA_DEFAULT_SELLERS
 * (não usar "produtor rural" nem a sede Cidade Jardim como residência).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateContractHTML } from '../lib/contractTemplate';
import { generateAraguaiaContract } from '../lib/araguaiaContractTemplate';
import { buildAraguaiaContractContext } from '../lib/araguaiaContractContext';
import { buildAraguaiaPartiesPreambleHtml } from '../lib/araguaiaContractClauses';
import {
  resolveAraguaiaPromitenteVendors,
  resolveCompanyContractVendors,
} from '../lib/araguaiaCompanyLegalRepresentative';
import { buildCompanySettingsSavePayload } from '../lib/companySettingsFields';
import {
  buildPromissoryNoteDraft,
  resolvePromissoryNoteVendors,
} from '../lib/araguaiaPromissoryNote';
import { ARAGUAIA_DEFAULT_SELLERS } from '../lib/projectContractSellers';

function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  console.log(`  OK ${msg}`);
}

const PROJECT = {
  name: 'Chacreamento Araguaia',
  city: 'Parauapebas',
  uf: 'PA',
  contract_model: 'ARAGUAIA',
};

const CUSTOMER = {
  name: 'Cliente Teste Araguaia',
  cpf_cnpj: '11144477735',
  rg: '1234567',
  rg_issuer: 'PC',
  rg_issuer_state: 'PA',
  nationality: 'Brasileira',
  civil_state: 'Solteiro',
  profession: 'Comerciante',
  email: 'cliente@teste.com',
  phone: '(94) 99999-1234',
  address: 'Rua A, 10',
  neighborhood: 'Centro',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
};

const BLOCK = {
  id: 'block-araguaia-1',
  number: '12',
  block_name: '01',
  area: 1250.5,
  frente: 25,
  fundo: 25,
  'Lado Dir.': 50,
  'Lado Esq.': 50,
  segments_json: [
    { segment_index: 0, official_side: 'frente', distance: 25, confrontant: 'Rua Principal' },
    { segment_index: 1, official_side: 'lado_direito', distance: 50, confrontant: 'Chácara 13' },
    { segment_index: 2, official_side: 'fundo', distance: 25, confrontant: 'Área verde' },
    { segment_index: 3, official_side: 'lado_esquerdo', distance: 50, confrontant: 'Chácara 11' },
  ],
};

const SALE = {
  total_value: 80000,
  down_payment: 10000,
  installments_count: 24,
  installment_value: 2916.67,
  payment_type: 'Parcelado',
  installment_correction_type: 'IGPM',
  sale_date: '2026-08-20',
  brokers: { name: 'Corretor Exemplo', cpf: '12345678909' },
};

const RECEIPTS = [
  { installment_number: 0, amount: 10000, due_date: '2026-08-20' },
  { installment_number: 1, amount: 2916.67, due_date: '2026-09-20' },
];

const SEAT = 'Avenida da Sede Jurídica Fixture, Quadra 1, Lote 1, Cidade Jardim, Parauapebas, PA';
const V1_ADDR = 'Rua das Castanheiras Fixture, 88, Jardim Homologação, Canaã dos Carajás, PA';
const V2_ADDR = 'Travessa do Igarapé Fixture, 15, Vila Homologação, Marabá, PA';
const SAME_ADDR = 'Rua Homologação Igual Fixture, 10, Bairro Teste, Parauapebas, PA';
const V1_PROFESSION = 'consultor pecuário de homologação';
const V2_PROFESSION = 'analista cartográfica de homologação';
const ROLE = 'Sócio-Administrador';

const secondVendor = {
  name: 'Vendedora Fixture Dois',
  cpf: '529.982.247-25',
  rg: '7654321',
  rgIssuer: 'SSP',
  rgUf: 'PA',
  nationality: 'brasileira',
  maritalStatus: 'casada',
  profession: V2_PROFESSION,
  email: '',
  phone: '94992220002',
  address: V2_ADDR,
};

function configuredCompany(extra: Record<string, unknown> = {}) {
  return {
    contract_model: 'ARAGUAIA',
    razao_social: 'R R NEGÓCIOS & SERVIÇOS LTDA',
    name: 'R R NEGÓCIOS & SERVIÇOS LTDA',
    cnpj: '57590706000178',
    address: SEAT,
    neighborhood: 'Cidade Jardim',
    city: 'Parauapebas',
    state: 'PA',
    legal_representative: 'Vendedor Fixture Um',
    representative_cpf: '390.533.447-05',
    legal_representative_role: ROLE,
    legal_representative_email: 'fixture.um@example.com',
    legal_representative_phone: '94991110001',
    contract_legal_nationality: 'brasileiro',
    contract_legal_marital_status: 'casado',
    contract_legal_profession: V1_PROFESSION,
    contract_legal_rg: '9988776',
    contract_legal_rg_issuer: 'SSP',
    contract_legal_rg_uf: 'PA',
    legal_representative_address: V1_ADDR,
    contract_legal_address: SEAT,
    contract_second_vendor_json: secondVendor,
    ...extra,
  };
}

function preambleOf(html: string): string {
  const idx = html.indexOf('CLÁUSULA PRIMEIRA');
  return idx >= 0 ? html.slice(0, idx) : html;
}

function buyerPhrase(html: string): string {
  const pre = preambleOf(html);
  const marker = 'de outro lado ';
  const start = pre.lastIndexOf(marker);
  const end = pre.indexOf(', doravante denominado(s) <strong>PROMITENTE(S) COMPRADOR');
  return start >= 0 && end > start ? pre.slice(start + marker.length, end) : '';
}

function sellerSlices(html: string): { first: string; second: string } {
  const pre = preambleOf(html);
  const start = pre.indexOf('de um lado ');
  const end = pre.indexOf(', neste ato representado');
  const chunk = start >= 0 && end > start ? pre.slice(start + 'de um lado '.length, end) : pre;
  const splitAt = chunk.indexOf(' e <strong>');
  if (splitAt < 0) return { first: chunk, second: '' };
  return { first: chunk.slice(0, splitAt), second: chunk.slice(splitAt) };
}

function generate(tenant: Record<string, unknown>, esignV2: boolean): string {
  return generateAraguaiaContract({
    tenant,
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: SALE,
    financeReceipts: RECEIPTS,
    esignV2,
  });
}

function ctx(tenant: Record<string, unknown>, esignV2: boolean) {
  return buildAraguaiaContractContext({
    tenant,
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: SALE,
    financeReceipts: RECEIPTS,
    esignV2,
  });
}

console.log('\n======== QUALIFICAÇÃO VENDEDORES ARAGUAIA ========');

console.log('\n=== 1) Daniel/V1 com qualificação completa ===');
{
  const html = generate(configuredCompany(), true);
  const pre = preambleOf(html);
  ok(/VENDEDOR FIXTURE UM/.test(pre), '1: nome V1 da configuração');
  ok(/Brasileiro\(a\)/.test(pre), '1: nacionalidade normalizada');
  ok(/Casado\(a\)/.test(pre), '1: estado civil normalizado');
  ok(pre.includes(V1_PROFESSION), '1: profissão da configuração');
  ok(/390\.533\.447-05/.test(pre), '1: CPF V1');
  ok(/RG nº <strong>9988776-SSP\/PA/.test(pre), '1: RG + órgão + UF');
  ok(pre.includes(V1_ADDR), '1: endereço próprio V1');
  ok(!/produtor rural/i.test(pre), '1: não usa default produtor rural');
  ok(!/Daniel Roberto Rivelino/i.test(pre), '1: não usa default Daniel');
}

console.log('\n=== 2) Profissão vazia omitida ===');
{
  const html = generate(
    configuredCompany({ contract_legal_profession: '' }),
    true,
  );
  const { first } = sellerSlices(html);
  ok(!first.includes(V1_PROFESSION), '2: profissão omitida');
  ok(/VENDEDOR FIXTURE UM<\/strong>, Brasileiro\(a\), Casado\(a\), inscrito\(a\) no CPF/i.test(first), '2: gramática sem profissão');
}

console.log('\n=== 3) RG / órgão / UF ===');
{
  const vendors = resolveCompanyContractVendors({
    company: configuredCompany(),
  });
  ok(vendors.vendor1?.rg === '9988776-SSP/PA', '3: RG composto');
  const html = generate(configuredCompany(), true);
  ok(!html.includes('RG nº RG nº'), '3: sem RG duplicado');
}

console.log('\n=== 4) Endereço próprio do V1 ===');
{
  const built = ctx(configuredCompany(), true);
  ok(built.sellers[0].address === V1_ADDR, '4: ctx V1 = residência pessoal');
  ok(built.intervenienteAddress.includes('Sede Jurídica Fixture'), '4: sede permanece na empresa');
  ok(!String(built.sellers[0].address || '').includes('Sede Jurídica'), '4: residência ≠ sede');
}

console.log('\n=== 5-6) Aldenise/V2 qualificação e endereço próprios ===');
{
  const html = generate(configuredCompany(), true);
  const { second } = sellerSlices(html);
  ok(/VENDEDORA FIXTURE DOIS/.test(second), '5: nome V2');
  ok(second.includes(V2_PROFESSION), '5: profissão V2');
  ok(/529\.982\.247-25/.test(second), '5: CPF V2');
  ok(/7654321-SSP\/PA/.test(second), '5: RG V2');
  ok(second.includes(V2_ADDR), '6: endereço próprio V2');
  ok(!second.includes(V1_ADDR), '6: V2 não copia V1');
  ok(!/Aldenise Alves Sousa/i.test(html), '5: não usa default Aldenise');
  ok(!/funcionária pública municipal/i.test(html), '5: não usa profissão default');
}

console.log('\n=== 7) Mesmo endereço — duas vezes, sem ambos residentes ===');
{
  const company = configuredCompany({
    legal_representative_address: SAME_ADDR,
    contract_second_vendor_json: { ...secondVendor, address: SAME_ADDR },
  });
  const html = generate(company, true);
  const pre = preambleOf(html);
  const { first, second } = sellerSlices(html);
  ok((pre.match(/Rua Homologação Igual Fixture/g) || []).length >= 2, '7: endereço duas vezes');
  ok(first.includes(SAME_ADDR), '7: no V1');
  ok(second.includes(SAME_ADDR), '7: no V2');
  ok(!/ambos residentes e domiciliados/i.test(pre), '7: sem expressão conjunta');
}

console.log('\n=== 8) Endereços diferentes permanecem com cada pessoa ===');
{
  const { first, second } = sellerSlices(generate(configuredCompany(), true));
  ok(first.includes(V1_ADDR) && !first.includes(V2_ADDR), '8: V1 só o próprio');
  ok(second.includes(V2_ADDR) && !second.includes(V1_ADDR), '8: V2 só o próprio');
}

console.log('\n=== 9) Endereço do V1 vazio não copia V2 nem sede ===');
{
  const company = configuredCompany({ legal_representative_address: '' });
  const built = ctx(company, true);
  ok(!built.sellers[0].address, '9: V1 sem endereço');
  ok(built.sellers[1].address === V2_ADDR, '9: V2 intacto');
  const { first } = sellerSlices(generate(company, true));
  ok(!/residente e domiciliado\(a\)/.test(first), '9: omite residência do V1');
  ok(!first.includes(V2_ADDR), '9: não copia Aldenise');
  ok(!first.includes('Sede Jurídica Fixture'), '9: não copia sede');
}

console.log('\n=== 10) Endereço do V2 vazio não copia V1 nem sede ===');
{
  const company = configuredCompany({
    contract_second_vendor_json: { ...secondVendor, address: '' },
  });
  const built = ctx(company, true);
  ok(built.sellers[0].address === V1_ADDR, '10: V1 intacto');
  ok(!built.sellers[1].address, '10: V2 sem endereço');
  const { second } = sellerSlices(generate(company, true));
  ok(!/residente e domiciliado\(a\)/.test(second), '10: omite residência do V2');
  ok(!second.includes(V1_ADDR), '10: não copia Daniel');
  ok(!second.includes('Sede Jurídica Fixture'), '10: não copia sede');
}

console.log('\n=== 11) Cargo preenchido e profissão vazia ===');
{
  const company = configuredCompany({ contract_legal_profession: '' });
  const html = generate(company, true);
  const pre = preambleOf(html);
  ok(!/Sócio-Administrador/i.test(pre), '11: cargo não aparece como profissão');
  ok(resolveCompanyContractVendors({ company }).vendor1?.profession == null, '11: profession null');
}

console.log('\n=== 12-14) V1 e V2 consomem contract_second_vendor_json ===');
{
  const company = configuredCompany();
  const v1 = resolveAraguaiaPromitenteVendors({
    company,
    project: {
      seller_parties_json: [
        { name: 'Override Projeto Um', cpf: '111.444.777-35', order: 1 },
      ],
    },
    contractModel: 'ARAGUAIA',
    mode: 'legacy',
  });
  ok(v1.length === 2, '12: V1 legacy com 2 vendedores da config');
  ok(v1[0].name === 'Vendedor Fixture Um', '12: V1 usa Representante Legal');
  ok(v1[1].name === 'Vendedora Fixture Dois', '14: V1 usa segundo promitente');

  const v2 = resolveAraguaiaPromitenteVendors({
    company,
    project: {
      seller_parties_json: [
        { name: 'Override Projeto Um', cpf: '111.444.777-35', order: 1 },
      ],
    },
    contractModel: 'ARAGUAIA',
    mode: 'v2',
  });
  ok(v2.length === 2 && v2[1].name === 'Vendedora Fixture Dois', '13: V2 usa segundo JSON');

  const htmlV1 = generate(company, false);
  ok(/VENDEDORA FIXTURE DOIS/.test(htmlV1), '14: HTML V1 com segundo vendedor');
  const htmlV2 = generate(company, true);
  ok(/VENDEDORA FIXTURE DOIS/.test(htmlV2), '13: HTML V2 com segundo vendedor');
}

console.log('\n=== 15) Defaults hardcoded não sobrescrevem configuração ===');
{
  const company = configuredCompany();
  const vendors = resolveAraguaiaPromitenteVendors({
    company,
    contractModel: 'ARAGUAIA',
    mode: 'legacy',
  });
  ok(!vendors.some((s) => /Daniel Roberto Rivelino/i.test(s.name)), '15: sem Daniel default');
  ok(!vendors.some((s) => s.profession === ARAGUAIA_DEFAULT_SELLERS[0].profession), '15: sem profissão default');
  ok(vendors[0].profession === V1_PROFESSION, '15: usa config');
}

console.log('\n=== 16) Comprador sem regressão ===');
{
  const defaultHtml = generateContractHTML({
    tenant: { contract_model: 'ARAGUAIA', razao_social: 'R R NEGÓCIOS & SERVIÇOS LTDA', cnpj: '57590706000178' },
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: SALE,
    financeReceipts: RECEIPTS,
  });
  const configuredHtml = generate(configuredCompany(), false);
  const buyerDefault = buyerPhrase(defaultHtml);
  const buyerConfigured = buyerPhrase(configuredHtml);
  ok(buyerDefault.includes('Cliente Teste Araguaia'), '16: comprador presente no default');
  ok(buyerDefault === buyerConfigured, '16: frase do comprador idêntica');
  ok(/Brasileiro\(a\)/.test(buyerConfigured), '16: nacionalidade comprador');
  ok(/Solteiro\(a\)/.test(buyerConfigured), '16: estado civil comprador');
  ok(/Comerciante/.test(buyerConfigured), '16: profissão comprador');
  ok(/Rua A, 10/.test(buyerConfigured), '16: endereço comprador');
}

console.log('\n=== 17-19) PADRAO / MENESES / RECANTO isolados ===');
{
  const padrao = generateContractHTML({
    tenant: { ...configuredCompany(), contract_model: 'PADRAO', name: 'Empresa Padrão' },
    customer: CUSTOMER,
    project: { name: 'Padrão', city: 'X', uf: 'PA' },
    block: BLOCK,
    sale: SALE,
    financeReceipts: RECEIPTS,
  });
  ok(!padrao.includes('sv-contract-araguaia'), '17: PADRAO sem Araguaia');
  ok(!/ambos residentes e domiciliados/i.test(padrao), '17: PADRAO sem frase ARAGUAIA');

  const meneses = generateContractHTML({
    tenant: { ...configuredCompany(), contract_model: 'MENESES', name: 'Meneses' },
    customer: CUSTOMER,
    project: { name: 'Meneses', city: 'Y', uf: 'PA' },
    block: { number: '1', block_name: '01', area: 300 },
    sale: { ...SALE, installment_correction_type: 'FIXED' },
    financeReceipts: RECEIPTS,
  });
  ok(!meneses.includes('sv-contract-araguaia'), '18: MENESES sem Araguaia');

  const recanto = generateContractHTML({
    tenant: { contract_model: 'RECANTO_PRIMAVERA', name: 'Recanto Co' },
    customer: CUSTOMER,
    project: { name: 'Recanto Primavera', city: 'X', uf: 'PA' },
    block: { number: '1', block_name: '01', area: 300 },
    sale: SALE,
    financeReceipts: RECEIPTS,
  });
  ok(!recanto.includes('sv-contract-araguaia'), '19: RECANTO sem Araguaia');
  ok(!/Vendedor Fixture Um/i.test(recanto), '19: RECANTO sem fixture ARAGUAIA');
}

console.log('\n=== 20) Nota Promissória sem regressão estrutural ===');
{
  const npCompany = {
    contract_model: 'ARAGUAIA',
    legal_representative: 'JOÃO VENDEDOR',
    representative_cpf: '39053344705',
    contract_legal_nationality: 'Brasileiro',
    contract_legal_marital_status: 'Casado',
    contract_legal_profession: 'Empresário',
    contract_legal_rg: '1234567',
    contract_legal_rg_issuer: 'SSP/PA',
    legal_representative_address: V1_ADDR,
    address: SEAT,
    contract_legal_address: SEAT,
  };
  const draft = buildPromissoryNoteDraft({
    contractId: 'contract-a',
    contractNumber: '000000014/2026',
    saleId: 'sale-a',
    sale: {
      contract_model: 'ARAGUAIA',
      payment_type: 'Parcelada',
      total_value: 25_000,
      down_payment: 5_000,
      installments_count: 2,
    },
    receipts: [
      { installment_number: 0, amount: 5_000, due_date: '2026-08-20', status: 'pago' },
      { installment_number: 1, amount: 10_000, due_date: '2026-09-20', status: 'pendente' },
      { installment_number: 2, amount: 10_000, due_date: '2026-10-20', status: 'pendente' },
    ],
    project: PROJECT,
    company: npCompany,
    customer: CUSTOMER,
  });
  ok(draft.ok, '20: minuta NP válida');
  if (!draft.ok) throw new Error('NP deveria ser válida');
  ok(draft.draft.vendor1.name === 'João Vendedor', '20: NP V1 da config');
  ok(draft.draft.vendor1.address === SEAT, '20: NP V1 ainda usa sede (código NP intocado)');
  ok(draft.draft.vendor1.address !== V1_ADDR, '20: NP não passou a usar residência pessoal');
  ok(/Nota Promissória/i.test(draft.draft.clauseReference), '20: referência estrutural NP');

  const npVendors = resolvePromissoryNoteVendors({ company: npCompany });
  ok(npVendors.vendor1?.profession === 'Empresário', '20: NP profissão da config');
}

console.log('\n=== Persistência dos novos campos ===');
{
  const built = buildCompanySettingsSavePayload(
    configuredCompany({
      legal_representative_address: V1_ADDR,
      contract_legal_rg_uf: 'pa',
    }),
    {
      name: '',
      title: '',
      crea: '',
      cau: '',
      cft: '',
      cpf: '',
      phone: '',
      email: '',
      signature_url: '',
      stamp_url: '',
    },
  );
  ok(built.ok, 'save ok');
  if (!built.ok) throw new Error(built.error);
  ok(built.payload.legal_representative_address === V1_ADDR, 'save residência pessoal');
  ok(built.payload.contract_legal_rg_uf === 'PA', 'save UF normalizada');
  ok(built.payload.contract_legal_address === SEAT, 'save não mistura sede');
  ok(built.payload.contract_legal_profession === V1_PROFESSION, 'save profissão');
}

console.log('\n=== Migration presente ===');
{
  const rel = 'supabase/migrations/20261012120000_companies_legal_representative_qualification.sql';
  const sql = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
  ok(/contract_legal_rg_uf/.test(sql), 'migration UF');
  ok(/legal_representative_address/.test(sql), 'migration residência');
  ok(!/\bDROP\s+(COLUMN|TABLE|INDEX)\b/i.test(sql), 'migration sem DROP');
}

console.log('\n======== QUALIFICAÇÃO VENDEDORES ARAGUAIA OK ========\n');
void buildAraguaiaPartiesPreambleHtml;
