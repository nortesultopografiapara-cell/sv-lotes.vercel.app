'use client';

import { useState } from 'react';
import { formatCurrencyBRL } from '@/lib/currencyBrl';

type Props = {
  receiptId: string;
  saleLabel: string;
  parcelLabel: string;
  amount: number;
  paidAt: string | null;
  onClose: () => void;
  onCompleted: () => void;
};

export function ReversePaymentDialog({
  receiptId,
  saleLabel,
  parcelLabel,
  amount,
  paidAt,
  onClose,
  onCompleted,
}: Props) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const paidLabel = paidAt
    ? new Date(paidAt).toLocaleString('pt-BR')
    : 'sem data registrada';

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const preview = await fetch('/api/finance/receipt-payment-reversal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId, reason, confirm: false }),
      });
      const previewBody = await preview.json();
      if (previewBody.success !== true) {
        setMessage(previewBody.message || 'O estorno não está disponível para esta parcela.');
        return;
      }
      if (!confirmed) {
        setMessage('Confirme o estorno antes de concluir.');
        return;
      }
      const executed = await fetch('/api/finance/receipt-payment-reversal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId, reason, confirm: true }),
      });
      const body = await executed.json();
      if (!executed.ok || body.success !== true) {
        setMessage(body.message || 'O estorno não foi concluído.');
        return;
      }
      window.dispatchEvent(new Event('finance_updated'));
      onCompleted();
    } catch {
      setMessage('Não foi possível concluir o estorno.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 text-slate-900 shadow-xl">
        <h2 className="text-lg font-semibold">Estornar pagamento</h2>
        <p className="mt-2 text-sm">{saleLabel}</p>
        <p className="mt-1 text-sm">{parcelLabel}</p>
        <p className="mt-1 text-sm">Valor: {formatCurrencyBRL(amount)}</p>
        <p className="mt-1 text-sm">Pagamento: {paidLabel}</p>
        <label className="mt-4 block text-sm font-medium">
          Justificativa
          <textarea
            className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>Confirmo o estorno desta parcela. As demais parcelas não serão alteradas.</span>
        </label>
        {message ? <p className="mt-3 text-sm text-red-700">{message}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded border px-3 py-2 text-sm" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="rounded bg-slate-900 px-3 py-2 text-sm text-white" onClick={() => void submit()} disabled={busy}>
            Confirmar estorno
          </button>
        </div>
      </div>
    </div>
  );
}
