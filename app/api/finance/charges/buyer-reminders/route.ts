import { NextResponse } from 'next/server';
import { authorizeTenantBilling } from '@/lib/tenantBillingAuth';
import { isOwnerRole } from '@/lib/rolePermissions';
import { ownerWriteForbiddenResponse } from '@/lib/ownerWriteGuard';
import {
  loadBuyerReminderSettings,
  saveBuyerReminderSettings,
} from '@/lib/charges/buyerReminderSettings';
import {
  buyerRemindersProductionBlockedReason,
  listBuyerReminderLogs,
  runBuyerInstallmentReminders,
} from '@/lib/charges/buyerReminderRunner';
import { normalizeBuyerReminderSettings } from '@/lib/charges/buyerReminderTypes';
import { toIsoDateOnly } from '@/lib/companySubscriptionDates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;

  const url = new URL(request.url);
  const wantLogs = url.searchParams.get('logs') === '1' || url.searchParams.get('include') === 'logs';
  try {
    const settings = await loadBuyerReminderSettings(auth.admin, auth.tenantId);
    const logs = wantLogs
      ? await listBuyerReminderLogs(auth.admin, auth.tenantId, {
          limit: 100,
          eventType: url.searchParams.get('event'),
          channel: url.searchParams.get('channel'),
          status: url.searchParams.get('status'),
          from: url.searchParams.get('from'),
          to: url.searchParams.get('to'),
        })
      : [];
    return NextResponse.json({
      ok: true,
      settings,
      logs,
      productionBlocked: Boolean(buyerRemindersProductionBlockedReason()),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao carregar lembretes.' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;
  if (isOwnerRole(auth.role)) return ownerWriteForbiddenResponse();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const settings = await saveBuyerReminderSettings(auth.admin, {
      ...normalizeBuyerReminderSettings(auth.tenantId, body),
      updatedBy: auth.userId,
    });
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao salvar lembretes.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;
  if (isOwnerRole(auth.role)) return ownerWriteForbiddenResponse();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || 'simulate').trim().toLowerCase();
  const dryRun = action !== 'run';
  const runDate = toIsoDateOnly(String(body.runDate || body.run_date || '')) || undefined;
  const forceEnabled = body.forceEnabled === true || body.force_enabled === true;

  try {
    const result = await runBuyerInstallmentReminders(auth.admin, {
      dryRun,
      runDate,
      companyId: auth.tenantId,
      forceEnabled: forceEnabled && dryRun,
    });
    return NextResponse.json({ ok: true, action: dryRun ? 'simulate' : 'run', ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao executar simulação.' },
      { status: 500 },
    );
  }
}
