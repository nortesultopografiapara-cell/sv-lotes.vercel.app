/**
 * Isolamento cláusulas novas MENESES + regressão PADRAO / Recanto / SV2.
 * npx tsx scripts/mandatory-meneses-new-clauses-tests.ts
 */

import { generateContractHTML } from '../lib/contractTemplate';
import { buildMenesesClausesHtml } from '../lib/menesesContractClauses';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

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

const PROJECT = { name: 'Loteamento Horizonte', city: 'Rio Verde', uf: 'GO' };
const BLOCK = {
  block_name: '12',
  number: '05',
  area: 450.5,
  frente: 12,
  fundo: 12,
  lateral_esquerda: 30,
  lateral_direita: 30,
};

function baseSale(extra: Record<string, unknown> = {}) {
  return {
    id: 'sale-meneses-1',
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

function html(model: string, extraSale: Record<string, unknown> = {}) {
  return generateContractHTML({
    tenant: tenant(model),
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: baseSale(extraSale),
  });
}

const MENESES_MARKERS = [
  'Cláusula Primeira — Das Declarações Iniciais',
  'Cláusula Segunda — Do Objeto',
  'Cláusula Terceira — Do Preço e da Forma de Pagamento',
  'Quadro Financeiro',
  'Central do Cliente do SV LOTES',
  'Cláusula Nona — Da Rescisão Contratual e da Cláusula Penal',
  '20% (vinte por cento) do valor total atualizado',
  'Cláusula Décima — Da Devolução de Valores',
  'restituição de 20% (vinte por cento) do montante pago',
  'restituição de 40% (quarenta por cento) do montante pago',
  'Lei nº 13.709/2018',
  'Cláusula Décima Terceira — Da Assinatura Eletrônica',
  'Medida Provisória nº 2.200-2/2001',
  'Cláusula Décima Quarta — Do Foro',
];

const OLD_MENESES_FORBIDDEN = [
  'ressarcido somente 40% do valor pago',
  '6 (seis) meses contados da data em que for expedido o decreto',
  'honorários advocatícios de 20% (vinte por cento)',
  'multa penal de 2% (dois por cento) do valor total do contrato',
];

console.log('1) MENESES contém cláusulas novas...');
{
  const h = html('MENESES');
  for (const m of MENESES_MARKERS) {
    assert(h.includes(m), `MENESES deve conter: ${m}`);
  }
  assert(h.includes('LOTE 05 DA QUADRA 12'), 'dimensões dinâmicas lote/quadra');
  assert(h.includes('450,50 m²') || h.includes('450.50'), 'área dinâmica');
  assert(h.includes('Rio Verde'), 'município/foro dinâmico');
  assert(h.includes('corresponde ao imóvel identificado'), 'Cláusula Segunda: corresponde ao imóvel');
  assert(!h.includes('corresponde a o imóvel'), 'Cláusula Segunda: sem "a o imóvel"');
  assert(/Rio Verde\s*-\s*GO,\s*01 de julho de 2026/i.test(h), 'fecho MENESES com data por extenso');
  assert(!h.includes('Rio Verde - GO, 01/07/2026'), 'fecho MENESES sem dd/mm/aaaa');
  assert(!h.includes('{{'), 'sem literais {{');
  assert(!h.includes('{%'), 'sem literais {%');
  for (const bad of OLD_MENESES_FORBIDDEN) {
    assert(!h.includes(bad), `MENESES NÃO deve conter legado: ${bad}`);
  }
  assert(!/data-party-role=["']BROKER["']/i.test(h), 'sem slot corretor');
  assert(!/CRECI/i.test(h) || !/assinatura.*corretor/i.test(h), 'sem assinatura corretor/CRECI dedicada');
  assert(h.includes('data-party-role="VENDOR"'), 'slot VENDOR');
  assert(h.includes('data-party-role="BUYER"'), 'slot BUYER');
  assert(h.includes('data-party-role="WITNESS"'), 'slot WITNESS');
  assert(
    h.includes('Quadro Financeiro') || h.includes('quadro financeiro') || h.includes('Tabela'),
    'quadro financeiro presente',
  );
}

console.log('2) PADRAO permanece com cláusulas clássicas...');
{
  const h = html('PADRAO');
  assert(h.includes('ressarcido somente 40% do valor pago'), 'PADRAO mantém 40%');
  assert(h.includes('6 (seis) meses'), 'PADRAO mantém 6 meses');
  assert(h.includes('honorários advocatícios de 20%'), 'PADRAO mantém honorários 20%');
  assert(h.includes('Cláusula Décima Segunda:'), 'PADRAO assinatura eletrônica clássica');
  assert(h.includes('Cláusula Décima Terceira:'), 'PADRAO foro clássico');
  assert(h.includes('Rio Verde - GO, 01/07/2026'), 'PADRAO mantém fecho dd/mm/aaaa');
  assert(!h.includes('01 de julho de 2026'), 'PADRAO sem data por extenso no fecho');
  for (const m of [
    'Das Declarações Iniciais',
    'Da Proteção de Dados Pessoais',
    'Décima Quarta — Do Foro',
  ]) {
    assert(!h.includes(m), `PADRAO não deve ter trecho Meneses: ${m}`);
  }
}

console.log('3) Recanto / SV2 isolados (sem cláusulas Meneses)...');
{
  for (const model of ['RECANTO_PRIMAVERA', 'SV_LOTES_2'] as const) {
    const h = html(model);
    assert(!h.includes('Das Declarações Iniciais'), `${model}: sem Declarações Iniciais Meneses`);
    assert(!h.includes('Da Devolução de Valores e das Benfeitorias'), `${model}: sem gradação Meneses`);
    assert(!h.includes('Cláusula Décima Quarta — Do Foro'), `${model}: sem 14ª Meneses`);
  }
}

console.log('4) Cônjuge condicional no MENESES...');
{
  const withSpouse = generateContractHTML({
    tenant: tenant('MENESES'),
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: baseSale({
      has_spouse: true,
      sale_spouse_name: 'Maria Souza Anuente',
      sale_spouse_cpf: '39053344705',
      sale_spouse_nationality: 'Brasileira',
      sale_spouse_marital_status: 'Casada',
      sale_spouse_profession: 'Comerciante',
      sale_spouse_rg: '1234567',
      sale_spouse_rg_issuer: 'SSP/GO',
    }),
  });
  assert(
    withSpouse.includes('Maria Souza Anuente') || withSpouse.includes('ANUENTE'),
    'cônjuge aparece na qualificação/assinatura',
  );
  assert(
    withSpouse.includes('data-party-role="SPOUSE"') ||
      /cônjuge|conjuge|anuente/i.test(withSpouse),
    'slot ou menção de cônjuge',
  );

  const noSpouse = html('MENESES');
  assert(
    !noSpouse.includes('Maria Souza Anuente'),
    'sem cônjuge quando não informado',
  );
}

console.log('5) buildMenesesClausesHtml unitário...');
{
  const fragment = buildMenesesClausesHtml({
    loteLabel: 'LOTE 01 DA QUADRA A',
    lote: '01',
    quadra: 'A',
    areaFmt: '300,00 m²',
    lotBoundariesClause: 'apresentando as seguintes dimensões: frente 10 m',
    curvaClause: '',
    projectDescString: ', integrante do empreendimento <strong>TESTE</strong>',
    lotLocationSuffix: '',
    foroText: 'da Comarca de <strong>Goiânia - GO</strong>',
  });
  assert(fragment.includes('LOTE 01 DA QUADRA A'), 'objeto com lote');
  assert(fragment.includes('corresponde ao imóvel identificado'), 'objeto: corresponde ao imóvel');
  assert(!fragment.includes('corresponde a o imóvel'), 'objeto: sem "a o imóvel"');
  assert(fragment.includes('Goiânia - GO'), 'foro dinâmico');
  assert(fragment.includes('Cláusula Décima Quarta'), '14 cláusulas');
  assert(!fragment.includes('{{'), 'sem mustache');
}

console.log('\nOK mandatory-meneses-new-clauses-tests');
