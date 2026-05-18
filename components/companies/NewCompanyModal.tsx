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
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    cnpj: initialData?.cnpj || '',
    phone: initialData?.phone || '',
    email: initialData?.email || '',
    active: initialData?.active !== undefined ? initialData.active : true,
    password: '',
    plan: initialData?.module_plan || initialData?.plan || 'Básico'
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    setError('');

    try {
      const slug = formData.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

      const planLimits = {
          'Básico': { broker_limit: 5, project_limit: 1, admin_limit: 1 },
          'Standard': { broker_limit: 10, project_limit: 10, admin_limit: 3 },
          'Professional': { broker_limit: 100, project_limit: 9999, admin_limit: 10 }
      };
      const limits = planLimits[formData.plan as keyof typeof planLimits] || planLimits['Básico'];

      if (initialData) {
         // ... existing update logic ...
         const { error: updateError } = await supabase.from('companies').update({
            name: formData.name,
            cnpj: formData.cnpj,
            phone: formData.phone,
            email: formData.email,
            active: formData.active,
            default_password: formData.password ? formData.password : undefined,
            slug: slug,
            module_plan: formData.plan,
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

         const response = await fetch('/api/companies/create', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
                 name: formData.name,
                 cnpj: formData.cnpj,
                 phone: formData.phone,
                 email: formData.email,
                 active: formData.active,
                 plan: formData.plan,
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
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Nome da Empresa / Imobiliária *</label>
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
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">CNPJ / CPF</label>
              <input 
                type="text" 
                value={formData.cnpj}
                onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                placeholder="00.000.000/0001-00"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">E-mail de Contato</label>
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
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Módulo / Plano do Sistema</label>
              <select 
                value={formData.plan}
                onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors appearance-none"
              >
                <option value="Básico">Básico</option>
                <option value="Standard">Standard</option>
                <option value="Professional">Professional</option>
              </select>
              <div className="mt-2 text-xs text-[#06b6d4] p-2.5 bg-[#06b6d4]/10 rounded-lg border border-[#06b6d4]/20 flex flex-col gap-1 shadow-inner">
                {formData.plan === 'Básico' && '✔ Até 5 corretores, 1 loteamento e 1 administrador.'}
                {formData.plan === 'Standard' && '✔ Até 10 corretores, 10 loteamentos e 3 administradores.'}
                {formData.plan === 'Professional' && '✔ Até 100 corretores, loteamentos ilimitados e 10 administradores.'}
              </div>
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

