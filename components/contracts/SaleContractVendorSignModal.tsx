'use client';

import { useEffect, useState } from 'react';
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
  const [vendorRole, setVendorRole] = useState('Representante legal');
  const [accepted, setAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVendorName(defaultName);
      setVendorDocument(defaultDocument);
      setVendorEmail(defaultEmail);
    }
  }, [isOpen, defaultName, defaultDocument, defaultEmail]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setFormError(null);
    const doc = onlyDigits(vendorDocument);
    if (!vendorName.trim() || doc.length < 11 || !vendorEmail.includes('@')) {
      setFormError('Preencha nome, CPF/CNPJ e e-mail válidos.');
      return;
    }
    if (!accepted) {
      setFormError('Você precisa concordar com os termos do contrato.');
      return;
    }

    setSubmitting(true);
    try {
      await onSign({
        vendorName: vendorName.trim(),
        vendorDocument: doc,
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

  const disabled = busy || submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div
        className="w-full max-w-lg bg-[#11161d] border border-white/10 rounded-2xl shadow-xl overflow-hidden"
        role="dialog"
        aria-labelledby="vendor-sign-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 id="vendor-sign-title" className="text-base font-bold text-white">
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

        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-400">
            Contrato <span className="text-white font-medium">{contractNumber}</span> ·{' '}
            {companyName}
          </p>
          <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            O comprador já assinou. Registre a assinatura real do PROMITENTE VENDEDOR para concluir
            o contrato e emitir o certificado final.
          </p>

          <label className="block text-sm">
            <span className="text-gray-400 text-xs block mb-1">Nome completo</span>
            <input
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              className="w-full rounded-lg bg-[#0b0e14] border border-white/10 px-3 py-2 text-white"
              disabled={disabled}
            />
          </label>

          <label className="block text-sm">
            <span className="text-gray-400 text-xs block mb-1">CPF / CNPJ</span>
            <input
              value={formatCpfCnpj(vendorDocument) || vendorDocument}
              onChange={(e) => setVendorDocument(onlyDigits(e.target.value))}
              className="w-full rounded-lg bg-[#0b0e14] border border-white/10 px-3 py-2 text-white"
              disabled={disabled}
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
            <span>Assino eletronicamente como representante da imobiliária (PROMITENTE VENDEDOR).</span>
          </label>

          {formError && (
            <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              {formError}
            </p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-white/10 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-white/5 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Assinando…
              </>
            ) : (
              'Assinar pela imobiliária'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
