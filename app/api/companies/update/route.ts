import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  isCustomPriceEnabled,
  parseCustomMonthlyPrice,
  resolveCompanyPricing,
} from '@/lib/companyPricing';
import { saasLimitsDbPayload } from '@/lib/saasPlans';
import {
  buildCompanySubscriptionDatePayload,
  resolveCompanySubscriptionDates,
} from '@/lib/companySubscriptionDates';
import { ensureSaasSubscription } from '@/lib/saasSubscriptionService';

function parseCustomPrice(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export async function PATCH(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Service role não configurada.' }, { status: 500 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const body = await request.json();
    const { companyId, userId } = body;

    if (!companyId || !userId) {
      return NextResponse.json({ error: 'companyId e userId são obrigatórios.' }, { status: 400 });
    }

    const { data: caller, error: callerErr } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (callerErr || caller?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
    }

    const planSource = body.plan_type || body.plan || 'basic';
    const limits = saasLimitsDbPayload(planSource);

    const customEnabled = body.custom_price_enabled === true;
    const parsedCustom = parseCustomPrice(body.custom_monthly_price);

    if (customEnabled && parsedCustom == null) {
      return NextResponse.json({ error: 'Valor personalizado inválido.' }, { status: 400 });
    }

    const customPricePayload = {
      custom_price_enabled: customEnabled,
      custom_monthly_price: customEnabled ? parsedCustom : null,
      custom_price_badge: customEnabled ? body.custom_price_badge || 'desconto_especial' : null,
    };

    console.log('SAVE_COMPANY_CUSTOM_PRICE_PAYLOAD', {
      companyId,
      ...customPricePayload,
    });

    const postalCode = String(body.zip_code ?? body.cep ?? '').trim();
    const addressPayload = {
      address: body.address ?? '',
      city: body.city ?? '',
      state: body.state ?? '',
      zip_code: postalCode,
      cep: postalCode,
    };

    console.log('SAVE_COMPANY_ADDRESS_PAYLOAD', {
      companyId,
      ...addressPayload,
    });

    const updatePayload: Record<string, unknown> = {
      name: body.name,
      cnpj: body.cnpj,
      phone: body.phone ?? '',
      email: body.email ?? '',
      status_operacional: body.status_operacional,
      plan: limits.plan,
      plan_type: limits.plan,
      project_limit: limits.project_limit,
      broker_limit: limits.broker_limit,
      max_projects: limits.max_projects,
      max_brokers: limits.max_brokers,
      is_test_company: body.is_test_company === true,
      ...customPricePayload,
      ...addressPayload,
    };

    if (body.slug) updatePayload.slug = body.slug;
    if (body.admin_users_limit != null) {
      updatePayload.admin_users_limit = Math.max(1, Math.trunc(Number(body.admin_users_limit)));
    }

    if (body.is_test_company !== true && body.subscription_start_date) {
      const subDates = buildCompanySubscriptionDatePayload({
        subscription_start_date: body.subscription_start_date,
        subscription_due_day: body.subscription_due_day,
        next_payment_date: body.next_payment_date,
      });
      updatePayload.subscription_start_date = subDates.subscription_start_date;
      updatePayload.subscription_due_day = subDates.subscription_due_day;
      updatePayload.next_payment_date = subDates.next_payment_date;
      updatePayload.vencimento_plano = subDates.next_payment_date;
    }

    console.log('SAVE_COMPANY_SUBSCRIPTION_PAYLOAD', {
      companyId,
      subscription_start_date: updatePayload.subscription_start_date,
      subscription_due_day: updatePayload.subscription_due_day,
      next_payment_date: updatePayload.next_payment_date,
    });

    let { data, error } = await supabaseAdmin
      .from('companies')
      .update(updatePayload)
      .eq('id', companyId)
      .select('*')
      .single();

    if (error?.message?.toLowerCase().includes('cep')) {
      const { cep: _omit, ...withoutCep } = updatePayload;
      const retry = await supabaseAdmin
        .from('companies')
        .update(withoutCep)
        .eq('id', companyId)
        .select('*')
        .single();
      data = retry.data;
      error = retry.error;
    }

    console.log('SAVE_COMPANY_ADDRESS_RESULT', data, error);

    if (error && (error.code === 'PGRST204' || error.message?.includes('schema cache'))) {
      const { error: customOnlyErr } = await supabaseAdmin
        .from('companies')
        .update(customPricePayload)
        .eq('id', companyId);

      if (customOnlyErr) {
        return NextResponse.json(
          {
            error:
              'Colunas de preço personalizado ausentes no Supabase. Execute a migration 20260528120000_company_custom_pricing.sql',
            details: customOnlyErr.message,
          },
          { status: 500 },
        );
      }

      const partialPayload: Record<string, unknown> = {
        name: body.name,
        cnpj: body.cnpj,
        phone: body.phone ?? '',
        email: body.email ?? '',
        status_operacional: body.status_operacional,
        plan: limits.plan,
        plan_type: limits.plan,
        is_test_company: body.is_test_company === true,
        address: addressPayload.address,
        city: addressPayload.city,
        state: addressPayload.state,
        zip_code: addressPayload.zip_code,
      };

      let { data: partial, error: partialErr } = await supabaseAdmin
        .from('companies')
        .update({ ...partialPayload, cep: addressPayload.cep })
        .eq('id', companyId)
        .select('*')
        .single();

      if (partialErr?.message?.includes('cep')) {
        const retry = await supabaseAdmin
          .from('companies')
          .update(partialPayload)
          .eq('id', companyId)
          .select('*')
          .single();
        partial = retry.data;
        partialErr = retry.error;
      }

      data = partial;
      error = partialErr;
      console.log('SAVE_COMPANY_CUSTOM_PRICE_RESULT_PARTIAL', data, error);
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: refreshedCompany, error: refreshErr } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    console.log('REFRESHED_COMPANY_AFTER_SAVE', refreshedCompany, refreshErr);
    if (refreshedCompany) {
      console.log('REFRESHED_COMPANY_ADDRESS', {
        address: refreshedCompany.address,
        city: refreshedCompany.city,
        state: refreshedCompany.state,
        zip_code: refreshedCompany.zip_code,
        cep: refreshedCompany.cep,
      });
    }

    const companyRow = refreshedCompany || data;
    let subscriptionRow = null;

    if (companyRow && companyRow.is_test_company !== true) {
      const pricing = resolveCompanyPricing(companyRow);
      const { normalizeSubscriptionDates } = await import('@/lib/companySubscriptionDates');
      const billing = normalizeSubscriptionDates(companyRow, null);

      const subscriptionPayload = {
        plan_type: limits.plan,
        monthly_price: pricing.appliedPrice,
        custom_price_enabled: isCustomPriceEnabled(companyRow),
        custom_monthly_price: isCustomPriceEnabled(companyRow)
          ? parseCustomMonthlyPrice(companyRow.custom_monthly_price)
          : null,
        billing_cycle: 'monthly',
        start_date: billing.start_date,
        first_payment_date: billing.first_payment_date,
        next_due_date: billing.next_due_date,
        updated_at: new Date().toISOString(),
      };

      const { data: existingSub } = await supabaseAdmin
        .from('company_subscriptions')
        .select('id, payment_status')
        .eq('company_id', companyId)
        .maybeSingle();

      if (existingSub?.id) {
        const { data: updatedSub, error: subUpdateErr } = await supabaseAdmin
          .from('company_subscriptions')
          .update({
            ...subscriptionPayload,
            payment_status: existingSub.payment_status || 'pending',
          })
          .eq('id', existingSub.id)
          .select('*')
          .single();

        console.log('SAVE_COMPANY_SUBSCRIPTION_RESULT', updatedSub, subUpdateErr);
        subscriptionRow = updatedSub;
      } else {
        const ensured = await ensureSaasSubscription(supabaseAdmin, companyRow);
        subscriptionRow = ensured.subscription;
        console.log('SAVE_COMPANY_SUBSCRIPTION_RESULT', subscriptionRow, ensured.error);
      }
    }

    const result = {
      success: true,
      company: refreshedCompany || data,
      subscription: subscriptionRow,
    };

    console.log('REFRESH_COMPANY_AFTER_SAVE', result);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
