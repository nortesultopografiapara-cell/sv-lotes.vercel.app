'use client';

import { useState, useEffect, useRef } from 'react';
import { Settings, Save, Loader2, Building2, Upload, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    razao_social: '',
    cnpj: '',
    address: '',
    phone: '',
    email: '',
    logo_url: ''
  });

  useEffect(() => {
    if (!authLoading && user && user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN' && user.role !== 'ADMIN_TENANT') {
       router.replace('/dashboard');
    }

    async function loadCompany() {
      if (!user || !user.tenant_id) return;
      
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .eq('id', user.tenant_id)
          .single();
          
        if (error) throw error;
        
        if (data) {
          setFormData({
            name: data.name || '',
            razao_social: data.razao_social || '',
            cnpj: data.cnpj || '',
            address: data.address || '',
            phone: data.phone || '',
            email: data.email || '',
            logo_url: data.logo_url || ''
          });
        }
      } catch (err) {
        console.error('Error loading company data:', err);
      } finally {
        setLoading(false);
      }
    }
    
    loadCompany();
  }, [user]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !user.tenant_id) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("A imagem deve ter no máximo 2MB.");
      return;
    }

    setUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `logos/${user.tenant_id}/logo_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('company-logos')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, logo_url: publicUrl }));
      
      // Update directly in DB immediately
      await supabase
         .from('companies')
         .update({ logo_url: publicUrl })
         .eq('id', user.tenant_id);
         
    } catch (err: any) {
      console.error('Upload error:', err);
      alert('Erro ao fazer upload da logomarca: ' + err.message);
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.tenant_id) return;
    
    setSaving(true);
    setSuccess(false);
    
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          name: formData.name,
          razao_social: formData.razao_social,
          cnpj: formData.cnpj,
          address: formData.address,
          phone: formData.phone,
          email: formData.email,
          logo_url: formData.logo_url
        })
        .eq('id', user.tenant_id);
        
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving company:', err);
      alert('Erro ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
     return (
       <div className="flex-1 w-full h-full flex items-center justify-center bg-gray-50/50">
          <Loader2 className="w-8 h-8 text-[#f59e0b] animate-spin" />
       </div>
     );
  }

  return (
      <div className="flex flex-col h-full bg-gray-50/50 p-6 md:p-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-[#f59e0b]" />
            Configurações da Empresa
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Atualize os dados e a identidade visual da sua empresa.
          </p>
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-3xl">
          <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
            
            {success && (
               <div className="p-4 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium">
                 Configurações salvas com sucesso!
               </div>
            )}
            
            {/* Logo Upload */}
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6 pb-6 border-b border-gray-100">
               <div className="relative w-24 h-24 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {formData.logo_url ? (
                     <Image src={formData.logo_url} alt="Logo da Empresa" fill className="object-contain p-2" unoptimized referrerPolicy="no-referrer" />
                  ) : (
                     <ImageIcon className="w-8 h-8 text-gray-300" />
                  )}
                  {uploadingLogo && (
                     <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                     </div>
                  )}
               </div>
               <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-1">Logomarca da Empresa</h3>
                  <p className="text-xs text-gray-500 mb-3 block max-w-sm">Recomendado: imagem quadrada ou horizontal (PNG, JPG) com fundo transparente. Máx: 2MB.</p>
                  
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleLogoUpload}
                  />
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                     <Upload className="w-4 h-4" />
                     {formData.logo_url ? 'Trocar Logomarca' : 'Fazer Upload'}
                  </button>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Nome Fantasia</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#f59e0b]/50 focus:border-[#f59e0b]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Razão Social</label>
                <input 
                  type="text" 
                  value={formData.razao_social}
                  onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#f59e0b]/50 focus:border-[#f59e0b]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">CNPJ</label>
                <input 
                  type="text" 
                  value={formData.cnpj}
                  onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#f59e0b]/50 focus:border-[#f59e0b]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Telefone</label>
                <input 
                  type="text" 
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#f59e0b]/50 focus:border-[#f59e0b]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">E-mail de Contato</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#f59e0b]/50 focus:border-[#f59e0b]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Endereço Completo</label>
                <input 
                  type="text" 
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Av. Exemplo, 1000 - Bairro, Cidade - UF"
                  className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#f59e0b]/50 focus:border-[#f59e0b]"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button 
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Configurações
              </button>
            </div>
          </form>
        </div>
      </div>
  );
}
