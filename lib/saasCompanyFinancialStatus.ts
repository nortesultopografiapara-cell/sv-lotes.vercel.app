/**
 * Atualização persistida do status financeiro SaaS da empresa.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveSaasFinancialSituation,
  type SaasFinancialSituation,
} from '@/lib/masterSaasFinancialStatus';
import {
  buildPaidReferenceMonthsByCompany,
  type MasterSaasPayment,
} from '@/lib/masterSaasPayments';

export type CompanyFinancialStatusUpdate = {
  companyId: string;
  situation: SaasFinancialSituation;
  companyActive: boolean;
  statusOperacional: string;
  subscriptionPaymentStatus: string;
  subscriptionContractStatus: string;
};

function mapSituationToPersistedFields(
  situation: SaasFinancialSituation,
): Pick<
  CompanyFinancialStatusUpdate,
  'companyActive' | 'statusOperacional' | 'subscriptionPaymentStatus' | 'subscriptionContractStatus'
> {
  switch (situation) {
    case 'EM DIA':
      return {
        companyActive: true,
        statusOperacional: 'Ativa',
        subscriptionPaymentStatus: 'paid',
        subscriptionContractStatus: 'active',
      };
    case 'VENCE EM BREVE':
      return {
        companyActive: true,
        statusOperacional: 'Ativa',
        subscriptionPaymentStatus: 'pending',
        subscriptionContractStatus: 'active',
      };
    case 'VENCIDO':
      return {
        companyActive: true,
        statusOperacional: 'Inadimplente',
        subscriptionPaymentStatus: 'overdue',
        subscriptionContractStatus: 'active',
      };
    case 'SUSPENSO':
      return {
        companyActive: false,
        statusOperacional: 'Suspensa',
        subscriptionPaymentStatus: 'overdue',
        subscriptionContractStatus: 'suspended',
      };
    case 'INATIVO':
    default:
      return {
        companyActive: false,
        statusOperacional: 'Inativa',
        subscriptionPaymentStatus: 'canceled',
        subscriptionContractStatus: 'canceled',
      };
  }
}

/** Recalcula e persiste o status financeiro de uma empresa (sem manutenção global). */
export async function updateCompanyFinancialStatus(
  supabaseAdmin: SupabaseClient,
  companyId: string,
): Promise<CompanyFinancialStatusUpdate> {
  const { data: company, error: companyErr } = await supabaseAdmin
    .from('companies')
    .select('id, active, status_operacional, next_payment_date')
    .eq('id', companyId)
    .single();

  if (companyErr || !company) {
    throw new Error(companyErr?.message || 'Empresa não encontrada');
  }

  const { data: subscription } = await supabaseAdmin
    .from('company_subscriptions')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  const { data: payments } = await supabaseAdmin
    .from('master_saas_payments')
    .select('*')
    .eq('company_id', companyId);

  const paidReferenceMonths = buildPaidReferenceMonthsByCompany(
    (payments || []) as MasterSaasPayment[],
  );

  const financial = resolveSaasFinancialSituation({
    company,
    subscription: subscription ?? null,
    nextDueDate: subscription?.next_due_date ?? company.next_payment_date,
    paidReferenceMonths,
    payments: (payments || []) as MasterSaasPayment[],
  });

  const situation = financial.situation;
  const mapped = mapSituationToPersistedFields(situation);
  const now = new Date().toISOString();

  await supabaseAdmin
    .from('companies')
    .update({
      active: mapped.companyActive,
      status_operacional: mapped.statusOperacional,
      updated_at: now,
    })
    .eq('id', companyId);

  if (subscription?.id) {
    await supabaseAdmin
      .from('company_subscriptions')
      .update({
        payment_status: mapped.subscriptionPaymentStatus,
        contract_status: mapped.subscriptionContractStatus,
        updated_at: now,
      })
      .eq('id', subscription.id);
  }

  return {
    companyId,
    situation,
    ...mapped,
  };
}

/** Atualiza status financeiro de todas as empresas faturáveis. */
export async function updateAllCompaniesFinancialStatus(
  supabaseAdmin: SupabaseClient,
): Promise<number> {
  const { data: companies } = await supabaseAdmin.from('companies').select('id');
  let count = 0;
  for (const company of companies || []) {
    if (!company.id) continue;
    await updateCompanyFinancialStatus(supabaseAdmin, company.id);
    count += 1;
  }
  return count;
}
