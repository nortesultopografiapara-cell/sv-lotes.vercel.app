'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Building2, Search, Plus, MoreHorizontal, CheckCircle2, 
  XOctagon, Power, Users, Map as MapIcon, Database, Eye
} from 'lucide-react';
import NewCompanyModal from '@/components/companies/NewCompanyModal';

export default function CompaniesPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Verification if user is SUPER_ADMIN
  useEffect(() => {
    const authStr = localStorage.getItem('sv_lotes_auth');
    if (authStr) {
      try {
        const user = JSON.parse(authStr);
        if (user.role !== 'SUPER_ADMIN') {
          router.push('/'); // Redirect away if not authorized
        } else {
          setTimeout(() => setLoading(false), 0);
        }
      } catch {
        router.push('/');
      }
    } else {
      router.push('/login');
    }
  }, [router]);

  if (loading) return null; // Avoid flicker

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
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#06b6d4] hover:bg-[#0891b2] text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors shadow-[0_0_15px_rgba(6,182,212,0.3)]"
        >
          <Plus className="w-5 h-5" />
          Nova Empresa
        </button>
      </header>

      {/* Multi-Tenant Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total de Empresas" value="12" icon={Database} iconColor="text-[#06b6d4]" bg="bg-[#06b6d4]/10" border="border-[#06b6d4]/20" />
        <StatCard title="Empresas Ativas" value="10" icon={CheckCircle2} iconColor="text-[var(--color-success)]" bg="bg-[var(--color-success)]/10" border="border-[var(--color-success)]/20" />
        <StatCard title="Empresas Online" value="4" icon={Power} iconColor="text-[var(--color-primary)]" bg="bg-[var(--color-primary)]/10" border="border-[var(--color-primary)]/20" />
        <StatCard title="Total de Usuários" value="84" icon={Users} iconColor="text-[var(--color-purple)]" bg="bg-[var(--color-purple)]/10" border="border-[var(--color-purple)]/20" />
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
          <select className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-sm text-[var(--color-text-muted)] focus:outline-none focus:border-[#06b6d4]">
            <option>Todas as Empresas</option>
            <option>Apenas Ativas</option>
            <option>Suspensas</option>
          </select>
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
              {/* Mock Data */}
              <CompanyRow 
                name="Norte Sul Topografia"
                slug="nortesul"
                email="contato@nortesultopografia.com.br"
                phone="(91) 99999-0000"
                status="ACTIVE"
                projects={5}
                users={12}
                isMain
              />
              <CompanyRow 
                name="Lotes Prime Empreendimentos"
                slug="lotesprime"
                email="admin@lotesprime.com.br"
                phone="(11) 98888-1111"
                status="ACTIVE"
                projects={2}
                users={8}
              />
              <CompanyRow 
                name="Imobiliária Horizonte"
                slug="horizonte"
                email="gerencia@horizonte.com.br"
                phone="(21) 97777-2222"
                status="ACTIVE"
                projects={8}
                users={25}
              />
              <CompanyRow 
                name="Global Urbanismo"
                slug="globalurb"
                email="contato@globalurb.com.br"
                phone="(41) 96666-3333"
                status="INACTIVE"
                projects={0}
                users={1}
              />
              <CompanyRow 
                name="Invest Lotes"
                slug="investlotes"
                email="suporte@investlotes.com"
                phone="(31) 95555-4444"
                status="SUSPENDED"
                projects={1}
                users={3}
              />
            </tbody>
          </table>
        </div>
      </div>

      <NewCompanyModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
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

function CompanyRow({ name, slug, email, phone, status, projects, users, isMain }: any) {
  const getStatusBadge = (s: string) => {
    switch(s) {
      case 'ACTIVE': return <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/20"><CheckCircle2 className="w-3 h-3 mr-1"/> Ativa</span>;
      case 'INACTIVE': return <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/20">Inativa</span>;
      case 'SUSPENDED': return <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/20"><XOctagon className="w-3 h-3 mr-1"/> Suspensa</span>;
    }
  };

  return (
    <tr className={`border-b border-[var(--color-border)] hover:bg-[var(--color-surface-bright)] transition-colors group ${isMain ? 'bg-[#06b6d4]/5 hover:bg-[#06b6d4]/10' : ''}`}>
      <td className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm border ${isMain ? 'bg-[#06b6d4]/20 text-[#06b6d4] border-[#06b6d4]/30' : 'bg-[var(--color-background)] text-white border-[var(--color-border)]'}`}>
            {name.charAt(0)}
          </div>
          <div>
            <div className="font-bold text-sm text-white flex items-center gap-2">
              {name}
              {isMain && <span className="text-[9px] font-mono uppercase bg-[#06b6d4] text-white px-1.5 py-0.5 rounded-sm">Master</span>}
            </div>
            <div className="text-[11px] font-mono text-[var(--color-text-muted)] mt-0.5">slug: {slug}</div>
          </div>
        </div>
      </td>
      <td className="p-4 hidden md:table-cell">
        <div className="text-sm text-white mb-0.5 max-w-[200px] truncate">{email}</div>
        <div className="text-[11px] font-mono text-[var(--color-text-muted)]">{phone}</div>
      </td>
      <td className="p-4 text-center">
        {getStatusBadge(status)}
      </td>
      <td className="p-4 text-center hidden lg:table-cell">
        <div className="inline-flex items-center gap-1.5 text-sm font-mono text-white bg-[var(--color-background)] rounded px-2 py-1 border border-[var(--color-border)]">
          <MapIcon className="w-3.5 h-3.5 text-[var(--color-info)]" /> {projects}
        </div>
      </td>
      <td className="p-4 text-center hidden lg:table-cell">
         <div className="inline-flex items-center gap-1.5 text-sm font-mono text-white bg-[var(--color-background)] rounded px-2 py-1 border border-[var(--color-border)]">
          <Users className="w-3.5 h-3.5 text-[var(--color-purple)]" /> {users}
        </div>
      </td>
      <td className="p-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <button className="p-2 text-[var(--color-text-muted)] hover:text-[#06b6d4] transition-colors rounded-lg hover:bg-[#06b6d4]/10 tooltip-trigger" title="Acessar Dashboard da Empresa">
            <Eye className="w-4 h-4" />
          </button>
          <button className="p-2 text-[var(--color-text-muted)] hover:text-white transition-colors rounded-lg hover:bg-[var(--color-surface-bright)]">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
