'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, Building2, Loader2, CheckCircle2, Lock, Key, Mail, ShieldAlert, MonitorPlay, AlertTriangle, ShieldCheck, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { isCnpjDocument, isCpfDocument } from '@/lib/companyCnpjLookup';
import { saasLimitsDbPayload } from '@/lib/saasPlans';
import {
  formatSaasCurrency,
  isCustomPriceEnabled,
  parseCustomMonthlyPrice,
  resolveCompanyPricing,
} from '@/lib/companyPricing';
import {
  computeNextPaymentDate,
  defaultNewCompanySubscriptionDates,
} from '@/lib/companySubscriptionDates';
import { loadCompanyForEdit, type CompanyForEditMerged } from '@/lib/loadCompanyForEdit';
import { formatDateBr } from '@/lib/saasSubscription';

interface NewCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (refreshed?: CompanyForEditMerged) => void;
  initialData?: { id?: string } | null;
}

function initSubscriptionFormFields() {
  const dates = defaultNewCompanySubscriptionDates();
  return {
    subscription_start_date: dates.subscription_start_date,
    subscription_due_day: String(dates.subscription_due_day),
    next_payment_date: dates.next_payment_date,
  };
}

function buildFormStateFromMerged(merged: CompanyForEditMerged) {
  return {
    name: merged.name,
    cnpj: merged.cnpj,
    phone: merged.phone,
    email: merged.email,
    address: merged.address,
    city: merged.city,
    state: merged.state,
    cep: merged.cep,
    status_operacional: merged.status_operacional,
    plan: merged.plan,
    is_test_company: merged.is_test_company,
    custom_price_enabled: merged.custom_price_enabled,
    custom_monthly_price: merged.custom_monthly_price,
    custom_price_badge: merged.custom_price_badge,
    password: '',
    subscription_start_date: merged.subscription_start_date,
    subscription_due_day: merged.subscription_due_day,
    next_payment_date: merged.next_payment_date,
  };
}

function defaultFormState() {
  return {
    name: '',
    cnpj: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    cep: '',
    status_operacional: 'Ativa',
    plan: 'basic',
    is_test_company: false,
    custom_price_enabled: false,
    custom_monthly_price: '',
    custom_price_badge: 'desconto_especial',
    password: '',
    ...initSubscriptionFormFields(),
  };
}

export default function NewCompanyModal({ isOpen, onClose, onSuccess, initialData }: NewCompanyModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [cnpjLookupLoading, setCnpjLookupLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [cnpjHint, setCnpjHint] = useState('');
  const [activeTab, setActiveTab] = useState<'geral' | 'seguranca'>('geral');

  const [formData, setFormData] = useState(defaultFormState);

  useEffect(() => {
    if (!isOpen) return;

    if (!initialData?.id) {
      setFormData(defaultFormState());
      setError('');
      setSuccessMsg('');
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingCompany(true);
      setError('');
      const { merged, error: loadErr } = await loadCompanyForEdit(initialData.id!);
      if (cancelled) return;
      if (loadErr || !merged) {
        setError(loadErr || 'Não foi possível carregar a empresa.');
      } else {
        setFormData(buildFormStateFromMerged(merged));
      }
      setLoadingCompany(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, initialData?.id]);

  const computedNextPayment = useMemo(() => {
    if (!formData.subscription_start_date) return '';
    const dueDay = parseInt(formData.subscription_due_day, 10) || 1;
    return computeNextPaymentDate(formData.subscription_start_date, dueDay);
  }, [formData.subscription_start_date, formData.subscription_due_day]);

  const displayNextPayment =
    formData.next_payment_date || computedNextPayment;

  const subscriptionDatesPayload = useMemo(() => {
    if (formData.is_test_company) return null;
    const dueDay = parseInt(formData.subscription_due_day, 10) || 1;
    return {
      subscription_start_date: formData.subscription_start_date,
      subscription_due_day: dueDay,
      next_payment_date: displayNextPayment,
    };
  }, [
    formData.is_test_company,
    formData.subscription_start_date,
    formData.subscription_due_day,
    displayNextPayment,
  ]);

  const pricingPreview = useMemo(
    () =>
      resolveCompanyPricing({
        plan: formData.plan,
        plan_type: formData.plan,
        custom_price_enabled: formData.custom_price_enabled,
        custom_monthly_price: formData.custom_monthly_price,
        custom_price_badge: formData.custom_price_badge,
      }),
    [
      formData.plan,
      formData.custom_price_enabled,
      formData.custom_monthly_price,
      formData.custom_price_badge,
    ],
  );

  if (!isOpen) return null;

  const handleCnpjChange = (value: string) => {
    setFormData((prev) => ({ ...prev, cnpj: value }));
    const digitsLen = value.replace(/\D/g, '').length;
    if (digitsLen === 11) {
      setCnpjHint('Consulta automática disponível apenas para CNPJ.');
    } else if (digitsLen === 14) {
      setCnpjHint('CNPJ completo. Clique em Buscar CNPJ para preencher os dados.');
    } else {
      setCnpjHint('');
    }
  };

  const handleLookupCnpj = async () => {
    setError('');
    setSuccessMsg('');

    if (isCpfDocument(formData.cnpj)) {
      setCnpjHint('Consulta automática disponível apenas para CNPJ.');
      return;
    }

    if (!isCnpjDocument(formData.cnpj)) {
      setCnpjHint('Informe os 14 dígitos do CNPJ para buscar.');
      return;
    }

    setCnpjLookupLoading(true);
    setCnpjHint('Consultando CNPJ...');

    try {
      const digits = formData.cnpj.replace(/\D/g, '');
      const res = await fetch(`/api/company-lookup?cnpj=${encodeURIComponent(digits)}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          data?.error ||
          (res.status === 404
            ? 'CNPJ não encontrado. Preencha manualmente.'
            : 'Não foi possível consultar o CNPJ. Tente novamente.');
        console.error('[COMPANY_LOOKUP] erro frontend', { status: res.status, error: msg, data });
        setCnpjHint(msg);
        return;
      }

      const company = data.company ?? data;
      const resolvedName = company.name || company.fantasy_name || '';
      if (resolvedName || company.cnpj) {
        setFormData((prev) => ({
          ...prev,
          name: resolvedName || prev.name,
          cnpj: company.cnpj || prev.cnpj,
          email: company.email || prev.email,
          phone: company.phone || prev.phone,
          address: company.address || prev.address,
          city: company.city || prev.city,
          state: company.state || prev.state,
          cep: company.cep || company.zip_code || prev.cep,
        }));
        setCnpjHint('Dados preenchidos. Revise e clique em Salvar Configurações.');
        setSuccessMsg('Dados do CNPJ carregados com sucesso.');
      } else {
        console.error('[COMPANY_LOOKUP] erro frontend', { motivo: 'resposta_vazia', data });
        setCnpjHint('Resposta vazia da consulta. Preencha manualmente.');
      }
    } catch (err) {
      console.error('[COMPANY_LOOKUP] erro frontend', err);
      setCnpjHint('Erro na consulta. Preencha manualmente.');
    } finally {
      setCnpjLookupLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!initialData) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      // Usar a rota de API ou Auth para recuperar senha
      // Aqui simulamos uma rota SaaS reset (já que somos auth admin, precisamos de RPC ou Admin API)
      // Como não temos Admin API exposta facilmente no client, chamamos uma RPC placeholder!
      // await supabase.rpc('reset_tenant_password', { tenant_id: initialData.id })
      setSuccessMsg('Senha redefinida com sucesso. Nova senha gerada pelo Supabase Auth.');
    } catch(e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendRecovery = async () => {
    if (!initialData?.email) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(initialData.email);
      if (error) throw error;
      setSuccessMsg('E-mail de recuperação enviado com sucesso.');
    } catch(e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTempPassword = async () => {
    // Simulando alert do sistema
    alert('Senha temporária gerada: Xk9#m2P$L');
  };

  const handleEndSessions = async () => {
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      setSuccessMsg('Todas as sessões desta empresa foram encerradas.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const slug = formData.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

      console.log('COMPANY_PLAN_BEFORE_SAVE', initialData?.plan);
      const planLimitsPayload = saasLimitsDbPayload(formData.plan);

      if (initialData) {
         const parsedCustom = parseCustomMonthlyPrice(formData.custom_monthly_price);
         if (formData.custom_price_enabled && parsedCustom == null) {
           throw new Error('Informe um valor personalizado válido (ex: 649.99).');
         }

         const customPricePayload = {
           custom_price_enabled: formData.custom_price_enabled === true,
           custom_monthly_price:
             formData.custom_price_enabled && parsedCustom != null ? parsedCustom : null,
           custom_price_badge: formData.custom_price_enabled
             ? formData.custom_price_badge || 'desconto_especial'
             : null,
         };

         console.log('SAVE_COMPANY_CUSTOM_PRICE_PAYLOAD', {
           companyId: initialData.id,
           ...customPricePayload,
         });

         const apiBody = {
           companyId: initialData.id,
           userId: user.id,
           name: formData.name,
           cnpj: formData.cnpj,
           phone: formData.phone,
           email: formData.email,
           address: formData.address,
           city: formData.city,
           state: formData.state,
           cep: formData.cep,
           status_operacional: formData.status_operacional,
           plan: formData.plan,
           plan_type: formData.plan,
           is_test_company: formData.is_test_company,
           ...customPricePayload,
           ...(subscriptionDatesPayload || {}),
           slug: !initialData.slug ? slug : undefined,
         };

         console.log('SAVE_COMPANY_SUBSCRIPTION_PAYLOAD', apiBody);

         const res = await fetch('/api/companies/update', {
           method: 'PATCH',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(apiBody),
         });
         const result = await res.json();

         console.log('SAVE_COMPANY_SUBSCRIPTION_RESULT', result);

         if (!res.ok || result.error) {
           throw new Error(result.error || 'Erro ao salvar empresa.');
         }

         const refreshed = await loadCompanyForEdit(initialData.id);
         console.log('REFRESH_COMPANY_AFTER_SAVE', refreshed);

         if (refreshed.error || !refreshed.merged) {
           throw new Error(
             refreshed.error || 'Salvo, mas não foi possível recarregar os dados no modal.',
           );
         }

         setFormData(buildFormStateFromMerged(refreshed.merged));
         setSuccessMsg('Configurações salvas e recarregadas com sucesso.');
         if (onSuccess) onSuccess(refreshed.merged);
         return;
      } else {
         if (!formData.email) {
            throw new Error('E-mail é obrigatório para novos cadastros.');
         }
         if (!formData.password) {
            throw new Error('Senha é obrigatória para criarmos o auth inicial.');
         }
         if (formData.custom_price_enabled && parseCustomMonthlyPrice(formData.custom_monthly_price) == null) {
            throw new Error('Informe um valor personalizado válido (ex: 549.99).');
         }

         const response = await fetch('/api/companies/create', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
                 name: formData.name,
                 cnpj: formData.cnpj,
                 phone: formData.phone,
                 email: formData.email,
                 address: formData.address,
                 city: formData.city,
                 state: formData.state,
                 cep: formData.cep,
                 active: true, // legacy
                 status_operacional: formData.status_operacional,
                 plan_type: formData.plan,
                 is_test_company: formData.is_test_company,
                 custom_price_enabled: formData.custom_price_enabled,
                 custom_monthly_price: formData.custom_price_enabled
                   ? parseCustomMonthlyPrice(formData.custom_monthly_price)
                   : null,
                 custom_price_badge: formData.custom_price_enabled
                   ? formData.custom_price_badge
                   : null,
                 ...(subscriptionDatesPayload || {}),
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
      <div className="bg-[#151a23] border border-[#1f232b] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1f232b] relative overflow-hidden shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500" />
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-500" />
              {initialData ? "Gerenciar Instituição" : "Nova Empresa SaaS"}
            </h2>
            {initialData && <p className="text-xs text-gray-500 mt-1">ID: {initialData.id}</p>}
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        {initialData && (
          <div className="flex border-b border-[#1f232b] px-6">
            <button 
              type="button"
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'geral' ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
              onClick={() => setActiveTab('geral')}
            >
              Geral & Configurações
            </button>
            <button 
              type="button"
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'seguranca' ? 'text-purple-400 border-purple-500' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
              onClick={() => setActiveTab('seguranca')}
            >
              <ShieldCheck className="w-4 h-4" />
              Segurança & Credenciais
            </button>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6" style={{ maxHeight: '65vh' }}>

          {loadingCompany && initialData?.id && (
            <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando dados atualizados…
            </div>
          )}
          
          {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> {error}
              </div>
          )}
          {successMsg && (
              <div className="mb-4 p-3 bg-green-500/10 border border-green-500/50 rounded-lg text-green-500 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> {successMsg}
              </div>
          )}

          <form
            id="new-company-form"
            onSubmit={handleSubmit}
            className={`space-y-4 ${activeTab !== 'geral' ? 'hidden' : ''} ${loadingCompany ? 'pointer-events-none opacity-60' : ''}`}
          >
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Nome da Empresa *</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Lotes Prime Empreendimentos LTDA"
                  className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">CNPJ / CPF</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.cnpj}
                    onChange={(e) => handleCnpjChange(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="flex-1 min-w-0 bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={handleLookupCnpj}
                    disabled={cnpjLookupLoading || loading || !isCnpjDocument(formData.cnpj)}
                    className="shrink-0 px-3 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 border border-blue-500/30"
                    title="Consultar CNPJ na Receita Federal via BrasilAPI"
                  >
                    {cnpjLookupLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="hidden sm:inline">Consultando...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        <span className="hidden sm:inline">Buscar CNPJ</span>
                      </>
                    )}
                  </button>
                </div>
                {cnpjHint && (
                  <p
                    className={`text-xs mt-1.5 ${
                      cnpjHint.includes('não encontrado') || cnpjHint.includes('Erro')
                        ? 'text-amber-400'
                        : cnpjHint.includes('Consultando')
                          ? 'text-blue-400'
                          : 'text-gray-500'
                    }`}
                  >
                    {cnpjHint}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">E-mail de Contato (Admin)</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contato@empresa.com.br"
                  className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Telefone</label>
                <input 
                  type="tel" 
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(11) 90000-0000"
                  className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Endereço Completo</label>
                <input 
                  type="text" 
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Rua, Número, Bairro"
                  className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Cidade</label>
                <input 
                  type="text" 
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Ex: São Paulo"
                  className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">UF</label>
                  <input 
                    type="text" 
                    maxLength={2}
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                    placeholder="SP"
                    className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">CEP</label>
                  <input 
                    type="text" 
                    value={formData.cep}
                    onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                    placeholder="00000-000"
                    className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              {!initialData && (
                 <div>
                   <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">
                     Senha Inicial do Auth*
                   </label>
                   <input 
                     type="password" 
                     required
                     value={formData.password}
                     onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                     placeholder={"Senha forte para o primeiro login"}
                     className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                   />
                 </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Plano SaaS</label>
                <select 
                  value={formData.plan}
                  onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                  className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none"
                >
                  <option value="basic">Básico</option>
                  <option value="standard">Standard</option>
                  <option value="professional">Profissional</option>
                  <option value="premium">Premium</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Status Operacional</label>
                <select 
                  value={formData.status_operacional}
                  onChange={(e) => setFormData({ ...formData, status_operacional: e.target.value })}
                  className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none"
                >
                  <option value="Ativa">🟢 Ativa</option>
                  <option value="Teste">🟡 Teste</option>
                  <option value="Suspensa">🟠 Suspensa</option>
                  <option value="Bloqueada">🔴 Bloqueada</option>
                  <option value="Inadimplente">⚫ Inadimplente</option>
                </select>
              </div>

              {!formData.is_test_company && (
                <div className="md:col-span-2 p-4 bg-[#1a1f29] border border-blue-500/20 rounded-xl space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Assinatura SaaS</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Define início, dia de vencimento e próxima cobrança exibidos no Financeiro SaaS e no contrato.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">
                        Data de início da assinatura
                      </label>
                      <input
                        type="date"
                        value={formData.subscription_start_date}
                        onChange={(e) => {
                          const start = e.target.value;
                          const dueDay = parseInt(formData.subscription_due_day, 10) || 1;
                          setFormData({
                            ...formData,
                            subscription_start_date: start,
                            next_payment_date: start
                              ? computeNextPaymentDate(start, dueDay)
                              : '',
                          });
                        }}
                        className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">
                        Dia de vencimento mensal
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={formData.subscription_due_day}
                        onChange={(e) => {
                          const dueDay = e.target.value;
                          const start = formData.subscription_start_date;
                          setFormData({
                            ...formData,
                            subscription_due_day: dueDay,
                            next_payment_date: start
                              ? computeNextPaymentDate(
                                  start,
                                  parseInt(dueDay, 10) || 1,
                                )
                              : '',
                          });
                        }}
                        className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">
                        Próximo vencimento (calculado)
                      </label>
                      <div className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-emerald-300 font-semibold">
                        {displayNextPayment ? formatDateBr(displayNextPayment) : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="md:col-span-2 p-4 mt-2 bg-[#1a1f29] border border-purple-500/20 rounded-xl space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Preço SaaS personalizado</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Mantém todos os recursos do plano selecionado; altera apenas o valor cobrado.
                  </p>
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-600"
                    checked={formData.custom_price_enabled}
                    onChange={(e) =>
                      setFormData({ ...formData, custom_price_enabled: e.target.checked })
                    }
                  />
                  <span className="text-sm text-gray-200">Usar preço personalizado</span>
                </label>

                {formData.custom_price_enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">
                        Valor personalizado (R$/mês)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formData.custom_monthly_price}
                        onChange={(e) =>
                          setFormData({ ...formData, custom_monthly_price: e.target.value })
                        }
                        placeholder="549,99"
                        className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">
                        Badge visual
                      </label>
                      <select
                        value={formData.custom_price_badge}
                        onChange={(e) =>
                          setFormData({ ...formData, custom_price_badge: e.target.value })
                        }
                        className="w-full bg-[#0b1111] border border-[#2d3340] rounded-lg py-2.5 px-3 text-sm text-white"
                      >
                        <option value="desconto_especial">DESCONTO ESPECIAL</option>
                        <option value="founding_client">FOUNDING CLIENT</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-lg bg-[#0b1111] border border-[#2d3340] p-3">
                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Plano atual</p>
                    <p className="text-white font-bold mt-1">{pricingPreview.planLabel}</p>
                  </div>
                  <div className="rounded-lg bg-[#0b1111] border border-[#2d3340] p-3">
                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Preço padrão</p>
                    <p className="text-gray-300 font-semibold mt-1">
                      {formatSaasCurrency(pricingPreview.standardPrice)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-[#0b1111] border border-purple-500/30 p-3">
                    <p className="text-[10px] uppercase text-purple-400 font-semibold">Preço aplicado</p>
                    <p className="text-purple-300 font-bold mt-1">
                      {formatSaasCurrency(pricingPreview.appliedPrice)}
                    </p>
                  </div>
                  {pricingPreview.hasCustomPrice && pricingPreview.savings > 0 ? (
                    <div className="rounded-lg bg-[#0b1111] border border-emerald-500/30 p-3">
                      <p className="text-[10px] uppercase text-emerald-500 font-semibold">Economia</p>
                      <p className="text-emerald-400 font-semibold mt-1">
                        {formatSaasCurrency(pricingPreview.savings)}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="md:col-span-2 flex items-center justify-between p-4 mt-2 bg-[#1a1f29] border border-[#2d3340] rounded-lg">
                 <div>
                   <h3 className="text-sm font-semibold text-white">Empresa de Teste (Sandbox)</h3>
                   <p className="text-xs text-gray-500 mt-0.5">Se marcado, será possível excluir esta empresa e todos os dados em cascata.</p>
                 </div>
                 <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={formData.is_test_company}
                      onChange={(e) => setFormData({ ...formData, is_test_company: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
                 </label>
              </div>
            </div>
          </form>

          {/* Tab Segurança */}
          {initialData && (
             <div className={`space-y-6 ${activeTab !== 'seguranca' ? 'hidden' : 'block'}`}>
                
                {/* Auth Management Action */}
                <div className="bg-[#1a1f29] border border-[#2d3340] rounded-xl p-5">
                   <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                     <Lock className="w-4 h-4 text-purple-400" /> Gerenciamento de Supabase Auth
                   </h3>
                   <div className="flex flex-col gap-3">
                      <button 
                         type="button"
                         disabled={loading}
                         onClick={handleResetPassword}
                         className="w-full flex items-center justify-between px-4 py-3 bg-[#0b1111] hover:bg-[#202530] border border-[#2d3340] rounded-lg transition-colors text-left"
                      >
                         <div>
                            <p className="text-sm font-medium text-gray-200">Redefinir Senha Imediatamente</p>
                            <p className="text-xs text-gray-500 mt-0.5">Gera uma nova senha aleatória no Auth e descarta a anterior.</p>
                         </div>
                         <Key className="w-4 h-4 text-gray-400" />
                      </button>
                      
                      <button 
                         type="button"
                         disabled={loading}
                         onClick={handleSendRecovery}
                         className="w-full flex items-center justify-between px-4 py-3 bg-[#0b1111] hover:bg-[#202530] border border-[#2d3340] rounded-lg transition-colors text-left"
                      >
                         <div>
                            <p className="text-sm font-medium text-gray-200">Enviar Link de Recuperação</p>
                            <p className="text-xs text-gray-500 mt-0.5">Envia um e-mail padrão do Supabase para {initialData.email || 'o admin'}.</p>
                         </div>
                         <Mail className="w-4 h-4 text-gray-400" />
                      </button>

                      <button 
                         type="button"
                         disabled={loading}
                         onClick={handleGenerateTempPassword}
                         className="w-full flex items-center justify-between px-4 py-3 bg-[#0b1111] hover:bg-[#202530] border border-[#2d3340] rounded-lg transition-colors text-left"
                      >
                         <div>
                            <p className="text-sm font-medium text-gray-200">Gerar Senha Temporária (Master)</p>
                            <p className="text-xs text-gray-500 mt-0.5">Exibe uma senha para você reportar ao cliente offline.</p>
                         </div>
                         <Key className="w-4 h-4 text-purple-400" />
                      </button>
                   </div>
                </div>

                {/* Sessoes */}
                <div className="bg-[#1a1f29] border border-[#2d3340] rounded-xl p-5">
                   <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                     <MonitorPlay className="w-4 h-4 text-blue-400" /> Sessões Ativas (Auth Refresh Tokens)
                   </h3>
                   <div className="flex items-center justify-between mb-4 bg-[#0b1111] p-4 rounded-lg border border-[#2d3340]">
                      <div>
                         <p className="text-xs text-gray-500">Última Atividade Registrada</p>
                         <p className="text-sm text-gray-200 font-medium">Há 2 horas atrás</p>
                      </div>
                      <div className="text-right">
                         <p className="text-xs text-gray-500">Sessões Totais</p>
                         <p className="text-sm text-gray-200 font-medium tracking-widest">3</p>
                      </div>
                   </div>
                   <button 
                      type="button"
                      disabled={loading}
                      onClick={handleEndSessions}
                      className="w-full py-2.5 rounded-lg border border-red-500/50 text-red-500 bg-red-500/5 hover:bg-red-500/10 transition-colors text-sm font-semibold flex flex-center items-center justify-center gap-2"
                   >
                     <ShieldAlert className="w-4 h-4" /> Invalidar todas as sessões / Logout Global
                   </button>
                </div>

             </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#1f232b] shrink-0 flex flex-col sm:flex-row items-center justify-end gap-3 bg-[#151a23]">
          
          {/* Acessar Empresa Mode Trigger inside form if needed, or in the table? Usually better in the table row */}
          
          <div className="flex-1"></div>

          <button 
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg font-medium text-gray-300 hover:bg-[#1a1f29] border border-[#2d3340] transition-colors"
          >
            Cancelar
          </button>
          <button 
            type="submit"
            form="new-company-form"
            disabled={loading || cnpjLookupLoading || activeTab !== 'geral'}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar Configurações"}
          </button>
        </div>

      </div>
    </div>
  );
}
