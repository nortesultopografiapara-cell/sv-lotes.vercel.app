'use client';

import { useState, useEffect } from 'react';
import { Globe, Mail, Lock, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    console.log('LOGIN START - Initiating auth process...');
    
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
        console.error('Erro detalhado do Auth:', authError);
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (data?.user) {
        console.log('LOGIN SUCCESS. Checking role for redirection...');
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
      console.error('LOGIN EXCEPTION:', err);
      setError(err.message || 'Ocorreu um erro inesperado no login.');
    } finally {
      setLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#06090e]">
        <Loader2 className="w-8 h-8 text-[#2563eb] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#06090e] p-4 relative overflow-hidden font-sans">
      {/* Cool atmospheric background for login */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#2563eb] rounded-full mix-blend-screen filter blur-[150px] opacity-10 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-[#10b981] rounded-full mix-blend-screen filter blur-[150px] opacity-10" />

      <div className="w-full max-w-md bg-[#0a0d14]/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-8 transform transition-all relative z-10">
        
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-10 h-10 text-[#10b981]" />
            <span className="text-3xl font-black tracking-tight uppercase text-white">SV<span className="text-[#60a5fa]">_LOTES</span></span>
          </div>
          <p className="text-sm text-gray-400 font-mono text-center uppercase tracking-widest">
            Gestão & GIS
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-500 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 tracking-wider uppercase">Email Corporativo</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#11161d] border border-white/10 rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] transition-all"
                placeholder="nome@svtopografia.com.br"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-400 tracking-wider uppercase">Senha</label>
              <a href="#" className="text-xs text-[#60a5fa] hover:text-[#2563eb] transition-colors">Esqueci a senha</a>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
              <input 
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#11161d] border border-white/10 rounded-lg py-3 pl-10 pr-10 text-white focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] transition-all"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-500 hover:text-white transition-colors focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#2563eb] to-[#3b82f6] hover:opacity-90 text-white font-bold py-3 rounded-lg transition-opacity flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Acessar Workspace'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/10 text-center">
          <p className="text-[10px] font-mono text-gray-500">
            Acesso restrito a colaboradores.<br/>
            SV TOPOGRAFIA E PROJETOS © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
