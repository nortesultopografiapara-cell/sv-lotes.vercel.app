'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { SaasCompanyTab } from '@/lib/masterSaasPanel';
import { formatSaasCurrency, resolveCompanyPricing } from '@/lib/companyPricing';
import { formatDateBr } from '@/lib/saasSubscription';
import { augmentCompanyBilling } from '@/lib/masterBilling';
import { SaasContractPanel } from '@/components/saas/SaasContractPanel';
import { SaasChargesTable } from './SaasChargesTable';
import { SaasTimeline } from './SaasTimeline';
import type { SaasTimelineEvent } from '@/lib/masterSaasPanel';
import type { SaasInvoiceChargeRow } from '@/lib/saasInvoiceChargeView';
import type { SaasCompanyRow } from './SaasCompaniesList';
import type { CompanyContractRow } from '@/lib/saasContractService';
import type { CompanySubscription } from '@/lib/saasSubscription';

type EnrichedCompany = ReturnType<typeof augmentCompanyBilling>;

const TABS: { id: SaasCompanyTab; label: string }[] = [
  { id: 'dados', label: 'Dados' },
  { id: 'contrato', label: 'Contrato' },
  { id: 'assinatura', label: 'Assinatura' },
  { id: 'cobrancas', label: 'Cobranças' },
  { id: 'historico', label: 'Histórico' },
];

type Props = {
  company: SaasCompanyRow;
  tab: SaasCompanyTab;
  onTabChange: (tab: SaasCompanyTab) => void;
  onBack: () => void;
  subscription: CompanySubscription | null;
  contractHistory: CompanyContractRow[];
  chargeRows: SaasInvoiceChargeRow[];
  timelineEvents: SaasTimelineEvent[];
  gatewayReady?: boolean;
  syncingChargeId?: string | null;
  generatingInvoice?: boolean;
  loadingContract?: boolean;
  onRefresh: () => void;
  onContractsReload: () => void | Promise<void>;
  onGenerateContract: (opts?: { regenerate?: boolean }) => void | Promise<void>;
  onGenerateCharge: () => void;
  onRegisterPayment: () => void;
  chargeHandlers: {
    onViewCharge: (row: SaasInvoiceChargeRow) => void;
    onCopyPix: (row: SaasInvoiceChargeRow) => void;
    onOpenInvoice: (row: SaasInvoiceChargeRow) => void;
    onOpenBankSlip: (row: SaasInvoiceChargeRow) => void;
    onWhatsApp: (row: SaasInvoiceChargeRow, phone?: string | null) => void;
    onEmail: (row: SaasInvoiceChargeRow, email?: string | null) => void;
    onSyncStatus: (row: SaasInvoiceChargeRow) => void;
    onCancelCharge: (row: SaasInvoiceChargeRow) => void;
    onRegisterPayment: (row: SaasInvoiceChargeRow) => void;
  };
};

export function SaasCompanyWorkspace({
  company,
  tab,
  onTabChange,
  onBack,
  subscription,
  contractHistory,
  chargeRows,
  timelineEvents,
  gatewayReady,
  syncingChargeId,
  generatingInvoice,
  loadingContract,
  onRefresh,
  onContractsReload,
  onGenerateContract,
  onGenerateCharge,
  onRegisterPayment,
  chargeHandlers,
}: Props) {
  const pricing = resolveCompanyPricing(company);
  const companyCharges = chargeRows.filter((r) => r.companyId === company.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/5"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-0.5">
              Workspace da Empresa
            </p>
            <h2 className="text-xl font-bold text-white">{company.name}</h2>
            <p className="text-sm text-gray-500">{company.email || '—'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/companies/${company.id}`}
            className="px-3 py-2 rounded-lg border border-white/10 text-[12px] text-gray-300 hover:bg-white/5"
          >
            Editar empresa
          </Link>
          <button
            type="button"
            disabled={generatingInvoice || !gatewayReady}
            onClick={onGenerateCharge}
            className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-[12px] font-semibold text-white"
          >
            {generatingInvoice ? 'Gerando…' : 'Gerar cobrança'}
          </button>
          <button
            type="button"
            onClick={onRegisterPayment}
            className="px-3 py-2 rounded-lg border border-emerald-500/30 text-[12px] font-semibold text-emerald-300 hover:bg-emerald-500/10"
          >
            Registrar pagamento
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-[#11161d] border border-white/5 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            className={`px-3 py-2 rounded-lg text-[12px] font-medium ${
              tab === t.id ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dados' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoCard label="CNPJ" value={String(company.cnpj || '—')} />
          <InfoCard label="Plano" value={String(company.ui_plan || '—')} />
          <InfoCard label="Situação financeira" value={String(company.financial_situation || '—')} />
          <InfoCard label="Status operacional" value={String(company.company_operational_status || company.status_operacional || '—')} />
          <InfoCard label="E-mail" value={String(company.email || '—')} />
          <InfoCard label="Telefone" value={String(company.phone || '—')} />
        </div>
      ) : null}

      {tab === 'contrato' ? (
        <SaasContractPanel
          company={company as EnrichedCompany}
          subscription={subscription}
          contracts={contractHistory}
          generating={!!loadingContract}
          onRefresh={onRefresh}
          onContractsReload={onContractsReload}
          onGenerateContract={onGenerateContract}
        />
      ) : null}

      {tab === 'assinatura' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoCard label="Plano" value={String(company.ui_plan || subscription?.plan_type || '—')} />
          <InfoCard label="Valor" value={formatSaasCurrency(pricing.appliedPrice)} />
          <InfoCard
            label="Próximo vencimento"
            value={formatDateBr(company.next_payment_date || subscription?.next_due_date)}
          />
          <InfoCard label="Último pagamento" value={formatDateBr(company.last_payment_date)} />
          <InfoCard
            label="Status"
            value={String(company.financial_situation || subscription?.payment_status || '—')}
          />
        </div>
      ) : null}

      {tab === 'cobrancas' ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-white/5 bg-[#11161d] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Cobranças da empresa</p>
              <p className="text-[12px] text-gray-400">Gere PIX ou Boleto sem sair do workspace.</p>
            </div>
            <button
              type="button"
              disabled={generatingInvoice || !gatewayReady}
              title={
                !gatewayReady
                  ? 'Configure ASAAS_API_KEY para gerar cobranças.'
                  : undefined
              }
              onClick={onGenerateCharge}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-[12px] font-semibold text-white shrink-0"
            >
              {generatingInvoice ? 'Gerando…' : 'Gerar Cobrança'}
            </button>
          </div>
          <SaasChargesTable
            rows={companyCharges}
            compact
            showGenerateButton
            gatewayReady={gatewayReady}
            syncingChargeId={syncingChargeId}
            generatingCharge={generatingInvoice}
            onGenerateCharge={onGenerateCharge}
            getCompanyPhone={() => String(company.phone || '')}
            getCompanyEmail={() => String(company.email || '')}
            onViewCharge={chargeHandlers.onViewCharge}
            onCopyPix={chargeHandlers.onCopyPix}
            onOpenInvoice={chargeHandlers.onOpenInvoice}
            onOpenBankSlip={chargeHandlers.onOpenBankSlip}
            onWhatsApp={chargeHandlers.onWhatsApp}
            onEmail={chargeHandlers.onEmail}
            onSyncStatus={chargeHandlers.onSyncStatus}
            onCancelCharge={chargeHandlers.onCancelCharge}
            onRegisterPayment={chargeHandlers.onRegisterPayment}
          />
        </div>
      ) : null}

      {tab === 'historico' ? (
        <div className="rounded-2xl border border-white/5 bg-[#11161d] p-5">
          <h3 className="text-sm font-bold text-white mb-4">Timeline</h3>
          <SaasTimeline events={timelineEvents} />
        </div>
      ) : null}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#11161d] p-4">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-[14px] text-white mt-1 font-medium">{value}</p>
    </div>
  );
}
