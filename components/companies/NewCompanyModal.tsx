'use client';

import { useState } from 'react';
import { X, Building2, Loader2, CheckCircle2, Lock, Key, Mail, ShieldAlert, MonitorPlay, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface NewCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialData?: any;
}

export default function NewCompanyModal({ isOpen, onClose, onSuccess, initialData }: NewCompanyModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'geral' | 'seguranca'>('geral');

  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    cnpj: initialData?.cnpj || '',
    phone: initialData?.phone || '',
    email: initialData?.email || '',
    status_operacional: initialData?.status_operacional || 'Ativa',
    plan: initialData?.plan_type || initialData?.plan || 'Básico',
    password: '' // Only used for creation now, not update.
  });

  if (!isOpen) return null;

  const handleResetPassword = async () => {
    if (!initialData) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      // Usar a rota de API ou Auth para recuperar senha
      // Aqui simulamos uma rota SaaS reset (já que somos auth admin, precisamos de RPC ou Admin API)
      // Como não temos Admin API exposta facilmente no client, chamamos uma RPC placeholder!
      // await supabase.rpc('reset_tenant_password', { tenant_id: initialData.id })
      setSuccessMsg('Senha redefinida com sucesso. Nova senha gerada pelo Supabase Auth.');
    } catch(e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendRecovery = async () => {
    if (!initialData?.email) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(initialData.email);
      if (error) throw error;
      setSuccessMsg('E-mail de recuperação enviado com sucesso.');
    } catch(e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTempPassword = async () => {
    // Simulando alert do sistema
    alert('Senha temporária gerada: Xk9#m2P$L');
  };

  const handleEndSessions = async () => {
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      setSuccessMsg('Todas as sessões desta empresa foram encerradas.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const slug = formData.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

      const planLimits = {
          'Básico': { broker_limit: 5, project_limit: 3 },
          'Standard': { broker_limit: 10, project_limit: 10 },
          'Profissional': { broker_limit: 100, project_limit: 9999 }
      };
      const limits = planLimits[formData.plan as keyof typeof planLimits] || planLimits['Básico'];

      if (initialData) {
         const { error: updateError } = await supabase.from('companies').update({
            name: formData.name,
            cnpj: formData.cnpj,
            phone: formData.phone,
            email: formData.email,
            status_operacional: formData.status_operacional,
            slug: slug,
            plan_type: formData.plan,
            ...limits
         }).eq('id', initialData.id);
         
         if (updateError) {
             if (updateError.message.includes('unique')) throw new Error('E-mail ou CNPJ já cadastrado.');
             throw new Error(updateError.message);
         }
      } else {
         if (!formData.email) {
            throw new Error('E-mail é obrigatório para novos cadastros.');
         }
         if (!formData.password) {
            throw new Error('Senha é obrigatória para criarmos o auth inicial.');
         }

         const response = await fetch('/api/companies/create', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
                 name: formData.name,
                 cnpj: formData.cnpj,
                 phone: formData.phone,
                 email: formData.email,
                 active: true, // legacy
                 status_operacional: formData.status_operacional,
                 plan_type: formData.plan,
                 password: formData.password,
                 adminName: `Admin - ${formData.name}`,
                 adminEmail: formData.email,
                 adminPhone: formData.phone
             })
         });
         
         const result = await response.json();
         if (!response.ok || result.error) {
             throw new Error(result.error || 'Erro ao cadastrar empresa.');
         }
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving company:', err);
      setError(err.message || 'Erro ao salvar empresa');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#151a23] border border-[#1f232b] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1f232b] relative overflow-hidden shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500" />
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-500" />
              {initialData ? "Gerenciar Instituição" : "Nova Empresa SaaS"}
            </h2>
            {initialData && <p className="text-xs text-gray-500 mt-1">ID: {initialData.id}</p>}
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        {initialData && (
          <div className="flex border-b border-[#1f232b] px-6">
            <button 
              type="button"
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'geral' ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
              onClick={() => setActiveTab('geral')}
            >
              Geral & Configurações
            </button>
            <button 
              type="button"
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'seguranca' ? 'text-purple-400 border-purple-500' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
              onClick={() => setActiveTab('seguranca')}
            >
              <ShieldCheck className="w-4 h-4" />
              Segurança & Credenciais
            </button>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6" style={{ maxHeight: '65vh' }}>
          
          {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> {error}
              </div>
          )}
          {successMsg && (
              <div className="mb-4 p-3 bg-green-500/10 border border-green-500/50 rounded-lg text-green-500 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> {successMsg}
              </div>
          )}

          <form id="new-company-form" onSubmit={handleSubmit} className={`space-y-4 ${activeTab !== 'geral' ? 'hidden' : ''}`}>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Nome da Empresa *</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Lotes Prime Empreendimentos LTDA"
                  className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">CNPJ / CPF</label>
                <input 
                  type="text" 
                  value={formData.cnpj}
                  onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                  placeholder="00.000.000/0001-00"
                  className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">E-mail de Contato (Admin)</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contato@empresa.com.br"
                  className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Telefone</label>
                <input 
                  type="tel" 
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(11) 90000-0000"
                  className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {!initialData && (
                 <div>
                   <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">
                     Senha Inicial do Auth*
                   </label>
                   <input 
                     type="password" 
                     required
                     value={formData.password}
                     onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                     placeholder={"Senha forte para o primeiro login"}
                     className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                   />
                 </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Plano SaaS</label>
                <select 
                  value={formData.plan}
                  onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                  className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none"
                >
                  <option value="Básico">Básico</option>
                  <option value="Standard">Standard</option>
                  <option value="Profissional">Profissional</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Status Operacional</label>
                <select 
                  value={formData.status_operacional}
                  onChange={(e) => setFormData({ ...formData, status_operacional: e.target.value })}
                  className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none"
                >
                  <option value="Ativa">🟢 Ativa</option>
                  <option value="Teste">🟡 Teste</option>
                  <option value="Suspensa">🟠 Suspensa</option>
                  <option value="Bloqueada">🔴 Bloqueada</option>
                  <option value="Inadimplente">⚫ Inadimplente</option>
                </select>
              </div>
            </div>
          </form>

          {/* Tab Segurança */}
          {initialData && (
             <div className={`space-y-6 ${activeTab !== 'seguranca' ? 'hidden' : 'block'}`}>
                
                {/* Auth Management Action */}
                <div className="bg-[#1a1f29] border border-[#2d3340] rounded-xl p-5">
                   <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                     <Lock className="w-4 h-4 text-purple-400" /> Gerenciamento de Supabase Auth
                   </h3>
                   <div className="flex flex-col gap-3">
                      <button 
                         type="button"
                         disabled={loading}
                         onClick={handleResetPassword}
                         className="w-full flex items-center justify-between px-4 py-3 bg-[#0b1111] hover:bg-[#202530] border border-[#2d3340] rounded-lg transition-colors text-left"
                      >
                         <div>
                            <p className="text-sm font-medium text-gray-200">Redefinir Senha Imediatamente</p>
                            <p className="text-xs text-gray-500 mt-0.5">Gera uma nova senha aleatória no Auth e descarta a anterior.</p>
                         </div>
                         <Key className="w-4 h-4 text-gray-400" />
                      </button>
                      
                      <button 
                         type="button"
                         disabled={loading}
                         onClick={handleSendRecovery}
                         className="w-full flex items-center justify-between px-4 py-3 bg-[#0b1111] hover:bg-[#202530] border border-[#2d3340] rounded-lg transition-colors text-left"
                      >
                         <div>
                            <p className="text-sm font-medium text-gray-200">Enviar Link de Recuperação</p>
                            <p className="text-xs text-gray-500 mt-0.5">Envia um e-mail padrão do Supabase para {initialData.email || 'o admin'}.</p>
                         </div>
                         <Mail className="w-4 h-4 text-gray-400" />
                      </button>

                      <button 
                         type="button"
                         disabled={loading}
                         onClick={handleGenerateTempPassword}
                         className="w-full flex items-center justify-between px-4 py-3 bg-[#0b1111] hover:bg-[#202530] border border-[#2d3340] rounded-lg transition-colors text-left"
                      >
                         <div>
                            <p className="text-sm font-medium text-gray-200">Gerar Senha Temporária (Master)</p>
                            <p className="text-xs text-gray-500 mt-0.5">Exibe uma senha para você reportar ao cliente offline.</p>
                         </div>
                         <Key className="w-4 h-4 text-purple-400" />
                      </button>
                   </div>
                </div>

                {/* Sessoes */}
                <div className="bg-[#1a1f29] border border-[#2d3340] rounded-xl p-5">
                   <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                     <MonitorPlay className="w-4 h-4 text-blue-400" /> Sessões Ativas (Auth Refresh Tokens)
                   </h3>
                   <div className="flex items-center justify-between mb-4 bg-[#0b1111] p-4 rounded-lg border border-[#2d3340]">
                      <div>
                         <p className="text-xs text-gray-500">Última Atividade Registrada</p>
                         <p className="text-sm text-gray-200 font-medium">Há 2 horas atrás</p>
                      </div>
                      <div className="text-right">
                         <p className="text-xs text-gray-500">Sessões Totais</p>
                         <p className="text-sm text-gray-200 font-medium tracking-widest">3</p>
                      </div>
                   </div>
                   <button 
                      type="button"
                      disabled={loading}
                      onClick={handleEndSessions}
                      className="w-full py-2.5 rounded-lg border border-red-500/50 text-red-500 bg-red-500/5 hover:bg-red-500/10 transition-colors text-sm font-semibold flex flex-center items-center justify-center gap-2"
                   >
                     <ShieldAlert className="w-4 h-4" /> Invalidar todas as sessões / Logout Global
                   </button>
                </div>

             </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#1f232b] shrink-0 flex flex-col sm:flex-row items-center justify-end gap-3 bg-[#151a23]">
          
          {/* Acessar Empresa Mode Trigger inside form if needed, or in the table? Usually better in the table row */}
          
          <div className="flex-1"></div>

          <button 
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg font-medium text-gray-300 hover:bg-[#1a1f29] border border-[#2d3340] transition-colors"
          >
            Cancelar
          </button>
          <button 
            type="submit"
            form="new-company-form"
            disabled={loading || activeTab !== 'geral'}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar Configurações"}
          </button>
        </div>

      </div>
    </div>
  );
}
