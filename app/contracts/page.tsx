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

export default function ContractsPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantData, setTenantData] = useState<any>(null);
  const [isAvulsoModalOpen, setIsAvulsoModalOpen] = useState(false);

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
      const { data: lotsData } = await supabase
        .from('blocks')
        .select(`
          *,
          customers(
            id, name, cpf_cnpj, address, phone
          )
        `)
        .in('status', ['Vendido', 'Reservado'])
        .order('updated_at', { ascending: false });

      if (lotsData) {
        setContracts(lotsData);
      }
    } catch (err) {
      console.error("Error loading contracts", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handlePrint = (contract: any) => {
    const customer = contract.customers || {};
    const htmlContract = `
      <html>
        <head>
          <title>Contrato de Venda - ${contract.block_name} Lote ${contract.number}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }
            h1 { text-align: center; margin-bottom: 30px; font-size: 24px; text-transform: uppercase; }
            h2 { font-size: 18px; border-bottom: 2px solid #ccc; padding-bottom: 5px; margin-top: 30px; }
            p { margin-bottom: 15px; text-justify: inter-word; text-align: justify; }
            .info-block { background: #f9f9f9; padding: 15px; border border: #eee; margin-bottom: 20px; border-radius: 5px; }
            .signatures { margin-top: 60px; display: flex; justify-content: space-between; }
            .sig-box { width: 45%; text-align: center; border-top: 1px solid #333; padding-top: 10px; }
          </style>
        </head>
        <body>
          <h1>INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA</h1>
          
          <h2>1. VENDEDORA (PROMITENTE)</h2>
          <div class="info-block">
            <strong>Razão Social:</strong> ${tenantData?.razao_social || tenantData?.name || '__________________________'}<br/>
            <strong>CNPJ:</strong> ${tenantData?.cnpj || '__________________________'}<br/>
            <strong>Endereço:</strong> ${tenantData?.address || '__________________________'}<br/>
            <strong>Contato:</strong> ${tenantData?.email || ''} ${tenantData?.phone || ''}
          </div>

          <h2>2. COMPRADOR (PROMISSÁRIO)</h2>
          <div class="info-block">
            <strong>Nome:</strong> ${customer.name || '__________________________'}<br/>
            <strong>CPF/CNPJ:</strong> ${customer.cpf_cnpj || '__________________________'}<br/>
            <strong>Endereço:</strong> ${customer.address || '__________________________'}<br/>
            <strong>Telefone:</strong> ${customer.phone || '__________________________'}
          </div>

          <h2>3. OBJETO DO CONTRATO</h2>
          <p>
            O presente contrato tem como objeto o lote de terreno designado por <strong>Lote ${contract.number}</strong> 
            da <strong>Quadra ${contract.block_name}</strong>, localizado no empreendimento. 
            <strong>Área Total:</strong> ${contract.area} m².
          </p>

          <h2>4. VALOR E FORMA DE PAGAMENTO</h2>
          <p>
            O preço certo e ajustado para a promessa de compra e venda do imóvel objeto deste contrato é de 
            <strong>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contract.price || 0)}</strong>.
          </p>

          <h2>5. DISPOSIÇÕES GERAIS</h2>
          <p>
            As partes elegem o foro desta comarca para dirimir quaisquer dúvidas originadas do presente instrumento.
            E por estarem justos e contratados, assinam o presente em 02 (duas) vias de igual teor.
          </p>

          <p style="text-align: right; margin-top: 40px;">
            Data: ${new Date().toLocaleDateString('pt-BR')}
          </p>

          <div class="signatures">
            <div class="sig-box">
              ${tenantData?.razao_social || tenantData?.name || 'Vendedora'}<br/>
              (Vendedora)
            </div>
            <div class="sig-box">
              ${customer.name || 'Comprador'}<br/>
              (Compradora)
            </div>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContract);
      printWindow.document.close();
      printWindow.focus();
      // Delay printing a little so the browser has time to render the DOM
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
  };

  const filteredContracts = contracts.filter(c => 
    c.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.block_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.status?.toLowerCase().includes(searchTerm.toLowerCase())
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
                        <div className="font-medium text-gray-900">{contract.customers?.name || 'Cliente Sem Nome'}</div>
                        <div className="text-xs text-gray-500">{contract.customers?.cpf_cnpj || ''}</div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          {`Quadra ${contract.block_name} / Lote ${contract.number}`}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="text-gray-900 font-medium">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contract.price || 0)}
                        </span>
                      </td>
                      <td className="p-4 text-gray-600 text-sm">
                        {contract.updated_at ? new Date(contract.updated_at).toLocaleDateString('pt-BR') : ''}
                      </td>
                      <td className="p-4">
                         {contract.status === 'Vendido' ? (
                           <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700">Vendido</span>
                         ) : (
                           <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-yellow-100 text-yellow-700">Reservado</span>
                         )}
                      </td>
                      <td className="p-4 pr-6">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handlePrint(contract)} className="p-1.5 text-gray-400 hover:text-[#f59e0b] hover:bg-amber-50 rounded transition-colors tooltip-trigger" title="Gerar Contrato (PDF) / Imprimir">
                            <Printer className="w-4 h-4" />
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
            loadData();
         }}
      />
    </div>
  );
}
