import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { addDaysFromToday } from '@/lib/saasSubscription';

type SubscriptionAction = 'suspend' | 'reactivate' | 'renew';

const AUDIT_ACTION: Record<SubscriptionAction, string> = {
  suspend: 'SUBSCRIPTION_SUSPENDED',
  reactivate: 'SUBSCRIPTION_REACTIVATED',
  renew: 'SUBSCRIPTION_RENEWED',
};

function addMonthsFromIso(iso: string, months = 1): string {
  const d = new Date(`${iso.split('T')[0]}T12:00:00`);
  if (Number.isNaN(d.getTime())) return addDaysFromToday(30);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

export async function POST(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const body = await request.json();
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const action = String(body.action || '').toLowerCase() as SubscriptionAction;
    const subscriptionId = body.subscriptionId as string | undefined;
    const companyId = body.companyId as string | undefined;

    if (!subscriptionId || !companyId || !AUDIT_ACTION[action]) {
      return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 });
    }

    const subPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    let companyStatus: string | null = null;

    if (action === 'suspend') {
      subPatch.contract_status = 'suspended';
      subPatch.payment_status = 'overdue';
      companyStatus = 'Suspensa';
    } else if (action === 'reactivate') {
      subPatch.contract_status = 'active';
      subPatch.payment_status = 'pending';
      companyStatus = 'Ativa';
    } else if (action === 'renew') {
      const { data: current } = await supabaseAdmin
        .from('company_subscriptions')
        .select('next_due_date')
        .eq('id', subscriptionId)
        .single();
      const baseDate = current?.next_due_date || new Date().toISOString().split('T')[0];
      subPatch.next_due_date = addMonthsFromIso(baseDate, 1);
      subPatch.payment_status = 'pending';
      subPatch.contract_status = 'active';
      companyStatus = 'Ativa';
    }

    const { data: subscription, error: subErr } = await supabaseAdmin
      .from('company_subscriptions')
      .update(subPatch)
      .eq('id', subscriptionId)
      .select('*')
      .single();

    if (subErr) {
      return NextResponse.json({ error: subErr.message }, { status: 500 });
    }

    if (companyStatus) {
      await supabaseAdmin
        .from('companies')
        .update({
          status_operacional: companyStatus,
          active: companyStatus === 'Ativa',
          next_payment_date: subscription?.next_due_date || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', companyId);
    }

      await supabaseAdmin.from('audit_logs').insert({
      tenant_id: companyId,
      company_id: companyId,
      user_id: body.userId,
      module: 'SUBSCRIPTIONS',
      action: AUDIT_ACTION[action],
      description: `Assinatura ${action} — empresa ${companyId}`,
    });

    return NextResponse.json({ success: true, subscription });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
