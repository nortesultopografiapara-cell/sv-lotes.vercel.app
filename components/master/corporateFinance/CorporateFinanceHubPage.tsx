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
} from 'lucide-react';
import type { MasterCorporateFinanceFoundationKpis } from '@/lib/master/corporateFinance/types';
import {
  CorporateFinanceGuard,
  useCorporateFinanceAuthParams,
} from './CorporateFinanceGuard';
import styles from './corporateFinance.module.css';

type HubKpis = MasterCorporateFinanceFoundationKpis & {
  receivableOpen?: number;
  receivableOverdue?: number;
  payableOpen?: number;
  payableOverdue?: number;
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

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.headerRow}>
          <div>
            <p className={styles.eyebrow}>SV Topografia & Projetos · Master</p>
            <h1 className={styles.title}>Financeiro Corporativo</h1>
            <p className={styles.subtitle}>
              Contas, categorias, centros, contas a receber e contas a pagar da SV Topografia.
              Fluxo de caixa e conciliação virão nas próximas fases.
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
            <p className={styles.kpiLabel}>A receber</p>
            <p className={styles.kpiValue}>
              {loading || !kpis ? '—' : formatCurrency(kpis.receivableOpen || 0)}
            </p>
            <p className={styles.kpiHint}>Saldo em aberto</p>
          </div>
          <div className={styles.kpi}>
            <p className={styles.kpiLabel}>A pagar</p>
            <p className={styles.kpiValue}>
              {loading || !kpis ? '—' : formatCurrency(kpis.payableOpen || 0)}
            </p>
            <p className={styles.kpiHint}>Saldo em aberto</p>
          </div>
          <div className={styles.kpi}>
            <p className={styles.kpiLabel}>Vencido a receber</p>
            <p className={styles.kpiValue}>
              {loading || !kpis ? '—' : formatCurrency(kpis.receivableOverdue || 0)}
            </p>
            <p className={styles.kpiHint}>Com saldo pendente</p>
          </div>
          <div className={styles.kpi}>
            <p className={styles.kpiLabel}>Vencido a pagar</p>
            <p className={styles.kpiValue}>
              {loading || !kpis ? '—' : formatCurrency(kpis.payableOverdue || 0)}
            </p>
            <p className={styles.kpiHint}>Com saldo pendente</p>
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
            Liberado: fundação + contas a receber/pagar. Ainda não: movimentos de caixa, fluxo,
            conciliação, Asaas, DRE nem bridge de valor_recebido.
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
