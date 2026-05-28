import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';

const ALLOWED_PAYMENT = new Set(['pending', 'paid', 'overdue', 'canceled']);
const ALLOWED_CONTRACT = new Set(['active', 'suspended', 'canceled']);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id: subscriptionId } = await params;

  try {
    const body = await request.json();
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.payment_status != null) {
      const ps = String(body.payment_status).toLowerCase();
      if (!ALLOWED_PAYMENT.has(ps)) {
        return NextResponse.json({ error: 'payment_status inválido.' }, { status: 400 });
      }
      patch.payment_status = ps;
    }

    if (body.contract_status != null) {
      const cs = String(body.contract_status).toLowerCase();
      if (!ALLOWED_CONTRACT.has(cs)) {
        return NextResponse.json({ error: 'contract_status inválido.' }, { status: 400 });
      }
      patch.contract_status = cs;
    }

    if (body.next_due_date != null) patch.next_due_date = body.next_due_date;
    if (body.monthly_price != null) patch.monthly_price = Number(body.monthly_price);
    if (body.custom_price_enabled != null) patch.custom_price_enabled = body.custom_price_enabled;
    if (body.custom_monthly_price != null) patch.custom_monthly_price = body.custom_monthly_price;

    const { data, error } = await supabaseAdmin
      .from('company_subscriptions')
      .update(patch)
      .eq('id', subscriptionId)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (data?.company_id && data.next_due_date) {
      await supabaseAdmin
        .from('companies')
        .update({ vencimento_plano: data.next_due_date, updated_at: new Date().toISOString() })
        .eq('id', data.company_id);
    }

    return NextResponse.json({ success: true, subscription: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
