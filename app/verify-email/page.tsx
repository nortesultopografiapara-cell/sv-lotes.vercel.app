'use client';

import { useAuth } from '@/hooks/useAuth';
import { Mail, ArrowRight, ArrowRightCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function VerifyEmailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  if (loading) return null;

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--color-background)]">
      <div className="bg-[var(--color-surface)] p-12 border border-[var(--color-border)] rounded-2xl max-w-lg w-full text-center">
        <div className="w-16 h-16 bg-[#06b6d4]/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Mail className="w-8 h-8 text-[#06b6d4]" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">Verifique seu e-mail</h2>
        <p className="text-[var(--color-text-muted)] text-sm mb-8 leading-relaxed">
          Enviamos um link de confirmação para <strong className="text-white">{user?.email}</strong>. 
          Por favor, verifique sua caixa de entrada (e a pasta de spam) e clique no link para ativar sua conta e acessar o sistema.
        </p>
        
        <button 
          onClick={async () => {
             await supabase.auth.signOut();
             router.push('/login');
          }}
          className="w-full py-3 bg-[var(--color-surface-bright)] hover:bg-[var(--color-border)] text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          Voltar para login <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
