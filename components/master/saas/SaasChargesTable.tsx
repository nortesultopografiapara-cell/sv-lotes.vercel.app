'use client';

import { formatSaasCurrency } from '@/lib/companyPricing';
import { formatDateBr } from '@/lib/saasSubscription';
import type { SaasInvoiceChargeRow } from '@/lib/saasInvoiceChargeView';
import { truncatePaymentId } from '@/lib/saasInvoiceChargeView';
import {
  resolveSaasChargeDisplayStatus,
  saasChargeDisplayStatusLabel,
  saasChargeDisplayStatusTone,
} from '@/lib/masterSaasPanel';
import { SaasActionsDropdown, type SaasActionItem } from './SaasActionsDropdown';
import { MasterEmptyState } from '@/components/master/MasterEmptyState';

type Props = {
  rows: SaasInvoiceChargeRow[];
  loading?: boolean;
  syncingChargeId?: string | null;
  gatewayReady?: boolean;
  getCompanyPhone: (companyId: string) => string | null | undefined;
  getCompanyEmail: (companyId: string) => string | null | undefined;
  onViewCharge: (row: SaasInvoiceChargeRow) => void;
  onWhatsApp: (row: SaasInvoiceChargeRow, phone?: string | null) => void;
  onEmail: (row: SaasInvoiceChargeRow, email?: string | null) => void;
  onSyncStatus: (row: SaasInvoiceChargeRow) => void;
  onCancelCharge: (row: SaasInvoiceChargeRow) => void;
  onRegisterPayment: (row: SaasInvoiceChargeRow) => void;
  filterCompany?: string;
  onFilterCompany?: (v: string) => void;
  filterStatus?: string;
  onFilterStatus?: (v: string) => void;
  companies?: Array<{ id: string; name: string }>;
};

export function SaasChargesTable({
  rows,
  loading,
  syncingChargeId,
  gatewayReady = true,
  getCompanyPhone,
  getCompanyEmail,
  onViewCharge,
  onWhatsApp,
  onEmail,
  onSyncStatus,
  onCancelCharge,
  onRegisterPayment,
  filterCompany = 'all',
  onFilterCompany,
  filterStatus = 'all',
  onFilterStatus,
  companies = [],
}: Props) {
  const filtered = rows.filter((row) => {
    if (filterCompany !== 'all' && row.companyId !== filterCompany) return false;
    if (filterStatus !== 'all') {
      const st = resolveSaasChargeDisplayStatus(row);
      if (st !== filterStatus) return false;
    }
    return true;
  });

  return (
    <div className="bg-[#11161d] border border-white/5 rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-white/5 flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
        <div>
          <h3 className="text-[16px] font-bold text-white">Cobranças</h3>
          <p className="text-[12px] text-gray-400">PIX Asaas — ações centralizadas no menu.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onFilterCompany ? (
            <select
              value={filterCompany}
              onChange={(e) => onFilterCompany(e.target.value)}
              className="bg-[#0B0E14] border border-white/10 text-white px-3 py-2 rounded-lg text-[13px]"
            >
              <option value="all">Todas empresas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : null}
          {onFilterStatus ? (
            <select
              value={filterStatus}
              onChange={(e) => onFilterStatus(e.target.value)}
              className="bg-[#0B0E14] border border-white/10 text-white px-3 py-2 rounded-lg text-[13px]"
            >
              <option value="all">Todos status</option>
              <option value="GERADA">Gerada</option>
              <option value="ENVIADA">Enviada</option>
              <option value="VISUALIZADA">Visualizada</option>
              <option value="PAGA">Paga</option>
              <option value="VENCIDA">Vencida</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          ) : null}
        </div>
      </div>

      <div className="sv-table-scroll">
        <table className="w-full text-left min-w-[900px]">
          <thead>
            <tr className="border-b border-white/5 text-[12px] text-gray-400">
              <th className="p-4 font-medium">Empresa</th>
              <th className="p-4 font-medium">Valor</th>
              <th className="p-4 font-medium">Vencimento</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Forma</th>
              <th className="p-4 font-medium">Payment ID</th>
              <th className="p-4 font-medium w-[120px]">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const displayStatus = resolveSaasChargeDisplayStatus(row);
              const phone = getCompanyPhone(row.companyId);
              const email = getCompanyEmail(row.companyId);
              const isPaid = displayStatus === 'PAGA';
              const isCancelled = displayStatus === 'CANCELADA';

              const actions: SaasActionItem[] = [
                { id: 'view', label: 'Ver cobrança', onClick: () => onViewCharge(row) },
                {
                  id: 'whatsapp',
                  label: 'Enviar WhatsApp',
                  onClick: () => onWhatsApp(row, phone),
                  disabled: !phone,
                },
                {
                  id: 'email',
                  label: 'Enviar E-mail',
                  onClick: () => onEmail(row, email),
                  disabled: !email,
                },
                {
                  id: 'sync',
                  label: syncingChargeId === row.chargeId ? 'Atualizando…' : 'Atualizar status',
                  onClick: () => onSyncStatus(row),
                  disabled: !row.chargeId || !gatewayReady || syncingChargeId === row.chargeId,
                },
                {
                  id: 'pay',
                  label: 'Registrar pagamento',
                  onClick: () => onRegisterPayment(row),
                  disabled: isPaid,
                },
                {
                  id: 'cancel',
                  label: 'Cancelar cobrança',
                  onClick: () => onCancelCharge(row),
                  disabled: isPaid || isCancelled || !row.chargeId,
                  tone: 'danger',
                },
              ];

              return (
                <tr key={row.invoiceId} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="p-4">
                    <p className="text-[13px] font-medium text-white">{row.companyName}</p>
                    <p className="text-[11px] text-gray-500">{row.referenceMonth}</p>
                  </td>
                  <td className="p-4 text-[13px] text-emerald-300 font-semibold tabular-nums">
                    {formatSaasCurrency(row.amount)}
                  </td>
                  <td className="p-4 text-[12px] text-gray-300">{formatDateBr(row.dueDate)}</td>
                  <td className="p-4">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${saasChargeDisplayStatusTone(displayStatus)}`}
                    >
                      {saasChargeDisplayStatusLabel(displayStatus)}
                    </span>
                  </td>
                  <td className="p-4 text-[12px] text-gray-400">PIX</td>
                  <td className="p-4 text-[11px] font-mono text-gray-500">
                    {truncatePaymentId(row.paymentId)}
                  </td>
                  <td className="p-4">
                    <SaasActionsDropdown items={actions} />
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8">
                  <MasterEmptyState
                    title="Nenhuma cobrança"
                    description="Gere cobranças pelo menu Empresas ou use Gerar cobranças do mês."
                  />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
