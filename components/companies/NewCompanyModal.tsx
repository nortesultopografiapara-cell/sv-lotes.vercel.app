'use client';

import { useState } from 'react';
import { X, Building2, Mail, Phone, Lock, Upload, Image as ImageIcon, User, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface NewCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function NewCompanyModal({ isOpen, onClose, onSuccess }: NewCompanyModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<{
    password?: string;
    email?: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    cnpj: '',
    phone: '',
    email: '',
    plan: 'BASIC',
    adminName: '',
    adminEmail: '',
    adminPhone: '',
    sendEmail: true
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/companies/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Erro ao criar empresa');
      }

      setSuccessData({
        email: formData.adminEmail,
        password: result.temporaryPassword
      });

      if (onSuccess) onSuccess();
      window.location.reload(); // Simple refresh to show new company
    } catch (err: any) {
      console.error('Error creating company:', err);
      setError(err.message || 'Erro ao criar empresa');
    } finally {
      setLoading(false);
    }
  };

  const renderSuccessState = () => (
    <div className="p-8 flex flex-col items-center justify-center text-center animate-in zoom-in duration-300">
      <div className="w-16 h-16 bg-[#06b6d4]/10 rounded-full flex items-center justify-center mb-4 border border-[#06b6d4]/30">
        <CheckCircle2 className="w-8 h-8 text-[#06b6d4]" />
      </div>
      <h3 className="text-xl font-bold text-white mb-2">Empresa Criada com Sucesso!</h3>
      <p className="text-[var(--color-text-muted)] text-sm max-w-md mb-6">
        O tenant foi provisionado. Um e-mail de convite padrão do Supabase foi enviado ao administrador.
      </p>
      
      <div className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl w-full max-w-sm overflow-hidden text-left mb-6">
        <div className="px-4 py-3 border-[var(--color-border)] grid grid-cols-3 gap-2 items-center">
          <span className="text-xs font-mono font-bold text-[var(--color-text-muted)] col-span-1">LOGIN:</span>
          <span className="text-sm text-white col-span-2 select-all">{successData?.email}</span>
        </div>
      </div>

      <p className="text-xs text-[var(--color-text-muted)] mb-6 max-w-md leading-relaxed">
         Por favor, peça ao administrador para checar a caixa de entrada (ou pasta de spam) 
         e clicar no link de acesso para definir sua senha.
      </p>

      <button 
        onClick={onClose}
        className="w-full max-w-sm px-6 py-2.5 rounded-lg font-bold text-white bg-[#06b6d4] hover:bg-[#0891b2] transition-colors shadow-[0_0_15px_rgba(6,182,212,0.3)]"
      >
        Concluir
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)] relative overflow-hidden shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#06b6d4] to-[var(--color-primary)]" />
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#06b6d4]" />
              Novo Workspace
            </h2>
            <p className="text-[13px] text-[var(--color-text-muted)] mt-1">
              Provisionamento completo de Tenant + Administrador
            </p>
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
          {successData ? (
             renderSuccessState()
          ) : (
            <form id="new-company-form" onSubmit={handleSubmit} className="p-6 space-y-8">
              
              {error && (
                 <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">
                    {error}
                 </div>
              )}
              
              {/* SECTION 1: COMPANY DATA */}
              <div>
                <h3 className="text-sm font-bold text-[#06b6d4] mb-4 flex items-center gap-2 uppercase tracking-wide">
                  <Building2 className="w-4 h-4" /> 1. Dados da Empresa
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Nome da Empresa</label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                        <input 
                          type="text" 
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Ex: Lotes Prime Empreendimentos LTDA"
                          className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                        />
                      </div>
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">CNPJ (Opcional)</label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                        <input 
                          type="text" 
                          value={formData.cnpj}
                          onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                          placeholder="00.000.000/0001-00"
                          className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                        />
                      </div>
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Plano</label>
                      <select 
                        value={formData.plan}
                        onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                        className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-[9px] px-4 text-sm text-white focus:outline-none focus:border-[#06b6d4] appearance-none"
                      >
                        <option value="BASIC">Plano Básico</option>
                        <option value="PRO">Plano Profissional</option>
                        <option value="ENTERPRISE">Enterprise</option>
                      </select>
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Email (Empresa)</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                        <input 
                          type="email" 
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="contato@empresa.com"
                          className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                        />
                      </div>
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Telefone (Empresa)</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                        <input 
                          type="tel" 
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="(11) 0000-0000"
                          className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                        />
                      </div>
                   </div>
                </div>
              </div>

              {/* SECTION 2: ADMIN DATA */}
              <div className="pt-6 border-t border-[var(--color-border)]">
                <h3 className="text-sm font-bold text-[var(--color-primary)] mb-4 flex items-center gap-2 uppercase tracking-wide">
                  <User className="w-4 h-4" /> 2. Conta do Administrador
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Nome do Responsável</label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                        <input 
                          type="text" 
                          required
                          value={formData.adminName}
                          onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                          placeholder="Ex: João Silva"
                          className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                        />
                      </div>
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Email (Login Principal)</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                        <input 
                          type="email" 
                          required
                          value={formData.adminEmail}
                          onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                          placeholder="joao@empresa.com"
                          className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                        />
                      </div>
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">WhatsApp / Celular</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                        <input 
                          type="tel" 
                          value={formData.adminPhone}
                          onChange={(e) => setFormData({ ...formData, adminPhone: e.target.value })}
                          placeholder="(11) 90000-0000"
                          className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                        />
                      </div>
                   </div>
                </div>
              </div>

              {/* SECTION 3: ACCESS & NOTIFICATION */}
              <div className="pt-6 border-t border-[var(--color-border)]">
                <h3 className="text-sm font-bold text-[var(--color-success)] mb-4 flex items-center gap-2 uppercase tracking-wide">
                  <Lock className="w-4 h-4" /> 3. Credenciais & Acesso
                </h3>
                
                <div className="flex flex-col gap-4">
                   <div className="p-4 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)]">
                      <p className="text-sm text-white/90 mb-2">
                        O sistema gerará automaticamente uma <span className="font-bold text-[#06b6d4]">senha provisória segura</span> de 8 dígitos. 
                        No primeiro login, o administrador será obrigado a:
                      </p>
                      <ul className="list-disc list-inside text-xs text-[var(--color-text-muted)] space-y-1">
                         <li>Redefinir sua senha para uma de sua escolha;</li>
                         <li>Finalizar configurações iniciais (Logo e Cores).</li>
                      </ul>
                   </div>

                   <label className="flex items-center gap-3 cursor-pointer p-1">
                      <input 
                        type="checkbox" 
                        checked={formData.sendEmail}
                        onChange={(e) => setFormData({ ...formData, sendEmail: e.target.checked })}
                        className="w-5 h-5 rounded border-[var(--color-border)] bg-[var(--color-background)] text-amber-500 focus:ring-amber-500 focus:ring-offset-0 focus:ring-offset-transparent cursor-pointer"
                      />
                      <span className="text-sm text-white/90 font-medium">Enviar email automático com credenciais e link de acesso</span>
                   </label>
                </div>
              </div>

            </form>
          )}
        </div>

        {/* Footer */}
        {!successData && (
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
              {loading ? "Provisionando Workspace..." : "Criar Empresa Completa"}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

