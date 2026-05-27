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
  const [queryEmpty, setQueryEmpty] = useState(false);
  const [debugSession, setDebugSession] = useState<unknown>(null);
  const [debugAuthUser, setDebugAuthUser] = useState<unknown>(null);

  const loadCompanies = useCallback(async () => {
    setDataLoading(true);
    setLoadError(null);
    setQueryEmpty(false);

    console.log('[MASTER] user', user);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session ?? null;
      console.log('[MASTER] session', session);
      setDebugSession(session);

      const { data: authUser, error: authError } = await supabase.auth.getUser();
      console.log('[MASTER] auth user', authUser);
      if (authError) {
        console.log('[MASTER] auth user error', authError);
      }
      setDebugAuthUser(authUser);

      const { data, error } = await supabase.from('companies').select('*');

      console.log('[MASTER] companies raw', data);
      console.log('[MASTER] companies error', error);

      if (error) {
        setLoadError(error.message);
        setCompanies([]);
        setQueryEmpty(false);
        return;
      }

      const raw = data ?? [];
      if (raw.length === 0) {
        setQueryEmpty(true);
      }

      setCompanies(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      console.log('[MASTER] companies error', err);
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

  if (authLoading) {
    return (
      <div className="flex-1 w-full h-full flex items-center justify-center bg-[var(--color-background)]">
        <Loader2 className="w-8 h-8 text-[#06b6d4] animate-spin" />
      </div>
    );
  }

  const activeCompanies = companies.filter((c) => c.active === true).length;
  const totalUsers = companies.reduce((acc, c) => acc + (c.users?.[0]?.count || 0), 0);
  const totalProjects = companies.reduce((acc, c) => acc + (c.project_count || 0), 0);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col h-full bg-[var(--color-background)]">
      <header className="mb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex-1">
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

          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-950/30 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-300 mb-2">
              DEBUG MASTER (temporário)
            </p>
            {dataLoading ? (
              <p className="text-sm text-amber-200/80 mb-2">Carregando query...</p>
            ) : null}
            {loadError ? (
              <p className="text-sm text-red-300 font-mono mb-2">{loadError}</p>
            ) : null}
            {queryEmpty && !loadError ? (
              <p className="text-sm text-yellow-300 font-bold mb-2">QUERY RETORNOU ARRAY VAZIO</p>
            ) : null}
            <p className="text-[10px] text-slate-500 mb-1">session.user.id: {(debugSession as { user?: { id?: string } })?.user?.id ?? '—'}</p>
            <p className="text-[10px] text-slate-500 mb-2">
              auth.user.id: {(debugAuthUser as { user?: { id?: string } })?.user?.id ?? '—'}
            </p>
            <pre className="text-xs text-slate-300 overflow-auto max-h-[min(50vh,480px)] whitespace-pre-wrap break-words font-mono bg-black/30 rounded-lg p-3 border border-white/5">
              {JSON.stringify(companies, null, 2)}
            </pre>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => loadCompanies()}
            className="h-9 px-3 rounded-lg text-xs font-medium text-amber-200 border border-amber-500/30 hover:bg-amber-500/10"
          >
            Recarregar debug
          </button>
          <button
            onClick={async () => {
              if (
                confirm(
                  'Atenção: Esta ação irá limpar todos os usuários do AUTH que não possuem empresa, além de empresas de teste sem usuários. Deseja continuar?'
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
            placeholder="Buscar (debug: lista não filtrada)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled
            className="w-full h-10 bg-[var(--color-surface)]/80 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white/50 placeholder:text-slate-600 opacity-60"
          />
        </div>
      </div>

      {companies.length === 0 && !dataLoading ? (
        <div className="flex-1 flex items-center justify-center rounded-2xl border border-dashed border-white/10 py-16">
          <p className="text-sm text-slate-400">
            {queryEmpty ? 'QUERY RETORNOU ARRAY VAZIO' : loadError || 'Sem empresas no state'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 pb-8">
          {companies.map((c, idx) => (
            <CompanyCard
              key={c.id}
              company={{ ...c, project_count: c.project_count || 0, users: c.users || [{ count: 0 }] }}
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
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#151a23] border border-[#1f232b] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-[#1f232b]">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-400" /> Detalhes da Empresa
              </h2>
              <button
                onClick={() => setCompanyToView(null)}
                className="p-2 text-gray-400 hover:text-white transition-colors hover:bg-gray-800 rounded-lg"
              >
                <span className="sr-only">Fechar</span>✕
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <p className="text-xs font-mono text-gray-500 uppercase tracking-widest font-bold">Nome</p>
                <p className="text-sm font-semibold text-white">{companyToView.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-mono text-gray-500 uppercase tracking-widest font-bold">CNPJ</p>
                  <p className="text-sm font-semibold text-gray-300">{companyToView.cnpj || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-mono text-gray-500 uppercase tracking-widest font-bold">Telefone</p>
                  <p className="text-sm font-semibold text-gray-300">{companyToView.phone || '—'}</p>
                </div>
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
