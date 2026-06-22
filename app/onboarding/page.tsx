'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SvLotesLogo } from '@/components/brand/SvLotesLogo';
import { Building2, Lock, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { DEMO_PASSWORD_BLOCKED_MESSAGE, isDemoProfile } from '@/lib/demoRestrictions';
import { DemoSensitiveNotice } from '@/components/demo/DemoSensitiveNotice';

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isDemoUser = isDemoProfile(user);
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);

  if (!user || (!user.force_password_change && user.onboarding_completed)) {
    // If not matching constraints, the layout will redirect anyway, 
    // but just return null here to prevent flashing.
    return null;
  }

  const completeOnboardingLegacy = async () => {
    setLoading(true);
    try {
      const { error: userError } = await supabase
        .from('users')
        .update({ onboarding_completed: true })
        .eq('id', user.id);

      if (userError) throw userError;
      setStep(2);
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Erro ao continuar.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isDemoUser) {
      setError(DEMO_PASSWORD_BLOCKED_MESSAGE);
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);

    try {
      // 1. Update password in Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({
        password: password
      });

      if (authError) throw authError;

      // 2. Clear the force_password_change flag in public.users and verify onboarding
      const { error: userError } = await supabase
        .from('users')
        .update({ 
           force_password_change: false,
           onboarding_completed: true 
        })
        .eq('id', user.id);

      if (userError) throw userError;

      // Success
      setStep(2);
      
      // Auto redirect after a few seconds
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 3000);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao redefinir a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex">
      {/* Left side - Visual/Brand */}
      <div className="hidden lg:flex w-1/2 bg-[var(--color-surface)] border-r border-[var(--color-border)] p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[500px] bg-[#06b6d4]/10 blur-[100px] rounded-full -translate-y-1/2 -translate-x-1/4" />
        
        <div className="relative z-10">
          <div className="mb-16">
            <SvLotesLogo size={48} showText subtitle="Gestão Imobiliária & GIS" />
          </div>

          <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-6">
            Bem-vindo ao seu <br />
            <span className="text-[#06b6d4]">novo Workspace.</span>
          </h1>
          <p className="text-lg text-[var(--color-text-muted)] max-w-md">
            Sua empresa foi cadastrada com sucesso. 
            Para garantir a segurança dos seus dados, redefina sua senha de acesso.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-4 text-sm text-[var(--color-text-muted)]">
          <ShieldCheck className="w-5 h-5 text-[var(--color-success)]" />
          <p>Ambiente seguro e isolado com criptografia end-to-end.</p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-500">
          
          {step === 1 ? (
            <>
              <div className="mb-8">
                <div className="w-12 h-12 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center mb-6 lg:hidden">
                  <Building2 className="w-6 h-6 text-[#06b6d4]" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Redefinir Senha</h2>
                <p className="text-[var(--color-text-muted)]">
                  Por favor, escolha uma nova senha segura para continuar.
                </p>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-500 text-sm flex items-start gap-3">
                  <div className="mt-0.5"><Lock className="w-4 h-4" /></div>
                  <p>{error}</p>
                </div>
              )}

              {user.force_password_change ? (
                <form onSubmit={handleUpdatePassword} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
                      Nova Senha
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                      <input 
                        type="password" 
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
                      Confirmar Senha
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                      <input 
                        type="password" 
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full mt-4 bg-[#06b6d4] hover:bg-[#0891b2] text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? "Processando..." : "Salvar e Continuar"}
                    {!loading && <ArrowRight className="w-5 h-5" />}
                  </button>
                </form>
              ) : (
                <div className="space-y-5">
                  <p className="text-[var(--color-text-muted)] mb-6 text-sm">
                    Detectamos que você é um usuário existente que foi migrado para a nova arquitetura de segurança Enterprise do SV_LOTES.
                    Nenhuma ação adicional é necessária.
                  </p>
                  <button 
                    onClick={completeOnboardingLegacy}
                    disabled={loading}
                    className="w-full mt-4 bg-[#06b6d4] hover:bg-[#0891b2] text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? "Acessando..." : "Entrar no Workspace"}
                    {!loading && <ArrowRight className="w-5 h-5" />}
                  </button>
                </div>
              )}
            </>
          ) : (
             <div className="text-center animate-in zoom-in duration-300 py-10">
                <div className="w-20 h-20 bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-10 h-10 text-[var(--color-success)]" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Tudo Pronto!</h2>
                <p className="text-[var(--color-text-muted)]">
                  Redirecionando você para o dashboard em instantes...
                </p>
                
                <div className="mt-8 flex justify-center">
                   <div className="animate-spin w-6 h-6 border-2 border-t-transparent border-[var(--color-text-muted)] rounded-full"></div>
                </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
