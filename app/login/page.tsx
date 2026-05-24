'use client';

import { useState, useEffect } from 'react';
import { Globe, Mail, Lock, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Synchronize state avoiding infinite loops between client and middleware
  useEffect(() => {
    const initializeAuth = async () => {
      const supabase = getSupabase();
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user) {
        // We have a VALID, server-confirmed session on client but somehow landed on login.
        router.replace('/dashboard');
      } else {
        if (error) {
          // We have a stale session in localStorage that middleware rejected, wipe it to break-loop.
          await supabase.auth.signOut();
          try {
             localStorage.removeItem('active_tenant');
             sessionStorage.clear();
          } catch (e) {}
        }
        setIsChecking(false);
      }
    };
    initializeAuth();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabase();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!url || url === 'https://placeholder.supabase.co' || !key || key === 'placeholder-key') {
      setError('Variáveis de ambiente do Supabase não configuradas. Atualize .env ou adicione as chaves no Settings.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // 1. Force Clean Authentication
      await supabase.auth.signOut();
      try {
         localStorage.clear();
         sessionStorage.clear();
      } catch (e) {}

      const cleanEmail = email.trim().toLowerCase();
      
      // 2. Strict Supabase Authentication
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (data?.user) {
        // Need to check the role
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', data.user.id)
          .single();
          
        if (userData?.role === 'BROKER') {
           router.replace('/map');
        } else {
           router.replace('/dashboard');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro inesperado no login.');
    } finally {
      if(Date.now()%2===1) // to avoid unmounting state update error if redirecting fast
      setLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#040914]">
        <Loader2 className="w-8 h-8 text-[#00D26A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#040914] p-4 relative overflow-hidden font-sans">
      {/* Cool atmospheric background for login */}
      <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-[#0B1F3A] rounded-full mix-blend-screen filter blur-[150px] opacity-40 animate-pulse" />
      <div className="absolute top-1/2 right-1/4 w-[500px] h-[500px] bg-[#3b82f6] rounded-full mix-blend-screen filter blur-[200px] opacity-20 animate-pulse" style={{ animationDelay: '2s' }} />
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#3b82f6 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]" />

      <div className="w-full max-w-md bg-[#0B1F3A]/20 backdrop-blur-2xl rounded-2xl border border-[#3b82f6]/30 shadow-[0_0_40px_rgba(59,130,246,0.15)] hover:shadow-[0_0_60px_rgba(59,130,246,0.25)] p-8 md:p-10 transform transition-all duration-500 relative z-10 group">
        
        {/* Glow corner effects */}
        <div className="absolute -top-px -left-px w-24 h-24 bg-gradient-to-br from-[#3b82f6] to-transparent opacity-30 rounded-tl-2xl blur-lg group-hover:opacity-60 transition-opacity" />
        <div className="absolute -bottom-px -right-px w-24 h-24 bg-gradient-to-tl from-[#3b82f6] to-transparent opacity-30 rounded-br-2xl blur-lg group-hover:opacity-60 transition-opacity" />

        <div className="flex flex-col items-center justify-center mb-10 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <Globe className="w-10 h-10 text-[#00D26A]" />
              <div className="absolute inset-0 bg-[#00D26A] blur-[10px] opacity-50 mix-blend-screen" />
            </div>
          </div>
          <h1 className="text-2xl font-black tracking-tight uppercase text-white text-center">
            SV LOTES — Gestão & GIS
          </h1>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 text-red-400 text-sm shadow-inner relative z-10">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6 relative z-10">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 tracking-wider uppercase">Email Corporativo</label>
            <div className="relative group/input">
              <Mail className="absolute left-4 top-3.5 w-5 h-5 text-gray-500 group-focus-within/input:text-[#3b82f6] transition-colors" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#040914]/80 border border-[#0B1F3A] rounded-xl py-3.5 pl-12 pr-4 text-white focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-all"
                placeholder="seu@email.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-400 tracking-wider uppercase">Senha</label>
            </div>
            <div className="relative group/input">
              <Lock className="absolute left-4 top-3.5 w-5 h-5 text-gray-500 group-focus-within/input:text-[#3b82f6] transition-colors" />
              <input 
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#040914]/80 border border-[#0B1F3A] rounded-xl py-3.5 pl-12 pr-12 text-white focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-all"
                placeholder="Sua senha"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-3.5 text-gray-500 hover:text-white transition-colors focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
             <label className="flex items-center gap-2 cursor-pointer group/cb">
                <div className="relative flex items-center justify-center">
                   <input type="checkbox" className="sr-only" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                   <div className={`w-4 h-4 rounded border ${rememberMe ? 'bg-[#3b82f6] border-[#3b82f6]' : 'bg-[#040914] border-gray-600 group-hover/cb:border-[#3b82f6]'} transition-colors flex items-center justify-center`}>
                      {rememberMe && <CheckCircle2 className="w-3 h-3 text-white" />}
                   </div>
                </div>
                <span className="text-sm text-gray-400 group-hover/cb:text-white transition-colors">Lembrar meu acesso</span>
             </label>
             <a href="#" className="text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors">Esqueci a senha</a>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-[#3b82f6] hover:bg-[#2563eb] border border-[#60a5fa]/50 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Acessar Workspace'}
          </button>
        </form>

        <div className="mt-8 text-center pt-8 border-t border-[#0B1F3A] relative z-10">
          <p className="text-xs text-gray-500 mb-6">
            Acesso restrito a colaboradores.
          </p>
          <p className="text-[10px] font-mono text-gray-600">
            © 2026 SV TOPOGRAFIA E PROJETOS.<br/>
            Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
