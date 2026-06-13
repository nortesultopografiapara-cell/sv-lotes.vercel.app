'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Download, RefreshCw, ExternalLink, History, Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { formatSaasCurrency, resolveCompanyPricing, type CompanyPricingSource } from '@/lib/companyPricing';
import {
  resolveFirstPaymentDate,
  resolveNextDueDate,
} from '@/lib/companySubscriptionDates';
import {
  saasContractOptionalFieldsWarning,
  validateSaasContractGeneration,
} from '@/lib/saasContractValidation';
import {
  formatDateBr,
  hasSaasContractReady,
  isRealSaasCompany,
  type CompanySubscription,
} from '@/lib/saasSubscription';
import {
  saasContractDocumentStatusLabel,
  isCurrentSaasContractVersion,
} from '@/lib/saasContractStatus';
import {
  MENESES_COMPANY_ID,
  SAAS_PROVIDER,
} from '@/lib/saasContractContent';
import { buildSaasContractPdfUrl } from '@/lib/saasContractUrls';
import type { CompanyContractRow } from '@/lib/saasContractService';
import type { augmentCompanyBilling } from '@/lib/masterBilling';
import { RegenerateContractModal } from '@/components/contracts/RegenerateContractModal';

type EnrichedCompany = ReturnType<typeof augmentCompanyBilling>;

type Props = {
  company: EnrichedCompany | null;
  companies?: EnrichedCompany[];
  selectedCompanyId?: string | null;
  onSelectCompany?: (companyId: string) => void | Promise<void>;
  subscription?: CompanySubscription | null;
  contracts?: CompanyContractRow[];
  generating?: boolean;
  onRefresh: () => void;
  onContractsReload?: () => void | Promise<void>;
  onGenerateContract?: (options?: { regenerate?: boolean }) => void | Promise<void>;
};

export function SaasContractPanel({
  company,
  companies = [],
  selectedCompanyId,
  onSelectCompany,
  subscription: subscriptionProp,
  contracts: contractsProp,
  generating = false,
  onRefresh,
  onContractsReload,
  onGenerateContract,
}: Props) {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [localContracts, setLocalContracts] = useState<CompanyContractRow[]>([]);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);

  const companyId = (company as { id?: string } | null)?.id;
  const sub =
    subscriptionProp ??
    ((company?.saas_subscription as CompanySubscription | null) ?? null);
  const contracts = contractsProp ?? localContracts;
  const busy = generating;

  const pricing = company ? resolveCompanyPricing(company as CompanyPricingSource) : null;
  const validation = company
    ? validateSaasContractGeneration(company as CompanyPricingSource, sub)
    : null;
  const contractReady = hasSaasContractReady(sub);

  const contractViewUrl =
    companyId && user?.id
      ? buildSaasContractPdfUrl(companyId, user.id, 'inline')
      : '#';

  const contractDownloadUrl =
    companyId && user?.id
      ? buildSaasContractPdfUrl(companyId, user.id, 'download')
      : '#';

  const activeContract = useMemo(() => {
    return (
      contracts.find((c) => isCurrentSaasContractVersion(c.status)) ??
      contracts[0] ??
      null
    );
  }, [contracts]);

  const generatedAtLabel = useMemo(() => {
    if (activeContract?.generated_at) {
      return formatDateBr(activeContract.generated_at.split('T')[0]);
    }
    return '—';
  }, [activeContract]);

  const selectableCompanies = useMemo(
    () => companies.filter((c) => isRealSaasCompany(c as CompanyPricingSource)),
    [companies],
  );

  const loadContracts = useCallback(async () => {
    if (!companyId || !user?.id) return;
    if (onContractsReload) {
      await onContractsReload();
      return;
    }
    try {
      const res = await fetch(
        `/api/companies/${companyId}/contracts?userId=${encodeURIComponent(user.id)}`,
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok) setLocalContracts(json.contracts || []);
    } catch {
      setLocalContracts([]);
    }
  }, [companyId, user?.id, onContractsReload]);

  useEffect(() => {
    if (contractsProp) {
      setLocalContracts(contractsProp);
      return;
    }
    void loadContracts();
  }, [contractsProp, loadContracts]);

  useEffect(() => {
    if (hasSaasContractReady(sub)) setError(null);
  }, [sub?.contract_pdf_url, sub?.contract_status]);

  if (!company) {
    return (
      <div className="bg-[#11161d] border border-white/5 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5">
          <h3 className="text-[16px] font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Contrato SaaS
          </h3>
          <p className="text-[12px] text-gray-400 mt-1">
            Selecione uma empresa para visualizar ou gerar o contrato de licença SaaS.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <label className="block text-[12px] text-gray-400 uppercase tracking-wide">
            Empresa
          </label>
          <select
            value={selectedCompanyId || ''}
            onChange={(e) => {
              const id = e.target.value;
              if (id && onSelectCompany) void onSelectCompany(id);
            }}
            className="w-full max-w-xl bg-[#0B0E14] border border-white/10 text-white px-4 py-3 rounded-lg text-[14px]"
          >
            <option value="">Selecione uma empresa…</option>
            {selectableCompanies.map((c) => {
              const id = (c as { id?: string }).id || '';
              return (
                <option key={id} value={id}>
                  {c.name}
                </option>
              );
            })}
          </select>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSelectCompany?.(MENESES_COMPANY_ID)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-200 text-[13px] hover:bg-blue-500/20"
            >
              <Building2 className="w-4 h-4" />
              Abrir Meneses Imobiliária
            </button>
          </div>

          <p className="text-[12px] text-gray-500">
            Você também pode selecionar uma empresa na tabela de assinaturas e clicar em
            &quot;Detalhes&quot;.
          </p>
        </div>
      </div>
    );
  }

  const runGenerateContract = async (regenerate: boolean) => {
    if (!companyId) {
      const msg = 'Não foi possível gerar o contrato';
      setError(msg);
      alert(msg);
      return;
    }
    if (busy) return;

    if (validation && !validation.ok) {
      setError(validation.error || 'Dados incompletos');
      alert(validation.error || 'Dados obrigatórios ausentes para gerar o contrato.');
      return;
    }

    setError(null);

    if (regenerate) {
      console.log('CONTRACT_REGENERATE_CLICK', { companyId });
    }

    if (onGenerateContract) {
      try {
        await onGenerateContract({ regenerate });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Não foi possível gerar o contrato';
        setError(msg);
      }
      return;
    }

    const msg = 'Geração de contrato não configurada. Recarregue a página.';
    setError(msg);
    alert(msg);
  };

  const handleGenerateClick = () => {
    if (contractReady) {
      setShowRegenerateModal(true);
      return;
    }
    void runGenerateContract(false);
  };

  const confirmRegenerate = () => {
    setShowRegenerateModal(false);
    void runGenerateContract(true);
  };

  const saasVersionStatusLabel = (status?: string | null) =>
    saasContractDocumentStatusLabel(status);

  const contractStatusLabel =
    sub?.contract_status
      ? saasContractDocumentStatusLabel(sub.contract_status)
      : contractReady
        ? 'Gerado'
        : '—';

  return (
    <div className="bg-[#11161d] border border-white/5 rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-white/5 flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Contrato SaaS — {company.name}
          </h3>
          <p className="text-[12px] text-gray-400 mt-1">
            {SAAS_PROVIDER.legalName} · {SAAS_PROVIDER.tradeName} · {SAAS_PROVIDER.city}
          </p>
          {selectableCompanies.length > 1 && onSelectCompany && (
            <div className="mt-3 max-w-md">
              <select
                value={companyId || ''}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) void onSelectCompany(id);
                }}
                className="w-full bg-[#0B0E14] border border-white/10 text-white px-3 py-2 rounded-lg text-[12px]"
              >
                {selectableCompanies.map((c) => {
                  const id = (c as { id?: string }).id || '';
                  return (
                    <option key={id} value={id}>
                      {c.name}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {contractReady && user?.id && (
            <>
              <a
                href={contractViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-gray-200 text-[13px] hover:bg-white/5"
              >
                <ExternalLink className="w-4 h-4" /> Ver contrato
              </a>
              <a
                href={contractDownloadUrl}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-gray-200 text-[13px] hover:bg-white/5"
              >
                <Download className="w-4 h-4" /> Baixar PDF
              </a>
            </>
          )}
          <button
            type="button"
            disabled={busy || !companyId || !(validation?.ok ?? true)}
            onClick={handleGenerateClick}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-[13px] hover:bg-amber-500 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            {contractReady ? 'Regenerar contrato SaaS' : 'Gerar contrato SaaS'}
          </button>
        </div>
      </div>

      {validation && !validation.ok && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm whitespace-pre-line">
          {validation.error}
        </div>
      )}

      {validation?.ok && validation.warnings.length > 0 && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-100 text-sm whitespace-pre-line">
          {saasContractOptionalFieldsWarning(validation.warnings)}
        </div>
      )}

      {error && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm whitespace-pre-line">
          {error}
        </div>
      )}

      {!contractReady && validation?.ok && (
        <div className="mx-5 mt-4 p-4 rounded-xl bg-[#0B0E14] border border-dashed border-amber-500/30 text-center">
          <p className="text-sm text-gray-300 mb-3">
            Nenhum contrato PDF gerado para esta empresa ainda.
          </p>
          <button
            type="button"
            disabled={busy || !companyId}
            onClick={() => void handleGenerateClick()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-[13px] hover:bg-amber-500 disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            Gerar contrato SaaS
          </button>
        </div>
      )}

      <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Info label="Empresa" value={company.name || '—'} />
        <Info label="Plano" value={company.ui_plan} />
        <Info label="Valor contratado" value={pricing ? formatSaasCurrency(pricing.appliedPrice) : '—'} />
        <Info
          label="Data de início"
          value={formatDateBr(
            company.subscription_start_date ||
              sub?.start_date ||
              resolveFirstPaymentDate(company, sub),
          )}
        />
        <Info
          label="Primeira cobrança"
          value={formatDateBr(
            company.first_payment_date || resolveFirstPaymentDate(company, sub),
          )}
        />
        <Info label="Dia de vencimento" value={`Dia ${company.subscription_due_day ?? '—'}`} />
        <Info
          label="Próximo vencimento"
          value={formatDateBr(
            company.next_payment_date || resolveNextDueDate(company, sub),
          )}
        />
        <Info label="Status do contrato" value={contractStatusLabel} />
        <Info
          label="Versão ativa"
          value={activeContract ? `Versão ${activeContract.version ?? 1}` : '—'}
        />
        <Info label="Nº do contrato" value={sub?.contract_number || activeContract?.contract_number || '—'} />
        <Info label="Data de geração" value={generatedAtLabel} />
        <Info label="Pagamento" value={company.payment_status} />
        <Info label="PDF" value={contractReady ? 'Disponível' : 'Não gerado'} />
      </div>

      <div className="px-5 pb-5">
        <h4 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-gray-400" />
          Histórico de versões
        </h4>
        {contracts.length === 0 ? (
          <p className="text-xs text-gray-500">Nenhuma versão registrada ainda.</p>
        ) : (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {contracts.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#0B0E14] border border-white/5 text-[12px]"
              >
                <div>
                  <span className="text-white font-medium">{c.contract_number}</span>
                  <span className="text-gray-500 ml-2">Versão {c.version ?? 1}</span>
                  <span
                    className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
                      isCurrentSaasContractVersion(c.status)
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {saasVersionStatusLabel(c.status)}
                  </span>
                  <p className="text-gray-500 mt-0.5">
                    {formatDateBr(c.generated_at?.split('T')[0])}
                  </p>
                </div>
                {user?.id && companyId && (
                  <a
                    href={buildSaasContractPdfUrl(companyId, user.id, 'download', c.id)}
                    className="text-blue-300 hover:underline shrink-0 flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    Baixar
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <RegenerateContractModal
        open={showRegenerateModal}
        busy={busy}
        onCancel={() => setShowRegenerateModal(false)}
        onConfirm={confirmRegenerate}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0B0E14] border border-white/5 rounded-xl p-4">
      <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-[14px] font-medium text-white mt-1">{value}</p>
    </div>
  );
}
