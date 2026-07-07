import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import type { MasterSaasPayment } from '@/lib/masterSaasPayments';
import { markInvoicePaid, reactivateCompanyOnPayment } from '@/lib/saasBilling';
import { createSaasCashIncomeFromMasterPayment } from '@/lib/saasCashMovements';
import { createMasterApiPerfTracker } from '@/lib/masterApiPerfLog';

export async function GET(request: Request) {
  const perf = createMasterApiPerfTracker('/api/master/saas-payments', 'GET');

  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    perf.finish();
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const auth = await perf.timeSupabase('auth.assertSuperAdmin', () =>
    assertSuperAdmin(supabaseAdmin, userId),
  );
  if (!auth.ok) {
    perf.finish();
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const payments = await perf.timeSupabase(
    'supabase.master_saas_payments.select',
    async () => {
      const { data, error } = await supabaseAdmin
        .from('master_saas_payments')
        .select('*')
        .order('paid_at', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return data || [];
    },
    (rows) => rows.length,
  );

  const companyIds = [...new Set(payments.map((p) => p.company_id))];
  const companies = await perf.timeSupabase(
    'supabase.companies.select_names',
    async () => {
      if (!companyIds.length) return [];
      const { data } = await supabaseAdmin
        .from('companies')
        .select('id, name')
        .in('id', companyIds);
      return data || [];
    },
    (rows) => rows.length,
  );

  const companyNames = Object.fromEntries(companies.map((c) => [c.id, c.name || '—']));

  const rows: MasterSaasPayment[] = perf.timeProcess(
    'process.enrich_payments',
    () =>
      payments.map((p) => ({
        ...p,
        amount: Number(p.amount || 0),
        company_name: companyNames[p.company_id] || '—',
      })),
    (result) => result.length,
  );

  perf.finish(rows.length);
  return NextResponse.json({ payments: rows });
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

    const companyId = String(body.companyId || '').trim();
    const amount = Number(body.amount);
    const paidAt = String(body.paidAt || '').trim();
    const paymentMethod = String(body.paymentMethod || 'manual').trim();
    const referenceMonth = String(body.referenceMonth || '').trim();
    const notes = body.notes ? String(body.notes) : null;

    if (!companyId || !paidAt || !referenceMonth || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 });
    }

    let subscriptionId = body.subscriptionId ? String(body.subscriptionId) : null;
    if (!subscriptionId) {
      const { data: sub } = await supabaseAdmin
        .from('company_subscriptions')
        .select('id')
        .eq('company_id', companyId)
        .maybeSingle();
      subscriptionId = sub?.id ?? null;
    }

    const invoiceId = body.invoiceId ? String(body.invoiceId).trim() : null;

    if (invoiceId) {
      const result = await markInvoicePaid(supabaseAdmin, {
        invoiceId,
        paidAt,
        paymentMethod,
        notes,
        createdBy: body.userId,
      });

      await supabaseAdmin.from('audit_logs').insert({
        tenant_id: companyId,
        company_id: companyId,
        user_id: body.userId,
        module: 'SUBSCRIPTIONS',
        action: 'SAAS_PAYMENT_REGISTERED',
        description: `Pagamento fatura ${result.invoice.invoice_number} — R$ ${result.invoice.final_amount.toFixed(2)}`,
      });

      return NextResponse.json({
        success: true,
        payment: { id: result.paymentId },
        invoice: result.invoice,
      });
    }

    const { data: payment, error: payErr } = await supabaseAdmin
      .from('master_saas_payments')
      .insert({
        company_id: companyId,
        subscription_id: subscriptionId,
        amount,
        paid_at: paidAt,
        payment_method: paymentMethod,
        reference_month: referenceMonth,
        status: 'paid',
        notes,
        created_by: body.userId,
      })
      .select('*')
      .single();

    if (payErr) {
      return NextResponse.json({ error: payErr.message }, { status: 500 });
    }

    if (subscriptionId) {
      await supabaseAdmin
        .from('company_subscriptions')
        .update({
          payment_status: 'paid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId);
    }

    await reactivateCompanyOnPayment(supabaseAdmin, companyId);

    await createSaasCashIncomeFromMasterPayment(supabaseAdmin, {
      masterPaymentId: payment.id,
      companyId,
      amount,
      paidAt,
      referenceMonth,
      createdBy: body.userId,
    });

    await supabaseAdmin.from('audit_logs').insert({
      tenant_id: companyId,
      company_id: companyId,
      user_id: body.userId,
      module: 'SUBSCRIPTIONS',
      action: 'SAAS_PAYMENT_REGISTERED',
      description: `Pagamento SaaS ${referenceMonth} — R$ ${amount.toFixed(2)}`,
    });

    return NextResponse.json({ success: true, payment });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
