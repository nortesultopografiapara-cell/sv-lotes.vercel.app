'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Mail,
  MessageCircle,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  buildSalePartySignatureShareMessage,
  buildSaleSignatureEmailSubject,
  buildSignatureShareMailtoUrl,
  formatSignatureExpiresAtBr,
} from '@/lib/saleContractSignatureShare';
import { openWhatsApp } from '@/lib/whatsapp/clickToChat';
import { qrCodePayloadForSignatureUrl } from '@/lib/saasContractSignatureShare';
import type { SaleSignaturePartyPublicView } from '@/lib/saleContractSignaturePartyTypes';
import { enrichBuyerPartyPhone } from '@/lib/saleContractPublicSignUi';
import {
  formatSalePartyShareContactLine,
  resolveSalePartyShareContact,
} from '@/lib/saleContractSignatureShareContact';
import { maskEmailPublic } from '@/lib/signaturePrivacy';
import {
  signatureStatusEmoji,
  signatureStatusLabel,
  type SignatureStatus,
} from '@/lib/saasContractStatus';
import { sortAraguaiaVendorParties } from '@/lib/araguaiaContractEsign';

const VENDOR_INTERNAL_MESSAGE =
  'A assinatura da vendedora será realizada internamente no sistema após a conclusão das assinaturas do comprador e do cônjuge.';

const SPOUSE_MISSING_URL_MESSAGE =
  'O cônjuge foi identificado como signatário, mas o link individual não foi gerado. Reemita o link ou verifique o processo de assinatura.';

export type SaleContractMultiPartyShareModalProps = {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  contractNumber: string;
  expiresAt: string;
  status?: SignatureStatus | string | null;
  parties: SaleSignaturePartyPublicView[];
  /** Fallback legado — exibido se parties estiver vazio. */
  legacySignatureUrl?: string | null;
  legacySignerName?: string | null;
  legacySignerPhone?: string | null;
  legacySignerEmail?: string | null;
  projectName?: string;
  quadra?: string;
  lote?: string;
  onLinkCopied?: () => void;
  onLinkOpened?: () => void;
};

type PartyCardProps = {
  party: SaleSignaturePartyPublicView;
  projectName: string;
  quadra: string;
  lote: string;
  contractNumber: string;
  buyerFallbackPhone?: string | null;
  onLinkCopied?: () => void;
  onLinkOpened?: () => void;
};

function roleHeading(role: string): string {
  const key = String(role || '').toUpperCase();
  if (key === 'BUYER') return 'COMPRADOR';
  if (key === 'SPOUSE') return 'CÔNJUGE ANUENTE';
  if (key === 'VENDOR') return 'PROMITENTE VENDEDOR';
  return 'SIGNATÁRIO';
}

function PartyShareCard({
  party,
  projectName,
  quadra,
  lote,
  contractNumber,
  buyerFallbackPhone = null,
  onLinkCopied,
  onLinkOpened,
}: PartyCardProps) {
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const signatureUrl = String(
    party.signatureUrl || party.signature_url || '',
  ).trim();
  const displayName = String(
    party.name || party.signer_name || '',
  ).trim();
  const contact = resolveSalePartyShareContact(party, {
    fallbackPhone: party.role === 'BUYER' ? buyerFallbackPhone : null,
  });
  const contactLine = formatSalePartyShareContactLine(contact);
  const phone = contact.phone;
  const email = contact.email;
  const isVendor = party.role === 'VENDOR';
  const isSpouse = party.role === 'SPOUSE';
  const isExternal = party.role === 'BUYER' || party.role === 'SPOUSE';
  const isPublicVendor = isVendor && Boolean(signatureUrl);
  const canShareLikeExternal = isExternal || isPublicVendor;
  const missingUrl =
    Boolean(party.missingPublicUrl) ||
    (isExternal && !signatureUrl);

  const shareMessage = useMemo(() => {
    if (!canShareLikeExternal || !signatureUrl) return '';
    return buildSalePartySignatureShareMessage({
      signerName: displayName || party.roleLabel,
      role:
        party.role === 'SPOUSE' || party.role === 'VENDOR'
          ? party.role
          : 'BUYER',
      projectName,
      quadra,
      lote,
      contractNumber,
      signatureUrl,
    });
  }, [
    canShareLikeExternal,
    contractNumber,
    displayName,
    lote,
    party.role,
    party.roleLabel,
    projectName,
    quadra,
    signatureUrl,
  ]);

  const mailtoUrl = buildSignatureShareMailtoUrl(
    email,
    buildSaleSignatureEmailSubject(projectName),
    shareMessage,
  );

  useEffect(() => {
    if (!signatureUrl || (!canShareLikeExternal && isVendor) || missingUrl) {
      setQrDataUrl(null);
      return;
    }
    if (isVendor && !isPublicVendor) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(qrCodePayloadForSignatureUrl(signatureUrl), {
      width: 148,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [canShareLikeExternal, isPublicVendor, isVendor, missingUrl, signatureUrl]);

  const handleCopy = useCallback(async () => {
    if (!signatureUrl) return;
    setCopyFeedback(null);
    try {
      await navigator.clipboard.writeText(signatureUrl);
      setCopyFeedback('Link copiado com sucesso.');
      onLinkCopied?.();
    } catch {
      const input = linkInputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
      setCopyFeedback('Pressione Ctrl+C para copiar.');
    }
  }, [onLinkCopied, signatureUrl]);

  const handleOpen = useCallback(() => {
    if (!signatureUrl) return;
    window.open(signatureUrl, '_blank', 'noopener,noreferrer');
    onLinkOpened?.();
  }, [onLinkOpened, signatureUrl]);

  const emailMasked = email ? maskEmailPublic(email) : '';

  return (
    <section className="rounded-xl border border-white/10 bg-[#0B0E14] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-blue-300/90 font-semibold">
            {roleHeading(party.role)}
          </p>
          <p className="text-base font-semibold text-white mt-0.5">
            {displayName || party.roleLabel}
          </p>
          {(contactLine && (!isVendor || isPublicVendor)) ||
          (contact.canShareEmail && emailMasked && emailMasked !== '—') ? (
            <p className="text-[11px] text-gray-400 mt-1 space-x-2">
              {contact.canShareWhatsApp && contact.phoneLast4 ? (
                <span>WhatsApp: final {contact.phoneLast4}</span>
              ) : contact.phoneInvalidHint ? (
                <span>Telefone inválido para WhatsApp</span>
              ) : null}
              {emailMasked && emailMasked !== '—' ? (
                <span>E-mail: {emailMasked}</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <p className="text-xs text-gray-300">
          {signatureStatusEmoji(party.status)} {party.statusLabel}
        </p>
      </div>

      {isVendor && !isPublicVendor ? (
        <p className="text-sm text-amber-200/90 leading-relaxed">{VENDOR_INTERNAL_MESSAGE}</p>
      ) : missingUrl ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            {isSpouse
              ? SPOUSE_MISSING_URL_MESSAGE
              : 'O link individual deste signatário não foi gerado. Reemita o link ou verifique o processo de assinatura.'}
          </p>
        </div>
      ) : (
        <>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-2">
              Link individual
            </label>
            <input
              ref={linkInputRef}
              readOnly
              value={signatureUrl}
              className="w-full bg-[#11161d] border border-white/10 rounded-lg px-3 py-2.5 text-[12px] text-blue-200 font-mono"
            />
            {copyFeedback && (
              <p
                className={`mt-2 text-xs ${
                  copyFeedback.includes('Ctrl+C') ? 'text-amber-300' : 'text-emerald-300'
                }`}
              >
                {copyFeedback}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-center">
            {qrDataUrl ? (
              <div className="shrink-0 rounded-xl border border-white/10 bg-white p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt={`QR Code — ${roleHeading(party.role)}`}
                  width={148}
                  height={148}
                />
              </div>
            ) : (
              <div className="w-[148px] h-[148px] rounded-xl border border-dashed border-white/15 flex items-center justify-center text-xs text-gray-500">
                Gerando QR…
              </div>
            )}
            <p className="text-xs text-gray-400 text-center sm:text-left">
              QR exclusivo deste participante. Não compartilhe com outros
              signatários.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <ActionButton icon={Copy} label="Copiar link" onClick={() => void handleCopy()} />
            <ActionButton
              icon={ExternalLink}
              label="Abrir página de assinatura"
              onClick={handleOpen}
              disabled={!signatureUrl}
            />
            <ActionButton
              icon={MessageCircle}
              label="Enviar por WhatsApp"
              onClick={() => openWhatsApp(phone, shareMessage)}
              disabled={!contact.canShareWhatsApp || !shareMessage}
              disabledTitle="Telefone não cadastrado para envio por WhatsApp."
            />
            <ActionButton
              icon={Mail}
              label="Enviar por e-mail"
              onClick={() => mailtoUrl && window.open(mailtoUrl, '_self')}
              disabled={!contact.canShareEmail || !mailtoUrl}
              disabledTitle="E-mail não cadastrado para envio."
            />
          </div>
        </>
      )}
    </section>
  );
}

export function SaleContractMultiPartyShareModal({
  isOpen,
  onClose,
  companyName,
  contractNumber,
  expiresAt,
  status = 'PENDING',
  parties,
  legacySignatureUrl,
  legacySignerName,
  legacySignerPhone,
  legacySignerEmail,
  projectName = 'Empreendimento',
  quadra = '—',
  lote = '—',
  onLinkCopied,
  onLinkOpened,
}: SaleContractMultiPartyShareModalProps) {
  const orderedParties = useMemo(() => {
    const rank = (role: string) => {
      if (role === 'BUYER') return 0;
      if (role === 'SPOUSE') return 1;
      if (role === 'VENDOR') return 2;
      return 9;
    };
    const enriched = enrichBuyerPartyPhone([...parties], legacySignerPhone);
    const vendors = sortAraguaiaVendorParties(
      enriched.filter((p) => p.role === 'VENDOR'),
    );
    const nonVendors = enriched
      .filter((p) => p.role !== 'VENDOR')
      .sort((a, b) => rank(a.role) - rank(b.role));
    return [...nonVendors, ...vendors];
  }, [parties, legacySignerPhone]);

  const useLegacy = orderedParties.length === 0 && Boolean(legacySignatureUrl);

  useEffect(() => {
    if (isOpen && useLegacy) {
      console.warn(
        '[sale-signature-share] Fallback legado: modal sem parties — exibindo link único.',
      );
    }
  }, [isOpen, useLegacy]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/65 p-4">
      <div className="bg-[#11161d] border border-white/10 rounded-2xl max-w-3xl w-full shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-white/10 sticky top-0 bg-[#11161d] z-10">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
              Contrato enviado para assinatura
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Cada participante externo possui link, QR Code e contatos próprios.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <InfoRow label="Empresa" value={companyName} />
            <InfoRow label="Contrato" value={contractNumber} />
            <InfoRow
              label="Status"
              value={`${signatureStatusEmoji(status)} ${signatureStatusLabel(status)}`}
            />
            <InfoRow label="Expira em" value={formatSignatureExpiresAtBr(expiresAt)} />
          </div>

          {useLegacy ? (
            <LegacySingleLinkBlock
              signatureUrl={String(legacySignatureUrl)}
              signerName={legacySignerName}
              signerPhone={legacySignerPhone}
              signerEmail={legacySignerEmail}
              projectName={projectName}
              quadra={quadra}
              lote={lote}
              contractNumber={contractNumber}
              onLinkCopied={onLinkCopied}
              onLinkOpened={onLinkOpened}
            />
          ) : (
            orderedParties.map((party) => (
              <PartyShareCard
                key={party.id || party.role}
                party={party}
                projectName={projectName}
                quadra={quadra}
                lote={lote}
                contractNumber={contractNumber}
                buyerFallbackPhone={legacySignerPhone}
                onLinkCopied={onLinkCopied}
                onLinkOpened={onLinkOpened}
              />
            ))
          )}

          {!useLegacy && (
            <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" />
              Links são pessoais. Não reutilize o link do comprador para o cônjuge.
            </p>
          )}
        </div>

        <div className="p-5 border-t border-white/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg bg-[#2d3340] text-gray-200 text-sm font-semibold hover:bg-[#3d4450]"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function LegacySingleLinkBlock({
  signatureUrl,
  signerName,
  signerPhone,
  signerEmail,
  projectName,
  quadra,
  lote,
  contractNumber,
  onLinkCopied,
  onLinkOpened,
}: {
  signatureUrl: string;
  signerName?: string | null;
  signerPhone?: string | null;
  signerEmail?: string | null;
  projectName: string;
  quadra: string;
  lote: string;
  contractNumber: string;
  onLinkCopied?: () => void;
  onLinkOpened?: () => void;
}) {
  const fakeParty: SaleSignaturePartyPublicView = {
    id: 'legacy-buyer',
    role: 'BUYER',
    roleLabel: 'Comprador',
    signer_name: signerName || 'Comprador',
    name: signerName || 'Comprador',
    signer_phone: signerPhone || null,
    phone: signerPhone || null,
    signer_email: signerEmail || null,
    email: signerEmail || null,
    status: 'PENDING',
    statusLabel: 'Aguardando assinatura',
    sent_at: null,
    viewed_at: null,
    signed_at: null,
    expires_at: null,
    signature_url: signatureUrl,
    signatureUrl,
    canResend: false,
    canShare: true,
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
        Modo legado: este contrato ainda não possui participantes individuais
        (parties). Exibindo o link único do comprador.
      </p>
      <PartyShareCard
        party={fakeParty}
        projectName={projectName}
        quadra={quadra}
        lote={lote}
        contractNumber={contractNumber}
        buyerFallbackPhone={signerPhone}
        onLinkCopied={onLinkCopied}
        onLinkOpened={onLinkOpened}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0B0E14] border border-white/5 rounded-lg px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm text-white mt-0.5">{value}</p>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  disabledTitle,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledTitle : undefined}
      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-white/10 text-[13px] text-gray-200 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </button>
  );
}
