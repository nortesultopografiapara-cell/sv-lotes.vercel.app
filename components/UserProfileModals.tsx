'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Lock, User, Shield, X, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';

export function UserProfileModals({ user, company, activeModal, setActiveModal }: { user: any, company: any, activeModal: 'profile' | 'password' | 'security' | null, setActiveModal: (v: any) => void }) {
  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const [sessionInfo, setSessionInfo] = useState<any>(null);

  useEffect(() => {
    if (activeModal === 'security') {
      supabase.auth.getSession().then(({ data }) => {
        setSessionInfo({
          lastSignIn: user?.last_sign_in_at || new Date().toISOString(),
          email: data.session?.user?.email || user?.email,
          status: 'Ativa'
        });
        console.log("USER_SECURITY_MODAL_OPENED");
      });
    } else if (activeModal === 'profile') {
      console.log("USER_PROFILE_MODAL_OPENED");
    }
  }, [activeModal, user]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) {
      setPasswordError('A senha atual é obrigatória.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('As novas senhas não conferem.');
      return;
    }

    try {
      setIsUpdatingPassword(true);
      console.log("USER_PASSWORD_CHANGE_STARTED");

      // Verify current password by trying to sign in again
      const email = user?.email;
      if (!email) throw new Error("Email não encontrado.");

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword
      });

      if (signInError) {
        throw new Error("Senha atual incorreta.");
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        throw updateError;
      }

      console.log("USER_PASSWORD_CHANGE_SUCCESS");
      setPasswordSuccess('Senha alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      setTimeout(() => {
        setActiveModal(null);
        setPasswordSuccess('');
      }, 2000);

    } catch (err: any) {
      console.log("USER_PASSWORD_CHANGE_FAILED", err);
      setPasswordError(err.message || 'Erro ao alterar senha.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const closeModal = () => {
    setActiveModal(null);
    setPasswordError('');
    setPasswordSuccess('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  if (!activeModal) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-[#121318] border border-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#151a23]">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            {activeModal === 'profile' && <><User className="w-5 h-5 text-[var(--color-primary)]"/> Meu Perfil</>}
            {activeModal === 'password' && <><Lock className="w-5 h-5 text-[var(--color-primary)]"/> Alterar Senha</>}
            {activeModal === 'security' && <><Shield className="w-5 h-5 text-emerald-400"/> Segurança</>}
          </h2>
          <button onClick={closeModal} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          
          {activeModal === 'profile' && (
            <div className="space-y-4">
               <div className="flex flex-col items-center mb-6">
                  <div className="w-20 h-20 rounded-full bg-[var(--color-primary)]/20 border border-[var(--color-primary)] flex items-center justify-center text-[var(--color-primary)] font-bold text-3xl shadow-lg uppercase">
                    {company?.name?.charAt(0) || user?.name?.charAt(0) || 'U'}
                  </div>
                  <h3 className="mt-4 text-xl font-bold text-white">{company?.razao_social || company?.name || user?.name}</h3>
                  <p className="text-sm text-gray-400">{user?.email}</p>
               </div>
               
               <div className="space-y-3">
                 <div className="flex justify-between items-center py-2 border-b border-gray-800/50">
                    <span className="text-gray-400 text-sm">CNPJ/Doc</span>
                    <span className="text-white text-sm font-medium">{company?.cnpj || company?.document || '-'}</span>
                 </div>
                 <div className="flex justify-between items-center py-2 border-b border-gray-800/50">
                    <span className="text-gray-400 text-sm">Telefone</span>
                    <span className="text-white text-sm font-medium">{company?.phone || '-'}</span>
                 </div>
                 <div className="flex justify-between items-center py-2 border-b border-gray-800/50">
                    <span className="text-gray-400 text-sm">Plano Atual</span>
                    <span className="bg-[#06b6d4]/10 text-[#06b6d4] px-2 py-0.5 rounded text-xs font-bold border border-[#06b6d4]/20">{company?.plan || 'Standard'}</span>
                 </div>
                 <div className="flex justify-between items-center py-2">
                    <span className="text-gray-400 text-sm">Data de Cadastro</span>
                    <span className="text-white text-sm font-medium">{new Date(user?.created_at).toLocaleDateString('pt-BR')}</span>
                 </div>
               </div>
               
               <div className="mt-6">
                  <p className="text-xs text-center text-gray-500">Para editar os dados da empresa, acesse as Configurações Geriais.</p>
               </div>
            </div>
          )}

          {activeModal === 'password' && (
            <form onSubmit={handlePasswordChange} className="space-y-5">
               {passwordError && (
                 <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 flex items-center gap-2">
                   <AlertCircle className="w-4 h-4 shrink-0" /> {passwordError}
                 </div>
               )}
               {passwordSuccess && (
                 <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-400 flex items-center gap-2">
                   <Shield className="w-4 h-4 shrink-0" /> {passwordSuccess}
                 </div>
               )}
               
               <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Senha Atual</label>
                  <div className="relative">
                     <input
                       type={showPasswords ? 'text' : 'password'}
                       value={currentPassword}
                       onChange={e => setCurrentPassword(e.target.value)}
                       className="w-full bg-[#1a1f29] border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
                       placeholder="Digite sua senha atual"
                       autoComplete="current-password"
                     />
                     <button type="button" onClick={() => setShowPasswords(!showPasswords)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                        {showPasswords ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                     </button>
                  </div>
               </div>
               
               <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Nova Senha</label>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-[#1a1f29] border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                  />
               </div>
               
               <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Confirmar Nova Senha</label>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full bg-[#1a1f29] border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
                    placeholder="Repita a nova senha"
                    autoComplete="new-password"
                  />
               </div>
               
               <div className="flex gap-3 pt-4 border-t border-gray-800">
                  <button type="button" onClick={closeModal} className="flex-1 px-4 py-2 bg-transparent border border-gray-700 hover:bg-[#1a1f29] text-gray-300 rounded-lg font-medium transition-colors">
                     Cancelar
                  </button>
                  <button type="submit" disabled={isUpdatingPassword} className="flex-1 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                     {isUpdatingPassword ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Atualizar Senha'}
                  </button>
               </div>
            </form>
          )}

          {activeModal === 'security' && (
            <div className="space-y-5">
               <div className="p-4 bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 rounded-xl flex items-start gap-3">
                 <Shield className="w-5 h-5 text-[var(--color-primary)] shrink-0 mt-0.5" />
                 <div>
                   <h4 className="text-sm font-bold text-white mb-1">Sua conta está segura</h4>
                   <p className="text-xs text-gray-400">Suas permissões e sessão atual estão ativas e monitoradas.</p>
                 </div>
               </div>
               
               <div className="space-y-3 pt-2">
                 <div className="flex flex-col py-2 border-b border-gray-800/50">
                    <span className="text-gray-400 text-xs uppercase tracking-wider mb-1">Email de Autenticação</span>
                    <span className="text-white text-sm">{sessionInfo?.email || '-'}</span>
                 </div>
                 <div className="flex justify-between items-center py-2 border-b border-gray-800/50">
                    <span className="text-gray-400 text-xs uppercase tracking-wider">Status da Conta</span>
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-xs font-bold border border-emerald-500/20">{sessionInfo?.status || '-'}</span>
                 </div>
                 <div className="flex justify-between items-center py-2 border-b border-gray-800/50">
                    <span className="text-gray-400 text-xs uppercase tracking-wider">Sessão</span>
                    <span className="text-gray-300 text-sm">Dispositivo atual</span>
                 </div>
                 <div className="flex justify-between items-center py-2 border-b border-gray-800/50">
                    <span className="text-gray-400 text-xs uppercase tracking-wider">Último Login</span>
                    <span className="text-gray-300 text-sm">{sessionInfo?.lastSignIn ? new Date(sessionInfo.lastSignIn).toLocaleString('pt-BR') : '-'}</span>
                 </div>
               </div>
               
               <div className="pt-4 space-y-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Futuros Recursos</h4>
                  <button disabled className="w-full flex items-center justify-between p-3 bg-[#1a1f29] border border-gray-800 rounded-lg opacity-50 cursor-not-allowed">
                     <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-300">Autenticação 2 Fatores (2FA)</span>
                     </div>
                     <span className="text-[10px] bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">Em breve</span>
                  </button>
                  <button disabled className="w-full flex items-center justify-between p-3 bg-[#1a1f29] border border-gray-800 rounded-lg opacity-50 cursor-not-allowed">
                     <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-300">Logs de Acesso de Dispositivos</span>
                     </div>
                     <span className="text-[10px] bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">Em breve</span>
                  </button>
               </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
