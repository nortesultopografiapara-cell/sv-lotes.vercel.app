'use client';

import type { MasterTopographyOperationKpis } from '@/lib/master/topography/operationTypes';
import styles from './operation.module.css';

type Props = {
  kpis: MasterTopographyOperationKpis;
};

export function OperationKpiRow({ kpis }: Props) {
  return (
    <section className={styles.kpiRow} aria-label="Indicadores de operações">
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Total</p>
        <p className={styles.kpiValue}>{kpis.total}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Rascunhos</p>
        <p className={styles.kpiValue}>{kpis.draft}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Planejadas</p>
        <p className={styles.kpiValue}>{kpis.planned}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Agendadas</p>
        <p className={styles.kpiValue}>{kpis.scheduled}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Em campo</p>
        <p className={styles.kpiValue}>{kpis.inField}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Em processamento</p>
        <p className={styles.kpiValue}>{kpis.processing}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Aguardando cliente</p>
        <p className={styles.kpiValue}>{kpis.waitingClient}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Concluídas no mês</p>
        <p className={styles.kpiValue}>{kpis.completedThisMonth}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Canceladas</p>
        <p className={styles.kpiValue}>{kpis.canceled}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Atrasadas</p>
        <p className={styles.kpiValue}>{kpis.overdue}</p>
      </div>
    </section>
  );
}
