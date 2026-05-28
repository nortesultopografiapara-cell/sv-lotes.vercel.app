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

    const updatePayload: Record<string, unknown> = {
      name: body.name,
      cnpj: body.cnpj,
      phone: body.phone,
      email: body.email,
      status_operacional: body.status_operacional,
      plan: limits.plan,
      plan_type: limits.plan,
      project_limit: limits.project_limit,
      broker_limit: limits.broker_limit,
      max_projects: limits.max_projects,
      max_brokers: limits.max_brokers,
      is_test_company: body.is_test_company === true,
      ...customPricePayload,
    };

    if (body.address) updatePayload.address = body.address;
    if (body.city) updatePayload.city = body.city;
    if (body.state) updatePayload.state = body.state;
    if (body.cep) updatePayload.cep = body.cep;
    if (body.slug) updatePayload.slug = body.slug;

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

    let { data, error } = await supabaseAdmin
      .from('companies')
      .update(updatePayload)
      .eq('id', companyId)
      .select('*')
      .single();

    console.log('SAVE_COMPANY_CUSTOM_PRICE_RESULT', data, error);

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

      const { data: partial, error: partialErr } = await supabaseAdmin
        .from('companies')
        .update({
          name: body.name,
          cnpj: body.cnpj,
          phone: body.phone,
          email: body.email,
          status_operacional: body.status_operacional,
          plan: limits.plan,
          plan_type: limits.plan,
          is_test_company: body.is_test_company === true,
        })
        .eq('id', companyId)
        .select('*')
        .single();

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

    const companyRow = refreshedCompany || data;
    if (companyRow && companyRow.is_test_company !== true) {
      const pricing = resolveCompanyPricing(companyRow);
      const { data: existingSub } = await supabaseAdmin
        .from('company_subscriptions')
        .select('id')
        .eq('company_id', companyId)
        .maybeSingle();

      if (existingSub?.id) {
        const { normalizeSubscriptionBillingDates } = await import(
          '@/lib/companySubscriptionDates'
        );
        const billing = normalizeSubscriptionBillingDates(companyRow);
        await supabaseAdmin
          .from('company_subscriptions')
          .update({
            plan_type: limits.plan,
            monthly_price: pricing.appliedPrice,
            custom_price_enabled: isCustomPriceEnabled(companyRow),
            custom_monthly_price: isCustomPriceEnabled(companyRow)
              ? parseCustomMonthlyPrice(companyRow.custom_monthly_price)
              : null,
            start_date: billing.start_date,
            first_payment_date: billing.first_payment_date,
            next_due_date: billing.next_due_date,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSub.id);
      } else {
        await ensureSaasSubscription(supabaseAdmin, companyRow);
      }
    }

    return NextResponse.json({
      success: true,
      company: refreshedCompany || data,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
