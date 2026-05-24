import { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';

export default function CompanyDeleteModal({ isOpen, onClose, company, user, onSuccess }: any) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [confirmName, setConfirmName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [destructiveConfirmation, setDestructiveConfirmation] = useState('');
  const [hasOperationalData, setHasOperationalData] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen && company) {
      const startLoad = async () => {
        await Promise.resolve();
        setLoading(true);
        setReport(null);
        setErrorMsg('');
        setHasOperationalData(false);
        setConfirmName('');
        setAdminPassword('');
        setDestructiveConfirmation('');
        
        try {
          const res = await fetch(`/api/companies/dependency-report?companyId=${company.id}`);
          let data;
          try {
            data = await res.json();
          } catch(e) {
            data = null;
          }
          if (res.ok && data?.success) {
            setReport(data.report);
            const operational = (data.report.contracts > 0 || data.report.finance_receipts > 0 || (data.report.sales && data.report.sales > 0));
            setHasOperationalData(operational);
          } else {
            console.warn("Falha no report, assumindo dados padrão:", data?.error);
            const fallbackReport = { users: '?', projects: '?', blocks: '?', contracts: '?', finance_receipts: '?' };
            setReport(fallbackReport);
            setHasOperationalData(true); // safer to ask for explicit confirmation if unknown
          }
        } catch (err: any) {
          console.warn("Erro no fetch de report, assumindo padrão:", err.message);
          const fallbackReport = { users: '?', projects: '?', blocks: '?', contracts: '?', finance_receipts: '?' };
          setReport(fallbackReport);
          setHasOperationalData(true);
        } finally {
          setLoading(false);
        }
      };
      
      startLoad();
    }
  }, [isOpen, company]);

  if (!isOpen || !company) return null;

  const handleDelete = async () => {
    const normalizedInput = confirmName.trim().toLowerCase();
    const normalizedCompany = company.name.trim().toLowerCase();
    
    if (normalizedInput !== normalizedCompany) {
      setErrorMsg('Nome da empresa digitado incorretamente.');
      return;
    }
    
    if (adminPassword.length < 6) {
      setErrorMsg('Senha do administrador é obrigatória (mín. 6 caracteres).');
      return;
    }

    if (hasOperationalData && destructiveConfirmation.trim().toUpperCase() !== 'APAGAR DEFINITIVAMENTE') {
      setErrorMsg('Confirmação destrutiva incorreta.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/companies/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          companyId: company.id,
          confirmationName: confirmName.trim(),
          adminEmail: user?.email,
          adminUserId: user?.id,
          adminPassword,
          destructiveConfirmation: destructiveConfirmation.trim().toUpperCase() 
        }),
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

  const isFormValid = () => {
    const normalizedInput = confirmName.trim().toLowerCase();
    const normalizedCompany = company.name.trim().toLowerCase();
    if (normalizedInput !== normalizedCompany) return false;
    if (adminPassword.length < 6) return false;
    if (hasOperationalData && destructiveConfirmation.trim().toUpperCase() !== 'APAGAR DEFINITIVAMENTE') return false;
    return true;
  };

  const getMissingRequirements = () => {
    const missing = [];
    const normalizedInput = confirmName.trim().toLowerCase();
    const normalizedCompany = company.name.trim().toLowerCase();
    if (normalizedInput !== normalizedCompany) missing.push('Nome da empresa não confere');
    if (adminPassword.length < 6) missing.push('Senha do Super Admin obrigatória');
    if (hasOperationalData && destructiveConfirmation.trim().toUpperCase() !== 'APAGAR DEFINITIVAMENTE') missing.push('Confirmação destrutiva obrigatória');
    return missing;
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#111111] border border-[#333] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4 mb-6">
           <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 shrink-0">
             <AlertTriangle className="w-6 h-6" />
           </div>
           <div>
              <h2 className="text-xl font-bold text-white mb-1">Excluir Empresa Definitivamente</h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                Esta ação apagará a empresa e seus dados vinculados. Não poderá ser desfeita.
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
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
             <div className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)]">
                <h3 className="text-sm font-bold text-white mb-3 flex justify-between">
                   <span>{company.name}</span>
                   <span className="text-[var(--color-text-muted)] text-xs font-mono">{company.cnpj || 'Sem CNPJ'}</span>
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono text-[var(--color-text-muted)]">
                   <div>Tenant ID:</div><div className="text-right text-white truncate" title={company.id}>{company.id.split('-')[0]}...</div>
                   <div>Usuários:</div><div className="text-right text-white">{report.users}</div>
                   <div>Projetos:</div><div className="text-right text-white">{report.projects}</div>
                   <div>Lotes (Blocks):</div><div className="text-right text-white">{report.blocks}</div>
                   <div className={report.contracts > 0 ? "text-[var(--color-primary)]" : ""}>Contratos:</div>
                   <div className={`text-right ${report.contracts > 0 ? "text-[var(--color-primary)] font-bold" : "text-white"}`}>{report.contracts}</div>
                   <div className={report.finance_receipts > 0 ? "text-[var(--color-primary)]" : ""}>Financeiro:</div>
                   <div className={`text-right ${report.finance_receipts > 0 ? "text-[var(--color-primary)] font-bold" : "text-white"}`}>{report.finance_receipts}</div>
                </div>
             </div>

             {hasOperationalData && (
                <div className="p-3 border border-orange-500/30 bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-sm rounded-lg leading-relaxed">
                   <strong>Esta empresa possui dados operacionais.</strong><br/>
                   Confirme que deseja apagar em modo destrutivo.
                </div>
             )}

             <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                    Digite o nome da empresa
                  </label>
                  <input 
                    type="text" 
                    placeholder={`Digite exatamente: ${company.name}`}
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-red-500 transition-colors"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Você precisa digitar o nome exato da empresa, não o e-mail.</p>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                    Senha do Super Admin
                  </label>
                  <input 
                    type="password" 
                    placeholder="Sua senha para confirmar..."
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>

                {hasOperationalData && (
                  <div>
                    <label className="block text-xs font-bold text-[var(--color-primary)] uppercase tracking-wider mb-1">
                      Confirmação Destrutiva
                    </label>
                    <input 
                      type="text" 
                      placeholder="Digite: APAGAR DEFINITIVAMENTE"
                      value={destructiveConfirmation}
                      onChange={(e) => setDestructiveConfirmation(e.target.value)}
                      className="w-full bg-[var(--color-surface)] border border-orange-500/50 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-red-500 transition-colors"
                    />
                  </div>
                )}
             </div>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 border-t border-[var(--color-border)] pt-4">
           <div className="flex justify-end gap-3">
              <button 
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-bold text-[var(--color-text-muted)] hover:text-white transition-colors"
                disabled={loading}
              >
                Cancelar
              </button>
              <button 
                onClick={handleDelete}
                disabled={loading || !isFormValid()}
                className="bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-red-500 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Excluir Definitivamente
              </button>
           </div>
           {!isFormValid() && confirmName.length > 0 && (
              <div className="text-xs text-red-400 text-right">
                 {getMissingRequirements().map((req, i) => (
                    <div key={i}>• {req}</div>
                 ))}
              </div>
           )}
        </div>
      </div>
    </div>
  );
}
