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

type Props = {
  rows: SaasInvoiceChargeRow[];
  loading?: boolean;
  syncingChargeId?: string | null;
  gatewayReady?: boolean;
  getCompanyPhone: (companyId: string) => string | null | undefined;
  getCompanyEmail: (companyId: string) => string | null | undefined;
  onViewCharge: (row: SaasInvoiceChargeRow) => void;
  onCopyPix: (row: SaasInvoiceChargeRow) => void;
  onOpenInvoice: (row: SaasInvoiceChargeRow) => void;
  onOpenBankSlip: (row: SaasInvoiceChargeRow) => void;
  onWhatsApp: (row: SaasInvoiceChargeRow, phone?: string | null) => void;
  onEmail: (row: SaasInvoiceChargeRow, email?: string | null) => void;
  onSyncStatus: (row: SaasInvoiceChargeRow) => void;
  onCancelCharge: (row: SaasInvoiceChargeRow) => void;
  onRegisterPayment: (row: SaasInvoiceChargeRow) => void;
  onGenerateCharge?: () => void;
  generatingCharge?: boolean;
  showGenerateButton?: boolean;
  compact?: boolean;
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
  onCopyPix,
  onOpenInvoice,
  onOpenBankSlip,
  onWhatsApp,
  onEmail,
  onSyncStatus,
  onCancelCharge,
  onRegisterPayment,
  onGenerateCharge,
  generatingCharge,
  showGenerateButton = false,
  compact = false,
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

  const canGenerate = showGenerateButton || !!onGenerateCharge;

  const generateButton = canGenerate ? (
    <button
      type="button"
      disabled={generatingCharge || !gatewayReady}
      title={
        !gatewayReady
          ? 'Configure ASAAS_API_KEY para gerar cobranças.'
          : undefined
      }
      onClick={() => onGenerateCharge?.()}
      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-[12px] font-semibold text-white shrink-0"
    >
      {generatingCharge ? 'Gerando…' : 'Gerar Cobrança'}
    </button>
  ) : null;

  return (
    <div className="bg-[#11161d] border border-white/5 rounded-2xl overflow-visible w-full">
      <div className="p-5 border-b border-white/5 flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
        <div>
          <h3 className="text-[16px] font-bold text-white">Cobranças</h3>
          <p className="text-[12px] text-gray-400">
            {compact
              ? 'Cobranças desta empresa — PIX ou Boleto.'
              : 'PIX e Boleto Asaas — ações centralizadas no menu.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center min-w-0">
          {generateButton}
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

      <div className="sv-table-scroll overflow-x-auto overflow-y-visible pb-2">
        <table className="w-full text-left min-w-[1020px]">
          <thead>
            <tr className="border-b border-white/5 text-[12px] text-gray-400">
              <th className="p-4 font-medium">Empresa</th>
              <th className="p-4 font-medium">Competência</th>
              <th className="p-4 font-medium">Valor</th>
              <th className="p-4 font-medium">Vencimento</th>
              <th className="p-4 font-medium">Forma</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Payment ID</th>
              <th className="p-4 font-medium">Link Asaas</th>
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
              const asaasLink = row.invoiceUrl || row.paymentUrl || row.bankSlipUrl;

              const actions: SaasActionItem[] = [
                { id: 'view', label: 'Ver cobrança', onClick: () => onViewCharge(row) },
                {
                  id: 'copy_pix',
                  label: 'Copiar PIX',
                  onClick: () => onCopyPix(row),
                  disabled: !row.pixCopyPaste,
                },
                {
                  id: 'open_invoice',
                  label: 'Abrir fatura',
                  onClick: () => onOpenInvoice(row),
                  disabled: !row.invoiceUrl && !row.paymentUrl,
                },
                {
                  id: 'open_boleto',
                  label: 'Abrir boleto',
                  onClick: () => onOpenBankSlip(row),
                  disabled: !row.bankSlipUrl,
                },
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
                  </td>
                  <td className="p-4 text-[12px] text-gray-400">{row.referenceMonth}</td>
                  <td className="p-4 text-[13px] text-emerald-300 font-semibold tabular-nums">
                    {formatSaasCurrency(row.amount)}
                  </td>
                  <td className="p-4 text-[12px] text-gray-300">{formatDateBr(row.dueDate)}</td>
                  <td className="p-4 text-[12px] text-gray-300">{row.billingType}</td>
                  <td className="p-4">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${saasChargeDisplayStatusTone(displayStatus)}`}
                    >
                      {saasChargeDisplayStatusLabel(displayStatus)}
                    </span>
                  </td>
                  <td className="p-4 text-[11px] font-mono text-gray-500">
                    {truncatePaymentId(row.paymentId)}
                  </td>
                  <td className="p-4">
                    {asaasLink ? (
                      <a
                        href={asaasLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-blue-400 hover:underline"
                      >
                        Abrir
                      </a>
                    ) : (
                      <span className="text-[11px] text-gray-600">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    <SaasActionsDropdown items={actions} />
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8">
                  <div className="rounded-xl border border-dashed border-white/10 bg-[#0B0E14]/40 px-6 py-10 text-center">
                    <h4 className="text-base font-bold text-white mb-2">Nenhuma cobrança</h4>
                    <p className="text-sm text-gray-400 max-w-md mx-auto mb-5">
                      {canGenerate
                        ? 'Emita PIX ou Boleto via Asaas para esta empresa.'
                        : 'Gere cobranças pelo workspace da empresa ou use Gerar cobranças do mês.'}
                    </p>
                    {generateButton ? (
                      <div className="flex justify-center">{generateButton}</div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
