'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
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
import { ContractSignatureShareModal } from '@/components/saas/ContractSignatureShareModal';
import type { ContractSignatureRow } from '@/lib/saleContractSignatureService';
import {
  buildSaleSignatureEmailSubject,
  buildSaleSignatureShareMessage,
  buildSignatureShareWhatsAppUrl,
  canShareViaWhatsApp,
  formatSignatureTimelineDateTime,
  mergeSaleSignatureTimeline,
  type LocalSignatureTimelineEvent,
} from '@/lib/saleContractSignatureShare';
import {
  canResendSaleSignature,
  canSendSaleSignature,
  saleSignatureStatusEmoji,
  saleSignatureStatusLabel,
} from '@/lib/saleContractSignatureStatus';
import { canShowVendorSignButton } from '@/lib/saleContractBilateralSignature';
import { blockOwnerWriteOnClient } from '@/lib/ownerWriteGuard';
import { SaleContractVendorSignModal } from '@/components/contracts/SaleContractVendorSignModal';

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
};

export type SaleContractSignatureSectionHandle = {
  sendForSignature: () => Promise<void>;
  openShareModal: () => void;
};

type Props = {
  contract: SelectedContract | null;
  userRole?: string | null;
  compact?: boolean;
  onSigned?: () => void;
  onCapabilitiesChange?: (capabilities: SaleContractSignatureCapabilities) => void;
};

export const SaleContractSignatureSection = forwardRef<
  SaleContractSignatureSectionHandle,
  Props
>(function SaleContractSignatureSection(
  { contract, userRole, compact = false, onSigned, onCapabilitiesChange },
  ref,
) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [latest, setLatest] = useState<ContractSignatureRow | null>(null);
  const [timeline, setTimeline] = useState<Array<{ at: string; event: string; details: string }>>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [signUrl, setSignUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localTimeline, setLocalTimeline] = useState<LocalSignatureTimelineEvent[]>([]);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [vendorSignOpen, setVendorSignOpen] = useState(false);
  const [signingVendor, setSigningVendor] = useState(false);
  const [vendorDefaults, setVendorDefaults] = useState({
    name: '',
    document: '',
    email: '',
    companyName: '',
  });

  const buyerName = contract?.customer_name || contract?.customers?.name || 'Comprador';
  const buyerPhone = contract?.customers?.phone || null;
  const buyerEmail = contract?.customers?.email || null;
  const projectName =
    contract?.project_name || contract?.project_name_snapshot || 'Empreendimento';
  const quadra = resolveQuadra(contract?.blocks || null);
  const lote = resolveLote(contract?.blocks || null);

  const loadSignature = useCallback(async () => {
    if (!contract?.id) {
      setLatest(null);
      setTimeline([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/${contract.id}/signature`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Falha ao carregar assinatura.');
      }
      setLatest(json.latest || null);
      setSignUrl(json.latest?.signature_url || null);
      setVendorDefaults({
        name: String(json.vendorDefaults?.name || ''),
        document: String(json.vendorDefaults?.document || ''),
        email: String(json.vendorDefaults?.email || ''),
        companyName: String(json.vendorDefaults?.companyName || projectName),
      });
      setTimeline(mergeSaleSignatureTimeline(json.history || [], localTimeline));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar assinatura.');
    } finally {
      setLoading(false);
    }
  }, [contract?.id, localTimeline, projectName]);

  useEffect(() => {
    setLocalTimeline([]);
  }, [contract?.id]);

  useEffect(() => {
    void loadSignature();
  }, [loadSignature]);

  const canSend = useMemo(
    () =>
      contract &&
      canSendSaleSignature(contract.status, latest?.signature_status || contract.signature_status),
    [contract, latest?.signature_status],
  );

  const canShare = canResendSaleSignature(latest?.signature_status);
  const showVendorSignButton = canShowVendorSignButton(latest?.signature_status);

  const handleVendorSign = useCallback(
    async (input: {
      vendorName: string;
      vendorDocument: string;
      vendorEmail: string;
      vendorRole: string;
    }) => {
      if (!contract?.id || !latest?.id || blockOwnerWriteOnClient(userRole)) {
        throw new Error('Dados insuficientes para assinar.');
      }
      setSigningVendor(true);
      setError(null);
      try {
        const res = await fetch(`/api/contracts/${contract.id}/signature/sign-vendor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signatureId: latest.id,
            vendorName: input.vendorName,
            vendorDocument: input.vendorDocument,
            vendorEmail: input.vendorEmail,
            vendorRole: input.vendorRole,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || 'Falha ao assinar como vendedor.');
        }
        setLocalTimeline((prev) => [
          ...prev,
          {
            at: new Date().toISOString(),
            event: 'Vendedor assinou',
            details: input.vendorName,
          },
        ]);
        await loadSignature();
        onSigned?.();
      } finally {
        setSigningVendor(false);
      }
    },
    [contract?.id, latest?.id, loadSignature, onSigned, userRole],
  );

  const shareMessage = useMemo(() => {
    if (!signUrl || !contract) return '';
    return buildSaleSignatureShareMessage({
      buyerName,
      projectName,
      quadra,
      lote,
      contractNumber: String(contract.contract_number || ''),
      signatureUrl: signUrl,
    });
  }, [signUrl, contract, buyerName, projectName, quadra, lote]);

  const handleSend = useCallback(async () => {
    if (!contract?.id || blockOwnerWriteOnClient(userRole)) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/${contract.id}/signature`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Falha ao enviar para assinatura.');
      }
      const url = json.signUrl || json.signature?.signature_url;
      setLatest(json.signature || null);
      setSignUrl(url || null);
      setShareOpen(true);
      setLocalTimeline((prev) => [
        ...prev,
        { at: new Date().toISOString(), event: 'Link enviado', details: 'Enviado para assinatura' },
      ]);
      onSigned?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar.');
    } finally {
      setSending(false);
    }
  }, [contract?.id, onSigned, userRole]);

  useImperativeHandle(
    ref,
    () => ({
      sendForSignature: handleSend,
      openShareModal: () => setShareOpen(true),
    }),
    [handleSend],
  );

  useEffect(() => {
    onCapabilitiesChange?.({
      canSend: Boolean(canSend),
      canShare: Boolean(canShare && signUrl),
      sending,
    });
  }, [canSend, canShare, signUrl, sending, onCapabilitiesChange]);

  const handleCopyLink = async () => {
    if (!signUrl) return;
    try {
      await navigator.clipboard.writeText(signUrl);
      setCopyFeedback('Link copiado.');
    } catch {
      setCopyFeedback('Não foi possível copiar automaticamente.');
    }
  };

  const handleWhatsApp = () => {
    const url = buildSignatureShareWhatsAppUrl(buyerPhone, shareMessage);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!contract) return null;

  const status = latest?.signature_status || contract.signature_status;
  const statusLabel = saleSignatureStatusLabel(status);
  const isElectronicallySigned =
    String(status || '').toUpperCase() === 'SIGNED' ||
    ['assinado', 'signed'].includes(String(contract.status || '').toLowerCase());
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
              disabled={!canShareViaWhatsApp(buyerPhone)}
            />
            <ActionChip icon={Share2} label="Compartilhar" onClick={() => setShareOpen(true)} />
          </>
        )}
        {showVendorSignButton && (
          <ActionChip
            icon={ShieldCheck}
            label={signingVendor ? 'Assinando…' : 'Assinar como vendedor'}
            onClick={() => setVendorSignOpen(true)}
            disabled={signingVendor}
            primary
          />
        )}
        {isAwaitingVendor && (
          <p className="w-full text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            Comprador assinou. Aguardando assinatura do vendedor para emitir o certificado final.
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

      {signUrl && (
        <ContractSignatureShareModal
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          companyName={projectName}
          signerName={buyerName}
          signerPhone={buyerPhone}
          signerEmail={buyerEmail}
          contractNumber={String(contract.contract_number || '')}
          signatureUrl={signUrl}
          expiresAt={latest?.expires_at || new Date().toISOString()}
          status={status}
          shareMessage={shareMessage}
          emailSubject={buildSaleSignatureEmailSubject(projectName)}
          modalTitle="Contrato enviado para assinatura"
          modalSubtitle="Compartilhe o link com o comprador por WhatsApp, e-mail ou QR Code."
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
