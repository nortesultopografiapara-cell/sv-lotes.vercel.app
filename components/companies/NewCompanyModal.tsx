'use client';

import { useState } from 'react';
import { X, Building2, Loader2, CheckCircle2 } from 'lucide-react';
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
  const [isSearchingCNPJ, setIsSearchingCNPJ] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    razao_social: initialData?.razao_social || '',
    cnpj: initialData?.cnpj || '',
    email: initialData?.email || '',
    plan_type: initialData?.plan_type || 'basic',
    password: '',
    next_payment_date: initialData?.next_payment_date || ''
  });

  if (!isOpen) return null;

  const handleCNPJSearch = async () => {
    const rawCnpj = formData.cnpj.replace(/\D/g, '');
    if (rawCnpj.length !== 14) return;
    
    setError('');
    setIsSearchingCNPJ(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${rawCnpj}`);
      if (!res.ok) {
        throw new Error('Erro ao buscar CNPJ na API.');
      }
      const data = await res.json();
      
      setFormData(prev => ({
        ...prev,
        razao_social: data.razao_social || prev.razao_social,
        name: data.nome_fantasia || data.razao_social || prev.name,
      }));
    } catch (err: any) {
      console.error(err);
      setError('CNPJ não encontrado ou erro na busca.');
    } finally {
      setIsSearchingCNPJ(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    setError('');

    try {
      const baseSlug = formData.name || formData.razao_social || 'nova-empresa';
      const slug = baseSlug.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

         let finalTenantId = crypto.randomUUID();

         if (!initialData) {
            if (!formData.email || !formData.password) {
               throw new Error('E-mail e senha são obrigatórios para novos cadastros.');
            }

            // Check if email already exists in users or companies
            const { count: usersCount } = await supabase
              .from('users')
              .select('id', { count: 'exact', head: true })
              .eq('email', formData.email);
              
            const { count: companiesCount } = await supabase
              .from('companies')
              .select('id', { count: 'exact', head: true })
              .eq('email', formData.email);

            if ((usersCount && usersCount > 0) || (companiesCount && companiesCount > 0)) {
               throw new Error('Este e-mail já está vinculado a um cadastro ativo no sistema');
            }

            // 1. Create user with signUp and only essential metadata
            const { data: authData, error: authError } = await supabase.auth.signUp({
               email: formData.email,
               password: formData.password,
            });

            if (authError) {
               throw new Error('Erro ao criar usuário: ' + authError.message);
            }

            if (!authData.user) {
               throw new Error('Falha ao obter ID do usuário gerado.');
            }

            // 2. Insert company
            const { error: insertCompanyError } = await supabase.from('companies').insert({
               id: finalTenantId,
               name: formData.name,
               razao_social: formData.razao_social,
               cnpj: formData.cnpj,
               email: formData.email,
               plan_type: formData.plan_type,
               slug: slug,
               default_password: formData.password,
               next_payment_date: formData.next_payment_date || null
            });

            if (insertCompanyError) {
               console.error('Erro de gravação na tabela companies:', insertCompanyError);
               throw new Error('Erro ao salvar empresa: ' + insertCompanyError.message);
            }

            const { error: userInsertError } = await supabase.from('users').upsert({
               id: authData.user.id,
               tenant_id: finalTenantId,
               email: formData.email,
               full_name: formData.name,
               role: 'ADMIN',
               status: 'ACTIVE'
            }, { onConflict: 'id' });

            if (userInsertError) {
               console.error('Aviso: Falha ao inserir metadata no users:', userInsertError);
            }

         } else {
            const { error: updateError } = await supabase.from('companies').update({
               name: formData.name,
               razao_social: formData.razao_social,
               cnpj: formData.cnpj,
               email: formData.email,
               plan_type: formData.plan_type,
               default_password: formData.password ? formData.password : undefined,
               slug: slug,
               next_payment_date: formData.next_payment_date || null
            }).eq('id', initialData.id);
            
            if (updateError) throw new Error('Erro ao atualizar empresa: ' + updateError.message);
         }

         if (onSuccess) onSuccess();
         onClose();
    } catch (err: any) {
      console.error('Error saving company:', err);
      setError(err.message || 'Erro inesperado ao salvar empresa. Verifique os dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)] relative overflow-hidden shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#06b6d4] to-[var(--color-primary)]" />
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#06b6d4]" />
              {initialData ? "Editar Empresa" : "Nova Empresa"}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-background)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          <form id="new-company-form" onSubmit={handleSubmit} className="p-6 space-y-4">
            
            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">
                  {error}
                </div>
            )}
            
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">CNPJ</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={formData.cnpj}
                  onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                  onBlur={handleCNPJSearch}
                  placeholder="00.000.000/0001-00"
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 pr-10 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                />
                {isSearchingCNPJ && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-muted)]" />
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Razão Social</label>
              <input 
                type="text" 
                value={formData.razao_social}
                onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                placeholder="Ex: Lotes Prime Empreendimentos LTDA"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Nome Fantasia *</label>
              <input 
                type="text" 
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Lotes Prime"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">E-mail de Acesso (Admin)</label>
              <input 
                type="email" 
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="contato@empresa.com.br"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">
                Senha de Acesso {!initialData && '*'}
              </label>
              <input 
                type="password" 
                required={!initialData}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={initialData ? "Deixe em branco para manter a atual" : "Senha forte"}
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Plano de Assinatura</label>
              <select 
                value={formData.plan_type}
                onChange={(e) => setFormData({ ...formData, plan_type: e.target.value })}
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors appearance-none"
              >
                <option value="basic">Básico</option>
                <option value="standard">Standard</option>
                <option value="professional">Profissional</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {initialData && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Data de Cadastro</label>
                  <input 
                    type="text" 
                    disabled
                    value={initialData.created_at ? new Date(initialData.created_at).toLocaleDateString('pt-BR') : ''}
                    className="w-full bg-[var(--color-background)] opacity-50 cursor-not-allowed border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none transition-colors"
                  />
                </div>
              )}

              <div className={!initialData ? 'col-span-2' : ''}>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider flex items-center gap-2">
                  Vencimento / Próx. Pagamento
                </label>
                <input 
                  type="date" 
                  value={formData.next_payment_date}
                  onChange={(e) => setFormData({ ...formData, next_payment_date: e.target.value })}
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[var(--color-border)] shrink-0 flex flex-col sm:flex-row items-center justify-end gap-3 bg-[var(--color-background)]">
          <button 
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg font-medium text-white hover:bg-[var(--color-surface)] border border-[var(--color-border)] transition-colors"
          >
            Cancelar
          </button>
          <button 
            type="submit"
            form="new-company-form"
            disabled={loading}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg font-bold text-white bg-[#06b6d4] hover:bg-[#0891b2] transition-colors shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar Empresa"}
          </button>
        </div>

      </div>
    </div>
  );
}
