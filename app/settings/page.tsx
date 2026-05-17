'use client';

import { useState, useEffect } from 'react';
import { Settings, Save, Loader2, Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    razao_social: '',
    cnpj: '',
    address: '',
    phone: '',
    email: ''
  });

  useEffect(() => {
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
            email: data.email || ''
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
          email: formData.email
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
            Atualize os dados da sua empresa que aparecerão nos contratos gerados.
          </p>
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-3xl">
          <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
            
            {success && (
               <div className="p-4 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium">
                 Configurações salvas com sucesso!
               </div>
            )}
            
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
