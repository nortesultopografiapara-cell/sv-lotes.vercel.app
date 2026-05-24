'use client';

import { useState, useEffect } from 'react';
import { Map as MapIcon, Mail, Lock, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Synchronize state avoiding infinite loops between client and middleware
  useEffect(() => {
    const initializeAuth = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user) {
        // We have a VALID, server-confirmed session on client but somehow landed on login.
        window.location.href = '/';
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

  const handleDemoMode = () => {
    // Set a cookie so middleware knows we're in demo mode
    document.cookie = "demo_preview_mode=true; path=/; max-age=3600";
    
    // Set a flag in localStorage for client-side components if they do checks
    localStorage.setItem('demo_preview_mode', 'true');
    
    // Redirect to dashboard
    window.location.href = '/dashboard';
  };

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
          .select('role')
          .eq('id', data.user.id)
          .single();
          
        if (userData?.role === 'BROKER') {
           window.location.href = '/map';
        } else {
           window.location.href = '/dashboard';
        }
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
          <div className="w-16 h-16 bg-[var(--color-primary)]/10 rounded-2xl flex items-center justify-center mb-4 text-[var(--color-primary)] border border-[var(--color-primary)]/20 shadow-[0_0_15px_rgba(242,125,38,0.2)]">
            <MapIcon className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">SV_LOTES</h1>
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

        {!isSupabaseConfigured && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-500 text-xs">
            <p className="font-bold mb-1">Aviso de Configuração (AI Studio):</p>
            <p>O NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY não estão definidos.</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          {!isSupabaseConfigured ? (
            <div className="space-y-4">
               <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 text-sm mb-4">
                 <p className="font-bold flex items-center gap-2 mb-2"><AlertCircle className="w-4 h-4"/> Ambiente Google AI Studio Visualizado</p>
                 <p>O login real foi desabilitado pois as variáveis estão ausentes neste preview.</p>
               </div>
               <button 
                 type="button" 
                 onClick={handleDemoMode}
                 className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-[0_4px_14px_0_rgba(37,99,235,0.39)]"
               >
                 <Eye className="w-5 h-5" /> Entrar em Modo Demonstração
               </button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--color-text-muted)] tracking-wider uppercase">Email Corporativo</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-5 h-5 text-[var(--color-text-muted)]" />
                  <input 
                    type="email" 
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
                className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Acessar Workspace'}
              </button>
            </>
          )}
        </form>

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
