'use client';

import { Users, Search, Plus, Filter, Phone, Mail, MoreHorizontal, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { applyTenantFilter, resolveRlsContext } from '@/lib/rls';
import { matchesCpfCnpj } from '@/lib/inputMasks';

export default function CRMPage() {
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadClients() {
      if (!user) return;
      try {
        const rlsCtx = await resolveRlsContext(user);
        if (!rlsCtx.isSuperAdmin && !rlsCtx.tenantId) {
          setClients([]);
          return;
        }
        let query = supabase.from('clients').select(`*, reservations(id), sales(id)`).order('created_at', { ascending: false });
        query = applyTenantFilter(query, rlsCtx, 'clients');
        
        const { data, error } = await query;
        if (error) throw error;
        
        setClients(data || []);
      } catch(err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      loadClients();
    }
  }, [user, authLoading]);

  const filteredClients = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.full_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      matchesCpfCnpj(search, c.cpf_cnpj)
    );
  });

  return (
    <div className="sv-page sv-page--scroll-y p-4 md:p-8 flex flex-col h-full">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">CRM Imobiliário</h1>
          <p className="text-sm font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
            Gestão de Leads e Clientes
          </p>
        </div>
        <button className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors">
          <Plus className="w-5 h-5" />
          Novo Lead
        </button>
      </header>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl flex-1 flex flex-col overflow-hidden shadow-sm min-w-0 max-w-full">
        <div className="p-4 border-b border-[var(--color-border)] flex gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-[var(--color-text-muted)]" />
            <input 
              type="text" 
              placeholder="Buscar por nome, email ou CPF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <button className="px-4 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-muted)] flex items-center gap-2 hover:text-white transition-colors">
            <Filter className="w-4 h-4" /> Filtros
          </button>
        </div>

        <div className="sv-table-scroll flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] z-10">
              <tr>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Cliente / Lead</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold hidden md:table-cell">Contato</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Status (Funil)</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold hidden lg:table-cell">Última Interação</th>
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
              ) : filteredClients.length > 0 ? (
                filteredClients.map(c => {
                  let status = 'NOVO LEAD';
                  if (c.reservations?.length > 0) status = 'RESERVOU';
                  if (c.sales?.length > 0) status = 'COMPROU';

                  return (
                    <ClientRow 
                      key={c.id}
                      name={c.full_name}
                      cpf={c.cpf_cnpj}
                      email={c.email || '—'}
                      phone={c.phone || '—'}
                      status={status}
                      lastActive={new Date(c.created_at).toLocaleDateString()}
                    />
                  );
                })
              ) : (
                <tr>
                   <td colSpan={5} className="text-center p-8 text-[var(--color-text-muted)] text-sm">
                      Nenhum cliente cadastrado.
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

function ClientRow({ name, cpf, email, phone, status, lastActive }: any) {
  const getStatusStyle = (s: string) => {
    switch(s) {
      case 'COMPROU': return 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/20';
      case 'RESERVOU': return 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/20';
      case 'MUITO QUENTE': return 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/20';
      case 'NOVO LEAD': return 'bg-[var(--color-surface-dim)] text-[var(--color-text-main)] border-[var(--color-border)]';
      default: return 'bg-[var(--color-surface-dim)] text-[var(--color-text-muted)] border-[var(--color-border)]';
    }
  };

  return (
    <tr className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-bright)] transition-colors group">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--color-background)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-primary)] font-bold">
            {name.charAt(0)}
          </div>
          <div>
            <div className="font-bold text-sm text-white">{name}</div>
            <div className="text-xs text-[var(--color-text-muted)] font-mono mt-0.5">{cpf || 'Sem CPF'}</div>
          </div>
        </div>
      </td>
      <td className="p-4 hidden md:table-cell">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <Phone className="w-3 h-3" /> {phone}
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <Mail className="w-3 h-3" /> {email}
          </div>
        </div>
      </td>
      <td className="p-4">
        <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${getStatusStyle(status)}`}>
          {status}
        </span>
      </td>
      <td className="p-4 hidden lg:table-cell text-sm font-mono text-[var(--color-text-muted)]">
        {lastActive}
      </td>
      <td className="p-4 text-right">
        <button className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </td>
    </tr>
  );
}
