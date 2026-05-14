'use client';

import { useState } from 'react';
import { Map as MapIcon, Mail, Lock, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('severino@nortesultopografia.com.br');
  const [password, setPassword] = useState('superadmin123');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // MOCK LOGIN FOR NOW ALTHOUGH IT REQUIRED FULL AUTH.
    // If Supabase is connected we would call supabase.auth.signInWithPassword
    setTimeout(() => {
      localStorage.setItem('sv_lotes_auth', 'true');
      setLoading(false);
      router.push('/');
    }, 1000);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--color-background)] p-4 relative overflow-hidden">
      {/* Cool atmospheric background for login */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-primary)] rounded-full mix-blend-screen filter blur-[120px] opacity-20 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--color-success)] rounded-full mix-blend-screen filter blur-[120px] opacity-10" />

      <div className="w-full max-w-md bg-[var(--color-surface)]/80 backdrop-blur-xl rounded-2xl border border-[var(--color-border)] shadow-2xl p-8 transform transition-all relative z-10">
        
        <div className="flex flex-col items-center justify-center mb-10">
          <div className="w-16 h-16 bg-[var(--color-primary)]/10 rounded-2xl flex items-center justify-center mb-4 text-[var(--color-primary)] border border-[var(--color-primary)]/20 shadow-[0_0_15px_rgba(242,125,38,0.2)]">
            <MapIcon className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">SV_LOTES</h1>
          <p className="text-sm text-[var(--color-text-muted)] font-mono text-center uppercase tracking-widest">
            Gestão & GIS
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
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
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-[0_4px_14px_0_rgba(242,125,38,0.39)]"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Acessar Workspace'}
          </button>
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
