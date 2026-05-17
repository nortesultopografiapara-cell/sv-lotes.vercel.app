'use client';

import { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  FileText, 
  Eye, 
  Printer, 
  MoreVertical,
  Loader2,
  Download
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { AvulsoContractModal } from './AvulsoContractModal';
import { useRouter } from 'next/navigation';

export default function ContractsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantData, setTenantData] = useState<any>(null);
  const [isAvulsoModalOpen, setIsAvulsoModalOpen] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      try {
        setLoading(true);
        // Load Tenant Data
        const { data: tData } = await supabase
          .from('companies')
          .select('*')
          .eq('id', user.tenant_id)
          .single();
        if (tData) setTenantData(tData);

        // Load Sold Lots (Contracts)
        let query = supabase.from('contracts').select('*, blocks(block_name, number)');
        if (user.role !== 'SUPER_ADMIN' && user.tenant_id) {
           query = query.eq('company_id', user.tenant_id);
        }
        const { data: contractsData } = await query.order('created_at', { ascending: false });

        if (contractsData) {
          setContracts(contractsData);
        }
      } catch (err) {
        console.error("Error loading contracts", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  const refreshData = async () => {
     if (!user) return;
     try {
       setLoading(true);
       let query = supabase.from('contracts').select('*, blocks(block_name, number)');
       if (user.role !== 'SUPER_ADMIN' && user.tenant_id) {
          query = query.eq('company_id', user.tenant_id);
       }
       const { data: contractsData } = await query.order('created_at', { ascending: false });

       if (contractsData) {
         setContracts(contractsData);
       }
     } catch (err) {
       console.error("Error loading contracts", err);
     } finally {
       setLoading(false);
     }
  };

  const handlePrint = (contract: any) => {
     router.push(`/contracts/${contract.id}`);
  };

  const filteredContracts = contracts.filter(c => 
    c.buyer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.blocks?.block_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.buyer_cpf?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
      <header className="px-6 py-6 border-b border-gray-200 bg-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#f59e0b]" />
            Contratos de Venda
          </h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie os contratos de compra e venda de lotes.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar contrato..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#f59e0b]/50 focus:border-[#f59e0b] w-full md:w-64"
            />
          </div>
          
          <button 
            onClick={() => setIsAvulsoModalOpen(true)}
            className="flex items-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Criar Avulso
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 flex flex-col h-[calc(100vh-200px)]">
        {loading ? (
           <div className="flex-1 flex justify-center items-center">
              <Loader2 className="w-8 h-8 text-[#f59e0b] animate-spin" />
           </div>
        ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1">
          <div className="overflow-x-auto h-full">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                  <th className="p-4 pl-6">Comprador</th>
                  <th className="p-4">Quadra/Lote</th>
                  <th className="p-4">Valor Total</th>
                  <th className="p-4">Data Venda</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-center pr-6">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      Nenhum contrato encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredContracts.map((contract) => (
                    <tr key={contract.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="font-medium text-gray-900">{contract.buyer_name || 'Cliente Sem Nome'}</div>
                        <div className="text-xs text-gray-500">{contract.buyer_cpf || ''}</div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          {contract.blocks ? `Quadra ${contract.blocks.block_name} / Lote ${contract.blocks.number}` : 'Lote Avulso'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="text-gray-900 font-medium">
                          Ver Contrato
                        </span>
                      </td>
                      <td className="p-4 text-gray-600 text-sm">
                        {contract.created_at ? new Date(contract.created_at).toLocaleDateString('pt-BR') : ''}
                      </td>
                      <td className="p-4">
                         <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700">Gerado</span>
                      </td>
                      <td className="p-4 pr-6">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handlePrint(contract)} className="p-1.5 text-gray-400 hover:text-[#f59e0b] hover:bg-amber-50 rounded transition-colors tooltip-trigger" title="Gerar Contrato (PDF) / Imprimir">
                             <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>

      <AvulsoContractModal 
         isOpen={isAvulsoModalOpen} 
         onClose={() => setIsAvulsoModalOpen(false)} 
         tenantId={user?.tenant_id || ''}
         onSave={() => {
            setIsAvulsoModalOpen(false);
            refreshData();
         }}
      />
    </div>
  );
}
