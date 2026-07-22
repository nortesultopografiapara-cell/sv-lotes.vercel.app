'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Landmark, Layers, FolderTree, RefreshCw, Tags } from 'lucide-react';
import type { MasterCorporateFinanceFoundationKpis } from '@/lib/master/corporateFinance/types';
import {
  CorporateFinanceGuard,
  useCorporateFinanceAuthParams,
} from './CorporateFinanceGuard';
import styles from './corporateFinance.module.css';

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function CorporateFinanceHubInner() {
  const { userId, qs, bodyAuth } = useCorporateFinanceAuthParams();
  const [kpis, setKpis] = useState<MasterCorporateFinanceFoundationKpis | null>(null);
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

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.headerRow}>
          <div>
            <p className={styles.eyebrow}>SV Topografia & Projetos · Master</p>
            <h1 className={styles.title}>Financeiro Corporativo</h1>
            <p className={styles.subtitle}>
              Fundação do financeiro da SV Topografia: contas, categorias e centros de resultado.
              Contas a receber/pagar e caixa serão liberados em fases seguintes.
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

        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <p className={styles.kpiLabel}>Contas ativas</p>
            <p className={styles.kpiValue}>
              {loading || !kpis ? '—' : `${kpis.accountsActive}/${kpis.accountsTotal}`}
            </p>
            <p className={styles.kpiHint}>Cadastro estrutural</p>
          </div>
          <div className={styles.kpi}>
            <p className={styles.kpiLabel}>Categorias</p>
            <p className={styles.kpiValue}>{loading || !kpis ? '—' : kpis.categoriesTotal}</p>
            <p className={styles.kpiHint}>
              {kpis
                ? `${kpis.categoriesIncome} receitas · ${kpis.categoriesExpense} despesas`
                : 'Receitas e despesas'}
            </p>
          </div>
          <div className={styles.kpi}>
            <p className={styles.kpiLabel}>Centros ativos</p>
            <p className={styles.kpiValue}>
              {loading || !kpis ? '—' : `${kpis.costCentersActive}/${kpis.costCentersTotal}`}
            </p>
            <p className={styles.kpiHint}>Sem auto-criação por projeto</p>
          </div>
          <div className={styles.kpi}>
            <p className={styles.kpiLabel}>Saldos iniciais (ativos)</p>
            <p className={styles.kpiValue}>
              {loading || !kpis ? '—' : formatCurrency(kpis.openingBalanceSum)}
            </p>
            <p className={styles.kpiHint}>Não é saldo atual calculado</p>
          </div>
        </div>

        <div className={styles.shortcuts}>
          <Link href="/master/corporate-finance/accounts" className={styles.shortcut}>
            <div className={styles.shortcutIcon}>
              <Landmark className="w-5 h-5" />
            </div>
            <h2 className={styles.shortcutTitle}>Contas financeiras</h2>
            <p className={styles.shortcutDesc}>
              Contas bancárias, caixa e carteiras com saldo inicial e data de referência.
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
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Escopo desta fase</h2>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <p className={styles.muted} style={{ textAlign: 'left', paddingTop: '1rem' }}>
            Liberado: cadastros de fundação e hub. Ainda não: contas a receber/pagar, movimentos de
            caixa, fluxo, conciliação, Asaas, Pix, DRE nem bridge de valor_recebido.
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
