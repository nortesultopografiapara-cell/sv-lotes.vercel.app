import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { listSaasCharges } from '@/lib/saasCharges';
import { listMasterSaasInvoices } from '@/lib/saasBilling';
import { updateCompanyFinancialStatus } from '@/lib/saasCompanyFinancialStatus';
import { resolveCompanyPricing } from '@/lib/companyPricing';
import { resolveSaasFinancialSituation } from '@/lib/masterSaasFinancialStatus';
import {
  buildPaidReferenceMonthsByCompany,
  type MasterSaasPayment,
} from '@/lib/masterSaasPayments';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/rls';
import { isTenantAdminRole } from '@/lib/ownerProjectAccess';
import { normalizeUserRole } from '@/lib/rolePermissions';

export const runtime = 'nodejs';

async function authorizeTenantBilling(request: Request) {
  const { user, configError } = await getRequestAuthUser(request);
  if (configError || !user) {
    return { error: NextResponse.json({ error: configError || 'Não autenticado.' }, { status: 401 }) };
  }

  const { client: admin, configError: adminError } = createAdminSupabase();
  if (!admin || adminError) {
    return { error: NextResponse.json({ error: adminError || 'Service role indisponível.' }, { status: 503 }) };
  }

  const profile = await resolveCallerProfile(admin, user.id);
  const role = normalizeUserRole(profile?.role);
  const tenantId = profile?.tenant_id || profile?.company_id || null;

  if (!isPlatformAdmin(role) && !isTenantAdminRole(role)) {
    return { error: NextResponse.json({ error: 'Permissão negada.' }, { status: 403 }) };
  }

  if (!tenantId && !isPlatformAdmin(role)) {
    return { error: NextResponse.json({ error: 'Empresa não identificada.' }, { status: 400 }) };
  }

  return { admin, user, role, tenantId: tenantId as string };
}

export async function GET(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth && auth.error) return auth.error;

  const { admin, tenantId } = auth as { admin: NonNullable<Awaited<ReturnType<typeof createAdminSupabase>>['client']>; tenantId: string };

  try {
    await updateCompanyFinancialStatus(admin, tenantId);

    const { data: company } = await admin.from('companies').select('*').eq('id', tenantId).single();
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

    const charges = await listSaasCharges(admin, { companyId: tenantId, limit: 24 });
    const invoices = await listMasterSaasInvoices(admin, { companyId: tenantId, limit: 24 });
    const currentCharge =
      charges.find((c) => c.status === 'PENDING' || c.status === 'OVERDUE') || charges[0] || null;

    const pricing = company ? resolveCompanyPricing(company) : null;

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
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao carregar billing';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
