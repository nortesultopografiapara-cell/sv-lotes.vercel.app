'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { FileText, Loader2, Search, Download, Printer, FileDown } from 'lucide-react';
import { ContractGenerator } from '@/components/contracts/ContractGenerator';

export default function ContractsPage() {
  const { user, loading: authLoading } = useSessionGuard();
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSale, setSelectedSale] = useState<any>(null);

  useEffect(() => {
    async function loadSales() {
       if (!user?.tenant_id && user?.role !== 'SUPER_ADMIN') {
          setLoading(false);
          return;
       }

       let query = supabase.from('sales')
           .select('*, clients(*), blocks(number, block_name, name, projects(name, city, state))')
           .order('created_at', { ascending: false });
           
       if (user?.role !== 'SUPER_ADMIN' && user?.tenant_id) {
           query = query.eq('tenant_id', user.tenant_id);
       }

       const { data, error } = await query;
       if (!error && data) {
           setSales(data);
       }
       setLoading(false);
    }
    
    if (user && !authLoading) {
       loadSales();
    }
  }, [user, authLoading]);

  const filteredSales = sales.filter(s => {
      const p = s.clients?.full_name?.toLowerCase() || '';
      const c = s.blocks?.projects?.name?.toLowerCase() || '';
      return p.includes(search.toLowerCase()) || c.includes(search.toLowerCase());
  });

  if (authLoading) return null;

  return (
    <div className="flex h-full font-sans">
      <div className="w-1/3 border-r border-gray-200 bg-white flex flex-col h-full">
         <div className="p-4 border-b border-gray-100 flex-none">
             <div className="flex items-center gap-2 mb-4">
                 <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                     <FileText className="w-5 h-5" />
                 </div>
                 <h2 className="text-lg font-bold text-gray-900">Contratos</h2>
             </div>
             <div className="relative">
                 <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                 <input 
                     type="text" 
                     placeholder="Buscar por cliente ou projeto..." 
                     value={search}
                     onChange={e => setSearch(e.target.value)}
                     className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                 />
             </div>
         </div>
         
         <div className="flex-1 overflow-y-auto p-2 space-y-1">
             {loading ? (
                 <div className="p-4 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
             ) : filteredSales.length === 0 ? (
                 <div className="p-4 text-sm text-gray-500 text-center">Nenhum contrato encontrado.</div>
             ) : (
                 filteredSales.map(sale => (
                     <div 
                         key={sale.id}
                         onClick={() => setSelectedSale(sale)}
                         className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedSale?.id === sale.id ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-gray-50 border border-transparent'}`}
                     >
                         <h3 className="text-sm font-semibold text-gray-900">{sale.clients?.full_name || 'Cliente Desconhecido'}</h3>
                         <div className="text-xs text-gray-500 mt-1">
                             {sale.blocks?.projects?.name} - {sale.blocks?.block_name || sale.blocks?.name} / Lote {sale.blocks?.number}
                         </div>
                         <div className="text-xs font-semibold text-indigo-700 mt-1">
                             {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sale.final_value || sale.agreed_price)}
                         </div>
                     </div>
                 ))
             )}
         </div>
      </div>
      
      <div className="flex-1 bg-gray-50 flex flex-col h-full overflow-hidden">
         {selectedSale ? (
             <ContractGenerator sale={selectedSale} />
         ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-gray-400 h-full">
                 <FileText className="w-16 h-16 mb-4 opacity-50" />
                 <p>Selecione um contrato na lista para visualizar e exportar.</p>
             </div>
         )}
      </div>
    </div>
  );
}
