/**
 * Recria buckets vazios no DEVELOP. Não copia objetos.
 * npx tsx scripts/develop/bootstrap-storage.ts
 */
import { createClient } from '@supabase/supabase-js';
import { assertDevelopWriteAllowed, loadDevelopEnv } from './guard';

const BUCKETS: Array<{
  id: string;
  public: boolean;
  fileSizeLimit?: number;
  allowedMimeTypes?: string[];
}> = [
  { id: 'sale-documents', public: false, fileSizeLimit: 50 * 1024 * 1024 },
  { id: 'company-assets', public: true, fileSizeLimit: 20 * 1024 * 1024 },
  { id: 'company-exports', public: false, fileSizeLimit: 200 * 1024 * 1024 },
  { id: 'legacy-contracts', public: false, fileSizeLimit: 50 * 1024 * 1024 },
];

async function main() {
  const target = assertDevelopWriteAllowed();
  const env = loadDevelopEnv();
  if (!env.service || /SENSITIVE/i.test(env.service)) {
    console.log(
      JSON.stringify({
        ok: false,
        abort: 'MISSING_DEVELOP_SERVICE_ROLE',
        hint: 'Coloque SUPABASE_SERVICE_ROLE_KEY do DEVELOP em .env.develop.apply',
        target,
      }),
    );
    process.exit(2);
  }

  const admin = createClient(env.url, env.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const existing = await admin.storage.listBuckets();
  if (existing.error) {
    console.log(JSON.stringify({ ok: false, error: existing.error.message, target }));
    process.exit(2);
  }
  const have = new Set((existing.data || []).map((b) => b.id || b.name));
  const created: string[] = [];
  const skipped: string[] = [];

  for (const bucket of BUCKETS) {
    if (have.has(bucket.id)) {
      skipped.push(bucket.id);
      continue;
    }
    const { error } = await admin.storage.createBucket(bucket.id, {
      public: bucket.public,
      fileSizeLimit: bucket.fileSizeLimit,
      allowedMimeTypes: bucket.allowedMimeTypes,
    });
    if (error) {
      console.log(JSON.stringify({ ok: false, bucket: bucket.id, error: error.message, target }));
      process.exit(2);
    }
    created.push(bucket.id);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectRef: target.ref,
        branch: target.branch,
        created,
        alreadyExisted: skipped,
        objectsCopied: 0,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
