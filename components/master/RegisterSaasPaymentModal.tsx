'use client';

import { useState, useEffect, useCallback } from 'react';
import { referenceMonthFromDate } from '@/lib/masterSaasPayments';

export type SaasPaymentCompanyOption = {
  id: string;
  name: string;
  defaultAmount?: number;
  subscriptionId?: string | null;
};

type PaymentFormState = {
  companyId: string;
  amount: string;
  paidAt: string;
  paymentMethod: string;
  referenceMonth: string;
  notes: string;
};

function buildDefaultForm(
  companies: SaasPaymentCompanyOption[],
  initialCompanyId?: string,
): PaymentFormState {
  const today = new Date().toISOString().split('T')[0];
  const company = companies.find((c) => c.id === (initialCompanyId || ''));
  return {
    companyId: initialCompanyId || '',
    amount: company?.defaultAmount != null ? String(company.defaultAmount) : '',
    paidAt: today,
    paymentMethod: 'manual',
    referenceMonth: referenceMonthFromDate(today),
    notes: '',
  };
}

type RegisterSaasPaymentModalProps = {
  open: boolean;
  onClose: () => void;
  userId: string;
  companies: SaasPaymentCompanyOption[];
  initialCompanyId?: string;
  initialInvoiceId?: string;
  onSuccess?: () => void | Promise<void>;
};

export function RegisterSaasPaymentModal({
  open,
  onClose,
  userId,
  companies,
  initialCompanyId,
  initialInvoiceId,
  onSuccess,
}: RegisterSaasPaymentModalProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PaymentFormState>(() =>
    buildDefaultForm(companies, initialCompanyId),
  );

  useEffect(() => {
    if (!open) return;
    setForm(buildDefaultForm(companies, initialCompanyId));
  }, [open, initialCompanyId, companies]);

  const handleCompanyChange = useCallback(
    (companyId: string) => {
      const company = companies.find((c) => c.id === companyId);
      setForm((prev) => ({
        ...prev,
        companyId,
        amount:
          company?.defaultAmount != null ? String(company.defaultAmount) : prev.amount,
      }));
    },
    [companies],
  );

  const handleSubmit = useCallback(async () => {
    const amount = Number(form.amount);
    if (!form.companyId || !form.paidAt || !Number.isFinite(amount) || amount <= 0) {
      alert('Preencha empresa, valor e data de pagamento.');
      return;
    }

    const company = companies.find((c) => c.id === form.companyId);
    setSaving(true);
    try {
      const res = await fetch('/api/master/saas-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          companyId: form.companyId,
          subscriptionId: company?.subscriptionId ?? null,
          invoiceId: initialInvoiceId || null,
          amount,
          paidAt: form.paidAt,
          paymentMethod: form.paymentMethod,
          referenceMonth: form.referenceMonth || referenceMonthFromDate(form.paidAt),
          notes: form.notes || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao registrar pagamento');
      onClose();
      await onSuccess?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao registrar pagamento');
    } finally {
      setSaving(false);
    }
  }, [form, userId, companies, initialInvoiceId, onClose, onSuccess]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#11161d] p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-4">Registrar pagamento SaaS</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Empresa</label>
            <select
              value={form.companyId}
              onChange={(e) => handleCompanyChange(e.target.value)}
              className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Selecione a empresa</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Valor pago (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Data de pagamento</label>
              <input
                type="date"
                value={form.paidAt}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    paidAt: e.target.value,
                    referenceMonth: referenceMonthFromDate(e.target.value),
                  }))
                }
                className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Referência (mês)</label>
              <input
                type="month"
                value={form.referenceMonth}
                onChange={(e) => setForm((p) => ({ ...p, referenceMonth: e.target.value }))}
                className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Forma de pagamento</label>
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}
                className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="manual">Manual</option>
                <option value="pix">PIX</option>
                <option value="boleto">Boleto</option>
                <option value="transfer">Transferência</option>
                <option value="card">Cartão</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Observação (opcional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-white/10 text-gray-300 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSubmit()}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Confirmar pagamento'}
          </button>
        </div>
      </div>
    </div>
  );
}
