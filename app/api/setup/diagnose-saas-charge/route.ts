import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { currentReferenceMonth } from '@/lib/saasBilling';
import {
  classifyExternalChargeId,
  isOrphanSaasCharge,
  isProtectedSaasCharge,
  resolveSaasPixChargeSkipReason,
  resolveSaasPixChargeSkipReasonAsync,
} from '@/lib/saasCharges';
import { getPaymentProvider } from '@/lib/payments/providers';

export const runtime = 'nodejs';

/** Diagnóstico read-only — cobrança SaaS bloqueada (setup público + service role). */
export async function GET(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const companyName = String(searchParams.get('companyName') || 'TOPOGRAFIA').trim();
  const referenceMonth = searchParams.get('referenceMonth') || currentReferenceMonth();

  const { data: companies, error: companyErr } = await supabaseAdmin
    .from('companies')
    .select(
      'id,name,cnpj,email,status_operacional,active,next_payment_date,plan,plan_type,custom_monthly_price,custom_price_enabled,subscription_due_day,subscription_start_date,is_test_company',
    )
    .ilike('name', `%${companyName}%`)
    .order('name');

  if (companyErr) {
    return NextResponse.json({ error: companyErr.message }, { status: 500 });
  }

  const company =
    (companies || []).find((c) =>
      String(c.name || '').toUpperCase().includes(companyName.toUpperCase()),
    ) || companies?.[0];

  if (!company) {
    return NextResponse.json({
      error: 'Empresa não encontrada',
      searched: companyName,
      candidates: companies || [],
    });
  }

  const companyId = String(company.id);

  const { data: subscriptions } = await supabaseAdmin
    .from('company_subscriptions')
    .select('*')
    .eq('company_id', companyId);

  const { data: invoices } = await supabaseAdmin
    .from('master_saas_invoices')
    .select('*')
    .eq('company_id', companyId)
    .order('reference_month', { ascending: false });

  const { data: charges } = await supabaseAdmin
    .from('saas_charges')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  const targetInvoice =
    (invoices || []).find((i) => i.reference_month === referenceMonth) ||
    (invoices || [])[0] ||
    null;

  const existingCharge = targetInvoice
    ? (charges || []).find((c) => c.invoice_id === targetInvoice.id) ||
      (charges || [])[0] ||
      null
    : (charges || [])[0] || null;

  const chargePick = existingCharge
    ? {
        status: String(existingCharge.status || ''),
        payment_id: existingCharge.payment_id ? String(existingCharge.payment_id) : null,
      }
    : null;

  const invoicePick = targetInvoice
    ? {
        external_charge_id: targetInvoice.external_charge_id
          ? String(targetInvoice.external_charge_id)
          : null,
      }
    : { external_charge_id: null };

  const syncSkip = resolveSaasPixChargeSkipReason(invoicePick, chargePick);
  const asyncSkip = await resolveSaasPixChargeSkipReasonAsync(invoicePick, chargePick);

  const asaasVerification: Record<string, unknown> = {};
  const paymentIds = new Set<string>();
  for (const ch of charges || []) {
    if (ch.payment_id) paymentIds.add(String(ch.payment_id));
  }
  for (const inv of invoices || []) {
    if (inv.external_charge_id) paymentIds.add(String(inv.external_charge_id));
  }

  for (const pid of paymentIds) {
    if (!pid.startsWith('pay_')) {
      asaasVerification[pid] = {
        existsInAsaas: false,
        skipped: true,
        kind: classifyExternalChargeId(pid),
        note: 'Não é pay_ Asaas — verificação API ignorada',
      };
      continue;
    }
    try {
      const provider = getPaymentProvider();
      const remote = await provider.getChargeStatus(pid);
      asaasVerification[pid] = {
        existsInAsaas: true,
        provider: provider.providerName,
        status: remote.status,
        paidAt: remote.paidAt ?? null,
      };
    } catch (err) {
      asaasVerification[pid] = {
        existsInAsaas: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  let asaasCustomerByCnpj: unknown = null;
  const doc = String(company.cnpj || '').replace(/\D/g, '');
  if (doc.length >= 11) {
    try {
      const env = String(process.env.ASAAS_ENV || 'production').toLowerCase();
      const base =
        env === 'sandbox' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
      const key = process.env.ASAAS_API_KEY?.trim();
      if (key) {
        const res = await fetch(
          `${base}/customers?cpfCnpj=${encodeURIComponent(doc)}&limit=5`,
          { headers: { access_token: key, 'Content-Type': 'application/json' } },
        );
        const json = await res.json().catch(() => ({}));
        asaasCustomerByCnpj = {
          httpStatus: res.status,
          data: (json as { data?: unknown[] }).data ?? json,
        };
      } else {
        asaasCustomerByCnpj = { error: 'ASAAS_API_KEY ausente no runtime' };
      }
    } catch (err) {
      asaasCustomerByCnpj = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json({
    company,
    asaas_customer_id: null,
    asaas_customer_id_note:
      'Coluna asaas_customer_id não existe em companies. Asaas localiza cliente por cpfCnpj na criação da cobrança.',
    asaasCustomerLookupByDocument: asaasCustomerByCnpj,
    subscriptions: subscriptions || [],
    invoices: invoices || [],
    saas_charges: charges || [],
    referenceMonth,
    targetInvoice,
    existingCharge,
    skipAnalysis: {
      syncSkipReason: syncSkip,
      asyncSkipReason: asyncSkip,
      blockingMessage: syncSkip || asyncSkip,
      exactBlockingFunction: syncSkip
        ? 'resolveSaasPixChargeSkipReason → isProtectedSaasCharge'
        : asyncSkip
          ? 'resolveSaasPixChargeSkipReasonAsync'
          : null,
      isOrphan: isOrphanSaasCharge(chargePick),
      isProtected: isProtectedSaasCharge(chargePick),
      externalChargeKind: classifyExternalChargeId(invoicePick.external_charge_id),
    },
    orphanAnalysis: existingCharge
      ? {
          chargeId: existingCharge.id,
          status: existingCharge.status,
          payment_id: existingCharge.payment_id,
          payment_provider: existingCharge.payment_provider,
          pix_copy_paste: existingCharge.pix_copy_paste ? '(preenchido)' : null,
          payment_url: existingCharge.payment_url,
          isOrphan: isOrphanSaasCharge(chargePick),
          isProtected: isProtectedSaasCharge(chargePick),
        }
      : null,
    asaasVerification,
    schemaNotes: {
      saas_charges_has_asaas_payment_id: false,
      saas_charges_payment_id: 'campo payment_id (text)',
      companies_vencimento_plano: 'coluna ausente em produção (confirmado PostgREST 42703)',
    },
  });
}
