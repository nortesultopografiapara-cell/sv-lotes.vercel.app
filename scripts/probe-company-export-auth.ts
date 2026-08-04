/**
 * Prova ao vivo de autorização das APIs de export (Preview).
 * Não imprime secrets.
 *
 * COMPANY_EXPORT_PREVIEW_URL + SUPER_ADMIN_USER_ID
 */
const PREVIEW =
  process.env.COMPANY_EXPORT_PREVIEW_URL ||
  'https://sv-lotes-vercel-rgd2h1yy5.vercel.app';
const COMPANY_ID =
  process.env.COMPANY_EXPORT_TEST_COMPANY_ID ||
  'a0c1d2e3-f4a5-6789-abcd-ef0123456789';
const OTHER_COMPANY_ID =
  process.env.COMPANY_EXPORT_OTHER_COMPANY_ID ||
  'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
const SUPER = process.env.SUPER_ADMIN_USER_ID || '';
const FAKE_USER = '00000000-0000-4000-8000-000000000001';

type Probe = {
  name: string;
  ok: boolean;
  http: number;
  contentType: string;
  isHtml: boolean;
  detail?: string;
};

async function probe(
  name: string,
  url: string,
  init?: RequestInit,
  expect?: { status?: number | number[]; json?: boolean; notHtml?: boolean },
): Promise<Probe> {
  const res = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.headers || {}),
    },
  });
  const ct = String(res.headers.get('content-type') || '');
  const text = await res.text();
  const isHtml = /text\/html/i.test(ct) || text.trimStart().startsWith('<!DOCTYPE');
  let detail = text.slice(0, 180);
  try {
    const j = JSON.parse(text);
    detail = JSON.stringify(j).slice(0, 180);
  } catch {
    // keep text
  }
  const statuses = expect?.status
    ? Array.isArray(expect.status)
      ? expect.status
      : [expect.status]
    : null;
  const statusOk = statuses ? statuses.includes(res.status) : true;
  const htmlOk = expect?.notHtml === false ? true : !isHtml;
  const jsonOk = expect?.json === false ? true : ct.includes('application/json') || text.startsWith('{');
  return {
    name,
    ok: statusOk && htmlOk && jsonOk,
    http: res.status,
    contentType: ct,
    isHtml,
    detail,
  };
}

async function main() {
  if (!SUPER) {
    console.log(JSON.stringify({ ok: false, error: 'SUPER_ADMIN_USER_ID obrigatório' }));
    process.exit(2);
  }

  const base = `${PREVIEW}/api/master/companies/${COMPANY_ID}/exports`;
  const results: Probe[] = [];

  results.push(
    await probe('no_userId', base, undefined, { status: [401, 403], notHtml: true, json: true }),
  );
  results.push(
    await probe(
      'fake_user',
      `${base}?userId=${FAKE_USER}`,
      undefined,
      { status: [401, 403], notHtml: true, json: true },
    ),
  );
  results.push(
    await probe(
      'impersonation',
      `${base}?userId=${encodeURIComponent(SUPER)}&impersonatingTenantId=${COMPANY_ID}`,
      undefined,
      { status: 403, notHtml: true, json: true },
    ),
  );
  results.push(
    await probe(
      'super_admin_list',
      `${base}?userId=${encodeURIComponent(SUPER)}`,
      undefined,
      { status: 200, notHtml: true, json: true },
    ),
  );

  // Cross-company: use a fake export id under another company path
  const fakeExport = '11111111-1111-4111-8111-111111111111';
  results.push(
    await probe(
      'cross_company_export',
      `${PREVIEW}/api/master/companies/${OTHER_COMPANY_ID}/exports/${fakeExport}?userId=${encodeURIComponent(SUPER)}`,
      undefined,
      { status: [403, 404], notHtml: true, json: true },
    ),
  );

  results.push(
    await probe(
      'cron_process_no_secret',
      `${PREVIEW}/api/cron/process-company-exports`,
      undefined,
      { status: 401, notHtml: true, json: true },
    ),
  );
  results.push(
    await probe(
      'cron_expire_no_secret',
      `${PREVIEW}/api/cron/expire-company-exports`,
      undefined,
      { status: 401, notHtml: true, json: true },
    ),
  );
  results.push(
    await probe(
      'homolog_removed',
      `${PREVIEW}/api/cron/homolog-company-export-f0-f1`,
      undefined,
      { status: [404, 405], notHtml: false, json: false },
    ),
  );

  // Create + cancel PENDING/PROCESSING then cleanup if completed too fast
  const createRes = await fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      userId: SUPER,
      reason: 'BACKUP',
      notes: 'Auth probe cancel',
    }),
  });
  const created = await createRes.json();
  const exportId = String(created.job?.id || '');
  let cancelProbe: Probe | null = null;
  if (createRes.ok && exportId) {
    const cancelRes = await fetch(`${base}/${exportId}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ userId: SUPER }),
    });
    const cancelText = await cancelRes.text();
    const isHtml = cancelText.trimStart().startsWith('<!DOCTYPE');
    cancelProbe = {
      name: 'cancel_job',
      ok: [200, 400].includes(cancelRes.status) && !isHtml,
      http: cancelRes.status,
      contentType: String(cancelRes.headers.get('content-type') || ''),
      isHtml,
      detail: cancelText.slice(0, 180),
    };
    results.push(cancelProbe);

    // If still has package, try delete (best-effort)
    await fetch(`${base}/${exportId}/file?userId=${encodeURIComponent(SUPER)}`, {
      method: 'DELETE',
      headers: { accept: 'application/json' },
    }).catch(() => null);
  } else {
    results.push({
      name: 'cancel_job',
      ok: false,
      http: createRes.status,
      contentType: '',
      isHtml: false,
      detail: JSON.stringify(created).slice(0, 180),
    });
  }

  const ok = results.every((r) => r.ok);
  console.log(JSON.stringify({ ok, preview: PREVIEW, results }, null, 2));
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
