'use client';

import { Search, Plus, Filter, Phone, Mail, MoreHorizontal, Loader2, Home, X, Edit, Trash2, Eye, Lock } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { applyTenantFilter, resolveRlsContext, withTenantFields } from '@/lib/rls';

export default function CustomersPage() {
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [formData, setFormData] = useState<any>({ name: '', cpf_cnpj: '', rg: '', phone: '', email: '', profession: '', marital_status: '', address: '', neighborhood: '', city: '', state: '', cep: '', status: 'ativo' });
  const [submitting, setSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteModalCustomer, setDeleteModalCustomer] = useState<any>(null);
  const [deleteModalStats, setDeleteModalStats] = useState<any>({});
  const [deleteModalPassword, setDeleteModalPassword] = useState('');
  const [deleteModalConfirmText, setDeleteModalConfirmText] = useState('');
  const [isDeletingWithLinks, setIsDeletingWithLinks] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchCustomers() {
      if (!user) return;
      try {
        const rlsCtx = await resolveRlsContext(user);
        if (!rlsCtx.isSuperAdmin && !rlsCtx.tenantId) {
          setCustomers([]);
          return;
        }
        let query = supabase.from('customers').select(`
            *,
            blocks (id, block_name, name, number, status, projects(name))
        `).order('created_at', { ascending: false });
        query = applyTenantFilter(query, rlsCtx, 'customers');
        
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
       const rlsCtx = await resolveRlsContext(user);
       if (!rlsCtx.isSuperAdmin && !rlsCtx.tenantId) {
         setCustomers([]);
         return;
       }
       let query = supabase.from('customers').select(`
           *,
           blocks (id, block_name, name, number, status, projects(name))
       `).order('created_at', { ascending: false });
       query = applyTenantFilter(query, rlsCtx, 'customers');
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

      const rlsCtx = await resolveRlsContext(user);
      const tenantId = rlsCtx.tenantId;
      let customerId = formData.id || null;

      if (!customerId && cpfCnpjValue) {
          let checkQuery = supabase.from('customers').select('id').eq('document', cpfCnpjValue);
          checkQuery = applyTenantFilter(checkQuery, rlsCtx, 'customers');
          const { data: existingCustomer } = await checkQuery.maybeSingle();
          if (existingCustomer) {
              customerId = existingCustomer.id;
          }
      }

      let payload: Record<string, unknown> = {
        name: nameUpper,
        cpf_cnpj: cpfCnpjValue,
        document: cpfCnpjValue,
        phone: phoneClean,
        email: emailUpper,
        address: addressUpper,
        rg: formData.rg?.trim() || null,
        profession: formData.profession?.trim().toUpperCase() || null,
        marital_status: formData.marital_status?.trim().toUpperCase() || null,
        neighborhood: formData.neighborhood?.trim().toUpperCase() || null,
        city: formData.city?.trim().toUpperCase() || null,
        state: formData.state?.trim().toUpperCase() || null,
        cep: formData.cep?.trim() || null,
        status: formData.status || 'ativo',
      };
      if (!customerId && tenantId) {
        payload = withTenantFields(payload, tenantId, 'customers');
      }

      if (customerId) {
          let updateQuery = supabase.from('customers').update(payload).eq('id', customerId);
          updateQuery = applyTenantFilter(updateQuery, rlsCtx, 'customers');
          const { error: custError } = await updateQuery;
          if (custError) throw custError;
      } else {
          const { error: custError } = await supabase.from('customers').insert([payload]);
          if (custError) throw custError;
      }

      setIsModalOpen(false);
      setFormData({ name: '', cpf_cnpj: '', rg: '', phone: '', email: '', profession: '', marital_status: '', address: '', neighborhood: '', city: '', state: '', cep: '', status: 'ativo' });
      await loadCustomers();
      alert('Cliente salvo com sucesso');
    } catch (err: any) {
      console.error(err);
      alert('Erro ao salvar cliente: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClick = (customer: any) => {
    setFormData({
      id: customer.id,
      name: customer.name || '',
      cpf_cnpj: customer.cpf_cnpj || customer.document || '',
      phone: customer.phone || '',
      email: customer.email || '',
      rg: customer.rg || '',
      profession: customer.profession || '',
      marital_status: customer.marital_status || '',
      address: customer.address || '',
      neighborhood: customer.neighborhood || '',
      city: customer.city || '',
      state: customer.state || '',
      cep: customer.cep || '',
      status: customer.status || 'ativo'
    });
    setIsModalOpen(true);
  };

  const handleViewClick = (customer: any) => {
    setSelectedCustomer(customer);
    setIsViewModalOpen(true);
  };

  const handleDeleteClick = async (customer: any) => {
    try {
      setIsDeleting(true);
      
      const hasLots = customer.blocks && customer.blocks.filter((b: any) => b.status && b.status !== 'Disponível').length > 0;

      if (hasLots) {
        setDeleteModalCustomer(customer);
        const [{ count: contractCount }, { count: receiptCount }, { count: saleCount }] = await Promise.all([
          supabase.from('contracts').select('*', { count: 'exact', head: true }).eq('customer_id', customer.id),
          supabase.from('finance_receipts').select('*', { count: 'exact', head: true }).eq('customer_id', customer.id),
          supabase.from('sales').select('*', { count: 'exact', head: true }).eq('customer_id', customer.id)
        ]);
        setDeleteModalStats({
          contractCount: contractCount || 0,
          receiptCount: receiptCount || 0,
          saleCount: saleCount || 0
        });
        return;
      }

      if (confirm('Tem certeza que deseja apagar este cliente definitivamente? Ação irreversível.')) {
        const rlsCtx = await resolveRlsContext(user!);
        let deleteQuery = supabase.from('customers').delete().eq('id', customer.id);
        deleteQuery = applyTenantFilter(deleteQuery, rlsCtx, 'customers');
        const { error } = await deleteQuery;
        if (error) throw error;
        await loadCustomers();
      }
    } catch (err: any) {
      console.error(err);
      alert('Erro ao excluir cliente: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmDeleteLinkedCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteModalConfirmText !== 'EXCLUIR CLIENTE') {
       alert('Digite "EXCLUIR CLIENTE" exatamente como solicitado para confirmar.');
       return;
    }
    setIsDeletingWithLinks(true);
    try {
       const userEmail = user?.email;
       if (!userEmail) throw new Error("Email do administrador não encontrado.");
       
       const { error: signInError } = await supabase.auth.signInWithPassword({
          email: userEmail,
          password: deleteModalPassword
       });
       
       if (signInError) {
          throw new Error("Senha de administrador inválida.");
       }

       const cid = deleteModalCustomer.id;
       
       await Promise.all([
         supabase.from('blocks').update({ customer_id: null }).eq('customer_id', cid),
         supabase.from('contracts').update({ customer_id: null }).eq('customer_id', cid),
         supabase.from('finance_receipts').update({ customer_id: null }).eq('customer_id', cid),
         supabase.from('sales').update({ customer_id: null }).eq('customer_id', cid)
       ]);

       const rlsCtx = await resolveRlsContext(user!);
       let deleteQuery = supabase.from('customers').delete().eq('id', cid);
       deleteQuery = applyTenantFilter(deleteQuery, rlsCtx, 'customers');
       const { error: delError } = await deleteQuery;
       if (delError) throw delError;

       setDeleteModalCustomer(null);
       setDeleteModalPassword('');
       setDeleteModalConfirmText('');
       await loadCustomers();

    } catch (err: any) {
       console.error(err);
       alert('Erro ao processar exclusão protegida: ' + err.message);
    } finally {
       setIsDeletingWithLinks(false);
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
                      name={c.name}
                      cpf_cnpj={c.cpf_cnpj || c.document || '—'}
                      email={c.email || '—'}
                      phone={c.phone || '—'}
                      blocks={(c.blocks || []).filter((b: any) => b.status && b.status !== 'Disponível')}
                      createdAt={new Date(c.created_at).toLocaleDateString()}
                      status={c.status}
                      onEdit={() => handleEditClick(c)}
                      onView={() => handleViewClick(c)}
                      onDelete={() => handleDeleteClick(c)}
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
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface)]">
              <h3 className="font-bold text-lg text-white">{formData.id ? 'Editar Cliente' : 'Novo Cliente'}</h3>
              <button disabled={submitting} onClick={() => { setIsModalOpen(false); setFormData({ name: '', cpf_cnpj: '', rg: '', phone: '', email: '', profession: '', marital_status: '', address: '', neighborhood: '', city: '', state: '', cep: '', status: 'ativo' }); }} className="p-2 text-[var(--color-text-muted)] hover:text-white rounded-full hover:bg-[var(--color-surface-bright)] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveCustomer} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Nome Completo *</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="Ex: João da Silva" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">CPF / CNPJ</label>
                  <input type="text" value={formData.cpf_cnpj} onChange={e => setFormData({...formData, cpf_cnpj: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="000.000.000-00" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">RG</label>
                  <input type="text" value={formData.rg} onChange={e => setFormData({...formData, rg: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="0000000" />
                </div>
                <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Telefone</label>
                   <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="(11) 99999-9999" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">E-mail</label>
                   <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="joao@exemplo.com" />
                </div>
                <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Profissão</label>
                   <input type="text" value={formData.profession} onChange={e => setFormData({...formData, profession: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="Empresário" />
                </div>
                <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Estado Civil</label>
                   <select value={formData.marital_status} onChange={e => setFormData({...formData, marital_status: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]">
                       <option value="">Selecione...</option>
                       <option value="SOLTEIRO(A)">Solteiro(a)</option>
                       <option value="CASADO(A)">Casado(a)</option>
                       <option value="DIVORCIADO(A)">Divorciado(a)</option>
                       <option value="VIÚVO(A)">Viúvo(a)</option>
                       <option value="ESTÁVEL">União Estável</option>
                   </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Endereço (Rua, Número)</label>
                   <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="Rua Exemplo, 123" />
                </div>
                <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Bairro</label>
                   <input type="text" value={formData.neighborhood} onChange={e => setFormData({...formData, neighborhood: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="Centro" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Cidade</label>
                   <input type="text" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="São Paulo" />
                </div>
                <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Estado (UF)</label>
                   <input type="text" maxLength={2} value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="SP" />
                </div>
                <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">CEP</label>
                   <input type="text" value={formData.cep} onChange={e => setFormData({...formData, cep: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" placeholder="00000-000" />
                </div>
              </div>
              {formData.id && (
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Status</label>
                    <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]">
                        <option value="ativo">Ativo</option>
                        <option value="inativo">Inativo</option>
                    </select>
                  </div>
              )}
              <div className="pt-4 flex gap-3">
                 <button type="button" disabled={submitting} onClick={() => { setIsModalOpen(false); setFormData({ name: '', cpf_cnpj: '', rg: '', phone: '', email: '', profession: '', marital_status: '', address: '', neighborhood: '', city: '', state: '', cep: '', status: 'ativo' }); }} className="flex-1 px-4 py-2 bg-[var(--color-surface-bright)] text-white hover:bg-[var(--color-border)] font-semibold rounded-lg transition-colors text-sm">
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

      {isViewModalOpen && selectedCustomer && (
         <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
           <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
             <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface)]">
               <h3 className="font-bold text-lg text-white">Visualizar Cliente</h3>
               <button onClick={() => setIsViewModalOpen(false)} className="p-2 text-[var(--color-text-muted)] hover:text-white rounded-full hover:bg-[var(--color-surface-bright)] transition-colors">
                 <X className="w-5 h-5" />
               </button>
             </div>
             <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4 text-sm">
                   <div><span className="text-[var(--color-text-muted)] block text-xs">Nome</span><span className="text-white">{selectedCustomer.name || '-'}</span></div>
                   <div><span className="text-[var(--color-text-muted)] block text-xs">Documento (CPF/CNPJ)</span><span className="text-white font-mono">{selectedCustomer.cpf_cnpj || selectedCustomer.document || '-'}</span></div>
                   <div><span className="text-[var(--color-text-muted)] block text-xs">RG</span><span className="text-white font-mono">{selectedCustomer.rg || '-'}</span></div>
                   <div><span className="text-[var(--color-text-muted)] block text-xs">Telefone</span><span className="text-white font-mono">{selectedCustomer.phone || '-'}</span></div>
                   <div><span className="text-[var(--color-text-muted)] block text-xs">E-mail</span><span className="text-white">{selectedCustomer.email || '-'}</span></div>
                   <div><span className="text-[var(--color-text-muted)] block text-xs">Profissão</span><span className="text-white">{selectedCustomer.profession || '-'}</span></div>
                   <div><span className="text-[var(--color-text-muted)] block text-xs">Estado Civil</span><span className="text-white">{selectedCustomer.marital_status || '-'}</span></div>
                   <div><span className="text-[var(--color-text-muted)] block text-xs">Status</span>
                     <span className={`px-2 py-0.5 rounded text-xs font-bold ${selectedCustomer.status === 'inativo' ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' : 'bg-[#2ad271]/10 text-[#2ad271]'}`}>
                       {selectedCustomer.status?.toUpperCase() || 'ATIVO'}
                     </span>
                   </div>
                   <div className="col-span-2"><span className="text-[var(--color-text-muted)] block text-xs">Endereço</span><span className="text-white">{[selectedCustomer.address, selectedCustomer.neighborhood, selectedCustomer.city, selectedCustomer.state, selectedCustomer.cep].filter(Boolean).join(', ') || '-'}</span></div>
                </div>
             </div>
           </div>
         </div>
      )}
      {deleteModalCustomer && (
         <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
           <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
             <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between bg-red-500/10">
               <div className="flex items-center gap-2">
                 <Lock className="w-5 h-5 text-red-500" />
                 <h3 className="font-bold text-lg text-red-500">Atenção: Exclusão Protegida</h3>
               </div>
               <button onClick={() => { setDeleteModalCustomer(null); setDeleteModalPassword(''); setDeleteModalConfirmText(''); }} className="p-2 text-[var(--color-text-muted)] hover:text-white rounded-full hover:bg-[var(--color-surface-bright)] transition-colors">
                 <X className="w-5 h-5" />
               </button>
             </div>
             <form onSubmit={confirmDeleteLinkedCustomer} className="p-5 space-y-4">
               
               <div className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-4 space-y-2 text-sm text-[var(--color-text-muted)]">
                 <p className="text-white font-medium mb-2">Este cliente possui vínculos importantes:</p>
                 <div className="grid grid-cols-2 gap-2">
                    <div><span className="font-medium text-gray-400">Cliente:</span> <br/><span className="text-white truncate block" title={deleteModalCustomer.name}>{deleteModalCustomer.name}</span></div>
                    <div><span className="font-medium text-gray-400">CPF/CNPJ:</span> <br/><span className="text-white">{deleteModalCustomer.cpf_cnpj || deleteModalCustomer.document || '-'}</span></div>
                    <div><span className="font-medium text-gray-400">Lotes vinculados:</span> <br/><span className="text-white">{deleteModalCustomer.blocks?.length || 0}</span></div>
                    <div><span className="font-medium text-gray-400">Contratos:</span> <br/><span className="text-white">{deleteModalStats.contractCount || 0}</span></div>
                    <div className="col-span-2"><span className="font-medium text-gray-400">Registros financeiros:</span> <span className="text-white">{deleteModalStats.receiptCount || 0}</span></div>
                 </div>
                 <p className="mt-4 pt-4 border-t border-[var(--color-border)] text-xs text-amber-500 font-medium">
                   A exclusão irá desvincular este cliente de todos os lotes, contratos e compras acima informadas. Os registros não serão apagados, constarão sem cliente atrelado.
                 </p>
               </div>

               <div>
                 <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Senha do Administrador *</label>
                 <input required type="password" value={deleteModalPassword} onChange={e => setDeleteModalPassword(e.target.value)} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-red-500" placeholder="Digite sua senha" />
               </div>

               <div>
                 <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Para confirmar, digite EXCLUIR CLIENTE abaixo *</label>
                 <input required type="text" value={deleteModalConfirmText} onChange={e => setDeleteModalConfirmText(e.target.value)} className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-red-500" placeholder="EXCLUIR CLIENTE" />
               </div>

               <div className="pt-4 flex gap-3">
                  <button type="button" disabled={isDeletingWithLinks} onClick={() => { setDeleteModalCustomer(null); setDeleteModalPassword(''); setDeleteModalConfirmText(''); }} className="flex-1 px-4 py-2 bg-[var(--color-surface-bright)] text-white hover:bg-[var(--color-border)] font-semibold rounded-lg transition-colors text-sm">
                    Cancelar
                  </button>
                  <button type="submit" disabled={isDeletingWithLinks || deleteModalConfirmText !== 'EXCLUIR CLIENTE' || !deleteModalPassword} className={`flex-1 px-4 py-2 bg-red-600 text-white hover:bg-red-700 font-semibold rounded-lg transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50`}>
                    {isDeletingWithLinks ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar Exclusão'}
                  </button>
               </div>
             </form>
           </div>
         </div>
      )}
    </div>
  );
}

function CustomerRow({ name, cpf_cnpj, email, phone, blocks, createdAt, status, onEdit, onView, onDelete }: any) {
  const hasLots = blocks && blocks.filter((b: any) => b.status && b.status !== 'Disponível').length > 0;

  return (
    <tr className={`border-b border-[var(--color-border)] hover:bg-[var(--color-surface-bright)] transition-colors group ${status === 'inativo' ? 'opacity-60 grayscale' : ''}`}>
      <td className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--color-background)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-primary)] font-bold relative">
            {name ? name.charAt(0) : '?'}
            {status === 'inativo' && (
              <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[var(--color-surface)]"></span>
            )}
          </div>
          <div>
            <div className="font-bold text-sm text-white flex items-center gap-2">
               {name}
               {status === 'inativo' && <span className="bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Inativo</span>}
            </div>
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
         <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onView} title="Visualizar" className="p-1.5 text-cyan-500 hover:bg-cyan-500/10 rounded transition-colors">
               <Eye className="w-4 h-4" />
            </button>
            <button onClick={onEdit} title="Editar" className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded transition-colors">
               <Edit className="w-4 h-4" />
            </button>
            <button 
              onClick={onDelete} 
              title={hasLots ? "Cliente possui vínculos. Exclusão requer senha." : "Excluir"} 
              className={`p-1.5 rounded transition-colors ${hasLots ? 'text-red-400 hover:bg-red-400/10 relative cursor-pointer' : 'text-red-500 hover:bg-red-500/10'}`}
            >
               {hasLots ? (
                 <>
                   <Trash2 className="w-4 h-4" />
                   <div className="absolute -bottom-1 -right-1 bg-[var(--color-surface)] rounded-full p-[1px]">
                     <Lock className="w-2.5 h-2.5 text-red-500 fill-current" />
                   </div>
                 </>
               ) : (
                 <Trash2 className="w-4 h-4" />
               )}
            </button>
         </div>
      </td>
    </tr>
  );
}