import { NextResponse } from 'next/server';
import { listSaasCharges, syncSaasChargeStatusFromAsaas, isSaasChargeActiveForDisplay } from '@/lib/saasCharges';
import { listMasterSaasInvoices } from '@/lib/saasBilling';
import { updateCompanyFinancialStatus } from '@/lib/saasCompanyFinancialStatus';
import { resolveCompanyPricing } from '@/lib/companyPricing';
import { resolveSaasFinancialSituation } from '@/lib/masterSaasFinancialStatus';
import {
  buildPaidReferenceMonthsByCompany,
  type MasterSaasPayment,
} from '@/lib/masterSaasPayments';
import { buildSaasInvoiceChargeRows } from '@/lib/saasInvoiceChargeView';
import { authorizeTenantBilling } from '@/lib/tenantBillingAuth';
import {
  assertSaasPaymentGatewayConfigured,
  getSaasPaymentGatewayStatus,
} from '@/lib/saasPaymentGateway';

export const runtime = 'nodejs';

const BILLING_FINANCIAL_STATUS_TIMEOUT_MS = 1800;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ ok: true; value: T } | { ok: false; timedOut: true }> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, timedOut: true }), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(t);
        resolve({ ok: true, value });
      })
      .catch(() => {
        clearTimeout(t);
        resolve({ ok: false, timedOut: true });
      });
  });
}

async function runFinancialStatusRefreshInBackground(
  admin: Parameters<typeof updateCompanyFinancialStatus>[0],
  tenantId: string,
) {
  const startedAt = Date.now();
  try {
    const result = await withTimeout(
      updateCompanyFinancialStatus(admin, tenantId),
      BILLING_FINANCIAL_STATUS_TIMEOUT_MS,
    );
    if (!result.ok) {
      console.warn('[minhas-assinaturas] updateCompanyFinancialStatus timeout', {
        tenantId,
        ms: Date.now() - startedAt,
      });
      return;
    }
    console.log('[minhas-assinaturas] updateCompanyFinancialStatus ok', {
      tenantId,
      ms: Date.now() - startedAt,
      situation: result.value.situation,
    });
  } catch (err) {
    console.warn('[minhas-assinaturas] updateCompanyFinancialStatus error', {
      tenantId,
      ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function GET(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;

  const { admin, tenantId } = auth;

  try {
    // Não bloquear o carregamento do portal aguardando manutenção financeira global.
    // Essa atualização é "best-effort" e pode ser lenta em bases grandes.
    void runFinancialStatusRefreshInBackground(admin, tenantId);

    const { data: company } = await admin
      .from('companies')
      .select('*')
      .eq('id', tenantId)
      .single();
    const { data: subscription } = await admin
      .from('company_subscriptions')
      .select('*')
      .eq('company_id', tenantId)
      .maybeSingle();

    const { data: payments } = await admin
      .from('master_saas_payments')
      .select('*')
      .eq('company_id', tenantId)
      .order('paid_at', { ascending: false });

    const paidReferenceMonths = buildPaidReferenceMonthsByCompany(
      (payments || []) as MasterSaasPayment[],
    );

    const financial = resolveSaasFinancialSituation({
      company: company || { id: tenantId },
      subscription: subscription ?? null,
      nextDueDate: subscription?.next_due_date ?? company?.next_payment_date,
      paidReferenceMonths,
      payments: (payments || []) as MasterSaasPayment[],
    });

    const charges = await listSaasCharges(admin, { companyId: tenantId, limit: 36 });
    const invoices = await listMasterSaasInvoices(admin, { companyId: tenantId, limit: 36 });
    const rows = buildSaasInvoiceChargeRows(invoices, charges);
    const currentCharge = charges.find((c) => isSaasChargeActiveForDisplay(c)) ?? null;

    const pricing = company ? resolveCompanyPricing(company) : null;
    const lastPayment = (payments || [])[0] ?? null;

    return NextResponse.json({
      company: company
        ? {
            id: company.id,
            name: company.name,
            plan: company.plan || company.plan_type,
            status_operacional: company.status_operacional,
            active: company.active,
          }
        : null,
      subscription,
      financial,
      pricing,
      currentCharge,
      charges,
      payments: payments || [],
      invoices,
      rows,
      lastPayment,
      gateway: getSaasPaymentGatewayStatus(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao carregar billing';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;

  const { admin, tenantId, userId } = auth;

  try {
    const body = await request.json();
    const action = String(body.action || '').trim();
    const chargeId = String(body.chargeId || '').trim();

    if (action !== 'sync_status') {
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    }

    if (!chargeId) {
      return NextResponse.json({ error: 'chargeId obrigatório.' }, { status: 400 });
    }

    const { data: chargeRow } = await admin
      .from('saas_charges')
      .select('id, company_id')
      .eq('id', chargeId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!chargeRow || String(chargeRow.company_id) !== tenantId) {
      return NextResponse.json({ error: 'Cobrança não encontrada.' }, { status: 404 });
    }

    try {
      assertSaasPaymentGatewayConfigured();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gateway não configurado.';
      return NextResponse.json({ error: message }, { status: 503 });
    }

    const result = await syncSaasChargeStatusFromAsaas(admin, chargeId, userId);
    return NextResponse.json({ success: true, charge: result.charge, paid: result.paid });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao atualizar cobrança';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
