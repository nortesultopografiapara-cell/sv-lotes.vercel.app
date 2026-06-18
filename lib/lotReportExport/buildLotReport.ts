import {
  normalizeEnterpriseLotStatus,
  parseEnterpriseLotPrice,
} from '@/lib/enterpriseValueSummary';
import {
  enterpriseStatusLabel,
  parseLotReportNumber,
  sanitizeLotReportText,
} from '@/lib/lotReportExport/format';
import type {
  LotReportBlockRecord,
  LotReportBuildResult,
  LotReportGroup,
  LotReportGroupBy,
  LotReportGroupSummary,
  LotReportOptions,
  LotReportRow,
  LotReportSortBy,
  LotReportStatusFilters,
  LotReportSummary,
} from '@/lib/lotReportExport/types';

const STATUS_ORDER = ['available', 'reserved', 'sold', 'paid'] as const;

function compareLotNumbers(a: string, b: string): number {
  const na = Number(a.replace(/\D/g, ''));
  const nb = Number(b.replace(/\D/g, ''));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

export function mapBlockToLotReportRow(
  block: LotReportBlockRecord,
  projectNameById: Record<string, string>,
): LotReportRow {
  const projectId = sanitizeLotReportText(block.project_id);
  const projectName =
    sanitizeLotReportText(block.projects?.name) ||
    projectNameById[projectId] ||
    'Empreendimento';
  const blockName =
    sanitizeLotReportText(block.block_name) ||
    sanitizeLotReportText(block.name) ||
    '—';
  const lotNumber =
    sanitizeLotReportText(block.number) ||
    sanitizeLotReportText(block.lot_number) ||
    '—';
  const statusKey = normalizeEnterpriseLotStatus(block.status);

  return {
    projectId,
    projectName,
    blockName,
    lotNumber,
    areaM2: parseLotReportNumber(block.area),
    price: parseEnterpriseLotPrice(block.price),
    statusKey,
    statusLabel: enterpriseStatusLabel(statusKey),
  };
}

export function mapBlocksToLotReportRows(
  blocks: LotReportBlockRecord[],
  projectNameById: Record<string, string> = {},
): LotReportRow[] {
  return blocks.map((block) => mapBlockToLotReportRow(block, projectNameById));
}

export function filterLotReportRowsByStatus(
  rows: LotReportRow[],
  filters: LotReportStatusFilters,
): LotReportRow[] {
  return rows.filter((row) => {
    if (row.statusKey === 'available') return filters.includeAvailable;
    if (row.statusKey === 'reserved') return filters.includeReserved;
    if (row.statusKey === 'sold') return filters.includeSold;
    if (row.statusKey === 'paid') return filters.includePaid;
    return filters.includeAvailable;
  });
}

export function sortLotReportRows(
  rows: LotReportRow[],
  sortBy: LotReportSortBy,
): LotReportRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sortBy === 'valor_asc') return a.price - b.price;
    if (sortBy === 'valor_desc') return b.price - a.price;
    if (sortBy === 'status') {
      const ia = STATUS_ORDER.indexOf(a.statusKey);
      const ib = STATUS_ORDER.indexOf(b.statusKey);
      if (ia !== ib) return ia - ib;
    }
    const blockCmp = compareLotNumbers(a.blockName, b.blockName);
    if (blockCmp !== 0) return blockCmp;
    return compareLotNumbers(a.lotNumber, b.lotNumber);
  });
  return sorted;
}

export function computeLotReportGroupSummary(
  rows: LotReportRow[],
): LotReportGroupSummary {
  return rows.reduce(
    (acc, row) => ({
      count: acc.count + 1,
      totalArea: acc.totalArea + row.areaM2,
      totalValue: acc.totalValue + row.price,
    }),
    { count: 0, totalArea: 0, totalValue: 0 },
  );
}

export function computeLotReportSummary(rows: LotReportRow[]): LotReportSummary {
  const base = computeLotReportGroupSummary(rows);
  const summary: LotReportSummary = {
    totalLots: base.count,
    totalArea: base.totalArea,
    totalValue: base.totalValue,
    availableCount: 0,
    availableValue: 0,
    reservedCount: 0,
    reservedValue: 0,
    soldCount: 0,
    soldValue: 0,
    paidCount: 0,
    paidValue: 0,
  };

  for (const row of rows) {
    if (row.statusKey === 'available') {
      summary.availableCount += 1;
      summary.availableValue += row.price;
    } else if (row.statusKey === 'reserved') {
      summary.reservedCount += 1;
      summary.reservedValue += row.price;
    } else if (row.statusKey === 'sold') {
      summary.soldCount += 1;
      summary.soldValue += row.price;
    } else if (row.statusKey === 'paid') {
      summary.paidCount += 1;
      summary.paidValue += row.price;
    }
  }

  return summary;
}

function groupTitleForQuadra(blockName: string): string {
  return `QUADRA ${blockName}`;
}

function groupTitleForValor(price: number): string {
  return `VALOR: ${formatLotReportCurrencyGroupTitle(price)}`;
}

function formatLotReportCurrencyGroupTitle(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function groupTitleForStatus(statusLabel: string): string {
  return statusLabel.toUpperCase();
}

export function buildLotReportGroups(
  rows: LotReportRow[],
  groupBy: LotReportGroupBy,
): LotReportGroup[] {
  if (groupBy === 'none') {
    return [
      {
        key: 'all',
        title: '',
        rows,
        summary: computeLotReportGroupSummary(rows),
      },
    ];
  }

  const map = new Map<string, LotReportGroup>();

  for (const row of rows) {
    let key = '';
    let title = '';
    if (groupBy === 'quadra') {
      key = row.blockName;
      title = groupTitleForQuadra(row.blockName);
    } else if (groupBy === 'valor') {
      key = String(row.price);
      title = groupTitleForValor(row.price);
    } else {
      key = row.statusKey;
      title = groupTitleForStatus(row.statusLabel);
    }

    const existing = map.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      map.set(key, { key, title, rows: [row], summary: { count: 0, totalArea: 0, totalValue: 0 } });
    }
  }

  const groups = Array.from(map.values()).map((group) => ({
    ...group,
    summary: computeLotReportGroupSummary(group.rows),
  }));

  if (groupBy === 'valor') {
    groups.sort((a, b) => Number(a.key) - Number(b.key));
  } else if (groupBy === 'status') {
    groups.sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.key as (typeof STATUS_ORDER)[number]) -
        STATUS_ORDER.indexOf(b.key as (typeof STATUS_ORDER)[number]),
    );
  } else {
    groups.sort((a, b) => compareLotNumbers(a.key, b.key));
  }

  return groups;
}

export function buildLotReport(
  blocks: LotReportBlockRecord[],
  options: Pick<LotReportOptions, 'groupBy' | 'sortBy' | 'filters'>,
  projectNameById: Record<string, string> = {},
): LotReportBuildResult {
  const mapped = mapBlocksToLotReportRows(blocks, projectNameById);
  const filtered = filterLotReportRowsByStatus(mapped, options.filters);
  const sorted = sortLotReportRows(filtered, options.sortBy);
  const groups = buildLotReportGroups(sorted, options.groupBy);
  const summary = computeLotReportSummary(sorted);

  return { rows: sorted, groups, summary };
}

export function filterBlocksByProjectIds(
  blocks: LotReportBlockRecord[],
  projectIds: string[] | null,
): LotReportBlockRecord[] {
  if (!projectIds || projectIds.length === 0) return blocks;
  const allowed = new Set(projectIds);
  return blocks.filter((block) => allowed.has(String(block.project_id || '')));
}
