'use client';

import { memo, type ReactNode } from 'react';
import {
  CheckCircle,
  Eye,
  FileText,
  Loader2,
  MessageCircle,
  Trash2,
} from 'lucide-react';

export type FinanceStatCardProps = {
  title: string;
  value: string;
  subtitle: string;
  subtitleColor?: string;
  icon: ReactNode;
  iconWrapClass?: string;
  loading?: boolean;
};

export function FinanceStatCard({
  title,
  value,
  subtitle,
  subtitleColor = 'text-[var(--text-muted)]',
  icon,
  iconWrapClass = 'bg-blue-500/10 text-blue-400',
  loading,
}: FinanceStatCardProps) {
  return (
    <div className="finance-kpi-card">
      <div className={`finance-kpi-icon ${iconWrapClass}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="finance-kpi-title truncate">{title}</p>
        <h3 className="finance-kpi-value truncate">
          {loading ? '—' : value}
        </h3>
        <p className={`finance-kpi-sub truncate ${subtitleColor}`}>{subtitle}</p>
      </div>
    </div>
  );
}

export function FinanceStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let cls =
    'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border';
  let label = 'DESCONHECIDO';

  if (s === 'pago' || s === 'paid') {
    cls += ' border-emerald-500/35 bg-emerald-500/12 text-emerald-400';
    label = 'PAGO';
  } else if (s === 'pendente' || s === 'pending') {
    cls += ' border-amber-400/35 bg-amber-400/10 text-amber-300';
    label = 'PENDENTE';
  } else if (s === 'atrasado' || s === 'overdue') {
    cls += ' border-rose-500/35 bg-rose-500/10 text-rose-400';
    label = 'ATRASADO';
  } else if (s === 'cancelado' || s === 'canceled') {
    cls += ' border-[var(--border-color)] bg-[var(--bg-card-alt)] text-[var(--text-secondary)]';
    label = 'CANCELADO';
  } else if (s === 'entrada' || s === 'entry') {
    cls += ' border-blue-500/35 bg-blue-500/12 text-blue-400';
    label = 'ENTRADA';
  } else {
    cls += ' border-[var(--border-color)] bg-transparent text-[var(--text-secondary)]';
  }

  return <span className={cls}>{label}</span>;
}

export function FinanceParcelActionBtn({
  title,
  onClick,
  className = '',
  children,
}: {
  title: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`finance-action-btn ${className}`}
    >
      {children}
    </button>
  );
}

export function FinanceTableLoading({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center">
        <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-blue-400" />
        <p className="text-sm text-[var(--text-secondary)]">Sincronizando registros…</p>
      </td>
    </tr>
  );
}

export const FinanceTableEmpty = memo(function FinanceTableEmpty({
  colSpan,
  message,
}: {
  colSpan: number;
  message: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-sm text-[var(--text-muted)]">
        {message}
      </td>
    </tr>
  );
});

export type PaymentRowProps = {
  payment: Record<string, unknown>;
  selected: boolean;
  formatCurrency: (n: number) => string;
  onToggle: () => void;
  onView: () => void;
  onMarkPaid: () => void;
  onWhatsApp: () => void;
  onCarne: () => void;
  onDelete: () => void;
  readOnly?: boolean;
};

export const PaymentTableRow = memo(
  function PaymentTableRow({
    payment: p,
    selected,
    formatCurrency,
    onToggle,
    onView,
    onMarkPaid,
    onWhatsApp,
    onCarne,
    onDelete,
    readOnly = false,
  }: PaymentRowProps) {
    const projects = p.projects as { name?: string } | undefined;
    const sales = p.sales as {
      projects?: { name?: string };
      contracts?: { contract_number?: string }[];
      installments_count?: number;
      id?: string;
    } | undefined;
    const blocks = p.blocks as {
      block_name?: string;
      name?: string;
      number?: string;
      projects?: { name?: string };
    } | undefined;
    const customers = p.customers as { name?: string } | undefined;

    const projectName =
      projects?.name ||
      sales?.projects?.name ||
      blocks?.projects?.name ||
      '—';
    const blockName = blocks?.block_name || blocks?.name || '?';
    const lotNumber = blocks?.number || '?';
    const loteDesc = `QD ${blockName} • LT ${lotNumber}`;
    const contractNo =
      sales?.contracts?.[0]?.contract_number ||
      (sales?.id
        ? `CT-${new Date((p.created_at as string) || Date.now()).getFullYear()}-${String(sales.id).substring(0, 6).toUpperCase()}`
        : 'S/N');
    const clientName = customers?.name || '—';
    const isEntry =
      p.installment_number === 0 || p.installment_number === '0';
    const parcelInfo = isEntry ? 'ENTRADA' : String(p.installment_number || 1);
    const maxParcel =
      sales?.installments_count && !isEntry
        ? ` / ${sales.installments_count}`
        : '';

    const pStatusRaw = String(p.status || 'pendente').toLowerCase();
    const dueStr = String(p.due_date || '').split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    let computedStatus = pStatusRaw;
    if (
      (pStatusRaw === 'pendente' || pStatusRaw === 'pending') &&
      dueStr &&
      dueStr < todayStr
    ) {
      computedStatus = 'atrasado';
    }
    const isPaid = computedStatus === 'pago' || computedStatus === 'paid';
    const amount = Number(p.amount) || 0;
    const paidAmount = isPaid ? Number(p.paid_amount) || amount : 0;

    const dueFmt = dueStr
      ? new Date(`${dueStr}T12:00:00Z`).toLocaleDateString('pt-BR')
      : '—';
    const parcelLabel = isEntry
      ? 'Entrada'
      : `Parcela ${parcelInfo}${maxParcel}`;

    return (
      <tr className="group finance-parcel-row">
        <td className="finance-col-check align-top">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="rounded border-[var(--border-color)] mt-1"
          />
        </td>
        <td className="finance-col-info">
          <p className="finance-parcel-line-primary">
            <span className="font-semibold text-[var(--text-primary)]">
              Contrato nº {contractNo}
            </span>
            <span className="finance-parcel-sep">|</span>
            <span>
              Cliente:{' '}
              <span className="font-medium text-[var(--text-primary)]">{clientName}</span>
            </span>
            <span className="finance-parcel-sep">|</span>
            <span className="inline-flex items-center gap-1.5">
              Status:{' '}
              <FinanceStatusBadge status={computedStatus} />
            </span>
          </p>
          <p className="finance-parcel-line-secondary">
            <span>
              Projeto:{' '}
              <span className="text-[var(--text-secondary)]">{projectName}</span>
            </span>
            <span className="finance-parcel-sep">|</span>
            <span>{loteDesc}</span>
            <span className="finance-parcel-sep">|</span>
            <span>{parcelLabel}</span>
            <span className="finance-parcel-sep">|</span>
            <span>Vencimento: {dueFmt}</span>
            <span className="finance-parcel-sep">|</span>
            <span className="font-medium text-[var(--text-primary)]">
              Valor: {formatCurrency(amount)}
            </span>
            {(isPaid || paidAmount > 0) && (
              <>
                <span className="finance-parcel-sep">|</span>
                <span>Pago: {formatCurrency(paidAmount)}</span>
              </>
            )}
          </p>
        </td>
        <td className="finance-col-actions finance-sticky-actions align-middle">
          <div className="finance-actions-row">
            <FinanceParcelActionBtn title="Visualizar" onClick={onView}>
              <Eye />
            </FinanceParcelActionBtn>
            {!isPaid && !readOnly && (
              <FinanceParcelActionBtn
                title="Registrar pagamento"
                onClick={onMarkPaid}
                className="hover:!text-emerald-400"
              >
                <CheckCircle />
              </FinanceParcelActionBtn>
            )}
            <FinanceParcelActionBtn
              title="Observação / Cobrança WhatsApp"
              onClick={onWhatsApp}
              className="hover:!text-emerald-400"
            >
              <MessageCircle />
            </FinanceParcelActionBtn>
            <FinanceParcelActionBtn
              title="Gerar recibo / carnê"
              onClick={onCarne}
              className="hover:!text-blue-400"
            >
              <FileText />
            </FinanceParcelActionBtn>
            {!readOnly && (
            <FinanceParcelActionBtn
              title="Excluir"
              onClick={onDelete}
              className="hover:!text-rose-400"
            >
              <Trash2 />
            </FinanceParcelActionBtn>
            )}
          </div>
        </td>
      </tr>
    );
  },
  (prev, next) =>
    prev.payment.id === next.payment.id &&
    prev.selected === next.selected &&
    prev.payment.status === next.payment.status &&
    prev.payment.paid_amount === next.payment.paid_amount,
);
