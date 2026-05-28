'use client';

import { useState } from 'react';
import { FileText, Download, RefreshCw, ExternalLink } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { formatSaasCurrency, resolveCompanyPricing, type CompanyPricingSource } from '@/lib/companyPricing';
import { validateSaasContractGeneration } from '@/lib/saasContractValidation';
import {
  formatDateBr,
  hasSaasContractReady,
  type CompanySubscription,
} from '@/lib/saasSubscription';
import type { augmentCompanyBilling } from '@/lib/masterBilling';

type EnrichedCompany = ReturnType<typeof augmentCompanyBilling>;

type Props = {
  company: EnrichedCompany | null;
  onRefresh: () => void;
};

export function SaasContractPanel({ company, onRefresh }: Props) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!company) {
    return (
      <div className="bg-[#11161d] border border-white/5 rounded-2xl p-8 text-center text-gray-400 text-sm">
        Selecione uma empresa na tabela de assinaturas para ver o contrato.
      </div>
    );
  }

  const sub = company.saas_subscription as CompanySubscription | null;
  const pricing = resolveCompanyPricing(company as CompanyPricingSource);
  const contractReady = hasSaasContractReady(sub);
  const contractViewUrl = sub?.contract_pdf_url?.startsWith('http')
    ? sub.contract_pdf_url
    : `/api/companies/${company.id}/contract?download=1`;

  async function generateContract() {
    const companyId = (company as { id?: string }).id;
    if (!companyId || !user?.id) {
      const msg = 'Não foi possível gerar o contrato';
      setError(msg);
      alert(msg);
      return;
    }
    if (busy) return;

    const validation = validateSaasContractGeneration(
      company as CompanyPricingSource,
      sub,
    );
    if (!validation.ok) {
      const msg = validation.error || 'Não foi possível gerar o contrato';
      setError(msg);
      alert(msg);
      return;
    }

    console.log('GENERATE_SAAS_CONTRACT_CLICK', company, sub);
    setBusy(true);
    setError(null);

    const pricing = resolveCompanyPricing(company as CompanyPricingSource);

    try {
      const res = await fetch(`/api/companies/${companyId}/contract/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          subscription_id: sub?.id ?? null,
          company_id: companyId,
          plan_type: sub?.plan_type || company.plan_type || company.plan,
          monthly_price: sub?.monthly_price ?? pricing.appliedPrice,
          next_due_date: sub?.next_due_date ?? company.next_billing,
        }),
      });
      const result = await res.json().catch(() => ({}));
      console.log('GENERATE_SAAS_CONTRACT_RESPONSE', result);
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Falha ao gerar contrato');
      }
      onRefresh();
    } catch (e: unknown) {
      const msg = 'Não foi possível gerar o contrato';
      setError(msg);
      alert(msg);
      console.error('GENERATE_SAAS_CONTRACT_ERROR', e);
    } finally {
      setBusy(false);
    }
  }

  const contractStatusLabel =
    sub?.contract_status === 'active'
      ? 'Ativo'
      : sub?.contract_status === 'pending'
        ? 'Pendente (aguardando PDF)'
        : sub?.contract_status === 'suspended'
          ? 'Suspenso'
          : sub?.contract_status === 'canceled'
            ? 'Cancelado'
            : '—';

  return (
    <div className="bg-[#11161d] border border-white/5 rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-white/5 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-[16px] font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Contrato SaaS — {company.name}
          </h3>
          <p className="text-[12px] text-gray-400 mt-1">
            Licença de uso SV LOTES · S.V TOPOGRAFIA E PROJETOS LTDA
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {contractReady ? (
            <>
              <a
                href={contractViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-gray-200 text-[13px] hover:bg-white/5"
              >
                <ExternalLink className="w-4 h-4" /> Ver contrato
              </a>
              <a
                href={contractViewUrl}
                download
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-gray-200 text-[13px] hover:bg-white/5"
              >
                <Download className="w-4 h-4" /> Baixar PDF
              </a>
              <button
                type="button"
                disabled={busy}
                onClick={generateContract}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-500/30 text-amber-300 text-[13px] hover:bg-amber-500/10 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                Regerar contrato
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy || !sub}
              onClick={generateContract}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white text-[13px] hover:bg-amber-500 disabled:opacity-50"
            >
              {busy ? 'Gerando…' : 'Gerar contrato'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Info label="Empresa" value={company.name || '—'} />
        <Info label="Plano" value={company.ui_plan} />
        <Info label="Valor contratado" value={formatSaasCurrency(pricing.appliedPrice)} />
        <Info label="Data de início" value={formatDateBr(sub?.start_date)} />
        <Info
          label="Dia de vencimento"
          value={sub ? `Dia ${company.subscription_due_day ?? '—'}` : '—'}
        />
        <Info
          label="Próximo vencimento"
          value={formatDateBr(sub?.next_due_date || company.next_payment_date)}
        />
        <Info label="Status do contrato" value={contractStatusLabel} />
        <Info label="Nº do contrato" value={sub?.contract_number || '—'} />
        <Info label="Pagamento" value={company.payment_status} />
        <Info label="PDF" value={contractReady ? 'Disponível' : 'Não gerado'} />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0B0E14] border border-white/5 rounded-xl p-4">
      <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-[14px] font-medium text-white mt-1">{value}</p>
    </div>
  );
}
