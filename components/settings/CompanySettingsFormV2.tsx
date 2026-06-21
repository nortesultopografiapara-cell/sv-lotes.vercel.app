'use client';

import { useMemo, useState } from 'react';
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
import type { useCompanySettingsForm } from '@/components/settings/useCompanySettingsForm';

type FormState = ReturnType<typeof useCompanySettingsForm>;

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
>;

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
          <h2 className="sv-theme-heading flex items-center gap-2">{title}</h2>
          {subtitle ? <p className="text-xs sv-theme-muted mt-1">{subtitle}</p> : null}
        </div>
        <ChevronDown className={`w-5 h-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="pt-2">{children}</div> : null}
    </div>
  );
}

export function CompanySettingsFormV2({
  company,
  technical,
  submitting,
  handleChange,
  handleCheckboxChange,
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
}: Props) {
  if (!company) return null;

  const contractModel = normalizeSaleContractModel(company.contract_model as string);
  const isRecantoContract = contractModel === 'RECANTO_PRIMAVERA';
  const documentRaw = String(company.cnpj || company.cpf || '');
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
      resolveSaasContractorParty({ cnpj: documentRaw, cpf: company.cpf as string }),
    );

  return (
    <form onSubmit={handleSave} className="space-y-8 sv-theme-card p-6 rounded-xl shadow-lg border">
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
        <p className="text-xs sv-theme-muted">Campos mínimos para contrato SaaS e identificação da empresa.</p>
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
            <input
              type="text"
              required
              name="cnpj"
              value={documentRaw}
              onChange={handleChange}
              className="sv-theme-field"
            />
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
              placeholder="Rua 02, Quadra 123, Lote 05"
            />
            <p className="text-[10px] sv-theme-muted mt-1">
              Formato sugerido: logradouro na primeira linha; bairro, cidade/UF e CEP nos campos abaixo.
            </p>
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

      <section className="space-y-4">
        <h2 className="sv-theme-heading flex items-center gap-2">
          <HardHat className="w-5 h-5 text-[var(--brand-primary)]" />
          Responsável Técnico
        </h2>
        <p className="text-xs sv-theme-muted">
          Opcional — usado em memorial, prancha, relatórios e documentos técnicos. Não substitui o representante legal, salvo se a opção acima estiver marcada.
        </p>
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
            <label className="sv-theme-label">Assinatura digital</label>
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
      </section>

      <section className="space-y-4">
        <h2 className="sv-theme-heading flex items-center gap-2">
          <ImagePlus className="w-5 h-5 sv-theme-section-icon" />
          Identidade Visual
        </h2>
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
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="sv-theme-heading flex items-center gap-2">
          <FileText className="w-5 h-5 sv-theme-section-icon" />
          Contratos
        </h2>
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

        <CollapsibleSection
          title="Campos avançados do modelo de contrato"
          subtitle={
            isRecantoContract
              ? 'Modelo Recanto Primavera — preencha nacionalidade, RG e demais campos jurídicos.'
              : 'Opcional — exibido quando o modelo selecionado exige dados jurídicos adicionais.'
          }
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
      </section>

      <CollapsibleSection
        id="dados-bancarios"
        title="Dados bancários"
        subtitle="Opcional — usado em cláusulas de pagamento do modelo de contrato."
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

      <div className="flex justify-end pt-4 border-t border-[var(--border-color)] mt-8">
        <button type="submit" disabled={submitting} className="flex items-center gap-2 px-6 py-2.5 sv-brand-btn-primary font-medium rounded-lg transition-colors disabled:opacity-50">
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Salvar Configurações
        </button>
      </div>
    </form>
  );
}
