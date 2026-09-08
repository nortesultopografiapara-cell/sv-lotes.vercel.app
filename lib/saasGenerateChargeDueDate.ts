import { currentReferenceMonth } from '@/lib/saasBilling';

export type SaasGenerateChargeDueDateSource = {
  next_payment_date?: string | null;
  next_due_date?: string | null;
  subscription_due_day?: number | null;
};

function dueDayFromIso(iso?: string | null): number | null {
  const day = Number(String(iso || '').split('T')[0].split('-')[2]);
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null;
}

/** Vencimento do modal: acompanha a competência, preservando o dia da assinatura. */
export function resolveSaasGenerateChargeDueDate(
  company: SaasGenerateChargeDueDateSource | null,
  referenceMonth: string = currentReferenceMonth(),
): string {
  const ref = referenceMonth || currentReferenceMonth();
  const fromCompany =
    company?.next_payment_date || company?.next_due_date || null;
  const nextIso = fromCompany ? String(fromCompany).split('T')[0] : null;
  if (nextIso && nextIso.slice(0, 7) === ref) return nextIso;

  const [y, m] = ref.split('-').map(Number);
  const dayRaw = Number(company?.subscription_due_day);
  const day =
    Number.isFinite(dayRaw) && dayRaw >= 1 && dayRaw <= 31
      ? dayRaw
      : dueDayFromIso(nextIso) || 10;
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}
