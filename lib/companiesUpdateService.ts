/**
 * PATCH /api/companies/update — montagem de payload e gravação em fases.
 * Evita dezenas de round-trips no fallback de colunas opcionais.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCustomMonthlyPrice } from '@/lib/companyPricing';
import { buildCompanySubscriptionDatePayload } from '@/lib/companySubscriptionDates';
import { isPlatformAdmin } from '@/lib/rls';
import {
  buildCompanyLimitsDbWritePayload,
  buildManualLimitsFromForm,
  extractMissingCompanyColumnFromError,
  saasLimitsDbPayload,
  type SafeCompanyWriteResult,
} from '@/lib/saasPlans';
import { syncSubscriptionPricingFromCompany } from '@/lib/saasSubscriptionService';

export const COMPANY_UPDATE_RETURN_SELECT = [
  'id',
  'name',
  'cnpj',
  'email',
  'phone',
  'address',
  'city',
  'state',
  'cep',
  'zip_code',
  'plan',
  'plan_type',
  'project_limit',
  'broker_limit',
  'max_projects',
  'max_brokers',
  'max_lots',
  'admin_users_limit',
  'admin_limit',
  'saas_commercial_note',
  'status_operacional',
  'custom_price_enabled',
  'custom_monthly_price',
  'custom_price_badge',
  'subscription_start_date',
  'subscription_due_day',
  'next_payment_date',
  'is_test_company',
  'slug',
  'created_at',
].join(', ');

/** Colunas espelho/opcionais — removidas em bloco no primeiro erro de schema. */
export const COMPANY_OPTIONAL_WRITE_COLUMNS = [
  'max_projects',
  'max_brokers',
  'max_lots',
  'saas_commercial_note',
  'admin_limit',
  'admin_users_limit',
  'cep',
  'zip_code',
  'module_plan',
  'module_type',
  'custom_price_badge',
] as const;

export type CompanyUpdateBuildResult = {
  companyId: string;
  updatePayload: Record<string, unknown>;
  explicitBilling: ReturnType<typeof buildCompanySubscriptionDatePayload> | null;
  planKey: string;
};

export type CompanyUpdateStepTimings = Record<string, number>;

export function createUpdateStepTimer() {
  const startedAt = Date.now();
  const timings: CompanyUpdateStepTimings = {};
  let last = startedAt;

  return {
    mark(step: string) {
      const now = Date.now();
      timings[step] = now - last;
      last = now;
    },
    totalMs() {
      return Date.now() - startedAt;
    },
    timings,
  };
}

export function logCompaniesUpdateStep(
  step: string,
  extra?: Record<string, unknown>,
) {
  console.log('[companies/update]', step, extra ?? {});
}

export function buildCompanyUpdatePayload(body: Record<string, unknown>): CompanyUpdateBuildResult {
  const companyId = String(body.companyId || '');
  const planSource = String(body.plan_type || body.plan || 'basic');
  const manualOverrides = buildManualLimitsFromForm(body);
  const limits = saasLimitsDbPayload(planSource, manualOverrides);

  const customEnabled =
    body.custom_price_enabled === true || limits.planKey === 'personalizado';
  const parsedCustom = parseCustomMonthlyPrice(body.custom_monthly_price);

  if (customEnabled && parsedCustom == null) {
    throw new Error('Valor personalizado inválido.');
  }

  const postalCode = String(body.zip_code ?? body.cep ?? '').trim();
  const limitsPayload = buildCompanyLimitsDbWritePayload(limits);

  const updatePayload: Record<string, unknown> = {
    name: body.name,
    cnpj: body.cnpj,
    phone: body.phone ?? '',
    email: body.email ?? '',
    status_operacional: body.status_operacional,
    plan: limits.plan,
    plan_type: limits.plan,
    ...limitsPayload,
    is_test_company: body.is_test_company === true,
    custom_price_enabled: customEnabled,
    custom_monthly_price: customEnabled ? parsedCustom : null,
    custom_price_badge: customEnabled ? body.custom_price_badge || 'desconto_especial' : null,
    address: body.address ?? '',
    city: body.city ?? '',
    state: body.state ?? '',
    zip_code: postalCode,
    cep: postalCode,
  };

  if (body.slug) updatePayload.slug = body.slug;
  if (
    limits.planKey === 'personalizado' &&
    limits.admin_users_limit == null &&
    updatePayload.admin_users_limit == null
  ) {
    updatePayload.admin_users_limit = 1;
    updatePayload.admin_limit = 1;
  }

  let explicitBilling: ReturnType<typeof buildCompanySubscriptionDatePayload> | null = null;
  if (body.is_test_company !== true && body.subscription_start_date) {
    explicitBilling = buildCompanySubscriptionDatePayload({
      subscription_start_date: body.subscription_start_date,
      subscription_due_day: body.subscription_due_day,
      next_payment_date: body.next_payment_date,
    });
    updatePayload.subscription_start_date = explicitBilling.subscription_start_date;
    updatePayload.subscription_due_day = explicitBilling.subscription_due_day;
    updatePayload.next_payment_date = explicitBilling.next_payment_date;
  }

  return {
    companyId,
    updatePayload,
    explicitBilling,
    planKey: limits.planKey,
  };
}

function pickPayloadFields(
  payload: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      out[field] = payload[field];
    }
  }
  return out;
}

export const COMPANY_CORE_WRITE_FIELDS = [
  'name',
  'cnpj',
  'phone',
  'email',
  'status_operacional',
  'plan',
  'plan_type',
  'project_limit',
  'broker_limit',
  'is_test_company',
  'custom_price_enabled',
  'custom_monthly_price',
  'custom_price_badge',
  'address',
  'city',
  'state',
  'subscription_start_date',
  'subscription_due_day',
  'next_payment_date',
  'slug',
] as const;

export type PhasedCompanyUpdateResult = SafeCompanyWriteResult & {
  optionalWarning?: string | null;
};

function stripOptionalColumnsOnSchemaMiss(
  current: Record<string, unknown>,
  missing: string,
  removedColumns: string[],
) {
  delete current[missing];
  removedColumns.push(missing);

  const optionalSet = new Set<string>(COMPANY_OPTIONAL_WRITE_COLUMNS);
  if (!optionalSet.has(missing)) return;

  for (const col of COMPANY_OPTIONAL_WRITE_COLUMNS) {
    if (!Object.prototype.hasOwnProperty.call(current, col)) continue;
    delete current[col];
    if (!removedColumns.includes(col)) removedColumns.push(col);
  }
}

async function writeCompanyPayload(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  payload: Record<string, unknown>,
): Promise<SafeCompanyWriteResult> {
  let current: Record<string, unknown> = { ...payload };
  const removedColumns: string[] = [];
  let lastError: { message?: string; code?: string } | null = null;
  const maxAttempts = Math.min(Math.max(Object.keys(current).length + 1, 4), 8);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabaseAdmin
      .from('companies')
      .update(current)
      .eq('id', companyId)
      .select(COMPANY_UPDATE_RETURN_SELECT)
      .single();

    if (!error) {
      return {
        data: data as Record<string, unknown>,
        error: null,
        removedColumns,
      };
    }

    lastError = error;
    const missing = extractMissingCompanyColumnFromError(error.message || '');
    if (!missing || !Object.prototype.hasOwnProperty.call(current, missing)) {
      break;
    }

    stripOptionalColumnsOnSchemaMiss(current, missing, removedColumns);
  }

  return { data: null, error: lastError, removedColumns };
}

export async function persistCompanyUpdateInPhases(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  payload: Record<string, unknown>,
): Promise<PhasedCompanyUpdateResult> {
  const corePayload = pickPayloadFields(payload, COMPANY_CORE_WRITE_FIELDS);
  const optionalPayload = pickPayloadFields(payload, COMPANY_OPTIONAL_WRITE_COLUMNS);

  const coreResult = await writeCompanyPayload(supabaseAdmin, companyId, corePayload);
  if (coreResult.error || Object.keys(optionalPayload).length === 0) {
    return coreResult;
  }

  const optionalResult = await writeCompanyPayload(supabaseAdmin, companyId, optionalPayload);
  if (optionalResult.error) {
    return {
      data: coreResult.data,
      error: null,
      removedColumns: [...coreResult.removedColumns, ...optionalResult.removedColumns],
      optionalWarning:
        optionalResult.error.message ||
        'Alguns campos opcionais não foram gravados (schema legado).',
    };
  }

  return {
    data: { ...(coreResult.data || {}), ...(optionalResult.data || {}) },
    error: null,
    removedColumns: [...coreResult.removedColumns, ...optionalResult.removedColumns],
  };
}

export async function assertMasterCanUpdateCompany(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: caller, error: callerErr } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (callerErr || !isPlatformAdmin(caller?.role)) {
    return {
      ok: false,
      status: 403,
      error: 'Permissão negada. Apenas Master/Super Admin pode editar empresas.',
    };
  }

  return { ok: true };
}

export async function finalizeCompanyUpdateResponse(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  companyRow: Record<string, unknown>,
  explicitBilling: ReturnType<typeof buildCompanySubscriptionDatePayload> | null,
) {
  let subscriptionRow = null;
  let subscriptionWarning: string | null = null;

  if (companyRow.is_test_company !== true) {
    const synced = await syncSubscriptionPricingFromCompany(supabaseAdmin, companyRow, {
      explicitBilling,
    });
    subscriptionRow = synced.subscription;
    subscriptionWarning = synced.error ?? null;
  }

  const [companyRes, subscriptionRes] = await Promise.all([
    supabaseAdmin
      .from('companies')
      .select(COMPANY_UPDATE_RETURN_SELECT)
      .eq('id', companyId)
      .single(),
    supabaseAdmin
      .from('company_subscriptions')
      .select(
        'id, company_id, plan_type, monthly_price, custom_price_enabled, custom_monthly_price, billing_cycle, start_date, first_payment_date, next_due_date, payment_status, contract_status, contract_number, contract_pdf_url, updated_at',
      )
      .eq('company_id', companyId)
      .maybeSingle(),
  ]);

  const finalCompany = companyRes.data || companyRow;
  const finalSubscription = subscriptionRes.data || subscriptionRow;

  const savedBilling = finalCompany
    ? {
        subscription_start_date: (finalCompany as Record<string, unknown>).subscription_start_date,
        subscription_due_day: (finalCompany as Record<string, unknown>).subscription_due_day,
        next_payment_date: (finalCompany as Record<string, unknown>).next_payment_date,
        subscription_next_due_date:
          (finalSubscription as Record<string, unknown> | null)?.next_due_date ?? null,
      }
    : null;

  return {
    success: true,
    company: finalCompany,
    subscription: finalSubscription,
    billing: savedBilling,
    subscription_warning: subscriptionWarning,
  };
}
