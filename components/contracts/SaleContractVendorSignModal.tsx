'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';

export type VendorSignTargetOption = {
  partyId: string;
  name: string;
  document: string;
  email: string;
  emailRequired?: boolean;
};

export type SaleContractVendorSignModalProps = {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  contractNumber: string;
  busy?: boolean;
  defaultName?: string;
  defaultDocument?: string;
  defaultEmail?: string;
  /** Quando há N VENDORs (ARAGUAIA), lista as parties pendentes. */
  vendorTargets?: VendorSignTargetOption[];
  onSign: (input: {
    vendorName: string;
    vendorDocument: string;
    vendorEmail: string;
    vendorRole: string;
    partyId?: string | null;
  }) => Promise<void>;
};

function isVendorFormReady(
  name: string,
  documentDigits: string,
  email: string,
  emailRequired: boolean,
): boolean {
  if (!name.trim() || documentDigits.length < 11) return false;
  if (emailRequired && !email.includes('@')) return false;
  return true;
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
  vendorTargets = [],
  onSign,
}: SaleContractVendorSignModalProps) {
  const multi = vendorTargets.length > 0;
  const [selectedPartyId, setSelectedPartyId] = useState(
    vendorTargets[0]?.partyId || '',
  );
  const selectedTarget =
    vendorTargets.find((t) => t.partyId === selectedPartyId) ||
    vendorTargets[0] ||
    null;

  const [vendorName, setVendorName] = useState(defaultName);
  const [vendorDocument, setVendorDocument] = useState(defaultDocument);
  const [vendorEmail, setVendorEmail] = useState(defaultEmail);
  const [vendorRole] = useState('Promitente vendedor');
  const [accepted, setAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  const emailRequired = multi
    ? Boolean(String(selectedTarget?.email || '').trim())
    : true;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (multi && vendorTargets[0]) {
      setSelectedPartyId(vendorTargets[0].partyId);
      setVendorName(vendorTargets[0].name);
      setVendorDocument(vendorTargets[0].document);
      setVendorEmail(vendorTargets[0].email || '');
    } else {
      setVendorName(defaultName);
      setVendorDocument(defaultDocument);
      setVendorEmail(defaultEmail);
    }
    setAccepted(false);
    setFormError(null);
    setSubmitting(false);
  }, [isOpen, defaultName, defaultDocument, defaultEmail, multi, vendorTargets]);

  useEffect(() => {
    if (!multi || !selectedTarget) return;
    setVendorName(selectedTarget.name);
    setVendorDocument(selectedTarget.document);
    setVendorEmail(selectedTarget.email || '');
  }, [multi, selectedTarget]);

  useEffect(() => {
    if (formError && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [formError]);

  const documentDigits = onlyDigits(vendorDocument);
  const canSubmit = isVendorFormReady(
    vendorName,
    documentDigits,
    vendorEmail,
    emailRequired,
  );
  const disabled = busy || submitting;

  const handleSubmit = async () => {
    setFormError(null);

    if (!vendorName.trim() || documentDigits.length < 11) {
      setFormError('Preencha nome completo e CPF/CNPJ válidos.');
      return;
    }
    if (emailRequired && !vendorEmail.includes('@')) {
      setFormError('Informe um e-mail válido para registrar a assinatura.');
      return;
    }
    if (multi && !selectedPartyId) {
      setFormError('Selecione o promitente vendedor que irá assinar.');
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
        partyId: multi ? selectedPartyId : null,
      });
      setAccepted(false);
      onClose();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Falha ao registrar assinatura.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !mounted) return null;

  const title =
    multi && selectedTarget
      ? `Assinar como ${selectedTarget.name}`
      : 'Assinar como vendedor';

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/65 p-4">
      <div className="bg-[#11161d] border border-white/10 rounded-2xl max-w-lg w-full shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              {title}
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              {companyName} · Contrato {contractNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5"
            aria-label="Fechar"
            disabled={disabled}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          className="p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          {multi && (
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">
                Promitente vendedor
              </label>
              <select
                value={selectedPartyId}
                onChange={(e) => setSelectedPartyId(e.target.value)}
                disabled={disabled}
                className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
              >
                {vendorTargets.map((t) => (
                  <option key={t.partyId} value={t.partyId}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">
              Nome completo
            </label>
            <input
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              disabled={disabled || multi}
              className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">
              CPF
            </label>
            <input
              value={formatCpfCnpj(vendorDocument) || vendorDocument}
              onChange={(e) => setVendorDocument(e.target.value)}
              disabled={disabled || multi}
              className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">
              E-mail{emailRequired ? '' : ' (opcional)'}
            </label>
            <input
              type="email"
              value={vendorEmail}
              onChange={(e) => setVendorEmail(e.target.value)}
              disabled={disabled}
              placeholder={
                emailRequired
                  ? 'email@exemplo.com'
                  : 'Sem e-mail confirmado — WhatsApp basta'
              }
              className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              disabled={disabled}
              className="mt-1"
            />
            <span>
              Confirmo a assinatura eletrônica deste contrato na condição de
              promitente vendedor.
            </span>
          </label>

          {formError && (
            <p ref={errorRef} role="alert" className="text-sm text-rose-300">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={disabled || !canSubmit || !accepted}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold py-2.5"
          >
            {disabled ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Registrando assinatura…
              </>
            ) : multi && selectedTarget ? (
              `Assinar como ${selectedTarget.name.split(' ')[0]}`
            ) : (
              'Assinar como vendedor'
            )}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
