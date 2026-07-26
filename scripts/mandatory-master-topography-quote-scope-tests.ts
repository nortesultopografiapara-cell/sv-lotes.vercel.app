/**
 * Testes — escopo técnico e entregáveis (orçamentos Master Topografia).
 * npx tsx scripts/mandatory-master-topography-quote-scope-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  deliverablesCatalog,
  findCatalogOptionByLabel,
  formatQuoteScopeLabelsProse,
  normalizeQuoteScopeLabelKey,
  parseQuoteScopeSelectedList,
  QUOTE_SCOPE_MAX_DELIVERABLES,
  QUOTE_SCOPE_MAX_LABEL_LENGTH,
  QUOTE_SCOPE_MAX_TECHNICAL_RESOURCES,
  sanitizeQuoteScopeLabel,
  technicalResourcesCatalog,
} from '../lib/master/topography/quoteScopeCatalog';
import { validateTopographyQuoteInput } from '../lib/master/topography/quoteValidation';
import { buildQuotePdfNarrativeSections } from '../lib/master/topography/quotePdfSyntheticLayout';
import type { MasterTopographyQuote } from '../lib/master/topography/quoteTypes';

let pass = 0;
let total = 0;

function assert(name: string, ok: boolean) {
  total++;
  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — ${name}`);
  if (ok) pass++;
}

const root = process.cwd();
const mig = path.join(
  root,
  'supabase/migrations/20260830120000_master_topography_quotes_scope_deliverables.sql',
);
assert('migration existe', fs.existsSync(mig));
const migSql = fs.readFileSync(mig, 'utf8');
assert('migration cria technical_resources', migSql.includes('technical_resources jsonb'));
assert('migration cria deliverables', migSql.includes('deliverables jsonb'));
assert('migration default []', migSql.includes("DEFAULT '[]'::jsonb"));

assert('catálogo equipamentos >= 10', technicalResourcesCatalog.length >= 10);
assert('catálogo entregáveis >= 20', deliverablesCatalog.length >= 20);
assert(
  'Matrice no catálogo',
  !!findCatalogOptionByLabel(technicalResourcesCatalog, 'DJI Matrice 350 RTK'),
);
assert(
  'LAS no catálogo',
  !!findCatalogOptionByLabel(deliverablesCatalog, 'Nuvem de pontos LAS'),
);

assert(
  'normaliza acentos',
  normalizeQuoteScopeLabelKey('Nível Digital') ===
    normalizeQuoteScopeLabelKey('Nivel Digital'),
);
assert('sanitiza HTML', sanitizeQuoteScopeLabel('<b>MDT</b>') === 'MDT');
assert(
  'limite label',
  sanitizeQuoteScopeLabel('x'.repeat(200)).length === QUOTE_SCOPE_MAX_LABEL_LENGTH,
);

const selected = parseQuoteScopeSelectedList(
  [
    { id: 'tr-dji-matrice-350-rtk', label: 'DJI Matrice 350 RTK', source: 'catalog' },
    { id: 'c1', label: 'Softwares especializados para processamento', source: 'custom' },
    { id: 'dup', label: 'dji matrice 350 rtk', source: 'custom' },
  ],
  { maxItems: QUOTE_SCOPE_MAX_TECHNICAL_RESOURCES, fieldLabel: 'Equipamentos' },
);
assert('seleção preserva ordem', selected[0].label === 'DJI Matrice 350 RTK');
assert('item personalizado aceito', selected.some((s) => s.source === 'custom'));
assert('deduplica acentos/case', selected.length === 2);

let emptyFailed = false;
try {
  parseQuoteScopeSelectedList([{ id: 'x', label: '  ', source: 'custom' }], {
    maxItems: 10,
    fieldLabel: 'Equipamentos',
  });
} catch {
  emptyFailed = true;
}
assert('rejeita rótulo vazio', emptyFailed);

let overFailed = false;
try {
  parseQuoteScopeSelectedList(
    Array.from({ length: QUOTE_SCOPE_MAX_TECHNICAL_RESOURCES + 1 }, (_, i) => ({
      id: `i${i}`,
      label: `Item ${i}`,
      source: 'custom',
    })),
    { maxItems: QUOTE_SCOPE_MAX_TECHNICAL_RESOURCES, fieldLabel: 'Equipamentos' },
  );
} catch {
  overFailed = true;
}
assert('máximo equipamentos', overFailed);
assert('máximo produtos constante', QUOTE_SCOPE_MAX_DELIVERABLES === 100);

const prose = formatQuoteScopeLabelsProse(selected);
assert('prosa com e', prose.includes(' e '));

const baseInput = {
  client_name: 'Ynnovare',
  category: 'LIDAR',
  service_type: 'LIDAR',
  status: 'RASCUNHO',
  technical_resources: selected,
  deliverables: [
    { id: 'dl-nuvem-las', label: 'Nuvem de pontos LAS', source: 'catalog' },
    { id: 'c2', label: 'Ortoimagem, quando aplicável', source: 'custom' },
  ],
};
const validated = validateTopographyQuoteInput(baseInput);
assert('validação inclui equipamentos', validated.technical_resources?.length === 2);
assert('validação inclui entregáveis', validated.deliverables?.length === 2);

const quote = {
  id: 'q1',
  code: 'ORC-2026-0010',
  title: 'LiDAR',
  client_name: 'Ynnovare',
  contact_name: null,
  phone: null,
  email: null,
  city: 'Marabá',
  state: 'PA',
  address: null,
  distance_km: 210,
  category: 'LIDAR',
  service_type: 'LIDAR',
  description: 'Aerolevantamento',
  status: 'RASCUNHO',
  proposal_date: '2026-07-25',
  expiration_date: '2026-08-10',
  estimated_deadline: '5 dias',
  mobilization_deadline_text: null,
  field_duration_text: null,
  processing_deadline_text: null,
  delivery_deadline_text: null,
  total_deadline_text: null,
  methodology_notes: null,
  professional_name: null,
  professional_title: null,
  professional_council: null,
  professional_registration: null,
  professional_registration_uf: null,
  estimated_value: 9580.85,
  discount_value: 0,
  discount_percent: 0,
  bdi_percent: 0,
  margin_percent: 0,
  final_value: 9580.85,
  payment_method: '50% na contratação e 50% na entrega',
  payment_terms: null,
  internal_manager: null,
  internal_notes: 'INTERNO',
  technical_notes: 'Precisão relativa prevista conforme projeto.',
  technical_resources: validated.technical_resources!,
  deliverables: validated.deliverables!,
  approved_at: null,
  approved_by: null,
  converted_project_id: null,
  is_archived: false,
  created_by: null,
  created_at: '',
  updated_at: '',
} as MasterTopographyQuote;

const sections = buildQuotePdfNarrativeSections(quote);
assert(
  'PDF técnicas com equipamentos',
  sections.some(
    (s) =>
      s.title === 'INFORMAÇÕES TÉCNICAS' &&
      s.body.includes('Equipamentos e recursos previstos') &&
      s.body.includes('DJI Matrice 350 RTK'),
  ),
);
assert(
  'PDF técnicas com complementar',
  sections.some(
    (s) =>
      s.title === 'INFORMAÇÕES TÉCNICAS' &&
      s.body.includes('Precisão relativa prevista'),
  ),
);
assert(
  'PDF produtos checklist',
  sections.some(
    (s) =>
      s.title === 'PRODUTOS E DADOS ENTREGUES' &&
      s.layout === 'checklist' &&
      s.checklistItems?.includes('Nuvem de pontos LAS') &&
      s.checklistItems?.includes('Ortoimagem, quando aplicável'),
  ),
);

const oldQuote = {
  ...quote,
  technical_resources: [],
  deliverables: [],
  technical_notes: 'Equipamentos previstos:\nDJI Matrice 350 RTK\nDJI Terra',
};
const oldSections = buildQuotePdfNarrativeSections(oldQuote);
assert(
  'orçamento antigo sem seção produtos vazia',
  !oldSections.some((s) => s.title === 'PRODUTOS E DADOS ENTREGUES'),
);
assert(
  'orçamento antigo mantém texto técnico',
  oldSections.some(
    (s) => s.title === 'INFORMAÇÕES TÉCNICAS' && s.body.includes('DJI Matrice 350 RTK'),
  ),
);
assert(
  'interno fora do PDF',
  !sections.some((s) => s.body.includes('INTERNO')),
);

const serviceSrc = fs.readFileSync(
  path.join(root, 'lib/master/topography/quotesService.ts'),
  'utf8',
);
assert('service seleciona technical_resources', serviceSrc.includes('technical_resources'));
assert('service seleciona deliverables', serviceSrc.includes('deliverables'));

const editorSrc = fs.readFileSync(
  path.join(root, 'components/master/topography/quotes/TopographyQuoteEditPage.tsx'),
  'utf8',
);
assert('editor com escopo', editorSrc.includes('ESCOPO TÉCNICO E ENTREGÁVEIS'));
assert('editor multi-select', editorSrc.includes('QuoteScopeMultiSelect'));

console.log(`\nTotal: ${pass} PASSOU / ${total - pass} FALHOU de ${total}`);
process.exit(pass === total ? 0 : 1);
