import { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';

export default function CompanyDeleteModal({ isOpen, onClose, company, onSuccess }: any) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [confirmName, setConfirmName] = useState('');
  const [hasOperationalData, setHasOperationalData] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen && company) {
      setLoading(true);
      setReport(null);
      setErrorMsg('');
      setHasOperationalData(false);
      setConfirmName('');
      
      fetch(`/api/companies/dependency-report?companyId=${company.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setReport(data.report);
            console.log('--- RELATÓRIO DE DELETAR EMPRESA ---');
            console.log('Empresa:', company.name);
            console.log('tenant_id:', company.id);
            console.log('company_id:', company.id);
            console.log('users:', data.report.users);
            console.log('projects:', data.report.projects);
            console.log('blocks:', data.report.blocks);
            console.log('customers:', data.report.customers);
            console.log('brokers:', data.report.brokers);
            console.log('sales:', data.report.sales);
            console.log('contracts:', data.report.contracts);
            console.log('finance_receipts:', data.report.finance_receipts);
            console.log('------------------------------------');

            const operational = (data.report.contracts > 0 || data.report.finance_receipts > 0 || data.report.sales > 0);
            setHasOperationalData(operational);
          } else {
            setErrorMsg(data.error);
          }
        })
        .catch((err) => setErrorMsg(err.message))
        .finally(() => setLoading(false));
    }
  }, [isOpen, company]);

  if (!isOpen || !company) return null;

  const handleDelete = async () => {
    if (confirmName !== company.name) {
      setErrorMsg('Nome da empresa digitado incorretamente.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/companies/delete-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: company.id }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao excluir');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#111111] border border-[#333] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4 mb-6">
           <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 shrink-0">
             <AlertTriangle className="w-6 h-6" />
           </div>
           <div>
              <h2 className="text-xl font-bold text-white mb-1">Excluir Empresa de Teste</h2>
              <p className="text-sm text-gray-400">
                Esta ação é irreversível e excluirá todos os dados vinculados em cascata.
              </p>
           </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 border border-red-500/30 bg-red-500/10 text-red-400 text-sm rounded-lg">
             {errorMsg}
          </div>
        )}

        {loading && !report ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          </div>
        ) : report ? (
          <div className="space-y-4">
             <div className="bg-[#1a1f29] rounded-xl p-4 border border-[#2d3340]">
                <h3 className="text-sm font-bold text-white mb-3 flex justify-between">
                   <span>{company.name}</span>
                   <span className="text-gray-500 text-xs font-mono">{company.cnpj || 'Sem CNPJ'}</span>
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono text-gray-400">
                   <div>Tenant ID:</div><div className="text-right text-white truncate" title={company.id}>{company.id.split('-')[0]}...</div>
                   <div>Usuários:</div><div className="text-right text-white">{report.users}</div>
                   <div>Projetos:</div><div className="text-right text-white">{report.projects}</div>
                   <div>Lotes (Blocks):</div><div className="text-right text-white">{report.blocks}</div>
                   <div className={report.contracts > 0 ? "text-orange-400" : ""}>Contratos:</div>
                   <div className={`text-right ${report.contracts > 0 ? "text-orange-400 font-bold" : "text-white"}`}>{report.contracts}</div>
                   <div className={report.finance_receipts > 0 ? "text-orange-400" : ""}>Financeiro:</div>
                   <div className={`text-right ${report.finance_receipts > 0 ? "text-orange-400 font-bold" : "text-white"}`}>{report.finance_receipts}</div>
                </div>
             </div>

             {hasOperationalData ? (
                <div className="p-3 border border-orange-500/30 bg-orange-500/10 text-orange-400 text-sm rounded-lg leading-relaxed">
                   <strong>Esta empresa possui dados operacionais vinculados.</strong><br/>
                   Use as opções de Desativar ou Suspender em vez de Excluir fisiscamente (Cascade).
                </div>
             ) : (
                <div className="space-y-2">
                   <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                     Digite o nome exato da empresa para confirmar
                   </label>
                   <input 
                     type="text" 
                     placeholder={company.name}
                     value={confirmName}
                     onChange={(e) => setConfirmName(e.target.value)}
                     className="w-full bg-[#1a1f29] border border-[#2d3340] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-red-500 transition-colors"
                   />
                </div>
             )}
          </div>
        ) : null}

        <div className="mt-8 flex justify-end gap-3 border-t border-[#2d3340] pt-4">
           <button 
             onClick={onClose}
             className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white transition-colors"
             disabled={loading}
           >
             Cancelar
           </button>
           <button 
             onClick={handleDelete}
             disabled={loading || hasOperationalData || confirmName !== company?.name}
             className="bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-red-500 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
           >
             {loading && !!report ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
             Excluir Empresa
           </button>
        </div>
      </div>
    </div>
  );
}
