'use client';

import { useState } from 'react';
import { FileText, Download, RefreshCw, ExternalLink } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { formatSaasCurrency, resolveCompanyPricing, type CompanyPricingSource } from '@/lib/companyPricing';
import { formatDateBr, type CompanySubscription } from '@/lib/saasSubscription';
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

  const contractUrl =
    sub?.contract_pdf_url?.startsWith('http')
      ? sub.contract_pdf_url
      : `/api/companies/${company.id}/contract?download=1`;

  const viewUrl = sub?.contract_pdf_url?.startsWith('http')
    ? sub.contract_pdf_url
    : `/api/companies/${company.id}/contract?download=1`;

  async function callApi(path: string, method = 'POST') {
    if (!user?.id) {
      setError('Usuário não autenticado.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha na operação');
      onRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setBusy(false);
    }
  }

  async function createSubscription() {
    await callApi(`/api/companies/${company.id}/subscription/create`);
  }

  async function regenerateContract() {
    await callApi(`/api/companies/${company.id}/contract/generate`);
  }

  const contractStatusLabel =
    sub?.contract_status === 'active'
      ? 'Ativo'
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
          {!sub && (
            <button
              type="button"
              disabled={busy}
              onClick={createSubscription}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-[13px] hover:bg-blue-500 disabled:opacity-50"
            >
              Criar assinatura e contrato
            </button>
          )}
          {sub && (
            <>
              <a
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-gray-200 text-[13px] hover:bg-white/5"
              >
                <ExternalLink className="w-4 h-4" /> Ver contrato
              </a>
              <a
                href={contractUrl}
                download
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-gray-200 text-[13px] hover:bg-white/5"
              >
                <Download className="w-4 h-4" /> Baixar PDF
              </a>
              <button
                type="button"
                disabled={busy}
                onClick={regenerateContract}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-500/30 text-amber-300 text-[13px] hover:bg-amber-500/10 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                Regerar contrato
              </button>
            </>
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
        <Info label="Próximo vencimento" value={formatDateBr(sub?.next_due_date || company.next_billing)} />
        <Info label="Status do contrato" value={contractStatusLabel} />
        <Info label="Nº do contrato" value={sub?.contract_number || company.contract_number || '—'} />
        <Info label="Pagamento" value={company.payment_status} />
        <Info
          label="PDF"
          value={sub?.contract_pdf_url ? 'Disponível' : 'Não gerado'}
        />
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
