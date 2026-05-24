'use client';

import { useState, useEffect } from 'react';
import { Map as MapIcon, Mail, Lock, Loader2, AlertCircle, Eye, EyeOff, MapPin, FileSignature, DollarSign, TrendingUp } from 'lucide-react';
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
  }, [router]);

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
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[var(--color-background)]">
      
      {/* Left side: Hero & Features */}
      <div className="flex-1 p-8 md:p-12 lg:p-24 flex flex-col justify-center relative overflow-hidden border-r border-[#1a1f29]">
         {/* Background gradients */}
         <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--color-primary)] rounded-full mix-blend-screen filter blur-[150px] opacity-10 pointer-events-none" />
         <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[var(--color-success)] rounded-full mix-blend-screen filter blur-[180px] opacity-[0.03] pointer-events-none" />
         
         <div className="relative z-10 max-w-3xl">
           <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#11161d] border border-[#2d3340] mb-8">
             <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse shadow-[0_0_8px_rgba(242,125,38,0.8)]"></span>
             <span className="text-xs font-bold text-gray-300 tracking-wider">ECOSSISTEMA SV_LOTES</span>
           </div>

           <h1 className="text-4xl md:text-5xl lg:text-5xl xl:text-6xl font-bold tracking-tight text-white mb-6 leading-tight">
             Automatize as Vendas e a Gestão do seu Loteamento pelo <span className="text-[var(--color-primary)] relative inline-block">Mapa GIS<span className="absolute bottom-1 left-0 w-full h-2 bg-[var(--color-primary)]/20 -z-10 rounded"></span></span>
           </h1>
           
           <p className="text-lg md:text-xl text-[var(--color-text-muted)] mb-12 leading-relaxed max-w-2xl">
             A plataforma definitiva para loteadoras. Do clique no lote ao contrato assinado, comissões e financeiro integrados em tempo real.
           </p>

           <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
             {/* Feature 1 */}
             <div className="bg-[#11161d] border border-teal-500/20 p-5 rounded-2xl flex items-start gap-4 hover:border-teal-500/40 transition-colors">
               <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0 border border-teal-500/20">
                 <MapPin className="w-6 h-6 text-teal-400" />
               </div>
               <div>
                 <h3 className="text-white font-bold mb-1 text-base">Mapa GIS Interativo & Clique-Venda</h3>
                 <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">Visualização dinâmica do status. O corretor clica e inicia a venda ou reserva instantaneamente do campo.</p>
               </div>
             </div>

             {/* Feature 2 */}
             <div className="bg-[#11161d] border border-blue-500/20 p-5 rounded-2xl flex items-start gap-4 hover:border-blue-500/40 transition-colors">
               <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
                 <FileSignature className="w-6 h-6 text-blue-400" />
               </div>
               <div>
                 <h3 className="text-white font-bold mb-1 text-base">Contratos Automáticos</h3>
                 <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">Geração imediata do instrumento particular com envio automatizado para assinatura digital no WhatsApp.</p>
               </div>
             </div>

             {/* Feature 3 */}
             <div className="bg-[#11161d] border border-orange-500/20 p-5 rounded-2xl flex items-start gap-4 hover:border-orange-500/40 transition-colors">
               <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
                 <DollarSign className="w-6 h-6 text-orange-400" />
               </div>
               <div>
                 <h3 className="text-white font-bold mb-1 text-base">Comissões de Corretores</h3>
                 <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">Controle automático do extrato comercial, níveis de equipe e liberação de comissões pagas e pendentes.</p>
               </div>
             </div>

             {/* Feature 4 */}
             <div className="bg-[#11161d] border border-green-500/20 p-5 rounded-2xl flex items-start gap-4 hover:border-green-500/40 transition-colors">
               <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0 border border-green-500/20">
                 <TrendingUp className="w-6 h-6 text-green-400" />
               </div>
               <div>
                 <h3 className="text-white font-bold mb-1 text-base">Módulo Financeiro & VGV</h3>
                 <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">Métrica de parcelas, controle de caixa, recebidos, saldo a receber, índice de inadimplência e gráficos.</p>
               </div>
             </div>
           </div>
         </div>
      </div>

      {/* Right side: Login Form */}
      <div className="w-full lg:w-[480px] xl:w-[540px] bg-[#0A0D14] flex flex-col justify-center p-8 md:p-12 relative shadow-[-20px_0_40px_rgba(0,0,0,0.4)]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[var(--color-primary)] rounded-full mix-blend-screen filter blur-[150px] opacity-5 pointer-events-none" />

        <div className="w-full max-w-sm mx-auto relative z-10">
          <div className="flex flex-col items-center justify-center mb-10">
            <div className="w-16 h-16 bg-[var(--color-primary)]/10 rounded-2xl flex items-center justify-center mb-4 text-[var(--color-primary)] border border-[var(--color-primary)]/20 shadow-[0_0_15px_rgba(242,125,38,0.2)]">
              <MapIcon className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white mb-2 text-center">Acesso ao Sistema</h2>
            <p className="text-sm text-[var(--color-text-muted)] text-center leading-relaxed">
              Área exclusiva para Loteadoras, Imobiliárias e Corretores Parceiros.
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
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 tracking-wider uppercase">Email Corporativo</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#11161d] border border-[#2d3340] rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all placeholder:text-gray-600"
                    placeholder="nome@svtopografiaeprojetos.com.br"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-400 tracking-wider uppercase">Senha</label>
                  <a href="#" className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium transition-colors">Esqueci a senha</a>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                  <input 
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#11161d] border border-[#2d3340] rounded-xl py-3 pl-10 pr-10 text-white focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all placeholder:text-gray-600"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-white transition-colors focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_4px_14px_0_rgba(242,125,38,0.39)] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Acessar Workspace'}
              </button>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-[#1a1f29] text-center">
             <p className="text-[11px] font-medium text-gray-500 mb-1">
               Tecnologia exclusiva SV Topografia & Projetos
             </p>
             <p className="text-[10px] text-gray-600">
               © {new Date().getFullYear()} Norte Sul Topografia. Todos os direitos reservados.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
