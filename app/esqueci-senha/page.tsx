'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Loader2, Mail } from 'lucide-react';
import { SvLotesLogo } from '@/components/brand/SvLotesLogo';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  PASSWORD_RECOVERY_LOGIN_PATH,
  isValidRecoveryEmail,
  normalizeRecoveryEmail,
  remainingCooldownMs,
  recoveryRequestUserMessage,
  resolvePasswordRecoveryRedirectTo,
} from '@/lib/auth/passwordRecovery';

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const cooldownLeft = remainingCooldownMs(lastSentAt, now);
  const cooldownSeconds = Math.ceil(cooldownLeft / 1000);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isSupabaseConfigured) {
      setError('Autenticação indisponível neste ambiente.');
      return;
    }

    const cleanEmail = normalizeRecoveryEmail(email);
    if (!isValidRecoveryEmail(cleanEmail)) {
      setError('Informe um e-mail válido.');
      return;
    }

    if (remainingCooldownMs(lastSentAt) > 0) {
      return;
    }

    setLoading(true);
    try {
      const redirectTo = resolvePasswordRecoveryRedirectTo(window.location.origin);
      await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
    } catch {
      // Resposta neutra mesmo em falha de rede.
    } finally {
      setSubmitted(true);
      setLastSentAt(Date.now());
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--color-background)] p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-primary)] rounded-full mix-blend-screen filter blur-[120px] opacity-20 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--color-success)] rounded-full mix-blend-screen filter blur-[120px] opacity-10" />

      <div className="w-full max-w-md bg-[var(--color-surface)]/80 backdrop-blur-xl rounded-2xl border border-[var(--color-border)] shadow-2xl p-8 transform transition-all relative z-10">
        <div className="flex flex-col items-center justify-center mb-8">
          <SvLotesLogo size={72} showText={false} className="mb-4" />
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Recuperar acesso</h1>
          <p className="text-sm text-[var(--color-text-muted)] text-center leading-relaxed">
            Informe o e-mail corporativo cadastrado no SV Lotes. Enviaremos um link seguro para você
            criar uma nova senha.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-500 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {submitted ? (
          <div className="mb-6 p-4 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded-lg">
            <p className="text-sm font-bold text-white mb-1">Verifique seu e-mail</p>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
              {recoveryRequestUserMessage(null)}
            </p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--color-text-muted)] tracking-wider uppercase">
              Email Corporativo
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-[var(--color-text-muted)]" />
              <input
                type="email"
                name="recovery_email"
                autoComplete="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                placeholder="nome@nortesultopografia.com.br"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || cooldownLeft > 0}
            className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-[0_4px_14px_0_rgba(242,125,38,0.39)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : cooldownLeft > 0 ? (
              `Aguarde ${cooldownSeconds}s`
            ) : (
              'Enviar link de recuperação'
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-[var(--color-border)] text-center">
          <Link
            href={PASSWORD_RECOVERY_LOGIN_PATH}
            className="inline-flex items-center gap-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  );
}
