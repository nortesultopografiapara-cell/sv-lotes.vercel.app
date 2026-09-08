/**
 * Consistência entre status operacional e faturamento SaaS.
 * Evita o split-brain Ativa + active=false e diagnostica skips de cobrança.
 */

export const COMPANY_NOT_BILLABLE_SKIP_CODE = 'company_not_billable' as const;

export const SAAS_OPERATIONAL_BLOCKED_STATUSES = [
  'suspensa',
  'bloqueada',
  'inativo',
  'inativa',
] as const;

export type BillableSkipCode =
  | 'ok'
  | 'inactive_flag'
  | 'operational_blocked'
  | 'split_brain_active_false';

export type BillableCompanyDiagnosis = {
  billable: boolean;
  code: BillableSkipCode;
  reason: string;
  company_id?: string;
  active: boolean | null | undefined;
  status_operacional: string;
  splitBrain: boolean;
};

export type MonthlyBillableSkip = {
  company_id: string;
  company_name: string;
  code: string;
  reason: string;
  active: boolean | null;
  status_operacional: string;
};

export function normalizeOperationalStatus(status?: string | null): string {
  return String(status || '').toLowerCase().trim();
}

export function isOperationallyBlockedStatus(status?: string | null): boolean {
  return (SAAS_OPERATIONAL_BLOCKED_STATUSES as readonly string[]).includes(
    normalizeOperationalStatus(status),
  );
}

/** Ativa/Inadimplente (e vazio) continuam faturáveis; bloqueados ficam inactive. */
export function companyActiveFromOperationalStatus(status_operacional: string): boolean {
  return !isOperationallyBlockedStatus(status_operacional);
}

export function buildCompanyStatusUpdatePatch(status_operacional: string): {
  status_operacional: string;
  active: boolean;
} {
  return {
    status_operacional,
    active: companyActiveFromOperationalStatus(status_operacional),
  };
}

/** Uso liberado (Ativa/Inadimplente) com active=false — inconsistência de faturamento. */
export function isSplitBrainActiveFalse(company: {
  active?: boolean | null;
  status_operacional?: string | null;
}): boolean {
  return company.active === false && !isOperationallyBlockedStatus(company.status_operacional);
}

export function isOperationallyAliveStatus(status?: string | null): boolean {
  const op = normalizeOperationalStatus(status);
  return op === 'ativa' || op === 'inadimplente' || op === '';
}

export function diagnoseBillableCompany(company: {
  id?: string;
  active?: boolean | null;
  status_operacional?: string | null;
}): BillableCompanyDiagnosis {
  const status = String(company.status_operacional || '');
  const splitBrain = isSplitBrainActiveFalse(company);
  const blocked = isOperationallyBlockedStatus(status);

  if (company.active === false) {
    return {
      billable: false,
      code: splitBrain ? 'split_brain_active_false' : 'inactive_flag',
      reason: splitBrain
        ? `active=false / operacional=${status || '—'}`
        : 'active=false',
      company_id: company.id,
      active: company.active,
      status_operacional: status,
      splitBrain,
    };
  }

  if (blocked) {
    return {
      billable: false,
      code: 'operational_blocked',
      reason: `status_operacional=${status}`,
      company_id: company.id,
      active: company.active,
      status_operacional: status,
      splitBrain: false,
    };
  }

  return {
    billable: true,
    code: 'ok',
    reason: 'faturável',
    company_id: company.id,
    active: company.active,
    status_operacional: status,
    splitBrain: false,
  };
}

export function logBillableSkip(
  company: Parameters<typeof diagnoseBillableCompany>[0],
  extra?: Record<string, unknown>,
): BillableCompanyDiagnosis {
  const diagnosis = diagnoseBillableCompany(company);
  if (!diagnosis.billable) {
    console.warn(
      '[saas-billable-skip]',
      JSON.stringify({
        company_id: diagnosis.company_id ?? null,
        active: diagnosis.active ?? null,
        status_operacional: diagnosis.status_operacional,
        code: diagnosis.code,
        reason: diagnosis.reason,
        ...extra,
      }),
    );
  }
  return diagnosis;
}

export function formatMonthlyBillableSkip(company: {
  id?: string;
  name?: string | null;
  active?: boolean | null;
  status_operacional?: string | null;
}): MonthlyBillableSkip {
  const diagnosis = diagnoseBillableCompany(company);
  return {
    company_id: String(company.id || ''),
    company_name: String(company.name || company.id || ''),
    code: diagnosis.code,
    reason: diagnosis.reason,
    active: company.active ?? null,
    status_operacional: String(company.status_operacional || ''),
  };
}

export function hasConfirmedSaasPayment(
  payments?: Array<{ status?: string | null }> | null,
): boolean {
  return (payments || []).some((p) => String(p.status || '').toLowerCase() === 'paid');
}

export function isIsoDateOnOrAfter(iso?: string | null, today: Date = new Date()): boolean {
  if (!iso) return false;
  const due = new Date(`${String(iso).split('T')[0]}T12:00:00`);
  if (Number.isNaN(due.getTime())) return false;
  const t = new Date(today);
  t.setHours(12, 0, 0, 0);
  return due.getTime() >= t.getTime();
}

/**
 * Não cancelar assinatura válida por leftover active=false / contract canceled.
 * Inativa verdadeira (sem split-brain) continua podendo persistir cancelamento.
 */
export function shouldPreserveValidSubscription(input: {
  company: { active?: boolean | null; status_operacional?: string | null };
  subscription?: { contract_status?: string | null; next_due_date?: string | null } | null;
  payments?: Array<{ status?: string | null }> | null;
  nextDueDate?: string | null;
  today?: Date;
}): boolean {
  const splitBrain = isSplitBrainActiveFalse(input.company);
  const paid = hasConfirmedSaasPayment(input.payments);
  const nextDue = input.nextDueDate ?? input.subscription?.next_due_date ?? null;
  const futureDue = isIsoDateOnOrAfter(nextDue, input.today);
  const operationalAlive = isOperationallyAliveStatus(input.company.status_operacional);

  if (splitBrain) return true;
  if (operationalAlive && (paid || futureDue)) return true;
  return false;
}

export function shouldReactivateCompanyOnPayment(company: {
  status_operacional?: string | null;
  active?: boolean | null;
}): boolean {
  const status = normalizeOperationalStatus(company.status_operacional);
  if (['suspensa', 'inadimplente', 'inativa', 'inativo', 'bloqueada'].includes(status)) {
    return true;
  }
  return company.active === false;
}
