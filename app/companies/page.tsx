'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Building2, Search, Plus, CheckCircle2, 
  Map as MapIcon, Database, Users, Eye, Edit, Trash2, Loader2, AlertCircle
} from 'lucide-react';
import NewCompanyModal from '@/components/companies/NewCompanyModal';
import CompanyDeleteModal from '@/components/companies/CompanyDeleteModal';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function CompaniesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [companyToEdit, setCompanyToEdit] = useState<any>(null);
  const [companyToDelete, setCompanyToDelete] = useState<any>(null);
  
  const [companies, setCompanies] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const loadCompanies = useCallback(async () => {
    setDataLoading(true);
    try {
      const [ { data: companiesData, error: companiesError }, { data: projectsData, error: projectsError } ] = await Promise.all([
         supabase
          .from('companies')
          .select(`
            *,
            users(count)
          `)
          .order('created_at', { ascending: false }),
         supabase
          .from('projects')
          .select('tenant_id')
      ]);
        
      if (companiesError) {
        console.error('SUPABASE_ERROR fetching companies:', companiesError);
        throw companiesError;
      }
      
      const counts: Record<string, number> = {};
      if (projectsData) {
         projectsData.forEach((p: any) => {
            if (p.tenant_id) {
               counts[p.tenant_id] = (counts[p.tenant_id] || 0) + 1;
            }
         });
      }

      const mergedData = (companiesData || []).map((c: any) => ({
         ...c,
         project_count: counts[c.id] || 0
      }));

      setCompanies(mergedData);
    } catch (err) {
      console.error('ERROR in loadCompanies:', err);
    } finally {
      setDataLoading(false);
    }
  }, []);

  const handleEdit = (company: any) => {
    setCompanyToEdit(company);
    setIsModalOpen(true);
  };

  const handleDelete = async (company: any) => {
    setCompanyToDelete(company);
  };

  // Verification if user is SUPER_ADMIN
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else if (user.role !== 'SUPER_ADMIN') {
        router.push('/');
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadCompanies();
      }
    }
  }, [authLoading, user, router, loadCompanies]);

  if (authLoading || (dataLoading && companies.length === 0)) {
     return (
       <div className="flex-1 w-full h-full flex items-center justify-center bg-[var(--color-background)]">
          <Loader2 className="w-8 h-8 text-[#06b6d4] animate-spin" />
       </div>
     );
  }

  const activeCompanies = companies.filter(c => c.active === true).length;
  const totalUsers = companies.reduce((acc, c) => acc + (c.users?.[0]?.count || 0), 0);
  const totalProjects = companies.reduce((acc, c) => acc + (c.project_count || 0), 0);

  const filteredCompanies = companies.filter(c => 
     c.name.toLowerCase().includes(search.toLowerCase()) || 
     c.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col h-full bg-[var(--color-background)]">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-[#06b6d4]" />
            Gerenciar Empresas
          </h1>
          <p className="text-sm font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
            Modo Super Administrador (Multi-Tenant)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={async () => {
              if (confirm('Atenção: Esta ação irá limpar todos os usuários do AUTH que não possuem empresa, além de empresas de teste sem usuários. Deseja continuar?')) {
                 try {
                   const res = await fetch('/api/companies/cleanup', { method: 'POST' });
                   if (!res.ok) throw new Error('Falha ao limpar cadastros');
                   alert('Cadastros de teste limpos com sucesso!');
                   loadCompanies();
                 } catch (e: any) {
                   alert(e.message);
                 }
              }
            }}
            className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white px-3 py-2.5 rounded-lg flex items-center justify-center gap-2 font-mono text-[10px] uppercase font-bold tracking-wider transition-colors border border-red-500/20 opacity-50 hover:opacity-100"
            title="Limpar Cadastros Incompletos / Órfãos"
          >
            <AlertCircle className="w-4 h-4" />
            Limpar Testes
          </button>
          <button 
            onClick={() => {
              setCompanyToEdit(null);
              setIsModalOpen(true);
            }}
            className="bg-[#06b6d4] hover:bg-[#0891b2] text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors shadow-[0_0_15px_rgba(6,182,212,0.3)]"
          >
            <Plus className="w-5 h-5" />
            Nova Empresa
          </button>
        </div>
      </header>

      {/* Multi-Tenant Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total de Empresas" value={companies.length} icon={Database} iconColor="text-[#06b6d4]" bg="bg-[#06b6d4]/10" border="border-[#06b6d4]/20" />
        <StatCard title="Empresas Ativas" value={activeCompanies} icon={CheckCircle2} iconColor="text-[var(--color-success)]" bg="bg-[var(--color-success)]/10" border="border-[var(--color-success)]/20" />
        <StatCard title="Total de Loteamentos" value={totalProjects} icon={MapIcon} iconColor="text-[var(--color-primary)]" bg="bg-[var(--color-primary)]/10" border="border-[var(--color-primary)]/20" />
        <StatCard title="Total de Usuários" value={totalUsers} icon={Users} iconColor="text-[var(--color-purple)]" bg="bg-[var(--color-purple)]/10" border="border-[var(--color-purple)]/20" />
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl flex-1 flex flex-col overflow-hidden shadow-lg">
        {/* Toolbar */}
        <div className="p-4 border-b border-[var(--color-border)] flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[250px] max-w-sm">
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-[var(--color-text-muted)]" />
            <input 
              type="text" 
              placeholder="Buscar por nome ou slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#06b6d4] transition-colors"
            />
          </div>
        </div>

        {/* List of Companies */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] z-10">
              <tr>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Empresa / Tenant</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold hidden md:table-cell">Contato</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-center">Status</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-center hidden lg:table-cell">Projetos</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-center hidden lg:table-cell">Usuários</th>
                <th className="p-4 w-24 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map((c, idx) => (
                <CompanyRow 
                  key={c.id}
                  company={c}
                  isMain={idx === 0} // just for highlight
                  onEdit={() => handleEdit(c)}
                  onDelete={() => handleDelete(c)}
                />
              ))}
              {filteredCompanies.length === 0 && (
                 <tr>
                    <td colSpan={6} className="text-center p-8 text-[var(--color-text-muted)] text-sm">
                       Nenhuma empresa encontrada.
                    </td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
         onClose={() => setCompanyToDelete(null)}
         onSuccess={() => { setCompanyToDelete(null); loadCompanies(); }}
      />
    </div>
  );
}

function StatCard({ title, value, icon: Icon, iconColor, bg, border }: any) {
  return (
    <div className={`bg-[var(--color-surface)] border ${border} p-5 rounded-2xl relative overflow-hidden shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider mb-2">{title}</p>
          <h3 className="text-3xl font-semibold text-white">{value}</h3>
        </div>
        <div className={`p-3 rounded-xl ${bg} ${iconColor}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

function CompanyRow({ company, onEdit, onDelete, isMain }: any) {
  const getStatusBadge = (status: string, legacyActive: boolean) => {
    let resolvedStatus = status;
    if (!resolvedStatus) {
       resolvedStatus = legacyActive ? 'Ativa' : 'Inativa';
    }

    switch(resolvedStatus) {
       case 'Ativa':
          return <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-500 border border-green-500/20 shadow-sm"><div className="w-1.5 h-1.5 mr-1.5 rounded-full bg-green-500"></div> Ativa</span>;
       case 'Teste':
          return <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 shadow-sm"><div className="w-1.5 h-1.5 mr-1.5 rounded-full bg-yellow-500"></div> Teste</span>;
       case 'Suspensa':
          return <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-500/10 text-orange-500 border border-orange-500/20 shadow-sm"><div className="w-1.5 h-1.5 mr-1.5 rounded-full bg-orange-500"></div> Suspensa</span>;
       case 'Bloqueada':
          return <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20 shadow-sm"><div className="w-1.5 h-1.5 mr-1.5 rounded-full bg-red-500"></div> Bloqueada</span>;
       case 'Inadimplente':
          return <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-500/10 text-gray-400 border border-gray-600 shadow-sm"><div className="w-1.5 h-1.5 mr-1.5 rounded-full bg-gray-500"></div> Inadimplente</span>;
       default:
          return <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-500/10 text-gray-500 border border-gray-500/20 shadow-sm">Inativa</span>;
    }
  };

  const handleImpersonate = async () => {
     if(confirm(`Tem certeza que deseja "Entrar como Empresa" na tenant: ${company.name}?`)) {
        // Para uma POC sem full session manipulation, podemos salvar um state ou cookie.
        // Simulando a acao de log do auditoria:
        alert("Modo Impersonate Ativado! (Simulação para POC)");
     }
  };

  return (
    <tr className={`border-b border-[#2d3340] hover:bg-[#1a1f29] transition-colors group ${isMain ? 'bg-blue-500/5 hover:bg-blue-500/10' : ''}`}>
      <td className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm border ${isMain ? 'bg-blue-500/20 text-blue-500 border-blue-500/30' : 'bg-[#0b1111] text-gray-300 border-[#2d3340]'}`}>
            {company.name.charAt(0)}
          </div>
          <div>
            <div className="font-bold text-[13px] text-gray-200 flex items-center gap-2">
              {company.name}
              {isMain && <span className="text-[9px] font-bold uppercase bg-blue-600 text-white px-1.5 py-0.5 rounded-sm">Master</span>}
            </div>
            <div className="text-[11px] text-gray-500 font-mono mt-0.5">ID: {company.slug}</div>
          </div>
        </div>
      </td>
      <td className="p-4 hidden md:table-cell">
        <div className="text-[12px] text-gray-300 mb-0.5 max-w-[200px] truncate">{company.cnpj ? `${company.cnpj}` : '—'}</div>
        <div className="text-[11px] text-gray-500 truncate">{company.email || '—'}</div>
      </td>
      <td className="p-4 text-center">
        {getStatusBadge(company.status_operacional, company.active)}
      </td>
      <td className="p-4 text-center hidden lg:table-cell">
        <div className="inline-flex items-center gap-1.5 text-xs font-mono text-gray-300 bg-[#0b1111] rounded-md px-2 py-1 border border-[#2d3340]">
           {company.project_count || 0} / {company.project_limit === -1 || company.project_limit === undefined ? '∞' : company.project_limit}
        </div>
      </td>
      <td className="p-4 text-center hidden lg:table-cell">
         <div className="inline-flex items-center gap-1.5 text-xs font-mono text-gray-300 bg-[#0b1111] rounded-md px-2 py-1 border border-[#2d3340]">
           {company.users?.[0]?.count || 0}
        </div>
      </td>
      <td className="p-4 text-right">
        <div className="flex items-center justify-end gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
          {!isMain && (
             <button onClick={handleImpersonate} className="flex items-center justify-center p-2 text-blue-400 hover:text-white transition-colors rounded-lg hover:bg-blue-500/20 tooltip-trigger" title="Entrar como Empresa">
               <Eye className="w-4 h-4" />
             </button>
          )}
          <button onClick={onEdit} className="flex items-center justify-center p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800 tooltip-trigger" title="Gerenciar Configurações">
            <Edit className="w-4 h-4" />
          </button>
          {!isMain && company.is_test_company === true && (
            <button onClick={onDelete} className="flex items-center justify-center p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-500/10" title="Excluir Teste Definitivamente">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
