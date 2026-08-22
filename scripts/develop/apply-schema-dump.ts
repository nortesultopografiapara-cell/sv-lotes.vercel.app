/**
 * Aplica dump schema-only no DEVELOP. Recusa Production e a migration de operações contratuais.
 * npx tsx scripts/develop/apply-schema-dump.ts supabase/schema-dumps/production-schema-only.sql
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  assertDevelopWriteAllowed,
  assertNotContractOperationsMigration,
  FORBIDDEN_MIGRATION,
} from './guard';

async function main() {
  const target = assertDevelopWriteAllowed();
  const file = process.argv[2];
  if (!file) {
    console.log(
      JSON.stringify({
        ok: false,
        abort: 'MISSING_DUMP_FILE',
        hint: 'Passe o SQL schema-only. Não use dump com dados.',
        target,
      }),
    );
    process.exit(2);
  }
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!fs.existsSync(abs)) {
    console.log(JSON.stringify({ ok: false, abort: 'FILE_NOT_FOUND', file: abs }));
    process.exit(2);
  }
  assertNotContractOperationsMigration(path.basename(abs));
  const sql = fs.readFileSync(abs, 'utf8');
  if (sql.includes(FORBIDDEN_MIGRATION.replace('.sql', ''))) {
    throw new Error(`ABORT: dump contém ${FORBIDDEN_MIGRATION}`);
  }
  if (/COPY\s+public\.(customers|sales|contracts|finance_receipts)/i.test(sql)) {
    throw new Error('ABORT: dump parece conter dados (COPY). Use schema-only.');
  }

  console.log(
    JSON.stringify(
      {
        ok: false,
        abort: 'APPLY_NEEDS_POSTGRES_OR_MANAGEMENT_API',
        target,
        dumpFile: path.basename(abs),
        dumpBytes: sql.length,
        hint: 'O token Vercel não descriptografa a service role. Coloque DATABASE_URL do DEVELOP ou execute o SQL no SQL Editor do projeto hoynysmynxncdlptuzub.',
      },
      null,
      2,
    ),
  );
  process.exit(2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
