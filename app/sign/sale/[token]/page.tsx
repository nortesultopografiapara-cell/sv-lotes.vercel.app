'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react';
import { buildSaleSignApiUrl } from '@/lib/saleContractUrls';
import { formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';
import { isValidSignerEmail } from '@/lib/saleContractEmailValidation';
import { resolveSalePublicSignPanel } from '@/lib/saleContractPublicSignUi';

type SaleSignPageData = {
  contract: { id: string; number: string; status: string };
  company: { id: string; name: string; cnpj?: string | null } | null;
  lot: { quadra: string; lote: string; project: string };
  buyer: { name: string | null; document?: string | null; email?: string | null };
  party?: {
    role: string;
    roleLabel: string;
    status: string;
    statusLabel: string;
    phone?: string | null;
    email?: string | null;
    emailOptional?: boolean;
  } | null;
  signature: {
    status: string;
    statusLabel: string;
    expiresAt: string;
    signedAt?: string | null;
    signerName?: string | null;
    blocked: boolean;
    canSign: boolean;
    awaitingVendor?: boolean;
    awaitingOtherBuyers?: boolean;
    partyStatus?: string | null;
    partyRole?: string | null;
    title?: string;
  };
  pdfUrl: string;
  pdfDownloadUrl: string;
};

function formatDateTimeBr(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export default function SaleSignContractPage() {
  const params = useParams();
  const token = typeof params.token === 'string' ? params.token : '';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<SaleSignPageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [signerName, setSignerName] = useState('');
  const [signerDocument, setSignerDocument] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const apiUrl = useMemo(
    () => (token ? buildSaleSignApiUrl(token) : ''),
    [token],
  );

  useEffect(() => {
    if (!token) {
      setError('Link inválido.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(apiUrl);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error || 'Link inválido ou expirado.');
          return;
        }
        const payload = json as SaleSignPageData;
        setData(payload);
        if (payload.buyer?.name) setSignerName(payload.buyer.name);
        if (payload.buyer?.document) {
          setSignerDocument(formatCpfCnpj(String(payload.buyer.document)));
        }
        // VENDOR com e-mail NULL (ex.: Aldenise): não pré-preencher e-mail do comprador.
        const partyEmail =
          payload.party?.email != null
            ? String(payload.party.email).trim()
            : '';
        if (payload.party?.role === 'VENDOR') {
          setSignerEmail(partyEmail);
        } else if (payload.buyer?.email) {
          setSignerEmail(String(payload.buyer.email));
        }
      } catch {
        setError('Não foi possível carregar o contrato.');
      } finally {
        setLoading(false);
      }
    })();
  }, [apiUrl, token]);

  const handleSign = async () => {
    setFormError(null);
    const doc = onlyDigits(signerDocument);
    if (!signerName.trim() || doc.length < 11) {
      setFormError('Preencha nome completo e CPF válidos.');
      return;
    }
    if (!accepted) {
      setFormError('Você precisa concordar com os termos do contrato.');
      return;
    }
    const emailOptional = Boolean(data?.party?.emailOptional);
    if (!emailOptional && !isValidSignerEmail(signerEmail)) {
      setFormError('Informe um e-mail válido.');
      return;
    }
    if (
      emailOptional &&
      signerEmail.trim() &&
      !isValidSignerEmail(signerEmail)
    ) {
      setFormError('Informe um e-mail válido ou deixe em branco.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName: signerName.trim(),
          signerDocument: doc,
          signerEmail: signerEmail.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(json.error || 'Falha ao assinar o contrato.');
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              party: prev.party
                ? {
                    ...prev.party,
                    status: 'SIGNED',
                    statusLabel: 'Assinado',
                  }
                : prev.party,
              signature: {
                ...prev.signature,
                status: json.awaitingOtherBuyers
                  ? 'PARTIALLY_SIGNED'
                  : json.awaitingVendor
                    ? 'CLIENT_SIGNED'
                    : prev.signature.status,
                statusLabel: json.awaitingOtherBuyers
                  ? 'Aguardando demais assinaturas'
                  : json.awaitingVendor
                    ? 'Aguardando assinatura do vendedor'
                    : prev.signature.statusLabel,
                blocked: true,
                canSign: false,
                awaitingVendor: Boolean(json.awaitingVendor),
                awaitingOtherBuyers: Boolean(json.awaitingOtherBuyers),
                partyStatus: 'SIGNED',
                signedAt: new Date().toISOString(),
                signerName: signerName.trim(),
              },
            }
          : prev,
      );
    } catch {
      setFormError('Erro de conexão. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const panelKind = data
    ? resolveSalePublicSignPanel({
        processStatus: data.signature.status,
        partyStatus: data.party?.status || data.signature.partyStatus,
        partyRole: data.party?.role || data.signature.partyRole,
        canSign: data.signature.canSign,
        awaitingOtherBuyers: data.signature.awaitingOtherBuyers,
        awaitingVendor: data.signature.awaitingVendor,
      })
    : 'unavailable';

  const signaturePanel =
    data &&
    (panelKind === 'fully_signed' ? (
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-emerald-300">Contrato assinado com sucesso</h3>
        <p className="text-sm text-gray-300 mt-2">
          Assinado por {data.signature.signerName || signerName || 'comprador'}
        </p>
        <p className="text-xs text-gray-500 mt-2">
          {formatDateTimeBr(data.signature.signedAt)}
        </p>
        <a
          href={data.pdfDownloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold"
        >
          <Download className="w-4 h-4" />
          Baixar contrato
        </a>
      </div>
    ) : panelKind === 'awaiting_other_buyers' ? (
      <div className="bg-sky-500/10 border border-sky-500/30 rounded-2xl p-6 text-center">
        <CheckCircle2 className="w-12 h-12 text-sky-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-sky-300">Sua assinatura foi registrada</h3>
        <p className="text-sm text-gray-300 mt-2">
          Aguardando a assinatura dos demais participantes do contrato.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Assinado por {data.signature.signerName || signerName} em{' '}
          {formatDateTimeBr(data.signature.signedAt)}
        </p>
      </div>
    ) : panelKind === 'awaiting_vendor' ? (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 text-center">
        <CheckCircle2 className="w-12 h-12 text-amber-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-amber-300">Sua assinatura foi registrada</h3>
        <p className="text-sm text-gray-300 mt-2">
          Aguardando assinatura do vendedor (imobiliária) para concluir o contrato.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Assinado por {data.signature.signerName || signerName || 'comprador'} em{' '}
          {formatDateTimeBr(data.signature.signedAt)}
        </p>
      </div>
    ) : panelKind === 'form' ? (
      <div className="bg-[#11161d] border border-white/10 rounded-2xl p-5 space-y-4 pb-[calc(120px+env(safe-area-inset-bottom))] md:pb-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-amber-400" />
          <h3 className="font-semibold">
            {data.signature.title ||
              (data.party?.role === 'SPOUSE'
                ? 'Assinatura do cônjuge anuente'
                : 'Assinatura do comprador')}
          </h3>
        </div>

        {data.party?.roleLabel && (
          <p className="text-xs text-amber-200/80">
            Você está assinando como <strong>{data.party.roleLabel}</strong>
            {data.buyer.name ? ` — ${data.buyer.name}` : ''}.
          </p>
        )}

        <Field
          label="Nome completo"
          value={signerName}
          onChange={setSignerName}
          placeholder="Nome completo"
        />
        <Field
          label="CPF"
          value={signerDocument}
          onChange={(v) => setSignerDocument(formatCpfCnpj(v))}
          placeholder="000.000.000-00"
        />
        <Field
          label={
            data.party?.emailOptional ? 'E-mail (opcional)' : 'E-mail'
          }
          type="email"
          value={signerEmail}
          onChange={setSignerEmail}
          placeholder={
            data.party?.emailOptional
              ? 'Sem e-mail — WhatsApp basta'
              : 'seu@email.com'
          }
        />

        <label className="flex items-start gap-3 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 shrink-0"
          />
          <span>Li e concordo com os termos do contrato de compra e venda.</span>
        </label>

        {formError && (
          <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            {formError}
          </p>
        )}

        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleSign()}
          className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 font-bold text-sm tracking-wide"
        >
          {submitting ? 'Registrando assinatura…' : 'ASSINAR CONTRATO'}
        </button>
      </div>
    ) : (
      <div className="bg-[#11161d] border border-red-500/20 rounded-2xl p-6 text-center">
        <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="text-red-300">
          Este link não está mais disponível para assinatura.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Status: {data.signature.statusLabel}
        </p>
      </div>
    ));

  return (
    <div className="min-h-[100dvh] overflow-y-auto pb-32 md:pb-8 bg-[#0b0e14] text-white">
      <header className="border-b border-white/10 bg-[#11161d] shrink-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex items-center gap-3 sm:gap-4">
          <Image
            src="/logo-sv-lotes.png"
            alt="SV LOTES"
            width={48}
            height={48}
            className="rounded-lg shrink-0"
          />
          <div className="min-w-0">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Assinatura eletrônica</p>
            <h1 className="text-base sm:text-lg font-bold truncate">
              Contrato de Compra e Venda
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex flex-col items-center gap-3 text-gray-400 py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <span className="text-sm">Carregando contrato…</span>
          </div>
        ) : error ? (
          <div className="max-w-md mx-auto bg-[#13161c] border border-red-500/30 rounded-xl p-8 text-center">
            <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-300">{error}</p>
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
            <div className="lg:col-span-2 order-1 lg:order-2 space-y-4">
              <div className="md:hidden bg-[#11161d] border border-white/10 rounded-2xl p-4">
                <p className="text-xs text-gray-500 uppercase">Contrato</p>
                <h2 className="text-lg font-bold">{data.contract.number}</h2>
                <p className="text-sm text-gray-400 mt-1">
                  QD {data.lot.quadra} · LT {data.lot.lote}
                </p>
                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  <a
                    href={data.pdfDownloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-white/10 text-sm hover:bg-white/5"
                  >
                    <Download className="w-4 h-4 shrink-0" />
                    Baixar PDF
                  </a>
                  <a
                    href={data.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    Abrir PDF
                  </a>
                </div>
              </div>

              <div className="bg-[#11161d] border border-white/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-5 h-5 text-blue-400 shrink-0" />
                  <h3 className="font-semibold">Dados do contrato</h3>
                </div>
                <dl className="space-y-2 text-sm">
                  <Row label="Contrato" value={data.contract.number} />
                  <Row label="Empreendimento" value={data.lot.project} />
                  <Row label="Quadra / Lote" value={`QD ${data.lot.quadra} · LT ${data.lot.lote}`} />
                  <Row
                    label="Comprador"
                    value={data.buyer.name || '—'}
                  />
                  {data.company?.name && (
                    <Row label="Imobiliária" value={data.company.name} />
                  )}
                  <Row label="Status" value={data.signature.statusLabel} />
                  <Row label="Validade do link" value={formatDateTimeBr(data.signature.expiresAt)} />
                </dl>
              </div>

              {signaturePanel}
            </div>

            <div className="hidden md:block lg:col-span-3 order-2 lg:order-1 space-y-4">
              <div className="bg-[#11161d] border border-white/10 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 uppercase">Contrato</p>
                    <h2 className="text-xl font-bold">{data.contract.number}</h2>
                    <p className="text-sm text-gray-400 mt-1 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 shrink-0" />
                      {data.lot.project} — QD {data.lot.quadra} LT {data.lot.lote}
                    </p>
                    {data.buyer.name && (
                      <p className="text-sm text-gray-400 mt-1 flex items-center gap-1.5">
                        <User className="w-4 h-4 shrink-0" />
                        {data.buyer.name}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <a
                      href={data.pdfDownloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-sm hover:bg-white/5"
                    >
                      <Download className="w-4 h-4" />
                      Baixar PDF
                    </a>
                    <a
                      href={data.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-sm hover:bg-white/5"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Abrir PDF
                    </a>
                  </div>
                </div>

                <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0b0e14] h-[55vh] lg:h-[65vh]">
                  <iframe
                    title="Contrato de compra e venda"
                    src={data.pdfUrl}
                    className="w-full h-full min-h-[320px]"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right text-gray-200">{value}</dd>
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
