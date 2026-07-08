'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Building2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  MessageCircle,
  Receipt,
  Wallet,
} from 'lucide-react';
import type {
  ClientPortalDashboardInstallment,
  ClientPortalDashboardResponse,
} from '@/lib/portal-cliente/dashboardTypes';

function formatDateBr(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function InstallmentSection({
  title,
  items,
  tone,
}: {
  title: string;
  items: ClientPortalDashboardInstallment[];
  tone: 'emerald' | 'amber' | 'red' | 'violet';
}) {
  if (!items || items.length === 0) return null;

  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-500/20 bg-emerald-500/5'
      : tone === 'red'
        ? 'border-red-500/20 bg-red-500/5'
        : tone === 'violet'
          ? 'border-violet-500/20 bg-violet-500/5'
          : 'border-amber-500/20 bg-amber-500/5';

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={`${item.installmentNumber}-${item.dueDate}`}
            className={`rounded-xl border p-4 ${toneClass}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Parcela {item.installmentNumber}</p>
                <p className="text-xs text-gray-400">Vencimento: {formatDateBr(item.dueDate)}</p>
                {item.paidAt ? (
                  <p className="text-xs text-gray-500">Pago em: {formatDateBr(item.paidAt)}</p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-white">{item.amountLabel}</p>
                <p className="text-xs text-gray-400">{item.statusLabel}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChargeCard({
  installmentNumber,
  dueDate,
  amountLabel,
  statusLabel,
  paymentUrl,
  boletoDownloadUrl,
  pixCopyPaste,
}: {
  installmentNumber: number | null;
  dueDate: string | null;
  amountLabel: string | null;
  statusLabel: string;
  paymentUrl: string | null;
  boletoDownloadUrl: string | null;
  pixCopyPaste: string | null;
}) {
  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            {installmentNumber ? `Parcela ${installmentNumber}` : 'Cobrança'}
          </p>
          {dueDate ? (
            <p className="text-xs text-gray-400">Vencimento: {formatDateBr(dueDate)}</p>
          ) : null}
        </div>
        <div className="text-right">
          {amountLabel ? <p className="text-sm font-semibold text-white">{amountLabel}</p> : null}
          <p className="text-xs text-gray-400">{statusLabel}</p>
        </div>
      </div>
      {paymentUrl || boletoDownloadUrl || pixCopyPaste ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {paymentUrl ? (
            <a
              href={paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Pagar online
            </a>
          ) : null}
          {boletoDownloadUrl ? (
            <a
              href={boletoDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/10"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Baixar boleto
            </a>
          ) : null}
          {pixCopyPaste ? (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(pixCopyPaste);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/10"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copiar PIX
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ClientPortalDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ClientPortalDashboardResponse | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/portal-cliente/dashboard', { cache: 'no-store' });
      const json = (await response.json()) as ClientPortalDashboardResponse & {
        ok?: boolean;
        message?: string;
        code?: string;
      };

      if (response.status === 401) {
        router.replace('/portal-cliente?expired=1');
        return;
      }

      if (!response.ok || !json.ok) {
        setError(json.message || 'Não foi possível carregar o painel.');
        return;
      }

      setData(json);
    } catch {
      setError('Não foi possível carregar o painel. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-cyan-400" aria-hidden />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4 rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-red-400" aria-hidden />
        <p className="text-sm text-red-300">{error || 'Painel indisponível.'}</p>
        <Link
          href="/portal-cliente"
          className="inline-block text-sm font-medium text-cyan-400 hover:text-cyan-300"
        >
          Voltar ao início
        </Link>
      </div>
    );
  }

  const paid = data.finance.installments.filter((i) => i.status === 'paid');
  const open = data.finance.installments.filter((i) => i.status === 'open');
  const overdue = data.finance.installments.filter((i) => i.status === 'overdue');
  const negotiation = data.finance.installments.filter((i) => i.status === 'negotiation');
  const hasContract = Boolean(
    data.contract.contractNumber ||
      data.contract.signUrl ||
      data.contract.contractPdfUrl ||
      data.contract.contractViewUrl ||
      data.contract.statusLabel ||
      data.contract.signatureStatusLabel,
  );

  return (
    <div className="space-y-4 pb-8">
      <div className="rounded-2xl border border-[#2d3340] bg-gradient-to-br from-[#13161c] to-[#0f1218] p-5">
        <p className="text-sm text-gray-400">Olá,</p>
        <h1 className="text-2xl font-bold text-white">{data.summary.greetingName}</h1>
        <p className="mt-1 text-xs text-gray-500">
          Portal restrito · somente leitura · contrato e financeiro da sua venda
        </p>
      </div>

      {data.message ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
          {data.message}
        </div>
      ) : null}

      <div className="rounded-2xl border border-[#2d3340] bg-[#13161c] p-5 space-y-3">
        <div className="flex items-center gap-2 text-cyan-400">
          <MapPin className="h-4 w-4" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Resumo da venda</h2>
        </div>
        <p className="text-lg font-semibold text-white">
          {data.summary.projectName || 'Empreendimento'}
        </p>
        {data.summary.quadraLote ? (
          <p className="text-sm text-gray-300">{data.summary.quadraLote}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-500">Status da venda</p>
            <p className="font-medium text-white">{data.summary.saleStatusLabel || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Loteadora</p>
            <p className="font-medium text-white">{data.summary.companyName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Building2 className="h-3.5 w-3.5" aria-hidden />
          <span>Cliente: {data.summary.customerNameMasked}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-[#2d3340] bg-[#13161c] p-5 space-y-3">
        <div className="flex items-center gap-2 text-cyan-400">
          <FileText className="h-4 w-4" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Contrato</h2>
        </div>

        {hasContract ? (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Número</p>
                <p className="font-medium text-white">{data.contract.contractNumber || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <p className="font-medium text-white">
                  {data.contract.signatureStatusLabel || data.contract.statusLabel || '—'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-500">Gerado em</p>
                <p className="font-medium text-white">
                  {data.contract.generatedAt ? formatDateBr(data.contract.generatedAt) : '—'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.contract.signUrl ? (
                <a
                  href={data.contract.signUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
                >
                  Assinar contrato
                </a>
              ) : null}
              {data.contract.contractViewUrl ? (
                <a
                  href={data.contract.contractViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  Visualizar contrato
                </a>
              ) : null}
              {data.contract.contractPdfUrl ? (
                <a
                  href={data.contract.contractPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Baixar contrato
                </a>
              ) : null}
            </div>
            {data.contract.emptyMessage ? (
              <p className="text-sm text-gray-400">{data.contract.emptyMessage}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-gray-400">{data.contract.emptyMessage}</p>
        )}
      </div>

      <div className="rounded-2xl border border-[#2d3340] bg-[#13161c] p-5 space-y-4">
        <div className="flex items-center gap-2 text-cyan-400">
          <Wallet className="h-4 w-4" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Financeiro</h2>
        </div>

        {data.finance.emptyMessage ? (
          <p className="text-sm text-gray-400">{data.finance.emptyMessage}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-lg bg-white/5 p-3 text-center">
                <p className="text-lg font-bold text-emerald-400">{data.summary.paidCount}</p>
                <p className="text-[10px] uppercase text-gray-500">Pagas</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3 text-center">
                <p className="text-lg font-bold text-amber-400">{data.summary.openCount}</p>
                <p className="text-[10px] uppercase text-gray-500">Abertas</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3 text-center">
                <p className="text-lg font-bold text-red-400">{data.summary.overdueCount}</p>
                <p className="text-[10px] uppercase text-gray-500">Vencidas</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3 text-center">
                <p className="text-lg font-bold text-violet-400">{data.summary.negotiationCount}</p>
                <p className="text-[10px] uppercase text-gray-500">Negociação</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3 text-center col-span-2 sm:col-span-1">
                <p className="text-xs font-semibold text-white truncate">
                  {data.summary.nextDueDate ? formatDateBr(data.summary.nextDueDate) : '—'}
                </p>
                <p className="text-[10px] uppercase text-gray-500">Próx. venc.</p>
              </div>
            </div>
            <p className="text-xs text-gray-400">{data.summary.financialStatusLabel}</p>

            <InstallmentSection title="Vencidas" items={overdue} tone="red" />
            <InstallmentSection title="Em aberto" items={open} tone="amber" />
            <InstallmentSection title="Em negociação" items={negotiation} tone="violet" />
            <InstallmentSection title="Pagas" items={paid} tone="emerald" />
          </>
        )}
      </div>

      <div className="rounded-2xl border border-[#2d3340] bg-[#13161c] p-5 space-y-4">
        <div className="flex items-center gap-2 text-cyan-400">
          <Receipt className="h-4 w-4" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Cobranças e boletos</h2>
        </div>

        {data.charges.emptyMessage ? (
          <p className="text-sm text-gray-400">{data.charges.emptyMessage}</p>
        ) : (
          <div className="space-y-2">
            {data.charges.items.map((charge, index) => (
              <ChargeCard
                key={`${charge.installmentNumber ?? 'charge'}-${charge.dueDate ?? index}`}
                {...charge}
              />
            ))}
          </div>
        )}
      </div>

      {data.companyWhatsAppUrl ? (
        <a
          href={data.companyWhatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Falar com a loteadora
        </a>
      ) : null}

      <p className="text-center text-xs text-gray-600">
        Acesso restrito à sua venda. Não é possível alterar dados, acessar o mapa ou gerar documentos
        por aqui.
      </p>
    </div>
  );
}
