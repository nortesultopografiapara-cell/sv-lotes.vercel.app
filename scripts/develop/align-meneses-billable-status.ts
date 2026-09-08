/**
 * Lê (e opcionalmente alinha) o status faturável da Menezes SOMENTE no DEVELOP.
 *
 *   npx tsx scripts/develop/align-meneses-billable-status.ts
 *   npx tsx scripts/develop/align-meneses-billable-status.ts --apply
 *
 * Nunca cria cobrança. Nunca altera Production. Preserva next_due_date.
 */
import { createClient } from '@supabase/supabase-js';
import { MENESES_COMPANY_ID } from '../../lib/saasContractContent';
import { diagnoseBillableCompany, isSplitBrainActiveFalse } from '../../lib/saasBillableStatus';
import { assertDevelopWriteAllowed, loadDevelopEnv } from './guard';
import { PRODUCTION_PROJECT_REF } from '../../lib/homolog/env';

const APPLY = process.argv.includes('--apply');
const PRESERVE_DUE = '2026-09-27';

function isoDate(value: unknown): string | null {
  if (!value) return null;
  return String(value).split('T')[0] || null;
}

async function main() {
  const env = loadDevelopEnv();
  if (env.ref === PRODUCTION_PROJECT_REF) {
    throw new Error('ABORT: Production — leitura/escrita proibida neste script.');
  }
  const target = APPLY ? assertDevelopWriteAllowed() : null;
  if (!env.url || !env.service) {
    throw new Error(`ABORT: env DEVELOP incompleto (fonte=${env.source}). Rode decrypt-develop-branch-env.ts`);
  }

  const supabase = createClient(env.url, env.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: company, error: companyErr } = await supabase
    .from('companies')
    .select('id, name, active, status_operacional, next_payment_date')
    .eq('id', MENESES_COMPANY_ID)
    .maybeSingle();

  if (companyErr) throw new Error(companyErr.message);
  if (!company) {
    console.log(JSON.stringify({ ok: false, abort: 'MENESES_NOT_FOUND_ON_DEVELOP', ref: env.ref }, null, 2));
    process.exit(2);
  }

  const { data: subscription } = await supabase
    .from('company_subscriptions')
    .select('id, contract_status, payment_status, next_due_date')
    .eq('company_id', MENESES_COMPANY_ID)
    .maybeSingle();

  const { data: invoiceSep } = await supabase
    .from('master_saas_invoices')
    .select('id, reference_month, status, due_date, final_amount, external_charge_id')
    .eq('company_id', MENESES_COMPANY_ID)
    .eq('reference_month', '2026-09')
    .maybeSingle();

  const { data: payments } = await supabase
    .from('master_saas_payments')
    .select('id, amount, paid_at, status, reference_month, payment_method')
    .eq('company_id', MENESES_COMPANY_ID)
    .order('paid_at', { ascending: false });

  const paidOnSep08 = (payments || []).filter((p) => {
    const day = isoDate(p.paid_at);
    return day === '2026-09-08' && String(p.status || '').toLowerCase() === 'paid';
  });
  const hasConfirmedPaid = (payments || []).some(
    (p) => String(p.status || '').toLowerCase() === 'paid',
  );

  const diagnosis = diagnoseBillableCompany(company);
  const splitBrain = isSplitBrainActiveFalse(company);
  const nextDue = isoDate(subscription?.next_due_date) || isoDate(company.next_payment_date);
  const before = {
    company_id: company.id,
    name: company.name,
    active: company.active,
    status_operacional: company.status_operacional,
    next_payment_date: isoDate(company.next_payment_date),
    subscription_id: subscription?.id ?? null,
    contract_status: subscription?.contract_status ?? null,
    payment_status: subscription?.payment_status ?? null,
    next_due_date: isoDate(subscription?.next_due_date),
    invoice_2026_09: invoiceSep
      ? {
          id: invoiceSep.id,
          status: invoiceSep.status,
          due_date: isoDate(invoiceSep.due_date),
          final_amount: invoiceSep.final_amount,
          has_external_charge: Boolean(invoiceSep.external_charge_id),
        }
      : null,
    paid_2026_09_08: paidOnSep08.map((p) => ({
      id: p.id,
      amount: p.amount,
      reference_month: p.reference_month,
      payment_method: p.payment_method,
    })),
    latest_paid: (payments || [])
      .filter((p) => String(p.status || '').toLowerCase() === 'paid')
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        paid_at: isoDate(p.paid_at),
        reference_month: p.reference_month,
        amount: p.amount,
      })),
    diagnosis,
  };

  const diagnosisConfirmed =
    splitBrain ||
    company.active === false ||
    String(subscription?.contract_status || '').toLowerCase() === 'canceled';

  const shouldAlign =
    diagnosisConfirmed &&
    (hasConfirmedPaid || String(company.status_operacional || '') === 'Ativa');

  console.log(
    JSON.stringify(
      {
        envRef: env.ref,
        envSource: env.source,
        apply: APPLY,
        writeTarget: target,
        diagnosisConfirmed,
        shouldAlign,
        preserveDue: PRESERVE_DUE,
        nextDue,
        before,
      },
      null,
      2,
    ),
  );

  if (!APPLY) return;
  if (!shouldAlign) {
    console.log(JSON.stringify({ ok: true, applied: false, reason: 'diagnosis_not_confirmed_or_not_needed' }));
    return;
  }

  const now = new Date().toISOString();
  const { error: companyUpdErr } = await supabase
    .from('companies')
    .update({
      active: true,
      status_operacional: 'Ativa',
      updated_at: now,
    })
    .eq('id', MENESES_COMPANY_ID);

  if (companyUpdErr) throw new Error(companyUpdErr.message);

  if (subscription?.id) {
    const subPatch: Record<string, unknown> = {
      contract_status: 'active',
      payment_status: hasConfirmedPaid ? 'paid' : subscription.payment_status,
      updated_at: now,
    };
    const { error: subErr } = await supabase
      .from('company_subscriptions')
      .update(subPatch)
      .eq('id', subscription.id)
      .eq('company_id', MENESES_COMPANY_ID);
    if (subErr) throw new Error(subErr.message);
  }

  const { data: afterCompany } = await supabase
    .from('companies')
    .select('id, name, active, status_operacional, next_payment_date')
    .eq('id', MENESES_COMPANY_ID)
    .single();
  const { data: afterSub } = await supabase
    .from('company_subscriptions')
    .select('id, contract_status, payment_status, next_due_date')
    .eq('company_id', MENESES_COMPANY_ID)
    .maybeSingle();

  const afterDue = isoDate(afterSub?.next_due_date) || isoDate(afterCompany?.next_payment_date);
  if (nextDue && afterDue !== nextDue) {
    throw new Error(`ABORT: next due mudou de ${nextDue} para ${afterDue}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        applied: true,
        fieldsChanged: {
          companies: ['active', 'status_operacional'],
          company_subscriptions: subscription?.id
            ? ['contract_status', hasConfirmedPaid ? 'payment_status' : null].filter(Boolean)
            : [],
          preserved: ['next_due_date', 'next_payment_date', 'invoices', 'payments'],
        },
        after: {
          active: afterCompany?.active,
          status_operacional: afterCompany?.status_operacional,
          next_payment_date: isoDate(afterCompany?.next_payment_date),
          contract_status: afterSub?.contract_status ?? null,
          payment_status: afterSub?.payment_status ?? null,
          next_due_date: isoDate(afterSub?.next_due_date),
          billable: diagnoseBillableCompany(afterCompany || {}).billable,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
