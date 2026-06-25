'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Save,
  Upload,
  Loader2,
  ImagePlus,
  Building2,
  HardHat,
  FileText,
  Banknote,
  ChevronDown,
  UserCircle,
  AlertTriangle,
  Palette,
  Users,
  Settings2,
  Info,
  Landmark,
} from 'lucide-react';
import {
  normalizeSaleContractModel,
  SALE_CONTRACT_MODEL_LABELS,
  SALE_CONTRACT_MODELS,
  type SaleContractModel,
} from '@/lib/contractModel';
import {
  resolveSaasContractPartyType,
  resolveSaasContractorParty,
} from '@/lib/saasContractParty';
import {
  isSaasContractPlaceholderValue,
  resolveSaasContractLegalRepresentative,
} from '@/lib/saasContractCompanyProfile';
import { ThemeAppearanceSection } from '@/components/settings/ThemeAppearanceSection';
import { TenantCompanyAdminsPanel } from '@/components/settings/TenantCompanyAdminsPanel';
import { DemoSensitiveNotice } from '@/components/demo/DemoSensitiveNotice';
import { DEMO_SENSITIVE_SETTINGS_MESSAGE } from '@/lib/demoRestrictions';
import type { useCompanySettingsForm } from '@/components/settings/useCompanySettingsForm';
import { BankingIntegrationPanel } from '@/components/banking/BankingIntegrationPanel';

type FormState = ReturnType<typeof useCompanySettingsForm>;

export type CompanySettingsV2Tab =
  | 'geral'
  | 'aparencia'
  | 'administradores'
  | 'contratos'
  | 'tecnico'
  | 'avancado'
  | 'bancario';

const V2_TABS: { id: CompanySettingsV2Tab; label: string; icon: typeof Building2 }[] = [
  { id: 'geral', label: 'Geral', icon: Building2 },
  { id: 'aparencia', label: 'Aparência', icon: Palette },
  { id: 'administradores', label: 'Administradores', icon: Users },
  { id: 'contratos', label: 'Contratos', icon: FileText },
  { id: 'tecnico', label: 'Técnico', icon: HardHat },
  { id: 'avancado', label: 'Avançado', icon: Settings2 },
];

type Props = Pick<
  FormState,
  | 'company'
  | 'technical'
  | 'submitting'
  | 'handleChange'
  | 'handleCheckboxChange'
  | 'handleSave'
  | 'handleLogoUpload'
  | 'handleSignatureUpload'
  | 'handleCompanyStampUpload'
  | 'handleTechChange'
  | 'handleTechSignatureUpload'
  | 'handleTechStampUpload'
  | 'logoInputRef'
  | 'signatureInputRef'
  | 'companyStampInputRef'
  | 'techSignatureInputRef'
  | 'techStampInputRef'
  | 'uploadingLogo'
  | 'uploadingSignature'
  | 'uploadingCompanyStamp'
  | 'uploadingTechSignature'
  | 'uploadingTechStamp'
> & {
  readOnlyDemo?: boolean;
  showAdmins: boolean;
  bankingUiEnabled: boolean;
  adminPanelProps?: {
    callerUserId: string;
    tenantId: string;
    impersonatingTenantId: string | null;
    readOnlyDemo?: boolean;
  };
};

function CollapsibleSection({
  id,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div id={id} className="space-y-3 scroll-mt-24">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left py-2 border-b border-[var(--border-color)]"
      >
        <div>
          <h3 className="sv-theme-heading text-base">{title}</h3>
          {subtitle ? <p className="text-xs sv-theme-muted mt-1">{subtitle}</p> : null}
        </div>
        <ChevronDown className={`w-5 h-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="pt-2">{children}</div> : null}
    </div>
  );
}

function SaveBar({ submitting, readOnlyDemo }: { submitting: boolean; readOnlyDemo?: boolean }) {
  if (readOnlyDemo) return null;
  return (
    <div className="flex justify-end pt-6 mt-6 border-t border-[var(--border-color)]">
      <button
        type="submit"
        disabled={submitting}
        className="flex items-center gap-2 px-6 py-2.5 sv-brand-btn-primary font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
        Salvar Configurações
      </button>
    </div>
  );
}

function hashToTab(hash: string): CompanySettingsV2Tab | null {
  const h = hash.replace(/^#/, '').toLowerCase();
  if (h === 'representante-legal' || h === 'geral') return 'geral';
  if (h === 'aparencia') return 'aparencia';
  if (h === 'administradores') return 'administradores';
  if (h === 'contratos') return 'contratos';
  if (h === 'tecnico') return 'tecnico';
  if (h === 'avancado') return 'avancado';
  if (h === 'bancario' || h === 'integracao-bancaria') return 'bancario';
  return null;
}

export function CompanySettingsV2Shell({
  company,
  technical,
  submitting,
  handleChange,
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
  uploadingTechSignature,
  uploadingTechStamp,
  readOnlyDemo = false,
  showAdmins,
  bankingUiEnabled,
  adminPanelProps,
}: Props) {
  const [activeTab, setActiveTab] = useState<CompanySettingsV2Tab>('geral');

  useEffect(() => {
    const syncFromHash = () => {
      const tab = hashToTab(window.location.hash);
      if (tab) {
        setActiveTab(tab);
        if (window.location.hash === '#representante-legal') {
          requestAnimationFrame(() => {
            document.getElementById('representante-legal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        }
      }
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  const selectTab = (tab: CompanySettingsV2Tab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const hash = tab === 'geral' ? '' : `#${tab}`;
      window.history.replaceState(null, '', `/settings${hash}`);
    }
  };

  if (!company) return null;

  const contractModel = normalizeSaleContractModel(company.contract_model as string);
  const isRecantoContract = contractModel === 'RECANTO_PRIMAVERA';
  const documentRaw = String(company.cnpj || '');
  const partyType = resolveSaasContractPartyType(documentRaw);
  const useTechnicalAsLegal = Boolean(company.use_technical_as_legal_rep);

  const legalRepPreview = useMemo(() => {
    if (useTechnicalAsLegal) {
      return {
        name: technical.name,
        cpf: technical.cpf,
        role: technical.title,
        email: technical.email,
        phone: technical.phone,
      };
    }
    return {
      name: String(company.legal_representative || ''),
      cpf: String(company.representative_cpf || ''),
      role: String(company.legal_representative_role || ''),
      email: String(company.legal_representative_email || ''),
      phone: String(company.legal_representative_phone || ''),
    };
  }, [useTechnicalAsLegal, technical, company]);

  const missingLegalRep =
    partyType === 'PJ' &&
    !resolveSaasContractLegalRepresentative(
      {
        legal_representative: legalRepPreview.name,
        responsible_name: legalRepPreview.name,
      },
      resolveSaasContractorParty({ cnpj: documentRaw }),
    );

  const visibleTabs = V2_TABS.filter((t) => t.id !== 'administradores' || showAdmins);
  const navTabs = bankingUiEnabled
    ? [
        ...visibleTabs,
        { id: 'bancario' as const, label: 'Integração Bancária', icon: Landmark },
      ]
    : visibleTabs;
  const showSaveBar = ['geral', 'contratos', 'tecnico', 'avancado'].includes(activeTab);

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
      <nav
        className="lg:w-52 shrink-0 flex flex-row lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0 border-b lg:border-b-0 lg:border-r border-[var(--border-color)] lg:pr-4"
        aria-label="Seções das configurações"
      >
        {navTabs.map(({ id, label, icon: Icon }) => {
          const selected = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                selected
                  ? 'sv-brand-muted-bg text-[var(--text-primary)] ring-1 ring-[color-mix(in_srgb,var(--brand-primary)_25%,transparent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
              }`}
              aria-current={selected ? 'page' : undefined}
            >
              <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-[var(--brand-primary)]' : ''}`} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 min-w-0">
        {activeTab === 'aparencia' || activeTab === 'administradores' || activeTab === 'bancario' ? (
          <div className="space-y-6">
            {activeTab === 'bancario' ? (
              <BankingIntegrationPanel tenantId={String(company.id)} readOnlyDemo={readOnlyDemo} />
            ) : null}

            {activeTab === 'aparencia' ? (
              <>
                <ThemeAppearanceSection />
                {readOnlyDemo ? (
                  <DemoSensitiveNotice message={DEMO_SENSITIVE_SETTINGS_MESSAGE} />
                ) : null}
                <div className={`sv-theme-card p-6 rounded-xl shadow-lg border space-y-6 ${readOnlyDemo ? 'opacity-60 pointer-events-none' : ''}`}>
                  <h3 className="sv-theme-heading flex items-center gap-2 text-base">
                    <ImagePlus className="w-4 h-4 sv-theme-section-icon" />
                    Logotipo, assinatura e carimbo
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="sv-theme-upload-zone p-4 rounded-lg">
                      <label className="sv-theme-label mb-3">Logotipo</label>
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-md sv-theme-upload-preview flex items-center justify-center overflow-hidden">
                          {company.logo_url ? (
                            <img src={String(company.logo_url)} alt="Logo" className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-[10px] sv-theme-muted">Sem logo</span>
                          )}
                        </div>
                        <div>
                          <input type="file" accept="image/*" className="hidden" ref={logoInputRef} onChange={handleLogoUpload} />
                          <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="sv-theme-upload-btn">
                            {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            Upload logo
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="sv-theme-upload-zone p-4 rounded-lg">
                      <label className="sv-theme-label mb-3">Assinatura digital da empresa</label>
                      <div className="flex items-center gap-4">
                        <div className="w-24 h-16 rounded-md sv-theme-upload-preview flex items-center justify-center overflow-hidden">
                          {company.signature_url ? (
                            <img src={String(company.signature_url)} alt="Assinatura" className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-[10px] sv-theme-muted">Sem assinatura</span>
                          )}
                        </div>
                        <div>
                          <input type="file" accept="image/*" className="hidden" ref={signatureInputRef} onChange={handleSignatureUpload} />
                          <button type="button" onClick={() => signatureInputRef.current?.click()} disabled={uploadingSignature} className="sv-theme-upload-btn">
                            {uploadingSignature ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            Upload assinatura
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="sv-theme-upload-zone p-4 rounded-lg md:col-span-2">
                      <label className="sv-theme-label mb-3">Carimbo da empresa</label>
                      <div className="flex items-center gap-4">
                        <div className="w-28 h-16 rounded-md sv-theme-upload-preview flex items-center justify-center overflow-hidden">
                          {company.company_stamp_url ? (
                            <img src={String(company.company_stamp_url)} alt="Carimbo" className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-[10px] sv-theme-muted">Sem carimbo</span>
                          )}
                        </div>
                        <div>
                          <input type="file" accept="image/png,image/*" className="hidden" ref={companyStampInputRef} onChange={handleCompanyStampUpload} />
                          <button type="button" onClick={() => companyStampInputRef.current?.click()} disabled={uploadingCompanyStamp} className="sv-theme-upload-btn">
                            {uploadingCompanyStamp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            Upload carimbo
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {activeTab === 'administradores' && adminPanelProps ? (
              <div className="sv-theme-card p-6 rounded-xl shadow-lg border space-y-6">
                <div>
                  <h2 className="sv-theme-heading flex items-center gap-2">
                    <Users className="w-5 h-5 sv-theme-section-icon" />
                    Administradores
                  </h2>
                  <p className="text-xs sv-theme-muted mt-1">
                    Usuários com permissão de administrador nesta empresa.
                  </p>
                </div>
                <TenantCompanyAdminsPanel {...adminPanelProps} />
              </div>
            ) : null}
          </div>
        ) : (
          <form onSubmit={handleSave} className="sv-theme-card p-6 rounded-xl shadow-lg border">
            {readOnlyDemo ? <DemoSensitiveNotice message={DEMO_SENSITIVE_SETTINGS_MESSAGE} /> : null}
            <fieldset disabled={readOnlyDemo} className={readOnlyDemo ? 'opacity-60' : undefined}>
            {activeTab === 'geral' ? (
              <div className="space-y-8">
                {missingLegalRep ? (
                  <div
                    id="alerta-representante-legal"
                    className="p-4 rounded-lg bg-red-500/10 border border-red-500/25 text-red-200 text-sm flex gap-3"
                  >
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Representante legal ausente</p>
                      <p className="mt-1 text-red-200/90">
                        Empresas PJ precisam de representante legal válido para gerar contrato SaaS. Preencha o bloco{' '}
                        <a href="#representante-legal" className="underline font-medium">
                          Representante Legal
                        </a>{' '}
                        abaixo (não use placeholders como &quot;Representante legal&quot;).
                      </p>
                    </div>
                  </div>
                ) : null}

                <section className="space-y-4">
                  <h2 className="sv-theme-heading flex items-center gap-2">
                    <Building2 className="w-5 h-5 sv-theme-section-icon" />
                    Dados da Empresa
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="sv-theme-label">Nome Fantasia / Razão Social *</label>
                      <input
                        type="text"
                        required
                        name="fantasy_name"
                        value={String(company.fantasy_name || company.name || '')}
                        onChange={handleChange}
                        className="sv-theme-field"
                      />
                    </div>
                    <div>
                      <label className="sv-theme-label">CPF/CNPJ *</label>
                      <input type="text" required name="cnpj" value={documentRaw} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div>
                      <label className="sv-theme-label">Telefone *</label>
                      <input type="text" required name="phone" value={String(company.phone || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div>
                      <label className="sv-theme-label">E-mail *</label>
                      <input type="email" required name="email" value={String(company.email || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="sv-theme-label">Endereço completo *</label>
                      <input
                        type="text"
                        required
                        name="address"
                        value={String(company.address || '')}
                        onChange={handleChange}
                        className="sv-theme-field"
                        placeholder="Rua, número, complemento"
                      />
                    </div>
                    <div>
                      <label className="sv-theme-label">Bairro</label>
                      <input type="text" name="bairro" value={String(company.bairro || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div>
                      <label className="sv-theme-label">Cidade *</label>
                      <input type="text" required name="city" value={String(company.city || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div>
                      <label className="sv-theme-label">UF *</label>
                      <input type="text" required name="state" value={String(company.state || '')} onChange={handleChange} className="sv-theme-field" maxLength={2} placeholder="PA" />
                    </div>
                    <div>
                      <label className="sv-theme-label">CEP *</label>
                      <input type="text" required name="zip_code" value={String(company.zip_code || company.cep || '')} onChange={handleChange} className="sv-theme-field" placeholder="68515-000" />
                    </div>
                  </div>
                </section>

                <section id="representante-legal" className="space-y-4 scroll-mt-24">
                  <h2 className="sv-theme-heading flex items-center gap-2">
                    <UserCircle className="w-5 h-5 sv-theme-section-icon" />
                    Representante Legal
                    {partyType === 'PJ' ? <span className="text-xs text-red-400 font-normal">(obrigatório para PJ)</span> : null}
                  </h2>
                  <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      name="use_technical_as_legal_rep"
                      checked={useTechnicalAsLegal}
                      onChange={handleCheckboxChange}
                      className="mt-1"
                    />
                    <span>Usar responsável técnico como representante legal</span>
                  </label>
                  {useTechnicalAsLegal ? (
                    <p className="text-xs sv-theme-muted">
                      Nome, CPF, e-mail e telefone serão copiados do bloco Responsável Técnico ao salvar.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="sv-theme-label">Nome do representante {partyType === 'PJ' ? '*' : ''}</label>
                        <input
                          type="text"
                          required={partyType === 'PJ'}
                          name="legal_representative"
                          value={String(company.legal_representative || '')}
                          onChange={handleChange}
                          className="sv-theme-field"
                          placeholder="Nome completo"
                        />
                        {isSaasContractPlaceholderValue(String(company.legal_representative || '')) ? (
                          <p className="text-xs text-red-400 mt-1">Valor inválido — informe o nome real do representante.</p>
                        ) : null}
                      </div>
                      <div>
                        <label className="sv-theme-label">CPF do representante {partyType === 'PJ' ? '*' : ''}</label>
                        <input
                          type="text"
                          required={partyType === 'PJ'}
                          name="representative_cpf"
                          value={String(company.representative_cpf || '')}
                          onChange={handleChange}
                          className="sv-theme-field"
                        />
                      </div>
                      <div>
                        <label className="sv-theme-label">Cargo / função {partyType === 'PJ' ? '*' : ''}</label>
                        <input
                          type="text"
                          required={partyType === 'PJ'}
                          name="legal_representative_role"
                          value={String(company.legal_representative_role || '')}
                          onChange={handleChange}
                          className="sv-theme-field"
                          placeholder="Sócio administrador"
                        />
                      </div>
                      <div>
                        <label className="sv-theme-label">E-mail {partyType === 'PJ' ? '*' : ''}</label>
                        <input
                          type="email"
                          required={partyType === 'PJ'}
                          name="legal_representative_email"
                          value={String(company.legal_representative_email || '')}
                          onChange={handleChange}
                          className="sv-theme-field"
                        />
                      </div>
                      <div>
                        <label className="sv-theme-label">Telefone {partyType === 'PJ' ? '*' : ''}</label>
                        <input
                          type="text"
                          required={partyType === 'PJ'}
                          name="legal_representative_phone"
                          value={String(company.legal_representative_phone || '')}
                          onChange={handleChange}
                          className="sv-theme-field"
                        />
                      </div>
                    </div>
                  )}
                </section>
              </div>
            ) : null}

            {activeTab === 'contratos' ? (
              <div className="space-y-6">
                <div>
                  <h2 className="sv-theme-heading flex items-center gap-2">
                    <FileText className="w-5 h-5 sv-theme-section-icon" />
                    Contratos
                  </h2>
                  <p className="text-xs sv-theme-muted mt-1">
                    Modelo padrão para novos contratos de compra e venda. Contratos já gerados não são alterados.
                  </p>
                </div>

                <div className="max-w-md">
                  <label className="sv-theme-label">Modelo de contrato padrão</label>
                  <select name="contract_model" value={contractModel} onChange={handleChange} className="sv-theme-field">
                    {SALE_CONTRACT_MODELS.map((model: SaleContractModel) => (
                      <option key={model} value={model} disabled={model === 'CUSTOM'}>
                        {SALE_CONTRACT_MODEL_LABELS[model]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-4 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)] text-sm text-[var(--text-secondary)] flex gap-3">
                  <Info className="w-5 h-5 shrink-0 text-[var(--brand-primary)]" />
                  <p>
                    Campos específicos de modelos personalizados pertencem ao próprio modelo de contrato e não ao cadastro
                    padrão da empresa.
                  </p>
                </div>

                {isRecantoContract ? (
                  <section className="space-y-4">
                    <h3 className="sv-theme-heading text-base">Dados exigidos pelo modelo Recanto Primavera</h3>
                    <p className="text-xs sv-theme-muted">
                      Qualificação do vendedor no contrato. Se vazio, o sistema usa os dados principais da empresa quando disponíveis.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="sv-theme-label">Nacionalidade</label>
                        <input type="text" name="contract_legal_nationality" value={String(company.contract_legal_nationality || '')} onChange={handleChange} className="sv-theme-field" placeholder="Brasileira" />
                      </div>
                      <div>
                        <label className="sv-theme-label">Estado civil</label>
                        <input type="text" name="contract_legal_marital_status" value={String(company.contract_legal_marital_status || '')} onChange={handleChange} className="sv-theme-field" />
                      </div>
                      <div>
                        <label className="sv-theme-label">Profissão</label>
                        <input type="text" name="contract_legal_profession" value={String(company.contract_legal_profession || '')} onChange={handleChange} className="sv-theme-field" />
                      </div>
                      <div>
                        <label className="sv-theme-label">RG</label>
                        <input type="text" name="contract_legal_rg" value={String(company.contract_legal_rg || '')} onChange={handleChange} className="sv-theme-field" />
                      </div>
                      <div>
                        <label className="sv-theme-label">Órgão emissor</label>
                        <input type="text" name="contract_legal_rg_issuer" value={String(company.contract_legal_rg_issuer || '')} onChange={handleChange} className="sv-theme-field" placeholder="SSP/PA" />
                      </div>
                      <div>
                        <label className="sv-theme-label">Telefone (contrato)</label>
                        <input type="text" name="contract_legal_phone" value={String(company.contract_legal_phone || '')} onChange={handleChange} className="sv-theme-field" />
                      </div>
                      <div>
                        <label className="sv-theme-label">E-mail (contrato)</label>
                        <input type="email" name="contract_legal_email" value={String(company.contract_legal_email || '')} onChange={handleChange} className="sv-theme-field" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="sv-theme-label">Endereço completo (contrato)</label>
                        <input type="text" name="contract_legal_address" value={String(company.contract_legal_address || '')} onChange={handleChange} className="sv-theme-field" />
                      </div>
                    </div>
                  </section>
                ) : null}

                <CollapsibleSection
                  id="campos-avancados-contratos"
                  title="Campos avançados"
                  subtitle="Dados bancários e complementos opcionais do contrato."
                  defaultOpen={false}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="sv-theme-label">Banco</label>
                      <input type="text" name="contract_bank_name" value={String(company.contract_bank_name || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div>
                      <label className="sv-theme-label">Agência</label>
                      <input type="text" name="contract_bank_branch" value={String(company.contract_bank_branch || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div>
                      <label className="sv-theme-label">Conta corrente</label>
                      <input type="text" name="contract_bank_account" value={String(company.contract_bank_account || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div>
                      <label className="sv-theme-label">PIX</label>
                      <input type="text" name="contract_bank_pix" value={String(company.contract_bank_pix || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="sv-theme-label">Favorecido</label>
                      <input type="text" name="contract_bank_beneficiary" value={String(company.contract_bank_beneficiary || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                  </div>
                </CollapsibleSection>
              </div>
            ) : null}

            {activeTab === 'tecnico' ? (
              <div className="space-y-4">
                <div>
                  <h2 className="sv-theme-heading flex items-center gap-2">
                    <HardHat className="w-5 h-5 text-[var(--brand-primary)]" />
                    Responsável Técnico
                  </h2>
                  <p className="text-xs sv-theme-muted mt-1">
                    Usado em memorial, prancha, relatórios e documentos técnicos. Não substitui o representante legal, salvo se a opção na aba Geral estiver marcada.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="sv-theme-label">Nome</label>
                    <input type="text" name="name" value={technical.name} onChange={handleTechChange} className="sv-theme-field" />
                  </div>
                  <div>
                    <label className="sv-theme-label">Cargo / função</label>
                    <input type="text" name="title" value={technical.title} onChange={handleTechChange} className="sv-theme-field" />
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
                    <input type="text" name="cft" value={technical.cft} onChange={handleTechChange} className="sv-theme-field" />
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
                    <label className="sv-theme-label">Assinatura técnica</label>
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
                    <label className="sv-theme-label">Carimbo técnico</label>
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
            ) : null}

            {activeTab === 'avancado' ? (
              <div className="space-y-4">
                <div>
                  <h2 className="sv-theme-heading flex items-center gap-2">
                    <Settings2 className="w-5 h-5 sv-theme-section-icon" />
                    Avançado
                  </h2>
                  <p className="text-xs sv-theme-muted mt-1">
                    Campos opcionais e complementares — recolhidos por padrão para manter o cadastro enxuto.
                  </p>
                </div>

                <CollapsibleSection
                  title="Dados jurídicos complementares"
                  subtitle="RG, nacionalidade, profissão e contatos alternativos para contratos."
                  defaultOpen={false}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="sv-theme-label">Nacionalidade</label>
                      <input type="text" name="contract_legal_nationality" value={String(company.contract_legal_nationality || '')} onChange={handleChange} className="sv-theme-field" placeholder="Brasileira" />
                    </div>
                    <div>
                      <label className="sv-theme-label">Estado civil</label>
                      <input type="text" name="contract_legal_marital_status" value={String(company.contract_legal_marital_status || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div>
                      <label className="sv-theme-label">Profissão</label>
                      <input type="text" name="contract_legal_profession" value={String(company.contract_legal_profession || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div>
                      <label className="sv-theme-label">RG</label>
                      <input type="text" name="contract_legal_rg" value={String(company.contract_legal_rg || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div>
                      <label className="sv-theme-label">Órgão emissor</label>
                      <input type="text" name="contract_legal_rg_issuer" value={String(company.contract_legal_rg_issuer || '')} onChange={handleChange} className="sv-theme-field" placeholder="SSP/PA" />
                    </div>
                    <div>
                      <label className="sv-theme-label">Telefone (contrato)</label>
                      <input type="text" name="contract_legal_phone" value={String(company.contract_legal_phone || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div>
                      <label className="sv-theme-label">E-mail (contrato)</label>
                      <input type="email" name="contract_legal_email" value={String(company.contract_legal_email || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="sv-theme-label">Endereço completo (contrato)</label>
                      <input type="text" name="contract_legal_address" value={String(company.contract_legal_address || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                  </div>
                </CollapsibleSection>

                <CollapsibleSection
                  title="Dados bancários"
                  subtitle="Informações para cláusulas de pagamento em contratos."
                  defaultOpen={false}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="sv-theme-label">Banco</label>
                      <input type="text" name="contract_bank_name" value={String(company.contract_bank_name || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div>
                      <label className="sv-theme-label">Agência</label>
                      <input type="text" name="contract_bank_branch" value={String(company.contract_bank_branch || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div>
                      <label className="sv-theme-label">Conta corrente</label>
                      <input type="text" name="contract_bank_account" value={String(company.contract_bank_account || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div>
                      <label className="sv-theme-label">PIX</label>
                      <input type="text" name="contract_bank_pix" value={String(company.contract_bank_pix || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="sv-theme-label">Favorecido</label>
                      <input type="text" name="contract_bank_beneficiary" value={String(company.contract_bank_beneficiary || '')} onChange={handleChange} className="sv-theme-field" />
                    </div>
                  </div>
                </CollapsibleSection>
              </div>
            ) : null}

            {showSaveBar ? <SaveBar submitting={submitting} readOnlyDemo={readOnlyDemo} /> : null}
            </fieldset>
          </form>
        )}
      </div>
    </div>
  );
}
