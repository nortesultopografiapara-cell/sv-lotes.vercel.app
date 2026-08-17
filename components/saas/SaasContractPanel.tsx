'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Download,
  RefreshCw,
  ExternalLink,
  History,
  Building2,
  Send,
  ShieldCheck,
  Share2,
  Archive,
  Eye,
  EyeOff,
} from 'lucide-react';
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
  hasSaasContractDocumentForMasterUi,
  isRealSaasCompany,
  type CompanySubscription,
} from '@/lib/saasSubscription';
import { formatSignerDocumentLine } from '@/lib/saasContractDocumentLabel';
import {
  resolveSaasContractCompanyProfile,
} from '@/lib/saasContractCompanyProfile';
import {
  saasContractDocumentStatusLabel,
  isCurrentSaasContractVersion,
  signatureStatusEmoji,
  signatureStatusLabel,
} from '@/lib/saasContractStatus';
import {
  MENESES_COMPANY_ID,
  SAAS_PROVIDER,
} from '@/lib/saasContractContent';
import { buildSaasContractPdfUrl } from '@/lib/saasContractUrls';
import type { CompanyContractRow } from '@/lib/saasContractService';
import type {
  CompanyContractSignatureRow,
  SignatureHistoryEvent,
} from '@/lib/saasContractSignatureService';
import {
  canResendOrShareSignature,
  formatSignatureTimelineDateTime,
  mergeSignatureTimeline,
  resolveSignatureUrlFromSendResponse,
  type LocalSignatureTimelineEvent,
} from '@/lib/saasContractSignatureShare';
import {
  shouldRenderMasterProviderSignButton,
  isContractSignatureSendBlocked,
} from '@/lib/saasContractBilateralSignature';
import {
  hasSaasSignedDocumentAccess,
  resolveSaasSignedContractRecord,
} from '@/lib/saasContractSignedAccess';
import { ContractProviderSignModal } from '@/components/saas/ContractProviderSignModal';
import type { augmentCompanyBilling } from '@/lib/masterBilling';
import { RegenerateContractModal } from '@/components/contracts/RegenerateContractModal';
import { ArchiveSaasContractModal } from '@/components/saas/ArchiveSaasContractModal';
import { ContractSignatureShareModal } from '@/components/saas/ContractSignatureShareModal';
import {
  filterVisibleSaasContracts,
  findActiveVisibleSaasContract,
  isArchivedSaasContract,
} from '@/lib/saasContractArchive';

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
  const [sendingSignature, setSendingSignature] = useState(false);
  const [signatureInfo, setSignatureInfo] = useState<{
    latest: CompanyContractSignatureRow | null;
    history: SignatureHistoryEvent[];
  }>({ latest: null, history: [] });
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [providerSignModalOpen, setProviderSignModalOpen] = useState(false);
  const [signingProvider, setSigningProvider] = useState(false);
  const [localTimeline, setLocalTimeline] = useState<LocalSignatureTimelineEvent[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<CompanyContractRow | null>(null);
  const [archivingContract, setArchivingContract] = useState(false);

  const isSuperAdmin = String(user?.role || '').toUpperCase() === 'SUPER_ADMIN';

  const companyId = (company as { id?: string } | null)?.id;
  const sub =
    subscriptionProp ??
    ((company?.saas_subscription as CompanySubscription | null) ?? null);
  const contracts = contractsProp ?? localContracts;
  const visibleContracts = useMemo(
    () => filterVisibleSaasContracts(contracts, showArchived),
    [contracts, showArchived],
  );
  const archivedCount = useMemo(
    () => contracts.filter((c) => isArchivedSaasContract(c)).length,
    [contracts],
  );
  const busy = generating;

  const pricing = company ? resolveCompanyPricing(company as CompanyPricingSource) : null;
  const contractProfile = useMemo(
    () =>
      company
        ? resolveSaasContractCompanyProfile(company as Record<string, unknown>)
        : null,
    [company],
  );
  const validation = company
    ? validateSaasContractGeneration(company as CompanyPricingSource, sub)
    : null;
  const contractViewUrl =
    companyId && user?.id
      ? buildSaasContractPdfUrl(companyId, user.id, 'inline')
      : '#';

  const contractDownloadUrl =
    companyId && user?.id
      ? buildSaasContractPdfUrl(companyId, user.id, 'download')
      : '#';

  const activeContract = useMemo(() => {
    return findActiveVisibleSaasContract(contracts);
  }, [contracts]);

  const documentReady = hasSaasContractDocumentForMasterUi(sub, activeContract);

  const signedContractRecord = useMemo(
    () => resolveSaasSignedContractRecord(contracts, signatureInfo.latest),
    [contracts, signatureInfo.latest],
  );

  const hasSignedDocument = useMemo(
    () => hasSaasSignedDocumentAccess(signedContractRecord, signatureInfo.latest),
    [signedContractRecord, signatureInfo.latest],
  );

  const signedContractId = signedContractRecord?.id || activeContract?.id || null;

  const signedPdfDownloadUrl =
    companyId && user?.id && signedContractId
      ? buildSaasContractPdfUrl(companyId, user.id, 'download', signedContractId, {
          signed: true,
        })
      : '#';

  const signedPdfOpenUrl =
    companyId && user?.id && signedContractId
      ? buildSaasContractPdfUrl(companyId, user.id, 'inline', signedContractId, {
          signed: true,
        })
      : '#';

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
    try {
      const params = new URLSearchParams({
        userId: user.id,
        includeArchived: '1',
      });
      const res = await fetch(`/api/companies/${companyId}/contracts?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setLocalContracts(json.contracts || []);
        if (onContractsReload && !contractsProp) {
          /* noop — lista local atualizada */
        }
      }
    } catch {
      setLocalContracts([]);
    }
  }, [companyId, user?.id, contractsProp, onContractsReload]);

  const loadSignatureInfo = useCallback(async () => {
    if (!companyId || !user?.id) return;
    try {
      const params = new URLSearchParams({ userId: user.id });
      if (activeContract?.id) params.set('contractId', activeContract.id);
      const res = await fetch(
        `/api/companies/${companyId}/contract/signatures?${params.toString()}`,
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setSignatureInfo({
          latest: json.latest || null,
          history: json.history || [],
        });
      }
    } catch {
      setSignatureInfo({ latest: null, history: [] });
    }
  }, [companyId, user?.id, activeContract?.id]);

  useEffect(() => {
    if (contractsProp) {
      setLocalContracts(contractsProp);
      return;
    }
    void loadContracts();
  }, [contractsProp, loadContracts]);

  useEffect(() => {
    if (documentReady) setError(null);
  }, [documentReady]);

  useEffect(() => {
    void loadSignatureInfo();
    setLocalTimeline([]);
  }, [loadSignatureInfo, companyId]);

  const contractNumber =
    sub?.contract_number || activeContract?.contract_number || '—';

  const signerContact = useMemo(() => {
    if (!company) {
      return { name: 'Responsável', phone: null as string | null, email: null as string | null };
    }
    const c = company as CompanyPricingSource & {
      legal_representative?: string | null;
      responsible_name?: string | null;
      telefone?: string | null;
    };
    return {
      name:
        c.legal_representative ||
        c.responsible_name ||
        'Responsável',
      phone: c.phone || c.telefone || null,
      email: c.email || null,
    };
  }, [company]);

  const signatureBlocked = isContractSignatureSendBlocked(
    signatureInfo.latest?.signature_status,
  );

  const canSharePendingLink = canResendOrShareSignature(
    signatureInfo.latest?.signature_status,
  );

  const hasActivePendingSignature = canResendOrShareSignature(
    signatureInfo.latest?.signature_status,
  );

  const canSendForSignature =
    documentReady &&
    activeContract &&
    !['signed', 'active', 'client_signed'].includes(String(activeContract.status || '').toLowerCase()) &&
    !signatureBlocked &&
    !hasActivePendingSignature;

  const showProviderSignButton = shouldRenderMasterProviderSignButton(
    signatureInfo.latest?.signature_status,
    user?.id,
  );

  const handleProviderSign = async (input: {
    providerName: string;
    providerDocument: string;
    providerEmail: string;
    providerRole: string;
  }) => {
    if (!companyId || !user?.id || !signatureInfo.latest?.id) {
      throw new Error('Dados insuficientes para assinar.');
    }
    setSigningProvider(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/contract/sign-provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          signatureId: signatureInfo.latest.id,
          providerName: input.providerName,
          providerDocument: input.providerDocument,
          providerEmail: input.providerEmail,
          providerRole: input.providerRole || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Falha ao assinar pela SV.');
      }
      appendLocalTimeline('SV assinou', input.providerName);
      if (json.pdfSignedUrl) {
        appendLocalTimeline('PDF final gerado', 'Contrato bilateral disponível');
      }
      await loadSignatureInfo();
      await loadContracts();
      onRefresh();
    } finally {
      setSigningProvider(false);
    }
  };

  const openShareModal = useCallback(
    (signature: CompanyContractSignatureRow, signUrl: string) => {
      setSignatureInfo((prev) => ({
        ...prev,
        latest: { ...signature, signature_url: signUrl || signature.signature_url },
      }));
      setShareModalOpen(true);
    },
    [],
  );

  const appendLocalTimeline = useCallback((event: string, details: string) => {
    setLocalTimeline((prev) => [
      ...prev,
      { at: new Date().toISOString(), event, details },
    ]);
  }, []);

  const handleSendForSignature = async (resend = false) => {
    if (!companyId || !user?.id || sendingSignature) return;
    setSendingSignature(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/contract/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Falha ao enviar para assinatura.');
      }

      const signUrl = resolveSignatureUrlFromSendResponse(json);
      const signature = (json.signature || null) as CompanyContractSignatureRow | null;

      await loadSignatureInfo();
      await loadContracts();
      onRefresh();

      if (signUrl && signature) {
        openShareModal(signature, signUrl);
        if (resend) {
          appendLocalTimeline('Link reenviado', signUrl);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao enviar para assinatura.';
      setError(msg);
    } finally {
      setSendingSignature(false);
    }
  };

  const handleOpenShareFromPending = () => {
    const latest = signatureInfo.latest;
    if (!latest?.signature_url) return;
    setShareModalOpen(true);
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget || !companyId || !user?.id || archivingContract) return;
    setArchivingContract(true);
    setError(null);
    try {
      const isActiveVersion = isCurrentSaasContractVersion(archiveTarget.status);
      const res = await fetch(
        `/api/companies/${companyId}/contracts/${archiveTarget.id}/archive`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            confirmActive: isActiveVersion,
            archiveKind: isActiveVersion ? 'manual' : 'test',
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Falha ao arquivar contrato.');
      }
      setArchiveTarget(null);
      await loadContracts();
      if (onContractsReload) await onContractsReload();
      onRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao arquivar contrato.');
    } finally {
      setArchivingContract(false);
    }
  };

  const mergedTimeline = useMemo(
    () => mergeSignatureTimeline(signatureInfo.history, localTimeline),
    [signatureInfo.history, localTimeline],
  );

  const signatureStatusCard = signatureInfo.latest
    ? `${signatureStatusEmoji(signatureInfo.latest.signature_status)} ${signatureStatusLabel(signatureInfo.latest.signature_status)}`
    : String(activeContract?.status || '').toLowerCase() === 'signed'
      ? '🟢 Assinado'
      : '—';

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
    if (documentReady) {
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

  const documentStatusRaw = activeContract?.status || sub?.contract_status;
  const contractStatusLabel = documentStatusRaw
    ? saasContractDocumentStatusLabel(documentStatusRaw)
    : documentReady
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
          {documentReady && user?.id && (
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
              {hasSignedDocument && signedContractId ? (
                <>
                  <a
                    href={signedPdfOpenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-500/30 text-emerald-200 text-[13px] hover:bg-emerald-500/10"
                  >
                    <ExternalLink className="w-4 h-4" /> Abrir PDF Assinado
                  </a>
                  <a
                    href={signedPdfDownloadUrl}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-[13px] hover:bg-emerald-500 ring-2 ring-emerald-400/40"
                  >
                    <ShieldCheck className="w-4 h-4" /> Baixar PDF Assinado
                  </a>
                </>
              ) : null}
            </>
          )}
          {showProviderSignButton && (
            <button
              type="button"
              disabled={signingProvider || busy}
              onClick={() => setProviderSignModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-[13px] hover:bg-emerald-500 disabled:opacity-50"
            >
              <ShieldCheck className={`w-4 h-4 ${signingProvider ? 'animate-pulse' : ''}`} />
              Assinar pela SV
            </button>
          )}
          {canSharePendingLink && signatureInfo.latest?.signature_url && (
            <>
              <button
                type="button"
                onClick={handleOpenShareFromPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-500/30 text-blue-200 text-[13px] hover:bg-blue-500/10"
              >
                <Share2 className="w-4 h-4" /> Compartilhar link
              </button>
              <button
                type="button"
                disabled={sendingSignature || busy}
                onClick={() => void handleSendForSignature(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-gray-200 text-[13px] hover:bg-white/5 disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> Reenviar link
              </button>
            </>
          )}
          {canSendForSignature && (
            <button
              type="button"
              disabled={sendingSignature || busy}
              onClick={() => void handleSendForSignature(false)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-[13px] hover:bg-blue-500 disabled:opacity-50"
            >
              <Send className={`w-4 h-4 ${sendingSignature ? 'animate-pulse' : ''}`} />
              Enviar para Assinatura
            </button>
          )}
          <button
            type="button"
            disabled={busy || !companyId || !(validation?.ok ?? true)}
            onClick={handleGenerateClick}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-[13px] hover:bg-amber-500 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            {documentReady ? 'Regenerar contrato SaaS' : 'Gerar contrato SaaS'}
          </button>
        </div>
      </div>

      {validation && !validation.ok && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm whitespace-pre-line">
          {validation.error}
          {validation.missing.includes('legal_representative') ||
          validation.missingLabels.some((l) => l.toLowerCase().includes('representante legal')) ? (
            <p className="mt-2">
              <a href="/settings#representante-legal" className="underline font-medium text-red-200">
                Preencher Representante Legal em Configurações
              </a>
            </p>
          ) : null}
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

      {showProviderSignButton && (
        <div className="mx-5 mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-100">
              Cliente assinou — aguardando assinatura da SV
            </p>
            <p className="text-[12px] text-emerald-200/80 mt-1">
              A assinatura do cliente permanece válida. Conclua a etapa da SV para gerar o PDF
              bilateral final.
            </p>
          </div>
          <button
            type="button"
            disabled={signingProvider || busy}
            onClick={() => setProviderSignModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-[13px] hover:bg-emerald-500 disabled:opacity-50 shrink-0"
          >
            <ShieldCheck className={`w-4 h-4 ${signingProvider ? 'animate-pulse' : ''}`} />
            Assinar pela SV
          </button>
        </div>
      )}

      {!documentReady && !showProviderSignButton && validation?.ok && (
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
        <Info label="Empresa" value={contractProfile?.name || company.name || '—'} />
        {contractProfile?.documentFormatted ? (
          <Info
            label={contractProfile.documentLabel}
            value={contractProfile.documentFormatted}
          />
        ) : null}
        {contractProfile?.legalRepresentative ? (
          <Info label="Representante legal" value={contractProfile.legalRepresentative} />
        ) : null}
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
        <Info label="Status da assinatura" value={signatureStatusCard} />
        <Info
          label="Versão ativa"
          value={activeContract ? `Versão ${activeContract.version ?? 1}` : '—'}
        />
        <Info label="Nº do contrato" value={sub?.contract_number || activeContract?.contract_number || '—'} />
        <Info label="Data de geração" value={generatedAtLabel} />
        <Info label="Pagamento" value={company.payment_status} />
        <Info label="PDF" value={documentReady ? 'Disponível' : 'Não gerado'} />
      </div>

      <div className="px-5 pb-5">
        <h4 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          Histórico de Assinatura
        </h4>
        {mergedTimeline.length === 0 ? (
          <p className="text-xs text-gray-500">Nenhum evento de assinatura registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="text-gray-500 border-b border-white/5">
                  <th className="py-2 pr-3 font-medium">Data/Hora</th>
                  <th className="py-2 pr-3 font-medium">Evento</th>
                  <th className="py-2 font-medium">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {mergedTimeline.map((evt, idx) => (
                  <tr
                    key={`${evt.at}-${evt.event}-${idx}`}
                    className="border-b border-white/5 last:border-0"
                  >
                    <td className="py-2.5 pr-3 text-gray-400 whitespace-nowrap">
                      {formatSignatureTimelineDateTime(evt.at)}
                    </td>
                    <td className="py-2.5 pr-3 text-white font-medium">{evt.event}</td>
                    <td className="py-2.5 text-gray-400 break-all">{evt.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {signatureInfo.latest?.signer_name &&
          (signatureInfo.latest.signature_status === 'SIGNED' ||
            signatureInfo.latest.signature_status === 'CLIENT_SIGNED') && (
          <p className="text-[11px] text-emerald-300 mt-3">
            Cliente: {signatureInfo.latest.signer_name}
            {signatureInfo.latest.signer_document
              ? ` · ${formatSignerDocumentLine(signatureInfo.latest.signer_document)}`
              : ''}
            {signatureInfo.latest.provider_signer_name
              ? ` · SV: ${signatureInfo.latest.provider_signer_name}`
              : signatureInfo.latest.signature_status === 'CLIENT_SIGNED'
                ? ' · Aguardando assinatura da SV'
                : ''}
          </p>
        )}
      </div>

      <div className="px-5 pb-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <History className="w-4 h-4 text-gray-400" />
            Histórico de versões
          </h4>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1.5 shrink-0"
            >
              {showArchived ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  Ocultar arquivados
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  Mostrar arquivados{archivedCount > 0 ? ` (${archivedCount})` : ''}
                </>
              )}
            </button>
          )}
        </div>
        {visibleContracts.length === 0 ? (
          <p className="text-xs text-gray-500">
            {showArchived
              ? 'Nenhuma versão visível com o filtro atual.'
              : 'Nenhuma versão registrada ainda.'}
          </p>
        ) : (
          <div className="space-y-2 max-h-[240px] overflow-y-auto">
            {visibleContracts.map((c) => {
              const archived = isArchivedSaasContract(c);
              const isActiveVersion = isCurrentSaasContractVersion(c.status) && !archived;
              return (
              <div
                key={c.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-lg border text-[12px] ${
                  archived
                    ? 'bg-[#0B0E14]/60 border-amber-500/20 opacity-80'
                    : 'bg-[#0B0E14] border-white/5'
                }`}
              >
                <div className="min-w-0">
                  <span className="text-white font-medium">{c.contract_number}</span>
                  <span className="text-gray-500 ml-2">Versão {c.version ?? 1}</span>
                  <span
                    className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
                      isActiveVersion
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : archived
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {archived ? 'Arquivado' : saasVersionStatusLabel(c.status)}
                  </span>
                  <p className="text-gray-500 mt-0.5">
                    {formatDateBr(c.generated_at?.split('T')[0])}
                    {archived && c.archive_kind ? ` · ${c.archive_kind}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {user?.id && companyId && (
                    <a
                      href={buildSaasContractPdfUrl(companyId, user.id, 'download', c.id)}
                      className="text-blue-300 hover:underline flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Baixar
                    </a>
                  )}
                  {isSuperAdmin && !archived && (
                    <button
                      type="button"
                      onClick={() => setArchiveTarget(c)}
                      className="text-amber-300/90 hover:text-amber-200 flex items-center gap-1"
                      title={
                        isActiveVersion
                          ? 'Arquivar versão vigente (requer confirmação)'
                          : 'Ocultar versão de teste'
                      }
                    >
                      <Archive className="w-3 h-3" />
                      {isActiveVersion ? 'Arquivar' : 'Ocultar teste'}
                    </button>
                  )}
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>

      <RegenerateContractModal
        open={showRegenerateModal}
        busy={busy}
        onCancel={() => setShowRegenerateModal(false)}
        onConfirm={confirmRegenerate}
      />

      {signatureInfo.latest?.signature_url && (
        <ContractSignatureShareModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          companyName={company.name || '—'}
          signerName={signerContact.name}
          signerPhone={signerContact.phone}
          signerEmail={signerContact.email}
          contractNumber={contractNumber}
          signatureUrl={signatureInfo.latest.signature_url}
          expiresAt={signatureInfo.latest.expires_at}
          status={signatureInfo.latest.signature_status}
          onLinkCopied={() => appendLocalTimeline('Link copiado', 'Área de transferência')}
          onLinkOpened={() =>
            appendLocalTimeline('Aberto pelo administrador', signatureInfo.latest?.signature_url || '—')
          }
        />
      )}

      <ContractProviderSignModal
        isOpen={providerSignModalOpen}
        onClose={() => setProviderSignModalOpen(false)}
        companyName={company.name || '—'}
        contractNumber={contractNumber}
        busy={signingProvider}
        onSign={handleProviderSign}
      />

      <ArchiveSaasContractModal
        open={Boolean(archiveTarget)}
        contractNumber={archiveTarget?.contract_number || '—'}
        version={archiveTarget?.version ?? 1}
        isActiveVersion={
          archiveTarget
            ? isCurrentSaasContractVersion(archiveTarget.status)
            : false
        }
        busy={archivingContract}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={handleConfirmArchive}
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
