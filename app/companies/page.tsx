'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Building2,
  Search,
  Plus,
  CheckCircle2,
  Database,
  Loader2,
} from 'lucide-react';
import NewCompanyModal from '@/components/companies/NewCompanyModal';
import CompanyDeleteModal from '@/components/companies/CompanyDeleteModal';
import { CompanyCard } from '@/components/companies/CompanyCard';
import { MasterEmptyState } from '@/components/master/MasterEmptyState';
import { writeImpersonationState } from '@/lib/impersonationStorage';
import { useAuth } from '@/hooks/useAuth';
import { isPlatformAdmin } from '@/lib/rls';
import {
  buildCompanyAdminCounts,
  buildCompanyBrokerCounts,
  buildCompanyProjectCounts,
  buildCompanyUserCounts,
} from '@/lib/masterCompanyUsers';
import { fetchCompanyLotCountsExact } from '@/lib/masterCompanyLotCounts';
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

  const [companies, setCompanies] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCompanies = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    setLoadError(null);

    try {
      const [{ data, error }, { data: usersData }, { data: projectsData }, { data: brokersData }] =
        await Promise.all([
        supabase.from('companies').select('*'),
        supabase.from('users').select('tenant_id, role'),
        supabase.from('projects').select('id, tenant_id, company_id'),
        supabase.from('brokers').select('tenant_id, company_id'),
      ]);

      console.log('MASTER_COMPANIES_RENDER', data);

      if (error) {
        setLoadError(error.message);
        setCompanies([]);
        return;
      }

      const userCounts = buildCompanyUserCounts(usersData || []);
      const adminCounts = buildCompanyAdminCounts(usersData || []);
      const projectCounts = buildCompanyProjectCounts(projectsData || []);
      const brokerCounts = buildCompanyBrokerCounts(brokersData || []);
      // Lotes: count exact via project_id (blocks.tenant_id/company_id costumam ser nulos).
      const lotCounts = await fetchCompanyLotCountsExact(
        supabase,
        projectsData || [],
      );

      setCompanies(
        (data ?? []).map((company) => ({
          ...company,
          user_count: userCounts[company.id] || 0,
          admin_count: adminCounts[company.id] || 0,
          project_count: projectCounts[company.id] || 0,
          broker_count: brokerCounts[company.id] || 0,
          lot_count: lotCounts[company.id] || 0,
        })),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
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
        writeImpersonationState({
          tenantId: company.id,
          companyName: company.name,
          masterId: user?.id || '',
          masterName: user?.name || user?.email || 'Super Admin',
        });
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

  const searchFiltered = search.trim()
    ? companies.filter((c) => {
        const q = search.toLowerCase();
        return (
          (c.name || '').toLowerCase().includes(q) ||
          (c.slug || '').toLowerCase().includes(q)
        );
      })
    : companies;

  const isEmpty = (companies ?? []).length === 0 && !dataLoading && !loadError;

  return (
    <div className="sv-page sv-page--scroll-y p-4 md:p-8 flex flex-col h-full bg-[var(--color-background)]">
      <p className="text-xs font-mono font-bold text-emerald-400 mb-4 tracking-wide">
        MASTER_COMPANIES_RENDER_OK
      </p>

      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            <Building2 className="w-7 h-7 text-[var(--color-primary)]" />
            Empresas
          </h1>
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

      <div className="grid grid-cols-2 gap-3 mb-8 max-w-md">
        <div className="rounded-xl border border-white/8 bg-[var(--color-surface)]/50 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Empresas</p>
          <p className="text-2xl font-bold text-white tabular-nums mt-1">{companies.length}</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-[var(--color-surface)]/50 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ativas</p>
          <p className="text-2xl font-bold text-white tabular-nums mt-1 flex items-center gap-2">
            {activeCount}
            <CheckCircle2 className="w-5 h-5 text-emerald-400 opacity-80" />
          </p>
        </div>
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
              onView={() => router.push(`/companies/${c.id}`)}
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
        onClose={() => {
          setIsModalOpen(false);
          setCompanyToEdit(null);
        }}
        onSuccess={(refreshed) => {
          void loadCompanies();
          if (refreshed?.id) {
            setCompanyToEdit(refreshed);
          }
        }}
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
    </div>
  );
}
