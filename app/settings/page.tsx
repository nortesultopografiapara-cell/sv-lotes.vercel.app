'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { Building2, Save, Upload, Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const { user, loading: authLoading } = useSessionGuard();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [company, setCompany] = useState<any>(null);

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

  const handleSave = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!company?.id) return;
     
     setSubmitting(true);
     const { error } = await supabase
        .from('companies')
        .update({
           name: company.name,
           razao_social: company.razao_social,
           cnpj: company.cnpj,
           phone: company.phone,
           email: company.email,
           address: company.address,
           city: company.city,
           state: company.state,
           zip_code: company.zip_code,
           responsible_name: company.responsible_name,
           responsible_cpf: company.responsible_cpf,
           logo_url: company.logo_url,
           signature_url: company.signature_url
        })
        .eq('id', company.id);

     setSubmitting(false);
     if (error) {
        alert("Erro ao salvar: " + error.message);
     } else {
        alert("Configurações salvas com sucesso!");
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
      <div className="flex items-center gap-3 mb-8 pb-4 border-b">
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Configurações da Empresa</h1>
          <p className="text-sm text-gray-500">Gerencie os dados da empresa para uso em contratos e recibos.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        
        <div className="space-y-4">
           <h2 className="text-base font-semibold text-gray-900 border-b pb-2">Identidade Visual</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <label className="block text-xs font-semibold text-gray-700 mb-1">Logotipo (URL da Imagem)</label>
                 <input type="text" name="logo_url" value={company?.logo_url || ''} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" placeholder="https://..." />
                 {company?.logo_url && <img src={company.logo_url} alt="Logo" className="mt-2 h-12 object-contain" />}
              </div>
              <div>
                 <label className="block text-xs font-semibold text-gray-700 mb-1">Assinatura Digital (URL da Imagem)</label>
                 <input type="text" name="signature_url" value={company?.signature_url || ''} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" placeholder="https://..." />
                 {company?.signature_url && <img src={company.signature_url} alt="Assinatura" className="mt-2 h-12 object-contain" />}
              </div>
           </div>
        </div>

        <div className="space-y-4">
           <h2 className="text-base font-semibold text-gray-900 border-b pb-2">Dados Principais</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <label className="block text-xs font-semibold text-gray-700 mb-1">Nome Fantasia *</label>
                 <input type="text" required name="name" value={company?.name || ''} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
              </div>
              <div>
                 <label className="block text-xs font-semibold text-gray-700 mb-1">Razão Social</label>
                 <input type="text" name="razao_social" value={company?.razao_social || ''} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
              </div>
              <div>
                 <label className="block text-xs font-semibold text-gray-700 mb-1">CNPJ</label>
                 <input type="text" name="cnpj" value={company?.cnpj || ''} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
              </div>
           </div>
        </div>

        <div className="space-y-4">
           <h2 className="text-base font-semibold text-gray-900 border-b pb-2">Contato e Endereço</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <label className="block text-xs font-semibold text-gray-700 mb-1">Telefone</label>
                 <input type="text" name="phone" value={company?.phone || ''} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
              </div>
              <div>
                 <label className="block text-xs font-semibold text-gray-700 mb-1">E-mail</label>
                 <input type="email" name="email" value={company?.email || ''} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
              </div>
              <div className="md:col-span-2">
                 <label className="block text-xs font-semibold text-gray-700 mb-1">Endereço Completo</label>
                 <input type="text" name="address" value={company?.address || ''} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
              </div>
              <div>
                 <label className="block text-xs font-semibold text-gray-700 mb-1">Cidade</label>
                 <input type="text" name="city" value={company?.city || ''} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
              </div>
              <div>
                 <label className="block text-xs font-semibold text-gray-700 mb-1">UF</label>
                 <input type="text" name="state" value={company?.state || ''} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" maxLength={2} placeholder="Ex: SP" />
              </div>
              <div>
                 <label className="block text-xs font-semibold text-gray-700 mb-1">CEP</label>
                 <input type="text" name="zip_code" value={company?.zip_code || ''} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
              </div>
           </div>
        </div>

        <div className="space-y-4">
           <h2 className="text-base font-semibold text-gray-900 border-b pb-2">Dados do Responsável / Representante Legal</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <label className="block text-xs font-semibold text-gray-700 mb-1">Nome do Responsável</label>
                 <input type="text" name="responsible_name" value={company?.responsible_name || ''} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
              </div>
              <div>
                 <label className="block text-xs font-semibold text-gray-700 mb-1">CPF do Responsável</label>
                 <input type="text" name="responsible_cpf" value={company?.responsible_cpf || ''} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
              </div>
           </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
           <button type="submit" disabled={submitting} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Salvar Configurações
           </button>
        </div>

      </form>
    </div>
  );
}
