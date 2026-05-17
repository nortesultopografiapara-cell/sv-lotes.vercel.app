'use client';

import { Users, Search, Plus, MoreHorizontal, CheckCircle2, User, Mail, Phone, Lock, AlertCircle, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

// Map limits
const PLAN_LIMITS: Record<string, number> = {
  basic: 5,
  standard: 10,
  professional: 100
};

export default function CorretoresPage() {
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [corretores, setCorretores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyPlan, setCompanyPlan] = useState<string>('basic');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    creci: '',
    password: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<{ email: string, password: string } | null>(null);

  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user && user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN' && user.role !== 'ADMIN_TENANT') {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  const loadData = async () => {
    if (!user) return;
    try {
      setLoading(true);

      if (user.tenant_id) {
         const { data: comp } = await supabase.from('companies').select('plan_type').eq('id', user.tenant_id).single();
         if (comp && comp.plan_type) {
           setCompanyPlan(comp.plan_type);
         }
      }

      let query = supabase.from('users').select(`*`).order('created_at', { ascending: false });
      
      if (user.role === 'ADMIN' || user.role === 'ADMIN_TENANT') {
         query = query.eq('tenant_id', user.tenant_id).in('role', ['CORRETOR', 'USER', 'broker']);
      } else if (user.role === 'SUPER_ADMIN') {
         query = query.in('role', ['CORRETOR', 'USER', 'broker']); 
      }
      
      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      
      setCorretores(data || []);
    } catch(err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      // eslint-disable-next-line
      loadData();
    }
    // eslint-disable-next-line
  }, [user, authLoading]);

  const limit = PLAN_LIMITS[companyPlan] || 5;
  const isLimitReached = corretores.length >= limit && user?.role === 'ADMIN';

  const handleOpenModal = () => {
    if (isLimitReached) {
      alert(`O limite de ${limit} corretores do seu plano (${companyPlan}) foi atingido. Faça upgrade para adicionar mais.`);
      return;
    }
    setSuccessData(null); 
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
        let currentTenantId = user?.tenant_id;
        
        if (!currentTenantId) {
            throw new Error("Erro: O ID da imobiliária (tenantId) não pôde ser identificado. Por favor, faça logout e login novamente para atualizar sua sessão.");
        }
        
        const response = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           ...formData,
           tenantId: currentTenantId,
           role: 'USER'
        })
      });
      
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error);
      }

      setSuccessData({
        email: formData.email,
        password: result.temporaryPassword
      });

    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar corretor');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
     setIsModalOpen(false);
     if (successData) {
        loadData();
     }
  };

  const handleDelete = async (brokerId: string, brokerName: string) => {
    if (!confirm(`Tem certeza que deseja remover o corretor ${brokerName}? Essa ação não pode ser desfeita.`)) return;

    try {
      const response = await fetch(`/api/users/delete?id=${brokerId}`, { method: 'DELETE' });
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error);
      }
      
      // Update list
      setCorretores(prev => prev.filter(c => c.id !== brokerId));
    } catch(err: any) {
      alert(`Erro ao excluir: ${err.message}`);
    }
  };

  const filtered = corretores.filter(c => 
     c.full_name?.toLowerCase().includes(search.toLowerCase()) || 
     c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col h-full">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Corretores</h1>
          <p className="text-sm font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
            GERENCIAMENTO DE EQUIPE DE VENDAS
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Buscar corretor..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[var(--color-surface)] border border-[var(--color-border)] text-white text-sm rounded-lg pl-9 pr-4 py-2 w-full md:w-64 focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            />
          </div>
          <button 
            onClick={handleOpenModal}
            className="flex items-center gap-2 bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-bold shadow-[0_0_15px_rgba(20,184,166,0.3)] hover:bg-[#0f766e] transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Novo Corretor
          </button>
        </div>
      </header>

      {/* Tabela */}
      <div className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden flex flex-col shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                <th className="p-4 text-xs font-mono font-bold text-[var(--color-text-muted)] uppercase tracking-wider w-[300px]">Corretor</th>
                <th className="p-4 text-xs font-mono font-bold text-[var(--color-text-muted)] uppercase tracking-wider hidden md:table-cell">Contato</th>
                <th className="p-4 text-xs font-mono font-bold text-[var(--color-text-muted)] uppercase tracking-wider text-center">Status</th>
                <th className="p-4 text-xs font-mono font-bold text-[var(--color-text-muted)] uppercase tracking-wider w-[100px] text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-[var(--color-text-muted)]">Carregando corretores...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-[var(--color-text-muted)]">Nenhum corretor encontrado.</td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-background)] transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center border border-[var(--color-primary)]/20 text-[#14b8a6] font-bold shrink-0">
                          {c.full_name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white mb-0.5">{c.full_name}</div>
                          <div className="text-xs text-[var(--color-text-muted)] group-hover:text-white transition-colors">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <div className="text-sm text-white mb-0.5">{c.phone || '—'}</div>
                    </td>
                    <td className="p-4 text-center">
                      <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/20">
                        {c.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-2 text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-surface)] rounded-lg transition-colors tooltip-trigger" title="Opções">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(c.id, c.full_name)} className="p-2 text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors tooltip-trigger" title="Excluir Corretor">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)]">
              <h2 className="text-xl font-bold text-white">Cadastrar Corretor</h2>
              <button onClick={handleCloseModal} className="text-[var(--color-text-muted)] hover:text-white transition-colors">
                ✕
              </button>
            </div>

            <div className="p-6">
               {successData ? (
                 <div className="text-center animate-in zoom-in duration-300">
                   <div className="w-16 h-16 bg-[#14b8a6]/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#14b8a6]/30">
                     <CheckCircle2 className="w-8 h-8 text-[#14b8a6]" />
                   </div>
                   <h3 className="text-xl font-bold text-white mb-2">Corretor Cadastrado!</h3>
                   <p className="text-[var(--color-text-muted)] text-sm mb-6">
                     Repasse estas credenciais seguras para o usuário:
                   </p>
                   
                   <div className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl w-full max-w-sm mx-auto overflow-hidden text-left mb-6">
                      <div className="px-4 py-3 border-b border-[var(--color-border)] grid grid-cols-3 gap-2 items-center">
                        <span className="text-xs font-mono font-bold text-[var(--color-text-muted)] col-span-1">LOGIN:</span>
                        <span className="text-sm text-white col-span-2 select-all">{successData.email}</span>
                      </div>
                      <div className="px-4 py-3 grid grid-cols-3 gap-2 items-center">
                        <span className="text-xs font-mono font-bold text-[var(--color-text-muted)] col-span-1">SENHA:</span>
                        <span className="text-sm font-mono text-[#14b8a6] font-bold col-span-2 select-all tracking-wider">{successData.password}</span>
                      </div>
                   </div>
                   <button 
                     onClick={handleCloseModal}
                     className="w-full max-w-sm mx-auto px-6 py-2.5 rounded-lg font-bold text-white bg-[#14b8a6] hover:bg-[#0f766e] transition-colors"
                   >
                     Concluir
                   </button>
                 </div>
               ) : (
                 <form onSubmit={handleSubmit} className="space-y-4">
                   {error && (
                     <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">
                       {error}
                     </div>
                   )}
                   
                   <div className="space-y-1.5">
                      <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Nome Completo</label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                        <input 
                          type="text" 
                          required
                          value={formData.fullName}
                          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                          className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#14b8a6]"
                        />
                      </div>
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Email (Login)</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                        <input 
                          type="email" 
                          required
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#14b8a6]"
                        />
                      </div>
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Telefone</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                        <input 
                          type="tel" 
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#14b8a6]"
                        />
                      </div>
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">CRECI (Opcional)</label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                        <input 
                          type="text" 
                          placeholder="Ex: 12345-F"
                          value={formData.creci}
                          onChange={(e) => setFormData({ ...formData, creci: e.target.value })}
                          className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#14b8a6]"
                        />
                      </div>
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Senha de Acesso</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                        <input 
                          type="password" 
                          required
                          placeholder="Defina a senha do corretor"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#14b8a6]"
                        />
                      </div>
                   </div>

                   <div className="pt-2">
                     <button 
                       type="submit"
                       disabled={isSubmitting}
                       className="w-full py-2.5 rounded-lg font-bold text-white bg-[#14b8a6] hover:bg-[#0f766e] transition-colors disabled:opacity-50"
                     >
                       {isSubmitting ? 'Gerando Acesso...' : 'Cadastrar Corretor'}
                     </button>
                   </div>
                 </form>
               )}
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}
