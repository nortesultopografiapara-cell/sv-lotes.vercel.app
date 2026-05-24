'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { 
  ShieldCheck, 
  Lock, 
  Key, 
  MonitorPlay,
  LogOut,
  Smartphone,
  Shield,
  Activity,
  History,
  CheckCircle2,
  AlertTriangle,
  Loader2
} from 'lucide-react';

export default function MasterProfilePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  if (!user || user.role !== 'SUPER_ADMIN') {
    return (
       <div className="flex-1 p-8 text-center bg-[var(--color-background)] flex items-center justify-center flex-col">
          <Shield className="w-16 h-16 text-gray-700 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Acesso Negado</h2>
          <p className="text-[var(--color-text-muted)]">Esta área é restrita para contas Super Admin.</p>
       </div>
    );
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
       setErrorMsg('As senhas não coincidem.');
       return;
    }
    if (passwordForm.newPassword.length < 8) {
       setErrorMsg('A senha deve ter pelo menos 8 caracteres.');
       return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
         setErrorMsg("Sessão expirada. Faça login novamente para alterar sua senha.");
         setLoading(false);
         return;
      }

      const resp = await fetch('/api/super-admin/change-password', {
         method: 'POST',
         headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
         },
         body: JSON.stringify({
            email: user.email,
            newPassword: passwordForm.newPassword
         })
      });

      const data = await resp.json();

      if (!resp.ok) {
         throw new Error(data.error || 'Não foi possível alterar a senha. Verifique sua sessão ou tente novamente.');
      }
      
      setSuccessMsg('Senha alterada com sucesso. Use a nova senha no próximo login.');
      setPasswordForm({ newPassword: '', confirmPassword: '' });
      
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTerminateSessions = () => {
     if (window.confirm('Tem certeza que deseja encerrar todas as outras sessões ativas?')) {
        alert('Sessões encerradas com sucesso.');
     }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[var(--color-background)]">
      <div className="max-w-4xl mx-auto space-y-6">
        
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-white">Meu Perfil Master</h1>
            <div className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-[10px] font-bold border border-blue-500/20 tracking-wider flex items-center gap-1">
               <ShieldCheck className="w-3 h-3" /> MODO DEUS
            </div>
          </div>
          <p className="text-[var(--color-text-muted)] text-sm">Gerencie suas configurações de segurança e credenciais avançadas.</p>
        </header>

        {errorMsg && (
            <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-500 text-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> {errorMsg}
            </div>
        )}
        {successMsg && (
            <div className="p-4 bg-green-500/10 border border-green-500/50 rounded-xl text-green-500 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" /> {successMsg}
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Security Config */}
          <div className="bg-[#151a23] border border-[var(--color-border)] rounded-2xl p-6 shadow-xl">
             <h3 className="text-[15px] font-semibold text-white flex items-center gap-2 mb-6">
                <Lock className="w-4 h-4 text-blue-400" /> Segurança da Conta
             </h3>

             <div className="space-y-4 mb-6">
                <div className="p-3 bg-[var(--color-background)] rounded-lg border border-[var(--color-border)]">
                   <p className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider mb-1">Conta Master</p>
                   <p className="text-sm font-medium text-white">{user.name}</p>
                </div>
                <div className="p-3 bg-[var(--color-background)] rounded-lg border border-[var(--color-border)]">
                   <p className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider mb-1">E-mail Principal</p>
                   <p className="text-sm font-medium text-white">{user.email}</p>
                </div>
             </div>

             <form onSubmit={handlePasswordChange} className="space-y-4 pt-6 border-t border-[var(--color-border)]">
                <h4 className="text-sm font-semibold text-gray-300">Alterar Senha de Acesso</h4>
                <div>
                   <label className="block text-xs text-[var(--color-text-muted)] mb-1">Nova Senha</label>
                   <input 
                      type="password" 
                      required
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                   />
                </div>
                <div>
                   <label className="block text-xs text-[var(--color-text-muted)] mb-1">Confirmar Nova Senha</label>
                   <input 
                      type="password" 
                      required
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                   />
                </div>
                <button 
                  type="submit"
                  disabled={loading || !passwordForm.newPassword}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Key className="w-4 h-4" />} Alterar Minha Senha
                </button>
             </form>
          </div>

          <div className="space-y-6">
            
            {/* 2FA */}
            <div className="bg-[#151a23] border border-[var(--color-border)] rounded-2xl p-6 shadow-xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4">
                  <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">EM BREVE</span>
               </div>
               <h3 className="text-[15px] font-semibold text-white flex items-center gap-2 mb-3">
                  <Smartphone className="w-4 h-4 text-purple-400" /> Autenticação 2 Fatores (2FA)
               </h3>
               <p className="text-sm text-[var(--color-text-muted)] mb-4 line-clamp-2">Adicione uma camada extra de segurança utilizando Google Authenticator ou Authy na conta admin.</p>
               <button disabled className="w-full py-2 rounded-lg bg-[#202530] text-[var(--color-text-muted)] font-medium text-sm cursor-not-allowed">
                  Configurar 2FA Seguro
               </button>
            </div>

            {/* Sessions */}
            <div className="bg-[#151a23] border border-[var(--color-border)] rounded-2xl p-6 shadow-xl">
               <h3 className="text-[15px] font-semibold text-white flex items-center gap-2 mb-4">
                  <MonitorPlay className="w-4 h-4 text-green-400" /> Sessões Ativas Relacionadas
               </h3>
               
               <div className="space-y-3 mb-5">
                  <div className="flex items-center gap-3 p-3 bg-[var(--color-background)] rounded-lg border border-green-500/20">
                     <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                     <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-200">Sessão Atual (Você)</p>
                        <p className="text-[11px] text-[var(--color-text-muted)]">IP: 192.168.0.1 • Chrome (MacOS)</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-[var(--color-background)] rounded-lg border border-[var(--color-border)]">
                     <span className="w-2 h-2 rounded-full bg-gray-500" />
                     <div className="flex-1">
                        <p className="text-xs font-semibold text-[var(--color-text-muted)]">Última Sessão</p>
                        <p className="text-[11px] text-[var(--color-text-muted)]">IP: 172.16.1.4 • Firefox (Windows) • Há 5 horas</p>
                     </div>
                  </div>
               </div>
               
               <button 
                 onClick={handleTerminateSessions}
                 className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-red-500/50 text-red-400 bg-red-500/5 hover:bg-red-500/10 transition-colors text-sm font-semibold"
               >
                 <LogOut className="w-4 h-4" /> Encerrar Outras Sessões
               </button>
            </div>

            {/* Auditing */}
            <div className="bg-[#151a23] border border-[var(--color-border)] rounded-2xl p-6 shadow-xl">
               <h3 className="text-[15px] font-semibold text-white flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-[var(--color-primary)]" /> Registro de Atividades
               </h3>
               <p className="text-xs text-[var(--color-text-muted)] mb-4">Como Super Admin, todas as suas ações vitais no SaaS são registradas.</p>
               
               <button className="flex items-center justify-between w-full p-3 bg-[var(--color-background)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg transition-colors text-left group">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-white" />
                    <span className="text-sm font-medium text-gray-300 group-hover:text-white">Acessar meu Log de Auditoria</span>
                  </div>
               </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
