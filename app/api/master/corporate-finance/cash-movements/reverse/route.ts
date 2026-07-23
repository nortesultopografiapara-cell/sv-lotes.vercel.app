import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { httpStatusFromMessage } from '@/lib/master/corporateFinance/arApApi';
import { reverseCashMovementForPayment } from '@/lib/master/corporateFinance/cashMovementsService';

export async function POST(request: Request) {
  const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const body = await request.json();
    const auth = await authorizeCorporateFinance(supabaseAdmin, {
      userId: body.userId,
      impersonatingTenantId: body.impersonatingTenantId,
    });
    if (!auth.ok) return auth.response;

    const movementId = String(body.movementId || '').trim();
    const reason = String(body.reason || '').trim();
    if (!movementId) throw new Error('movementId é obrigatório.');
    if (!reason) throw new Error('Motivo do estorno é obrigatório.');

    const { data: movement, error } = await supabaseAdmin
      .from('master_corporate_cash_movements')
      .select('*')
      .eq('id', movementId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!movement) throw new Error('Movimento não encontrado.');
    if (movement.is_reversed) throw new Error('Movimento já estornado.');
    if (movement.origin === 'REVERSAL' || movement.type === 'REVERSAL') {
      throw new Error('Estorno não pode ser estornado novamente.');
    }

    if (movement.receivable_payment_id) {
      const rev = await reverseCashMovementForPayment(supabaseAdmin, {
        kind: 'RECEIVABLE',
        paymentId: String(movement.receivable_payment_id),
        reason,
        userId: body.userId ? String(body.userId) : null,
      });
      return NextResponse.json({ reversal: rev });
    }
    if (movement.payable_payment_id) {
      const rev = await reverseCashMovementForPayment(supabaseAdmin, {
        kind: 'PAYABLE',
        paymentId: String(movement.payable_payment_id),
        reason,
        userId: body.userId ? String(body.userId) : null,
      });
      return NextResponse.json({ reversal: rev });
    }

    // Manual / transfer: reverse via payment helper pattern inline
    const { insertCashMovement, mapCashMovementRow } = await import(
      '@/lib/master/corporateFinance/cashMath'
    );
    const mapped = mapCashMovementRow(movement as Record<string, unknown>);
    const revTag =
      mapped.type === 'INCOME'
        ? '[REV:INCOME]'
        : mapped.type === 'EXPENSE'
          ? '[REV:EXPENSE]'
          : mapped.type === 'TRANSFER_IN'
            ? '[REV:TRANSFER_IN]'
            : mapped.type === 'TRANSFER_OUT'
              ? '[REV:TRANSFER_OUT]'
              : '[REV:OTHER]';

    const revKey = `REVERSAL:${mapped.id}`;
    const reversal = await insertCashMovement(supabaseAdmin, {
      movement_date: new Date().toISOString().slice(0, 10),
      competence_date: mapped.competence_date,
      type: 'REVERSAL',
      amount: mapped.amount,
      description: `Estorno de ${mapped.code} — ${mapped.description}`,
      financial_account_id: mapped.financial_account_id,
      category_id: mapped.category_id,
      cost_center_id: mapped.cost_center_id,
      project_id: mapped.project_id,
      quote_id: mapped.quote_id,
      transfer_group_id: mapped.transfer_group_id,
      origin: 'REVERSAL',
      payment_method: mapped.payment_method,
      reference: mapped.reference,
      notes: `${revTag} ${reason}`.slice(0, 2000),
      idempotency_key: revKey,
      created_by: body.userId ? String(body.userId) : null,
    });

    const { error: uErr } = await supabaseAdmin
      .from('master_corporate_cash_movements')
      .update({
        is_reversed: true,
        reversed_at: new Date().toISOString(),
        reversed_by: body.userId || null,
        reversal_reason: reason.slice(0, 500),
        reversal_movement_id: reversal.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', mapped.id);
    if (uErr) throw new Error(uErr.message);

    // Pair transfer: reverse the other leg too
    if (mapped.transfer_group_id) {
      const { data: peers } = await supabaseAdmin
        .from('master_corporate_cash_movements')
        .select('*')
        .eq('transfer_group_id', mapped.transfer_group_id)
        .eq('is_reversed', false)
        .neq('id', mapped.id);
      for (const peer of peers || []) {
        const pm = mapCashMovementRow(peer as Record<string, unknown>);
        const peerTag =
          pm.type === 'TRANSFER_IN'
            ? '[REV:TRANSFER_IN]'
            : pm.type === 'TRANSFER_OUT'
              ? '[REV:TRANSFER_OUT]'
              : '[REV:OTHER]';
        const peerRev = await insertCashMovement(supabaseAdmin, {
          movement_date: new Date().toISOString().slice(0, 10),
          competence_date: pm.competence_date,
          type: 'REVERSAL',
          amount: pm.amount,
          description: `Estorno de ${pm.code} — ${pm.description}`,
          financial_account_id: pm.financial_account_id,
          transfer_group_id: pm.transfer_group_id,
          origin: 'REVERSAL',
          notes: `${peerTag} ${reason}`.slice(0, 2000),
          idempotency_key: `REVERSAL:${pm.id}`,
          created_by: body.userId ? String(body.userId) : null,
        });
        await supabaseAdmin
          .from('master_corporate_cash_movements')
          .update({
            is_reversed: true,
            reversed_at: new Date().toISOString(),
            reversed_by: body.userId || null,
            reversal_reason: reason.slice(0, 500),
            reversal_movement_id: peerRev.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pm.id);
      }
    }

    return NextResponse.json({ reversal });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao estornar movimento.';
    return NextResponse.json({ error: message }, { status: httpStatusFromMessage(message) });
  }
}
