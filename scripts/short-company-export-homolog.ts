/**
 * Homologação curta F0+F1 via APIs Master no Preview.
 * Requer middleware liberando /api/master/companies/*/exports (assertSuperAdmin na rota).
 *
 * Uso:
 *   COMPANY_EXPORT_PREVIEW_URL=... SUPER_ADMIN_USER_ID=... npx tsx scripts/short-company-export-homolog.ts
 */
const PREVIEW =
  process.env.COMPANY_EXPORT_PREVIEW_URL ||
  'https://sv-lotes-vercel-8rrb24k7i.vercel.app';
const COMPANY_ID =
  process.env.COMPANY_EXPORT_TEST_COMPANY_ID ||
  'a0c1d2e3-f4a5-6789-abcd-ef0123456789';
const USER_ID = process.env.SUPER_ADMIN_USER_ID || '';

async function main() {
  if (!USER_ID) {
    console.log(JSON.stringify({ ok: false, error: 'SUPER_ADMIN_USER_ID obrigatório' }));
    process.exit(2);
  }

  const createRes = await fetch(`${PREVIEW}/api/master/companies/${COMPANY_ID}/exports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      userId: USER_ID,
      reason: 'BACKUP',
      notes: 'Homologação curta F0+F1 — polimento',
    }),
  });
  const createText = await createRes.text();
  let created: Record<string, any> = {};
  try {
    created = JSON.parse(createText);
  } catch {
    console.log(
      JSON.stringify({
        ok: false,
        phase: 'create',
        http: createRes.status,
        bodyPreview: createText.slice(0, 160),
      }),
    );
    process.exit(1);
  }
  if (!createRes.ok) {
    console.log(JSON.stringify({ ok: false, phase: 'create', http: createRes.status, created }));
    process.exit(1);
  }

  const exportId = String(created.job?.id || '');
  console.log(
    JSON.stringify({
      phase: 'create',
      exportId,
      status: created.job?.status,
      progress: created.job?.progress,
    }),
  );

  let job = created.job;
  for (let i = 0; i < 40; i++) {
    const r = await fetch(
      `${PREVIEW}/api/master/companies/${COMPANY_ID}/exports/${exportId}?userId=${encodeURIComponent(USER_ID)}`,
      { headers: { accept: 'application/json' } },
    );
    const j = await r.json();
    job = j.job;
    console.log(
      JSON.stringify({
        tick: i,
        status: job?.status,
        progress: job?.progress,
        step: job?.current_step,
        records: job?.records_exported,
      }),
    );
    if (job?.status === 'COMPLETED' || job?.status === 'FAILED') break;
  }

  if (job?.status !== 'COMPLETED') {
    console.log(JSON.stringify({ ok: false, phase: 'advance', job }));
    process.exit(1);
  }

  const counts = job.manifest?.records_per_table || {};
  const warnings: string[] = job.manifest?.warnings || [];
  const files: string[] = job.manifest?.files_generated || [];
  const errors: string[] = job.manifest?.errors || [];

  const dl = await fetch(
    `${PREVIEW}/api/master/companies/${COMPANY_ID}/exports/${exportId}/download?userId=${encodeURIComponent(USER_ID)}`,
    { headers: { accept: 'application/json' } },
  );
  const dlJson = await dl.json();
  let zipMeta: Record<string, unknown> = { http: dl.status };
  if (dl.ok && dlJson.url) {
    const zipRes = await fetch(dlJson.url);
    const buf = Buffer.from(await zipRes.arrayBuffer());
    const text = buf.toString('utf8');
    const secretHits = [
      /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      /sk_[a-zA-Z0-9]{20,}/g,
    ].flatMap((re) => text.match(re) || []);
    const { createHash } = await import('crypto');
    zipMeta = {
      http: zipRes.status,
      bytes: buf.length,
      sha256Matches: job.manifest?.checksum_sha256
        ? createHash('sha256').update(buf).digest('hex') === job.manifest.checksum_sha256
        : null,
      hasUsers: files.some((f: string) => f.includes('users')),
      hasCustomers: files.some((f: string) => f.includes('customers')),
      hasSales: files.some((f: string) => f.includes('sales')),
      hasContracts: files.some((f: string) => f.includes('contracts')),
      hasGeojson: files.some((f: string) => f.endsWith('.geojson')),
      hasContractHtml: files.some((f: string) => f.includes('/contract.html')),
      secretValueHits: secretHits.length,
      badWarnings: warnings.filter((w: string) =>
        /contract_html does not exist|geojson does not exist|users\.name|users\.company_id/i.test(
          w,
        ),
      ),
    };
  }

  const del = await fetch(
    `${PREVIEW}/api/master/companies/${COMPANY_ID}/exports/${exportId}/file?userId=${encodeURIComponent(USER_ID)}`,
    { method: 'DELETE', headers: { accept: 'application/json' } },
  );
  const delJson = await del.json().catch(() => ({}));

  const report = {
    ok:
      job.status === 'COMPLETED' &&
      Number(counts.customers || 0) >= 1 &&
      Number(counts.sales || 0) >= 1 &&
      Number(counts.contracts || 0) >= 1 &&
      (zipMeta.hasUsers === true) &&
      (zipMeta.hasCustomers === true) &&
      ((zipMeta.badWarnings as string[]) || []).length === 0 &&
      zipMeta.secretValueHits === 0,
    exportId,
    companyId: COMPANY_ID,
    records: job.records_exported,
    size: job.total_size,
    counts: {
      users: counts.users ?? 0,
      customers: counts.customers ?? 0,
      sales: counts.sales ?? 0,
      contracts: counts.contracts ?? 0,
      blocks: counts.blocks ?? 0,
    },
    filesCount: files.length,
    warnings,
    errors,
    zipMeta,
    deleteHttp: del.status,
    deleteOk: del.ok || delJson?.ok,
    preview: PREVIEW,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
