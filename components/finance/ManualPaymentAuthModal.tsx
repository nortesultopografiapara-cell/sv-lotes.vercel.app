'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  MANUAL_PAYMENT_ALREADY_PAID_MESSAGE,
  MANUAL_PAYMENT_LOAD_FAILED_MESSAGE,
  MANUAL_PAYMENT_PERSISTENCE_FAILED_MESSAGE,
  MANUAL_PAYMENT_SUCCESS_MESSAGE,
  PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE,
} from '@/lib/finance/manualReceiptPayment';

type Preview = {
  receipt: {
    contractNumber: string;
    customerName: string;
    installmentLabel: string;
    dueDateLabel: string;
    amountLabel: string;
  };
  principal: {
    displayName: string;
    maskedEmail: string;
  };
};

type ModalView = 'loading' | 'ready' | 'load_failed' | 'authorization_failed';

type Props = {
  receiptId: string | null;
  onClose: () => void;
  onSuccess: () => void;
};

async function sessionHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export function ManualPaymentAuthModal({ receiptId, onClose, onSuccess }: Props) {
  const [view, setView] = useState<ModalView>('loading');
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!receiptId) return;
    setView('loading');
    setPreview(null);
    setPassword('');
    setError(null);
    try {
      const headers = await sessionHeaders();
      const res = await fetch(`/api/finance/receipts/${receiptId}/manual-payment`, {
        method: 'GET',
        credentials: 'same-origin',
        headers,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !json?.receipt || !json?.principal) {
        setPreview(null);
        setError(MANUAL_PAYMENT_LOAD_FAILED_MESSAGE);
        setView('load_failed');
        return;
      }
      setPreview({
        receipt: json.receipt,
        principal: json.principal,
      });
      setView('ready');
    } catch {
      setPreview(null);
      setError(MANUAL_PAYMENT_LOAD_FAILED_MESSAGE);
      setView('load_failed');
    }
  }, [receiptId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  if (!receiptId) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const presented = password.trim();
    if (!presented) return;
    setPassword('');
    setSubmitting(true);
    setError(null);
    try {
      const headers = await sessionHeaders();
      const res = await fetch(`/api/finance/receipts/${receiptId}/manual-payment`, {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify({ password: presented }),
      });
      const json = await res.json().catch(() => ({}));
      if (json?.ok) {
        onSuccess();
        onClose();
        alert(MANUAL_PAYMENT_SUCCESS_MESSAGE);
        return;
      }
      if (json?.error === MANUAL_PAYMENT_ALREADY_PAID_MESSAGE) {
        setError(MANUAL_PAYMENT_ALREADY_PAID_MESSAGE);
        setView('ready');
        return;
      }
      if (json?.error === MANUAL_PAYMENT_PERSISTENCE_FAILED_MESSAGE) {
        setError(MANUAL_PAYMENT_PERSISTENCE_FAILED_MESSAGE);
        setView('ready');
        return;
      }
      setError(PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE);
      setView('authorization_failed');
    } catch {
      setError(PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE);
      setView('authorization_failed');
    } finally {
      setPassword('');
      setSubmitting(false);
    }
  };

  const showForm = (view === 'ready' || view === 'authorization_failed') && preview;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4">
      <div className="sv-theme-card w-full max-w-lg rounded-xl border p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center text-[var(--color-primary)]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Autorização do Administrador Principal
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Esta operação registra manualmente um pagamento e requer autorização.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--text-secondary)] hover:bg-[var(--border-color)]/40"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {view === 'loading' ? (
          <div className="flex justify-center py-8" data-testid="manual-payment-loading">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : null}

        {view === 'load_failed' ? (
          <div className="space-y-4">
            <p className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error || MANUAL_PAYMENT_LOAD_FAILED_MESSAGE}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-[var(--border-color)] text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void loadPreview()}
                className="px-4 py-2 rounded-lg sv-brand-btn-primary text-sm font-medium"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        ) : null}

        {showForm ? (
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm rounded-lg border border-[var(--border-color)] px-3 py-3">
              <dt className="text-[var(--text-secondary)]">Contrato</dt>
              <dd className="font-medium text-[var(--text-primary)]">{preview.receipt.contractNumber}</dd>
              <dt className="text-[var(--text-secondary)]">Cliente</dt>
              <dd className="font-medium text-[var(--text-primary)]">{preview.receipt.customerName}</dd>
              <dt className="text-[var(--text-secondary)]">Parcela</dt>
              <dd className="font-medium text-[var(--text-primary)]">{preview.receipt.installmentLabel}</dd>
              <dt className="text-[var(--text-secondary)]">Vencimento</dt>
              <dd className="font-medium text-[var(--text-primary)]">{preview.receipt.dueDateLabel}</dd>
              <dt className="text-[var(--text-secondary)]">Valor</dt>
              <dd className="font-medium text-[var(--text-primary)]">{preview.receipt.amountLabel}</dd>
            </dl>

            <div className="rounded-lg border border-[var(--border-color)] px-3 py-3 space-y-1">
              <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                Administrador Principal
              </div>
              <div className="font-medium text-[var(--text-primary)]">{preview.principal.displayName}</div>
              <div className="text-sm text-[var(--text-secondary)]">{preview.principal.maskedEmail}</div>
            </div>

            <label className="block space-y-1">
              <span className="text-sm text-[var(--text-secondary)]">
                Senha do Administrador Principal
              </span>
              <input
                type="password"
                name="manual-payment-primary-admin-password"
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm"
              />
            </label>

            {error ? (
              <div className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-[var(--border-color)] text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || !password.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg sv-brand-btn-primary text-sm font-medium disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {submitting ? 'Autorizando...' : 'Autorizar e registrar pagamento'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
