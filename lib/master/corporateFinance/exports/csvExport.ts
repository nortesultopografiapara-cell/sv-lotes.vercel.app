/** CSV UTF-8 com BOM — exportações corporativas. */

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/** Número com vírgula decimal (pt-BR), sem corromper casas. */
export function csvNumberBr(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '';
  return Number(value).toFixed(2).replace('.', ',');
}

export function buildCorporateCsv(params: {
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
  summaryLines?: Array<[string, string | number | null | undefined]>;
}): string {
  const lines: string[] = [];
  lines.push(params.headers.map(escapeCsvCell).join(';'));
  for (const row of params.rows) {
    lines.push(row.map(escapeCsvCell).join(';'));
  }
  if (params.summaryLines?.length) {
    lines.push('');
    for (const [label, value] of params.summaryLines) {
      lines.push([escapeCsvCell(label), escapeCsvCell(value)].join(';'));
    }
  }
  // BOM para Excel reconhecer UTF-8
  return `\uFEFF${lines.join('\r\n')}`;
}

export function assertCsvHasBom(csv: string): boolean {
  return csv.charCodeAt(0) === 0xfeff || csv.startsWith('\uFEFF');
}
