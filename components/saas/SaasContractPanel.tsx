'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Download, RefreshCw, ExternalLink, History } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { formatSaasCurrency, resolveCompanyPricing, type CompanyPricingSource } from '@/lib/companyPricing';
import { validateSaasContractGeneration } from '@/lib/saasContractValidation';
import {
  formatDateBr,
  hasSaasContractReady,
  type CompanySubscription,
} from '@/lib/saasSubscription';
import type { CompanyContractRow } from '@/lib/saasContractService';
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
  const [contracts, setContracts] = useState<CompanyContractRow[]>([]);

  const companyId = (company as { id?: string } | null)?.id;
  const sub = company?.saas_subscription as CompanySubscription | null;
  const pricing = company ? resolveCompanyPricing(company as CompanyPricingSource) : null;
  const validation = company
    ? validateSaasContractGeneration(company as CompanyPricingSource, sub)
    : null;
  const contractReady = hasSaasContractReady(sub);
  const contractViewUrl =
    sub?.contract_pdf_url?.startsWith('http')
      ? sub.contract_pdf_url
      : companyId
        ? `/api/companies/${companyId}/contract?download=1`
        : '#';

  const loadContracts = useCallback(async () => {
    if (!companyId || !user?.id) return;
    try {
      const res = await fetch(
        `/api/companies/${companyId}/contracts?userId=${encodeURIComponent(user.id)}`,
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok) setContracts(json.contracts || []);
    } catch {
      setContracts([]);
    }
  }, [companyId, user?.id]);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  if (!company) {
    return (
      <div className="bg-[#11161d] border border-white/5 rounded-2xl p-8 text-center text-gray-400 text-sm">
        Selecione uma empresa na tabela de assinaturas para ver o contrato.
      </div>
    );
  }

  async function generateContract() {
    if (!companyId || !user?.id) {
      const msg = 'Não foi possível gerar o contrato';
      setError(msg);
      alert(msg);
      return;
    }
    if (busy) return;

    if (validation && !validation.ok) {
      setError(validation.error || 'Dados incompletos');
      alert(validation.error || 'Preencha os dados da empresa antes de gerar o contrato.');
      return;
    }

    console.log('SAAS_CONTRACT_GENERATE_START');
    console.log('SAAS_CONTRACT_COMPANY_DATA', company);
    console.log('SAAS_CONTRACT_SUBSCRIPTION_DATA', sub);
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/contract/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          subscription_id: sub?.id ?? null,
          company_id: companyId,
          plan_type: sub?.plan_type || company.plan_type || company.plan,
          monthly_price: sub?.monthly_price ?? pricing?.appliedPrice,
          start_date: sub?.start_date || company.subscription_start_date,
          next_due_date: sub?.next_due_date || company.next_payment_date,
        }),
      });
      const result = await res.json().catch(() => ({}));
      console.log('GENERATE_SAAS_CONTRACT_RESPONSE', result);

      if (!res.ok || !result.success) {
        const msg =
          result.error ||
          (Array.isArray(result.missing)
            ? `Preencha: ${result.missing.join(', ')}`
            : 'Não foi possível gerar o contrato');
        throw new Error(msg);
      }

      console.log('SAAS_CONTRACT_GENERATED_SUCCESS', result);
      setContracts(result.contracts || []);
      onRefresh();
      await loadContracts();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível gerar o contrato';
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
      <div className="p-5 border-b border-white/5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-[16px] font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Contrato SaaS — {company.name}
          </h3>
          <p className="text-[12px] text-gray-400 mt-1">
            S.V TOPOGRAFIA E PROJETO LTDA · NORTE &amp; SUL TOPOGRAFIA · Parauapebas/PA
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {contractReady && (
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
            </>
          )}
          <button
            type="button"
            disabled={busy || !sub}
            onClick={generateContract}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-[13px] hover:bg-amber-500 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            {contractReady ? 'Regenerar contrato' : 'Gerar contrato'}
          </button>
        </div>
      </div>

      {validation && !validation.ok && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm whitespace-pre-line">
          {validation.error}
        </div>
      )}

      {error && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm whitespace-pre-line">
          {error}
        </div>
      )}

      <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Info label="Empresa" value={company.name || '—'} />
        <Info label="Plano" value={company.ui_plan} />
        <Info label="Valor contratado" value={pricing ? formatSaasCurrency(pricing.appliedPrice) : '—'} />
        <Info label="Data de início" value={formatDateBr(sub?.start_date || company.subscription_start_date)} />
        <Info label="Dia de vencimento" value={`Dia ${company.subscription_due_day ?? '—'}`} />
        <Info label="Próximo vencimento" value={formatDateBr(sub?.next_due_date || company.next_payment_date)} />
        <Info label="Status do contrato" value={contractStatusLabel} />
        <Info label="Nº do contrato" value={sub?.contract_number || '—'} />
        <Info label="Pagamento" value={company.payment_status} />
        <Info label="PDF" value={contractReady ? 'Disponível' : 'Não gerado'} />
      </div>

      <div className="px-5 pb-5">
        <h4 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-gray-400" />
          Histórico de versões
        </h4>
        {contracts.length === 0 ? (
          <p className="text-xs text-gray-500">Nenhuma versão registrada ainda.</p>
        ) : (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {contracts.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#0B0E14] border border-white/5 text-[12px]"
              >
                <div>
                  <span className="text-white font-medium">{c.contract_number}</span>
                  <span className="text-gray-500 ml-2">v{c.version}</span>
                  <span
                    className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
                      c.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {c.status}
                  </span>
                  <p className="text-gray-500 mt-0.5">
                    {formatDateBr(c.generated_at?.split('T')[0])}
                  </p>
                </div>
                <a
                  href={c.contract_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-300 hover:underline shrink-0"
                >
                  Abrir PDF
                </a>
              </div>
            ))}
          </div>
        )}
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
