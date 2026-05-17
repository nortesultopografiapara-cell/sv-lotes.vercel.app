'use client';

import { Search, Plus, Filter, Phone, Mail, MoreHorizontal, Loader2, Home, X, Trash2 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function CustomersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', cpf_cnpj: '', phone: '', email: '', address: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user && user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN' && user.role !== 'ADMIN_TENANT') {
      router.replace('/dashboard');
    }

    let isMounted = true;
    async function fetchCustomers() {
      if (!user) return;
      try {
        let query = supabase.from('customers').select(`
            *,
            blocks (id, block_name, name, number, status, projects(name))
        `).order('created_at', { ascending: false });
        
        if (user.role !== 'SUPER_ADMIN' && user.tenant_id) {
           query = query.eq('tenant_id', user.tenant_id);
        }
        
        const { data, error } = await query;
        if (!isMounted) return;
        if (error) {
           console.error(error);
           setCustomers([]);
        } else {
           setCustomers(data || []);
        }
      } catch(err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (!authLoading) {
      fetchCustomers();
    }
    
    return () => {
      isMounted = false;
    };
  }, [user, authLoading]);

  const loadCustomers = async () => {
     if (!user) return;
     try {
       setLoading(true);
       let query = supabase.from('customers').select(`
           *,
           blocks (id, block_name, name, number, status, projects(name))
       `).order('created_at', { ascending: false });
       if (user.role !== 'SUPER_ADMIN' && user.tenant_id) {
          query = query.eq('tenant_id', user.tenant_id);
       }
       const { data, error } = await query;
       if (error) {
          setCustomers([]);
       } else {
          setCustomers(data || []);
       }
     } catch(err) {
       console.error(err);
     } finally {
       setLoading(false);
     }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const cpfCnpjValue = formData.cpf_cnpj?.trim() ? formData.cpf_cnpj.trim() : null;
      const nameUpper = formData.name?.trim().toUpperCase() || '';
      const emailUpper = formData.email?.trim().toUpperCase() || '';
      const addressUpper = formData.address?.trim().toUpperCase() || '';
      const phoneClean = formData.phone?.trim() || '';

      let customerId = null;

      if (cpfCnpjValue) {
          const { data: existingCustomer } = await supabase.from('customers').select('id').eq('document', cpfCnpjValue).maybeSingle();
          if (existingCustomer) {
              customerId = existingCustomer.id;
          }
      }

      if (!customerId) {
          const { error: custError } = await supabase.from('customers').insert([{
              name: nameUpper,
              ...(user?.tenant_id ? { tenant_id: user.tenant_id } : {}),
              cpf_cnpj: cpfCnpjValue,
              document: cpfCnpjValue, // Keep both in sync for the schema constraint
              phone: phoneClean,
              email: emailUpper,
              address: addressUpper
          }]);
          if (custError) throw custError;
      }

      setIsModalOpen(false);
      setFormData({ name: '', cpf_cnpj: '', phone: '', email: '', address: '' });
      await loadCustomers();
    } catch (err: any) {
      console.error(err);
      alert('Erro ao salvar cliente: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCustomer = async (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja excluir o cliente ${name || 'sem nome'}? Esta ação não poderá ser desfeita.`)) {
      try {
        const { error } = await supabase.from('customers').delete().eq('id', id);
        if (error) throw error;
        setCustomers(prev => prev.filter(c => c.id !== id));
      } catch (err: any) {
        console.error(err);
        alert('Erro ao excluir cliente: ' + err.message);
      }
    }
  };

  const filteredCustomers = customers.filter(c => 
     c.name?.toLowerCase().includes(search.toLowerCase()) || 
     c.email?.toLowerCase().includes(search.toLowerCase()) ||
     c.cpf_cnpj?.toLowerCase().includes(search.toLowerCase()) ||
     c.document?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col h-full fade-in relative">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Clientes</h1>
          <p className="text-sm font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
            Gestão de Clientes e Lotes
          </p>
        </div>
        <button 
           onClick={() => setIsModalOpen(true)}
           className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Novo Cliente
        </button>
      </header>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl flex-1 flex flex-col overflow-hidden shadow-sm">
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

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] z-10">
              <tr>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Cliente</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Contato</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Lotes (Quadra/Lote)</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-right">Data Inclusão</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                   <td colSpan={5} className="text-center p-8">
                      <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin mx-auto" />
                   </td>
                </tr>
              ) : filteredCustomers.length > 0 ? (
                filteredCustomers.map(c => {
                  return (
                    <CustomerRow 
                      key={c.id}
                      id={c.id}
                      name={c.name}
                      cpf_cnpj={c.cpf_cnpj}
                      email={c.email || '—'}
                      phone={c.phone || '—'}
                      blocks={(c.blocks || []).filter((b: any) => b.status && b.status !== 'Disponível')}
                      createdAt={new Date(c.created_at).toLocaleDateString()}
                      onDelete={() => handleDeleteCustomer(c.id, c.name)}
                    />
                  );
                })
              ) : (
                <tr>
                   <td colSpan={5} className="text-center p-8 text-[var(--color-text-muted)] text-sm">
                      Nenhum cliente cadastrado via nova tabela.
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface)]">
              <h3 className="font-bold text-lg text-white">Novo Cliente</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-[var(--color-text-muted)] hover:text-white rounded-full hover:bg-[var(--color-surface-bright)] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveCustomer} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Nome Completo *</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="Ex: João da Silva" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">CPF / CNPJ</label>
                  <input type="text" value={formData.cpf_cnpj} onChange={e => setFormData({...formData, cpf_cnpj: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="000.000.000-00" />
                </div>
                <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Telefone</label>
                   <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="(11) 99999-9999" />
                </div>
              </div>
              <div>
                 <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">E-mail</label>
                 <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="joao@exemplo.com" />
              </div>
              <div>
                 <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Endereço</label>
                 <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="Rua Exemplo, 123" />
              </div>
              <div className="pt-4 flex gap-3">
                 <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 bg-[var(--color-surface-bright)] text-white hover:bg-[var(--color-border)] font-semibold rounded-lg transition-colors text-sm">
                   Cancelar
                 </button>
                 <button type="submit" disabled={submitting} className={`flex-1 px-4 py-2 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] font-semibold rounded-lg transition-colors text-sm flex items-center justify-center gap-2`}>
                   {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerRow({ id, name, cpf_cnpj, email, phone, blocks, createdAt, onDelete }: any) {
  return (
    <tr className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-bright)] transition-colors group">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--color-background)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-primary)] font-bold">
            {name ? name.charAt(0) : '?'}
          </div>
          <div>
            <div className="font-bold text-sm text-white">{name}</div>
            <div className="text-xs text-[var(--color-text-muted)] font-mono mt-0.5">{cpf_cnpj || 'Sem Documento'}</div>
          </div>
        </div>
      </td>
      <td className="p-4">
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
        {blocks.length > 0 ? (
           <div className="flex flex-wrap gap-1">
             {blocks.map((b: any) => (
                <span key={b.id} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold tracking-wider border ${b.status === 'Vendido' ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/20' : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/20'}`}>
                   <Home className="w-3 h-3" />
                   {b.projects?.name} - {b.block_name || b.name} / {b.number}
                </span>
             ))}
           </div>
        ) : (
           <span className="text-xs text-[var(--color-text-muted)] italic">Nenhum lote selecionado</span>
        )}
      </td>
      <td className="p-4 text-right text-sm font-mono text-[var(--color-text-muted)]">
        {createdAt}
      </td>
      <td className="p-4 text-center">
        <button 
           onClick={onDelete}
           className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors inline-block"
           title={`Excluir ${name}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}
