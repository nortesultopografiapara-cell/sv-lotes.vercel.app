/**
 * Gera os 3 PDFs do ORC-2026-0010 para revisão visual Fase 5.3.
 * npx tsx scripts/generate-orc-2026-0010-phase53-pdfs.ts
 */
import fs from 'fs';
import path from 'path';
import { computeQuoteFinancials } from '../lib/master/topography/quoteFinancials';
import { buildQuotePdfSyntheticBytes } from '../lib/master/topography/quoteExports';
import { buildQuotePdfAnalyticalBytes } from '../lib/master/topography/quotePdfAnalytical';
import { buildQuotePdfMemorialBytes } from '../lib/master/topography/quotePdfMemorial';
import type {
  MasterTopographyQuote,
  MasterTopographyQuoteStageWithItems,
} from '../lib/master/topography/quoteTypes';

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
  calculation_notes: i === 0 ? 'Equipe 2; deslocamento 210 km.' : null,
  catalog_item_id: null,
  custom_item_id: null,
  sort_order: i + 1,
  created_at: '',
  updated_at: '',
}));

const stages: MasterTopographyQuoteStageWithItems[] = [
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

const quote: MasterTopographyQuote = {
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
  mobilization_deadline_text: '1 dia',
  field_duration_text: '2 dias',
  processing_deadline_text: '1 dia',
  delivery_deadline_text: '1 dia',
  total_deadline_text: '5 dias',
  methodology_notes: null,
  professional_name: 'Severino José de França',
  professional_title: 'Responsável técnico',
  professional_council: 'CFT/CRT',
  professional_registration: '12345',
  professional_registration_uf: 'PA',
  estimated_value: 9580.85,
  discount_value: 0,
  discount_percent: 0,
  bdi_percent: 0,
  margin_percent: 0,
  final_value: 9580.85,
  payment_method: '50% na contratação e 50% na entrega',
  payment_terms: 'PIX ou transferência bancária',
  internal_manager: 'Severino José de França',
  internal_notes: 'INTERNO',
  technical_notes:
    'DJI Terra e softwares especializados para processamento. Precisão relativa conforme projeto.',
  technical_resources: [
    { id: 'tr-dji-matrice-350-rtk', label: 'DJI Matrice 350 RTK', source: 'catalog' },
    { id: 'tr-dji-zenmuse-l2', label: 'DJI Zenmuse L2', source: 'catalog' },
    { id: 'tr-gnss-rtk', label: 'Receptor GNSS RTK', source: 'catalog' },
    { id: 'tr-dji-terra', label: 'DJI Terra', source: 'catalog' },
    {
      id: 'custom-soft',
      label: 'Softwares especializados para processamento',
      source: 'custom',
    },
  ],
  deliverables: [
    { id: 'dl-dados-brutos', label: 'Dados brutos do levantamento', source: 'catalog' },
    { id: 'dl-nuvem-las', label: 'Nuvem de pontos LAS', source: 'catalog' },
    { id: 'dl-mdt', label: 'Modelo Digital do Terreno — MDT', source: 'catalog' },
    { id: 'dl-relatorio-tec', label: 'Relatório técnico', source: 'catalog' },
  ],
  approved_at: null,
  approved_by: null,
  converted_project_id: null,
  is_archived: false,
  created_by: null,
  created_at: '',
  updated_at: '',
};

async function main() {
  const financials = computeQuoteFinancials(
    items.map((i) => ({ quantity: i.quantity, unit_value: i.adopted_price })),
    0,
    0,
    0,
  );
  const payload = { quote, stages, financials };
  const outDir = path.join(process.cwd(), 'tmp-pdf-review');
  fs.mkdirSync(outDir, { recursive: true });

  const synth = await buildQuotePdfSyntheticBytes(payload);
  const anal = await buildQuotePdfAnalyticalBytes(payload);
  const mem = await buildQuotePdfMemorialBytes(payload);

  fs.writeFileSync(path.join(outDir, 'ORC-2026-0010-sintetico.pdf'), synth.bytes);
  fs.writeFileSync(path.join(outDir, 'ORC-2026-0010-analitico.pdf'), anal.bytes);
  fs.writeFileSync(path.join(outDir, 'ORC-2026-0010-memorial-calculo.pdf'), mem.bytes);

  console.log(
    JSON.stringify(
      {
        totalGeral: financials.totalGeral,
        pages: {
          sintetico: synth.pageCount,
          analitico: anal.pageCount,
          memorial: mem.pageCount,
        },
        outDir,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
