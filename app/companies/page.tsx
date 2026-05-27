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

const BUILD_ID = 'MASTER_COMPANIES_FINAL-2026-05-27';

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

      console.log('[MASTER_COMPANIES_FINAL] total', data?.length);
      console.log('[MASTER_COMPANIES_FINAL] dados', data);

      if (error) {
        setLoadError(error.message);
        setCompanies([]);
        return;
      }

      setCompanies(data ?? []);

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
      console.log('[MASTER_COMPANIES_FINAL] erro', err);
      setLoadError(message);
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
      : `Desativar empresa?\nOs usuários desta empresa não conseguirão acessar o sistema.`;

    if (
      !isActivating &&
      (company.id === user?.tenant_id ||
        company.is_master ||
        company.slug?.toLowerCase() === 'master' ||
        company.name?.toLowerCase().includes('master'))
    ) {
      confirmMsg = `⚠️ ATENÇÃO: Esta é uma empresa Master ou a sua empresa atual.\nDesativar pode impossibilitar seu acesso!`;
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
        if (!res.ok) throw new Error(resData.error || 'Erro ao atualizar status');
        alert(`Empresa ${isActivating ? 'ativada' : 'desativada'} com sucesso.`);
        loadCompanies();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Erro');
      }
    }
  };

  const handleImpersonate = async (company: any) => {
    if (confirm(`Entrar como empresa: ${company.name}?`)) {
      try {
        const { error } = await supabase
          .from('users')
          .update({ tenant_id: company.id })
          .eq('id', user?.id)
          .eq('role', 'SUPER_ADMIN');
        if (error) throw error;
        localStorage.setItem('impersonating_tenant_id', company.id);
        localStorage.setItem('impersonating_company_name', company.name);
        window.location.assign('/dashboard');
      } catch (err: unknown) {
        alert('Erro: ' + (err instanceof Error ? err.message : ''));
      }
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (!user) router.push('/login');
      else if (!isPlatformAdmin(user.role)) router.push('/');
      else loadCompanies();
    }
  }, [authLoading, user, router, loadCompanies]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCompanyToEdit(null);
      setIsModalOpen(true);
      router.replace('/companies', { scroll: false });
    }
  }, [searchParams, router]);

  if (authLoading) {
    return (
      <div className="flex-1 w-full h-full flex items-center justify-center bg-[var(--color-background)]">
        <Loader2 className="w-8 h-8 text-[#06b6d4] animate-spin" />
      </div>
    );
  }

  const activeCount = companies.filter((c) => c.active === true).length;
  const totalProjects = companies.reduce((acc, c) => acc + (c.project_count || 0), 0);
  const totalUsers = companies.reduce((acc, c) => acc + (c.users?.[0]?.count || 0), 0);

  const searchFiltered = search.trim()
    ? companies.filter((c) => {
        const q = search.toLowerCase();
        return (
          (c.name || '').toLowerCase().includes(q) ||
          (c.slug || '').toLowerCase().includes(q)
        );
      })
    : companies;

  const isEmpty = companies.length === 0 && !dataLoading && !loadError;

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
          <p className="text-sm text-slate-500 mt-1">app/companies/page.tsx</p>
          <p className="text-[10px] font-mono text-emerald-400/90 mt-1">{BUILD_ID}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadCompanies()}
            className="h-9 px-3 rounded-lg text-xs text-slate-400 border border-white/10 hover:bg-white/5"
          >
            Recarregar
          </button>
          <button
            onClick={() => {
              setCompanyToEdit(null);
              setIsModalOpen(true);
            }}
            className="h-9 px-4 rounded-lg bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-semibold flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova empresa
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard title="Empresas" value={companies.length} icon={Database} accent="text-[var(--color-primary)]" />
        <StatCard title="Ativas" value={activeCount} icon={CheckCircle2} accent="text-emerald-400" />
        <StatCard title="Projetos" value={totalProjects} icon={MapIcon} accent="text-cyan-400" />
        <StatCard title="Usuários" value={totalUsers} icon={Users} accent="text-purple-400" />
      </div>

      {dataLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
        </div>
      ) : null}

      {loadError ? (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Erro ao carregar empresas: {loadError}
        </div>
      ) : null}

      {!dataLoading && !loadError && (
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por nome ou slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 bg-[var(--color-surface)]/80 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white"
            />
          </div>
        </div>
      )}

      {isEmpty ? (
        <MasterEmptyState
          title="Nenhuma empresa cadastrada"
          description="A query retornou zero registros. Verifique RLS ou permissões no Supabase."
        />
      ) : !dataLoading && !loadError && searchFiltered.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-12">Nenhum resultado para a busca.</p>
      ) : !dataLoading && !loadError ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 pb-8">
          {searchFiltered.map((c) => (
            <CompanyCard
              key={c.id}
              company={c}
              user={user}
              isMaster={!!c.is_master}
              onEdit={() => handleEdit(c)}
              onView={() => setCompanyToView(c)}
              onDelete={() => handleDelete(c)}
              onUpdateStatus={handleUpdateStatus}
              onImpersonate={() => handleImpersonate(c)}
            />
          ))}
        </div>
      ) : null}

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
          setCompanyToDelete(null);
          loadCompanies();
        }}
      />
      {companyToView && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/60">
          <div className="bg-[#151a23] border border-[#1f232b] rounded-2xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-white mb-4">{companyToView.name}</h2>
            <button
              type="button"
              onClick={() => setCompanyToView(null)}
              className="text-sm text-slate-400 hover:text-white"
            >
              Fechar
            </button>
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
