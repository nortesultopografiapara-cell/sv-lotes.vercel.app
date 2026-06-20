/**
 * Aplicação idempotente de multa/juros em cobranças SaaS no Asaas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchAsaasPaymentDetails,
  isAsaasConfigured,
  updateAsaasPaymentLateFees,
} from '@/lib/payments/providers/asaas';
import {
  hasAsaasLateFeesConfigured,
  isAsaasPaymentBlockedForLateFeeUpdate,
  isAsaasPaymentEligibleForLateFeeUpdate,
  isSaasChargeEligibleForLateFeeUpdate,
  resolveSaasLateFeePercents,
} from '@/lib/saasLateFeeConfig';

export type ConfigureAsaasLateFeeOutcome =
  | 'configured'
  | 'already_configured'
  | 'skipped_status'
  | 'skipped_no_payment'
  | 'skipped_not_asaas'
  | 'error';

export type ConfigureAsaasLateFeeResult = {
  paymentId: string;
  outcome: ConfigureAsaasLateFeeOutcome;
  finePercent?: number;
  interestPercent?: number;
  message?: string;
};

export type BackfillSaasLateFeesItem = {
  chargeId: string;
  paymentId: string | null;
  outcome: ConfigureAsaasLateFeeOutcome;
  message?: string;
};

export type BackfillSaasLateFeesResult = {
  processed: number;
  configured: number;
  alreadyConfigured: number;
  skipped: number;
  errors: number;
  items: BackfillSaasLateFeesItem[];
};

function isAsaasProvider(provider: string | null | undefined): boolean {
  return String(provider || '').trim().toLowerCase() === 'asaas';
}

/** Consulta Asaas e aplica multa/juros somente quando ausentes. Idempotente. */
export async function configureAsaasPaymentLateFeesIfMissing(
  paymentId: string,
  options?: { finePercent?: number; interestPercent?: number },
): Promise<ConfigureAsaasLateFeeResult> {
  const id = String(paymentId || '').trim();
  if (!id) {
    return {
      paymentId: '',
      outcome: 'skipped_no_payment',
      message: 'Sem payment_id',
    };
  }

  if (!isAsaasConfigured()) {
    return {
      paymentId: id,
      outcome: 'skipped_not_asaas',
      message: 'Asaas não configurado',
    };
  }

  const { finePercent, interestPercent } = resolveSaasLateFeePercents(options);

  try {
    const payment = await fetchAsaasPaymentDetails(id);

    if (!isAsaasPaymentEligibleForLateFeeUpdate(payment.status)) {
      return {
        paymentId: id,
        outcome: 'skipped_status',
        message: `Status Asaas não elegível: ${payment.status || '—'}`,
      };
    }

    if (hasAsaasLateFeesConfigured(payment)) {
      return {
        paymentId: id,
        outcome: 'already_configured',
        finePercent: Number(payment.fine?.value ?? finePercent),
        interestPercent: Number(payment.interest?.value ?? interestPercent),
      };
    }

    const updated = await updateAsaasPaymentLateFees(id, { finePercent, interestPercent });
    return {
      paymentId: id,
      outcome: 'configured',
      finePercent: Number(updated.fine?.value ?? finePercent),
      interestPercent: Number(updated.interest?.value ?? interestPercent),
    };
  } catch (err) {
    return {
      paymentId: id,
      outcome: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function buildSaasChargeLateFeeDbPatch(options?: {
  finePercent?: number;
  interestPercent?: number;
  configuredAt?: string;
}): Record<string, unknown> {
  const { finePercent, interestPercent } = resolveSaasLateFeePercents(options);
  return {
    fine_percent: finePercent,
    interest_percent: interestPercent,
    late_fee_enabled: true,
    late_fee_configured_at: options?.configuredAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Atualiza cobranças SaaS abertas (PENDING/OVERDUE) no Asaas.
 * Não altera RECEIVED, CONFIRMED, REFUNDED, CANCELLED.
 */
export async function backfillSaasChargesLateFees(
  supabaseAdmin: SupabaseClient,
  options?: {
    chargeId?: string;
    companyId?: string;
    limit?: number;
    actorUserId?: string;
  },
): Promise<BackfillSaasLateFeesResult> {
  let query = supabaseAdmin
    .from('saas_charges')
    .select('id, status, payment_id, payment_provider, fine_percent, interest_percent, late_fee_enabled')
    .is('deleted_at', null)
    .in('status', ['PENDING', 'OVERDUE'])
    .not('payment_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(options?.limit ?? 100);

  if (options?.chargeId) query = query.eq('id', options.chargeId);
  if (options?.companyId) query = query.eq('company_id', options.companyId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const result: BackfillSaasLateFeesResult = {
    processed: 0,
    configured: 0,
    alreadyConfigured: 0,
    skipped: 0,
    errors: 0,
    items: [],
  };

  for (const row of data || []) {
    result.processed += 1;
    const chargeId = String(row.id);
    const paymentId = row.payment_id ? String(row.payment_id) : null;
    const provider = String(row.payment_provider || '');

    if (!paymentId || !isAsaasProvider(provider)) {
      result.skipped += 1;
      result.items.push({
        chargeId,
        paymentId,
        outcome: paymentId ? 'skipped_not_asaas' : 'skipped_no_payment',
      });
      continue;
    }

    if (!isSaasChargeEligibleForLateFeeUpdate(String(row.status || ''))) {
      result.skipped += 1;
      result.items.push({
        chargeId,
        paymentId,
        outcome: 'skipped_status',
        message: String(row.status || ''),
      });
      continue;
    }

    const configure = await configureAsaasPaymentLateFeesIfMissing(paymentId);

    if (configure.outcome === 'error') {
      result.errors += 1;
      result.items.push({
        chargeId,
        paymentId,
        outcome: configure.outcome,
        message: configure.message,
      });
      continue;
    }

    if (configure.outcome === 'skipped_status') {
      result.skipped += 1;
      result.items.push({
        chargeId,
        paymentId,
        outcome: configure.outcome,
        message: configure.message,
      });
      continue;
    }

    if (configure.outcome === 'configured') {
      result.configured += 1;
    } else if (configure.outcome === 'already_configured') {
      result.alreadyConfigured += 1;
    } else {
      result.skipped += 1;
      result.items.push({
        chargeId,
        paymentId,
        outcome: configure.outcome,
        message: configure.message,
      });
      continue;
    }

    await supabaseAdmin
      .from('saas_charges')
      .update(
        buildSaasChargeLateFeeDbPatch({
          finePercent: configure.finePercent,
          interestPercent: configure.interestPercent,
        }),
      )
      .eq('id', chargeId);

    result.items.push({
      chargeId,
      paymentId,
      outcome: configure.outcome,
    });
  }

  if (options?.actorUserId && result.configured > 0) {
    await supabaseAdmin.from('audit_logs').insert({
      user_id: options.actorUserId,
      module: 'SAAS_BILLING',
      action: 'SAAS_LATE_FEES_BACKFILL',
      description: `Multa/juros aplicados em ${result.configured} cobrança(s) SaaS`,
    });
  }

  return result;
}

/** Bloqueia atualização quando status Asaas é terminal/pago. */
export function shouldSkipLateFeeForAsaasStatus(status: string | null | undefined): boolean {
  return isAsaasPaymentBlockedForLateFeeUpdate(status);
}
