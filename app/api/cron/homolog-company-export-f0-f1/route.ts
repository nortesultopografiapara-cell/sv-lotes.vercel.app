/**
 * One-shot Preview homologation API — F0+F1 company export.
 * Runtime service role only. Preview-only. REMOVE after homologation.
 *
 * Phases (?phase=):
 *  ddl | small-create | small-advance | small-inspect | lifecycle | mid-create | mid-advance | mid-cleanup
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  advanceCompanyExportJob,
  cancelCompanyExportJob,
  createCompanyExportJob,
  createExportDownloadUrl,
  deleteExportPackageFile,
  expireCompanyExportPackages,
  getCompanyExportJob,
} from '@/lib/master/companyExport/jobService';
import { COMPANY_EXPORT_BUCKET } from '@/lib/master/companyExport/storagePaths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CONFIRM_HEADER = 'x-company-export-homolog';
const CONFIRM_VALUE = 'APPLY_F0_SHARED_DDL_AND_HOMOLOG_20261004';
const MENESES_HINT = /meneses/i;

function isPreviewRuntime(): boolean {
  return (
    process.env.VERCEL_ENV === 'preview' ||
    process.env.ALLOW_COMPANY_EXPORT_HOMOLOG === '1'
  );
}

function migrationSql(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'supabase', 'migrations', '20261004120000_company_export_jobs.sql'),
    'utf8',
  );
}

function assertSqlSafe(sql: string) {
  const withoutComments = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  if (/\bDROP\s+POLICY\b/i.test(withoutComments)) throw new Error('SQL has DROP POLICY');
  if (/\bDROP\s+TABLE\b/i.test(withoutComments)) throw new Error('SQL has DROP TABLE');
  if (/\bTRUNCATE\b/i.test(withoutComments)) throw new Error('SQL has TRUNCATE');
}

async function ensureSchema(
  admin: NonNullable<ReturnType<typeof createServiceSupabase>['client']>,
) {
  const probe = await admin.from('company_export_jobs').select('id').limit(1);
  if (!probe.error) return { applied: false, already: true as const };
  const sql = migrationSql();
  assertSqlSafe(sql);
  const { error } = await admin.rpc('exec_sql', { query: sql });
  if (error) throw new Error(`exec_sql: ${error.message}`);
  const after = await admin.from('company_export_jobs').select('id').limit(1);
  if (after.error) throw new Error(`verify: ${after.error.message}`);
  return { applied: true, already: false as const };
}

async function pickCompanies(
  admin: NonNullable<ReturnType<typeof createServiceSupabase>['client']>,
) {
  const { data: companies, error } = await admin
    .from('companies')
    .select('id, name, fantasy_name, document, cnpj')
    .order('created_at', { ascending: true })
    .limit(80);
  if (error) throw new Error(error.message);

  const scored: Array<{
    id: string;
    name: string;
    document: string | null;
    customers: number;
    sales: number;
    score: number;
  }> = [];

  for (const c of companies || []) {
    const name = String(c.fantasy_name || c.name || '');
    if (MENESES_HINT.test(name)) continue;
    const id = String(c.id);
    const [cust, sales] = await Promise.all([
      admin
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .or(`company_id.eq.${id},tenant_id.eq.${id}`),
      admin
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .or(`company_id.eq.${id},tenant_id.eq.${id}`),
    ]);
    const customers = cust.count || 0;
    const salesCount = sales.count || 0;
    const score = customers + salesCount;
    if (score === 0) continue;
    scored.push({
      id,
      name,
      document: (c.document || c.cnpj || null) as string | null,
      customers,
      sales: salesCount,
      score,
    });
  }
  scored.sort((a, b) => a.score - b.score);
  if (!scored[0]) throw new Error('Nenhuma empresa pequena candidata');
  return {
    small: scored[0],
    mid: scored.find((s) => s.id !== scored[0].id && s.score >= 5) || scored[1] || null,
    candidates: scored.slice(0, 8),
  };
}

async function pickSuperAdmin(
  admin: NonNullable<ReturnType<typeof createServiceSupabase>['client']>,
) {
  const { data, error } = await admin
    .from('users')
    .select('id')
    .eq('role', 'SUPER_ADMIN')
    .limit(1)
    .maybeSingle();
  if (error || !data?.id) throw new Error(`SUPER_ADMIN: ${error?.message || 'missing'}`);
  return String(data.id);
}

async function drainOnce(
  admin: NonNullable<ReturnType<typeof createServiceSupabase>['client']>,
  companyId: string,
  exportId: string,
) {
  const t0 = Date.now();
  const before = await getCompanyExportJob(admin, companyId, exportId);
  const prev = before.progress;
  const adv = await advanceCompanyExportJob(admin, companyId, exportId, 12);
  const job = await getCompanyExportJob(admin, companyId, exportId);
  if (job.progress < prev) throw new Error(`progress decreased ${prev} -> ${job.progress}`);
  return {
    adv,
    job: {
      status: job.status,
      progress: job.progress,
      step: job.current_step,
      records: job.records_exported,
      files: job.files_exported,
      size: job.total_size,
      error: job.error_message,
      manifest: job.manifest,
    },
    elapsedMs: Date.now() - t0,
    progressNonDecreasing: job.progress >= prev,
  };
}

const SECRET_VALUE_PATTERNS = [
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /sk_[a-zA-Z0-9]{20,}/g,
  /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{50,}/g,
];

export async function POST(request: Request) {
  if (!isPreviewRuntime()) {
    return NextResponse.json({ error: 'Somente Preview' }, { status: 403 });
  }
  if (request.headers.get(CONFIRM_HEADER) !== CONFIRM_VALUE) {
    return NextResponse.json({ error: 'Confirm header inválido' }, { status: 401 });
  }

  const { client: admin, error } = createServiceSupabase();
  if (!admin) return NextResponse.json({ error }, { status: 500 });

  const url = new URL(request.url);
  const phase = url.searchParams.get('phase') || 'ddl';
  let body: Record<string, string> = {};
  try {
    body = (await request.json()) as Record<string, string>;
  } catch {
    body = {};
  }

  try {
    if (phase === 'ddl') {
      const schema = await ensureSchema(admin);
      const { data: buckets } = await admin.storage.listBuckets();
      const bucket = (buckets || []).find(
        (b) => b.id === COMPANY_EXPORT_BUCKET || b.name === COMPANY_EXPORT_BUCKET,
      );
      // RLS probe with anon is not available here; service role bypasses RLS.
      // Confirm table selectable and bucket private.
      const tableOk = await admin.from('company_export_jobs').select('id').limit(1);
      return NextResponse.json({
        ok: !tableOk.error,
        phase,
        schema,
        bucket: {
          present: Boolean(bucket),
          public: bucket ? Boolean((bucket as { public?: boolean }).public) : null,
          name: COMPANY_EXPORT_BUCKET,
        },
        tableError: tableOk.error?.message || null,
        supabaseHost: (() => {
          try {
            return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').host;
          } catch {
            return null;
          }
        })(),
      });
    }

    if (phase === 'pick') {
      const companies = await pickCompanies(admin);
      return NextResponse.json({ ok: true, phase, companies });
    }

    if (phase === 'small-create' || phase === 'mid-create') {
      const companies = await pickCompanies(admin);
      const target = phase === 'small-create' ? companies.small : companies.mid;
      if (!target) return NextResponse.json({ error: 'empresa alvo indisponível' }, { status: 400 });
      const superAdminId = await pickSuperAdmin(admin);
      const job = await createCompanyExportJob(admin, {
        companyId: target.id,
        requestedBy: superAdminId,
        reason: 'BACKUP',
        notes:
          phase === 'small-create'
            ? 'Homologação F0+F1'
            : 'Homologação F0+F1 — empresa intermediária',
      });
      return NextResponse.json({
        ok: true,
        phase,
        company: target,
        exportId: job.id,
        status: job.status,
        superAdminIdPrefix: superAdminId.slice(0, 8),
      });
    }

    if (phase === 'small-advance' || phase === 'mid-advance') {
      const companyId = String(body.companyId || url.searchParams.get('companyId') || '');
      const exportId = String(body.exportId || url.searchParams.get('exportId') || '');
      if (!companyId || !exportId) {
        return NextResponse.json({ error: 'companyId e exportId obrigatórios' }, { status: 400 });
      }
      const result = await drainOnce(admin, companyId, exportId);
      return NextResponse.json({ ok: true, phase, companyId, exportId, ...result });
    }

    if (phase === 'small-inspect') {
      const companyId = String(body.companyId || '');
      const exportId = String(body.exportId || '');
      if (!companyId || !exportId) {
        return NextResponse.json({ error: 'companyId e exportId obrigatórios' }, { status: 400 });
      }
      const superAdminId = await pickSuperAdmin(admin);
      const job = await getCompanyExportJob(admin, companyId, exportId);
      if (job.status !== 'COMPLETED') {
        return NextResponse.json({ ok: false, phase, status: job.status, job }, { status: 409 });
      }
      const signed = await createExportDownloadUrl(admin, companyId, exportId, superAdminId);
      const res = await fetch(signed.url);
      const buf = Buffer.from(await res.arrayBuffer());
      const text = buf.toString('utf8');
      const paths = [
        ...text.matchAll(
          /([0-9]{2}_[a-z_]+\/[^\x00\r\n"]+\.(?:csv|json|html|geojson)|manifest\.json|LEIA-ME[^.\x00]*\.html|checksums\.sha256)/gi,
        ),
      ].map((m) => m[1]);
      const uniquePaths = [...new Set(paths)];
      const secretValueHits: string[] = [];
      for (const re of SECRET_VALUE_PATTERNS) {
        const m = text.match(re);
        if (m?.length) secretValueHits.push(`${re}:count=${m.length}`);
      }
      // Label-only mentions are expected in LEIA-ME deny docs; value patterns matter.
      const labelMentions = [
        'api_key',
        'access_token',
        'webhook_secret',
        'signature_token',
        'encrypted_payload',
        'bank_credentials',
        'CRON_SECRET',
        'service_role',
        'ASAAS_API_KEY',
      ].filter((s) => text.toLowerCase().includes(s.toLowerCase()));

      const companies = await pickCompanies(admin);
      let isolation: Record<string, unknown> = { skipped: true };
      if (companies.mid && companies.mid.id !== companyId) {
        const leaks: string[] = [];
        const { data: bCustomers } = await admin
          .from('customers')
          .select('id')
          .or(`company_id.eq.${companies.mid.id},tenant_id.eq.${companies.mid.id}`)
          .limit(8);
        for (const row of bCustomers || []) {
          if (row.id && text.includes(String(row.id))) leaks.push(`customer:${row.id}`);
        }
        const { data: bSales } = await admin
          .from('sales')
          .select('id')
          .or(`company_id.eq.${companies.mid.id},tenant_id.eq.${companies.mid.id}`)
          .limit(8);
        for (const row of bSales || []) {
          if (row.id && text.includes(String(row.id))) leaks.push(`sale:${row.id}`);
        }
        isolation = { companyB: companies.mid.id, leakCount: leaks.length, leaks, ok: leaks.length === 0 };
      }

      return NextResponse.json({
        ok: true,
        phase,
        job: {
          status: job.status,
          progress: job.progress,
          records: job.records_exported,
          files: job.files_exported,
          size: job.total_size,
          manifest: job.manifest,
        },
        zip: {
          http: res.status,
          bytes: buf.length,
          sha256: createHash('sha256').update(buf).digest('hex'),
          hasBom: buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
          pathCount: uniquePaths.length,
          pathsSample: uniquePaths.slice(0, 100),
          folders: {
            '01_empresa': uniquePaths.some((p) => p.startsWith('01_empresa')),
            '02_clientes': uniquePaths.some((p) => p.startsWith('02_clientes')),
            '03_corretores': uniquePaths.some((p) => p.startsWith('03_corretores')),
            '04_empreendimentos': uniquePaths.some((p) => p.startsWith('04_empreendimentos')),
            '05_vendas': uniquePaths.some((p) => p.startsWith('05_vendas')),
            '06_contratos': uniquePaths.some((p) => p.startsWith('06_contratos')),
            '07_financeiro': uniquePaths.some((p) => p.startsWith('07_financeiro')),
            '09_auditoria': uniquePaths.some((p) => p.startsWith('09_auditoria')),
            manifest: uniquePaths.some((p) => p.includes('manifest.json')),
            readme: uniquePaths.some((p) => /LEIA-ME/i.test(p)),
            checksums: uniquePaths.some((p) => p.includes('checksums.sha256')),
          },
          secretValueHits,
          labelMentions,
        },
        isolation,
        signedExpiresAt: signed.expiresAt,
      });
    }

    if (phase === 'lifecycle') {
      const companyId = String(body.companyId || '');
      if (!companyId) return NextResponse.json({ error: 'companyId obrigatório' }, { status: 400 });
      const superAdminId = await pickSuperAdmin(admin);

      const cancelJob = await createCompanyExportJob(admin, {
        companyId,
        requestedBy: superAdminId,
        reason: 'BACKUP',
        notes: 'Homologação F0+F1 — cancel test',
      });
      await cancelCompanyExportJob(admin, companyId, cancelJob.id, superAdminId);
      await advanceCompanyExportJob(admin, companyId, cancelJob.id, 2);
      const cancelAfter = await getCompanyExportJob(admin, companyId, cancelJob.id);

      const expireJob = await createCompanyExportJob(admin, {
        companyId,
        requestedBy: superAdminId,
        reason: 'BACKUP',
        notes: 'Homologação F0+F1 — expire test',
      });
      const storagePath = `${companyId}/${expireJob.id}/package.zip`;
      await admin.storage.from(COMPANY_EXPORT_BUCKET).upload(storagePath, Buffer.from('homolog-expire'), {
        contentType: 'application/zip',
        upsert: true,
      });
      await admin
        .from('company_export_jobs')
        .update({
          status: 'COMPLETED',
          progress: 100,
          completed_at: new Date().toISOString(),
          expires_at: new Date(Date.now() - 60_000).toISOString(),
          storage_bucket: COMPANY_EXPORT_BUCKET,
          storage_path: storagePath,
          current_step: 'homolog_expire_fixture',
        })
        .eq('id', expireJob.id)
        .eq('company_id', companyId);
      const expiredCount = await expireCompanyExportPackages(admin);
      const expireAfter = await getCompanyExportJob(admin, companyId, expireJob.id);

      // optional cleanup of a completed export package if provided
      let deleteResult: Record<string, unknown> | null = null;
      if (body.cleanupExportId) {
        await deleteExportPackageFile(admin, companyId, String(body.cleanupExportId), superAdminId);
        const after = await getCompanyExportJob(admin, companyId, String(body.cleanupExportId));
        deleteResult = {
          exportId: body.cleanupExportId,
          status: after.status,
          storagePath: after.storage_path,
        };
      }

      // Bucket public check
      const { data: buckets } = await admin.storage.listBuckets();
      const bucket = (buckets || []).find(
        (b) => b.id === COMPANY_EXPORT_BUCKET || b.name === COMPANY_EXPORT_BUCKET,
      );

      return NextResponse.json({
        ok: cancelAfter.status === 'CANCELLED' && expireAfter.status === 'EXPIRED',
        phase,
        cancel: { exportId: cancelJob.id, status: cancelAfter.status },
        expire: { exportId: expireJob.id, status: expireAfter.status, expiredCount },
        deleteResult,
        bucketPublic: bucket ? Boolean((bucket as { public?: boolean }).public) : null,
      });
    }

    if (phase === 'cleanup-export') {
      const companyId = String(body.companyId || '');
      const exportId = String(body.exportId || '');
      if (!companyId || !exportId) {
        return NextResponse.json({ error: 'companyId e exportId obrigatórios' }, { status: 400 });
      }
      const superAdminId = await pickSuperAdmin(admin);
      await deleteExportPackageFile(admin, companyId, exportId, superAdminId);
      const after = await getCompanyExportJob(admin, companyId, exportId);
      return NextResponse.json({
        ok: true,
        phase,
        status: after.status,
        storagePath: after.storage_path,
      });
    }

    return NextResponse.json({ error: `phase desconhecida: ${phase}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, phase, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Use POST', previewOnly: true });
}
