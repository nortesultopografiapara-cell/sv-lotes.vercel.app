'use client';

import { Search } from 'lucide-react';
import { formatSaasCurrency, resolveCompanyPricing } from '@/lib/companyPricing';
import { formatDateBr } from '@/lib/saasSubscription';
import { CustomPriceBadge } from '@/components/companies/CustomPriceBadge';
import { MasterEmptyState } from '@/components/master/MasterEmptyState';
import type { CompanySubscription } from '@/lib/saasSubscription';

export type SaasCompanyRow = {
  id: string;
  name: string;
  email?: string | null;
  ui_plan?: string;
  financial_situation?: string;
  last_payment_date?: string | null;
  next_payment_date?: string | null;
  saas_subscription?: CompanySubscription | null;
  [key: string]: unknown;
};

type Props = {
  companies: SaasCompanyRow[];
  loading?: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function SaasCompaniesList({
  companies,
  loading,
  search,
  onSearchChange,
  selectedId,
  onSelect,
}: Props) {
  const q = search.trim().toLowerCase();
  const filtered = companies.filter(
    (c) => !q || c.name.toLowerCase().includes(q) || String(c.email || '').toLowerCase().includes(q),
  );

  return (
    <div className="bg-[#11161d] border border-white/5 rounded-2xl overflow-hidden flex flex-col h-full min-h-[420px]">
      <div className="p-4 border-b border-white/5">
        <h3 className="text-[15px] font-bold text-white mb-3">Empresas</h3>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-[#0B0E14] border border-white/10 text-white pl-9 pr-3 py-2 rounded-lg text-[13px]"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-white/5">
        {filtered.map((c) => {
          const pricing = resolveCompanyPricing(c);
          const sub = c.saas_subscription;
          const active = selectedId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors ${
                active ? 'bg-blue-600/10 border-l-2 border-blue-500' : ''
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-medium text-white">{c.name}</span>
                <CustomPriceBadge company={c} />
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">{c.ui_plan || '—'}</p>
              <div className="flex items-center justify-between mt-1.5 text-[11px]">
                <span className="text-emerald-400 font-semibold">
                  {formatSaasCurrency(pricing.appliedPrice)}
                </span>
                <span className="text-gray-500">
                  {formatDateBr(c.next_payment_date || sub?.next_due_date)}
                </span>
              </div>
            </button>
          );
        })}
        {!loading && filtered.length === 0 ? (
          <div className="p-6">
            <MasterEmptyState title="Nenhuma empresa" description="Cadastre em /companies." />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Tabela resumida de assinaturas (visão lista). */
export function SaasSubscriptionsSummaryTable({
  companies,
  onOpenCompany,
}: {
  companies: SaasCompanyRow[];
  onOpenCompany: (id: string) => void;
}) {
  return (
    <div className="bg-[#11161d] border border-white/5 rounded-2xl overflow-hidden mt-4">
      <div className="p-4 border-b border-white/5">
        <h3 className="text-[15px] font-bold text-white">Assinaturas</h3>
        <p className="text-[12px] text-gray-400">Visão resumida — clique na empresa para detalhes.</p>
      </div>
      <div className="sv-table-scroll">
        <table className="w-full text-left min-w-[640px]">
          <thead>
            <tr className="border-b border-white/5 text-[12px] text-gray-400">
              <th className="p-3 font-medium">Empresa</th>
              <th className="p-3 font-medium">Plano</th>
              <th className="p-3 font-medium">Valor</th>
              <th className="p-3 font-medium">Próximo vencimento</th>
              <th className="p-3 font-medium">Último pagamento</th>
              <th className="p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const pricing = resolveCompanyPricing(c);
              const sub = c.saas_subscription;
              return (
                <tr
                  key={c.id}
                  className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                  onClick={() => onOpenCompany(c.id)}
                >
                  <td className="p-3 text-[13px] text-white">{c.name}</td>
                  <td className="p-3 text-[12px] text-gray-400">{c.ui_plan || '—'}</td>
                  <td className="p-3 text-[13px] text-emerald-300">
                    {formatSaasCurrency(pricing.appliedPrice)}
                  </td>
                  <td className="p-3 text-[12px] text-gray-300">
                    {formatDateBr(c.next_payment_date || sub?.next_due_date)}
                  </td>
                  <td className="p-3 text-[12px] text-gray-300">
                    {formatDateBr(c.last_payment_date)}
                  </td>
                  <td className="p-3 text-[12px] text-gray-300">
                    {c.financial_situation || sub?.payment_status || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
