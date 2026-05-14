'use client';

import { useState } from 'react';
import { X, Building2, Mail, Phone, Lock, Upload, Image as ImageIcon } from 'lucide-react';

interface NewCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NewCompanyModal({ isOpen, onClose }: NewCompanyModalProps) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate API Call to create tenant
    setTimeout(() => {
      setLoading(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#06b6d4] to-[var(--color-primary)]" />
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#06b6d4]" />
              Cadastrar Nova Empresa
            </h2>
            <p className="text-[13px] text-[var(--color-text-muted)] mt-1">
              Criação de novo Tenant no sistema
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
        <div className="p-6 overflow-y-auto flex-1">
          <form id="new-company-form" onSubmit={handleSubmit} className="space-y-6">
            
            {/* Logo Upload Mockup */}
            <div className="flex items-start gap-6">
              <div className="w-24 h-24 rounded-2xl bg-[var(--color-background)] border-2 border-dashed border-[var(--color-border)] flex flex-col items-center justify-center text-[var(--color-text-muted)] cursor-pointer group">
                <ImageIcon className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Logo</span>
              </div>
              <div className="flex-1 mt-2">
                <h4 className="text-sm font-medium text-white mb-1">Identidade Visual</h4>
                <p className="text-xs text-[var(--color-text-muted)] mb-3">Recomendado: 512x512px. PNG ou JPG.</p>
                <button type="button" className="text-xs px-3 py-1.5 bg-[var(--color-background)] border border-[var(--color-border)] rounded text-white hover:border-[#06b6d4] transition-colors flex items-center gap-2">
                  <Upload className="w-3.5 h-3.5" /> Fazer Upload
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Nome da Empresa</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                    <input 
                      type="text" 
                      required
                      placeholder="Ex: Lotes Prime Empreendimentos LTDA"
                      className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                    />
                  </div>
               </div>

               <div className="space-y-1.5">
                  <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Email (Admin)</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                    <input 
                      type="email" 
                      required
                      placeholder="admin@empresa.com.br"
                      className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                    />
                  </div>
               </div>

               <div className="space-y-1.5">
                  <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Telefone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                    <input 
                      type="tel" 
                      placeholder="(00) 00000-0000"
                      className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                    />
                  </div>
               </div>

               <div className="space-y-1.5">
                  <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Senha Provisória</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 w-4 h-4 text-[var(--color-text-muted)]" />
                    <input 
                      type="text" 
                      required
                      defaultValue="Mudar123!"
                      className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
                    />
                  </div>
               </div>

               <div className="space-y-1.5">
                  <label className="text-xs font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Plano</label>
                  <select className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-[11px] px-4 text-sm text-white focus:outline-none focus:border-[#06b6d4] appearance-none">
                    <option value="BASIC">Plano Básico</option>
                    <option value="PRO">Plano Profissional</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
               </div>
            </div>

            <div className="p-4 rounded-xl bg-[#06b6d4]/10 border border-[#06b6d4]/20 text-sm">
               <strong className="text-[#06b6d4] block mb-1">Criação de Tenant:</strong>
               <p className="text-white/80 text-xs leading-relaxed">
                 O sistema irá instanciar o <strong>tenant_id</strong> para esta empresa isolando seus dados. A empresa não terá acesso a lotes, clientes ou financeiro de outros tenants.
               </p>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-end gap-3 bg-[var(--color-background)]">
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
            {loading ? "Provisionando..." : "Criar Empresa"}
          </button>
        </div>

      </div>
    </div>
  );
}
