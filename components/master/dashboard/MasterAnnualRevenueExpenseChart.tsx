'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyRevenueExpense } from '@/lib/saasCashMovements';
import styles from './masterExecutiveDashboard.module.css';

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function formatCompactAxis(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}k`;
  return `R$ ${value}`;
}

type MasterAnnualRevenueExpenseChartProps = {
  title: string;
  data: MonthlyRevenueExpense[];
  emptyMessage: string;
  revenueLabel?: string;
  expenseLabel?: string;
  /** Quando true, trata zeros como estado vazio explícito (ex.: Topografia sem fonte). */
  forceEmpty?: boolean;
  loading?: boolean;
  error?: string | null;
};

export function MasterAnnualRevenueExpenseChart({
  title,
  data,
  emptyMessage,
  revenueLabel = 'Receita',
  expenseLabel = 'Despesa',
  forceEmpty = false,
  loading = false,
  error = null,
}: MasterAnnualRevenueExpenseChartProps) {
  const chartData = useMemo(
    () =>
      data.map((row) => ({
        ...row,
        [revenueLabel]: row.revenue,
        [expenseLabel]: row.expense,
      })),
    [data, revenueLabel, expenseLabel],
  );

  const hasMovement = useMemo(
    () => !forceEmpty && data.some((row) => row.revenue > 0 || row.expense > 0),
    [data, forceEmpty],
  );

  return (
    <div className={`${styles.card} ${styles.annualChartCard}`}>
      <h3 className={styles.cardTitleStrong}>{title}</h3>
      <div className={styles.chartBox}>
        <div className={styles.chartBoxInner}>
        {loading ? (
          <div className={styles.emptyChart}>
            <p>Carregando movimentações…</p>
          </div>
        ) : error ? (
          <div className={styles.emptyChart}>
            <p>{error}</p>
          </div>
        ) : !hasMovement ? (
          <div className={styles.emptyChart}>
            <p>{emptyMessage}</p>
            <div className={styles.emptyChartBars} aria-hidden>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <XAxis dataKey="label" stroke="#cbd5e1" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis hide />
                  <Bar dataKey={revenueLabel} fill="#bbf7d0" radius={[2, 2, 0, 0]} />
                  <Bar dataKey={expenseLabel} fill="#fecaca" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatCompactAxis}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  borderColor: '#e2e8f0',
                  borderRadius: 8,
                  color: '#0f172a',
                }}
                formatter={(value) => formatCurrency(Number(value ?? 0))}
              />
              <Legend />
              <Bar dataKey={revenueLabel} fill="#10B981" radius={[3, 3, 0, 0]} />
              <Bar dataKey={expenseLabel} fill="#EF4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
        </div>
      </div>
    </div>
  );
}
