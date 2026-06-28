'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Copy, ShieldAlert } from 'lucide-react';
import type { MockChargeDisplay } from '@/lib/banking/providers/mockBankProvider';

type Props = {
  charge: MockChargeDisplay;
  backHref?: string;
};

function formatBrl(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

export function MockPaymentView({ charge, backHref = '/settings' }: Props) {
  const title = charge.chargeType === 'BOLETO' ? 'Boleto MOCK' : 'Pix MOCK';

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8 space-y-6">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex gap-3 text-sm text-amber-100">
        <ShieldAlert className="w-5 h-5 shrink-0 text-amber-400" />
        <div>
          <p className="font-semibold text-amber-200">Ambiente MOCK / SANDBOX</p>
          <p className="mt-1 text-amber-100/90">
            Cobrança fictícia — nenhuma cobrança real será registrada.
          </p>
        </div>
      </div>

      <div className="sv-theme-card rounded-xl border border-[var(--border-color)] p-5 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Tipo</p>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mt-1">{title}</h1>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)] p-3">
            <dt className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Status</dt>
            <dd className="font-semibold text-yellow-400 mt-1">{charge.status}</dd>
          </div>
          <div className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)] p-3">
            <dt className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Ambiente</dt>
            <dd className="font-semibold text-[var(--text-primary)] mt-1">{charge.environment}</dd>
          </div>
          <div className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)] p-3 sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">ID da cobrança</dt>
            <dd className="font-mono text-xs text-[var(--text-primary)] mt-1 break-all">{charge.externalId}</dd>
          </div>
          <div className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)] p-3">
            <dt className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Valor</dt>
            <dd className="font-semibold text-[var(--text-primary)] mt-1">{formatBrl(charge.amount)}</dd>
          </div>
          <div className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)] p-3">
            <dt className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Vencimento</dt>
            <dd className="font-semibold text-[var(--text-primary)] mt-1">{charge.dueDate}</dd>
          </div>
        </dl>

        {charge.chargeType === 'BOLETO' && charge.digitableLine ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Linha digitável fictícia</p>
            <p className="font-mono text-xs text-[var(--text-primary)] break-all rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] p-3">
              {charge.digitableLine}
            </p>
            <button
              type="button"
              onClick={() => void copyText(charge.digitableLine!)}
              className="inline-flex items-center gap-2 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar linha digitável
            </button>
          </div>
        ) : null}

        {charge.chargeType === 'PIX' ? (
          <div className="space-y-3">
            {charge.pixQrCode ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">QR Code fictício</p>
                <img
                  src={charge.pixQrCode}
                  alt="QR Code Pix MOCK"
                  className="w-40 h-40 rounded border border-[var(--border-color)] bg-white"
                />
              </div>
            ) : null}
            {charge.pixCopyPaste ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Pix copia e cola fictício</p>
                <p className="font-mono text-xs text-[var(--text-primary)] break-all rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] p-3">
                  {charge.pixCopyPaste}
                </p>
                <button
                  type="button"
                  onClick={() => void copyText(charge.pixCopyPaste!)}
                  className="inline-flex items-center gap-2 text-xs font-medium text-[var(--color-primary)] hover:underline"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar Pix copia e cola
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-start gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          <p>Esta página é apenas para visualização de testes. Não efetua pagamento real.</p>
        </div>
      </div>

      <Link
        href={backHref}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar para Integração Financeira
      </Link>
    </div>
  );
}
