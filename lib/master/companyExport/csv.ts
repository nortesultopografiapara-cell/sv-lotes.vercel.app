/** CSV UTF-8 com BOM + helpers de serialização. */

export function rowsToCsv(rows: Record<string, unknown>[], columns: readonly string[]): string {
  const escape = (value: unknown): string => {
    if (value == null) return '';
    let s: string;
    if (typeof value === 'object') {
      try {
        s = JSON.stringify(value);
      } catch {
        s = String(value);
      }
    } else {
      s = String(value);
    }
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const header = columns.join(',');
  const lines = rows.map((row) => columns.map((c) => escape(row[c])).join(','));
  return `\uFEFF${[header, ...lines].join('\n')}`;
}

export function toIsoDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString();
}

export function sanitizeFilePart(value: string, max = 80): string {
  return (
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, max) || 'arquivo'
  );
}
