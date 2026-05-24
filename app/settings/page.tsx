'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { Building2, Save, Upload, Loader2, ImagePlus } from 'lucide-react';

export default function SettingsPage() {
  const { user, loading: authLoading } = useSessionGuard();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [company, setCompany] = useState<any>(null);
  
  const logoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);

  useEffect(() => {
    async function loadCompany() {
      if (!user?.tenant_id) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', user.tenant_id)
        .single();

      if (!error && data) {
        setCompany(data);
      }
      setLoading(false);
    }
    
    if (user && !authLoading) {
       loadCompany();
    }
  }, [user, authLoading]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     setCompany({ ...company, [e.target.name]: e.target.value });
  };

  const uploadImage = async (file: File, type: 'logo' | 'signature') => {
      if (!user?.tenant_id) return null;
      if (file.size > 5 * 1024 * 1024) {
          alert("A imagem deve ter no máximo 5MB.");
          return null;
      }
      
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `${type}-${Date.now()}.${fileExt}`;
      const filePath = `${user.tenant_id}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
          .from('company-assets')
          .upload(filePath, file, { upsert: true, cacheControl: '3600' });
          
      if (uploadError) {
          console.error("Upload error:", uploadError);
          alert("Erro no upload: " + uploadError.message);
          return null;
      }
      
      const { data } = supabase.storage.from('company-assets').getPublicUrl(filePath);
      return data.publicUrl;
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0 || !company?.id) return;
      setUploadingLogo(true);
      const url = await uploadImage(e.target.files[0], 'logo');
      if (url) {
          setCompany((prev: any) => ({ ...prev, logo_url: url }));
          await supabase.from('companies').update({ logo_url: url }).eq('id', company.id);
          window.dispatchEvent(new Event('company_updated'));
      }
      setUploadingLogo(false);
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0 || !company?.id) return;
      setUploadingSignature(true);
      const url = await uploadImage(e.target.files[0], 'signature');
      if (url) {
          setCompany((prev: any) => ({ ...prev, signature_url: url }));
          await supabase.from('companies').update({ signature_url: url }).eq('id', company.id);
      }
      setUploadingSignature(false);
  };

  const handleSave = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!company?.id) return;
     
     setSubmitting(true);
     const { error } = await supabase
        .from('companies')
        .update({
           fantasy_name: company.fantasy_name,
           phone: company.phone,
           email: company.email,
           address: company.address,
           city: company.city,
           state: company.state,
           zip_code: company.zip_code,
           legal_representative: company.legal_representative,
           representative_cpf: company.representative_cpf,
           logo_url: company.logo_url,
           signature_url: company.signature_url
        })
        .eq('id', company.id);

     setSubmitting(false);
     if (error) {
        alert("Erro ao salvar: " + error.message);
     } else {
        alert("Configurações salvas com sucesso!");
        window.dispatchEvent(new Event('company_updated'));
     }
  };

  if (loading || authLoading) {
     return <div className="p-8 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  if (!user?.tenant_id && user?.role !== 'SUPER_ADMIN') {
     return <div className="p-8 text-center text-gray-500">Acesso negado ou empresa não localizada.</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto font-sans h-full overflow-y-auto">
      <div className="flex items-center gap-3 mb-8 pb-4 border-b border-gray-800">
        <div className="w-12 h-12 bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-400 border border-blue-800">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Configurações da Empresa</h1>
          <p className="text-sm text-gray-400">Gerencie os dados e identidades da sua empresa para contratos e recibos.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-8 bg-[var(--color-surface)] p-6 rounded-xl shadow-lg border border-[var(--color-border)]">
        
        <div className="space-y-4">
           <h2 className="text-base font-semibold text-white border-b border-[var(--color-border)] pb-2 flex items-center gap-2">
             <ImagePlus className="w-5 h-5 text-gray-400" />
             Identidade Visual
           </h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* UPLOAD LOGO */}
              <div className="bg-[var(--color-background)] p-4 rounded-lg border border-[var(--color-border)] transform transition-all hover:border-[var(--color-primary)]/50">
                 <label className="block text-xs font-semibold text-gray-300 mb-3">Logotipo (PNG, JPG - Máx 5MB)</label>
                 <div className="flex items-center gap-4">
                     <div className="w-20 h-20 rounded-md border border-[var(--color-border)] bg-black/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                         {company?.logo_url ? (
                             <img src={company.logo_url} alt="Logo" className="w-full h-full object-contain" />
                         ) : (
                             <span className="text-[10px] text-gray-500 font-medium">Sem Logo</span>
                         )}
                     </div>
                     <div className="flex-1">
                         <input type="file" accept="image/*" className="hidden" ref={logoInputRef} onChange={handleLogoUpload} />
                         <button 
                             type="button"
                             onClick={() => logoInputRef.current?.click()}
                             disabled={uploadingLogo} 
                             className="px-4 py-2 bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white border border-[var(--color-primary)]/30 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                         >
                             {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                             Fazer Upload da Logo
                         </button>
                         <p className="text-[10px] text-gray-500 mt-2 leading-tight">Será usada na barra lateral e no cabeçalho dos contratos.</p>
                     </div>
                 </div>
              </div>
              
              {/* UPLOAD ASSINATURA */}
              <div className="bg-[var(--color-background)] p-4 rounded-lg border border-[var(--color-border)] transform transition-all hover:border-blue-500/50">
                 <label className="block text-xs font-semibold text-gray-300 mb-3">Assinatura Digital (PNG, JPG)</label>
                 <div className="flex items-center gap-4">
                     <div className="w-24 h-16 rounded-md border border-[var(--color-border)] bg-black/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                         {company?.signature_url ? (
                             <img src={company.signature_url} alt="Assinatura" className="w-full h-full object-contain" />
                         ) : (
                             <span className="text-[10px] text-gray-500 font-medium">Sem Assinatura</span>
                         )}
                     </div>
                     <div className="flex-1">
                         <input type="file" accept="image/*" className="hidden" ref={signatureInputRef} onChange={handleSignatureUpload} />
                         <button 
                             type="button"
                             onClick={() => signatureInputRef.current?.click()}
                             disabled={uploadingSignature} 
                             className="px-4 py-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white border border-blue-500/30 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                         >
                             {uploadingSignature ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                             Upload Assinatura
                         </button>
                         <p className="text-[10px] text-gray-500 mt-2 leading-tight">Aparecerá automaticamente no campo do vendedor nos contratos.</p>
                     </div>
                 </div>
              </div>
              
           </div>
        </div>

        <div className="space-y-4">
           <h2 className="text-base font-semibold text-white border-b border-[var(--color-border)] pb-2 flex items-center gap-2">
             <Building2 className="w-5 h-5 text-gray-400" />
             Dados Principais
           </h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <label className="block text-xs font-semibold text-gray-400 mb-1">Nome Fantasia *</label>
                 <input type="text" required name="fantasy_name" value={company?.fantasy_name || company?.name || ''} onChange={handleChange} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div>
                 <label className="block text-xs font-semibold text-gray-400 mb-1">CNPJ</label>
                 <input type="text" name="cnpj" value={company?.cnpj || ''} onChange={handleChange} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
           </div>
        </div>

        <div className="space-y-4">
           <h2 className="text-base font-semibold text-white border-b border-[var(--color-border)] pb-2">Contato e Endereço</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <label className="block text-xs font-semibold text-gray-400 mb-1">Telefone</label>
                 <input type="text" name="phone" value={company?.phone || ''} onChange={handleChange} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div>
                 <label className="block text-xs font-semibold text-gray-400 mb-1">E-mail</label>
                 <input type="email" name="email" value={company?.email || ''} onChange={handleChange} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div className="md:col-span-2">
                 <label className="block text-xs font-semibold text-gray-400 mb-1">Endereço Completo</label>
                 <input type="text" name="address" value={company?.address || ''} onChange={handleChange} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="Rua, Número, Bairro, Complemento" />
              </div>
              <div>
                 <label className="block text-xs font-semibold text-gray-400 mb-1">Cidade</label>
                 <input type="text" name="city" value={company?.city || ''} onChange={handleChange} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div>
                 <label className="block text-xs font-semibold text-gray-400 mb-1">UF</label>
                 <input type="text" name="state" value={company?.state || ''} onChange={handleChange} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" maxLength={2} placeholder="Ex: SP" />
              </div>
              <div>
                 <label className="block text-xs font-semibold text-gray-400 mb-1">CEP</label>
                 <input type="text" name="zip_code" value={company?.zip_code || ''} onChange={handleChange} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
           </div>
        </div>

        <div className="space-y-4">
           <h2 className="text-base font-semibold text-white border-b border-[var(--color-border)] pb-2">Dados do Responsável / Representante Legal</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <label className="block text-xs font-semibold text-gray-400 mb-1">Nome do Responsável</label>
                 <input type="text" name="legal_representative" value={company?.legal_representative || ''} onChange={handleChange} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div>
                 <label className="block text-xs font-semibold text-gray-400 mb-1">CPF do Responsável</label>
                 <input type="text" name="representative_cpf" value={company?.representative_cpf || ''} onChange={handleChange} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
           </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-[var(--color-border)] mt-8">
           <button type="submit" disabled={submitting} className="flex items-center gap-2 px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[#8b5cf6] text-white font-medium rounded-lg transition-colors">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Salvar Configurações
           </button>
        </div>

      </form>
    </div>
  );
}
