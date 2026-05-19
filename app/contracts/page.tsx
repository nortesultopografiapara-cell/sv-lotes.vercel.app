'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { FileText, Loader2, Search } from 'lucide-react';
import { ContractGenerator } from '@/components/contracts/ContractGenerator';

export default function ContractsPage() {
  const { user, loading: authLoading } = useSessionGuard();
   const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedContract, setSelectedContract] = useState<any>(null);

  useEffect(() => {
    async function loadContracts() {
       if (!user?.tenant_id && user?.role !== 'SUPER_ADMIN') {
          setLoading(false);
          return;
       }

       let query = supabase.from('contracts')
           .select('*, customers(*), sales(*, clients(*)), blocks(number, block_name, name, projects(name, city, state))')
           .order('created_at', { ascending: false });
           
       if (user?.role !== 'SUPER_ADMIN' && user?.tenant_id) {
           query = query.eq('tenant_id', user.tenant_id);
       }

       const { data, error } = await query;
       console.log("CONTRACTS FETCH:", data, error);
       if (!error && data) {
           setContracts(data);
       }
       setLoading(false);
    }
    
    if (user && !authLoading) {
       loadContracts();
    }
  }, [user, authLoading]);

  const filteredContracts = contracts.filter(c => {
      const p = c.customers?.name?.toLowerCase() || c.sales?.clients?.full_name?.toLowerCase() || '';
      const proj = c.blocks?.projects?.name?.toLowerCase() || '';
      return p.includes(search.toLowerCase()) || proj.includes(search.toLowerCase());
  });

  if (authLoading) return null;

  return (
    <div className="flex h-full font-sans">
      <div className="w-1/3 border-r border-[var(--color-border)] bg-[var(--color-background)] flex flex-col h-full">
         <div className="p-4 border-b border-[var(--color-border)] flex-none">
             <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-2">
                     <div className="w-10 h-10 bg-[var(--color-primary)]/10 rounded-xl flex items-center justify-center text-[var(--color-primary)]">
                         <FileText className="w-5 h-5" />
                     </div>
                     <h2 className="text-lg font-bold text-white">Contratos</h2>
                 </div>
                 <a href="/contracts/templates" className="px-3 py-1.5 text-xs font-semibold bg-[var(--color-surface)] hover:bg-[var(--color-border)] text-white border border-[var(--color-border)] rounded-lg transition-colors">
                     Modelos
                 </a>
             </div>
             <div className="relative">
                 <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                 <input 
                     type="text" 
                     placeholder="Buscar por cliente ou projeto..." 
                     value={search}
                     onChange={e => setSearch(e.target.value)}
                     className="w-full pl-9 pr-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary)]"
                 />
             </div>
         </div>
         
         <div className="flex-1 overflow-y-auto p-2 space-y-1">
             {loading ? (
                 <div className="p-4 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" /></div>
             ) : filteredContracts.length === 0 ? (
                 <div className="p-4 text-sm text-gray-500 text-center">Nenhum contrato encontrado.</div>
             ) : (
                 filteredContracts.map(contract => (
                     <div 
                         key={contract.id}
                         onClick={() => setSelectedContract(contract)}
                         className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedContract?.id === contract.id ? 'bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20' : 'hover:bg-[var(--color-surface)] border border-transparent'}`}
                     >
                         <h3 className="text-sm font-semibold text-white">{contract.customers?.name || contract.sales?.clients?.full_name || 'Cliente Desconhecido'}</h3>
                         <div className="text-xs text-gray-400 mt-1">
                             {contract.blocks?.projects?.name} - {contract.blocks?.block_name || contract.blocks?.name} / Lote {contract.blocks?.number}
                         </div>
                         <div className="text-xs font-semibold text-[var(--color-primary)] mt-1">
                             {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contract.sales?.total_value || contract.sales?.final_value || contract.sales?.agreed_price || 0)}
                         </div>
                     </div>
                 ))
             )}
         </div>
      </div>
      
      <div className="flex-1 bg-[var(--color-background)] border-l border-[var(--color-border)] flex flex-col h-full overflow-hidden">
         {selectedContract ? (
             <ContractGenerator sale={selectedContract.sales || selectedContract} />
         ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-gray-500 h-full">
                 <FileText className="w-16 h-16 mb-4 opacity-50" />
                 <p>Selecione um contrato na lista para visualizar e exportar.</p>
             </div>
         )}
      </div>
    </div>
  );
}
