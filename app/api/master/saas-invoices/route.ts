import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  generateInvoiceForCompany,
  listMasterSaasInvoices,
  runSaasBillingMaintenance,
} from '@/lib/saasBilling';
import { generateMonthlySaasCharges } from '@/lib/saasCharges';
import { assertSaasPaymentGatewayConfigured } from '@/lib/saasPaymentGateway';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const auth = await assertSuperAdmin(supabaseAdmin, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const invoices = await listMasterSaasInvoices(supabaseAdmin, {
      companyId: searchParams.get('companyId') || undefined,
      referenceMonth: searchParams.get('referenceMonth') || undefined,
      status: searchParams.get('status') || undefined,
    });
    return NextResponse.json({ invoices });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao listar faturas';
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

    const action = String(body.action || 'generate_company').trim();

    if (action === 'generate_monthly') {
      try {
        assertSaasPaymentGatewayConfigured();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Gateway não configurado.';
        return NextResponse.json({ error: message }, { status: 503 });
      }

      const result = await generateMonthlySaasCharges(supabaseAdmin, {
        referenceMonth: body.referenceMonth || undefined,
        actorUserId: body.userId,
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'run_maintenance') {
      const maintenance = await runSaasBillingMaintenance(supabaseAdmin);
      return NextResponse.json({ success: true, ...maintenance });
    }

    const companyId = String(body.companyId || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId obrigatório.' }, { status: 400 });
    }

    const { data: company, error: companyErr } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyErr || !company) {
      return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });
    }

    const { data: subscription } = await supabaseAdmin
      .from('company_subscriptions')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();

    const result = await generateInvoiceForCompany(
      supabaseAdmin,
      company,
      subscription,
      {
        referenceMonth: body.referenceMonth || undefined,
        dueDate: body.dueDate || undefined,
        notes: body.notes || null,
      },
    );

    if (!result.created && result.skipped) {
      return NextResponse.json({
        success: true,
        created: false,
        skipped: result.skipped,
        invoice: result.invoice,
      });
    }

    await supabaseAdmin.from('audit_logs').insert({
      tenant_id: companyId,
      company_id: companyId,
      user_id: body.userId,
      module: 'SUBSCRIPTIONS',
      action: 'SAAS_INVOICE_GENERATED',
      description: `Cobrança ${result.invoice?.reference_month} — ${result.invoice?.invoice_number}`,
    });

    return NextResponse.json({
      success: true,
      created: result.created,
      invoice: result.invoice,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
