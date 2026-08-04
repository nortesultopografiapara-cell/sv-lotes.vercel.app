/**
 * Driver local da homologação F0+F1 no Preview (sem secrets locais).
 * npx tsx scripts/run-company-export-homolog-preview.ts
 */
const PREVIEW =
  process.env.COMPANY_EXPORT_PREVIEW_URL ||
  'https://sv-lotes-vercel-evu896u52.vercel.app';
const CONFIRM = 'APPLY_F0_SHARED_DDL_AND_HOMOLOG_20261004';

async function call(phase: string, body?: Record<string, string>) {
  const url = `${PREVIEW}/api/cron/homolog-company-export-f0-f1?phase=${encodeURIComponent(phase)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-company-export-homolog': CONFIRM,
    },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { http: res.status, json };
}

async function advanceUntilDone(companyId: string, exportId: string, label: string) {
  const timeline: unknown[] = [];
  for (let i = 0; i < 60; i++) {
    const r = await call(`${label}-advance`, { companyId, exportId });
    timeline.push({ i, http: r.http, ...(r.json as object) });
    console.log(
      JSON.stringify({
        tick: i,
        http: r.http,
        status: (r.json as { job?: { status?: string; progress?: number; step?: string } }).job
          ?.status,
        progress: (r.json as { job?: { progress?: number } }).job?.progress,
        step: (r.json as { job?: { step?: string } }).job?.step,
        error: (r.json as { error?: string }).error || (r.json as { job?: { error?: string } }).job?.error,
      }),
    );
    const status = (r.json as { job?: { status?: string } }).job?.status;
    if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
      return { done: true, status, timeline, last: r.json };
    }
    if (r.http >= 500) return { done: false, status, timeline, last: r.json };
  }
  return { done: false, status: 'TIMEOUT', timeline };
}

async function main() {
  const out: Record<string, unknown> = { preview: PREVIEW, startedAt: new Date().toISOString() };

  console.log('=== DDL ===');
  const ddl = await call('ddl');
  out.ddl = ddl;
  console.log(JSON.stringify(ddl, null, 2));
  if (ddl.http !== 200 || !(ddl.json as { ok?: boolean }).ok) {
    throw new Error('DDL phase failed');
  }

  console.log('=== PICK ===');
  const pick = await call('pick');
  out.pick = pick;
  console.log(JSON.stringify(pick, null, 2));

  console.log('=== SMALL CREATE ===');
  const created = await call('small-create');
  out.smallCreate = created;
  console.log(JSON.stringify(created, null, 2));
  const companyId = String((created.json as { company?: { id?: string } }).company?.id || '');
  const exportId = String((created.json as { exportId?: string }).exportId || '');
  if (!companyId || !exportId) throw new Error('small-create missing ids');

  console.log('=== SMALL ADVANCE ===');
  const advanced = await advanceUntilDone(companyId, exportId, 'small');
  out.smallAdvance = { status: advanced.status, ticks: advanced.timeline.length };
  if (advanced.status !== 'COMPLETED') {
    out.smallAdvanceLast = advanced.last;
    console.log(JSON.stringify(out, null, 2));
    throw new Error(`small export not completed: ${advanced.status}`);
  }

  console.log('=== SMALL INSPECT ===');
  const inspect = await call('small-inspect', { companyId, exportId });
  out.smallInspect = inspect;
  console.log(JSON.stringify(inspect, null, 2));

  console.log('=== LIFECYCLE ===');
  const life = await call('lifecycle', { companyId, cleanupExportId: exportId });
  out.lifecycle = life;
  console.log(JSON.stringify(life, null, 2));

  console.log('=== MID CREATE ===');
  const midCreated = await call('mid-create');
  out.midCreate = midCreated;
  console.log(JSON.stringify(midCreated, null, 2));
  const midCompanyId = String((midCreated.json as { company?: { id?: string } }).company?.id || '');
  const midExportId = String((midCreated.json as { exportId?: string }).exportId || '');
  if (midCompanyId && midExportId) {
    console.log('=== MID ADVANCE ===');
    const midAdv = await advanceUntilDone(midCompanyId, midExportId, 'mid');
    out.midAdvance = { status: midAdv.status, ticks: midAdv.timeline.length };
    if (midAdv.status === 'COMPLETED') {
      const midClean = await call('cleanup-export', {
        companyId: midCompanyId,
        exportId: midExportId,
      });
      out.midCleanup = midClean;
    } else {
      out.midAdvanceLast = midAdv.last;
    }
  }

  out.finishedAt = new Date().toISOString();
  out.ok =
    (ddl.json as { ok?: boolean }).ok === true &&
    advanced.status === 'COMPLETED' &&
    (inspect.json as { ok?: boolean }).ok === true &&
    (life.json as { ok?: boolean }).ok === true;

  console.log('=== SUMMARY ===');
  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
