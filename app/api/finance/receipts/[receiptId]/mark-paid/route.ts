import { NextResponse } from 'next/server';
import { decideManualReceiptMarkPaid } from '@/lib/finance/manualReceiptMarkPaid';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const RECEIPT_SELECT =
  'id, tenant_id, company_id, status, amount, paid_amount, paid_at, installment_number, sale_id';

function messageFor(code: string): string {
  if (code === 'already_paid') return 'Esta parcela já está paga.';
  if (code === 'cancelled') return 'Parcela cancelada não pode ser paga.';
  if (code === 'tenant_mismatch') return 'A parcela não pertence à empresa atual.';
  if (code === 'forbidden') return 'Sem permissão para registrar pagamento.';
  if (code === 'not_found') return 'Parcela não encontrada.';
  return 'Erro ao registrar pagamento.';
}

export async function POST(
  request: Request,
  context: { params: Promise<{ receiptId: string }> },
) {
  const auth = await getRequestAuthUser(request);
  if (!auth.user?.id) {
    return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 });
  }

  const { receiptId } = await context.params;
  const { client: admin } = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Erro ao registrar pagamento.' }, { status: 503 });
  }

  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('id, role, status, tenant_id, company_id')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 });
  }

  const { data: receipt, error: receiptError } = await admin
    .from('finance_receipts')
    .select(RECEIPT_SELECT)
    .eq('id', receiptId)
    .maybeSingle();
  if (receiptError || !receipt) {
    return NextResponse.json({ ok: false, error: messageFor('not_found') }, { status: 404 });
  }

  const row = receipt as {
    id: string;
    tenant_id?: string | null;
    company_id?: string | null;
    status?: string | null;
    paid_at?: string | null;
    amount?: number | null;
  };
  const operator = profile as {
    role?: string | null;
    status?: string | null;
    tenant_id?: string | null;
    company_id?: string | null;
  };
  const decision = decideManualReceiptMarkPaid({
    operatorTenantId: operator.tenant_id || operator.company_id,
    operatorRole: operator.role,
    operatorStatus: operator.status,
    receipt: {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      status: row.status,
      paidAt: row.paid_at,
      amount: row.amount,
    },
  });
  if (!decision.ok) {
    const status = decision.code === 'already_paid'
      ? 409
      : decision.code === 'tenant_mismatch' || decision.code === 'forbidden' || decision.code === 'cancelled'
        ? 403
        : 422;
    return NextResponse.json({ ok: false, code: decision.code, error: messageFor(decision.code) }, { status });
  }

  const paidAt = new Date().toISOString();
  const { data, error } = await admin.rpc('execute_authorized_manual_receipt_payment', {
    p_receipt_id: decision.receiptId,
    p_operator_id: auth.user.id,
    p_paid_at: paidAt,
    p_amount: decision.amount,
  });
  if (error) {
    console.warn('[mark-paid] rpc', error.code || 'rpc_error');
    return NextResponse.json({ ok: false, error: messageFor('rpc') }, { status: 422 });
  }

  const payload = (data || {}) as { ok?: boolean; code?: string; cashMovementId?: string | null };
  if (payload.code === 'already_paid' || payload.code === 'cancelled') {
    return NextResponse.json(
      { ok: false, code: payload.code, error: messageFor(payload.code) },
      { status: payload.code === 'cancelled' ? 403 : 409 },
    );
  }
  if (payload.ok !== true) {
    return NextResponse.json({ ok: false, error: messageFor('rpc') }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    receiptId: decision.receiptId,
    cashMovementId: payload.cashMovementId || null,
    paidAt,
  });
}
