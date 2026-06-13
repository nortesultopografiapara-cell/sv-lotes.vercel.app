'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { Building2, Save, Upload, Loader2, ImagePlus, HardHat, Palette } from 'lucide-react';
import { ThemeAppearanceSection } from '@/components/settings/ThemeAppearanceSection';
import { OwnerProjectAccessPanel } from '@/components/settings/OwnerProjectAccessPanel';
import { isTenantAdminRole } from '@/lib/ownerProjectAccess';

const PLATFORM_ADMIN_ROLES = ['SUPER_ADMIN', 'MASTER-ADMIN', 'MASTER_ADMIN'];

const COMPANY_TECHNICAL_COLUMNS =
  'id, name, fantasy_name, cnpj, phone, email, address, city, state, zip_code, legal_representative, representative_cpf, logo_url, signature_url, technical_responsible_name, technical_responsible_role, technical_responsible_crea, technical_responsible_cau, technical_responsible_cft, technical_responsible_cpf, technical_responsible_phone, technical_responsible_email, technical_signature_url, technical_stamp_url';

function resolveSettingsCompanyId(user: { tenant_id?: string; company_id?: string; role?: string } | null): string | null {
  if (!user) return null;
  if (typeof window !== 'undefined') {
    const impersonating = localStorage.getItem('impersonating_tenant_id');
    if (impersonating && user.role && PLATFORM_ADMIN_ROLES.includes(user.role)) {
      return impersonating;
    }
  }
  return user.tenant_id || user.company_id || null;
}

function technicalFromCompanyRow(data: Record<string, unknown>) {
  return {
    name: String(data.technical_responsible_name || '').trim(),
    title: String(data.technical_responsible_role || '').trim(),
    crea: String(data.technical_responsible_crea || '').trim(),
    cau: String(data.technical_responsible_cau || '').trim(),
    cft: String(data.technical_responsible_cft || '').trim(),
    cpf: String(data.technical_responsible_cpf || '').trim(),
    phone: String(data.technical_responsible_phone || '').trim(),
    email: String(data.technical_responsible_email || '').trim(),
    signature_url: String(data.technical_signature_url || '').trim(),
    stamp_url: String(data.technical_stamp_url || '').trim(),
  };
}

export default function SettingsPage() {
  const { user, loading: authLoading } = useSessionGuard();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [company, setCompany] = useState<any>(null);
  
  const logoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const techSignatureInputRef = useRef<HTMLInputElement>(null);
  const techStampInputRef = useRef<HTMLInputElement>(null);
  
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [uploadingTechSignature, setUploadingTechSignature] = useState(false);
  const [uploadingTechStamp, setUploadingTechStamp] = useState(false);
  const [technical, setTechnical] = useState<Record<string, string>>({
    name: '',
    title: '',
    crea: '',
    cau: '',
    cft: '',
    cpf: '',
    phone: '',
    email: '',
    signature_url: '',
    stamp_url: '',
  });
  useEffect(() => {
    async function loadCompany() {
      const companyId = resolveSettingsCompanyId(user);
      if (!companyId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('companies')
        .select(COMPANY_TECHNICAL_COLUMNS)
        .eq('id', companyId)
        .single();

      console.log('[RT RELOAD] company', data, error);

      if (error) {
        console.error('[RT RELOAD] erro ao carregar companies', error);
      }

      if (!error && data) {
        setCompany(data);
        const techState = technicalFromCompanyRow(data as Record<string, unknown>);
        setTechnical(techState);
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
      const tenantPath = resolveSettingsCompanyId(user) || company?.id;
      if (!tenantPath) return null;
      if (file.size > 5 * 1024 * 1024) {
          alert("A imagem deve ter no máximo 5MB.");
          return null;
      }
      
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `${type}-${Date.now()}.${fileExt}`;
      const filePath = `${tenantPath}/${fileName}`;
      
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
      const companyId = resolveSettingsCompanyId(user) || company?.id;
      if (!e.target.files || e.target.files.length === 0 || !companyId) return;
      setUploadingLogo(true);
      const url = await uploadImage(e.target.files[0], 'logo');
      if (url) {
          setCompany((prev: any) => ({ ...prev, logo_url: url }));
          await supabase.from('companies').update({ logo_url: url }).eq('id', companyId);
          window.dispatchEvent(new Event('company_updated'));
      }
      setUploadingLogo(false);
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const companyId = resolveSettingsCompanyId(user) || company?.id;
      if (!e.target.files || e.target.files.length === 0 || !companyId) return;
      setUploadingSignature(true);
      const url = await uploadImage(e.target.files[0], 'signature');
      if (url) {
          setCompany((prev: any) => ({ ...prev, signature_url: url }));
          await supabase.from('companies').update({ signature_url: url }).eq('id', companyId);
      }
      setUploadingSignature(false);
  };

  const handleTechChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setTechnical((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleTechSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const companyId = resolveSettingsCompanyId(user) || company?.id;
    if (!e.target.files?.length || !companyId) return;
    setUploadingTechSignature(true);
    const url = await uploadImage(e.target.files[0], 'signature');
    if (url) setTechnical((prev) => ({ ...prev, signature_url: url }));
    setUploadingTechSignature(false);
  };

  const handleTechStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const companyId = resolveSettingsCompanyId(user) || company?.id;
    if (!e.target.files?.length || !companyId) return;
    setUploadingTechStamp(true);
    const url = await uploadImage(e.target.files[0], 'signature');
    if (url) setTechnical((prev) => ({ ...prev, stamp_url: url }));
    setUploadingTechStamp(false);
  };

  const handleSave = async (e: React.FormEvent) => {
     e.preventDefault();

     const companyId = resolveSettingsCompanyId(user);
     console.log('[RT SAVE] companyId', companyId);

     if (!companyId) {
       alert('Empresa não identificada. ADMIN: verifique tenant_id. SUPER_ADMIN: selecione a empresa (impersonação).');
       return;
     }

     if (company?.id && company.id !== companyId) {
       console.warn('[RT SAVE] company.id diverge de resolveSettingsCompanyId', company.id, companyId);
     }

     setSubmitting(true);

     const signatureUrl =
       (technical.signature_url || company?.technical_signature_url || '').trim() || null;
     const stampUrl =
       (technical.stamp_url || company?.technical_stamp_url || '').trim() || null;

     const payload = {
       fantasy_name: company?.fantasy_name,
       phone: company?.phone,
       email: company?.email,
       address: company?.address,
       city: company?.city,
       state: company?.state,
       zip_code: company?.zip_code,
       legal_representative: company?.legal_representative,
       representative_cpf: company?.representative_cpf,
       logo_url: company?.logo_url,
       signature_url: company?.signature_url,
       technical_responsible_name: technical.name.trim() || null,
       technical_responsible_role: technical.title.trim() || null,
       technical_responsible_crea: technical.crea.trim() || null,
       technical_responsible_cau: technical.cau.trim() || null,
       technical_responsible_cft: technical.cft.trim() || null,
       technical_responsible_cpf: technical.cpf.trim() || null,
       technical_responsible_phone: technical.phone.trim() || null,
       technical_responsible_email: technical.email.trim() || null,
       technical_signature_url: signatureUrl,
       technical_stamp_url: stampUrl,
     };

     console.log('[RT SAVE] payload', payload);

     const { data: updateData, error: updateError } = await supabase
        .from('companies')
        .update(payload)
        .eq('id', companyId)
        .select(COMPANY_TECHNICAL_COLUMNS)
        .single();

     console.log('[RT SAVE] result', updateData, updateError);

     if (updateError) {
        console.error('[RT SAVE] erro no update', updateError);
        setSubmitting(false);
        alert('Erro ao salvar: ' + updateError.message);
        return;
     }

     if (!updateData) {
        setSubmitting(false);
        const msg = 'Nenhuma linha atualizada em companies (verifique RLS ou company_id).';
        console.error('[RT SAVE]', msg, { companyId });
        alert(msg);
        return;
     }

     const { data: reloaded, error: reloadError } = await supabase
       .from('companies')
       .select(COMPANY_TECHNICAL_COLUMNS)
       .eq('id', companyId)
       .single();

     console.log('[RT RELOAD] company', reloaded, reloadError);

     if (reloadError) {
       console.error('[RT RELOAD] erro pós-save', reloadError);
       setSubmitting(false);
       alert('Erro ao verificar persistência: ' + reloadError.message);
       return;
     }

     const expectedName = technical.name.trim();
     const persistedName = String(reloaded?.technical_responsible_name || '').trim();

     if (expectedName && persistedName !== expectedName) {
       console.error('[RT SAVE] persistência inconsistente', { expectedName, persistedName, reloaded });
       setSubmitting(false);
       alert('Falha ao persistir responsável técnico em companies');
       return;
     }

     setCompany(reloaded);
     setTechnical(technicalFromCompanyRow(reloaded as Record<string, unknown>));

     setSubmitting(false);
     alert('Configurações salvas com sucesso!');
     window.dispatchEvent(new Event('company_updated'));
  };

  if (loading || authLoading) {
     return <div className="p-8 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[var(--brand-primary)]" /></div>;
  }

  const settingsCompanyId = resolveSettingsCompanyId(user);
  const isPlatformAdmin = user?.role && PLATFORM_ADMIN_ROLES.includes(user.role);

  if (!settingsCompanyId && !isPlatformAdmin) {
     return <div className="p-8 text-center sv-theme-muted">Acesso negado ou empresa não localizada.</div>;
  }

  if (!settingsCompanyId && isPlatformAdmin) {
     return (
       <div className="p-8 text-center sv-theme-muted">
         Selecione uma empresa (impersonação) no painel master para editar as configurações.
       </div>
     );
  }

  if (!company) {
     return <div className="p-8 text-center sv-theme-muted">Empresa não encontrada em companies.</div>;
  }

  return (
    <div className="sv-page sv-page--scroll-y p-8 max-w-4xl mx-auto font-sans h-full w-full">
      <div className="flex items-center gap-3 mb-8 pb-4 border-b border-[var(--border-color)]">
        <div className="w-12 h-12 bg-[var(--color-primary)]/15 rounded-xl flex items-center justify-center text-[var(--color-primary)] border border-[var(--color-primary)]/25">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Configurações</h1>
          <p className="text-sm text-[var(--text-secondary)]">Empresa, aparência e identidade para contratos e recibos.</p>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3 text-[var(--text-secondary)]">
          <Palette className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Aparência</span>
        </div>
        <ThemeAppearanceSection />
      </div>

      {isTenantAdminRole(user?.role) && settingsCompanyId && user?.id ? (
        <div className="mb-8">
          <OwnerProjectAccessPanel callerUserId={user.id} tenantId={settingsCompanyId} />
        </div>
      ) : null}

      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--border-color)]">
        <div className="w-10 h-10 bg-[var(--color-info)]/15 rounded-lg flex items-center justify-center text-[var(--color-info)] border border-[var(--color-info)]/25">
          <Building2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Dados da empresa</h2>
          <p className="text-sm text-[var(--text-secondary)]">Informações legais e técnicas.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-8 sv-theme-card p-6 rounded-xl shadow-lg border">
        
        <div className="space-y-4">
           <h2 className="sv-theme-heading flex items-center gap-2">
             <ImagePlus className="w-5 h-5 sv-theme-section-icon" />
             Identidade Visual
           </h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* UPLOAD LOGO */}
              <div className="sv-theme-upload-zone p-4 rounded-lg transition-all hover:border-[var(--brand-primary)]">
                 <label className="sv-theme-label mb-3">Logotipo (PNG, JPG - Máx 5MB)</label>
                 <div className="flex items-center gap-4">
                     <div className="w-20 h-20 rounded-md sv-theme-upload-preview flex items-center justify-center overflow-hidden flex-shrink-0">
                         {company?.logo_url ? (
                             <img src={company.logo_url} alt="Logo" className="w-full h-full object-contain" />
                         ) : (
                             <span className="text-[10px] sv-theme-muted font-medium">Sem Logo</span>
                         )}
                     </div>
                     <div className="flex-1">
                         <input type="file" accept="image/*" className="hidden" ref={logoInputRef} onChange={handleLogoUpload} />
                         <button 
                             type="button"
                             onClick={() => logoInputRef.current?.click()}
                             disabled={uploadingLogo} 
                             className="sv-theme-upload-btn"
                         >
                             {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                             Fazer Upload da Logo
                         </button>
                         <p className="text-[10px] sv-theme-muted mt-2 leading-tight">Será usada na barra lateral e no cabeçalho dos contratos.</p>
                     </div>
                 </div>
              </div>
              
              {/* UPLOAD ASSINATURA */}
              <div className="sv-theme-upload-zone p-4 rounded-lg transition-all hover:border-[var(--brand-primary)]">
                 <label className="sv-theme-label mb-3">Assinatura Digital (PNG, JPG)</label>
                 <div className="flex items-center gap-4">
                     <div className="w-24 h-16 rounded-md sv-theme-upload-preview flex items-center justify-center overflow-hidden flex-shrink-0">
                         {company?.signature_url ? (
                             <img src={company.signature_url} alt="Assinatura" className="w-full h-full object-contain" />
                         ) : (
                             <span className="text-[10px] sv-theme-muted font-medium">Sem Assinatura</span>
                         )}
                     </div>
                     <div className="flex-1">
                         <input type="file" accept="image/*" className="hidden" ref={signatureInputRef} onChange={handleSignatureUpload} />
                         <button 
                             type="button"
                             onClick={() => signatureInputRef.current?.click()}
                             disabled={uploadingSignature} 
                             className="sv-theme-upload-btn"
                         >
                             {uploadingSignature ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                             Upload Assinatura
                         </button>
                         <p className="text-[10px] sv-theme-muted mt-2 leading-tight">Aparecerá automaticamente no campo do vendedor nos contratos.</p>
                     </div>
                 </div>
              </div>
              
           </div>
        </div>

        <div className="space-y-4">
           <h2 className="sv-theme-heading flex items-center gap-2">
             <Building2 className="w-5 h-5 sv-theme-section-icon" />
             Dados Principais
           </h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <label className="sv-theme-label">Nome Fantasia *</label>
                 <input type="text" required name="fantasy_name" value={company?.fantasy_name || company?.name || ''} onChange={handleChange} className="sv-theme-field" />
              </div>
              <div>
                 <label className="sv-theme-label">CNPJ</label>
                 <input type="text" name="cnpj" value={company?.cnpj || ''} onChange={handleChange} className="sv-theme-field" />
              </div>
           </div>
        </div>

        <div className="space-y-4">
           <h2 className="sv-theme-heading">Contato e Endereço</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <label className="sv-theme-label">Telefone</label>
                 <input type="text" name="phone" value={company?.phone || ''} onChange={handleChange} className="sv-theme-field" />
              </div>
              <div>
                 <label className="sv-theme-label">E-mail</label>
                 <input type="email" name="email" value={company?.email || ''} onChange={handleChange} className="sv-theme-field" />
              </div>
              <div className="md:col-span-2">
                 <label className="sv-theme-label">Endereço Completo</label>
                 <input type="text" name="address" value={company?.address || ''} onChange={handleChange} className="sv-theme-field" placeholder="Rua, Número, Bairro, Complemento" />
              </div>
              <div>
                 <label className="sv-theme-label">Cidade</label>
                 <input type="text" name="city" value={company?.city || ''} onChange={handleChange} className="sv-theme-field" />
              </div>
              <div>
                 <label className="sv-theme-label">UF</label>
                 <input type="text" name="state" value={company?.state || ''} onChange={handleChange} className="sv-theme-field" maxLength={2} placeholder="Ex: SP" />
              </div>
              <div>
                 <label className="sv-theme-label">CEP</label>
                 <input type="text" name="zip_code" value={company?.zip_code || ''} onChange={handleChange} className="sv-theme-field" />
              </div>
           </div>
        </div>

        <div className="space-y-4">
           <h2 className="sv-theme-heading flex items-center gap-2">
             <HardHat className="w-5 h-5 text-[var(--brand-primary)]" />
             Responsável Técnico
           </h2>
           <p className="text-xs sv-theme-muted">
             Alimenta automaticamente prancha PDF, memorial, contratos, relatórios e recibos técnicos.
           </p>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <label className="sv-theme-label">Nome do Responsável Técnico *</label>
                 <input type="text" name="name" value={technical.name} onChange={handleTechChange} placeholder="Severino José de França" className="sv-theme-field" />
              </div>
              <div>
                 <label className="sv-theme-label">Cargo / Função</label>
                 <input type="text" name="title" value={technical.title} onChange={handleTechChange} placeholder="Técnico em Agrimensura" className="sv-theme-field" />
              </div>
              <div>
                 <label className="sv-theme-label">CREA</label>
                 <input type="text" name="crea" value={technical.crea} onChange={handleTechChange} className="sv-theme-field" />
              </div>
              <div>
                 <label className="sv-theme-label">CAU</label>
                 <input type="text" name="cau" value={technical.cau} onChange={handleTechChange} className="sv-theme-field" />
              </div>
              <div>
                 <label className="sv-theme-label">CFT</label>
                 <input type="text" name="cft" value={technical.cft} onChange={handleTechChange} placeholder="12345678900" className="sv-theme-field" />
              </div>
              <div>
                 <label className="sv-theme-label">CPF</label>
                 <input type="text" name="cpf" value={technical.cpf} onChange={handleTechChange} className="sv-theme-field" />
              </div>
              <div>
                 <label className="sv-theme-label">Telefone</label>
                 <input type="text" name="phone" value={technical.phone} onChange={handleTechChange} className="sv-theme-field" />
              </div>
              <div>
                 <label className="sv-theme-label">E-mail</label>
                 <input type="email" name="email" value={technical.email} onChange={handleTechChange} className="sv-theme-field" />
              </div>
              <div className="md:col-span-2">
                 <label className="sv-theme-label">Assinatura Digital (PNG transparente)</label>
                 <div className="flex items-center gap-4">
                   <div className="w-28 h-14 rounded-md sv-theme-upload-preview flex items-center justify-center overflow-hidden">
                     {technical.signature_url ? (
                       <img src={technical.signature_url} alt="Assinatura RT" className="w-full h-full object-contain" />
                     ) : (
                       <span className="text-[10px] sv-theme-muted">Sem assinatura</span>
                     )}
                   </div>
                   <input type="file" accept="image/png,image/*" className="hidden" ref={techSignatureInputRef} onChange={handleTechSignatureUpload} />
                   <button type="button" onClick={() => techSignatureInputRef.current?.click()} disabled={uploadingTechSignature} className="sv-theme-upload-btn">
                     {uploadingTechSignature ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                     Upload assinatura
                   </button>
                 </div>
              </div>
              <div className="md:col-span-2">
                 <label className="sv-theme-label">Carimbo Técnico (PNG opcional)</label>
                 <div className="flex items-center gap-4">
                   <div className="w-28 h-14 rounded-md sv-theme-upload-preview flex items-center justify-center overflow-hidden">
                     {technical.stamp_url ? (
                       <img src={technical.stamp_url} alt="Carimbo RT" className="w-full h-full object-contain" />
                     ) : (
                       <span className="text-[10px] sv-theme-muted">Sem carimbo</span>
                     )}
                   </div>
                   <input type="file" accept="image/png,image/*" className="hidden" ref={techStampInputRef} onChange={handleTechStampUpload} />
                   <button type="button" onClick={() => techStampInputRef.current?.click()} disabled={uploadingTechStamp} className="sv-theme-upload-btn">
                     {uploadingTechStamp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                     Upload carimbo
                   </button>
                 </div>
              </div>
           </div>
        </div>

        <div className="space-y-4">
           <h2 className="sv-theme-heading">Dados do Responsável / Representante Legal</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <label className="sv-theme-label">Nome do Responsável</label>
                 <input type="text" name="legal_representative" value={company?.legal_representative || ''} onChange={handleChange} className="sv-theme-field" />
              </div>
              <div>
                 <label className="sv-theme-label">CPF do Responsável</label>
                 <input type="text" name="representative_cpf" value={company?.representative_cpf || ''} onChange={handleChange} className="sv-theme-field" />
              </div>
           </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-[var(--border-color)] mt-8">
           <button type="submit" disabled={submitting} className="flex items-center gap-2 px-6 py-2.5 sv-brand-btn-primary font-medium rounded-lg transition-colors disabled:opacity-50">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Salvar Configurações
           </button>
        </div>

      </form>
    </div>
  );
}
