/**
 * Teste obrigatório — paginação/impressão ESTRELA_DO_SUL.
 * npx tsx scripts/mandatory-estrela-do-sul-pagination-tests.ts
 *
 * Não altera conteúdo jurídico. Garante wrappers CSS e html2pdf avoid
 * por unidade lógica (cláusula/título, item curto, tabela/linha, assinaturas).
 */
import { generateContractHTML } from '../lib/contractTemplate';
import { buildEstrelaDoSulContractPaginationCss } from '../lib/estrelaDoSulContractTemplate';
import { ESTRELA_DO_SUL_HTML2PDF_PAGINATION_AVOID, ESTRELA_DO_SUL_PDF_MARGIN_MM } from '../lib/estrelaDoSulHtml2PdfPagination';
import { resolveContractHtml2pdfOptions } from '../lib/contractPdfPostProcess';
import fs from 'node:fs';
import path from 'node:path';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

const SECOND_VENDOR = {
  name: 'Antonio Ferreira Silva',
  cpf: '71877312215',
  rg: '1234567',
  rgIssuer: 'SSP',
  rgUf: 'PA',
  nationality: 'Brasileiro',
  maritalStatus: 'Casado',
  profession: 'Empresário',
  email: 'antonio@estrela.test',
  phone: '94991001122',
  address: 'Rua B, 10',
};

const html = generateContractHTML({
  tenant: {
    name: 'L.F. IMOVEIS LTDA',
    razao_social: 'L.F. IMOVEIS LTDA',
    cnpj: '47052349000130',
    address: 'Rua 24 de Marco, 99',
    city: 'Parauapebas',
    state: 'PA',
    zip_code: '68515000',
    email: 'contato@lfimoveis.test',
    phone: '94988887777',
    legal_representative: 'Luzia Felipe',
    representative_cpf: '11144477735',
    contract_model: 'ESTRELA_DO_SUL',
    contract_second_vendor_json: SECOND_VENDOR,
  },
  customer: {
    name: 'Joao Comprador da Silva',
    document: '52998224725',
    cpf: '52998224725',
    profession: 'Agricultor',
    civil_state: 'Casado',
    nationality: 'brasileiro',
    address: 'Rua A, 100',
    city: 'Parauapebas',
    state: 'PA',
    zip_code: '68515000',
    email: 'joao@comprador.test',
    phone: '94991112233',
  },
  project: {
    name: 'Chacreamento Estrela do Sul',
    city: 'Parauapebas',
    uf: 'PA',
    neighborhood: 'Palmares 2',
    forum_city: 'Parauapebas',
    contract_model: 'ESTRELA_DO_SUL',
  },
  block: { quadra: '02', lot: '15', area: 1100, frente: 20, fundo: 20, 'Lado Dir.': 55, 'Lado Esq.': 55 },
  sale: {
    payment_type: 'Parcelado',
    installments_count: 10,
    total_value: 50000,
    down_payment: 5000,
    installment_value: 4500,
    first_installment_due_date: '2026-03-20',
    sale_date: '2026-02-20',
    installment_correction_type: 'IGPM',
    has_spouse: true,
    sale_spouse_name: 'Maria Souza Anuente',
    sale_spouse_cpf: '39053344705',
    brokers: { name: 'Corretor Estrela', cpf: '39053344705' },
    broker_commissions: [{ amount: 1500 }],
  },
  financeReceipts: Array.from({ length: 10 }, (_, i) => ({
    installment_number: i + 1,
    amount: 4500,
    due_date: `2026-${String((i % 12) + 3).padStart(2, '0')}-20`,
    status: 'pendente',
  })),
});

const css = buildEstrelaDoSulContractPaginationCss();

function cssRuleFor(selector: string): string {
  const exact = css.indexOf(`${selector} {`);
  const idx = exact >= 0 ? exact : css.indexOf(selector);
  if (idx < 0) return '';
  const brace = css.indexOf('{', idx);
  const end = css.indexOf('}', brace);
  return css.slice(brace, end + 1);
}

assert(html.includes('data-contract-model="ESTRELA_DO_SUL"'), 'HTML Estrela');
assert(!html.includes('class="estrela-logo"'), 'capa/instrumento sem logo interno duplicado');
assert(!/max-height:\s*72px/.test(html), 'sem logotipo grande no corpo');
assert(cssRuleFor('.estrela-logo').includes('display: none'), 'CSS oculta .estrela-logo se reaparecer');
assert(html.includes('font-size: 11pt'), 'corpo em 11pt alinhado ao original');
assert(html.includes('class="estrela-clause-title"'), 'wrapper título de cláusula');
assert(html.includes('class="estrela-clause-head"'), 'wrapper título + início da cláusula');
assert(html.includes('class="estrela-item"'), 'wrapper de item/parágrafo');
assert(html.includes('class="estrela-item-p"'), 'parágrafo interno do item');
assert(html.includes('class="estrela-item-group"'), 'wrapper de grupo lógico (item + subitens)');
assert(html.includes('class="estrela-lead-table"'), 'wrapper título introdutório + tabela');
assert(html.includes('class="estrela-td-keep"'), 'wrapper de célula/linha de tabela');
assert(html.includes('class="estrela-table"'), 'tabela com classe de paginação');
assert(/<thead>[\s\S]*<th[\s\S]*estrela-td-keep/.test(html), 'tabelas com thead para repetir cabeçalho');

const titleCss = cssRuleFor('.estrela-clause-title');
assert(titleCss.includes('page-break-after: avoid'), 'CSS: título de cláusula não se separa do texto');
assert(cssRuleFor('.estrela-item').includes('page-break-inside: avoid'), 'CSS: item curto indivisível');
assert(cssRuleFor('.estrela-item--long').includes('page-break-inside: auto'), 'CSS: parágrafo longo pode continuar');
assert(cssRuleFor('.estrela-td-keep').includes('page-break-inside: avoid'), 'CSS: linha/célula de tabela indivisível');
assert(cssRuleFor('.estrela-table thead').includes('table-header-group'), 'CSS: thead repete entre páginas');
assert(cssRuleFor('.estrela-capa-signatures').includes('page-break-inside: avoid'), 'CSS: 1º bloco de assinaturas indivisível');
assert(
  cssRuleFor('.contract-closing-and-signatures--estrela').includes('page-break-inside: avoid'),
  'CSS: 2º bloco de assinaturas indivisível',
);
assert(cssRuleFor('.contract-clause').includes('page-break-inside: auto'), 'CSS: cláusula enorme não é avoid global');
assert(cssRuleFor('.estrela-capa-section-4-title').includes('page-break-after: avoid'), 'CSS: título segurança + tabela');
assert(css.includes('orphans: 3'), 'CSS: orphans para quebra entre linhas');
assert(css.includes('widows: 3'), 'CSS: widows para quebra entre linhas');

const item13 = html.indexOf('<strong>1.3.</strong>');
const around13 = html.slice(Math.max(0, item13 - 280), item13 + 700);
assert(item13 > 0 && around13.includes('estrela-lead-table'), '1.3 vive no wrapper lead-table');
assert(around13.includes('estrela-table'), '1.3 permanece junto da tabela que introduz');

assert(html.includes("cell('Outras informações')") || html.includes('Outras informações'), 'célula Outras informações existe');
const outras = html.indexOf('Outras informações');
const outrasWindow = html.slice(Math.max(0, outras - 180), outras + 80);
assert(outrasWindow.includes('estrela-td-keep'), 'Outras informações usa estrela-td-keep');

function itemClassAround(marker: string): string {
  const i = html.indexOf(marker);
  if (i < 0) return '';
  const start = html.lastIndexOf('<div class="', i);
  return html.slice(start, start + 80);
}

assert(itemClassAround('<strong>2.8.1.</strong>').includes('estrela-item'), '2.8.1 em wrapper de item');
assert(!itemClassAround('<strong>2.8.1.</strong>').includes('estrela-item--long'), '2.8.1 é item curto (não parte no meio)');
assert(itemClassAround('<strong>7.3.</strong>').includes('estrela-item'), '7.3 em wrapper de item');
assert(!itemClassAround('<strong>7.3.</strong>').includes('estrela-item--long'), '7.3 é item curto');
assert(itemClassAround('<strong>9.4.</strong>').includes('estrela-item'), '9.4 em wrapper de item');
const around94 = html.slice(html.indexOf('<strong>9.4.</strong>') - 80, html.indexOf('<strong>9.4.</strong>') + 40);
assert(around94.includes('estrela-item-group') || html.includes('estrela-item-group'), '9.4 agrupado com parágrafo único');

assert(css.includes('estrela-item--long'), 'CSS prevê parágrafo longo com continuação entre linhas');
const clausesSrc = fs.readFileSync(path.join(process.cwd(), 'lib', 'estrelaDoSulContractClauses.ts'), 'utf8');
assert(clausesSrc.includes('estrela-item--long'), 'itens acima do limiar recebem classe longa');
assert(clausesSrc.includes('SHORT_ITEM_MAX'), 'limiar de item curto vs longo existe');

assert(html.includes('data-estrela-sign-block="capa"'), 'bloco de assinaturas da capa');
assert(html.includes('data-estrela-sign-block="instrumento"'), 'bloco de assinaturas do instrumento');
assert(html.includes('class="estrela-capa-signatures"'), 'wrapper capa signatures');
assert(html.includes('class="contract-closing-and-signatures--estrela"'), 'wrapper instrumento signatures');
assert(html.includes('class="signature-grid signature-grid--estrela"'), 'grade de signatários');

const capaIdx = html.indexOf('class="estrela-capa"');
const annexIdx = html.indexOf('4. DOS ASPECTOS DE SEGURANÇA E CONFLITOS');
const capaSignIdx = html.indexOf('data-estrela-sign-block="capa"');
const instrumentIdx = html.indexOf('class="estrela-instrument"');
const instSignIdx = html.indexOf('data-estrela-sign-block="instrumento"');
assert(capaIdx < annexIdx && annexIdx < capaSignIdx && capaSignIdx < instrumentIdx && instrumentIdx < instSignIdx,
  'Capa Resumo → tabela segurança → 1º bloco → page break → instrumento → 2º bloco');
assert(cssRuleFor('.estrela-instrument').includes('page-break-before: always'), 'instrumento começa em página nova');

const avoid = ESTRELA_DO_SUL_HTML2PDF_PAGINATION_AVOID as readonly string[];
assert(avoid.includes('.estrela-item:not(.estrela-item--long)'), 'html2pdf avoid: item curto');
assert(avoid.includes('.estrela-clause-head'), 'html2pdf avoid: título de cláusula');
assert(avoid.includes('.estrela-td-keep'), 'html2pdf avoid: célula/linha');
assert(avoid.includes('.estrela-capa-signatures'), 'html2pdf avoid: assinaturas capa');
assert(avoid.includes('.contract-closing-and-signatures--estrela'), 'html2pdf avoid: assinaturas instrumento');
assert(!avoid.includes('.estrela-item'), 'html2pdf não aplica avoid indiscriminado a todo p/item');

const pdfOpts = resolveContractHtml2pdfOptions(
  { contract_model: 'ESTRELA_DO_SUL' },
  'estrela-do-sul.pdf',
  html,
);
const avoidList = (pdfOpts.pagebreak as { avoid?: string[] }).avoid || [];
assert(avoidList.includes('.estrela-item:not(.estrela-item--long)'), 'resolveContractHtml2pdfOptions usa avoid Estrela');
assert(avoidList.includes('.estrela-td-keep'), 'html2pdf runtime inclui célula keep');
assert(
  (pdfOpts.margin as number[])[0] === ESTRELA_DO_SUL_PDF_MARGIN_MM.top,
  'html2pdf Estrela usa margem de topo menor que o chrome clássico de 48mm',
);
assert(ESTRELA_DO_SUL_PDF_MARGIN_MM.top < 48, 'margem Estrela não herda 48mm vazios');

const srcDir = path.join(process.cwd(), 'lib');
for (const file of [
  'estrelaDoSulContractTemplate.ts',
  'estrelaDoSulContractClauses.ts',
  'estrelaDoSulContractParties.ts',
  'estrelaDoSulHtml2PdfPagination.ts',
]) {
  const src = fs.readFileSync(path.join(srcDir, file), 'utf8');
  assert(!/CLÁUSULA PRIMEIRA – DAS DECLARAÇÕES INICIAIS/.test(src), `${file} não mistura Recanto`);
}

console.log('\nOK mandatory-estrela-do-sul-pagination-tests');
