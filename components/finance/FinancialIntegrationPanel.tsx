'use client';

import { useState } from 'react';
import { Banknote, Building2 } from 'lucide-react';
import { AsaasIntegrationPanel } from '@/components/finance/AsaasIntegrationPanel';
import { FinancialAccountsPanel } from '@/components/finance/FinancialAccountsPanel';
import { BanksDevelopmentPanel } from '@/components/finance/BanksDevelopmentPanel';

type Tab = 'accounts' | 'asaas' | 'banks';

type Props = {
  tenantId: string;
  readOnlyDemo?: boolean;
};

export function FinancialIntegrationPanel({ tenantId, readOnlyDemo = false }: Props) {
  const [tab, setTab] = useState<Tab>('accounts');

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5 text-[var(--brand-primary)]" />
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Integração Financeira</h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Contas recebedoras e cobrança via Asaas — cada empreendimento e venda pode usar a conta correta.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[var(--border-color)] pb-2">
        <button
          type="button"
          onClick={() => setTab('accounts')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            tab === 'accounts'
              ? 'sv-brand-muted-bg text-[var(--text-primary)] ring-1 ring-[color-mix(in_srgb,var(--brand-primary)_25%,transparent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
          }`}
        >
          Contas Financeiras
        </button>
        <button
          type="button"
          onClick={() => setTab('asaas')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            tab === 'asaas'
              ? 'sv-brand-muted-bg text-[var(--text-primary)] ring-1 ring-[color-mix(in_srgb,var(--brand-primary)_25%,transparent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
          }`}
        >
          ASAAS (Conta padrão)
        </button>
        <button
          type="button"
          onClick={() => setTab('banks')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            tab === 'banks'
              ? 'sv-brand-muted-bg text-[var(--text-primary)] ring-1 ring-[color-mix(in_srgb,var(--brand-primary)_25%,transparent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
          }`}
        >
          Bancos (Em desenvolvimento)
        </button>
      </div>

      {tab === 'accounts' ? (
        <FinancialAccountsPanel tenantId={tenantId} readOnlyDemo={readOnlyDemo} />
      ) : tab === 'asaas' ? (
        <AsaasIntegrationPanel tenantId={tenantId} readOnlyDemo={readOnlyDemo} />
      ) : (
        <BanksDevelopmentPanel readOnlyDemo={readOnlyDemo} />
      )}
    </div>
  );
}

/** Card compacto para o dashboard operacional. */
export function FinancialIntegrationDashboardCard({
  loading,
  connectionStatus,
  webhookActive,
  lastSyncAt,
  chargesCount,
  settingsHref = '/settings#financeiro',
}: {
  loading?: boolean;
  connectionStatus: string;
  webhookActive: boolean;
  lastSyncAt: string | null;
  chargesCount: number;
  settingsHref?: string;
}) {
  const statusLabel =
    connectionStatus === 'CONNECTED'
      ? 'Conectado'
      : connectionStatus === 'WEBHOOK_INVALID'
        ? 'Webhook inválido'
        : connectionStatus === 'ERROR'
          ? 'Erro'
          : 'Desconectado';

  const statusColor =
    connectionStatus === 'CONNECTED'
      ? 'text-emerald-400'
      : connectionStatus === 'ERROR'
        ? 'text-red-400'
        : connectionStatus === 'WEBHOOK_INVALID'
          ? 'text-amber-400'
          : 'text-[var(--text-muted)]';

  return (
    <div className="dash-compact-panel">
      <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[var(--brand-primary)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Integração Financeira</h2>
        </div>
        <a href={settingsHref} className="text-xs font-medium text-blue-400 hover:text-blue-300">
          Configurar
        </a>
      </div>
      <div className="dash-compact-scroll p-3 space-y-3 text-sm">
        {loading ? (
          <p className="text-[var(--text-muted)]">Carregando…</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">Status ASAAS</span>
              <span className={`font-semibold ${statusColor}`}>{statusLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">Webhook</span>
              <span className={webhookActive ? 'text-emerald-400' : 'text-[var(--text-muted)]'}>
                {webhookActive ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">Última sincronização</span>
              <span className="text-[var(--text-primary)] text-xs">
                {lastSyncAt ? new Date(lastSyncAt).toLocaleString('pt-BR') : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">Cobranças sincronizadas</span>
              <span className="font-semibold text-[var(--text-primary)]">{chargesCount}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
