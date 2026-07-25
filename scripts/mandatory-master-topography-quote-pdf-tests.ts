/**
 * Testes obrigatórios — PDF sintético de orçamento (layout cliente).
 * Executar: npx tsx scripts/mandatory-master-topography-quote-pdf-tests.ts
 */

import fs from 'fs';
import path from 'path';
import { computeQuoteFinancials } from '../lib/master/topography/quoteFinancials';
import {
  buildQuotePdfCompositionRows,
  buildQuotePdfFinancialBreakdown,
  buildQuotePdfNarrativeSections,
  buildQuotePdfProposalSummary,
  formatQuotePdfMoney,
  isMeaningfulQuotePdfText,
  QUOTE_PDF_CLIENT_TABLE_HEADERS,
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
    distance_km: null,
    category: 'LIDAR',
    service_type: 'LIDAR',
    description: 'Execução completa do aerolevantamento.',
    status: 'RASCUNHO',
    proposal_date: '2026-07-20',
    expiration_date: '2026-08-20',
    estimated_deadline: '15 dias',
    estimated_value: 9580.85,
    discount_value: 0,
    discount_percent: 0,
    bdi_percent: 0,
    margin_percent: 0,
    final_value: 9580.85,
    payment_method: 'PIX / Transferência',
    payment_terms: '50% na assinatura e 50% na entrega',
    internal_manager: 'Severino',
    internal_notes: 'SEGREDÓ INTERNO NÃO VAI PARA O CLIENTE',
    technical_notes: 'Nuvem de pontos densificada\nOrtoimagem\nMDT/MDS',
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

function multiStages(): MasterTopographyQuoteStageWithItems[] {
  const all = ynnovareItems();
  const a = all.slice(0, 3);
  const b = all.slice(3);
  return [
    {
      id: 's1',
      quote_id: 'q1',
      name: 'Campo',
      sort_order: 1,
      is_system: false,
      created_at: '',
      updated_at: '',
      items: a,
      itemCount: a.length,
      subtotal: 7080,
      percentOfBudget: 74,
    },
    {
      id: 's2',
      quote_id: 'q1',
      name: 'Escritório',
      sort_order: 2,
      is_system: false,
      created_at: '',
      updated_at: '',
      items: b.map((it, i) => ({ ...it, stage_id: 's2', sort_order: i + 1 })),
      itemCount: b.length,
      subtotal: 2500.85,
      percentOfBudget: 26,
    },
  ];
}

// --- Meaningful text ---
assert('rejeita null/undefined/traço', !isMeaningfulQuotePdfText(null) && !isMeaningfulQuotePdfText('—') && !isMeaningfulQuotePdfText('undefined'));
assert('aceita texto útil', isMeaningfulQuotePdfText('Marabá'));

// --- ORC-2026-0010 total ---
const fin = computeQuoteFinancials(
  ynnovareItems().map((i) => ({ quantity: i.quantity, unit_value: i.adopted_price })),
  0,
  0,
  0,
);
assert('ORC-2026-0010 total = 9580.85', fin.totalGeral === 9580.85);
assert(
  'valor global formatado BR',
  formatQuotePdfMoney(fin.totalGeral) === 'R$\u00a09.580,85' ||
    formatQuotePdfMoney(fin.totalGeral).replace(/\s/g, ' ') === 'R$ 9.580,85',
);

const breakdown = buildQuotePdfFinancialBreakdown(fin);
assert('global usa totalGeral do sistema', breakdown.totalGeral === fin.totalGeral);
assert('BDI zero não destaca', breakdown.showBdi === false);
assert('desconto zero não destaca', breakdown.showDiscount === false);
assert('margem zero não destaca', breakdown.showMargin === false);

const finBdi = computeQuoteFinancials(
  [{ quantity: 1, unit_value: 1000 }],
  25,
  10,
  5,
);
const brBdi = buildQuotePdfFinancialBreakdown(finBdi);
assert('BDI/desconto/margem ativos quando ≠ 0', brBdi.showBdi && brBdi.showDiscount && brBdi.showMargin);
assert('totalGeral com BDI/desconto inalterado na origem', brBdi.totalGeral === finBdi.totalGeral);

// --- Composition: etapa uma vez, sem código/banco nas colunas ---
const rows = buildQuotePdfCompositionRows(singleStage(), 0);
const stageRows = rows.filter((r) => r.kind === 'stage');
const itemRows = rows.filter((r) => r.kind === 'item');
assert('uma faixa de etapa', stageRows.length === 1);
assert('6 itens Ynnovare', itemRows.length === 6);
assert(
  'etapa aparece uma vez',
  stageRows[0].stageName.includes('Aerolevantamento') &&
    itemRows.every((r) => r.kind === 'item' && r.stageName === stageRows[0].stageName),
);
assert(
  'headers cliente sem Código/Banco',
  QUOTE_PDF_CLIENT_TABLE_HEADERS.join('|') ===
    'Descrição|Qtd.|Un.|Valor unitário|Total',
);

const multi = buildQuotePdfCompositionRows(multiStages(), 0);
const multiStagesOnly = multi.filter((r) => r.kind === 'stage').map((r) => r.stageName);
assert('várias etapas na ordem', multiStagesOnly.join('>') === 'Campo>Escritório');
assert(
  'itens associados às etapas',
  multi.filter((r) => r.kind === 'item' && r.stageName === 'Campo').length === 3 &&
    multi.filter((r) => r.kind === 'item' && r.stageName === 'Escritório').length === 3,
);

// --- Summary only filled ---
const summary = buildQuotePdfProposalSummary(baseQuote());
assert('resumo tem categoria', summary.some((f) => f.label === 'Categoria' && f.value === 'LiDAR'));
assert('resumo tem responsável', summary.some((f) => f.label === 'Responsável'));
assert(
  'resumo sem campos vazios',
  summary.every((f) => isMeaningfulQuotePdfText(f.value)),
);

const emptyish = buildQuotePdfProposalSummary(
  baseQuote({
    category: 'LIDAR',
    service_type: 'LIDAR',
    estimated_deadline: null,
    payment_method: null,
    internal_manager: null,
    city: null,
    state: null,
    distance_km: null,
    proposal_date: null,
    expiration_date: null,
  }),
);
assert(
  'sem prazo/pagamento vazios no resumo',
  !emptyish.some((f) => f.label === 'Prazo estimado' || f.label === 'Forma de pagamento'),
);

// --- Narrative sections ---
const quote = baseQuote();
const sections = buildQuotePdfNarrativeSections(quote);
assert(
  'descrição dos serviços presente',
  sections.some((s) => s.title === 'DESCRIÇÃO DOS SERVIÇOS'),
);
assert(
  'informações técnicas com quebras',
  sections.some(
    (s) =>
      s.title === 'INFORMAÇÕES TÉCNICAS' &&
      s.body.includes('Nuvem') &&
      s.body.includes('\n'),
  ),
);
assert(
  'condições comerciais presente',
  sections.some((s) => s.title === 'CONDIÇÕES COMERCIAIS'),
);

const rendered = [
  ...summary.map((f) => f.value),
  ...sections.map((s) => `${s.title}\n${s.body}`),
  breakdown.totalGeralFormatted,
];
assert(
  'observações internas fora do PDF',
  quotePdfClientTextExcludesInternalNotes(quote, rendered),
);

const noDesc = buildQuotePdfNarrativeSections(
  baseQuote({
    description: null,
    technical_notes: null,
    payment_method: null,
    payment_terms: null,
    estimated_deadline: null,
    expiration_date: null,
  }),
);
assert('sem seções vazias', noDesc.length === 0);

// --- Export wiring (source) ---
const exportsSrc = fs.readFileSync(
  path.join(process.cwd(), 'lib/master/topography/quoteExports.ts'),
  'utf8',
);
assert('PDF usa layout sintético', exportsSrc.includes('quotePdfSyntheticLayout'));
assert('PDF sem colunas Código/Banco no head cliente', !/head:\s*\[\s*\[[^\]]*Código[^\]]*Banco/.test(exportsSrc));
assert('PDF tem VALOR GLOBAL', exportsSrc.includes('VALOR GLOBAL DA PROPOSTA'));
assert('PDF tem RESUMO DA PROPOSTA', exportsSrc.includes('RESUMO DA PROPOSTA'));
assert('PDF exclui internal_notes do layout', !/internal_notes/.test(exportsSrc.split('exportQuotePdfSynthetic')[1]?.slice(0, 4000) || 'internal_notes'));
assert('CSV/Excel ainda têm Código/Banco', exportsSrc.includes("'Código'") && exportsSrc.includes("'Banco'"));
assert('analítico Fase 5.3 preservado', exportsSrc.includes('Fase 5.3'));
assert('orientação landscape preservada', exportsSrc.includes("orientation: 'landscape'"));

const layoutSrc = fs.readFileSync(
  path.join(process.cwd(), 'lib/master/topography/quotePdfSyntheticLayout.ts'),
  'utf8',
);
assert('estrutura futura produtos entregues', layoutSrc.includes('deliveredProducts'));

console.log(`\nTotal: ${pass} PASSOU / ${total - pass} FALHOU de ${total}`);
process.exit(pass === total ? 0 : 1);
