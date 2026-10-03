/**
 * Extrai o HTML dollar-quoted dos SQL de publicação LF ESTRELA
 * e compara com buildLfEstrelaCustomHtml().
 *
 * Nenhum texto jurídico deve ser copiado à mão.
 */
import { createHash } from 'node:crypto';

export const LF_ESTRELA_SQL_HTML_TAG = 'lf_estrela_html_v1';
export const LF_ESTRELA_SQL_HTML_TAG_PRODUCTION = 'lf_estrela_html_prod';

export function extractLfEstrelaHtmlFromDollarQuotedSql(
  sql: string,
  tag: string,
): string {
  const open = `$${tag}$`;
  const first = sql.indexOf(open);
  if (first < 0) {
    throw new Error(`SQL sem delimitador $${tag}$ de abertura`);
  }
  const second = sql.indexOf(open, first + open.length);
  if (second < 0) {
    throw new Error(`SQL sem delimitador $${tag}$ de fechamento`);
  }
  let inner = sql.slice(first + open.length, second);
  if (inner.startsWith('\n')) inner = inner.slice(1);
  if (inner.endsWith('\n')) inner = inner.slice(0, -1);
  return inner;
}

export function extractLfEstrelaHtmlFromDevelopPublishSql(sql: string): string {
  return extractLfEstrelaHtmlFromDollarQuotedSql(sql, LF_ESTRELA_SQL_HTML_TAG);
}

export function extractLfEstrelaHtmlFromProductionPublishSql(sql: string): string {
  return extractLfEstrelaHtmlFromDollarQuotedSql(
    sql,
    LF_ESTRELA_SQL_HTML_TAG_PRODUCTION,
  );
}

export function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function md5Utf8(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex');
}

export function assertLfEstrelaSqlHtmlMatchesOfficial(
  sql: string,
  officialHtml: string,
  tag: string = LF_ESTRELA_SQL_HTML_TAG,
): {
  chars: number;
  sha256: string;
  md5: string;
} {
  const fromSql = extractLfEstrelaHtmlFromDollarQuotedSql(sql, tag);
  if (fromSql !== officialHtml) {
    throw new Error(
      `HTML do SQL diverge de buildLfEstrelaCustomHtml() (sql=${fromSql.length} oficial=${officialHtml.length})`,
    );
  }
  const sqlHash = sha256Utf8(fromSql);
  const officialHash = sha256Utf8(officialHtml);
  if (sqlHash !== officialHash) {
    throw new Error('SHA-256 do HTML do SQL diverge da fonte oficial');
  }
  return {
    chars: officialHtml.length,
    sha256: officialHash,
    md5: md5Utf8(officialHtml),
  };
}
