'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { formatSaasCurrency, resolveCompanyPricing } from '@/lib/companyPricing';
import { currentReferenceMonth } from '@/lib/saasBilling';
import type { SaasMasterBillingType } from '@/lib/saasMasterConfig';

export type SaasGenerateChargeCompany = {
  id: string;
  name: string;
  next_payment_date?: string | null;
  next_due_date?: string | null;
  subscription_due_day?: number | null;
  plan?: string | null;
  plan_type?: string | null;
  custom_price?: number | null;
  price?: number | null;
};

type Props = {
  open: boolean;
  company: SaasGenerateChargeCompany | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    billingType: SaasMasterBillingType;
    referenceMonth: string;
    dueDate: string;
  }) => void | Promise<void>;
};

function defaultDueDate(
  company: SaasGenerateChargeCompany | null,
  referenceMonth: string = currentReferenceMonth(),
): string {
  const ref = referenceMonth || currentReferenceMonth();
  const fromCompany =
    company?.next_payment_date || company?.next_due_date || null;
  if (fromCompany) {
    const iso = String(fromCompany).split('T')[0];
    if (iso.slice(0, 7) === ref) return iso;
  }

  const [y, m] = ref.split('-').map(Number);
  const dayRaw = Number(company?.subscription_due_day);
  const day =
    Number.isFinite(dayRaw) && dayRaw >= 1 && dayRaw <= 31
      ? dayRaw
      : 10;
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function SaasGenerateChargeModal({
  open,
  company,
  loading,
  onClose,
  onSubmit,
}: Props) {
  const pricing = useMemo(
    () => (company ? resolveCompanyPricing(company) : null),
    [company],
  );

  const [billingType, setBillingType] = useState<SaasMasterBillingType>('PIX');
  const [referenceMonth, setReferenceMonth] = useState(currentReferenceMonth());
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    if (!open || !company) return;
    const ref = currentReferenceMonth();
    setBillingType('PIX');
    setReferenceMonth(ref);
    setDueDate(defaultDueDate(company, ref));
  }, [open, company]);

  if (!open || !company) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[#11161d] shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-white">Gerar cobrança</h3>
            <p className="text-sm text-gray-400">Asaas — PIX ou Boleto</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <Field label="Empresa">
            <p className="text-white font-medium">{company.name}</p>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Competência">
              <input
                type="month"
                value={referenceMonth}
                onChange={(e) => setReferenceMonth(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0B0E14] px-3 py-2 text-sm text-white"
              />
            </Field>
            <Field label="Vencimento">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0B0E14] px-3 py-2 text-sm text-white"
              />
            </Field>
          </div>

          <Field label="Valor">
            <p className="text-emerald-300 font-semibold tabular-nums">
              {formatSaasCurrency(pricing?.appliedPrice ?? 0)}
            </p>
          </Field>

          <Field label="Forma de cobrança *">
            <div className="flex flex-wrap gap-3">
              {(['PIX', 'BOLETO'] as SaasMasterBillingType[]).map((type) => (
                <label
                  key={type}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                    billingType === type
                      ? 'border-blue-500/50 bg-blue-500/10 text-white'
                      : 'border-white/10 text-gray-400 hover:border-white/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="billingType"
                    value={type}
                    checked={billingType === type}
                    onChange={() => setBillingType(type)}
                    className="sr-only"
                  />
                  {type}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              O Asaas não combina PIX e Boleto na mesma cobrança. Escolha uma forma por geração.
            </p>
          </Field>
        </div>

        <div className="shrink-0 border-t border-white/10 px-6 py-4 flex justify-end gap-3 bg-[#0B0E14]/80">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-white/10 text-sm text-gray-300 hover:bg-white/5 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading || !dueDate || !referenceMonth}
            onClick={() =>
              void onSubmit({
                billingType,
                referenceMonth,
                dueDate,
              })
            }
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-semibold text-white"
          >
            {loading ? 'Gerando…' : 'Gerar cobrança'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-1.5">
        {label}
      </p>
      {children}
    </div>
  );
}
