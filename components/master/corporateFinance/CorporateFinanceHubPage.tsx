'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Landmark,
  Layers,
  FolderTree,
  RefreshCw,
  Tags,
  HandCoins,
  CircleDollarSign,
  ArrowLeftRight,
} from 'lucide-react';
import type { MasterCorporateFinanceFoundationKpis } from '@/lib/master/corporateFinance/types';
import { semanticToneForResult } from '@/lib/master/corporateFinance/semantic';
import { CorporateFinanceSemanticKpi } from './CorporateFinanceSemantic';
import {
  CorporateFinanceGuard,
  useCorporateFinanceAuthParams,
} from './CorporateFinanceGuard';
import styles from './corporateFinance.module.css';

type HubKpis = MasterCorporateFinanceFoundationKpis & {
  receivableOpen?: number;
  receivableOverdue?: number;
  receivableDueThisMonth?: number;
  receivableReceivedThisMonth?: number;
  payableOpen?: number;
  payableOverdue?: number;
  payableDueThisMonth?: number;
  payablePaidThisMonth?: number;
  cashCurrentBalance?: number;
  cashMonthIncome?: number;
  cashMonthExpense?: number;
  cashMonthNet?: number;
};

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function CorporateFinanceHubInner() {
  const { userId, qs } = useCorporateFinanceAuthParams();
  const [kpis, setKpis] = useState<HubKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/summary?${qs()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar resumo.');
      setKpis(data.kpis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [userId, qs]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial do hub
    void load();
  }, [load]);

  useEffect(() => {
    const onCashUpdated = () => {
      void load();
    };
    window.addEventListener('corporate-finance-cash-updated', onCashUpdated);
    return () => {
      window.removeEventListener('corporate-finance-cash-updated', onCashUpdated);
    };
  }, [load]);

  const dash = loading || !kpis;

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.headerRow}>
          <div>
            <p className={styles.eyebrow}>SV Topografia & Projetos · Master</p>
            <h1 className={styles.title}>Financeiro Corporativo</h1>
            <p className={styles.subtitle}>
              Contas, categorias, centros, AR/AP, fluxo de caixa e bridge de recebido dos projetos.
            </p>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.kpisWide}>
          <CorporateFinanceSemanticKpi
            label="Saldo atual"
            value={dash ? '—' : formatCurrency(kpis!.cashCurrentBalance || 0)}
            hint="Caixa corporativo"
            tone="balance"
          />
          <CorporateFinanceSemanticKpi
            label="Entradas no mês"
            value={dash ? '—' : formatCurrency(kpis!.cashMonthIncome || 0)}
            tone="income"
          />
          <CorporateFinanceSemanticKpi
            label="Saídas no mês"
            value={dash ? '—' : formatCurrency(kpis!.cashMonthExpense || 0)}
            tone="expense"
          />
          <CorporateFinanceSemanticKpi
            label="Resultado do mês"
            value={dash ? '—' : formatCurrency(kpis!.cashMonthNet || 0)}
            tone={semanticToneForResult(kpis?.cashMonthNet || 0)}
          />
          <CorporateFinanceSemanticKpi
            label="A receber"
            value={dash ? '—' : formatCurrency(kpis!.receivableOpen || 0)}
            hint="Em aberto"
            tone="open"
          />
          <CorporateFinanceSemanticKpi
            label="Recebido no mês"
            value={dash ? '—' : formatCurrency(kpis!.receivableReceivedThisMonth || 0)}
            tone="received"
          />
          <CorporateFinanceSemanticKpi
            label="Vencido a receber"
            value={dash ? '—' : formatCurrency(kpis!.receivableOverdue || 0)}
            tone="overdue"
          />
          <CorporateFinanceSemanticKpi
            label="Vence no mês (AR)"
            value={dash ? '—' : formatCurrency(kpis!.receivableDueThisMonth || 0)}
            tone="dueMonth"
          />
          <CorporateFinanceSemanticKpi
            label="A pagar"
            value={dash ? '—' : formatCurrency(kpis!.payableOpen || 0)}
            hint="Em aberto"
            tone="open"
          />
          <CorporateFinanceSemanticKpi
            label="Pago no mês"
            value={dash ? '—' : formatCurrency(kpis!.payablePaidThisMonth || 0)}
            tone="paid"
          />
          <CorporateFinanceSemanticKpi
            label="Vencido a pagar"
            value={dash ? '—' : formatCurrency(kpis!.payableOverdue || 0)}
            tone="overdue"
          />
          <CorporateFinanceSemanticKpi
            label="Vence no mês (AP)"
            value={dash ? '—' : formatCurrency(kpis!.payableDueThisMonth || 0)}
            tone="dueMonth"
          />
        </div>

        <div className={styles.shortcuts}>
          <Link href="/master/corporate-finance/cash-flow" className={styles.shortcut}>
            <div className={styles.shortcutIcon}>
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <h2 className={styles.shortcutTitle}>Fluxo de Caixa</h2>
            <p className={styles.shortcutDesc}>
              Movimentações, lançamentos manuais, transferências, saldos e exportação.
            </p>
          </Link>
          <Link href="/master/corporate-finance/accounts" className={styles.shortcut}>
            <div className={styles.shortcutIcon}>
              <Landmark className="w-5 h-5" />
            </div>
            <h2 className={styles.shortcutTitle}>Contas financeiras</h2>
            <p className={styles.shortcutDesc}>
              Contas bancárias, caixa e carteiras com saldo inicial e saldo atual.
            </p>
          </Link>
          <Link href="/master/corporate-finance/categories" className={styles.shortcut}>
            <div className={styles.shortcutIcon}>
              <Tags className="w-5 h-5" />
            </div>
            <h2 className={styles.shortcutTitle}>Categorias</h2>
            <p className={styles.shortcutDesc}>
              Receitas e despesas, com hierarquia opcional e ativação/desativação.
            </p>
          </Link>
          <Link href="/master/corporate-finance/cost-centers" className={styles.shortcut}>
            <div className={styles.shortcutIcon}>
              <FolderTree className="w-5 h-5" />
            </div>
            <h2 className={styles.shortcutTitle}>Centros de resultado</h2>
            <p className={styles.shortcutDesc}>
              Centros com código, nome e vínculo opcional a projeto Master.
            </p>
          </Link>
          <Link href="/master/corporate-finance/receivables" className={styles.shortcut}>
            <div className={styles.shortcutIcon}>
              <HandCoins className="w-5 h-5" />
            </div>
            <h2 className={styles.shortcutTitle}>Contas a receber</h2>
            <p className={styles.shortcutDesc}>
              Obrigações de clientes, recebimentos parciais/totais e vencimentos.
            </p>
          </Link>
          <Link href="/master/corporate-finance/payables" className={styles.shortcut}>
            <div className={styles.shortcutIcon}>
              <CircleDollarSign className="w-5 h-5" />
            </div>
            <h2 className={styles.shortcutTitle}>Contas a pagar</h2>
            <p className={styles.shortcutDesc}>
              Obrigações com fornecedores, pagamentos parciais/totais e atrasos.
            </p>
          </Link>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Escopo desta fase</h2>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <p className={styles.muted} style={{ textAlign: 'left', paddingTop: '1rem' }}>
            Liberado: fundação, AR/AP, fluxo de caixa e bridge valor_recebido ↔ caixa corporativo.
            Ainda não (Fase 7): Asaas corporativo, PIX/boleto, conciliação e DRE.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CorporateFinanceHubPage() {
  return (
    <CorporateFinanceGuard>
      <CorporateFinanceHubInner />
    </CorporateFinanceGuard>
  );
}
