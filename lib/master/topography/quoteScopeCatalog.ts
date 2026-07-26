/**
 * Catálogos tipados — equipamentos/recursos e produtos entregues (orçamentos).
 * Itens selecionados são gravados como snapshot no orçamento (não dependem do catálogo futuro).
 */

export type QuoteScopeItemSource = 'catalog' | 'custom';

export type QuoteScopeCatalogOption = {
  id: string;
  label: string;
  category?: string;
};

export type QuoteScopeSelectedItem = {
  id: string;
  label: string;
  source: QuoteScopeItemSource;
};

export const QUOTE_SCOPE_MAX_TECHNICAL_RESOURCES = 50;
export const QUOTE_SCOPE_MAX_DELIVERABLES = 100;
export const QUOTE_SCOPE_MAX_LABEL_LENGTH = 150;

/** Equipamentos e recursos técnicos (físicos + software). */
export const technicalResourcesCatalog: readonly QuoteScopeCatalogOption[] = [
  { id: 'tr-dji-matrice-350-rtk', label: 'DJI Matrice 350 RTK', category: 'Aeronave' },
  { id: 'tr-dji-zenmuse-l2', label: 'DJI Zenmuse L2', category: 'Sensor' },
  { id: 'tr-dji-phantom-4-pro', label: 'DJI Phantom 4 Pro', category: 'Aeronave' },
  { id: 'tr-gnss-rtk', label: 'Receptor GNSS RTK', category: 'Posicionamento' },
  { id: 'tr-estacao-total', label: 'Estação Total', category: 'Topografia' },
  { id: 'tr-nivel-digital', label: 'Nível Digital', category: 'Topografia' },
  { id: 'tr-drone-aerofoto', label: 'Drone aerofotogramétrico', category: 'Aeronave' },
  { id: 'tr-veiculo-apoio', label: 'Veículo de apoio', category: 'Apoio' },
  { id: 'tr-computador-proc', label: 'Computador para processamento', category: 'Apoio' },
  { id: 'tr-dji-terra', label: 'DJI Terra', category: 'Software' },
  { id: 'tr-agisoft-metashape', label: 'Agisoft Metashape', category: 'Software' },
  { id: 'tr-civil-3d', label: 'Autodesk Civil 3D', category: 'Software' },
  { id: 'tr-qgis', label: 'QGIS', category: 'Software' },
  {
    id: 'tr-software-especializado',
    label: 'Software especializado de processamento',
    category: 'Software',
  },
] as const;

/** Produtos e dados entregues ao cliente. */
export const deliverablesCatalog: readonly QuoteScopeCatalogOption[] = [
  { id: 'dl-dados-brutos', label: 'Dados brutos do levantamento', category: 'Dados brutos' },
  { id: 'dl-brutos-lidar', label: 'Arquivos brutos LiDAR', category: 'Dados brutos' },
  { id: 'dl-trajetoria', label: 'Arquivos de trajetória', category: 'Dados brutos' },
  { id: 'dl-dados-gnss', label: 'Dados GNSS', category: 'Dados brutos' },
  { id: 'dl-relatorio-proc', label: 'Relatório de processamento', category: 'Relatórios' },
  { id: 'dl-nuvem-las', label: 'Nuvem de pontos LAS', category: 'Nuvem de pontos' },
  { id: 'dl-nuvem-laz', label: 'Nuvem de pontos LAZ', category: 'Nuvem de pontos' },
  {
    id: 'dl-nuvem-classificada',
    label: 'Nuvem de pontos classificada',
    category: 'Nuvem de pontos',
  },
  {
    id: 'dl-mdt',
    label: 'Modelo Digital do Terreno — MDT',
    category: 'Modelos digitais',
  },
  {
    id: 'dl-mds',
    label: 'Modelo Digital de Superfície — MDS',
    category: 'Modelos digitais',
  },
  {
    id: 'dl-mde',
    label: 'Modelo Digital de Elevação — MDE',
    category: 'Modelos digitais',
  },
  { id: 'dl-curvas-nivel', label: 'Curvas de nível', category: 'Cartografia' },
  { id: 'dl-ortoimagem', label: 'Ortoimagem', category: 'Cartografia' },
  { id: 'dl-ortomosaico', label: 'Ortomosaico', category: 'Cartografia' },
  { id: 'dl-planta-topo', label: 'Planta topográfica', category: 'Cartografia' },
  { id: 'dl-planta-planialt', label: 'Planta planialtimétrica', category: 'Cartografia' },
  { id: 'dl-perfil-long', label: 'Perfil longitudinal', category: 'Cartografia' },
  { id: 'dl-secoes-transv', label: 'Seções transversais', category: 'Cartografia' },
  { id: 'dl-memorial', label: 'Memorial descritivo', category: 'Relatórios' },
  { id: 'dl-relatorio-tec', label: 'Relatório técnico', category: 'Relatórios' },
  { id: 'dl-dwg', label: 'Arquivo DWG', category: 'Formatos digitais' },
  { id: 'dl-dxf', label: 'Arquivo DXF', category: 'Formatos digitais' },
  { id: 'dl-kml', label: 'Arquivo KML', category: 'Formatos digitais' },
  { id: 'dl-kmz', label: 'Arquivo KMZ', category: 'Formatos digitais' },
  { id: 'dl-shp', label: 'Shapefile', category: 'Formatos digitais' },
  { id: 'dl-geojson', label: 'GeoJSON', category: 'Formatos digitais' },
  { id: 'dl-pdf', label: 'PDF', category: 'Formatos digitais' },
  { id: 'dl-planilha-coord', label: 'Planilha de coordenadas', category: 'Relatórios' },
  { id: 'dl-monografia', label: 'Monografia dos marcos', category: 'Relatórios' },
  { id: 'dl-fotos-campo', label: 'Fotografias de campo', category: 'Relatórios' },
] as const;

export function normalizeQuoteScopeLabelKey(label: string): string {
  return String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeQuoteScopeLabel(raw: unknown): string {
  if (raw == null) return '';
  return String(raw)
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, QUOTE_SCOPE_MAX_LABEL_LENGTH);
}

export function newQuoteScopeCustomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function findCatalogOptionByLabel(
  catalog: readonly QuoteScopeCatalogOption[],
  label: string,
): QuoteScopeCatalogOption | undefined {
  const key = normalizeQuoteScopeLabelKey(label);
  return catalog.find((o) => normalizeQuoteScopeLabelKey(o.label) === key);
}

export function parseQuoteScopeSelectedList(
  raw: unknown,
  opts: { maxItems: number; fieldLabel: string },
): QuoteScopeSelectedItem[] {
  if (raw == null || raw === '') return [];
  let arr: unknown[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
      else throw new Error(`${opts.fieldLabel}: formato inválido.`);
    } catch {
      throw new Error(`${opts.fieldLabel}: JSON inválido.`);
    }
  } else {
    throw new Error(`${opts.fieldLabel}: deve ser uma lista.`);
  }

  if (arr.length > opts.maxItems) {
    throw new Error(`${opts.fieldLabel}: máximo de ${opts.maxItems} itens.`);
  }

  const out: QuoteScopeSelectedItem[] = [];
  const seen = new Set<string>();

  for (const entry of arr) {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`${opts.fieldLabel}: item inválido.`);
    }
    const row = entry as Record<string, unknown>;
    const label = sanitizeQuoteScopeLabel(row.label);
    if (!label) throw new Error(`${opts.fieldLabel}: item com rótulo vazio.`);

    const sourceRaw = String(row.source || 'custom').toLowerCase();
    const source: QuoteScopeItemSource =
      sourceRaw === 'catalog' ? 'catalog' : 'custom';

    let id = String(row.id || '').trim().slice(0, 80);
    if (!id) id = source === 'custom' ? newQuoteScopeCustomId() : normalizeQuoteScopeLabelKey(label);

    const key = normalizeQuoteScopeLabelKey(label);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ id, label, source });
  }

  return out;
}

export function quoteScopeLabels(items: QuoteScopeSelectedItem[]): string[] {
  return items.map((i) => i.label).filter(Boolean);
}

export function formatQuoteScopeLabelsProse(items: QuoteScopeSelectedItem[]): string {
  const labels = quoteScopeLabels(items);
  if (!labels.length) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  return `${labels.slice(0, -1).join('; ')}; e ${labels[labels.length - 1]}`;
}
