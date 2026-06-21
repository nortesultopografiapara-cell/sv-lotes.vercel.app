'use client';

import { useState } from 'react';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';
import { resolveSignerDocumentLabel } from '@/lib/saasContractDocumentLabel';
import { SAAS_PROVIDER } from '@/lib/saasContractContent';

export type ContractProviderSignModalProps = {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  contractNumber: string;
  busy?: boolean;
  onSign: (input: {
    providerName: string;
    providerDocument: string;
    providerEmail: string;
    providerRole: string;
  }) => Promise<void>;
};

export function ContractProviderSignModal({
  isOpen,
  onClose,
  companyName,
  contractNumber,
  busy = false,
  onSign,
}: ContractProviderSignModalProps) {
  const [providerName, setProviderName] = useState('');
  const [providerDocument, setProviderDocument] = useState('');
  const [providerEmail, setProviderEmail] = useState('');
  const [providerRole, setProviderRole] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setFormError(null);
    const doc = onlyDigits(providerDocument);
    const docLabel = resolveSignerDocumentLabel(doc);
    if (!providerName.trim() || doc.length < 11 || !providerEmail.includes('@')) {
      setFormError(`Preencha nome, ${docLabel} e e-mail válidos.`);
      return;
    }
    if (!accepted) {
      setFormError('Você precisa concordar com os termos do contrato.');
      return;
    }

    setSubmitting(true);
    try {
      await onSign({
        providerName: providerName.trim(),
        providerDocument: doc,
        providerEmail: providerEmail.trim(),
        providerRole: providerRole.trim(),
      });
      setProviderName('');
      setProviderDocument('');
      setProviderEmail('');
      setProviderRole('');
      setAccepted(false);
      onClose();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Falha ao assinar pela SV.');
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
        aria-labelledby="provider-sign-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 id="provider-sign-title" className="text-base font-bold text-white">
              Assinar pela SV
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

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-[#0B0E14] border border-white/5 p-4 text-sm">
            <p className="text-gray-400">
              Contrato <span className="text-white font-medium">{contractNumber}</span>
            </p>
            <p className="text-gray-400 mt-1">
              Cliente: <span className="text-white">{companyName}</span>
            </p>
            <p className="text-gray-500 text-xs mt-2">
              {SAAS_PROVIDER.legalName} · {SAAS_PROVIDER.tradeName}
            </p>
          </div>

          <Field
            label="Nome completo do representante"
            value={providerName}
            onChange={setProviderName}
            placeholder="Nome do representante da SV"
          />
          <Field
            label={resolveSignerDocumentLabel(providerDocument) || 'CPF'}
            value={providerDocument}
            onChange={(v) => setProviderDocument(formatCpfCnpj(v))}
            placeholder="000.000.000-00"
          />
          <Field
            label="Cargo"
            value={providerRole}
            onChange={setProviderRole}
            placeholder="Ex.: Sócio administrador"
          />
          <Field
            label="E-mail"
            value={providerEmail}
            onChange={setProviderEmail}
            placeholder="email@svlotes.com.br"
            type="email"
          />

          <label className="flex items-start gap-3 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1"
              disabled={disabled}
            />
            <span>Li e concordo com os termos do contrato.</span>
          </label>

          {formError && (
            <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              {formError}
            </p>
          )}

          <button
            type="button"
            disabled={disabled}
            onClick={() => void handleSubmit()}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-bold text-sm tracking-wide flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Registrando assinatura…
              </>
            ) : (
              'Assinar pela SV'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-gray-400 text-xs uppercase tracking-wide">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full bg-[#0b0e14] border border-white/10 rounded-lg px-3 py-2.5 text-white"
      />
    </label>
  );
}
