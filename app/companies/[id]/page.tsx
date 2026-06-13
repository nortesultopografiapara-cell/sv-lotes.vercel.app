'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CreditCard,
  FolderOpen,
  History,
  Loader2,
  LogIn,
  Settings2,
  Users,
} from 'lucide-react';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { writeImpersonationState } from '@/lib/impersonationStorage';
import { augmentCompanyBilling } from '@/lib/masterBilling';
import { formatSaasCurrency, resolveCompanyPricing } from '@/lib/companyPricing';
import { getCompanySaasPlan } from '@/lib/saasPlans';
import { mapAuditLogRow } from '@/lib/masterAudit';
import type { CompanySubscription } from '@/lib/saasSubscription';
import { computeDaysLate } from '@/lib/masterSaasReports';

type TabId = 'geral' | 'plano' | 'recursos' | 'usuarios' | 'empreendimentos' | 'historico';

const TABS: { id: TabId; label: string; icon: typeof Building2 }[] = [
  { id: 'geral', label: 'Geral', icon: Building2 },
  { id: 'plano', label: 'Plano', icon: CreditCard },
  { id: 'recursos', label: 'Recursos', icon: Settings2 },
  { id: 'usuarios', label: 'Usuários', icon: Users },
  { id: 'empreendimentos', label: 'Empreendimentos', icon: FolderOpen },
  { id: 'historico', label: 'Histórico', icon: History },
];

export default function CompanyDetailPage() {
  const params = useParams();
  const companyId = String(params?.id || '');
  return (
    <MasterSuperAdminGuard>
      <CompanyDetailContent companyId={companyId} />
    </MasterSuperAdminGuard>
  );
}

function CompanyDetailContent({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('geral');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<any>(null);
  const [subscription, setSubscription] = useState<CompanySubscription | null>(null);
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [
        { data: companyRow, error: compErr },
        { data: subRows },
        { data: usersRows },
        { data: projectRows },
        { data: auditRows },
        { data: allUsers },
      ] = await Promise.all([
        supabase.from('companies').select('*').eq('id', companyId).single(),
        supabase.from('company_subscriptions').select('*').eq('company_id', companyId).maybeSingle(),
        supabase.from('users').select('id, name, full_name, email, role, created_at').eq('tenant_id', companyId),
        supabase.from('projects').select('id, name, city, uf, created_at').eq('tenant_id', companyId),
        supabase
          .from('audit_logs')
          .select('id, action, module, description, details, created_at, tenant_id, user_id')
          .eq('tenant_id', companyId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('users').select('id, name, full_name, email'),
      ]);

      if (compErr || !companyRow) throw compErr || new Error('Empresa não encontrada');

      const userNames = Object.fromEntries(
        (allUsers || []).map((u) => [u.id, u.name || u.full_name || u.email || 'Usuário']),
      );

      setCompany(companyRow);
      setSubscription((subRows as CompanySubscription | null) ?? null);
      setTenantUsers(usersRows || []);
      setProjects(projectRows || []);
      setHistory(
        (auditRows || []).map((row) =>
          mapAuditLogRow(row, { [companyId]: companyRow.name }, userNames),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar empresa');
    } finally {
      setLoading(false);
    }
  }, [companyId, user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const runSubscriptionAction = async (action: 'suspend' | 'reactivate' | 'renew') => {
    if (!user?.id || !subscription?.id) {
      alert('Assinatura não encontrada para esta empresa.');
      return;
    }
    setActionLoading(action);
    try {
      const res = await fetch('/api/master/subscription-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          subscriptionId: subscription.id,
          companyId,
          action,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha na operação');
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro');
    } finally {
      setActionLoading(null);
    }
  };

  const handleImpersonate = async () => {
    if (!company || !user) return;
    if (!confirm(`Entrar como empresa: ${company.name}?`)) return;
    const { error } = await supabase
      .from('users')
      .update({ tenant_id: company.id })
      .eq('id', user.id)
      .eq('role', 'SUPER_ADMIN');
    if (error) {
      alert(error.message);
      return;
    }
    writeImpersonationState({
      tenantId: company.id,
      companyName: company.name,
      masterId: user.id,
      masterName: user.name || user.email || 'Super Admin',
    });
    window.location.assign('/dashboard');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="p-8">
        <p className="text-red-300">{error || 'Empresa não encontrada'}</p>
        <Link href="/companies" className="text-sm text-slate-400 mt-4 inline-block hover:text-white">
          Voltar para empresas
        </Link>
      </div>
    );
  }

  const enriched = augmentCompanyBilling(company, subscription);
  const pricing = resolveCompanyPricing(company);
  const saasPlan = getCompanySaasPlan(company);
  const daysLate = computeDaysLate(enriched.next_payment_date);

  return (
    <div className="sv-page sv-page--scroll-y p-4 md:p-8">
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            href="/companies"
            className="mt-1 p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">{company.name}</h1>
            <p className="text-sm text-slate-500">{company.slug || company.cnpj || company.id}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleImpersonate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold"
        >
          <LogIn className="w-4 h-4" /> Acessar como empresa
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-white/10 pb-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'geral' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoCard label="Status operacional" value={company.status_operacional || '—'} />
          <InfoCard label="E-mail" value={company.email || '—'} />
          <InfoCard label="Telefone" value={company.phone || '—'} />
          <InfoCard label="CNPJ" value={company.cnpj || '—'} />
          <InfoCard label="Cidade" value={company.city || '—'} />
          <InfoCard label="Criada em" value={company.created_at ? new Date(company.created_at).toLocaleDateString('pt-BR') : '—'} />
        </div>
      )}

      {activeTab === 'plano' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoCard label="Plano" value={enriched.ui_plan} />
            <InfoCard label="Mensalidade" value={formatSaasCurrency(pricing.appliedPrice)} />
            <InfoCard label="Status financeiro" value={enriched.payment_status} />
            <InfoCard label="Status assinatura" value={enriched.subscription_status} />
            <InfoCard label="Próximo vencimento" value={enriched.next_payment_date || '—'} />
            <InfoCard label="Dias em atraso" value={daysLate > 0 ? `${daysLate} dias` : '—'} />
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionBtn
              label="Suspender"
              loading={actionLoading === 'suspend'}
              onClick={() => void runSubscriptionAction('suspend')}
              variant="danger"
            />
            <ActionBtn
              label="Reativar"
              loading={actionLoading === 'reactivate'}
              onClick={() => void runSubscriptionAction('reactivate')}
              variant="success"
            />
            <ActionBtn
              label="Renovar"
              loading={actionLoading === 'renew'}
              onClick={() => void runSubscriptionAction('renew')}
              variant="primary"
            />
          </div>
        </div>
      )}

      {activeTab === 'recursos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoCard label="Limite de projetos" value={String(saasPlan.maxProjects)} />
          <InfoCard label="Projetos em uso" value={String(projects.length)} />
          <InfoCard label="Limite de corretores" value={String(saasPlan.maxBrokers)} />
          <InfoCard label="Usuários vinculados" value={String(tenantUsers.length)} />
          <InfoCard label="Preço personalizado" value={pricing.hasCustomPrice ? 'Sim' : 'Não'} />
          <InfoCard
            label="Preço padrão do plano"
            value={formatSaasCurrency(pricing.standardPrice)}
          />
        </div>
      )}

      {activeTab === 'usuarios' && (
        <DataTable
          headers={['Nome', 'E-mail', 'Perfil', 'Criado em']}
          rows={tenantUsers.map((u) => [
            u.name || '—',
            u.email || '—',
            u.role || '—',
            u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '—',
          ])}
          empty="Nenhum usuário vinculado."
        />
      )}

      {activeTab === 'empreendimentos' && (
        <DataTable
          headers={['Nome', 'Cidade', 'UF', 'Criado em']}
          rows={projects.map((p) => [
            p.name || '—',
            p.city || '—',
            p.uf || '—',
            p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '—',
          ])}
          empty="Nenhum empreendimento cadastrado."
        />
      )}

      {activeTab === 'historico' && (
        <DataTable
          headers={['Data', 'Usuário', 'Ação', 'Detalhes']}
          rows={history.map((h) => [
            h.created_at ? new Date(h.created_at).toLocaleString('pt-BR') : '—',
            h.user_name,
            h.action,
            h.details,
          ])}
          empty="Nenhum histórico registrado."
        />
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[var(--color-surface)]/50 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className="text-sm text-white mt-1">{value}</p>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  loading,
  variant,
}: {
  label: string;
  onClick: () => void;
  loading: boolean;
  variant: 'primary' | 'success' | 'danger';
}) {
  const styles = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white',
  };
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${styles[variant]}`}
    >
      {loading ? 'Processando…' : label}
    </button>
  );
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-slate-500 text-sm py-8 text-center">{empty}</p>;
  }
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--color-surface)]/80 text-slate-500 text-xs uppercase">
          <tr>
            {headers.map((h) => (
              <th key={h} className="p-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-t border-white/5 hover:bg-white/[0.02]">
              {row.map((cell, cellIdx) => (
                <td key={cellIdx} className="p-3 text-slate-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
