import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import { reconcileCorporateAsaasCharges } from '@/lib/master/corporateFinance/asaas/reconcileService';

/**
 * Conciliação operacional — cobranças pagas sem webhook.
 * Não importa OFX nem lançamentos bancários externos.
 */
export async function POST(request: Request) {
  const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const auth = await authorizeCorporateFinance(supabaseAdmin, {
      userId: body.userId,
      impersonatingTenantId: body.impersonatingTenantId,
    });
    if (!auth.ok) return auth.response;

    const result = await reconcileCorporateAsaasCharges(supabaseAdmin, {
      chargeId: body.charge_id || body.chargeId || null,
      receivableId: body.receivable_id || body.receivableId || null,
      limit: body.limit != null ? Number(body.limit) : 50,
      dryRun: Boolean(body.dryRun || body.dry_run),
      userId: body.userId ? String(body.userId) : null,
    });

    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha na conciliação Asaas.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
