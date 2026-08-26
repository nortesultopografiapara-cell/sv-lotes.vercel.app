'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  COMPANY_SETTINGS_COLUMNS,
  COMPANY_SETTINGS_COLUMNS_BASE,
  COMPANY_SETTINGS_COLUMNS_EXTENDED_CORE_ONLY,
  COMPANY_SETTINGS_COLUMNS_WITHOUT_LEGAL_QUAL,
  COMPANY_SETTINGS_COLUMNS_WITHOUT_SECOND_VENDOR,
  buildCompanySettingsSavePayload,
  technicalFromCompanyRow,
  type TechnicalResponsibleFormState,
} from '@/lib/companySettingsFields';
import {
  emptyContractSecondVendorFields,
  parseContractSecondVendorJson,
  type ContractSecondVendorFields,
} from '@/lib/contractSecondVendor';
import { DEMO_SENSITIVE_SETTINGS_MESSAGE, isDemoProfile } from '@/lib/demoRestrictions';
import { formatCpfCnpj } from '@/lib/inputMasks';

const PLATFORM_ADMIN_ROLES = ['SUPER_ADMIN', 'MASTER-ADMIN', 'MASTER_ADMIN'];

export function resolveSettingsCompanyId(
  user: { tenant_id?: string; company_id?: string; role?: string } | null,
): string | null {
  if (!user) return null;
  if (typeof window !== 'undefined') {
    const impersonating = localStorage.getItem('impersonating_tenant_id');
    if (impersonating && user.role && PLATFORM_ADMIN_ROLES.includes(user.role)) {
      return impersonating;
    }
  }
  return user.tenant_id || user.company_id || null;
}

type UseCompanySettingsFormOptions = {
  user: { tenant_id?: string; company_id?: string; role?: string; is_demo?: boolean | null } | null;
  authLoading: boolean;
  normalizeAddressOnSave?: boolean;
  syncNameFromFantasy?: boolean;
};

export function useCompanySettingsForm({
  user,
  authLoading,
  normalizeAddressOnSave = false,
  syncNameFromFantasy = false,
}: UseCompanySettingsFormOptions) {
  const readOnlyDemo = isDemoProfile(user);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const [technical, setTechnical] = useState<TechnicalResponsibleFormState>({
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

  const logoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const companyStampInputRef = useRef<HTMLInputElement>(null);
  const techSignatureInputRef = useRef<HTMLInputElement>(null);
  const techStampInputRef = useRef<HTMLInputElement>(null);

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [uploadingCompanyStamp, setUploadingCompanyStamp] = useState(false);
  const [uploadingTechSignature, setUploadingTechSignature] = useState(false);
  const [uploadingTechStamp, setUploadingTechStamp] = useState(false);

  useEffect(() => {
    async function loadCompany() {
      const companyId = resolveSettingsCompanyId(user);
      if (!companyId) {
        setLoading(false);
        return;
      }

      let { data, error } = await supabase
        .from('companies')
        .select(COMPANY_SETTINGS_COLUMNS)
        .eq('id', companyId)
        .single();

      if (error && /contract_second_vendor_json/i.test(String(error.message || ''))) {
        console.warn('[settings] coluna contract_second_vendor_json ausente — select sem ela');
        const mid = await supabase
          .from('companies')
          .select(COMPANY_SETTINGS_COLUMNS_WITHOUT_SECOND_VENDOR)
          .eq('id', companyId)
          .single();
        data = mid.data;
        error = mid.error;
      }

      if (error && /contract_legal_rg_uf|legal_representative_address/i.test(String(error.message || ''))) {
        console.warn('[settings] colunas de qualificação do representante ausentes — select sem elas');
        const mid = await supabase
          .from('companies')
          .select(COMPANY_SETTINGS_COLUMNS_WITHOUT_LEGAL_QUAL)
          .eq('id', companyId)
          .single();
        data = mid.data;
        error = mid.error;
      }

      if (error && /contract_second_vendor_json|contract_legal_rg_uf|legal_representative_address/i.test(String(error.message || ''))) {
        const mid = await supabase
          .from('companies')
          .select(COMPANY_SETTINGS_COLUMNS_EXTENDED_CORE_ONLY)
          .eq('id', companyId)
          .single();
        data = mid.data;
        error = mid.error;
      }

      if (error) {
        console.warn('[settings] fallback para colunas base (pré-v2)', error.message);
        const fallback = await supabase
          .from('companies')
          .select(COMPANY_SETTINGS_COLUMNS_BASE)
          .eq('id', companyId)
          .single();
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        console.error('[settings] erro ao carregar companies', error);
      }

      if (!error && data) {
        const row = data as Record<string, unknown>;
        setCompany({
          ...row,
          contract_second_vendor_json: parseContractSecondVendorJson(
            row.contract_second_vendor_json,
          ),
        });
        setTechnical(technicalFromCompanyRow(row));
      }

      setLoading(false);
    }

    if (user && !authLoading) {
      void loadCompany();
    }
  }, [user, authLoading]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    setCompany((prev) => (prev ? { ...prev, [e.target.name]: e.target.value } : prev));
  };

  const handleSecondVendorChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    const field = name.replace(/^second_vendor_/, '') as keyof ContractSecondVendorFields;
    setCompany((prev) => {
      if (!prev) return prev;
      const current = parseContractSecondVendorJson(prev.contract_second_vendor_json);
      const nextValue =
        field === 'cpf' ? formatCpfCnpj(value) || value : value;
      const next: ContractSecondVendorFields = {
        ...emptyContractSecondVendorFields(),
        ...current,
        [field]: nextValue,
      };
      return { ...prev, contract_second_vendor_json: next };
    });
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setCompany((prev) => (prev ? { ...prev, [name]: checked } : prev));
  };

  const uploadImage = useCallback(
    async (file: File, type: 'logo' | 'signature') => {
      if (readOnlyDemo) {
        alert(DEMO_SENSITIVE_SETTINGS_MESSAGE);
        return null;
      }
      const tenantPath = resolveSettingsCompanyId(user) || String(company?.id ?? '');
      if (!tenantPath) return null;
      if (file.size > 5 * 1024 * 1024) {
        alert('A imagem deve ter no máximo 5MB.');
        return null;
      }

      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `${type}-${Date.now()}.${fileExt}`;
      const filePath = `${tenantPath}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(filePath, file, { upsert: true, cacheControl: '3600' });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        alert('Erro no upload: ' + uploadError.message);
        return null;
      }

      const { data } = supabase.storage.from('company-assets').getPublicUrl(filePath);
      return data.publicUrl;
    },
    [user, company?.id, readOnlyDemo],
  );

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const companyId = resolveSettingsCompanyId(user) || String(company?.id ?? '');
    if (!e.target.files?.length || !companyId) return;
    setUploadingLogo(true);
    const url = await uploadImage(e.target.files[0], 'logo');
    if (url) {
      setCompany((prev) => (prev ? { ...prev, logo_url: url } : prev));
      await supabase.from('companies').update({ logo_url: url }).eq('id', companyId);
      window.dispatchEvent(new Event('company_updated'));
    }
    setUploadingLogo(false);
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const companyId = resolveSettingsCompanyId(user) || String(company?.id ?? '');
    if (!e.target.files?.length || !companyId) return;
    setUploadingSignature(true);
    const url = await uploadImage(e.target.files[0], 'signature');
    if (url) {
      setCompany((prev) => (prev ? { ...prev, signature_url: url } : prev));
      await supabase.from('companies').update({ signature_url: url }).eq('id', companyId);
    }
    setUploadingSignature(false);
  };

  const handleCompanyStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const companyId = resolveSettingsCompanyId(user) || String(company?.id ?? '');
    if (!e.target.files?.length || !companyId) return;
    setUploadingCompanyStamp(true);
    const url = await uploadImage(e.target.files[0], 'signature');
    if (url) {
      setCompany((prev) => (prev ? { ...prev, company_stamp_url: url } : prev));
      await supabase.from('companies').update({ company_stamp_url: url }).eq('id', companyId);
    }
    setUploadingCompanyStamp(false);
  };

  const handleTechChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setTechnical((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleTechSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploadingTechSignature(true);
    const url = await uploadImage(e.target.files[0], 'signature');
    if (url) setTechnical((prev) => ({ ...prev, signature_url: url }));
    setUploadingTechSignature(false);
  };

  const handleTechStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploadingTechStamp(true);
    const url = await uploadImage(e.target.files[0], 'signature');
    if (url) setTechnical((prev) => ({ ...prev, stamp_url: url }));
    setUploadingTechStamp(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (readOnlyDemo) {
      alert(DEMO_SENSITIVE_SETTINGS_MESSAGE);
      return;
    }

    const companyId = resolveSettingsCompanyId(user);
    if (!companyId) {
      alert(
        'Empresa não identificada. ADMIN: verifique tenant_id. SUPER_ADMIN: selecione a empresa (impersonação).',
      );
      return;
    }

    if (!company) return;

    setSubmitting(true);

    const built = buildCompanySettingsSavePayload(company, technical, {
      normalizeAddress: normalizeAddressOnSave,
      syncNameFromFantasy,
    });
    if (!built.ok) {
      setSubmitting(false);
      alert(built.error);
      return;
    }
    const payload = built.payload;

    const { data: updateData, error: updateError } = await supabase
      .from('companies')
      .update(payload)
      .eq('id', companyId)
      .select(COMPANY_SETTINGS_COLUMNS)
      .single();

    if (updateError) {
      console.error('[settings] erro no update', updateError);
      setSubmitting(false);
      alert('Erro ao salvar: ' + updateError.message);
      return;
    }

    if (!updateData) {
      setSubmitting(false);
      alert('Nenhuma linha atualizada em companies (verifique RLS ou company_id).');
      return;
    }

    const { data: reloaded, error: reloadError } = await supabase
      .from('companies')
      .select(COMPANY_SETTINGS_COLUMNS)
      .eq('id', companyId)
      .single();

    if (reloadError) {
      setSubmitting(false);
      alert('Erro ao verificar persistência: ' + reloadError.message);
      return;
    }

    const expectedName = technical.name.trim();
    const persistedName = String(reloaded?.technical_responsible_name || '').trim();
    if (expectedName && persistedName !== expectedName) {
      setSubmitting(false);
      alert('Falha ao persistir responsável técnico em companies');
      return;
    }

    setCompany({
      ...(reloaded as Record<string, unknown>),
      contract_second_vendor_json: parseContractSecondVendorJson(
        (reloaded as Record<string, unknown>).contract_second_vendor_json,
      ),
    });
    setTechnical(technicalFromCompanyRow(reloaded as Record<string, unknown>));
    setSubmitting(false);
    alert('Configurações salvas com sucesso!');
    window.dispatchEvent(new Event('company_updated'));
  };

  return {
    loading,
    submitting,
    company,
    setCompany,
    technical,
    setTechnical,
    handleChange,
    handleSecondVendorChange,
    handleCheckboxChange,
    handleSave,
    handleLogoUpload,
    handleSignatureUpload,
    handleCompanyStampUpload,
    handleTechChange,
    handleTechSignatureUpload,
    handleTechStampUpload,
    logoInputRef,
    signatureInputRef,
    companyStampInputRef,
    techSignatureInputRef,
    techStampInputRef,
    uploadingLogo,
    uploadingSignature,
    uploadingCompanyStamp,
    uploadingTechStamp,
    settingsCompanyId: resolveSettingsCompanyId(user),
    readOnlyDemo,
  };
}
