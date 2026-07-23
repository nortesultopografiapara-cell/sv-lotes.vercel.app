import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import { syncCorporateAsaasCharge } from '@/lib/master/corporateFinance/asaas/chargesService';
import { logCorporateFinanceAudit } from '@/lib/master/corporateFinance/service';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Reprocessa cobrança: sync remoto + liquidação idempotente se paga.
 * Seguro contra duplicidade (mesma chave ASAAS_CORP:{payment_id}).
 */
export async function POST(request: Request, ctx: Ctx) {
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
    const { id } = await ctx.params;
    const charge = await syncCorporateAsaasCharge(
      supabaseAdmin,
      id,
      body.userId ? String(body.userId) : null,
    );
    await logCorporateFinanceAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'CORPORATE_ASAAS_CHARGE_REPROCESSED',
      entityId: charge.id,
      description: `Reprocessamento ${charge.asaas_payment_id} → ${charge.local_status}`,
      newData: {
        receivable_payment_id: charge.receivable_payment_id,
        cash_movement_id: charge.cash_movement_id,
      },
    });
    return NextResponse.json({ charge });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao reprocessar.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
