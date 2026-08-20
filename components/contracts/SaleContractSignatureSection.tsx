'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Copy,
  ExternalLink,
  MessageCircle,
  Send,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { SaleContractMultiPartyShareModal } from '@/components/contracts/SaleContractMultiPartyShareModal';
import type { ContractSignatureRow } from '@/lib/saleContractSignatureService';
import {
  buildSaleSignatureEmailSubject,
  buildSaleSignatureShareMessage,
  buildSalePartySignatureShareMessage,
  buildSignatureShareMailtoUrl,
  formatSignatureTimelineDateTime,
  mergeSaleSignatureTimeline,
  type LocalSignatureTimelineEvent,
} from '@/lib/saleContractSignatureShare';
import { openWhatsApp } from '@/lib/whatsapp/clickToChat';
import type { SaleSignaturePartyPublicView } from '@/lib/saleContractSignaturePartyTypes';
import {
  isVendorWaitingForBuyers,
  saleAwaitingVendorPanelMessage,
} from '@/lib/saleContractSignaturePartyTypes';
import {
  canResendSaleSignature,
  canSendSaleSignature,
  saleSignatureStatusEmoji,
  saleSignatureStatusLabel,
} from '@/lib/saleContractSignatureStatus';
import { isSaleContractFullySigned } from '@/lib/saleContractDashboardStats';
import { canShowVendorSignButton } from '@/lib/saleContractBilateralSignature';
import { blockOwnerWriteOnClient } from '@/lib/ownerWriteGuard';
import { SaleContractVendorSignModal } from '@/components/contracts/SaleContractVendorSignModal';
import {
  CONTRACTS_FETCH_TIMEOUT_MS,
  fetchJsonWithTimeout,
} from '@/lib/fetchJsonWithTimeout';
import { formatClientFetchError } from '@/lib/clientFetchError';
import { buildContractApiTenantQueryString } from '@/lib/contractApiTenantQuery';
import {
  enrichBuyerPartyPhone,
  pickCustomerWhatsAppPhoneForSignature,
} from '@/lib/saleContractPublicSignUi';
import {
  formatSalePartyShareContactLine,
  resolveSalePartyShareContact,
} from '@/lib/saleContractSignatureShareContact';
import { resolveSaleSignUrl } from '@/lib/saleContractUrls';

type SelectedContract = {
  id: string;
  contract_number?: string | null;
  status?: string | null;
  signature_status?: string | null;
  pdf_signed_url?: string | null;
  customer_name?: string | null;
  customers?: { name?: string; phone?: string | null; email?: string | null } | null;
  project_name?: string | null;
  project_name_snapshot?: string | null;
  blocks?: {
    quadra?: string;
    block_name?: string;
    name?: string;
    lot_number?: string;
    lote?: string;
    number?: string;
  } | null;
};

function resolveQuadra(block: SelectedContract['blocks']): string {
  if (!block) return '—';
  return String(block.quadra || block.block_name || block.name || '—');
}

function resolveLote(block: SelectedContract['blocks']): string {
  if (!block) return '—';
  return String(block.lot_number || block.lote || block.number || '—');
}

export type SaleContractSignatureCapabilities = {
  canSend: boolean;
  canShare: boolean;
  sending: boolean;
  canVendorSign: boolean;
  signingVendor: boolean;
};

export type SaleContractSignatureSectionHandle = {
  sendForSignature: () => Promise<void>;
  openShareModal: () => void;
  openVendorSignModal: () => void;
};

type Props = {
  contract: SelectedContract | null;
  userRole?: string | null;
  loggedInUserEmail?: string | null;
  authUser?: {
    id?: string;
    role?: string;
    tenant_id?: string;
    company_id?: string;
  } | null;
  compact?: boolean;
  onSigned?: () => void;
  onCapabilitiesChange?: (capabilities: SaleContractSignatureCapabilities) => void;
};

export const SaleContractSignatureSection = forwardRef<
  SaleContractSignatureSectionHandle,
  Props
>(function SaleContractSignatureSection(
  {
    contract,
    userRole,
    loggedInUserEmail,
    authUser,
    compact = false,
    onSigned,
    onCapabilitiesChange,
  },
  ref,
) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [latest, setLatest] = useState<ContractSignatureRow | null>(null);
  const [parties, setParties] = useState<SaleSignaturePartyPublicView[]>([]);
  const [progress, setProgress] = useState<{ signed: number; total: number } | null>(null);
  const [timeline, setTimeline] = useState<Array<{ at: string; event: string; details: string }>>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [signUrl, setSignUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localTimeline, setLocalTimeline] = useState<LocalSignatureTimelineEvent[]>([]);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [vendorSignOpen, setVendorSignOpen] = useState(false);
  const [signingVendor, setSigningVendor] = useState(false);
  const [vendorSignSuccess, setVendorSignSuccess] = useState<string | null>(null);
  const [vendorDefaults, setVendorDefaults] = useState({
    name: '',
    document: '',
    email: '',
    companyName: '',
  });

  const buyerName = contract?.customer_name || contract?.customers?.name || 'Comprador';
  const buyerPhone = pickCustomerWhatsAppPhoneForSignature(
    (contract?.customers as Record<string, unknown> | null | undefined) || null,
  );
  const buyerEmail = contract?.customers?.email || null;

  const buildSignatureApiUrl = useCallback(
    async (contractId: string) => {
      const query = await buildContractApiTenantQueryString(authUser || null);
      return `/api/contracts/${contractId}/signature${query ? `?${query}` : ''}`;
    },
    [authUser],
  );
  const projectName =
    contract?.project_name || contract?.project_name_snapshot || 'Empreendimento';
  const quadra = resolveQuadra(contract?.blocks || null);
  const lote = resolveLote(contract?.blocks || null);

  const [electronicallySignedFlag, setElectronicallySignedFlag] = useState(false);
  const onSignedRef = useRef(onSigned);
  onSignedRef.current = onSigned;
  const syncedSignedParentRef = useRef(false);

  const loadSignature = useCallback(async () => {
    if (!contract?.id) {
      setLatest(null);
      setTimeline([]);
      setElectronicallySignedFlag(false);
      syncedSignedParentRef.current = false;
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { ok, data, error: fetchError } = await fetchJsonWithTimeout<{
        error?: string;
        latest?: ContractSignatureRow | null;
        history?: Array<{ at: string; event: string; details: string }>;
        parties?: SaleSignaturePartyPublicView[];
        progress?: { signed: number; total: number };
        vendorDefaults?: { name?: string; document?: string; email?: string; companyName?: string };
        electronicallySigned?: boolean;
        pdfSignedUrl?: string | null;
      }>(
        await buildSignatureApiUrl(contract.id),
        { credentials: 'include' },
        CONTRACTS_FETCH_TIMEOUT_MS,
      );
      if (!ok) {
        throw new Error(fetchError || data?.error || 'Falha ao carregar assinatura.');
      }
      const json = data || {};
      setLatest(json.latest || null);
      setParties(json.parties || []);
      setProgress(json.progress || null);
      setElectronicallySignedFlag(Boolean(json.electronicallySigned));
      // Confiar na URL já normalizada pelo servidor (Preview usa VERCEL_URL em runtime).
      setSignUrl(json.latest?.signature_url || null);
      const fallbackEmail = String(loggedInUserEmail || '').trim();
      setVendorDefaults({
        name: String(json.vendorDefaults?.name || ''),
        document: String(json.vendorDefaults?.document || ''),
        email: String(json.vendorDefaults?.email || fallbackEmail || ''),
        companyName: String(json.vendorDefaults?.companyName || projectName),
      });
      setTimeline(mergeSaleSignatureTimeline(json.history || [], []));

      const becameSigned =
        Boolean(json.electronicallySigned) ||
        String(json.latest?.signature_status || '').toUpperCase() === 'SIGNED';
      // Sincroniza o contrato pai uma vez (status/pdf_signed_url) sem loop de reload.
      if (becameSigned && !syncedSignedParentRef.current) {
        syncedSignedParentRef.current = true;
        onSignedRef.current?.();
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : formatClientFetchError({ networkMessage: 'Failed to fetch' }),
      );
    } finally {
      setLoading(false);
    }
  }, [contract?.id, loggedInUserEmail, projectName, buildSignatureApiUrl]);

  useEffect(() => {
    setLocalTimeline([]);
    syncedSignedParentRef.current = false;
  }, [contract?.id]);

  useEffect(() => {
    void loadSignature();
  }, [loadSignature, contract?.signature_status]);

  const canSend = useMemo(
    () =>
      contract &&
      canSendSaleSignature(contract.status, latest?.signature_status || contract.signature_status),
    [contract, latest?.signature_status],
  );

  const canShare = canResendSaleSignature(latest?.signature_status);
  const showVendorSignButton = canShowVendorSignButton(latest?.signature_status);

  const resolveSignatureIdForVendorSign = useCallback(async (): Promise<string> => {
    if (latest?.id && canShowVendorSignButton(latest.signature_status)) {
      return latest.id;
    }

    if (!contract?.id) {
      throw new Error('Contrato não selecionado.');
    }

    const { ok, data, error: fetchError } = await fetchJsonWithTimeout<{
      error?: string;
      latest?: ContractSignatureRow | null;
    }>(
      await buildSignatureApiUrl(contract.id),
      { credentials: 'include' },
      CONTRACTS_FETCH_TIMEOUT_MS,
    );
    if (!ok) {
      throw new Error(fetchError || data?.error || 'Falha ao carregar assinatura.');
    }
    const json = data || {};

    const refreshed = json.latest as ContractSignatureRow | null;
    if (!refreshed?.id) {
      throw new Error('Solicitação de assinatura não encontrada. Recarregue a página.');
    }
    if (!canShowVendorSignButton(refreshed.signature_status)) {
      throw new Error('O comprador ainda não concluiu a assinatura.');
    }

    setLatest(refreshed);
    setSignUrl(
      refreshed.signature_token
        ? resolveSaleSignUrl(refreshed.signature_token, refreshed.signature_url)
        : refreshed.signature_url || null,
    );
    return refreshed.id;
  }, [contract?.id, latest?.id, latest?.signature_status, buildSignatureApiUrl]);

  const handleVendorSign = useCallback(
    async (input: {
      vendorName: string;
      vendorDocument: string;
      vendorEmail: string;
      vendorRole: string;
      partyId?: string | null;
    }) => {
      if (!contract?.id || blockOwnerWriteOnClient(userRole)) {
        throw new Error('Sem permissão para assinar como vendedor.');
      }

      setSigningVendor(true);
      setError(null);
      setVendorSignSuccess(null);

      try {
        const signatureId = await resolveSignatureIdForVendorSign();
        const { ok, data, error: fetchError } = await fetchJsonWithTimeout<{
          error?: string;
          signature?: ContractSignatureRow;
        }>(
          `/api/contracts/${contract.id}/signature/sign-vendor`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              signatureId,
              vendorName: input.vendorName,
              vendorDocument: input.vendorDocument,
              vendorEmail: input.vendorEmail,
              vendorRole: input.vendorRole,
              partyId: input.partyId || null,
            }),
          },
          CONTRACTS_FETCH_TIMEOUT_MS,
        );
        if (!ok) {
          throw new Error(fetchError || data?.error || 'Falha ao assinar como vendedor.');
        }
        const json = data || {};

        if (json.signature) {
          setLatest(json.signature as ContractSignatureRow);
        }

        setLocalTimeline((prev) => [
          ...prev,
          {
            at: new Date().toISOString(),
            event: 'Vendedor assinou',
            details: input.vendorName,
          },
        ]);
        setVendorSignSuccess('Contrato assinado pelo vendedor com sucesso.');
        await loadSignature();
        onSigned?.();
      } finally {
        setSigningVendor(false);
      }
    },
    [contract?.id, loadSignature, onSigned, resolveSignatureIdForVendorSign, userRole],
  );

  const pendingVendorTargets = useMemo(() => {
    return parties
      .filter(
        (p) =>
          p.role === 'VENDOR' &&
          !['SIGNED', 'CANCELLED', 'EXPIRED'].includes(
            String(p.status || '').toUpperCase(),
          ),
      )
      .map((p) => ({
        partyId: p.id,
        name: String(p.signer_name || p.name || 'Vendedor'),
        document: String(p.signer_cpf || ''),
        email: String(p.signer_email || p.email || ''),
      }));
  }, [parties]);

  const vendorPartyCount = useMemo(
    () => parties.filter((p) => p.role === 'VENDOR').length,
    [parties],
  );

  const multiVendorPending = vendorPartyCount > 1;

  const shareMessage = useMemo(() => {
    if (!signUrl || !contract) return '';
    const buyerParty = parties.find((p) => p.role === 'BUYER');
    if (buyerParty?.signature_url || buyerParty?.signatureUrl) {
      return buildSalePartySignatureShareMessage({
        signerName: buyerParty.signer_name || buyerName,
        role: 'BUYER',
        projectName,
        quadra,
        lote,
        contractNumber: String(contract.contract_number || ''),
        signatureUrl: String(buyerParty.signatureUrl || buyerParty.signature_url || signUrl),
      });
    }
    return buildSaleSignatureShareMessage({
      buyerName,
      projectName,
      quadra,
      lote,
      contractNumber: String(contract.contract_number || ''),
      signatureUrl: signUrl,
    });
  }, [signUrl, contract, buyerName, projectName, quadra, lote, parties]);

  const handleReissueParty = useCallback(
    async (party: SaleSignaturePartyPublicView) => {
      if (!contract?.id || !latest?.id || blockOwnerWriteOnClient(userRole)) return;
      setError(null);
      try {
        const { ok, data, error: fetchError } = await fetchJsonWithTimeout<{
          error?: string;
          parties?: SaleSignaturePartyPublicView[];
          signUrl?: string;
        }>(
          `/api/contracts/${contract.id}/signature/reissue-party`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              signatureId: latest.id,
              partyId: party.id,
            }),
          },
          CONTRACTS_FETCH_TIMEOUT_MS,
        );
        if (!ok) {
          throw new Error(fetchError || data?.error || 'Falha ao gerar novo link.');
        }
        if (data?.parties) setParties(data.parties);
        await loadSignature();
        setCopyFeedback(`Novo link gerado para ${party.roleLabel}.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao reemitir link.');
      }
    },
    [contract?.id, latest?.id, loadSignature, userRole],
  );

  const handleSend = useCallback(async () => {
    if (!contract?.id || blockOwnerWriteOnClient(userRole)) return;
    setSending(true);
    setError(null);
    try {
      const apiUrl = await buildSignatureApiUrl(contract.id);
      const { ok, data, error: fetchError } = await fetchJsonWithTimeout<{
        success?: boolean;
        error?: string;
        signUrl?: string;
        spouseSignUrl?: string | null;
        signature?: ContractSignatureRow;
        parties?: SaleSignaturePartyPublicView[];
      }>(
        apiUrl,
        { method: 'POST', credentials: 'include' },
        CONTRACTS_FETCH_TIMEOUT_MS,
      );
      if (!ok) {
        throw new Error(fetchError || data?.error || 'Falha ao enviar para assinatura.');
      }
      const json = data || {};
      const returnedParties = (json.parties || []) as SaleSignaturePartyPublicView[];
      const buyerFromParties = returnedParties.find((p) => p.role === 'BUYER');
      const url =
        json.signUrl ||
        json.signature?.signature_url ||
        buyerFromParties?.signatureUrl ||
        buyerFromParties?.signature_url ||
        null;
      if (!url && returnedParties.length === 0) {
        throw new Error('Link de assinatura não retornado pelo servidor.');
      }
      setLatest(json.signature || null);
      if (returnedParties.length > 0) setParties(returnedParties);
      setSignUrl(url);
      setShareOpen(true);
      const sentEvent = {
        at: new Date().toISOString(),
        event: 'Link enviado',
        details: 'Enviado para assinatura',
      };
      setLocalTimeline((prev) => [...prev, sentEvent]);
      setTimeline((prev) => [...prev, sentEvent]);
      onSigned?.();
    } catch (e) {
      console.error('[contracts/signature-final] client_send_failed', {
        contractId: contract?.id,
        message: e instanceof Error ? e.message : String(e),
      });
      setError(
        e instanceof Error
          ? e.message
          : formatClientFetchError({ networkMessage: 'Failed to fetch' }),
      );
    } finally {
      setSending(false);
    }
  }, [contract?.id, onSigned, userRole, buildSignatureApiUrl]);

  useImperativeHandle(
    ref,
    () => ({
      sendForSignature: handleSend,
      openShareModal: () => {
        if (latest?.signature_url) {
          setSignUrl(latest.signature_url);
        } else {
          const buyer = parties.find((p) => p.role === 'BUYER');
          const url = buyer?.signatureUrl || buyer?.signature_url || null;
          if (url) setSignUrl(url);
        }
        setShareOpen(true);
      },
      openVendorSignModal: () => {
        const canOpen =
          showVendorSignButton ||
          canShowVendorSignButton(contract?.signature_status);
        if (canOpen && !blockOwnerWriteOnClient(userRole)) {
          setVendorSignOpen(true);
        }
      },
    }),
    [handleSend, showVendorSignButton, contract?.signature_status, userRole, latest, parties],
  );

  useEffect(() => {
    onCapabilitiesChange?.({
      canSend: Boolean(canSend),
      canShare: Boolean(canShare && signUrl),
      sending,
      canVendorSign: Boolean(showVendorSignButton),
      signingVendor,
    });
  }, [canSend, canShare, signUrl, sending, showVendorSignButton, signingVendor, onCapabilitiesChange]);

  const handleCopyLink = async () => {
    if (!signUrl) return;
    try {
      await navigator.clipboard.writeText(signUrl);
      setCopyFeedback('Link copiado.');
    } catch {
      setCopyFeedback('Não foi possível copiar automaticamente.');
    }
  };

  const shareParties = useMemo(
    () => enrichBuyerPartyPhone(parties, buyerPhone),
    [parties, buyerPhone],
  );

  const buyerShareContact = useMemo(
    () =>
      resolveSalePartyShareContact(
        shareParties.find((p) => p.role === 'BUYER'),
        { fallbackPhone: buyerPhone },
      ),
    [shareParties, buyerPhone],
  );

  const handleWhatsApp = () => {
    openWhatsApp(buyerShareContact.phone, shareMessage);
  };

  if (!contract) return null;

  const status = latest?.signature_status || contract.signature_status;
  const statusLabel = saleSignatureStatusLabel(status);
  // Usar status do processo (`latest`) + flag da API — o `contract` do pai pode
  // permanecer "ativo" após 4/4 via links públicos até o reload.
  const isElectronicallySigned =
    electronicallySignedFlag ||
    isSaleContractFullySigned({
      status: contract.status,
      signature_status: latest?.signature_status || contract.signature_status,
    }) ||
    (Boolean(progress && progress.total > 0 && progress.signed >= progress.total) &&
      String(latest?.signature_status || '').toUpperCase() === 'SIGNED');
  const isAwaitingVendor = String(status || '').toUpperCase() === 'CLIENT_SIGNED';

  const signedPdfDownloadUrl = `/api/contracts/${contract.id}/pdf?download=1`;
  const signedPdfOpenUrl = `/api/contracts/${contract.id}/pdf?inline=1`;

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] ${compact ? 'p-3' : 'p-4'} space-y-3`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Assinatura eletrônica
          </p>
          <p className="text-sm font-semibold text-[var(--text-primary)] mt-1">
            {saleSignatureStatusEmoji(status)} {statusLabel}
          </p>
          {latest?.expires_at && !['SIGNED', 'CLIENT_SIGNED'].includes(String(status || '').toUpperCase()) && (
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Expira em {formatSignatureTimelineDateTime(latest.expires_at)}
            </p>
          )}
        </div>
        {loading && <span className="text-xs text-[var(--text-muted)]">Carregando…</span>}
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {parties.length > 0 && (
        <div className="border border-[var(--border-color)] rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Assinaturas
            </p>
            {progress && progress.total > 0 && (
              <p className="text-[11px] text-[var(--text-muted)]">
                Progresso: {progress.signed} de {progress.total} assinaturas
                concluídas.
              </p>
            )}
          </div>
          {shareParties.map((party) => {
            const contact = resolveSalePartyShareContact(party, {
              fallbackPhone: party.role === 'BUYER' ? buyerPhone : null,
            });
            const contactLine = formatSalePartyShareContactLine(contact);
            const url = party.signatureUrl || party.signature_url || null;
            const partyMessage =
              party.role === 'BUYER' ||
              party.role === 'SPOUSE' ||
              party.role === 'VENDOR'
                ? buildSalePartySignatureShareMessage({
                    signerName: party.signer_name || party.roleLabel,
                    role: party.role,
                    projectName,
                    quadra,
                    lote,
                    contractNumber: String(contract.contract_number || ''),
                    signatureUrl: url || '',
                  })
                : '';
            return (
              <div
                key={party.id}
                className="rounded-md bg-[var(--bg-primary)]/40 px-3 py-2 space-y-1.5"
              >
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {party.roleLabel}
                  {party.signer_name ? ` — ${party.signer_name}` : ''}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Status:{' '}
                  {party.status === 'SIGNED' && party.signed_at
                    ? `Assinado em ${formatSignatureTimelineDateTime(party.signed_at)}`
                    : party.statusLabel}
                </p>
                {contactLine && (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Contato: {contactLine}
                  </p>
                )}
                {party.role === 'VENDOR' &&
                  party.status !== 'SIGNED' &&
                  isVendorWaitingForBuyers(parties) && (
                  <p className="text-[11px] text-amber-300/80">
                    Aguardando os compradores
                  </p>
                )}
                {party.role === 'VENDOR' &&
                  party.status !== 'SIGNED' &&
                  !isVendorWaitingForBuyers(parties) &&
                  String(status || '').toUpperCase() === 'CLIENT_SIGNED' && (
                  <p className="text-[11px] text-emerald-300/80">
                    Liberada para assinar
                  </p>
                )}
                {party.canShare && url && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <ActionChip
                      icon={MessageCircle}
                      label="WhatsApp"
                      disabled={!contact.canShareWhatsApp}
                      onClick={() => {
                        openWhatsApp(contact.phone, partyMessage);
                      }}
                    />
                    <ActionChip
                      icon={Share2}
                      label="E-mail"
                      disabled={!contact.canShareEmail}
                      onClick={() => {
                        const mail = buildSignatureShareMailtoUrl(
                          contact.email,
                          buildSaleSignatureEmailSubject(projectName),
                          partyMessage,
                        );
                        if (mail) window.location.href = mail;
                      }}
                    />
                    <ActionChip
                      icon={Copy}
                      label="Copiar link"
                      onClick={() => {
                        void navigator.clipboard.writeText(url).then(() => {
                          setCopyFeedback(`Link do ${party.roleLabel} copiado.`);
                        });
                      }}
                    />
                    {party.canResend && (
                      <ActionChip
                        icon={Send}
                        label="Gerar novo link"
                        onClick={() => void handleReissueParty(party)}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {vendorSignSuccess && (
        <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          {vendorSignSuccess}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {canSend && (
          <ActionChip
            icon={Send}
            label={sending ? 'Enviando…' : 'Enviar para assinatura'}
            onClick={() => void handleSend()}
            disabled={sending}
            primary
          />
        )}
        {canShare && signUrl && (
          <>
            <ActionChip icon={Copy} label="Copiar link" onClick={() => void handleCopyLink()} />
            <ActionChip
              icon={ExternalLink}
              label="Abrir página"
              onClick={() => window.open(signUrl, '_blank', 'noopener,noreferrer')}
            />
            <ActionChip
              icon={MessageCircle}
              label="WhatsApp"
              onClick={handleWhatsApp}
              disabled={!buyerShareContact.canShareWhatsApp}
            />
            <ActionChip icon={Share2} label="Compartilhar" onClick={() => setShareOpen(true)} />
          </>
        )}
        {showVendorSignButton && (
          <ActionChip
            icon={ShieldCheck}
            label={
              signingVendor
                ? 'Assinando…'
                : multiVendorPending
                  ? 'Assinar promitente vendedor'
                  : 'Assinar como vendedor'
            }
            onClick={() => setVendorSignOpen(true)}
            disabled={signingVendor}
            primary
          />
        )}
        {isAwaitingVendor && (
          <p className="w-full text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            {saleAwaitingVendorPanelMessage(parties)}
          </p>
        )}
        {isElectronicallySigned ? (
          <>
            <ActionChip
              icon={ExternalLink}
              label="Abrir PDF Assinado"
              onClick={() => window.open(signedPdfOpenUrl, '_blank', 'noopener,noreferrer')}
            />
            <ActionChip
              icon={ShieldCheck}
              label="Baixar PDF Assinado"
              primary
              onClick={() => {
                window.location.href = signedPdfDownloadUrl;
              }}
            />
          </>
        ) : null}
      </div>

      {copyFeedback && <p className="text-[11px] text-emerald-400">{copyFeedback}</p>}

      {!compact && timeline.length > 0 && (
        <div className="border-t border-[var(--border-color)] pt-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Histórico</p>
          {timeline.map((evt, idx) => (
            <div key={`${evt.at}-${idx}`} className="text-xs text-[var(--text-secondary)]">
              <span className="text-[var(--text-muted)]">
                {formatSignatureTimelineDateTime(evt.at)}
              </span>
              {' — '}
              <span className="font-medium text-[var(--text-primary)]">{evt.event}</span>
              {evt.details ? ` · ${evt.details}` : ''}
            </div>
          ))}
        </div>
      )}

      {shareOpen && (parties.length > 0 || signUrl) && (
        <SaleContractMultiPartyShareModal
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          companyName={projectName}
          contractNumber={String(contract.contract_number || '')}
          expiresAt={latest?.expires_at || new Date().toISOString()}
          status={status}
          parties={shareParties}
          legacySignatureUrl={parties.length === 0 ? signUrl : null}
          legacySignerName={buyerName}
          legacySignerPhone={buyerPhone}
          legacySignerEmail={buyerEmail}
          projectName={projectName}
          quadra={quadra}
          lote={lote}
        />
      )}

      <SaleContractVendorSignModal
        isOpen={vendorSignOpen}
        onClose={() => setVendorSignOpen(false)}
        companyName={vendorDefaults.companyName || projectName}
        contractNumber={String(contract.contract_number || '')}
        busy={signingVendor}
        defaultName={vendorDefaults.name}
        defaultDocument={vendorDefaults.document}
        defaultEmail={vendorDefaults.email}
        vendorTargets={multiVendorPending ? pendingVendorTargets : []}
        onSign={handleVendorSign}
      />
    </div>
  );
});

function ActionChip({
  icon: Icon,
  label,
  onClick,
  disabled,
  primary,
}: {
  icon: typeof Send;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${
        primary
          ? 'bg-[var(--color-primary)] text-white hover:opacity-90'
          : 'border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label}
    </button>
  );
}
