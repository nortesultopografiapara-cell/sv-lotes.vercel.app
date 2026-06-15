'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Copy,
  ExternalLink,
  Mail,
  MessageCircle,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  buildSignatureShareEmailSubject,
  buildSignatureShareMailtoUrl,
  buildSignatureShareMessage,
  buildSignatureShareWhatsAppUrl,
  canShareViaEmail,
  canShareViaWhatsApp,
  formatSignatureExpiresAtBr,
  qrCodePayloadForSignatureUrl,
} from '@/lib/saasContractSignatureShare';
import {
  signatureStatusEmoji,
  signatureStatusLabel,
  type SignatureStatus,
} from '@/lib/saasContractStatus';

export type ContractSignatureShareModalProps = {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  signerName?: string | null;
  signerPhone?: string | null;
  signerEmail?: string | null;
  contractNumber: string;
  signatureUrl: string;
  expiresAt: string;
  status?: SignatureStatus | string | null;
  onLinkCopied?: () => void;
  onLinkOpened?: () => void;
};

export function ContractSignatureShareModal({
  isOpen,
  onClose,
  companyName,
  signerName,
  signerPhone,
  signerEmail,
  contractNumber,
  signatureUrl,
  expiresAt,
  status = 'PENDING',
  onLinkCopied,
  onLinkOpened,
}: ContractSignatureShareModalProps) {
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const shareMessage = buildSignatureShareMessage({
    signerName: signerName || 'responsável',
    companyName,
    contractNumber,
    signatureUrl,
    expiresAt,
  });

  const whatsappUrl = buildSignatureShareWhatsAppUrl(signerPhone, shareMessage);
  const mailtoUrl = buildSignatureShareMailtoUrl(
    signerEmail,
    buildSignatureShareEmailSubject(companyName),
    shareMessage,
  );

  const whatsappEnabled = canShareViaWhatsApp(signerPhone);
  const emailEnabled = canShareViaEmail(signerEmail);

  useEffect(() => {
    if (!isOpen || !signatureUrl) {
      setQrDataUrl(null);
      return;
    }

    let cancelled = false;
    void QRCode.toDataURL(qrCodePayloadForSignatureUrl(signatureUrl), {
      width: 168,
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
  }, [isOpen, signatureUrl]);

  useEffect(() => {
    if (!isOpen) setCopyFeedback(null);
  }, [isOpen]);

  const handleCopyLink = useCallback(async () => {
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
        input.setSelectionRange(0, signatureUrl.length);
      }
      setCopyFeedback('Pressione Ctrl+C para copiar.');
    }
  }, [onLinkCopied, signatureUrl]);

  const handleOpenPage = useCallback(() => {
    window.open(signatureUrl, '_blank', 'noopener,noreferrer');
    onLinkOpened?.();
  }, [onLinkOpened, signatureUrl]);

  if (!isOpen) return null;

  const statusKey = String(status || 'PENDING').toUpperCase();

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/65 p-4">
      <div className="bg-[#11161d] border border-white/10 rounded-2xl max-w-2xl w-full shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
              Contrato enviado para assinatura
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Compartilhe o link com o signatário por WhatsApp, e-mail ou QR Code.
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

          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-2">
              Link de assinatura
            </label>
            <input
              ref={linkInputRef}
              readOnly
              value={signatureUrl}
              className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-blue-200 font-mono"
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

          <div className="flex flex-col sm:flex-row gap-4 items-center">
            {qrDataUrl ? (
              <div className="shrink-0 rounded-xl border border-white/10 bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR Code de assinatura" width={168} height={168} />
              </div>
            ) : (
              <div className="w-[168px] h-[168px] rounded-xl border border-dashed border-white/15 flex items-center justify-center text-xs text-gray-500">
                Gerando QR…
              </div>
            )}
            <p className="text-sm text-gray-400 text-center sm:text-left">
              Escaneie para assinar pelo celular
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <ActionButton icon={Copy} label="Copiar Link" onClick={() => void handleCopyLink()} />
            <ActionButton
              icon={ExternalLink}
              label="Abrir Página de Assinatura"
              onClick={handleOpenPage}
            />
            <ActionButton
              icon={MessageCircle}
              label="Enviar por WhatsApp"
              onClick={() => whatsappUrl && window.open(whatsappUrl, '_blank', 'noopener,noreferrer')}
              disabled={!whatsappEnabled || !whatsappUrl}
              disabledTitle="Telefone não cadastrado para envio por WhatsApp."
            />
            <ActionButton
              icon={Mail}
              label="Enviar por E-mail"
              onClick={() => mailtoUrl && window.open(mailtoUrl, '_self')}
              disabled={!emailEnabled || !mailtoUrl}
              disabledTitle="E-mail não cadastrado para envio."
            />
          </div>

          {statusKey === 'PENDING' && (
            <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" />
              O link é individual e válido até a data de expiração indicada.
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
