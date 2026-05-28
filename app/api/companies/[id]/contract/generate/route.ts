import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  generateAndStoreSaasContract,
  getSubscriptionByCompanyId,
  provisionSaasSubscription,
} from '@/lib/saasSubscriptionService';

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
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
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
      const created = await provisionSaasSubscription(supabaseAdmin, company);
      subscription = created.subscription;
    }

    if (!subscription) {
      return NextResponse.json({ error: 'Assinatura não disponível para empresa de teste.' }, { status: 400 });
    }

    const contract = await generateAndStoreSaasContract(supabaseAdmin, company, subscription);

    const { data: refreshed } = await supabaseAdmin
      .from('company_subscriptions')
      .select('*')
      .eq('id', subscription.id)
      .single();

    return NextResponse.json({
      success: true,
      contract_number: contract.contractNumber,
      contract_pdf_url: contract.contractPdfUrl,
      subscription: refreshed,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
