'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  FileText,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { PublicValidationPayload } from '@/lib/signatureVerifyService';

type PageProps = {
  params: Promise<{ token: string }>;
};

const STATUS_META = {
  VALIDO: {
    label: 'VÁLIDO',
    className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    icon: ShieldCheck,
  },
  INVALIDO: {
    label: 'INVÁLIDO',
    className: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    icon: ShieldAlert,
  },
  REVOGADO: {
    label: 'REVOGADO',
    className: 'text-red-400 bg-red-500/10 border-red-500/30',
    icon: XCircle,
  },
  EXPIRADO: {
    label: 'EXPIRADO',
    className: 'text-gray-400 bg-gray-500/10 border-gray-500/30',
    icon: XCircle,
  },
} as const;

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500 text-xs block mb-0.5">{label}</span>
      <span className="text-sm text-gray-200 break-all">{value || '—'}</span>
    </div>
  );
}

export default function VerifySignaturePage({ params }: PageProps) {
  const [token, setToken] = useState('');
  const [data, setData] = useState<PublicValidationPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<'hash' | 'url' | null>(null);

  useEffect(() => {
    let active = true;
    params.then(({ token: routeToken }) => {
      if (!active) return;
      setToken(routeToken);
      fetch(`/api/verify/${encodeURIComponent(routeToken)}`, { cache: 'no-store' })
        .then(async (res) => {
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error || 'Validação indisponível.');
          }
          return res.json() as Promise<PublicValidationPayload>;
        })
        .then((payload) => {
          if (active) setData(payload);
        })
        .catch((err: Error) => {
          if (active) setError(err.message || 'Erro ao validar documento.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });
    return () => {
      active = false;
    };
  }, [params]);

  async function copyText(kind: 'hash' | 'url', value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center text-gray-400">
        Validando assinatura eletrônica…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-[#13161c] border border-[#2d3340] rounded-xl p-8 text-center">
          <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-white mb-2">Validação indisponível</h1>
          <p className="text-sm text-gray-400">{error || 'Token inválido.'}</p>
        </div>
      </div>
    );
  }

  const statusMeta = STATUS_META[data.status];
  const StatusIcon = statusMeta.icon;

  return (
    <div className="min-h-screen bg-[#0b0e14] py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-[#2980b9] mb-2">
            <FileText className="w-5 h-5" />
            <span className="text-sm font-semibold tracking-wide">SV LOTES</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{data.title}</h1>
        </div>

        <div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold ${statusMeta.className}`}
        >
          <StatusIcon className="w-4 h-4" />
          Status: {statusMeta.label}
        </div>

        <section className="bg-[#13161c] border border-[#2d3340] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Dados do documento</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <InfoRow label="Número do contrato/documento" value={data.document.number} />
            <InfoRow label="Tipo do documento" value={data.document.type} />
            <InfoRow label="Empresa emissora" value={data.document.issuer} />
            <InfoRow label="Comprador / Cliente" value={data.document.clientName} />
            <InfoRow label="Data de emissão" value={data.document.issuedAt} />
            <InfoRow label="Data da assinatura" value={data.document.signedAt} />
            <InfoRow label="Hash SHA-256" value={data.document.hashSha256} />
            <InfoRow label="Token de validação" value={data.document.validationToken} />
            <InfoRow label="URL pública" value={data.document.publicUrl} />
            <InfoRow label="Certificado" value={data.document.certificateStatus} />
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => copyText('hash', data.document.hashSha256)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2d3340] text-sm text-gray-200 hover:bg-[#1a1e27]"
            >
              <Copy className="w-4 h-4" />
              {copied === 'hash' ? 'Hash copiado' : 'Copiar hash'}
            </button>
            <button
              type="button"
              onClick={() => copyText('url', data.document.publicUrl)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2d3340] text-sm text-gray-200 hover:bg-[#1a1e27]"
            >
              <Copy className="w-4 h-4" />
              {copied === 'url' ? 'Link copiado' : 'Copiar link de validação'}
            </button>
            {data.downloads.signedDocumentUrl ? (
              <a
                href={data.downloads.signedDocumentUrl}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#2980b9] text-sm text-white hover:opacity-90"
              >
                <Download className="w-4 h-4" />
                Baixar documento assinado
              </a>
            ) : null}
            {data.downloads.certificateUrl ? (
              <a
                href={data.downloads.certificateUrl}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2980b9] text-sm text-[#7ec8ff] hover:bg-[#1a1e27]"
              >
                <CheckCircle2 className="w-4 h-4" />
                Baixar certificado
              </a>
            ) : null}
          </div>
        </section>

        <section className="bg-[#13161c] border border-[#2d3340] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Dados dos assinantes</h2>
          <div className="space-y-4">
            {data.signers.map((signer) => (
              <div
                key={`${signer.role}-${signer.name}`}
                className="rounded-lg border border-[#2d3340] p-4 grid sm:grid-cols-2 gap-3"
              >
                <InfoRow label="Papel" value={signer.role} />
                <InfoRow label="Nome" value={signer.name} />
                <InfoRow label="CPF/CNPJ" value={signer.documentMasked} />
                <InfoRow label="E-mail" value={signer.emailMasked} />
                <InfoRow label="Telefone" value={signer.phoneMasked} />
                <InfoRow label="IP" value={signer.ipMasked} />
                <InfoRow label="Data/hora da assinatura" value={signer.signedAt} />
                <InfoRow label="Navegador" value={signer.browser} />
                <InfoRow label="Sistema operacional" value={signer.os} />
                <InfoRow label="Dispositivo" value={signer.device} />
                <InfoRow label="Localização aproximada" value={signer.location} />
                <InfoRow label="ID da assinatura" value={signer.signatureEventId} />
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#13161c] border border-[#2d3340] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Histórico de eventos</h2>
          {data.events.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum evento registrado para este documento.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-gray-500 border-b border-[#2d3340]">
                    <th className="py-2 pr-3">Data/hora</th>
                    <th className="py-2 pr-3">Evento</th>
                    <th className="py-2 pr-3">Pessoa</th>
                    <th className="py-2 pr-3">IP</th>
                    <th className="py-2">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((event) => (
                    <tr key={event.id} className="border-b border-[#2d3340]/60 align-top">
                      <td className="py-2 pr-3 text-gray-300 whitespace-nowrap">{event.occurredAt}</td>
                      <td className="py-2 pr-3 text-gray-200">{event.event}</td>
                      <td className="py-2 pr-3 text-gray-300">{event.person}</td>
                      <td className="py-2 pr-3 text-gray-300">{event.ipMasked}</td>
                      <td className="py-2 text-gray-400">{event.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs text-gray-500 text-center">
          Validação pública SV LOTES · token {token.slice(0, 8)}… · MP 2.200-2/2001 · Lei 14.063/2020
        </p>
      </div>
    </div>
  );
}
