'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';
import { PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE } from '@/lib/primaryAdminReauth';

const SELLER_SIGNATURE_LOAD_FAILED_MESSAGE =
  'Não foi possível carregar a autorização do Administrador Principal.';
const SELLER_SIGNATURE_ALREADY_SIGNED_MESSAGE =
  'Este vendedor já assinou este contrato.';

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
  contractId?: string;
  signatureId?: string | null;
  busy?: boolean;
  defaultName?: string;
  defaultDocument?: string;
  defaultEmail?: string;
  /** Label do documento (CPF pessoa física / CNPJ PJ INTERVENIENT). */
  documentLabel?: 'CPF' | 'CNPJ';
  /** Quando há N VENDORs (ARAGUAIA), lista as parties pendentes. */
  vendorTargets?: VendorSignTargetOption[];
  /** Party persistida (INTERVENIENT ou VENDOR único). Não decide senha — o GET decide. */
  partyId?: string | null;
  /** Só muda copy. A senha é decidida pelo preview server-side. */
  signKind?: 'vendor' | 'intervenient';
  onSign: (input: {
    vendorName: string;
    vendorDocument: string;
    vendorEmail: string;
    vendorRole: string;
    partyId?: string | null;
    password?: string;
  }) => Promise<void>;
};

type ModalStep = 'form' | 'authorize' | 'load_failed';
type PreviewPlan = 'authorize' | 'sign' | 'failed';

type PrincipalPreview = {
  displayName: string;
  maskedEmail: string;
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
  contractId,
  signatureId,
  busy = false,
  defaultName = '',
  defaultDocument = '',
  defaultEmail = '',
  documentLabel = 'CPF',
  vendorTargets = [],
  partyId = null,
  signKind = 'vendor',
  onSign,
}: SaleContractVendorSignModalProps) {
  const isIntervenient = signKind === 'intervenient';
  const showVendorSelect = signKind === 'vendor' && vendorTargets.length > 1;
  const [selectedPartyId, setSelectedPartyId] = useState(
    vendorTargets[0]?.partyId || partyId || '',
  );
  const selectedTarget =
    vendorTargets.find((t) => t.partyId === selectedPartyId) ||
    vendorTargets[0] ||
    null;

  const [vendorName, setVendorName] = useState(defaultName);
  const [vendorDocument, setVendorDocument] = useState(defaultDocument);
  const [vendorEmail, setVendorEmail] = useState(defaultEmail);
  const vendorRole = isIntervenient ? 'Interveniente' : 'Promitente vendedor';
  const [accepted, setAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<ModalStep>('form');
  const [password, setPassword] = useState('');
  const [principal, setPrincipal] = useState<PrincipalPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  const resolvedPartyId =
    selectedPartyId || partyId || vendorTargets[0]?.partyId || '';
  const emailRequired = showVendorSelect
    ? Boolean(String(selectedTarget?.email || '').trim())
    : isIntervenient
      ? false
      : true;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (vendorTargets[0]) {
      setSelectedPartyId(vendorTargets[0].partyId);
      setVendorName(vendorTargets[0].name);
      setVendorDocument(vendorTargets[0].document);
      setVendorEmail(vendorTargets[0].email || '');
    } else {
      setSelectedPartyId(partyId || '');
      setVendorName(defaultName);
      setVendorDocument(defaultDocument);
      setVendorEmail(defaultEmail);
    }
    setAccepted(false);
    setFormError(null);
    setSubmitting(false);
    setStep('form');
    setPassword('');
    setPrincipal(null);
  }, [isOpen, defaultName, defaultDocument, defaultEmail, partyId, vendorTargets]);

  useEffect(() => {
    if (!showVendorSelect || !selectedTarget) return;
    setVendorName(selectedTarget.name);
    setVendorDocument(selectedTarget.document);
    setVendorEmail(selectedTarget.email || '');
  }, [showVendorSelect, selectedTarget]);

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
  const disabled = busy || submitting || loadingPreview;

  const loadAuthorizationPreview = async (): Promise<PreviewPlan> => {
    if (!contractId || !signatureId) {
      setFormError(SELLER_SIGNATURE_LOAD_FAILED_MESSAGE);
      setStep('load_failed');
      return 'failed';
    }
    setLoadingPreview(true);
    setFormError(null);
    try {
      const params = new URLSearchParams({
        signatureId,
        vendorName: vendorName.trim(),
        vendorDocument: documentDigits,
      });
      if (resolvedPartyId) params.set('partyId', resolvedPartyId);
      const res = await fetch(
        `/api/contracts/${contractId}/signature/sign-vendor?${params.toString()}`,
        { method: 'GET', credentials: 'include' },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setPrincipal(null);
        setFormError(
          json?.error === SELLER_SIGNATURE_ALREADY_SIGNED_MESSAGE ||
            json?.code === 'already_signed'
            ? SELLER_SIGNATURE_ALREADY_SIGNED_MESSAGE
            : SELLER_SIGNATURE_LOAD_FAILED_MESSAGE,
        );
        setStep('load_failed');
        return 'failed';
      }
      if (json.alreadySigned) {
        setPrincipal(null);
        setFormError(SELLER_SIGNATURE_ALREADY_SIGNED_MESSAGE);
        setStep('load_failed');
        return 'failed';
      }
      if (json.requiresAuthorization) {
        if (!json?.principal) {
          setPrincipal(null);
          setFormError(SELLER_SIGNATURE_LOAD_FAILED_MESSAGE);
          setStep('load_failed');
          return 'failed';
        }
        setPrincipal({
          displayName: String(json.principal.displayName || 'Administrador Principal'),
          maskedEmail: String(json.principal.maskedEmail || '—'),
        });
        setStep('authorize');
        return 'authorize';
      }
      return 'sign';
    } catch {
      setPrincipal(null);
      setFormError(SELLER_SIGNATURE_LOAD_FAILED_MESSAGE);
      setStep('load_failed');
      return 'failed';
    } finally {
      setLoadingPreview(false);
    }
  };

  const submitSignature = async (presentedPassword?: string) => {
    setSubmitting(true);
    try {
      await onSign({
        vendorName: vendorName.trim(),
        vendorDocument: documentDigits,
        vendorEmail: vendorEmail.trim(),
        vendorRole: vendorRole.trim(),
        partyId: resolvedPartyId || null,
        password: presentedPassword,
      });
      setAccepted(false);
      setPassword('');
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao registrar assinatura.';
      setFormError(message);
      if (message === PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE && principal) {
        setStep('authorize');
      }
    } finally {
      setPassword('');
      setSubmitting(false);
    }
  };

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
    if (showVendorSelect && !selectedPartyId) {
      setFormError('Selecione o promitente vendedor que irá assinar.');
      return;
    }
    if (!accepted) {
      setFormError(
        isIntervenient
          ? 'Marque a confirmação de assinatura eletrônica como interveniente.'
          : 'Marque a confirmação de assinatura eletrônica como vendedor.',
      );
      return;
    }

    if (step === 'form') {
      const plan = await loadAuthorizationPreview();
      if (plan === 'authorize' || plan === 'failed') return;
      await submitSignature();
      return;
    }

    const presented = password.trim();
    if (!presented) {
      setFormError('Informe a senha do Administrador Principal.');
      return;
    }
    await submitSignature(presented);
  };

  if (!isOpen || !mounted) return null;

  const title =
    step === 'authorize'
      ? 'AUTORIZAÇÃO DO ADMINISTRADOR PRINCIPAL'
      : isIntervenient
        ? `Assinar como ${companyName || 'INTERVENIENTE'}`
        : showVendorSelect && selectedTarget
          ? `Assinar como ${selectedTarget.name}`
          : 'Assinar como vendedor';

  const showPasswordStep = Boolean(step === 'authorize' && principal);

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
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          {step === 'form' && (
            <>
              {showVendorSelect && (
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
                  disabled={disabled || showVendorSelect || isIntervenient}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">
                  {documentLabel}
                </label>
                <input
                  value={formatCpfCnpj(vendorDocument) || vendorDocument}
                  onChange={(e) => setVendorDocument(e.target.value)}
                  disabled={disabled || showVendorSelect || isIntervenient}
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
                  {isIntervenient
                    ? 'Confirmo a assinatura eletrônica deste contrato na condição de interveniente.'
                    : 'Confirmo a assinatura eletrônica deste contrato na condição de promitente vendedor.'}
                </span>
              </label>
            </>
          )}

          {showPasswordStep && (
            <>
              <p className="text-sm text-gray-300">
                Esta operação registra a assinatura do vendedor e requer autorização.
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm rounded-lg border border-white/10 px-3 py-3">
                <dt className="text-gray-500">Contrato</dt>
                <dd className="font-medium text-white">{contractNumber}</dd>
                <dt className="text-gray-500">Vendedor</dt>
                <dd className="font-medium text-white">{vendorName}</dd>
                <dt className="text-gray-500">CPF/CNPJ</dt>
                <dd className="font-medium text-white">
                  {formatCpfCnpj(vendorDocument) || vendorDocument}
                </dd>
                <dt className="text-gray-500">Papel</dt>
                <dd className="font-medium text-white">Promitente Vendedor / Vendedor</dd>
              </dl>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                  Administrador Principal
                </p>
                <p className="text-sm font-medium text-white">{principal?.displayName}</p>
                <p className="text-sm text-gray-400">{principal?.maskedEmail}</p>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">
                  Senha do Administrador Principal
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={disabled}
                  autoComplete="off"
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
                />
              </div>
            </>
          )}

          {step === 'load_failed' && (
            <p className="text-sm text-rose-300">
              {formError || SELLER_SIGNATURE_LOAD_FAILED_MESSAGE}
            </p>
          )}

          {formError && step !== 'load_failed' && (
            <p ref={errorRef} role="alert" className="text-sm text-rose-300">
              {formError}
            </p>
          )}

          <div className="flex gap-2">
            {showPasswordStep || step === 'load_failed' ? (
              <button
                type="button"
                onClick={() => {
                  setStep('form');
                  setPassword('');
                  setFormError(null);
                }}
                disabled={disabled}
                className="flex-1 rounded-lg border border-white/15 text-gray-200 text-sm font-medium py-2.5"
              >
                Cancelar
              </button>
            ) : null}
            {step === 'load_failed' ? (
              <button
                type="button"
                onClick={() => void loadAuthorizationPreview()}
                disabled={disabled}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold py-2.5"
              >
                Tentar novamente
              </button>
            ) : (
              <button
                type="submit"
                disabled={
                  disabled ||
                  (step === 'form' && (!canSubmit || !accepted)) ||
                  (showPasswordStep && !password.trim())
                }
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold py-2.5"
              >
                {disabled ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {showPasswordStep ? 'Autorizando…' : 'Registrando assinatura…'}
                  </>
                ) : showPasswordStep ? (
                  'Autorizar e assinar como vendedor'
                ) : isIntervenient ? (
                  `Assinar como ${companyName.split(' ')[0] || 'INTERVENIENTE'}`
                ) : showVendorSelect && selectedTarget ? (
                  `Assinar como ${selectedTarget.name.split(' ')[0]}`
                ) : (
                  'Assinar como vendedor'
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>,
  document.body,
  );
}
