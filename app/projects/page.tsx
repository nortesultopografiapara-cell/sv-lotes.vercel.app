'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, FolderOpen, MoreVertical, Edit2, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProjects() {
      if (!user) return;
      try {
        let query = supabase.from('projects').select('*, lots(status, geom)').order('created_at', { ascending: false });
        if (user.role !== 'SUPER_ADMIN' && user.tenant_id) {
           query = query.eq('tenant_id', user.tenant_id);
        }
        const { data, error } = await query;
        if (error) throw error;
        setProjects(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    
    if (!authLoading) {
      loadProjects();
    }
  }, [user, authLoading]);

  const filteredProjects = projects.filter(p => 
     p.name.toLowerCase().includes(search.toLowerCase()) || 
     (p.location && p.location.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col h-full">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Gestão de Projetos</h1>
          <p className="text-sm font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
            Loteamentos e Geometrias
          </p>
        </div>
        <button className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors">
          <Plus className="w-5 h-5" />
          Novo Projeto
        </button>
      </header>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl flex-1 flex flex-col overflow-hidden shadow-sm">
        {/* Toolbar */}
        <div className="p-4 border-b border-[var(--color-border)] flex gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-[var(--color-text-muted)]" />
            <input 
              type="text" 
              placeholder="Buscar loteamentos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <select className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]">
            <option>Todos os Status</option>
            <option>Ativos</option>
            <option>Em Planejamento</option>
          </select>
        </div>

        {/* Data Grid / List */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] z-10">
              <tr>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Projeto</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Localização</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-center">Progresso</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Status GIS</th>
                <th className="p-4 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                 <tr>
                    <td colSpan={5} className="text-center p-8">
                       <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin mx-auto" />
                    </td>
                 </tr>
              ) : filteredProjects.length > 0 ? (
                 filteredProjects.map(p => {
                    const total = p.lots?.length || 0;
                    const sold = p.lots?.filter((l: any) => l.status === 'SOLD').length || 0;
                    const hasGis = p.lots?.some((l: any) => l.geom != null) || false;
                    
                    return (
                       <ProjectRow 
                          key={p.id}
                          name={p.name}
                          location={p.location || 'Não especificada'}
                          sold={sold}
                          total={total}
                          hasGis={hasGis}
                       />
                    );
                 })
              ) : (
                 <tr>
                    <td colSpan={5} className="text-center p-8 text-[var(--color-text-muted)] text-sm">
                       Nenhum projeto encontrado.
                    </td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProjectRow({ name, location, sold, total, hasGis }: any) {
  const pct = total > 0 ? (sold / total) * 100 : 0;
  
  return (
    <tr className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-bright)] transition-colors group">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-primary)]">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-sm text-white">{name}</div>
            <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{total} lotes</div>
          </div>
        </div>
      </td>
      <td className="p-4 text-sm font-mono text-[var(--color-text-muted)]">{location}</td>
      <td className="p-4">
        <div className="flex items-center gap-3 justify-center">
          <div className="text-xs font-mono text-[var(--color-text-muted)] w-10 text-right">{pct.toFixed(0)}%</div>
          <div className="w-24 h-1.5 bg-[var(--color-background)] rounded-full overflow-hidden">
            <div className="h-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </td>
      <td className="p-4">
        {hasGis ? (
          <span className="inline-flex items-center px-2 py-1 rounded bg-[var(--color-success)]/10 text-[var(--color-success)] text-[10px] font-mono font-bold uppercase tracking-wider border border-[var(--color-success)]/20">
            Sincronizado
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-1 rounded bg-[var(--color-warning)]/10 text-[var(--color-warning)] text-[10px] font-mono font-bold uppercase tracking-wider border border-[var(--color-warning)]/20">
            Falta KML
          </span>
        )}
      </td>
      <td className="p-4 text-right">
        <button className="p-2 text-[var(--color-text-muted)] hover:text-white transition-colors">
          <MoreVertical className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}
