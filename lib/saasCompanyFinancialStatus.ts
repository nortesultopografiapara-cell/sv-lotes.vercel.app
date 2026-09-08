/**
 * Atualização persistida do status financeiro SaaS da empresa.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveSaasFinancialSituation,
  type SaasFinancialSituation,
  type SaasFinancialStatusInput,
} from '@/lib/masterSaasFinancialStatus';
import {
  buildPaidReferenceMonthsByCompany,
  type MasterSaasPayment,
} from '@/lib/masterSaasPayments';
import { shouldPreserveValidSubscription } from '@/lib/saasBillableStatus';

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

/** Recalcula campos persistidos sem gravar — usado por testes e pelo update. */
export function planCompanyFinancialStatusPersist(
  input: SaasFinancialStatusInput,
): Omit<CompanyFinancialStatusUpdate, 'companyId'> {
  const financial = resolveSaasFinancialSituation(input);
  let situation = financial.situation;
  let mapped = mapSituationToPersistedFields(situation);

  if (
    mapped.subscriptionContractStatus === 'canceled' &&
    shouldPreserveValidSubscription({
      company: input.company,
      subscription: input.subscription,
      payments: input.payments,
      nextDueDate: input.nextDueDate ?? input.subscription?.next_due_date ?? null,
      today: input.today,
    })
  ) {
    const restored = resolveSaasFinancialSituation({
      ...input,
      company: {
        ...input.company,
        active: true,
        status_operacional: input.company.status_operacional || 'Ativa',
      },
      subscription: input.subscription
        ? {
            ...input.subscription,
            contract_status:
              input.subscription.contract_status === 'canceled'
                ? 'active'
                : input.subscription.contract_status,
          }
        : input.subscription,
    });
    situation = restored.situation;
    mapped = mapSituationToPersistedFields(situation);
  }

  return {
    situation,
    ...mapped,
  };
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

  const planned = planCompanyFinancialStatusPersist({
    company,
    subscription: subscription ?? null,
    nextDueDate: subscription?.next_due_date ?? company.next_payment_date,
    paidReferenceMonths,
    payments: (payments || []) as MasterSaasPayment[],
  });
  const now = new Date().toISOString();

  await supabaseAdmin
    .from('companies')
    .update({
      active: planned.companyActive,
      status_operacional: planned.statusOperacional,
      updated_at: now,
    })
    .eq('id', companyId);

  if (subscription?.id) {
    await supabaseAdmin
      .from('company_subscriptions')
      .update({
        payment_status: planned.subscriptionPaymentStatus,
        contract_status: planned.subscriptionContractStatus,
        updated_at: now,
      })
      .eq('id', subscription.id);
  }

  return {
    companyId,
    ...planned,
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
