'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { Mail, Lock, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { resolveLoginRedirectPath } from '@/lib/loginRoleResolution';
import { SvLotesLogo } from '@/components/brand/SvLotesLogo';
import { DemoLoginPrefill } from '@/components/login/DemoLoginPrefill';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const applyDemoEmail = useCallback((demoEmail: string) => {
    setEmail(demoEmail);
  }, []);

  /** Campos sempre vazios ao montar /login (e ao voltar via bfcache). Preserva prefill ?demo=1. */
  useEffect(() => {
    const resetLoginFields = () => {
      const isDemo =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('demo') === '1';
      setPassword('');
      setShowPassword(false);
      setError(null);
      if (!isDemo) {
        setEmail('');
      }
    };

    resetLoginFields();

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resetLoginFields();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  // Synchronize state avoiding infinite loops between client and middleware
  useEffect(() => {
    // Check demo/dev mode first
    const isDevPreview = typeof window !== 'undefined' && 
                         (window.location.hostname.includes("aistudio") || 
                          window.location.hostname.includes("run.app") ||
                          process.env.NODE_ENV === "development");

    if (isDevPreview) {
       router.push('/map');
       return;
    }

    if (!isSupabaseConfigured) return;

    const initializeAuth = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user) {
        // We have a VALID, server-confirmed session on client but somehow landed on login.
        window.location.href = '/dashboard';
      } else if (error) {
        // We have a stale session in localStorage that middleware rejected, wipe it to break the loop.
        await supabase.auth.signOut();
        // Also clear our manual caches just in case
        try {
           localStorage.removeItem('active_tenant');
           sessionStorage.clear();
        } catch (e) {}
      }
    };
    initializeAuth();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('ENV CHECK:', {
       url: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'EXISTS' : 'MISSING',
       key_length: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length || 0,
       isConfigured: isSupabaseConfigured
    });

    if (!isSupabaseConfigured) {
      setError('Variáveis de ambiente do Supabase não configuradas no .env');
      return;
    }
    
    setLoading(true);
    setError(null);
    console.log('LOGIN START - Initiating auth process...');
    
    try {
      // 1. Force Clean Authentication: Clear everything before attempt
      await supabase.auth.signOut();
      try {
         localStorage.clear(); // Complete wipe
         sessionStorage.clear();
      } catch (e) {}

      const cleanEmail = email.trim().toLowerCase();
      console.log('LOGIN ATTEMPT - User:', cleanEmail);
      
      // 2. Strict Supabase Authentication
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (authError) {
        console.error('Erro detalhado do Auth:', authError);
        setError(authError.message);
        setLoading(false);
        return;
      }

      // 73: Check result for redirection
      if (data?.user) {
        console.log('LOGIN SUCCESS. Checking role for redirection...');
        // Need to check the role
        const { data: userData } = await supabase
          .from('users')
          .select('role, status')
          .eq('id', data.user.id)
          .single();

        if ((userData?.status || 'ACTIVE').toUpperCase() === 'INACTIVE') {
          await supabase.auth.signOut();
          setError('Usuário inativo. Contate o administrador da empresa.');
          setLoading(false);
          return;
        }

        await supabase
          .from('users')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', data.user.id)
          .then(({ error: loginTrackErr }) => {
            if (loginTrackErr) {
              console.warn('[login] last_login_at não atualizado', loginTrackErr.message);
            }
          });

        window.location.href = resolveLoginRedirectPath(userData?.role);
      }
    } catch (err: any) {
      console.error('LOGIN EXCEPTION:', err);
      setError(err.message || 'Ocorreu um erro inesperado no login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--color-background)] p-4 relative overflow-hidden">
      {/* Cool atmospheric background for login */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-primary)] rounded-full mix-blend-screen filter blur-[120px] opacity-20 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--color-success)] rounded-full mix-blend-screen filter blur-[120px] opacity-10" />

      <div className="w-full max-w-md bg-[var(--color-surface)]/80 backdrop-blur-xl rounded-2xl border border-[var(--color-border)] shadow-2xl p-8 transform transition-all relative z-10">
        
        <div className="flex flex-col items-center justify-center mb-8">
          <SvLotesLogo size={72} showText={false} className="mb-4" />
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">SV LOTES</h1>
          <p className="text-sm text-[var(--color-text-muted)] font-mono text-center uppercase tracking-widest">
            Gestão & GIS
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-500 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!isSupabaseConfigured ? (
          <div className="mb-6 space-y-4">
            <div className="p-4 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded-lg text-center">
              <p className="text-sm font-bold text-white mb-2">Modo Visualização (AI Studio)</p>
              <p className="text-xs text-[var(--color-text-muted)] mb-4">
                As variáveis do Supabase não estão configuradas neste ambiente de preview.
              </p>
              <button
                onClick={() => {
                  document.cookie = "demo_mode=true; path=/; max-age=3600";
                  window.location.href = '/dashboard';
                }}
                className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-2 rounded-lg transition-colors text-sm"
              >
                Entrar em modo demonstração
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-6" autoComplete="off">
            <Suspense fallback={null}>
              <DemoLoginPrefill onDemoMode={applyDemoEmail} />
            </Suspense>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text-muted)] tracking-wider uppercase">Email Corporativo</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-[var(--color-text-muted)]" />
                <input 
                  type="email"
                  name="workspace_email"
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[var(--color-text-muted)] tracking-wider uppercase">Senha</label>
                <a href="#" className="text-xs text-[var(--color-primary)] hover:underline">Esqueci a senha</a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-[var(--color-text-muted)]" />
                <input 
                  type={showPassword ? "text" : "password"}
                  name="workspace_password"
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

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-[0_4px_14px_0_rgba(242,125,38,0.39)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Acessar Workspace'}
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-[var(--color-border)] text-center">
          <p className="text-[10px] font-mono text-[var(--color-text-muted)]">
            Acesso restrito a colaboradores.<br/>
            Norte Sul Topografia © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
