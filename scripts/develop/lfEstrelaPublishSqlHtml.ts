/**
 * Extrai o HTML dollar-quoted do SQL DEVELOP de publicação LF ESTRELA
 * e compara com buildLfEstrelaCustomHtml().
 *
 * O gerador interpola o retorno oficial entre $lf_estrela_html_v1$ ... $.
 * Nenhum texto jurídico deve ser copiado à mão.
 */
import { createHash } from 'node:crypto';

export const LF_ESTRELA_SQL_HTML_TAG = 'lf_estrela_html_v1';

export function extractLfEstrelaHtmlFromDevelopPublishSql(sql: string): string {
  const open = `$${LF_ESTRELA_SQL_HTML_TAG}$`;
  const first = sql.indexOf(open);
  if (first < 0) {
    throw new Error('SQL DEVELOP sem delimitador $lf_estrela_html_v1$ de abertura');
  }
  const second = sql.indexOf(open, first + open.length);
  if (second < 0) {
    throw new Error('SQL DEVELOP sem delimitador $lf_estrela_html_v1$ de fechamento');
  }
  let inner = sql.slice(first + open.length, second);
  if (inner.startsWith('\n')) inner = inner.slice(1);
  if (inner.endsWith('\n')) inner = inner.slice(0, -1);
  return inner;
}

export function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function assertLfEstrelaSqlHtmlMatchesOfficial(sql: string, officialHtml: string): {
  chars: number;
  sha256: string;
} {
  const fromSql = extractLfEstrelaHtmlFromDevelopPublishSql(sql);
  if (fromSql !== officialHtml) {
    throw new Error(
      `HTML do SQL DEVELOP diverge de buildLfEstrelaCustomHtml() (sql=${fromSql.length} oficial=${officialHtml.length})`,
    );
  }
  const sqlHash = sha256Utf8(fromSql);
  const officialHash = sha256Utf8(officialHtml);
  if (sqlHash !== officialHash) {
    throw new Error('SHA-256 do HTML do SQL diverge da fonte oficial');
  }
  return { chars: officialHtml.length, sha256: officialHash };
}
