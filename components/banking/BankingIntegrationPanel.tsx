'use client';

import { useState } from 'react';
import { Banknote, Loader2, PlugZap, QrCode, ReceiptText } from 'lucide-react';
import {
  MOCK_BANKING_ENVIRONMENT,
  MOCK_BANKING_PROVIDER,
  MOCK_INTEGRATION_STATUS,
} from '@/lib/banking/mockApiHandlers';
import type { BankBoletoPayload, BankPixPayload } from '@/lib/banking/types';

type ConnectionResult = {
  ok: boolean;
  message: string;
  latencyMs?: number;
};

type Props = {
  tenantId: string;
  readOnlyDemo?: boolean;
};

type ChargeResult =
  | { kind: 'boleto'; data: BankBoletoPayload }
  | { kind: 'pix'; data: BankPixPayload }
  | null;

export function BankingIntegrationPanel({ tenantId, readOnlyDemo = false }: Props) {
  const [loading, setLoading] = useState<'test' | 'boleto' | 'pix' | null>(null);
  const [connection, setConnection] = useState<ConnectionResult | null>(null);
  const [chargeResult, setChargeResult] = useState<ChargeResult>(null);
  const [error, setError] = useState<string | null>(null);

  async function callMockApi(path: string, label: 'test' | 'boleto' | 'pix') {
    setLoading(label);
    setError(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'MOCK' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `Erro ${res.status}`);
      }
      if (label === 'test') {
        setConnection(json.connection ?? null);
        setChargeResult(null);
      } else if (label === 'boleto') {
        setChargeResult({ kind: 'boleto', data: json.charge });
      } else {
        setChargeResult({ kind: 'pix', data: json.charge });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na operação MOCK.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="sv-theme-card p-6 rounded-xl border border-[var(--border-color)] shadow-lg space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center text-[var(--color-primary)]">
            <Banknote className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Integração Bancária</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Ambiente interno de homologação — provider MOCK, sem cobrança real.
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg bg-[var(--bg-elevated)] p-3 border border-[var(--border-color)]">
            <dt className="text-[var(--text-secondary)] text-xs uppercase tracking-wide">Módulo</dt>
            <dd className="font-semibold text-[var(--text-primary)] mt-1">{MOCK_BANKING_PROVIDER} / Sandbox</dd>
          </div>
          <div className="rounded-lg bg-[var(--bg-elevated)] p-3 border border-[var(--border-color)]">
            <dt className="text-[var(--text-secondary)] text-xs uppercase tracking-wide">Banco selecionado</dt>
            <dd className="font-semibold text-[var(--text-primary)] mt-1">{MOCK_BANKING_PROVIDER}</dd>
          </div>
          <div className="rounded-lg bg-[var(--bg-elevated)] p-3 border border-[var(--border-color)]">
            <dt className="text-[var(--text-secondary)] text-xs uppercase tracking-wide">Ambiente</dt>
            <dd className="font-semibold text-[var(--text-primary)] mt-1">{MOCK_BANKING_ENVIRONMENT}</dd>
          </div>
          <div className="rounded-lg bg-[var(--bg-elevated)] p-3 border border-[var(--border-color)]">
            <dt className="text-[var(--text-secondary)] text-xs uppercase tracking-wide">Status da integração</dt>
            <dd className="font-semibold text-[var(--text-primary)] mt-1">{MOCK_INTEGRATION_STATUS}</dd>
          </div>
        </dl>

        <p className="text-xs text-[var(--text-secondary)]">
          Empresa: <span className="font-mono">{tenantId}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={readOnlyDemo || loading !== null}
          onClick={() => callMockApi('/api/banking/mock/test-connection', 'test')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg sv-brand-btn-primary text-sm font-medium disabled:opacity-50"
        >
          {loading === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
          Testar conexão
        </button>
        <button
          type="button"
          disabled={readOnlyDemo || loading !== null}
          onClick={() => callMockApi('/api/banking/mock/create-boleto', 'boleto')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-sm font-medium hover:bg-[var(--bg-elevated)] disabled:opacity-50"
        >
          {loading === 'boleto' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ReceiptText className="w-4 h-4" />}
          Gerar boleto mock
        </button>
        <button
          type="button"
          disabled={readOnlyDemo || loading !== null}
          onClick={() => callMockApi('/api/banking/mock/create-pix', 'pix')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-sm font-medium hover:bg-[var(--bg-elevated)] disabled:opacity-50"
        >
          {loading === 'pix' ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
          Gerar Pix mock
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {connection ? (
        <div className="sv-theme-card p-4 rounded-xl border border-[var(--border-color)] text-sm">
          <p className="font-semibold text-[var(--text-primary)] mb-1">Resultado — teste de conexão</p>
          <p className={connection.ok ? 'text-green-400' : 'text-red-400'}>{connection.message}</p>
          {connection.latencyMs != null ? (
            <p className="text-[var(--text-secondary)] mt-1">Latência simulada: {connection.latencyMs} ms</p>
          ) : null}
        </div>
      ) : null}

      {chargeResult?.kind === 'boleto' ? (
        <div className="sv-theme-card p-5 rounded-xl border border-[var(--border-color)] space-y-3 text-sm">
          <p className="font-semibold text-[var(--text-primary)]">Resultado — boleto MOCK</p>
          <ResultRow label="Status" value={chargeResult.data.status} />
          <ResultRow label="Linha digitável" value={chargeResult.data.digitableLine} mono />
          <ResultRow label="Código de barras" value={chargeResult.data.barcode} mono />
          <ResultRow label="Link de pagamento" value={chargeResult.data.paymentUrl} link />
        </div>
      ) : null}

      {chargeResult?.kind === 'pix' ? (
        <div className="sv-theme-card p-5 rounded-xl border border-[var(--border-color)] space-y-3 text-sm">
          <p className="font-semibold text-[var(--text-primary)]">Resultado — Pix MOCK</p>
          <ResultRow label="Status" value={chargeResult.data.status} />
          {chargeResult.data.pixQrCode ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">QR Code Pix fictício</p>
              <img
                src={chargeResult.data.pixQrCode}
                alt="QR Code Pix MOCK"
                className="w-40 h-40 rounded border border-[var(--border-color)] bg-white"
              />
            </div>
          ) : null}
          <ResultRow label="Pix copia e cola" value={chargeResult.data.pixCopyPaste} mono />
          <ResultRow label="Link de pagamento" value={chargeResult.data.paymentUrl} link />
        </div>
      ) : null}
    </div>
  );
}

function ResultRow({
  label,
  value,
  mono,
  link,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">{label}</p>
      {link ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--color-primary)] break-all hover:underline"
        >
          {value}
        </a>
      ) : (
        <p className={`text-[var(--text-primary)] break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
      )}
    </div>
  );
}
