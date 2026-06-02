/**
 * Testes — PDF do contrato completo + remoção conservadora de página vazia.
 * Executar: npm run test:contract-pdf-blank
 */

import fs from 'fs';
import path from 'path';
import { generateContractHTML } from '../lib/contractTemplate';
import {
  CONTRACT_KEEP_MARKERS,
  isContractPdfTrailingBlankPage,
  pdfPageHasContractualText,
  removeTrailingBlankPdfPages,
} from '../lib/contractPdfPostProcess';

let pass = 0;
let total = 0;

function assert(name: string, ok: boolean) {
  total++;
  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — ${name}`);
  if (ok) pass++;
}

assert(
  'detecta Cláusula Primeira',
  pdfPageHasContractualText('Cláusula Primeira: o imóvel LOTE 5'),
);
assert(
  'detecta Cláusula Quarta e valor',
  pdfPageHasContractualText('Cláusula Quarta: valor total parcela entrada'),
);
assert(
  'detecta TESTEMUNHA e CPF',
  pdfPageHasContractualText('TESTEMUNHA 1 CPF: 000.000.000-00'),
);
assert(
  'detecta foro e multa',
  pdfPageHasContractualText('Cláusula Décima Primeira: foro multa escritura'),
);

const html2pdfLikePdf = {
  internal: {
    getNumberOfPages: () => 4,
    pages: {
      1: new Array(180),
      2: new Array(160),
      3: new Array(150),
      4: new Array(8),
    },
  },
  deleted: [] as number[],
  deletePage(n: number) {
    this.deleted.push(n);
  },
  getTextFromPage(n: number) {
    if (n === 1) {
      return { items: [{ str: 'Cláusula Primeira PROMITENTE VENDEDOR' }] };
    }
    if (n === 2) {
      return { items: [{ str: 'Cláusula Quarta parcela entrada valor' }] };
    }
    if (n === 3) {
      return {
        items: [
          { str: 'Cláusula Décima Primeira foro' },
          { str: 'TESTEMUNHA 1 TESTEMUNHA 2 CPF' },
        ],
      };
    }
    return { items: [] };
  },
};

removeTrailingBlankPdfPages(html2pdfLikePdf);
assert(
  'não remove páginas 2–3 com texto vazio na extração (html2pdf)',
  html2pdfLikePdf.deleted.length === 0 &&
    html2pdfLikePdf.internal.getNumberOfPages() === 4,
);

const chromeOnlyLast = {
  internal: { getNumberOfPages: () => 4, pages: {} },
  deleted: [] as number[],
  deletePage(n: number) {
    this.deleted.push(n);
  },
  getTextFromPage(n: number) {
    if (n <= 3) {
      return { items: [{ str: `Cláusula ${n} PROMITENTE valor parcela` }] };
    }
    return {
      items: [
        {
          str: 'Documento emitido digitalmente pelo SV LOTES GIS Página 4 de 4',
        },
      ],
    };
  },
};

removeTrailingBlankPdfPages(chromeOnlyLast);
assert(
  'remove só última página se for só chrome SV LOTES',
  chromeOnlyLast.deleted.length === 1 && chromeOnlyLast.deleted[0] === 4,
);

const clauseOnLast = {
  internal: { getNumberOfPages: () => 3, pages: {} },
  deleted: [] as number[],
  deletePage(n: number) {
    this.deleted.push(n);
  },
  getTextFromPage() {
    return { items: [{ str: 'Cláusula Décima Primeira TESTEMUNHA 1' }] };
  },
};

removeTrailingBlankPdfPages(clauseOnLast);
assert(
  'não remove última página com TESTEMUNHA',
  clauseOnLast.deleted.length === 0,
);

const contractHtml = generateContractHTML({
  tenant: {
    name: 'Imobiliária Teste LTDA',
    cnpj: '00.000.000/0001-00',
    city: 'Parauapebas',
    state: 'PA',
    address: 'Rua A, 100',
    zip: '68515-000',
    phone: '(94) 3000-0000',
    email: 'contato@teste.com',
    representative: 'Representante Legal',
    representative_cpf: '111.111.111-11',
  },
  customer: {
    name: 'Cliente Teste',
    document: '222.222.222-22',
    rg: '1234567',
    rg_issuer: 'PC',
    rg_issuer_state: 'PA',
    profession: 'Engenheiro',
    civil_state: 'Solteiro',
    address: 'Rua B',
    neighborhood: 'Centro',
    city: 'Parauapebas',
    state_uf: 'PA',
    zip_code: '68515-000',
  },
  project: {
    name: 'LOTEAMENTO NOVA CARAJÁS',
    city: 'Parauapebas',
    uf: 'PA',
  },
  block: {
    number: '5',
    block_name: '123',
    area: 239.88,
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
    first_installment_due_date: '2026-06-01',
    down_payment_due_date: '2026-05-01',
  },
  contractSnapshot: {
    contract_number: '000000001/2026',
    project_name_snapshot: 'LOTEAMENTO NOVA CARAJÁS',
  },
  contractDate: '2026-05-01',
});

const requiredSnippets = [
  'Cláusula Primeira',
  'Cláusula Quarta',
  'Cláusula Décima Primeira',
  'TESTEMUNHA 1',
  'TESTEMUNHA 2',
  'LOTEAMENTO NOVA CARAJÁS',
  'LOTE 5 DA QUADRA 123',
  'Portador da Cédula de Identidade RG nº 1234567, expedida pela PC/PA',
];

for (const snippet of requiredSnippets) {
  assert(
    `contrato 000000001/2026 contém "${snippet}"`,
    contractHtml.includes(snippet),
  );
}

assert(
  'marcadores CONTRACT_KEEP cobrem Parágrafo e PROMISSÁRIO',
  CONTRACT_KEEP_MARKERS.test('Parágrafo Único PROMISSÁRIO COMPRADOR'),
);

const templateSrc = fs.readFileSync(
  path.join(process.cwd(), 'lib/contractTemplate.ts'),
  'utf8',
);
assert(
  'sem page-break-after always no template',
  !/page-break-after:\s*always/i.test(templateSrc),
);

console.log(`\nTotal: ${pass} PASSOU / ${total - pass} FALHOU de ${total}`);
process.exit(pass === total ? 0 : 1);
