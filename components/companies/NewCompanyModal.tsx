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
    address: initialData?.address || '',
    end_logradouro: initialData?.end_logradouro || '',
    end_numero: initialData?.end_numero || '',
    end_bairro: initialData?.end_bairro || '',
    end_cidade: initialData?.end_cidade || '',
    end_uf: initialData?.end_uf || '',
    end_cep: initialData?.end_cep || '',
    default_down_payment: initialData?.default_down_payment?.toString() || '',
    default_installments: initialData?.default_installments?.toString() || '',
    default_installment_value: initialData?.default_installment_value?.toString() || '',
    default_first_due_date: initialData?.default_first_due_date || '',
    foro_cidade: initialData?.foro_cidade || '',
    phone: initialData?.phone || '',
    email: initialData?.email || '',
    active: initialData?.active !== undefined ? initialData.active : true,
    plan_type: initialData?.plan_type || 'basic',
    password: ''
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
      
      const newAddress = `${data.logradouro || ''}, ${data.numero || ''} ${data.complemento ? '- ' + data.complemento : ''} - ${data.bairro || ''}, ${data.municipio || ''} - ${data.uf || ''}, ${data.cep || ''}`.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();

      setFormData(prev => ({
        ...prev,
        razao_social: data.razao_social || prev.razao_social,
        name: data.nome_fantasia || data.razao_social || prev.name,
        address: newAddress.length > 5 ? newAddress : prev.address,
        end_logradouro: data.logradouro || prev.end_logradouro,
        end_numero: data.numero || prev.end_numero,
        end_bairro: data.bairro || prev.end_bairro,
        end_cidade: data.municipio || prev.end_cidade,
        end_uf: data.uf || prev.end_uf,
        end_cep: data.cep || prev.end_cep,
        foro_cidade: prev.foro_cidade || data.municipio || '',
        phone: data.ddd_telefone_1 || prev.phone,
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
      const slug = formData.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

      if (initialData) {
         const { error: updateError } = await supabase.from('companies').update({
            name: formData.name,
            razao_social: formData.razao_social,
            cnpj: formData.cnpj,
            address: formData.address,
            end_logradouro: formData.end_logradouro,
            end_numero: formData.end_numero,
            end_bairro: formData.end_bairro,
            end_cidade: formData.end_cidade,
            end_uf: formData.end_uf,
            end_cep: formData.end_cep,
            default_down_payment: formData.default_down_payment ? Number(formData.default_down_payment) : null,
            default_installments: formData.default_installments ? Number(formData.default_installments) : null,
            default_installment_value: formData.default_installment_value ? Number(formData.default_installment_value) : null,
            default_first_due_date: formData.default_first_due_date,
            foro_cidade: formData.foro_cidade,
            phone: formData.phone,
            email: formData.email,
            active: formData.active,
            plan_type: formData.plan_type,
            default_password: formData.password ? formData.password : undefined,
            slug: slug
         }).eq('id', initialData.id);
         
         if (updateError) throw updateError;
         
         // Note: Updating auth email/password from client side typically requires admin privileges
         // or the user themselves. We only update the companies table here.
      } else {
         if (!formData.email || !formData.password) {
            throw new Error('E-mail e senha são obrigatórios para novos cadastros.');
         }

         let existingCompany = null;
         if (formData.cnpj && formData.cnpj.trim() !== '') {
            const { data } = await supabase.from('companies').select('id').eq('cnpj', formData.cnpj).maybeSingle();
            if (data) existingCompany = data;
         }

         // Fallback check by slug to prevent unique constraint errors
         if (!existingCompany) {
            const { data } = await supabase.from('companies').select('id').eq('slug', slug).maybeSingle();
            if (data) existingCompany = data;
         }

         const finalTenantId = existingCompany ? existingCompany.id : crypto.randomUUID();

         const { data: newUserId, error: rpcError } = await supabase.rpc('handle_create_tenant_user', { 
             user_email: formData.email, 
             user_password: formData.password,
             tenant_id: finalTenantId
         });

         if (rpcError) throw rpcError;

         if (!newUserId) throw new Error('Não foi possível criar o usuário de autenticação via RPC.');

         const { error: upsertError } = await supabase.from('companies').upsert({
           id: finalTenantId,
           name: formData.name,
           razao_social: formData.razao_social,
           cnpj: formData.cnpj,
           address: formData.address,
           end_logradouro: formData.end_logradouro,
           end_numero: formData.end_numero,
           end_bairro: formData.end_bairro,
           end_cidade: formData.end_cidade,
           end_uf: formData.end_uf,
           end_cep: formData.end_cep,
           default_down_payment: formData.default_down_payment ? Number(formData.default_down_payment) : null,
           default_installments: formData.default_installments ? Number(formData.default_installments) : null,
           default_installment_value: formData.default_installment_value ? Number(formData.default_installment_value) : null,
           default_first_due_date: formData.default_first_due_date,
           foro_cidade: formData.foro_cidade,
           phone: formData.phone,
           email: formData.email,
           active: formData.active,
           plan_type: formData.plan_type,
           slug: slug,
           default_password: formData.password
         }, { onConflict: 'cnpj' });

         if (upsertError) {
             throw upsertError;
         }

         const { error: userInsertError } = await supabase.from('users').upsert({
            id: newUserId,
            tenant_id: finalTenantId,
            email: formData.email,
            full_name: `Admin - ${formData.name}`,
            role: 'ADMIN',
            status: formData.active ? 'ACTIVE' : 'INACTIVE',
            phone: formData.phone
         }, { onConflict: 'id' });

         if (userInsertError) throw userInsertError;
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
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Nome Fantasia *</label>
              <input 
                type="text" 
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Lotes Prime Empreendimentos LTDA"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
              />
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
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Endereço Completo</label>
              <input 
                type="text" 
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Av. Exemplo, 1000 - Bairro, Cidade - UF"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                title="Endereço Completo (Geral)"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Logradouro / Rua</label>
                <input 
                  type="text" 
                  value={formData.end_logradouro}
                  onChange={(e) => setFormData({ ...formData, end_logradouro: e.target.value })}
                  placeholder="Ex: Av. Brasil"
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Número</label>
                <input 
                  type="text" 
                  value={formData.end_numero}
                  onChange={(e) => setFormData({ ...formData, end_numero: e.target.value })}
                  placeholder="Ex: 100"
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Bairro</label>
                <input 
                  type="text" 
                  value={formData.end_bairro}
                  onChange={(e) => setFormData({ ...formData, end_bairro: e.target.value })}
                  placeholder="Bairro"
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">CEP</label>
                <input 
                  type="text" 
                  value={formData.end_cep}
                  onChange={(e) => setFormData({ ...formData, end_cep: e.target.value })}
                  placeholder="00000-000"
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Cidade</label>
                <input 
                  type="text" 
                  value={formData.end_cidade}
                  onChange={(e) => setFormData({ ...formData, end_cidade: e.target.value })}
                  placeholder="Cidade"
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">UF</label>
                <input 
                  type="text" 
                  value={formData.end_uf}
                  onChange={(e) => setFormData({ ...formData, end_uf: e.target.value })}
                  placeholder="UF"
                  maxLength={2}
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Foro / Localidade da Assinatura</label>
              <input 
                type="text" 
                value={formData.foro_cidade}
                onChange={(e) => setFormData({ ...formData, foro_cidade: e.target.value })}
                placeholder="Ex: São Paulo - SP"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
              />
            </div>

            <div className="pt-2 border-t border-[var(--color-border)]">
              <h3 className="text-xs font-bold text-white mb-3 uppercase tracking-widest opacity-80">Configurações Base de Contrato</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Valor de Entrada Padrão (R$)</label>
                   <input 
                     type="number" step="0.01"
                     value={formData.default_down_payment}
                     onChange={(e) => setFormData({ ...formData, default_down_payment: e.target.value })}
                     placeholder="0.00"
                     className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                   />
                 </div>
                 <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Qtd. de Parcelas</label>
                   <input 
                     type="number"
                     value={formData.default_installments}
                     onChange={(e) => setFormData({ ...formData, default_installments: e.target.value })}
                     placeholder="Ex: 120"
                     className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                   />
                 </div>
                 <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Valor Padrão da Parcela (R$)</label>
                   <input 
                     type="number" step="0.01"
                     value={formData.default_installment_value}
                     onChange={(e) => setFormData({ ...formData, default_installment_value: e.target.value })}
                     placeholder="0.00"
                     className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                   />
                 </div>
                 <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Data do 1º Vencimento (Fixo ou Info)</label>
                   <input 
                     type="text" 
                     value={formData.default_first_due_date}
                     onChange={(e) => setFormData({ ...formData, default_first_due_date: e.target.value })}
                     placeholder="Ex: 10/11/2026 ou 'Todo dia 10'"
                     className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                   />
                 </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">E-mail Master (Contato)</label>
              <input 
                type="email" 
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="contato@empresa.com.br"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Telefone</label>
              <input 
                type="tel" 
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(11) 90000-0000"
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
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Status</label>
              <select 
                value={formData.active ? 'true' : 'false'}
                onChange={(e) => setFormData({ ...formData, active: e.target.value === 'true' })}
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors appearance-none"
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Plano (Limites)</label>
              <select 
                value={formData.plan_type}
                onChange={(e) => setFormData({ ...formData, plan_type: e.target.value })}
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors appearance-none"
              >
                <option value="basic">Basic (Até 5 corretores)</option>
                <option value="standard">Standard (Até 10 corretores)</option>
                <option value="professional">Professional (Até 100 corretores)</option>
              </select>
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
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </button>
        </div>

      </div>
    </div>
  );
}

