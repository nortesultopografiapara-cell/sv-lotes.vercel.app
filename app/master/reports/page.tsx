'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Download,
  FileText,
  Loader2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  buildMasterReportsMetrics,
  formatMasterCurrency,
  masterReportsToCsv,
  type MasterReportsMetrics,
} from '@/lib/masterSaasReports';
import {
  buildPaidReferenceMonthsByCompany,
  sumReceivedRevenue,
  type MasterSaasPayment,
} from '@/lib/masterSaasPayments';
import type { CompanySubscription } from '@/lib/saasSubscription';
import type { MasterSaasInvoice } from '@/lib/saasBilling';

function KpiCard({
  title,
  value,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string;
  icon: typeof Building2;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[var(--color-surface)]/60 px-4 py-4 min-w-0 overflow-visible">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          <p className="text-[clamp(16px,2.5vw,24px)] font-bold text-white mt-1 tabular-nums whitespace-nowrap">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

export default function MasterReportsPage() {
  return (
    <MasterSuperAdminGuard>
      <MasterReportsContent />
    </MasterSuperAdminGuard>
  );
}

function MasterReportsContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MasterReportsMetrics | null>(null);
  const [receivedRevenue, setReceivedRevenue] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: companies, error: compErr }, { data: subscriptionsData, error: subErr }] =
        await Promise.all([
          supabase.from('companies').select('*').order('created_at', { ascending: false }),
          supabase.from('company_subscriptions').select('*'),
        ]);

      if (compErr) throw compErr;
      if (subErr) console.warn('MASTER_REPORTS_SUBSCRIPTIONS_WARN', subErr.message);

      let subscriptions = (subscriptionsData || []) as CompanySubscription[];

      if (user.id) {
        const syncRes = await fetch('/api/saas/subscriptions/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        });
        if (syncRes.ok) {
          const syncJson = await syncRes.json();
          subscriptions = (syncJson.subscriptions || subscriptions) as CompanySubscription[];
        }
      }

      let paidReferenceMonths = new Map<string, Set<string>>();
      let payments: MasterSaasPayment[] = [];
      let invoices: MasterSaasInvoice[] = [];
      if (user.id) {
        const [payRes, invRes] = await Promise.all([
          fetch(`/api/master/saas-payments?userId=${encodeURIComponent(user.id)}`),
          fetch(`/api/master/saas-invoices?userId=${encodeURIComponent(user.id)}`),
        ]);
        const payJson = await payRes.json().catch(() => ({}));
        const invJson = await invRes.json().catch(() => ({}));
        if (payRes.ok) {
          payments = (payJson.payments || []) as MasterSaasPayment[];
          paidReferenceMonths = buildPaidReferenceMonthsByCompany(payments);
          setReceivedRevenue(sumReceivedRevenue(payments));
        } else {
          setReceivedRevenue(0);
        }
        if (invRes.ok) {
          invoices = (invJson.invoices || []) as MasterSaasInvoice[];
        }
      }

      setMetrics(
        buildMasterReportsMetrics(
          companies || [],
          subscriptions,
          paidReferenceMonths,
          payments,
          invoices,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar relatórios');
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const exportCsv = () => {
    if (!metrics) return;
    const blob = new Blob([`\uFEFF${masterReportsToCsv(metrics)}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sv-lotes-relatorio-saas-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    if (!metrics) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('SV LOTES — Relatório SaaS', 14, 16);
    doc.setFontSize(10);
    doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, 24);
    doc.text(`Empresas: ${metrics.registeredCompanies}`, 14, 30);
    doc.text(`Assinaturas ativas: ${metrics.activeSubscriptions}`, 80, 30);
    doc.text(`Receita mensal: ${formatMasterCurrency(metrics.monthlyRevenue)}`, 150, 30);
    doc.text(`Receita anual: ${formatMasterCurrency(metrics.annualRevenue)}`, 14, 36);
    doc.text(
      `Inadimplência: ${formatMasterCurrency(metrics.delinquencyAmount)} (${metrics.delinquentCompanies} empresas)`,
      80,
      36,
    );

    autoTable(doc, {
      startY: 42,
      head: [[
        'Empresa',
        'Plano',
        'Status empresa',
        'Situação financeira',
        'Último pagamento',
        'Referência',
        'Vencimento',
        'Mensalidade',
        'Atraso',
      ]],
      body: metrics.rows.map((row) => [
        row.companyName,
        row.plan,
        row.companyStatus,
        row.financialSituation,
        row.lastPaymentDate,
        row.lastPaymentReference,
        row.nextDueDate,
        formatMasterCurrency(row.monthlyPrice),
        row.daysLate > 0 ? `${row.daysLate} dias` : '—',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    doc.save(`sv-lotes-relatorio-saas-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const delinquencyRate = useMemo(() => {
    if (!metrics || metrics.monthlyRevenue <= 0) return '0%';
    const pct = (metrics.delinquencyAmount / metrics.monthlyRevenue) * 100;
    return `${pct.toFixed(1)}%`;
  }, [metrics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="sv-page sv-page--scroll-y p-4 md:p-8">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-[var(--color-primary)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Relatórios SaaS</h1>
            <p className="text-sm text-slate-500">Visão consolidada da operação da plataforma</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!metrics}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
          <button
            type="button"
            onClick={exportPdf}
            disabled={!metrics}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            <FileText className="w-4 h-4" /> Exportar PDF
          </button>
        </div>
      </header>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {metrics ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
            <KpiCard
              title="Receita mensal"
              value={formatMasterCurrency(metrics.monthlyRevenue)}
              icon={Wallet}
              accent="bg-amber-500/15 text-amber-400"
            />
            <KpiCard
              title="Receita anual"
              value={formatMasterCurrency(metrics.annualRevenue)}
              icon={TrendingUp}
              accent="bg-violet-500/15 text-violet-400"
            />
            <KpiCard
              title="Receita prevista (30 dias)"
              value={formatMasterCurrency(metrics.projectedRevenue30Days)}
              icon={TrendingUp}
              accent="bg-cyan-500/15 text-cyan-400"
            />
            <KpiCard
              title="Inadimplência"
              value={formatMasterCurrency(metrics.delinquencyAmount)}
              icon={TrendingDown}
              accent="bg-rose-500/15 text-rose-400"
            />
            <KpiCard
              title="Receita recebida"
              value={formatMasterCurrency(receivedRevenue)}
              icon={Wallet}
              accent="bg-green-500/15 text-green-400"
            />
            <KpiCard
              title="Taxa de inadimplência"
              value={delinquencyRate}
              icon={BarChart3}
              accent="bg-slate-500/15 text-slate-300"
            />
          </div>

          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--color-surface)]/80 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="p-3">Empresa</th>
                  <th className="p-3">Plano</th>
                  <th className="p-3">Status empresa</th>
                  <th className="p-3">Situação financeira</th>
                  <th className="p-3">Último pagamento</th>
                  <th className="p-3">Referência paga</th>
                  <th className="p-3">Próx. vencimento</th>
                  <th className="p-3">Mensalidade</th>
                  <th className="p-3">Atraso</th>
                </tr>
              </thead>
              <tbody>
                {metrics.rows.map((row) => (
                  <tr key={row.companyId} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="p-3 text-white font-medium">{row.companyName}</td>
                    <td className="p-3 text-slate-300">{row.plan}</td>
                    <td className="p-3 text-slate-300">{row.companyStatus}</td>
                    <td className="p-3 text-slate-300">{row.financialSituation}</td>
                    <td className="p-3 text-slate-400">{row.lastPaymentDate}</td>
                    <td className="p-3 text-slate-400">{row.lastPaymentReference}</td>
                    <td className="p-3 text-slate-400">{row.nextDueDate}</td>
                    <td className="p-3 text-emerald-400 tabular-nums">
                      {formatMasterCurrency(row.monthlyPrice)}
                    </td>
                    <td className="p-3 text-rose-400 tabular-nums">
                      {row.daysLate > 0 ? `${row.daysLate} dias` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
