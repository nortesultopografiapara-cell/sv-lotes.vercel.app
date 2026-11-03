'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isDevelopHomologRuntime } from '@/lib/homolog/env';
import {
  PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE,
  PRIMARY_ADMIN_VERIFY_SUCCESS_MESSAGE,
} from '@/lib/primaryAdminReauth';

type PrincipalPreview = {
  displayName: string;
  maskedEmail: string;
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

export function PrimaryAdminVerifyPanel() {
  const enabled = isDevelopHomologRuntime();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [principal, setPrincipal] = useState<PrincipalPreview | null>(null);
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const headers = await sessionHeaders();
      const res = await fetch('/api/security/primary-admin/verify', {
        method: 'GET',
        credentials: 'same-origin',
        headers,
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok && json.principal) {
        setPrincipal({
          displayName: String(json.principal.displayName || ''),
          maskedEmail: String(json.principal.maskedEmail || ''),
        });
      } else {
        setPrincipal(null);
      }
      const { data } = await supabase.auth.getUser();
      setSessionEmail(data.user?.email || null);
    } catch {
      setPrincipal(null);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  if (!enabled) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const presented = password;
    setPassword('');
    setSubmitting(true);
    setFeedback(null);
    try {
      const headers = await sessionHeaders();
      const res = await fetch('/api/security/primary-admin/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify({ password: presented }),
      });
      const json = await res.json().catch(() => ({}));
      setFeedback({
        ok: Boolean(json?.ok),
        text: json?.ok ? PRIMARY_ADMIN_VERIFY_SUCCESS_MESSAGE : PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE,
      });
      const { data } = await supabase.auth.getUser();
      setSessionEmail(data.user?.email || null);
    } catch {
      setFeedback({ ok: false, text: PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE });
    } finally {
      setPassword('');
      setSubmitting(false);
    }
  };

  return (
    <div className="sv-theme-card rounded-xl border p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center text-[var(--color-primary)]">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Testar autorização do Administrador Principal
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Homologação isolada. Não executa baixa, assinatura nem outra operação crítica.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
        </div>
      ) : !principal ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Administrador Principal não disponível para este tenant.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div className="rounded-lg border border-[var(--border-color)] px-3 py-3 space-y-1">
            <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
              Administrador Principal
            </div>
            <div className="font-medium text-[var(--text-primary)]">{principal.displayName}</div>
            <div className="text-sm text-[var(--text-secondary)]">{principal.maskedEmail}</div>
          </div>

          <label className="block space-y-1">
            <span className="text-sm text-[var(--text-secondary)]">
              Senha do Administrador Principal
            </span>
            <input
              type="password"
              name="primary-admin-homolog-password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm"
            />
          </label>

          <button
            type="submit"
            disabled={submitting || !password}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg sv-brand-btn-primary text-sm font-medium disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Testar autorização
          </button>
        </form>
      )}

      {feedback ? (
        <div
          className={`text-sm rounded-lg px-3 py-2 border ${
            feedback.ok
              ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20'
              : 'text-red-600 bg-red-500/10 border-red-500/20'
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      {sessionEmail ? (
        <p className="text-xs text-[var(--text-secondary)]">
          Sessão atual permanece: <strong>{sessionEmail}</strong>
        </p>
      ) : null}
    </div>
  );
}
