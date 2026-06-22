'use client';

import { Save, Upload, Loader2, ImagePlus, Building2, HardHat, FileText, Banknote } from 'lucide-react';
import {
  normalizeSaleContractModel,
  SALE_CONTRACT_MODEL_LABELS,
  SALE_CONTRACT_MODELS,
  type SaleContractModel,
} from '@/lib/contractModel';
import type { useCompanySettingsForm } from '@/components/settings/useCompanySettingsForm';
import { DemoSensitiveNotice } from '@/components/demo/DemoSensitiveNotice';
import { DEMO_SENSITIVE_SETTINGS_MESSAGE } from '@/lib/demoRestrictions';

type FormState = ReturnType<typeof useCompanySettingsForm>;

type Props = Pick<
  FormState,
  | 'company'
  | 'technical'
  | 'submitting'
  | 'handleChange'
  | 'handleSave'
  | 'handleLogoUpload'
  | 'handleSignatureUpload'
  | 'handleTechChange'
  | 'handleTechSignatureUpload'
  | 'handleTechStampUpload'
  | 'logoInputRef'
  | 'signatureInputRef'
  | 'techSignatureInputRef'
  | 'techStampInputRef'
  | 'uploadingLogo'
  | 'uploadingSignature'
  | 'uploadingTechSignature'
  | 'uploadingTechStamp'
> & {
  readOnlyDemo?: boolean;
};

export function CompanySettingsFormLegacy({
  company,
  technical,
  submitting,
  handleChange,
  handleSave,
  handleLogoUpload,
  handleSignatureUpload,
  handleTechChange,
  handleTechSignatureUpload,
  handleTechStampUpload,
  logoInputRef,
  signatureInputRef,
  techSignatureInputRef,
  techStampInputRef,
  uploadingLogo,
  uploadingSignature,
  uploadingTechSignature,
  uploadingTechStamp,
  readOnlyDemo = false,
}: Props) {
  if (!company) return null;

  const isRecantoContract =
    normalizeSaleContractModel(company.contract_model as string) === 'RECANTO_PRIMAVERA';

  return (
    <form onSubmit={handleSave} className="space-y-8 sv-theme-card p-6 rounded-xl shadow-lg border">
      {readOnlyDemo ? <DemoSensitiveNotice message={DEMO_SENSITIVE_SETTINGS_MESSAGE} /> : null}
      <fieldset disabled={readOnlyDemo} className={`space-y-8 ${readOnlyDemo ? 'opacity-60' : ''}`}>
        <h2 className="sv-theme-heading flex items-center gap-2">
          <ImagePlus className="w-5 h-5 sv-theme-section-icon" />
          Identidade Visual
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="sv-theme-upload-zone p-4 rounded-lg transition-all hover:border-[var(--brand-primary)]">
            <label className="sv-theme-label mb-3">Logotipo (PNG, JPG - Máx 5MB)</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-md sv-theme-upload-preview flex items-center justify-center overflow-hidden flex-shrink-0">
                {company.logo_url ? (
                  <img src={String(company.logo_url)} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-[10px] sv-theme-muted font-medium">Sem Logo</span>
                )}
              </div>
              <div className="flex-1">
                <input type="file" accept="image/*" className="hidden" ref={logoInputRef} onChange={handleLogoUpload} />
                <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="sv-theme-upload-btn">
                  {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Fazer Upload da Logo
                </button>
                <p className="text-[10px] sv-theme-muted mt-2 leading-tight">Será usada na barra lateral e no cabeçalho dos contratos.</p>
              </div>
            </div>
          </div>

          <div className="sv-theme-upload-zone p-4 rounded-lg transition-all hover:border-[var(--brand-primary)]">
            <label className="sv-theme-label mb-3">Assinatura Digital (PNG, JPG)</label>
            <div className="flex items-center gap-4">
              <div className="w-24 h-16 rounded-md sv-theme-upload-preview flex items-center justify-center overflow-hidden flex-shrink-0">
                {company.signature_url ? (
                  <img src={String(company.signature_url)} alt="Assinatura" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-[10px] sv-theme-muted font-medium">Sem Assinatura</span>
                )}
              </div>
              <div className="flex-1">
                <input type="file" accept="image/*" className="hidden" ref={signatureInputRef} onChange={handleSignatureUpload} />
                <button type="button" onClick={() => signatureInputRef.current?.click()} disabled={uploadingSignature} className="sv-theme-upload-btn">
                  {uploadingSignature ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Upload Assinatura
                </button>
                <p className="text-[10px] sv-theme-muted mt-2 leading-tight">Aparecerá automaticamente no campo do vendedor nos contratos.</p>
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
            <input type="text" required name="fantasy_name" value={String(company.fantasy_name || company.name || '')} onChange={handleChange} className="sv-theme-field" />
          </div>
          <div>
            <label className="sv-theme-label">CNPJ</label>
            <input type="text" name="cnpj" value={String(company.cnpj || '')} onChange={handleChange} className="sv-theme-field" />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="sv-theme-heading">Modelo de Contrato</h2>
        <p className="text-xs sv-theme-muted">
          Define qual modelo jurídico será usado na geração de novos contratos de compra e venda. Contratos já gerados não são alterados.
        </p>
        <div className="max-w-md">
          <label className="sv-theme-label">Modelo de Contrato</label>
          <select name="contract_model" value={normalizeSaleContractModel(company.contract_model as string)} onChange={handleChange} className="sv-theme-field">
            {SALE_CONTRACT_MODELS.map((model: SaleContractModel) => (
              <option key={model} value={model} disabled={model === 'CUSTOM'}>
                {SALE_CONTRACT_MODEL_LABELS[model]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isRecantoContract ? (
        <>
          <div className="space-y-4">
            <h2 className="sv-theme-heading flex items-center gap-2">
              <FileText className="w-5 h-5 sv-theme-section-icon" />
              Dados Jurídicos do Contrato
            </h2>
            <p className="text-xs sv-theme-muted">
              Qualificação do vendedor no modelo Recanto Primavera. Se vazio, o sistema usa os dados principais da empresa quando disponíveis.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="sv-theme-label">Nacionalidade</label>
                <input type="text" name="contract_legal_nationality" value={String(company.contract_legal_nationality || '')} onChange={handleChange} className="sv-theme-field" placeholder="Brasileira" />
              </div>
              <div>
                <label className="sv-theme-label">Estado Civil</label>
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
                <label className="sv-theme-label">Órgão Emissor</label>
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
                <label className="sv-theme-label">Endereço Completo (contrato)</label>
                <input type="text" name="contract_legal_address" value={String(company.contract_legal_address || '')} onChange={handleChange} className="sv-theme-field" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="sv-theme-heading flex items-center gap-2">
              <Banknote className="w-5 h-5 sv-theme-section-icon" />
              Dados Bancários do Contrato
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="sv-theme-label">Banco</label>
                <input type="text" name="contract_bank_name" value={String(company.contract_bank_name || '')} onChange={handleChange} className="sv-theme-field" placeholder="Sicredi" />
              </div>
              <div>
                <label className="sv-theme-label">Agência</label>
                <input type="text" name="contract_bank_branch" value={String(company.contract_bank_branch || '')} onChange={handleChange} className="sv-theme-field" />
              </div>
              <div>
                <label className="sv-theme-label">Conta Corrente</label>
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
          </div>
        </>
      ) : null}

      <div className="space-y-4">
        <h2 className="sv-theme-heading">Contato e Endereço</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="sv-theme-label">Telefone</label>
            <input type="text" name="phone" value={String(company.phone || '')} onChange={handleChange} className="sv-theme-field" />
          </div>
          <div>
            <label className="sv-theme-label">E-mail</label>
            <input type="email" name="email" value={String(company.email || '')} onChange={handleChange} className="sv-theme-field" />
          </div>
          <div className="md:col-span-2">
            <label className="sv-theme-label">Endereço Completo</label>
            <input type="text" name="address" value={String(company.address || '')} onChange={handleChange} className="sv-theme-field" placeholder="Rua, Número, Bairro, Complemento" />
          </div>
          <div>
            <label className="sv-theme-label">Cidade</label>
            <input type="text" name="city" value={String(company.city || '')} onChange={handleChange} className="sv-theme-field" />
          </div>
          <div>
            <label className="sv-theme-label">UF</label>
            <input type="text" name="state" value={String(company.state || '')} onChange={handleChange} className="sv-theme-field" maxLength={2} placeholder="Ex: SP" />
          </div>
          <div>
            <label className="sv-theme-label">CEP</label>
            <input type="text" name="zip_code" value={String(company.zip_code || '')} onChange={handleChange} className="sv-theme-field" />
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
            <input type="text" name="legal_representative" value={String(company.legal_representative || '')} onChange={handleChange} className="sv-theme-field" />
          </div>
          <div>
            <label className="sv-theme-label">CPF do Responsável</label>
            <input type="text" name="representative_cpf" value={String(company.representative_cpf || '')} onChange={handleChange} className="sv-theme-field" />
          </div>
        </div>
      </div>

      {!readOnlyDemo ? (
      <div className="flex justify-end pt-4 border-t border-[var(--border-color)] mt-8">
        <button type="submit" disabled={submitting} className="flex items-center gap-2 px-6 py-2.5 sv-brand-btn-primary font-medium rounded-lg transition-colors disabled:opacity-50">
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Salvar Configurações
        </button>
      </div>
      ) : null}
      </fieldset>
    </form>
  );
}
