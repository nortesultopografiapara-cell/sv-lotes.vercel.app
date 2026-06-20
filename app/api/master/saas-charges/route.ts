import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  cancelSaasCharge,
  createSaasPixCharge,
  deleteCancelledSaasCharge,
  listSaasCharges,
  refreshSaasChargePixFromAsaas,
  syncSaasChargeStatusFromAsaas,
} from '@/lib/saasCharges';
import {
  assertSaasPaymentGatewayConfigured,
  getSaasPaymentGatewayStatus,
} from '@/lib/saasPaymentGateway';

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
    const charges = await listSaasCharges(supabaseAdmin, {
      companyId: searchParams.get('companyId') || undefined,
      status: searchParams.get('status') || undefined,
    });
    return NextResponse.json({
      charges,
      gateway: getSaasPaymentGatewayStatus(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao listar cobranças';
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

    const action = String(body.action || 'generate').trim();
    const chargeId = String(body.chargeId || '').trim();

    if (action === 'cancel') {
      if (!chargeId) {
        return NextResponse.json({ error: 'chargeId obrigatório.' }, { status: 400 });
      }
      const charge = await cancelSaasCharge(supabaseAdmin, chargeId, body.userId);
      return NextResponse.json({ success: true, charge });
    }

    if (action === 'delete_cancelled') {
      if (!chargeId) {
        return NextResponse.json({ error: 'chargeId obrigatório.' }, { status: 400 });
      }
      const result = await deleteCancelledSaasCharge(
        supabaseAdmin,
        chargeId,
        body.userId,
      );
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'sync_status') {
      if (!chargeId) {
        return NextResponse.json({ error: 'chargeId obrigatório.' }, { status: 400 });
      }
      try {
        assertSaasPaymentGatewayConfigured();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Gateway não configurado.';
        return NextResponse.json({ error: message }, { status: 503 });
      }
      const result = await syncSaasChargeStatusFromAsaas(
        supabaseAdmin,
        chargeId,
        body.userId,
      );
      return NextResponse.json({
        success: true,
        charge: result.charge,
        paid: result.paid,
        statusSynced: result.statusSynced,
      });
    }

    if (action === 'refresh_pix') {
      if (!chargeId) {
        return NextResponse.json({ error: 'chargeId obrigatório.' }, { status: 400 });
      }
      try {
        assertSaasPaymentGatewayConfigured();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Gateway não configurado.';
        return NextResponse.json({ error: message }, { status: 503 });
      }
      const charge = await refreshSaasChargePixFromAsaas(supabaseAdmin, chargeId);
      return NextResponse.json({ success: true, charge });
    }

    try {
      assertSaasPaymentGatewayConfigured();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gateway não configurado.';
      return NextResponse.json({ error: message }, { status: 503 });
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

    const result = await createSaasPixCharge(supabaseAdmin, company, subscription, {
      referenceMonth: body.referenceMonth || undefined,
      dueDate: body.dueDate || undefined,
      notes: body.notes || null,
      actorUserId: body.userId,
      billingType: String(body.billingType || 'PIX').toUpperCase() === 'BOLETO' ? 'BOLETO' : 'PIX',
    });

    if (!result.created && result.skipped) {
      return NextResponse.json({
        success: true,
        created: false,
        skipped: result.skipped,
        charge: result.charge,
        invoice: result.invoice,
      });
    }

    return NextResponse.json({
      success: true,
      created: result.created,
      charge: result.charge,
      invoice: result.invoice,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
