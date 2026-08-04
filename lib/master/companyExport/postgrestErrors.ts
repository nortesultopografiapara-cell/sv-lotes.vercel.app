/**
 * Classificação de erros PostgREST para exportação tabular.
 */

export type PostgrestErrorKind =
  | 'column_missing'
  | 'table_missing'
  | 'permission'
  | 'filter_or_relation'
  | 'network'
  | 'unexpected';

export function classifyPostgrestError(message: string): PostgrestErrorKind {
  const msg = String(message || '');
  if (!msg.trim()) return 'unexpected';

  if (
    /column .* does not exist/i.test(msg) ||
    /Could not find the '[^']+' column of/i.test(msg) ||
    (/Could not find the '/i.test(msg) && /column/i.test(msg))
  ) {
    return 'column_missing';
  }

  if (
    /Could not find the table/i.test(msg) ||
    /relation ["'].*["'] does not exist/i.test(msg) ||
    (/does not exist/i.test(msg) && /table|relation/i.test(msg))
  ) {
    return 'table_missing';
  }

  if (
    /permission denied|not authorized|rls|row-level security|JWT|PGRST301/i.test(
      msg,
    )
  ) {
    return 'permission';
  }

  if (
    /foreign key|violates|invalid input syntax|failed to parse|PGRST100|PGRST116/i.test(
      msg,
    )
  ) {
    return 'filter_or_relation';
  }

  if (/fetch failed|network|ECONN|ETIMEDOUT|timeout/i.test(msg)) {
    return 'network';
  }

  return 'unexpected';
}

export function sanitizeExportWarning(table: string, stage: string, reason: string): string {
  const clean = String(reason || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
  return `${table}/${stage}: ${clean}`;
}
