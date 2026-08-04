/**
 * Homologação F2 via Preview (nunca produção).
 *
 * Uso:
 *   COMPANY_EXPORT_PREVIEW_URL=https://….vercel.app \
 *   SUPER_ADMIN_USER_ID=… \
 *   COMPANY_EXPORT_TEST_COMPANY_ID=… \
 *   npx tsx scripts/homolog-company-export-f2.ts
 *
 * Env opcionais:
 *   COMPANY_EXPORT_INCLUDE_PLANS=1|0
 *   COMPANY_EXPORT_MAX_TICKS=400
 *   COMPANY_EXPORT_KEEP_ZIP=1  (não apaga o ZIP ao final)
 *   COMPANY_EXPORT_NOTES=…
 *   COMPANY_EXPORT_OUT_DIR=./tmp-f2-homolog
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { execSync } from 'child_process';

const PREVIEW = String(process.env.COMPANY_EXPORT_PREVIEW_URL || '').replace(/\/$/, '');
const USER_ID = process.env.SUPER_ADMIN_USER_ID || '';
const COMPANY_ID =
  process.env.COMPANY_EXPORT_TEST_COMPANY_ID ||
  'a0c1d2e3-f4a5-6789-abcd-ef0123456789';
const INCLUDE_PLANS = process.env.COMPANY_EXPORT_INCLUDE_PLANS !== '0';
const MAX_TICKS = Number(process.env.COMPANY_EXPORT_MAX_TICKS || 400);
const KEEP_ZIP = process.env.COMPANY_EXPORT_KEEP_ZIP === '1';
const NOTES =
  process.env.COMPANY_EXPORT_NOTES || 'Homologação F2 — Empresa Demonstração';
const OUT_DIR =
  process.env.COMPANY_EXPORT_OUT_DIR ||
  path.join(process.cwd(), 'tmp-f2-homolog');

function assertPreviewSafe(url: string): void {
  if (!url) throw new Error('COMPANY_EXPORT_PREVIEW_URL obrigatório');
  const host = new URL(url).hostname.toLowerCase();
  if (
    host === 'www.svlotes.com.br' ||
    host === 'svlotes.com.br' ||
    host === 'sv-lotes.vercel.app' ||
    (!host.includes('vercel.app') && !host.includes('localhost'))
  ) {
    throw new Error(
      `Recusado: URL parece produção/não-Preview (${host}). Use o Preview da branch feature/company-export-f2.`,
    );
  }
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!USER_ID) {
    console.log(JSON.stringify({ ok: false, error: 'SUPER_ADMIN_USER_ID obrigatório' }));
    process.exit(2);
  }
  assertPreviewSafe(PREVIEW);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const started = Date.now();
  const createRes = await fetch(`${PREVIEW}/api/master/companies/${COMPANY_ID}/exports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      userId: USER_ID,
      reason: 'BACKUP',
      notes: NOTES,
      exportVersion: 'F2_COMPLETE',
      includeGeneratedPlans: INCLUDE_PLANS,
    }),
  });
  const created = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    console.log(JSON.stringify({ ok: false, phase: 'create', http: createRes.status, created }, null, 2));
    process.exit(1);
  }

  const exportId = String(created.job?.id || '');
  const timeline: Array<Record<string, unknown>> = [
    {
      t: 0,
      status: created.job?.status,
      progress: created.job?.progress,
      step: created.job?.current_step,
    },
  ];
  console.log(JSON.stringify({ phase: 'create', exportId, status: created.job?.status }));

  let job = created.job;
  for (let i = 0; i < MAX_TICKS; i++) {
    await sleep(3000);
    const r = await fetch(
      `${PREVIEW}/api/master/companies/${COMPANY_ID}/exports/${exportId}?userId=${encodeURIComponent(USER_ID)}`,
      { headers: { accept: 'application/json' } },
    );
    const j = await r.json();
    job = j.job;
    const row = {
      tick: i,
      elapsedMs: Date.now() - started,
      status: job?.status,
      progress: job?.progress,
      step: job?.current_step,
      records: job?.records_exported,
      files: job?.files_exported,
      found: job?.storage_files_found,
      copied: job?.storage_files_copied,
      missing: job?.storage_files_missing,
      memorials: job?.generated_memorials,
      lotPlans: job?.generated_lot_plans,
      generalPlans: job?.generated_general_plans,
      genErrors: job?.generation_errors,
    };
    timeline.push(row);
    console.log(JSON.stringify(row));
    if (job?.status === 'COMPLETED' || job?.status === 'FAILED' || job?.status === 'CANCELLED') {
      break;
    }
  }

  const elapsedMs = Date.now() - started;
  if (job?.status !== 'COMPLETED') {
    const failReport = { ok: false, phase: 'advance', exportId, elapsedMs, job, timeline };
    fs.writeFileSync(
      path.join(OUT_DIR, `f2-fail-${exportId.slice(0, 8)}.json`),
      JSON.stringify(failReport, null, 2),
    );
    console.log(JSON.stringify(failReport, null, 2));
    process.exit(1);
  }

  const dl = await fetch(
    `${PREVIEW}/api/master/companies/${COMPANY_ID}/exports/${exportId}/download?userId=${encodeURIComponent(USER_ID)}`,
    { headers: { accept: 'application/json' } },
  );
  const dlJson = await dl.json();
  const zipPath = path.join(OUT_DIR, `${exportId}.zip`);
  let inspect: Record<string, unknown> = { downloadHttp: dl.status };

  if (dl.ok && dlJson.url) {
    const zipRes = await fetch(dlJson.url);
    const buf = Buffer.from(await zipRes.arrayBuffer());
    fs.writeFileSync(zipPath, buf);
    const packageSha = createHash('sha256').update(buf).digest('hex');

    // List zip entries via PowerShell/Expand or unzip - use node zlib only for store zip is complex;
    // Prefer `tar`/`Expand-Archive` not for zip store. Use python or powershell COM.
    let entries: string[] = [];
    try {
      const listed = execSync(
        `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}').Entries | ForEach-Object { $_.FullName }"`,
        { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
      );
      entries = listed
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    } catch (e) {
      entries = [`list_error:${String(e).slice(0, 120)}`];
    }

    // Extract key files for scan
    const extractDir = path.join(OUT_DIR, exportId);
    fs.mkdirSync(extractDir, { recursive: true });
    try {
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force"`,
        { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
      );
    } catch {
      // store-method zip may fail Expand-Archive on some Windows builds — fallback keep zip only
    }

    const textBlobs: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p);
        else if (/\.(json|html|csv|txt|sha256|geojson)$/i.test(name) && st.size < 8_000_000) {
          textBlobs.push(fs.readFileSync(p, 'utf8'));
        }
      }
    };
    walk(extractDir);
    const allText = textBlobs.join('\n');
    const secretHits = [
      /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      /sk_[a-zA-Z0-9]{20,}/g,
      /signature_token/gi,
      /access_token/gi,
      /ASAAS_API_KEY/gi,
    ].flatMap((re) => allText.match(re) || []);

    const signedUrlHits = (allText.match(/token=/gi) || []).length;
    const manifestPath = path.join(extractDir, 'manifest.json');
    let manifest: Record<string, unknown> | null = null;
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }

    inspect = {
      downloadHttp: dl.status,
      zipBytes: buf.length,
      packageSha,
      shaMatchesManifest:
        job.manifest?.checksum_sha256 != null
          ? packageSha === job.manifest.checksum_sha256
          : null,
      entriesCount: entries.length,
      entriesSample: entries.slice(0, 80),
      hasManifest: entries.some((e) => e.endsWith('manifest.json') || e === 'manifest.json'),
      hasChecksums: entries.some((e) => e.includes('checksums.sha256')),
      hasReadme: entries.some((e) => /LEIA-ME/i.test(e)),
      hasRestore: entries.some((e) => e.includes('99_RESTAURACAO')),
      hasMemorials: entries.some((e) => /memorial/i.test(e)),
      hasLotPlans: entries.some((e) => /Prancha_/i.test(e) || /pranchas\//i.test(e)),
      hasCompanyAssets: entries.some((e) => e.startsWith('01_empresa/')),
      hasSaleDocs: entries.some((e) => e.startsWith('05_vendas/') || e.includes('/documentos/')),
      hasContracts: entries.some((e) => e.startsWith('06_contratos/')),
      hasLegacy: entries.some((e) => e.includes('08_arquivos_originais') || e.includes('legacy')),
      secretValueHits: secretHits.length,
      signedUrlLikeHits: signedUrlHits,
      originalSourceStatus: (manifest as any)?.original_source_file_status || null,
      externalAsaas:
        Array.isArray((manifest as any)?.external_asaas_refs) ||
        entries.some((e) => e.includes('boletos_asaas')),
      foreignCompanyHint: false,
    };
  }

  let deleteMeta: Record<string, unknown> = { skipped: KEEP_ZIP };
  if (!KEEP_ZIP) {
    const del = await fetch(
      `${PREVIEW}/api/master/companies/${COMPANY_ID}/exports/${exportId}/file?userId=${encodeURIComponent(USER_ID)}`,
      { method: 'DELETE', headers: { accept: 'application/json' } },
    );
    deleteMeta = { http: del.status, ok: del.ok };
  }

  const report = {
    ok: job.status === 'COMPLETED' && (inspect.secretValueHits as number) === 0,
    preview: PREVIEW,
    companyId: COMPANY_ID,
    exportId,
    exportVersion: job.export_version,
    elapsedMs,
    elapsedMin: Number((elapsedMs / 60000).toFixed(2)),
    status: job.status,
    records: job.records_exported,
    filesExported: job.files_exported,
    totalSize: job.total_size,
    storage_files_found: job.storage_files_found,
    storage_files_copied: job.storage_files_copied,
    storage_files_missing: job.storage_files_missing,
    storage_files_deduplicated: job.storage_files_deduplicated,
    generated_memorials: job.generated_memorials,
    generated_lot_plans: job.generated_lot_plans,
    generated_general_plans: job.generated_general_plans,
    generation_errors: job.generation_errors,
    package_parts: job.package_parts,
    total_binary_size: job.total_binary_size,
    warnings: job.manifest?.warnings || [],
    errors: job.manifest?.errors || [],
    missing_files: job.manifest?.missing_files || [],
    generation_errors_detail: job.manifest?.generation_errors || [],
    original_source_file_status: job.manifest?.original_source_file_status,
    inspect,
    deleteMeta,
    timelineTail: timeline.slice(-15),
  };

  fs.writeFileSync(
    path.join(OUT_DIR, `f2-report-${exportId.slice(0, 8)}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
