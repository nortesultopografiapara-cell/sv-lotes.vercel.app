import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  ensureSaasSubscription,
  generateAndStoreSaasContract,
  getSubscriptionByCompanyId,
} from '@/lib/saasSubscriptionService';
import type { CompanySubscription } from '@/lib/saasSubscription';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id: companyId } = await params;

  try {
    const body = await request.json().catch(() => ({}));

    console.log('[GENERATE_SAAS_CONTRACT_API]', { companyId, body });

    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    if (body.company_id && body.company_id !== companyId) {
      return NextResponse.json({ error: 'company_id não confere com a URL.' }, { status: 400 });
    }

    const { data: company, error: companyErr } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyErr || !company) {
      return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });
    }

    let subscription = await getSubscriptionByCompanyId(supabaseAdmin, companyId);
    if (!subscription) {
      const created = await ensureSaasSubscription(supabaseAdmin, company);
      if (created.error) {
        return NextResponse.json({ error: created.error }, { status: 500 });
      }
      subscription = created.subscription;
    }

    if (!subscription) {
      return NextResponse.json(
        { error: 'Assinatura não disponível para empresa de teste.' },
        { status: 400 },
      );
    }

    if (body.subscription_id && body.subscription_id !== subscription.id) {
      return NextResponse.json({ error: 'subscription_id inválido.' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.plan_type) patch.plan_type = String(body.plan_type);
    if (body.monthly_price != null && body.monthly_price !== '') {
      const price = Number(body.monthly_price);
      if (Number.isFinite(price)) patch.monthly_price = price;
    }
    if (body.next_due_date) patch.next_due_date = String(body.next_due_date);

    if (Object.keys(patch).length > 1) {
      const { data: patched, error: patchErr } = await supabaseAdmin
        .from('company_subscriptions')
        .update(patch)
        .eq('id', subscription.id)
        .select('*')
        .single();

      if (patchErr) {
        return NextResponse.json({ error: patchErr.message }, { status: 500 });
      }
      subscription = patched as CompanySubscription;
    }

    const contract = await generateAndStoreSaasContract(supabaseAdmin, company, subscription);

    const { data: refreshed, error: refreshErr } = await supabaseAdmin
      .from('company_subscriptions')
      .select('*')
      .eq('id', subscription.id)
      .single();

    if (refreshErr) {
      return NextResponse.json({ error: refreshErr.message }, { status: 500 });
    }

    const result = {
      success: true,
      contract_number: contract.contractNumber,
      contract_pdf_url: contract.contractPdfUrl,
      subscription: refreshed,
    };

    console.log('[GENERATE_SAAS_CONTRACT_API_OK]', result);

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro interno';
    console.error('[GENERATE_SAAS_CONTRACT_API_ERROR]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
