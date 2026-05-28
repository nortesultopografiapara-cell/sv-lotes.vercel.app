import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { generateAndStoreSaasContract } from '@/lib/saasContractService';
import { SaasContractStepError } from '@/lib/saasContractErrors';
import { normalizeSubscriptionBillingDates } from '@/lib/companySubscriptionDates';
import { validateSaasContractGeneration } from '@/lib/saasContractValidation';
import {
  ensureSaasSubscription,
  getSubscriptionByCompanyId,
} from '@/lib/saasSubscriptionService';
import type { CompanySubscription } from '@/lib/saasSubscription';

export const runtime = 'nodejs';

function contractErrorResponse(
  error: string,
  step: string,
  status = 500,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      success: false,
      error,
      step,
      ...extra,
    },
    { status },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return contractErrorResponse(configError || 'Supabase não configurado', 'config', 500);
  }

  const { id: companyId } = await params;

  try {
    const body = await request.json().catch(() => ({}));

    console.log('SAAS_CONTRACT_GENERATE_START', { companyId });

    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) {
      return contractErrorResponse(auth.error || 'Permissão negada', 'auth', 403);
    }

    if (body.company_id && body.company_id !== companyId) {
      return contractErrorResponse('company_id não confere com a URL.', 'validation', 400);
    }

    const { data: company, error: companyErr } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyErr || !company) {
      return contractErrorResponse('Empresa não encontrada.', 'validation', 404);
    }

    console.log('SAAS_CONTRACT_COMPANY_DATA', company);

    let subscription = await getSubscriptionByCompanyId(supabaseAdmin, companyId);
    if (!subscription) {
      const created = await ensureSaasSubscription(supabaseAdmin, company);
      if (created.error) {
        return contractErrorResponse(created.error, 'db_save', 500);
      }
      subscription = created.subscription;
    }

    if (!subscription) {
      return contractErrorResponse(
        'Assinatura não disponível para empresa de teste.',
        'validation',
        400,
      );
    }

    console.log('SAAS_CONTRACT_SUBSCRIPTION_DATA', subscription);

    if (body.subscription_id && body.subscription_id !== subscription.id) {
      return contractErrorResponse('subscription_id inválido.', 'validation', 400);
    }

    const validation = validateSaasContractGeneration(company, subscription);
    if (!validation.ok) {
      return contractErrorResponse(
        validation.error || 'Dados inválidos',
        'validation',
        400,
        { missing: validation.missingLabels },
      );
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
    if (body.start_date) patch.start_date = String(body.start_date);
    if (body.first_payment_date) patch.first_payment_date = String(body.first_payment_date);

    const billing = normalizeSubscriptionBillingDates(company, subscription);
    if (!patch.start_date) patch.start_date = billing.start_date;
    if (!patch.first_payment_date) patch.first_payment_date = billing.first_payment_date;
    if (!patch.next_due_date) patch.next_due_date = billing.next_due_date;

    if (Object.keys(patch).length > 1) {
      const { data: patched, error: patchErr } = await supabaseAdmin
        .from('company_subscriptions')
        .update(patch)
        .eq('id', subscription.id)
        .select('*')
        .single();

      if (patchErr) {
        return contractErrorResponse(patchErr.message, 'db_save', 500);
      }
      subscription = patched as CompanySubscription;
    }

    const contract = await generateAndStoreSaasContract(supabaseAdmin, company, subscription);

    const { data: refreshed } = await supabaseAdmin
      .from('company_subscriptions')
      .select('*')
      .eq('id', subscription.id)
      .single();

    const { listCompanyContracts } = await import('@/lib/saasContractService');
    const contracts = await listCompanyContracts(supabaseAdmin, companyId);

    const result = {
      success: true,
      contract_number: contract.contractNumber,
      contract_pdf_url: contract.contractPdfUrl,
      subscription: refreshed,
      contracts,
    };

    console.log('SAAS_CONTRACT_API_RESPONSE', result);
    console.log('SAAS_CONTRACT_PDF_URL', contract.contractPdfUrl);

    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof SaasContractStepError) {
      console.error('[GENERATE_SAAS_CONTRACT_API_ERROR]', e.step, e.message);
      return contractErrorResponse(e.message, e.step, 500);
    }
    const message = e instanceof Error ? e.message : 'Erro interno';
    console.error('[GENERATE_SAAS_CONTRACT_API_ERROR]', message);
    return contractErrorResponse(message, 'unknown', 500);
  }
}
