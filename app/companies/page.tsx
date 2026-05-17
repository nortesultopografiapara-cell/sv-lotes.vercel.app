'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Building2, Search, Plus, CheckCircle2, 
  Map as MapIcon, Database, Users, Eye, Edit, Trash2, Loader2, AlertCircle, Key, Lock, Unlock, Calendar
} from 'lucide-react';
import NewCompanyModal from '@/components/companies/NewCompanyModal';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default function CompaniesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [companyToEdit, setCompanyToEdit] = useState<any>(null);
  
  const [companies, setCompanies] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const loadCompanies = useCallback(async () => {
    setDataLoading(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, slug, cnpj, email, phone, plan_type, created_at, active, next_payment_date')
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('SUPABASE_ERROR fetching companies:', error);
        throw error;
      }
      setCompanies(data || []);
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

  const handleToggleActive = async (company: any) => {
    const newStatus = !company.active;
    const actionText = newStatus ? 'liberar' : 'bloquear';
    if (confirm(`Tem certeza que deseja ${actionText} o acesso da empresa ${company.name}?`)) {
      try {
        const { error } = await supabase.from('companies').update({ active: newStatus }).eq('id', company.id);
        if (error) throw error;
        loadCompanies();
      } catch (err: any) {
        alert(`Erro ao ${actionText} empresa: ` + err.message);
      }
    }
  };

  const handleDelete = async (company: any) => {
    if (confirm(`Tem certeza que deseja excluir a empresa ${company.name}? Isso pode afetar dados vinculados.`)) {
      try {
        const { error } = await supabase.from('companies').delete().eq('id', company.id);
        if (error) throw error;
        loadCompanies();
      } catch (err: any) {
        alert('Erro ao excluir empresa: ' + err.message);
      }
    }
  };

  const handleResetPassword = async (email: string) => {
    if (!email) {
      alert('Esta empresa não possui um e-mail cadastrado para redefinir a senha.');
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login?type=recovery`,
      });
      if (error) throw error;
      alert(`Um link de recuperação de senha foi enviado para ${email}`);
    } catch (err: any) {
      alert('Erro ao enviar e-mail de recuperação: ' + err.message);
    }
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

  const activeCompanies = companies.filter(c => c.active !== false).length;
  const totalUsers = 0;
  const totalProjects = 0;

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
            onClick={() => loadCompanies()}
            className="bg-transparent hover:bg-white/5 border border-[var(--color-border)] text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors"
          >
            Recarregar
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
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold hidden md:table-cell">Status</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold hidden md:table-cell">Cadastro / Pgto</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-center hidden lg:table-cell">E-mail de Acesso</th>
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
                  onResetPassword={() => handleResetPassword(c.email)}
                  onToggleActive={() => handleToggleActive(c)}
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

function CompanyRow({ company, onEdit, onDelete, onResetPassword, onToggleActive, isMain }: any) {
  const isActive = company.active !== false;

  const getStatusBadge = () => {
    if (isActive) {
      return <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/20"><CheckCircle2 className="w-3 h-3 mr-1"/> Ativa</span>;
    } else {
      return <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/20"><Lock className="w-3 h-3 mr-1" /> Bloqueada</span>;
    }
  };

  return (
    <tr className={`border-b border-[var(--color-border)] hover:bg-[var(--color-surface-bright)] transition-colors group ${isMain ? 'bg-[#06b6d4]/5 hover:bg-[#06b6d4]/10' : ''}`}>
      <td className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm border ${isMain ? 'bg-[#06b6d4]/20 text-[#06b6d4] border-[#06b6d4]/30' : 'bg-[var(--color-background)] text-white border-[var(--color-border)]'}`}>
            {company.name.charAt(0)}
          </div>
          <div>
            <div className="font-bold text-sm text-white flex items-center gap-2">
              {company.name}
              {isMain && <span className="text-[9px] font-mono uppercase bg-[#06b6d4] text-white px-1.5 py-0.5 rounded-sm">Master</span>}
               <span className="text-[9px] font-mono uppercase bg-gray-600 text-white px-1.5 py-0.5 rounded-sm">{company.plan_type || 'basic'}</span>
            </div>
            <div className="text-[11px] font-mono text-[var(--color-text-muted)] mt-0.5">slug: {company.slug}</div>
          </div>
        </div>
      </td>
      <td className="p-4 hidden md:table-cell">
        {getStatusBadge()}
      </td>
      <td className="p-4 hidden md:table-cell">
        <div className="text-sm text-white mb-0.5">
          <Calendar className="w-3 h-3 inline-block mr-1 text-gray-400" />
          <span className="text-gray-400 mr-1 text-xs">C:</span>
          {company.created_at ? new Date(company.created_at).toLocaleDateString('pt-BR') : '—'}
        </div>
        <div className="text-sm text-white mt-1">
          <Calendar className="w-3 h-3 inline-block mr-1 text-purple-400" />
          <span className="text-purple-400 mr-1 text-xs">V:</span>
          {company.next_payment_date ? new Date(company.next_payment_date).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'Sem data'}
        </div>
      </td>
      <td className="p-4 text-center hidden lg:table-cell">
        <div className="text-sm text-gray-400 font-mono">
           {company.email ? company.email : 'Sem e-mail'}
        </div>
      </td>
      <td className="p-4 text-right">
        <div className="flex items-center justify-end gap-2">
          {company.email && (
            <button onClick={onResetPassword} className="p-2 text-[var(--color-text-muted)] hover:text-yellow-500 transition-colors rounded-lg hover:bg-yellow-500/10 tooltip-trigger" title={`Redefinir senha para ${company.email}`}>
              <Key className="w-4 h-4" />
            </button>
          )}
          {!isMain && (
            <button 
              onClick={onToggleActive} 
              className={`p-2 transition-colors rounded-lg flex items-center gap-1 text-[var(--color-text-muted)] 
                ${isActive ? 'hover:text-red-500 hover:bg-red-500/10' : 'hover:text-green-500 hover:bg-green-500/10'}`} 
              title={isActive ? 'Bloquear Acesso' : 'Liberar Acesso'}
            >
              {isActive ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>
          )}
          <button onClick={onEdit} className="p-2 text-[var(--color-text-muted)] hover:text-[#06b6d4] transition-colors rounded-lg hover:bg-[var(--color-surface-bright)] tooltip-trigger" title="Editar">
            <Edit className="w-4 h-4" />
          </button>
          {!isMain && (
            <button onClick={onDelete} className="p-2 text-[var(--color-text-muted)] hover:text-red-500 transition-colors rounded-lg hover:bg-red-500/10" title="Excluir">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
