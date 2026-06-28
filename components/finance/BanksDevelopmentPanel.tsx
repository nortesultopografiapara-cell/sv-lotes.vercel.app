'use client';

import { Construction } from 'lucide-react';
import { listFinancialGatewayProviders } from '@/lib/finance/FinancialGateway';

const DEVELOPMENT_BANKS = listFinancialGatewayProviders().filter((p) => p.code !== 'ASAAS');

export function BanksDevelopmentPanel() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <Construction className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Bancos nativos — em desenvolvimento</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              As integrações diretas com cooperativas e bancos estão em preparação. Nesta versão, utilize a aba{' '}
              <strong className="font-semibold text-[var(--text-primary)]">ASAAS</strong> como gateway oficial de
              cobrança e recebimentos.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DEVELOPMENT_BANKS.map((bank) => (
          <div
            key={bank.code}
            className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 opacity-90"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-[var(--text-primary)]">{bank.label}</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                🚧 Em desenvolvimento
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Provider registrado na arquitetura — configuração indisponível nesta versão.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
