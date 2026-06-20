'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownCircle, ArrowUpCircle, CloudDownload, RefreshCw, Wallet } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { formatSaasCurrency } from '@/lib/companyPricing';
import {
  saasCashSourceLabel,
  saasCashTypeLabel,
  type SaasCashMovement,
  type SaasCashSummary,
} from '@/lib/saasCashMovements';
import { SaasMetricCard } from './SaasPanelUi';

type CompanyOption = { id: string; name: string };

type Props = {
  companies?: CompanyOption[];
  showBackLink?: boolean;
};

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function sourceBadgeClass(source: string): string {
  switch (source) {
    case 'asaas_webhook':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'manual':
      return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    case 'asaas_transfer':
      return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
    case 'asaas_fee':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'asaas_refund':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    default:
      return 'bg-white/10 text-gray-300 border-white/10';
  }
}

export function SaasCashPanel({ companies = [], showBackLink = false }: Props) {
  const { user } = useAuth();
  const defaultRange = useMemo(() => currentMonthRange(), []);
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [movements, setMovements] = useState<SaasCashMovement[]>([]);
  const [summary, setSummary] = useState<SaasCashSummary>({
    periodIncome: 0,
    periodExpense: 0,
    netResult: 0,
    movementCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const isSuperAdmin = String(user?.role || '').toUpperCase() === 'SUPER_ADMIN';

  const loadCash = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        userId: user.id,
        fromDate,
        toDate,
        type: typeFilter,
      });
      if (companyFilter !== 'all') {
        params.set('companyId', companyFilter);
      }
      const res = await fetch(`/api/master/saas-cash?${params.toString()}`, {
        credentials: 'include',
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Falha ao carregar caixa SaaS');
      }
      setMovements(Array.isArray(body.movements) ? body.movements : []);
      setSummary(
        body.summary || {
          periodIncome: 0,
          periodExpense: 0,
          netResult: 0,
          movementCount: 0,
        },
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erro ao carregar caixa SaaS';
      setError(message);
      setMovements([]);
      setSummary({
        periodIncome: 0,
        periodExpense: 0,
        netResult: 0,
        movementCount: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, fromDate, toDate, typeFilter, companyFilter]);

  useEffect(() => {
    void loadCash();
  }, [loadCash]);

  useEffect(() => {
    if (!syncMessage) return;
    const timer = setTimeout(() => setSyncMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [syncMessage]);

  const handleSyncAsaas = useCallback(async () => {
    if (!user?.id || !isSuperAdmin) return;
    setSyncing(true);
    setError(null);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/master/saas-cash/sync-asaas', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          fromDate,
          toDate,
          companyId: companyFilter !== 'all' ? companyFilter : undefined,
          type: typeFilter,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Falha ao sincronizar Asaas');
      }
      setMovements(Array.isArray(body.movements) ? body.movements : []);
      setSummary(
        body.summary || {
          periodIncome: 0,
          periodExpense: 0,
          netResult: 0,
          movementCount: 0,
        },
      );
      const sync = body.sync || {};
      setSyncMessage(
        `Asaas sincronizado: ${sync.created ?? 0} nova(s), ${sync.skipped ?? 0} ignorada(s).`,
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erro ao sincronizar Asaas';
      setError(message);
    } finally {
      setSyncing(false);
    }
  }, [user?.id, isSuperAdmin, fromDate, toDate, companyFilter, typeFilter]);

  const formatCurrency = (value: number) => formatSaasCurrency(value);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          {showBackLink ? (
            <Link
              href="/saas-finance"
              className="text-sm text-blue-400 hover:text-blue-300 mb-2 inline-block"
            >
              ← Voltar ao painel SaaS
            </Link>
          ) : null}
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-400" />
            Caixa SaaS
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Entradas via webhook e saídas importadas do extrato Asaas (saques, tarifas, transferências).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSuperAdmin ? (
            <button
              type="button"
              onClick={() => void handleSyncAsaas()}
              disabled={loading || syncing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-600/20 text-sm text-emerald-100 hover:bg-emerald-600/30 disabled:opacity-50"
            >
              <CloudDownload className={`w-4 h-4 ${syncing ? 'animate-pulse' : ''}`} />
              {syncing ? 'Sincronizando…' : 'Sincronizar Asaas'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void loadCash()}
            disabled={loading || syncing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/10 bg-[#11161d] text-sm text-white hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {syncMessage ? (
        <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 text-sm">
          {syncMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SaasMetricCard
          title="Saldo do período"
          value={formatCurrency(summary.netResult)}
          description={`${formatDateBr(fromDate)} — ${formatDateBr(toDate)}`}
          icon={<Wallet className="w-5 h-5" />}
          tone={summary.netResult >= 0 ? 'green' : 'red'}
        />
        <SaasMetricCard
          title="Entradas do período"
          value={formatCurrency(summary.periodIncome)}
          description="Recebimentos confirmados"
          icon={<ArrowDownCircle className="w-5 h-5" />}
          tone="teal"
        />
        <SaasMetricCard
          title="Saídas do período"
          value={formatCurrency(summary.periodExpense)}
          description="Despesas e estornos"
          icon={<ArrowUpCircle className="w-5 h-5" />}
          tone="amber"
        />
        <SaasMetricCard
          title="Resultado líquido"
          value={formatCurrency(summary.netResult)}
          description={`${summary.movementCount} movimentação(ões)`}
          icon={<Wallet className="w-5 h-5" />}
          tone="blue"
        />
      </div>

      <div className="flex flex-wrap gap-3 p-4 rounded-xl border border-white/5 bg-[#11161d]">
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          De
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Até
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Tipo
          <select
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as 'all' | 'income' | 'expense')
            }
            className="bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[140px]"
          >
            <option value="all">Todos</option>
            <option value="income">Entradas</option>
            <option value="expense">Saídas</option>
          </select>
        </label>
        {companies.length > 0 ? (
          <label className="flex flex-col gap-1 text-xs text-gray-400 min-w-[200px] flex-1">
            Empresa
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white w-full"
            >
              <option value="all">Todas</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error ? (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-white/5 overflow-hidden bg-[#11161d]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-gray-400">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Origem</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    Carregando movimentações…
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    Nenhuma movimentação no período selecionado.
                  </td>
                </tr>
              ) : (
                movements.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-white/5 hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 text-gray-200 whitespace-nowrap">
                      {formatDateBr(row.movement_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {row.company_name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          row.type === 'expense'
                            ? 'bg-rose-500/15 text-rose-300'
                            : 'bg-emerald-500/15 text-emerald-300'
                        }`}
                      >
                        {saasCashTypeLabel(row.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{row.category}</td>
                    <td className="px-4 py-3 text-gray-400 max-w-[220px] truncate">
                      {row.description || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${sourceBadgeClass(row.source)}`}
                      >
                        {saasCashSourceLabel(row.source)}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                        row.type === 'expense' ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {row.type === 'expense' ? '−' : '+'}
                      {formatCurrency(row.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
