/**
 * Estimativa Meneses / empresa grande — inventário + contagens, SEM gerar pacote F2 completo.
 *
 * Uso (Preview da branch F2):
 *   COMPANY_EXPORT_PREVIEW_URL=… SUPER_ADMIN_USER_ID=… COMPANY_EXPORT_TEST_COMPANY_ID=… \
 *   npx tsx scripts/estimate-company-export-f2.ts
 *
 * Se não houver endpoint de estimativa, usa F1_TABULAR rápido + contagens via job F1
 * e/ou cria job F2 com include_generated_plans=false e cancela após inventory — preferimos
 * API de contagem local via POST F1 + metadados de listagem.
 *
 * Esta versão: cria job F2_COMPLETE com includeGeneratedPlans=false, avança até
 * inventory_storage concluir (current_step passa de inventory), lê contadores, CANCELA
 * antes de gerar planos/ZIP completo quando ESTIMATE_CANCEL=1 (default).
 */
const PREVIEW = String(process.env.COMPANY_EXPORT_PREVIEW_URL || '').replace(/\/$/, '');
const USER_ID = process.env.SUPER_ADMIN_USER_ID || '';
const COMPANY_ID = process.env.COMPANY_EXPORT_TEST_COMPANY_ID || '';
const CANCEL = process.env.ESTIMATE_CANCEL !== '0';
const MAX_TICKS = Number(process.env.COMPANY_EXPORT_MAX_TICKS || 120);

function assertPreviewSafe(url: string): void {
  if (!url) throw new Error('COMPANY_EXPORT_PREVIEW_URL obrigatório');
  const host = new URL(url).hostname.toLowerCase();
  if (
    host === 'www.svlotes.com.br' ||
    host === 'svlotes.com.br' ||
    (!host.includes('vercel.app') && !host.includes('localhost'))
  ) {
    throw new Error(`Recusado host não-Preview: ${host}`);
  }
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!USER_ID || !COMPANY_ID) {
    console.log(JSON.stringify({ ok: false, error: 'USER_ID e COMPANY_ID obrigatórios' }));
    process.exit(2);
  }
  assertPreviewSafe(PREVIEW);

  const createRes = await fetch(`${PREVIEW}/api/master/companies/${COMPANY_ID}/exports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      userId: USER_ID,
      reason: 'BACKUP',
      notes: 'Estimativa F2 — inventário somente (cancelar antes do ZIP completo)',
      exportVersion: 'F2_COMPLETE',
      includeGeneratedPlans: false,
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    console.log(JSON.stringify({ ok: false, phase: 'create', created }, null, 2));
    process.exit(1);
  }
  const exportId = String(created.job?.id || '');
  const started = Date.now();
  let job = created.job;
  let inventorySeen = false;

  for (let i = 0; i < MAX_TICKS; i++) {
    await sleep(2500);
    const r = await fetch(
      `${PREVIEW}/api/master/companies/${COMPANY_ID}/exports/${exportId}?userId=${encodeURIComponent(USER_ID)}`,
      { headers: { accept: 'application/json' } },
    );
    job = (await r.json()).job;
    const step = String(job?.current_step || '');
    console.log(
      JSON.stringify({
        tick: i,
        status: job?.status,
        step,
        found: job?.storage_files_found,
        copied: job?.storage_files_copied,
        progress: job?.progress,
      }),
    );
    if (step === 'inventory_storage' || Number(job?.storage_files_found || 0) > 0) {
      inventorySeen = true;
    }
    // Após inventário, contadores de found já gravados; cancelar antes de gerar ZIP pesado
    if (
      CANCEL &&
      inventorySeen &&
      (step.startsWith('copy_') ||
        step === 'build_file_index' ||
        step === 'readme' ||
        Number(job?.storage_files_copied || 0) > 0)
    ) {
      break;
    }
    if (job?.status === 'COMPLETED' || job?.status === 'FAILED') break;
  }

  if (CANCEL && job?.status === 'PROCESSING') {
    await fetch(`${PREVIEW}/api/master/companies/${COMPANY_ID}/exports/${exportId}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID }),
    });
  }

  const found = Number(job?.storage_files_found || 0);
  const blocksHint = Number(job?.records_exported || 0);
  const avgFileMb = 0.8;
  const avgPlanMb = 0.35;
  const planLots = Math.max(0, Math.round(blocksHint * 0.15));
  const estWithPlansMb = found * avgFileMb + planLots * 2 * avgPlanMb + 5;
  const splitLikely = estWithPlansMb > 450;

  const report = {
    ok: true,
    mode: 'estimate_inventory',
    cancelled: CANCEL,
    preview: PREVIEW,
    companyId: COMPANY_ID,
    exportId,
    elapsedMs: Date.now() - started,
    storage_files_found: found,
    storage_files_copied: job?.storage_files_copied,
    storage_files_missing: job?.storage_files_missing,
    records_exported_so_far: job?.records_exported,
    current_step: job?.current_step,
    status: job?.status,
    estimate: {
      note: 'Heurística — não é medição exata. Autorizar pacote completo antes de Meneses full.',
      likelyFiles: found,
      lotPlansMemorialsIfEnabled: planLots * 2,
      generalPlansPerProjectApprox: '1 por projeto',
      estimatedBinaryMb: Number(estWithPlansMb.toFixed(1)),
      packageSplitLikely: splitLikely,
      estimatedMinutesFull:
        found > 500 || planLots > 200 ? '60–180+' : found > 100 ? '15–60' : '5–20',
    },
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
