import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import { reverseReceivablePayment } from '@/lib/master/corporateFinance/receivablesService';
import { logCorporateFinanceAudit } from '@/lib/master/corporateFinance/service';

/**
 * Reabre Conta a Receber estornando recebimentos ativos (ex.: liquidação indevida ao gerar cobrança).
 * Não apaga a AR. Uso SUPER_ADMIN / Preview.
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

    const code = String(body.code || '').trim().toUpperCase();
    const reason = String(
      body.reason || 'Estorno de liquidação indevida ao gerar cobrança Asaas (correção Preview)',
    ).trim();
    if (!code) throw new Error('code da AR é obrigatório.');

    const { data: receivable, error: rErr } = await supabaseAdmin
      .from('master_corporate_receivables')
      .select('id, code, status, received_amount')
      .eq('code', code)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!receivable) throw new Error(`AR ${code} não encontrada.`);

    const { data: payments, error: pErr } = await supabaseAdmin
      .from('master_corporate_receivable_payments')
      .select('id, amount, is_reversed, origin, idempotency_key')
      .eq('receivable_id', receivable.id)
      .eq('is_reversed', false);
    if (pErr) throw new Error(pErr.message);

    const reversed: string[] = [];
    for (const pay of payments || []) {
      await reverseReceivablePayment(
        supabaseAdmin,
        String(receivable.id),
        String(pay.id),
        reason,
        body.userId ? String(body.userId) : null,
      );
      reversed.push(String(pay.id));
    }

    await supabaseAdmin
      .from('master_corporate_receivables')
      .update({
        asaas_integration_status: null,
        asaas_active_charge_id: null,
        asaas_last_error: null,
        asaas_last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', receivable.id);

    // Desvincula cobranças locais (best-effort — não falha se tabela/migration ausente)
    const { error: unlinkErr } = await supabaseAdmin
      .from('master_corporate_asaas_charges')
      .update({
        receivable_payment_id: null,
        cash_movement_id: null,
        local_status: 'CANCELLED',
        canceled_at: new Date().toISOString(),
        last_error: 'Desvinculada após reabertura da AR (correção liquidação indevida)',
        updated_at: new Date().toISOString(),
      })
      .eq('receivable_id', receivable.id)
      .is('canceled_at', null);
    if (unlinkErr) {
      // não aborta a reabertura da AR
    }

    const { data: after } = await supabaseAdmin
      .from('master_corporate_receivables')
      .select('id, code, status, received_amount, remaining_amount')
      .eq('id', receivable.id)
      .single();

    await logCorporateFinanceAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'CORPORATE_RECEIVABLE_REOPENED_AFTER_ERRONEOUS_SETTLE',
      entityId: String(receivable.id),
      description: `Reabertura ${code}: ${reversed.length} recebimento(s) estornado(s)`,
      newData: { reversedPaymentIds: reversed, status: after?.status },
    });

    return NextResponse.json({
      ok: true,
      receivable: after,
      reversedPaymentIds: reversed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao reabrir AR.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
