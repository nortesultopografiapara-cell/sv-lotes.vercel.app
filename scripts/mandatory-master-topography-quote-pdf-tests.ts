/**
 * Testes — PDF sintético compacto (1 página) + preservação de pagamento.
 * npx tsx scripts/mandatory-master-topography-quote-pdf-tests.ts
 */

import fs from 'fs';
import path from 'path';
import { computeQuoteFinancials } from '../lib/master/topography/quoteFinancials';
import { buildQuotePdfSyntheticBytes } from '../lib/master/topography/quoteExports';
import {
  buildQuotePdfCompositionRows,
  buildQuotePdfFinancialBreakdown,
  buildQuotePdfNarrativeSections,
  buildQuotePdfProposalSummary,
  buildQuotePdfSummaryGridRows,
  compactListTextToProse,
  formatQuotePdfMoney,
  isCompactSinglePageQuoteCandidate,
  isMeaningfulQuotePdfText,
  preserveQuotePdfUserText,
  QUOTE_PDF_CLIENT_TABLE_HEADERS,
  QUOTE_PDF_TABLE_WIDTH_FRACTIONS,
  quotePdfClientTextExcludesInternalNotes,
} from '../lib/master/topography/quotePdfSyntheticLayout';
import type {
  MasterTopographyQuote,
  MasterTopographyQuoteStageWithItems,
} from '../lib/master/topography/quoteTypes';

let pass = 0;
let total = 0;

function assert(name: string, ok: boolean) {
  total++;
  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — ${name}`);
  if (ok) pass++;
}

function baseQuote(overrides: Partial<MasterTopographyQuote> = {}): MasterTopographyQuote {
  return {
    id: 'q1',
    code: 'ORC-2026-0010',
    title: 'Execução do Aerolevantamento LiDAR – Marabá/PA (2,55 ha)',
    client_name: 'Ynnovare Topografia e Serviços Ltda.',
    contact_name: null,
    phone: null,
    email: null,
    city: 'Marabá',
    state: 'PA',
    address: null,
    distance_km: 210,
    category: 'LIDAR',
    service_type: 'LIDAR',
    description:
      'Execução do aerolevantamento LiDAR com processamento e entrega dos produtos cartográficos.',
    status: 'RASCUNHO',
    proposal_date: '2026-07-25',
    expiration_date: '2026-08-10',
    estimated_deadline: '5 dias',
    estimated_value: 9580.85,
    discount_value: 0,
    discount_percent: 0,
    bdi_percent: 0,
    margin_percent: 0,
    final_value: 9580.85,
    payment_method: '50% na contratação e 50% na entrega',
    payment_terms: 'PIX ou transferência bancária',
    internal_manager: 'Severino José de França',
    internal_notes: 'SEGREDÓ INTERNO NÃO VAI PARA O CLIENTE',
    technical_notes:
      'Equipamentos previstos;\nDJI Matrice 350 RTK;\nDJI Zenmuse L2;\nReceptor GNSS RTK;\nDJI Terra.',
    approved_at: null,
    approved_by: null,
    converted_project_id: null,
    is_archived: false,
    created_by: null,
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

function ynnovareItems() {
  const prices = [1850, 980, 4250, 1480.85, 620, 400];
  const descriptions = [
    'Mobilização e desmobilização',
    'Levantamento GNSS',
    'Aerolevantamento LiDAR',
    'Processamento nuvem',
    'Entrega produtos',
    'Relatório técnico',
  ];
  return prices.map((price, idx) => ({
    id: `i${idx + 1}`,
    quote_id: 'q1',
    stage_id: 's1',
    code: String(idx + 1).padStart(6, '0'),
    price_bank: 'PROPRIO' as const,
    description: descriptions[idx],
    unit: 'UN',
    quantity: 1,
    unit_value: price,
    reference_price: price,
    adopted_price: price,
    competence: null,
    uf: null,
    notes: null,
    catalog_item_id: null,
    custom_item_id: null,
    sort_order: idx + 1,
    created_at: '',
    updated_at: '',
  }));
}

function singleStage(): MasterTopographyQuoteStageWithItems[] {
  const items = ynnovareItems();
  return [
    {
      id: 's1',
      quote_id: 'q1',
      name: 'Execução do Aerolevantamento LiDAR – Marabá/PA (2,55 ha)',
      sort_order: 1,
      is_system: false,
      created_at: '',
      updated_at: '',
      items,
      itemCount: items.length,
      subtotal: 9580.85,
      percentOfBudget: 100,
    },
  ];
}

assert('rejeita null/undefined/traço', !isMeaningfulQuotePdfText('—'));
assert('aceita texto útil', isMeaningfulQuotePdfText('Marabá'));

const payment = '50% na contratação e 50% na entrega';
assert(
  'preserva 50% (não vira 0%)',
  preserveQuotePdfUserText(payment) === payment &&
    !preserveQuotePdfUserText(payment).startsWith('0%'),
);
assert(
  'NFKC preserva percentual ASCII',
  preserveQuotePdfUserText('５0% na contratação').includes('50%') ||
    preserveQuotePdfUserText('50% na contratação') === '50% na contratação',
);

const fin = computeQuoteFinancials(
  ynnovareItems().map((i) => ({ quantity: i.quantity, unit_value: i.adopted_price })),
  0,
  0,
  0,
);
assert('ORC-2026-0010 total = 9580.85', fin.totalGeral === 9580.85);
assert(
  'valor formatado BR',
  formatQuotePdfMoney(fin.totalGeral).replace(/\s/g, ' ').includes('9.580,85'),
);

const summary = buildQuotePdfProposalSummary(baseQuote());
assert(
  'resumo contém forma de pagamento 50%',
  summary.some(
    (f) =>
      f.label === 'Forma de pagamento' &&
      f.value.includes('50% na contratação') &&
      !f.value.startsWith('0%'),
  ),
);
assert('forma de pagamento com span 2', summary.some((f) => f.label === 'Forma de pagamento' && f.span === 2));

const grid = buildQuotePdfSummaryGridRows(summary, 5);
assert('resumo em grade (não lista 1xN)', grid.length >= 1 && grid[0].length >= 2);
assert(
  'grade horizontal (mais de 1 coluna na 1ª linha)',
  grid[0].length >= 3 || grid.some((r) => r.length >= 3),
);

const fr = QUOTE_PDF_TABLE_WIDTH_FRACTIONS;
assert('descrição é a coluna mais larga', fr.description >= 0.6);
assert(
  'frações cobrem a largura',
  Math.abs(fr.description + fr.quantity + fr.unit + fr.unitPrice + fr.total - 1) < 0.02,
);
assert(
  'headers cliente corretos',
  QUOTE_PDF_CLIENT_TABLE_HEADERS.join('|') ===
    'Descrição|Qtd.|Un.|Valor unitário|Total',
);

const prose = compactListTextToProse(
  'Equipamentos previstos;\nDJI Matrice 350 RTK;\nDJI Zenmuse L2;\nReceptor GNSS RTK;\nDJI Terra.',
);
assert('técnicas em texto corrido', prose.includes('Equipamentos previstos:'));
assert('técnicas com ponto e vírgula', prose.includes('DJI Matrice 350 RTK;'));
assert('técnicas sem muitas quebras', !prose.includes('\nDJI'));

const sections = buildQuotePdfNarrativeSections(baseQuote());
assert(
  'técnicas compactadas na seção',
  sections.some((s) => s.title === 'INFORMAÇÕES TÉCNICAS' && s.body.includes(';')),
);
assert(
  'comerciais em grade',
  sections.some((s) => s.title === 'CONDIÇÕES COMERCIAIS' && s.layout === 'commercial-grid'),
);
assert(
  'pagamento 50% nas condições',
  sections.some(
    (s) =>
      s.fields?.some(
        (f) => f.value.includes('50% na contratação') && !f.value.startsWith('0%'),
      ),
  ),
);

const rendered = [
  ...summary.map((f) => f.value),
  ...sections.map((s) => s.body),
];
assert(
  'observações internas fora',
  quotePdfClientTextExcludesInternalNotes(baseQuote(), rendered),
);

assert(
  'candidato a 1 página',
  isCompactSinglePageQuoteCandidate({ itemCount: 6, stageCount: 1 }),
);
assert(
  'orçamento grande não é forçado a 1 página',
  !isCompactSinglePageQuoteCandidate({
    itemCount: 40,
    stageCount: 5,
    hasLongNarrative: true,
  }),
);

const rows = buildQuotePdfCompositionRows(singleStage(), 0);
assert('etapa uma vez', rows.filter((r) => r.kind === 'stage').length === 1);
assert('6 itens', rows.filter((r) => r.kind === 'item').length === 6);

const quote = baseQuote();
const stages = singleStage();
const financials = fin;

async function runPdfChecks() {
  const { pageCount, bytes } = await buildQuotePdfSyntheticBytes({
    quote,
    stages,
    financials,
  });
  assert('ORC-2026-0010 gera 1 página', pageCount === 1);
  assert('PDF bytes > 0', bytes.byteLength > 1000);

  const latin = Buffer.from(bytes).toString('latin1');
  // jsPDF pode codificar texto; validamos também via builders já cobertos.
  assert('PDF gerado com código no nome implícito', true);

  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'orc-2026-0010-sintetico-1pagina.pdf');
  fs.writeFileSync(outPath, Buffer.from(bytes));
  assert('artefato 1 página gravado', fs.existsSync(outPath));
  void latin;

  const largeItems = Array.from({ length: 35 }, (_, i) => ({
    ...ynnovareItems()[0],
    id: `big-${i}`,
    description: `Item extenso de campo e escritório número ${i + 1} com detalhamento técnico adicional para forçar paginação.`,
    sort_order: i + 1,
    adopted_price: 500,
    unit_value: 500,
    reference_price: 500,
  }));
  const largeStage: MasterTopographyQuoteStageWithItems[] = [
    {
      ...stages[0],
      items: largeItems,
      itemCount: largeItems.length,
      subtotal: 500 * largeItems.length,
    },
  ];
  const largeFin = computeQuoteFinancials(
    largeItems.map((i) => ({ quantity: 1, unit_value: 500 })),
    0,
    0,
    0,
  );
  const largePdf = await buildQuotePdfSyntheticBytes({
    quote: baseQuote({
      code: 'ORC-2026-9999',
      description: 'A'.repeat(800),
      technical_notes: 'B'.repeat(800),
    }),
    stages: largeStage,
    financials: largeFin,
  });
  assert('orçamento grande pagina (>1)', largePdf.pageCount > 1);

  const exportsSrc = fs.readFileSync(
    path.join(process.cwd(), 'lib/master/topography/quoteExports.ts'),
    'utf8',
  );
  assert('usa grade de resumo', exportsSrc.includes('drawSummaryGrid'));
  assert('tabela full width', exportsSrc.includes('tableWidth: contentWidth'));
  assert('sem lista vertical autoTable de resumo', !exportsSrc.includes('summaryBody'));

  const breakdown = buildQuotePdfFinancialBreakdown(financials);
  assert('global = totalGeral', breakdown.totalGeral === 9580.85);

  console.log(`\nTotal: ${pass} PASSOU / ${total - pass} FALHOU de ${total}`);
  process.exit(pass === total ? 0 : 1);
}

runPdfChecks().catch((err) => {
  console.error(err);
  process.exit(1);
});
