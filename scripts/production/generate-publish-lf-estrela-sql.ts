/**
 * Gera o SQL Production-safe para publicar LF ESTRELA (SQL Editor).
 * Não executa no banco. Não usa service role. Não interpola UUID DEVELOP.
 *
 * npx tsx scripts/production/generate-publish-lf-estrela-sql.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  assertNoLfEstrelaPageMarkers,
  buildLfEstrelaCustomHtml,
} from '../../lib/lfEstrelaCustomTemplate';
import {
  LF_ESTRELA_SQL_HTML_TAG_PRODUCTION,
  assertLfEstrelaSqlHtmlMatchesOfficial,
} from '../develop/lfEstrelaPublishSqlHtml';
import {
  PRODUCTION_BODY_TAG,
  PRODUCTION_HTML_TAG,
  assertNoDevelopUuids,
  assertProductionSqlSafety,
  buildProductionSqlBundle,
  resolveSourceCommit,
} from './lfEstrelaProductionPublish';

const OUT_DIR = join(__dirname, 'sql');

function main() {
  const html = buildLfEstrelaCustomHtml();
  assertNoLfEstrelaPageMarkers(html, 'SQL LF ESTRELA Production');
  if (
    html.includes(`$${PRODUCTION_HTML_TAG}$`) ||
    html.includes(`$${PRODUCTION_BODY_TAG}$`)
  ) {
    throw new Error('HTML contém o delimitador dollar-quote — recusar geração.');
  }
  if (!html.includes('data-sv-if="spouse"') || !html.includes('{{PARTNERSHIP_NOTE}}')) {
    throw new Error('HTML oficial incompleto (cônjuge / PARTNERSHIP_NOTE).');
  }

  const sourceCommit = resolveSourceCommit();
  const previewMatch = assertLfEstrelaSqlHtmlMatchesOfficial(
    `$${LF_ESTRELA_SQL_HTML_TAG_PRODUCTION}$\n${html}\n$${LF_ESTRELA_SQL_HTML_TAG_PRODUCTION}$`,
    html,
    LF_ESTRELA_SQL_HTML_TAG_PRODUCTION,
  );

  const bundle = buildProductionSqlBundle({
    html,
    htmlSha256: previewMatch.sha256,
    sourceCommit,
  });

  const files: Array<[string, string]> = [
    ['diagnose-lf-estrela.production.sql', bundle.diagnose],
    ['publish-lf-estrela.production.sql', bundle.publish],
    ['verify-lf-estrela.production.sql', bundle.verify],
    ['rollback-lf-estrela.production.sql', bundle.rollback],
  ];

  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, sql] of files) {
    assertProductionSqlSafety(sql, name);
    assertNoDevelopUuids(sql, name);
    const out = join(OUT_DIR, name);
    writeFileSync(out, sql, 'utf8');
  }

  const publishMatch = assertLfEstrelaSqlHtmlMatchesOfficial(
    bundle.publish,
    html,
    LF_ESTRELA_SQL_HTML_TAG_PRODUCTION,
  );

  console.log(
    JSON.stringify(
      {
        outDir: OUT_DIR,
        files: files.map(([name]) => name),
        htmlChars: publishMatch.chars,
        sha256: publishMatch.sha256,
        md5: bundle.htmlMd5,
        sourceCommit,
      },
      null,
      2,
    ),
  );
}

main();
