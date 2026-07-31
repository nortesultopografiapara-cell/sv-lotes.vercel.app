'use client';

import type { MasterTopographyEquipmentKpis } from '@/lib/master/topography/equipmentTypes';
import styles from './equipment.module.css';

function formatCurrency(val: number | null | undefined) {
  if (val == null || !Number.isFinite(val)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

type Props = {
  kpis: MasterTopographyEquipmentKpis;
};

export function EquipmentKpiRow({ kpis }: Props) {
  return (
    <section className={styles.kpiRow} aria-label="Indicadores de equipamentos">
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Total ativos</p>
        <p className={styles.kpiValue}>{kpis.total}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Disponíveis</p>
        <p className={styles.kpiValue}>{kpis.available}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Em uso</p>
        <p className={styles.kpiValue}>{kpis.inUse}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Reservados</p>
        <p className={styles.kpiValue}>{kpis.reserved}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Em manutenção</p>
        <p className={styles.kpiValue}>{kpis.maintenance}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Em calibração</p>
        <p className={styles.kpiValue}>{kpis.calibration}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Baixados</p>
        <p className={styles.kpiValue}>{kpis.decommissioned}</p>
      </div>
      <div className={styles.kpiCard}>
        <p className={styles.kpiLabel}>Valor patrimonial</p>
        <p className={styles.kpiValue} style={{ fontSize: '0.92rem' }}>
          {formatCurrency(kpis.patrimonialValue)}
        </p>
      </div>
    </section>
  );
}
