'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';

export type SaleContractVendorSignModalProps = {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  contractNumber: string;
  busy?: boolean;
  defaultName?: string;
  defaultDocument?: string;
  defaultEmail?: string;
  onSign: (input: {
    vendorName: string;
    vendorDocument: string;
    vendorEmail: string;
    vendorRole: string;
  }) => Promise<void>;
};

function isVendorFormReady(name: string, documentDigits: string, email: string): boolean {
  return Boolean(name.trim()) && documentDigits.length >= 11 && email.includes('@');
}

export function SaleContractVendorSignModal({
  isOpen,
  onClose,
  companyName,
  contractNumber,
  busy = false,
  defaultName = '',
  defaultDocument = '',
  defaultEmail = '',
  onSign,
}: SaleContractVendorSignModalProps) {
  const [vendorName, setVendorName] = useState(defaultName);
  const [vendorDocument, setVendorDocument] = useState(defaultDocument);
  const [vendorEmail, setVendorEmail] = useState(defaultEmail);
  const [vendorRole] = useState('Representante legal');
  const [accepted, setAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setVendorName(defaultName);
      setVendorDocument(defaultDocument);
      setVendorEmail(defaultEmail);
      setAccepted(false);
      setFormError(null);
      setSubmitting(false);
    }
  }, [isOpen, defaultName, defaultDocument, defaultEmail]);

  useEffect(() => {
    if (formError && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [formError]);

  const documentDigits = onlyDigits(vendorDocument);
  const canSubmit = isVendorFormReady(vendorName, documentDigits, vendorEmail);
  const disabled = busy || submitting;

  const handleSubmit = async () => {
    setFormError(null);

    if (!vendorName.trim() || documentDigits.length < 11) {
      setFormError('Preencha nome completo e CPF/CNPJ válidos.');
      return;
    }
    if (!vendorEmail.includes('@')) {
      setFormError('Informe um e-mail válido para registrar a assinatura.');
      return;
    }
    if (!accepted) {
      setFormError('Marque a confirmação de assinatura eletrônica como vendedor.');
      return;
    }

    setSubmitting(true);
    try {
      await onSign({
        vendorName: vendorName.trim(),
        vendorDocument: documentDigits,
        vendorEmail: vendorEmail.trim(),
        vendorRole: vendorRole.trim(),
      });
      setAccepted(false);
      onClose();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Falha ao assinar como vendedor.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70"
      role="presentation"
      onClick={() => {
        if (!disabled) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-lg bg-[#11161d] border border-white/10 sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[min(92dvh,100%)]"
        role="dialog"
        aria-labelledby="vendor-sign-title"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <h2 id="vendor-sign-title" className="text-base font-bold text-white truncate">
              Assinar como vendedor
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          className="flex flex-col min-h-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="px-5 py-4 space-y-4 overflow-y-auto min-h-0 flex-1">
            <p className="text-sm text-gray-400">
              Contrato <span className="text-white font-medium">{contractNumber}</span> ·{' '}
              {companyName}
            </p>
            <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              O comprador já assinou. Registre a assinatura real do PROMITENTE VENDEDOR para
              concluir o contrato e emitir o certificado final.
            </p>

            <label className="block text-sm">
              <span className="text-gray-400 text-xs block mb-1">Nome completo</span>
              <input
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                className="w-full rounded-lg bg-[#0b0e14] border border-white/10 px-3 py-2 text-white"
                disabled={disabled}
                autoComplete="name"
              />
            </label>

            <label className="block text-sm">
              <span className="text-gray-400 text-xs block mb-1">CPF / CNPJ</span>
              <input
                value={formatCpfCnpj(vendorDocument) || vendorDocument}
                onChange={(e) => setVendorDocument(onlyDigits(e.target.value))}
                className="w-full rounded-lg bg-[#0b0e14] border border-white/10 px-3 py-2 text-white"
                disabled={disabled}
                inputMode="numeric"
                autoComplete="off"
              />
            </label>

            <label className="block text-sm">
              <span className="text-gray-400 text-xs block mb-1">E-mail</span>
              <input
                type="email"
                value={vendorEmail}
                onChange={(e) => setVendorEmail(e.target.value)}
                className="w-full rounded-lg bg-[#0b0e14] border border-white/10 px-3 py-2 text-white"
                disabled={disabled}
                autoComplete="email"
              />
            </label>

            <label className="flex items-start gap-3 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-1 shrink-0"
                disabled={disabled}
              />
              <span>
                Assino eletronicamente como representante da imobiliária (PROMITENTE VENDEDOR).
              </span>
            </label>

            {formError && (
              <p
                ref={errorRef}
                role="alert"
                className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3"
              >
                {formError}
              </p>
            )}
          </div>

          <div className="px-5 py-4 border-t border-white/10 flex gap-2 justify-end shrink-0 bg-[#11161d] pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              disabled={disabled}
              className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-white/5 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={disabled || !canSubmit}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Registrando assinatura...
                </>
              ) : (
                'Assinar como vendedor'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
