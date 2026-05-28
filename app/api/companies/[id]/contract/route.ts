import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { buildSaasContractPdf } from '@/lib/saasContractPdf';
import { subscriptionDatesForContractPdf } from '@/lib/companySubscriptionDates';
import { getSubscriptionByCompanyId } from '@/lib/saasSubscriptionService';
import { generateSaasContractNumber } from '@/lib/saasSubscription';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id: companyId } = await params;
  const url = new URL(request.url);
  const download = url.searchParams.get('download') === '1';
  const userId = url.searchParams.get('userId');

  if (!download) {
    const auth = await assertSuperAdmin(supabaseAdmin, userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }
  }

  const { data: company, error: companyErr } = await supabaseAdmin
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (companyErr || !company) {
    return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });
  }

  const subscription = await getSubscriptionByCompanyId(supabaseAdmin, companyId);
  if (!subscription) {
    return NextResponse.json({ error: 'Assinatura não encontrada.' }, { status: 404 });
  }

  if (download) {
    const pdfDates = subscriptionDatesForContractPdf(subscription);
    const subForPdf = {
      contract_number: subscription.contract_number || generateSaasContractNumber(),
      plan_type: subscription.plan_type,
      monthly_price: subscription.monthly_price,
      start_date: pdfDates.start_date,
      first_payment_date: pdfDates.first_payment_date,
      next_due_date: pdfDates.next_due_date,
    };
    const pdfBytes = buildSaasContractPdf({ company, subscription: subForPdf });
    return new NextResponse(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="contrato-${companyId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json({
    company: { id: company.id, name: company.name, cnpj: company.cnpj },
    subscription,
  });
}
