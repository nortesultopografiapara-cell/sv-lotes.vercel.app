/**
 * Validação offline do layout PDF sintético com dados ORC-2026-0010.
 */
import fs from 'fs';
import path from 'path';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { computeQuoteFinancials } from '../lib/master/topography/quoteFinancials';
import {
  buildQuotePdfCompositionRows,
  buildQuotePdfFinancialBreakdown,
  buildQuotePdfNarrativeSections,
  buildQuotePdfProposalSummary,
  formatQuotePdfMoney,
  QUOTE_PDF_CLIENT_TABLE_HEADERS,
  resolveQuotePdfDisplayUnitPrice,
} from '../lib/master/topography/quotePdfSyntheticLayout';

const prices = [1850, 980, 4250, 1480.85, 620, 400];
const descs = [
  'Mobilização e desmobilização',
  'Levantamento GNSS',
  'Aerolevantamento LiDAR',
  'Processamento nuvem',
  'Entrega produtos',
  'Relatório técnico',
];

const items = prices.map((p, i) => ({
  id: `i${i}`,
  quote_id: 'q1',
  stage_id: 's1',
  code: String(i + 1).padStart(6, '0'),
  price_bank: 'PROPRIO' as const,
  description: descs[i],
  unit: 'UN',
  quantity: 1,
  unit_value: p,
  reference_price: p,
  adopted_price: p,
  competence: null,
  uf: null,
  notes: null,
  catalog_item_id: null,
  custom_item_id: null,
  sort_order: i + 1,
  created_at: '',
  updated_at: '',
}));

const stages = [
  {
    id: 's1',
    quote_id: 'q1',
    name: 'Execução do Aerolevantamento LiDAR – Marabá/PA (2,55 ha)',
    sort_order: 1,
    is_system: false,
    created_at: '',
    updated_at: '',
    items,
    itemCount: 6,
    subtotal: 9580.85,
    percentOfBudget: 100,
  },
];

const quote = {
  id: 'q1',
  code: 'ORC-2026-0010',
  title: stages[0].name,
  client_name: 'Ynnovare Topografia e Serviços Ltda.',
  contact_name: null,
  phone: null,
  email: null,
  city: 'Marabá',
  state: 'PA',
  address: null,
  distance_km: null,
  category: 'LIDAR' as const,
  service_type: 'LIDAR' as const,
  description: 'Execução completa',
  status: 'RASCUNHO' as const,
  proposal_date: '2026-07-20',
  expiration_date: '2026-08-20',
  estimated_deadline: '15 dias',
  estimated_value: 9580.85,
  discount_value: 0,
  discount_percent: 0,
  bdi_percent: 0,
  margin_percent: 0,
  final_value: 9580.85,
  payment_method: 'PIX',
  payment_terms: '50/50',
  internal_manager: 'Severino',
  internal_notes: 'SEGREDÓ INTERNO',
  technical_notes: 'Produto A\nProduto B',
  approved_at: null,
  approved_by: null,
  converted_project_id: null,
  is_archived: false,
  created_by: null,
  created_at: '',
  updated_at: '',
};

const financials = computeQuoteFinancials(
  items.map((i) => ({ quantity: i.quantity, unit_value: i.adopted_price })),
  0,
  0,
  0,
);

const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
doc.text(`Orçamento ${quote.code}`, 14, 14);
doc.text(quote.client_name, 14, 20);
doc.text('RESUMO DA PROPOSTA', 14, 28);
buildQuotePdfProposalSummary(quote);

const composition = buildQuotePdfCompositionRows(stages, 0);
const body = composition.map((r) =>
  r.kind === 'stage'
    ? [{ content: r.stageName, colSpan: 5 }]
    : [
        r.description,
        r.quantity,
        r.unit,
        formatQuotePdfMoney(resolveQuotePdfDisplayUnitPrice(r.unitPrice, 0)),
        formatQuotePdfMoney(r.total),
      ],
);

autoTable(doc, {
  startY: 32,
  head: [Array.from(QUOTE_PDF_CLIENT_TABLE_HEADERS)],
  body,
});

const br = buildQuotePdfFinancialBreakdown(financials);
const y =
  ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 40) + 10;
doc.text(`VALOR GLOBAL DA PROPOSTA ${br.totalGeralFormatted}`, 14, y);

const sections = buildQuotePdfNarrativeSections(quote);
const outDir = path.join(process.cwd(), 'tmp');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'orc-2026-0010-sintetico-validacao.pdf');
fs.writeFileSync(outPath, Buffer.from(doc.output('arraybuffer')));

const ok =
  br.totalGeral === 9580.85 &&
  composition.filter((r) => r.kind === 'stage').length === 1 &&
  composition.filter((r) => r.kind === 'item').length === 6 &&
  !sections.some((s) => s.body.includes('SEGREDÓ')) &&
  QUOTE_PDF_CLIENT_TABLE_HEADERS.length === 5 &&
  !QUOTE_PDF_CLIENT_TABLE_HEADERS.includes('Código' as never);

console.log(
  JSON.stringify(
    {
      ok,
      bytes: fs.statSync(outPath).size,
      total: br.totalGeral,
      path: outPath,
      sections: sections.map((s) => s.title),
    },
    null,
    2,
  ),
);

if (!ok) process.exit(1);
