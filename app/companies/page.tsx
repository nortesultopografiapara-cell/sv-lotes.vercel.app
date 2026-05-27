'use client';

import { Suspense, useState, useEffect, useCallback, type ComponentType } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Building2,
  Search,
  Plus,
  CheckCircle2,
  Map as MapIcon,
  Database,
  Users,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import NewCompanyModal from '@/components/companies/NewCompanyModal';
import CompanyDeleteModal from '@/components/companies/CompanyDeleteModal';
import { CompanyCard } from '@/components/companies/CompanyCard';
import { MasterEmptyState } from '@/components/master/MasterEmptyState';
import { useAuth } from '@/hooks/useAuth';
import { isPlatformAdmin } from '@/lib/rls';
import { supabase } from '@/lib/supabase';

export default function CompaniesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 w-full h-full flex items-center justify-center bg-[var(--color-background)]">
          <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
        </div>
      }
    >
      <CompaniesPageContent />
    </Suspense>
  );
}

function CompaniesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [companyToEdit, setCompanyToEdit] = useState<any>(null);
  const [companyToDelete, setCompanyToDelete] = useState<any>(null);
  const [companyToView, setCompanyToView] = useState<any>(null);

  const [companies, setCompanies] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCompanies = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    setLoadError(null);

    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      console.log('[MASTER_COMPANIES] empresas retornadas:', data?.length ?? 0);
      console.log('[MASTER_COMPANIES] erro:', error);

      if (error) {
        setLoadError(`Erro ao carregar empresas: ${error.message}`);
        setCompanies([]);
        return;
      }

      const list = (data ?? []).map((c) => ({
        ...c,
        project_count: 0,
        users: [{ count: 0 }],
      }));

      setCompanies(list);

      const { data: projectsData } = await supabase
        .from('projects')
        .select('tenant_id, company_id');

      if (projectsData?.length) {
        const counts: Record<string, number> = {};
        projectsData.forEach((p: { tenant_id?: string | null; company_id?: string | null }) => {
          const key = p.tenant_id || p.company_id;
          if (key) counts[key] = (counts[key] || 0) + 1;
        });
        setCompanies((prev) =>
          prev.map((c) => ({ ...c, project_count: counts[c.id] || 0 })),
        );
      }

      const { data: usersData } = await supabase.from('users').select('tenant_id, company_id');
      if (usersData?.length) {
        const userCounts: Record<string, number> = {};
        usersData.forEach((u: { tenant_id?: string | null; company_id?: string | null }) => {
          const key = u.tenant_id || u.company_id;
          if (key) userCounts[key] = (userCounts[key] || 0) + 1;
        });
        setCompanies((prev) =>
          prev.map((c) => ({ ...c, users: [{ count: userCounts[c.id] || 0 }] })),
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      console.log('[MASTER_COMPANIES] erro:', err);
      setLoadError(`Erro ao carregar empresas: ${message}`);
      setCompanies([]);
    } finally {
      setDataLoading(false);
    }
  }, [user]);

  const handleEdit = (company: any) => {
    setCompanyToEdit(company);
    setIsModalOpen(true);
  };

  const handleDelete = async (company: any) => {
    setCompanyToDelete(company);
  };

  const handleUpdateStatus = async (company: any, newStatus: string) => {
    const isActivating = newStatus === 'Ativa';
    let confirmMsg = isActivating
      ? `Ativar empresa?\nOs usuários desta empresa voltarão a acessar o sistema.`
      : `Desativar empresa?\nOs usuários desta empresa não conseguirão acessar o sistema, mas nenhum dado será apagado.`;

    if (
      !isActivating &&
      (company.id === user?.tenant_id ||
        company.is_master ||
        company.slug?.toLowerCase() === 'master' ||
        company.name?.toLowerCase().includes('master'))
    ) {
      confirmMsg = `⚠️ ATENÇÃO: Esta é uma empresa Master ou a sua empresa atual.\nDesativar esta empresa pode impossibilitar o seu próprio acesso!\n\nTem certeza absoluta que deseja desativar?`;
    }

    if (confirm(confirmMsg)) {
      try {
        const res = await fetch('/api/companies/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: company.id,
            status_operacional: newStatus,
            userId: user?.id,
          }),
        });

        const resData = await res.json();

        if (!res.ok) {
          throw new Error(resData.error || 'Erro ao atualizar status');
        }

        alert(`Empresa ${isActivating ? 'ativada' : 'desativada'} com sucesso.`);
        loadCompanies();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Erro');
      }
    }
  };

  const handleImpersonate = async (company: any) => {
    if (confirm(`Tem certeza que deseja "Entrar como Empresa" na tenant: ${company.name}?`)) {
      try {
        const { error } = await supabase
          .from('users')
          .update({ tenant_id: company.id })
          .eq('id', user?.id)
          .eq('role', 'SUPER_ADMIN');

        if (error) throw error;

        localStorage.setItem('impersonating_tenant_id', company.id);
        localStorage.setItem('impersonating_company_name', company.name);

        supabase
          .from('audit_logs')
          .insert({
            tenant_id: company.id,
            user_id: user?.id,
            action: 'COMPANY_IMPERSONATED',
            details: JSON.stringify({ company_name: company.name }),
          })
          .then();

        window.location.assign('/dashboard');
      } catch (err: unknown) {
        alert('Erro ao personificar empresa: ' + (err instanceof Error ? err.message : ''));
      }
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else if (!isPlatformAdmin(user.role)) {
        router.push('/');
      } else {
        loadCompanies();
      }
    }
  }, [authLoading, user, router, loadCompanies]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCompanyToEdit(null);
      setIsModalOpen(true);
      router.replace('/companies', { scroll: false });
    }
  }, [searchParams, router]);

  if (authLoading || (dataLoading && companies.length === 0 && !loadError)) {
    return (
      <div className="flex-1 w-full h-full flex items-center justify-center bg-[var(--color-background)]">
        <Loader2 className="w-8 h-8 text-[#06b6d4] animate-spin" />
      </div>
    );
  }

  const activeCompanies = companies.filter((c) => c.active === true).length;
  const totalUsers = companies.reduce((acc, c) => acc + (c.users?.[0]?.count || 0), 0);
  const totalProjects = companies.reduce((acc, c) => acc + (c.project_count || 0), 0);

  const filteredCompanies = companies.filter((c) => {
    const q = search.toLowerCase();
    const name = (c.name || '').toLowerCase();
    const slug = (c.slug || '').toLowerCase();
    return name.includes(q) || slug.includes(q);
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col h-full bg-[var(--color-background)]">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
            Principal · Multi-tenant
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            <Building2 className="w-7 h-7 text-[var(--color-primary)]" />
            Empresas
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-lg">
            Gerencie tenants, planos e acesso ao workspace de cada loteadora.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (
                confirm(
                  'Atenção: Esta ação irá limpar cadastros de teste. Deseja continuar?'
                )
              ) {
                try {
                  const res = await fetch('/api/companies/cleanup', { method: 'POST' });
                  if (!res.ok) throw new Error('Falha ao limpar cadastros');
                  alert('Cadastros de teste limpos com sucesso!');
                  loadCompanies();
                } catch (e: unknown) {
                  alert(e instanceof Error ? e.message : 'Erro');
                }
              }
            }}
            className="h-9 px-3 rounded-lg text-xs font-medium text-red-400/80 hover:text-red-300 border border-red-500/20 hover:bg-red-500/10 transition-colors flex items-center gap-2"
            title="Limpar cadastros incompletos"
          >
            <AlertCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Limpar testes</span>
          </button>
          <button
            onClick={() => {
              setCompanyToEdit(null);
              setIsModalOpen(true);
            }}
            className="h-9 px-4 rounded-lg bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-semibold flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova empresa
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard title="Empresas" value={companies.length} icon={Database} accent="text-[var(--color-primary)]" />
        <StatCard title="Ativas" value={activeCompanies} icon={CheckCircle2} accent="text-emerald-400" />
        <StatCard title="Projetos" value={totalProjects} icon={MapIcon} accent="text-cyan-400" />
        <StatCard title="Usuários" value={totalUsers} icon={Users} accent="text-purple-400" />
      </div>

      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por nome ou slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 bg-[var(--color-surface)]/80 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[var(--color-primary)]/40 transition-colors"
          />
        </div>
      </div>

      {loadError ? (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <p className="font-semibold">{loadError}</p>
          <button
            type="button"
            onClick={() => loadCompanies()}
            className="mt-3 text-xs font-semibold text-red-100 underline hover:no-underline"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {companies.length === 0 && !loadError ? (
        <MasterEmptyState
          title="Nenhuma empresa cadastrada ainda"
          description="Cadastre a primeira empresa para iniciar a operação SaaS."
        />
      ) : filteredCompanies.length === 0 ? (
        <div className="flex-1 flex items-center justify-center rounded-2xl border border-dashed border-white/10 py-16">
          <p className="text-sm text-slate-500">Nenhuma empresa encontrada para esta busca.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 pb-8">
          {filteredCompanies.map((c, idx) => (
            <CompanyCard
              key={c.id}
              company={c}
              user={user}
              isMaster={
                idx === 0 ||
                c.is_master ||
                c.slug?.toLowerCase() === 'master' ||
                c.name?.toLowerCase().includes('master')
              }
              onEdit={() => handleEdit(c)}
              onView={() => setCompanyToView(c)}
              onDelete={() => handleDelete(c)}
              onUpdateStatus={handleUpdateStatus}
              onImpersonate={() => handleImpersonate(c)}
            />
          ))}
        </div>
      )}

      <NewCompanyModal
        key={isModalOpen ? (companyToEdit ? companyToEdit.id : 'new') : 'closed'}
        isOpen={isModalOpen}
        initialData={companyToEdit}
        onClose={() => setIsModalOpen(false)}
        onSuccess={loadCompanies}
      />
      <CompanyDeleteModal
        isOpen={!!companyToDelete}
        company={companyToDelete}
        user={user}
        onClose={() => setCompanyToDelete(null)}
        onSuccess={() => {
          alert('Empresa excluída com sucesso.');
          setCompanyToDelete(null);
          loadCompanies();
        }}
      />
      {companyToView && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#151a23] border border-[#1f232b] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-[#1f232b]">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-400" /> Detalhes da Empresa
              </h2>
              <button
                onClick={() => setCompanyToView(null)}
                className="p-2 text-gray-400 hover:text-white transition-colors hover:bg-gray-800 rounded-lg"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <p className="text-xs font-mono text-gray-500 uppercase font-bold">Nome</p>
                <p className="text-sm font-semibold text-white">{companyToView.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-mono text-gray-500 uppercase font-bold">CNPJ</p>
                  <p className="text-sm text-gray-300">{companyToView.cnpj || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-mono text-gray-500 uppercase font-bold">Status</p>
                  <p className="text-sm text-gray-300">{companyToView.status_operacional || '—'}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-mono text-gray-500 uppercase font-bold">Projetos</p>
                <p className="text-sm text-gray-300">{companyToView.project_count || 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  accent,
}: {
  title: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-[var(--color-surface)]/50 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-white tabular-nums mt-1">{value}</p>
        </div>
        <Icon className={`w-5 h-5 ${accent} opacity-80`} />
      </div>
    </div>
  );
}
