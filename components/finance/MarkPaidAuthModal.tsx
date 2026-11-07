'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Preview = {
  receipt: {
    amount: number;
    installmentNumber: number | null;
  };
  principal: {
    displayName: string;
    maskedEmail: string;
  };
};

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

function money(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function MarkPaidAuthModal({ receiptId, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!receiptId) return;
    setLoading(true);
    setPreview(null);
    setPassword('');
    setError(null);
    try {
      const headers = await sessionHeaders();
      const response = await fetch(`/api/finance/receipts/${receiptId}/mark-paid`, {
        method: 'GET',
        credentials: 'include',
        headers,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok || !json?.principal) {
        setError(json.error || 'Não foi possível preparar a baixa.');
        return;
      }
      setPreview({
        receipt: json.receipt,
        principal: json.principal,
      });
    } catch {
      setError('Não foi possível preparar a baixa.');
    } finally {
      setLoading(false);
    }
  }, [receiptId]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) void loadPreview();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadPreview]);

  if (!receiptId) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const presented = password;
    if (!presented.trim()) return;
    setPassword('');
    setSubmitting(true);
    setError(null);
    try {
      const headers = await sessionHeaders();
      const response = await fetch(`/api/finance/receipts/${receiptId}/mark-paid`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ password: presented }),
      });
      const json = await response.json().catch(() => ({}));
      if (response.ok && json?.ok) {
        onSuccess();
        return;
      }
      setError(json.error || 'Autorização não concedida.');
    } catch {
      setError('Autorização não concedida.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4">
      <div className="sv-theme-card w-full max-w-lg rounded-xl border p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Autorização do Administrador Principal
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                A baixa só é registrada depois da senha do administrador principal da empresa.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--border-color)]/40"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : null}

        {!loading && !preview ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600">
              {error || 'Não foi possível preparar a baixa.'}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : null}

        {!loading && preview ? (
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-[var(--border-color)] px-3 py-3 text-sm">
              <dt className="text-[var(--text-secondary)]">Parcela</dt>
              <dd className="font-medium text-[var(--text-primary)]">
                {preview.receipt.installmentNumber ?? '—'}
              </dd>
              <dt className="text-[var(--text-secondary)]">Valor</dt>
              <dd className="font-medium text-[var(--text-primary)]">{money(Number(preview.receipt.amount) || 0)}</dd>
            </dl>
            <div className="space-y-1 rounded-lg border border-[var(--border-color)] px-3 py-3">
              <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                Administrador principal
              </div>
              <div className="font-medium text-[var(--text-primary)]">{preview.principal.displayName}</div>
              <div className="text-sm text-[var(--text-secondary)]">{preview.principal.maskedEmail}</div>
            </div>
            <label className="block space-y-1">
              <span className="text-sm text-[var(--text-secondary)]">Senha do administrador principal</span>
              <input
                type="password"
                name="mark-paid-primary-admin-password"
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm"
              />
            </label>
            {error ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || !password.trim()}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium sv-brand-btn-primary disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {submitting ? 'Autorizando...' : 'Autorizar e registrar pagamento'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
