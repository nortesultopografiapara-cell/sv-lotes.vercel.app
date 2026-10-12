/**
 * Rotina TEMPORÁRIA — conciliação GET-only Banco Inter.
 * Somente SUPER_ADMIN. Isolada por empresa. Sem POST/PATCH/PUT/DELETE.
 * REMOVER após conciliação do contrato 000000098/2026.
 *
 * GET /api/admin/inter/sale-charges-reconcile?companyId=&saleId=
 */
import { NextResponse } from 'next/server';
import { isPlatformAdmin } from '@/lib/rls';
import { normalizeUserRole } from '@/lib/rolePermissions';
import {
  CALLER_PROFILE_SELECT,
  createAdminSupabase,
  getRequestAuthUser,
} from '@/lib/supabase/server';
import { isInterAdminGetReconcileEnabled } from '@/lib/banking/inter/interAdminGetReconcileFlag';
import { reconcileInterSaleChargesGetOnly } from '@/lib/banking/inter/interAdminGetReconcileService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function GET(request: Request) {
  if (!isInterAdminGetReconcileEnabled()) return notFound();

  const { user, configError } = await getRequestAuthUser(request);
  if (configError || !user) {
    return NextResponse.json({ error: configError || 'Não autenticado.' }, { status: 401 });
  }

  const { client: admin, configError: adminError } = createAdminSupabase();
  if (!admin || adminError) {
    return NextResponse.json({ error: adminError || 'Service role indisponível.' }, { status: 503 });
  }

  const { data: profile } = await admin
    .from('users')
    .select(CALLER_PROFILE_SELECT)
    .eq('id', user.id)
    .maybeSingle();
  const role = normalizeUserRole(profile?.role);
  if (role !== 'SUPER_ADMIN' || !isPlatformAdmin(role)) {
    return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const companyId = String(url.searchParams.get('companyId') || '').trim();
  const saleId = String(url.searchParams.get('saleId') || '').trim();
  const dueFrom = String(url.searchParams.get('dueFrom') || '').trim() || null;
  const dueTo = String(url.searchParams.get('dueTo') || '').trim() || null;
  if (!companyId || !saleId) {
    return NextResponse.json({ error: 'companyId e saleId obrigatórios.' }, { status: 400 });
  }

  try {
    const result = await reconcileInterSaleChargesGetOnly({
      admin,
      companyId,
      saleId,
      dueFrom,
      dueTo,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, readOnly: true }, { status: result.status });
    }
    return NextResponse.json({
      ok: true,
      readOnly: true,
      emitAttempted: false,
      companyId: result.companyId,
      saleId: result.saleId,
      report: result.report,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha na conciliação Inter.';
    const safe = message
      .replace(/\d{11,14}/g, '[doc]')
      .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, '[pem]')
      .slice(0, 240);
    console.error('[inter-admin-get-reconcile]', { companyId, saleId, error: safe });
    return NextResponse.json({ error: 'Falha na conciliação Inter.', readOnly: true }, { status: 500 });
  }
}
