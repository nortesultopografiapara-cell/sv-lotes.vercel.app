'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { SvLotesLogo } from '@/components/brand/SvLotesLogo';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  PASSWORD_RECOVERY_INVALID_LINK_MESSAGE,
  PASSWORD_RECOVERY_LOGIN_PATH,
  PASSWORD_RECOVERY_REQUEST_PATH,
  PASSWORD_RECOVERY_RESET_PATH,
  buildPasswordRecoveryUpdatePayload,
  canOpenPasswordRecoveryForm,
  clearPasswordRecoveryLock,
  hasPasswordRecoveryLock,
  isRecoveryLinkError,
  looksLikeRecoveryCallback,
  markPasswordRecoveryLock,
  translatePasswordRecoveryError,
  validateNewRecoveryPassword,
} from '@/lib/auth/passwordRecovery';

type Screen = 'loading' | 'invalid' | 'form' | 'success';

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function prepareRecovery() {
      if (!isSupabaseConfigured) {
        if (mounted) setScreen('invalid');
        return;
      }

      const search = new URLSearchParams(window.location.search);
      const hash = window.location.hash || '';
      if (isRecoveryLinkError(search, hash)) {
        if (mounted) setScreen('invalid');
        return;
      }

      try {
        const code = search.get('code');
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            const { data } = await supabase.auth.getSession();
            if (!data.session) {
              if (mounted) setScreen('invalid');
              return;
            }
          }
        } else if (looksLikeRecoveryCallback(search, hash)) {
          await supabase.auth.getSession();
        }

        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        const allowed = canOpenPasswordRecoveryForm({
          hasSession: Boolean(data.session?.user),
          recoveryLock: hasPasswordRecoveryLock(),
          search,
          hash,
        });
        if (!allowed) {
          setScreen('invalid');
          return;
        }
        markPasswordRecoveryLock();
        if (typeof window !== 'undefined' && window.history.replaceState) {
          window.history.replaceState({}, '', PASSWORD_RECOVERY_RESET_PATH);
        }
        setScreen('form');
      } catch {
        if (mounted) setScreen('invalid');
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        markPasswordRecoveryLock();
        setScreen('form');
      }
    });

    void prepareRecovery();

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = validateNewRecoveryPassword(password, confirmPassword);
    if (validation) {
      setError(validation);
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser(
        buildPasswordRecoveryUpdatePayload(password),
      );
      if (updateError) {
        setError(translatePasswordRecoveryError(updateError, 'update'));
        return;
      }
      await supabase.auth.signOut();
      clearPasswordRecoveryLock();
      setScreen('success');
      window.setTimeout(() => {
        router.replace(PASSWORD_RECOVERY_LOGIN_PATH);
      }, 1800);
    } catch (err: unknown) {
      setError(translatePasswordRecoveryError(err instanceof Error ? err.message : null, 'update'));
    } finally {
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
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
            {screen === 'success' ? 'Senha alterada' : 'Criar nova senha'}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] text-center leading-relaxed">
            {screen === 'success'
              ? 'Senha alterada com sucesso. Faça login com a nova senha.'
              : 'Digite e confirme sua nova senha para recuperar o acesso ao SV Lotes.'}
          </p>
        </div>

        {screen === 'loading' ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
            <p className="text-xs font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
              Validando link...
            </p>
          </div>
        ) : null}

        {screen === 'invalid' ? (
          <div className="space-y-6">
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-500 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{PASSWORD_RECOVERY_INVALID_LINK_MESSAGE}</span>
            </div>
            <Link
              href={PASSWORD_RECOVERY_REQUEST_PATH}
              className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center"
            >
              Solicitar novo link
            </Link>
          </div>
        ) : null}

        {screen === 'success' ? (
          <Link
            href={PASSWORD_RECOVERY_LOGIN_PATH}
            className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center"
          >
            Ir para o login
          </Link>
        ) : null}

        {screen === 'form' ? (
          <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-500 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text-muted)] tracking-wider uppercase">
                Nova senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-[var(--color-text-muted)]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="new_password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-3 pl-10 pr-10 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text-muted)] tracking-wider uppercase">
                Confirmar nova senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-[var(--color-text-muted)]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="confirm_password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-[0_4px_14px_0_rgba(242,125,38,0.39)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar nova senha'}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
