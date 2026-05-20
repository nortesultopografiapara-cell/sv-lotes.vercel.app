'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { FileText, Loader2, Search, CheckCircle2, Clock, XCircle, SearchIcon, Download, Printer, Send, Edit, X, Receipt, Wallet, ChevronDown, MoreVertical, RefreshCw, Trash2 } from 'lucide-react';
import { ContractGenerator } from '@/components/contracts/ContractGenerator';
import jsPDF from 'jspdf';
import { generateContractHTML } from '@/lib/contractTemplate';

export default function ContractsPage() {
  const { user, loading: authLoading } = useSessionGuard();
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('Visualização');

  const [stats, setStats] = useState({
    ativos: 0,
    assinados: 0,
    pendentes: 0,
    cancelados: 0,
    valorTotal: 0
  });
  const [tenantData, setTenantData] = useState<any>(null);

  useEffect(() => {
    async function loadTenant() {
      const resolvedTenantId = (user as any)?.company_id || user?.tenant_id;
      if (resolvedTenantId) {
         const { data } = await supabase.from('companies').select('*').eq('id', resolvedTenantId).single();
         if (data) setTenantData(data);
      }
    }
    if (user) loadTenant();
  }, [user]);

  useEffect(() => {
    async function loadContracts() {
       const resolvedTenantId = (user as any)?.company_id || user?.tenant_id;
       console.log("USER CONTRATOS:", user);
       console.log("TENANT CONTRATOS:", resolvedTenantId);
       
       if (!resolvedTenantId && user?.role !== 'SUPER_ADMIN') {
          console.warn('tenant_id não encontrado para carregar contratos');
          setLoading(false);
          return;
       }

       let query = supabase.from('contracts')
           .select(`
             *,
             customers:customer_id(*),
             sales:sale_id(*),
             projects:project_id(*),
             blocks:block_id(*)
           `)
           .order('created_at', { ascending: false });
           
       if (user?.role !== 'SUPER_ADMIN' && resolvedTenantId) {
           query = query.eq('tenant_id', resolvedTenantId);
       }

       const { data, error } = await query;
       
       if (error) {
           console.error("ERRO JOIN CONTRACTS:", error);
           let fallbackQuery = supabase.from('contracts').select('*').order('created_at', { ascending: false });
           if (user?.role !== 'SUPER_ADMIN' && resolvedTenantId) fallbackQuery = fallbackQuery.eq('tenant_id', resolvedTenantId);
           const fallbackRes = await fallbackQuery;
           if (!fallbackRes.error && fallbackRes.data) {
               console.log("CONTRACTS RAW FALLBACK:", fallbackRes.data);
               processContracts(fallbackRes.data);
           }
       } else {
           console.log("CONTRACTS RAW:", data, error);
           if (data) processContracts(data);
       }
       setLoading(false);
    }
    
    function processContracts(data: any[]) {
           setContracts(data);
           
           let ativos = 0, assinados = 0, pendentes = 0, cancelados = 0, valorTotal = 0;
           
           data.forEach(c => {
               const st = c.status?.toLowerCase() || 'pendente';
               const val = Number(c.sales?.total_value || c.sales?.final_value || c.sales?.agreed_price || 0);
               
               valorTotal += val;
               
               if (st === 'assinado') {
                 assinados++;
                 ativos++;
               } else if (st === 'cancelado') {
                 cancelados++;
               } else { 
                 pendentes++;
                 ativos++;
               }
           });
           
           setStats({ ativos, assinados, pendentes, cancelados, valorTotal });
    }
    
    if (user && !authLoading) {
       loadContracts();
    }
  }, [user, authLoading]);

  const filteredContracts = contracts.filter(c => {
      const p = c.customers?.name?.toLowerCase() || '';
      const proj = c.projects?.name?.toLowerCase() || c.sales?.projects?.name?.toLowerCase() || '';
      const doc = c.customers?.document?.toLowerCase() || c.customers?.cpf?.toLowerCase() || '';
      const cnum = c.contract_number?.toLowerCase() || '';
      const term = search.toLowerCase();
      
      return p.includes(term) || proj.includes(term) || doc.includes(term) || cnum.includes(term);
  });

  const getStatusColor = (status: string) => {
      const st = status?.toLowerCase() || 'pendente';
      if (st === 'assinado') return 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20';
      if (st === 'cancelado') return 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20';
      return 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20';
  };

  const getStatusLabel = (status: string) => {
     const st = status?.toLowerCase() || 'pendente';
     if (st === 'assinado') return 'Assinado';
     if (st === 'cancelado') return 'Cancelado';
     return 'Pendente';
  };

  const handleBaixarPDF = async () => {
    if (!selectedContract) return;
    try {
      const { default: html2pdf } = await import('html2pdf.js');
      const element = document.createElement('div');
      
      element.innerHTML = selectedContract.generated_html || '<p>Contrato sem conteúdo.</p>';
      
      const opt = {
        margin: 10,
        filename: `contrato_${selectedContract.contract_number || selectedContract.id}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      
      html2pdf().from(element).set(opt).save();
    } catch (e) {
      alert('Erro ao tentar baixar PDF. Certifique-se que html2pdf.js está instalado.');
      console.error(e);
    }
  };

  const handleImprimir = () => {
      if (!selectedContract) return;
      const printWindow = window.open('', '_blank');
      if (printWindow) {
          printWindow.document.write(`
              <html>
                  <head><title>Imprimir Contrato - ${selectedContract.contract_number || ''}</title></head>
                  <body style="font-family: sans-serif; padding: 20px;">
                      ${selectedContract.generated_html || '<p>Contrato sem conteúdo.</p>'}
                      <script>window.onload = function() { window.print(); }</script>
                  </body>
              </html>
          `);
          printWindow.document.close();
      }
  };

  const handleAlertDev = () => alert('Função em desenvolvimento');

  const handleLimparTestes = async () => {
      const confirmLimpar = confirm('Deseja excluir os contratos de teste pendentes/cancelados desta empresa? Esta ação não pode ser desfeita.');
      if (!confirmLimpar) return;

      const resolvedTenantId = tenantData?.id || (user as any)?.company_id || user?.tenant_id;

      if (!resolvedTenantId && user?.role !== 'SUPER_ADMIN') {
          alert('ID do locatário não identificado para exclusão segura.');
          return;
      }

      console.log("TENANT LIMPEZA CONTRATOS:", resolvedTenantId);

      let q = supabase.from('contracts')
          .delete()
          .in('status', ['pendente', 'pending', 'cancelado', 'canceled']);

      if (resolvedTenantId && user?.role !== 'SUPER_ADMIN') {
          q = q.eq('tenant_id', resolvedTenantId);
      }

      const { data, error } = await q.select();

      console.log("CONTRATOS EXCLUÍDOS:", data);
      console.log("ERRO LIMPEZA CONTRATOS:", error);

      if (error) {
          alert("ERRO AO EXCLUIR CONTRATOS: " + JSON.stringify(error));
      } else if (!data || data.length === 0) {
          alert("Nenhum contrato de teste foi excluído.");
      } else {
          alert(`${data.length} contrato(s) de teste excluído(s) com sucesso.`);
          // Remove deleted from state
          const excluidosIds = data.map((c: any) => c.id);
          const remaining = contracts.filter((c: any) => !excluidosIds.includes(c.id));
          setContracts(remaining);
          setSelectedContract(null);
          
          // Re-calculate stats
          let ativos = 0, assinados = 0, pendentes = 0, cancelados = 0, valorTotal = 0;
          remaining.forEach(c => {
              const st = c.status?.toLowerCase() || 'pendente';
              const val = Number(c.sales?.total_value || c.sales?.final_value || c.sales?.agreed_price || 0);
              valorTotal += val;
              if (st === 'assinado' || st === 'signed') { assinados++; ativos++; }
              else if (st === 'cancelado' || st === 'canceled') cancelados++;
              else { pendentes++; ativos++; }
          });
          setStats({ ativos, assinados, pendentes, cancelados, valorTotal });
      }
  };

  const handleReenviar = () => {
      if (!selectedContract) return;
      let phone = selectedContract.customers?.phone || '';
      if (!phone) {
          alert("Cliente não possui telefone cadastrado.");
          return;
      }
      phone = phone.replace(/\\D/g, '');
      const msg = encodeURIComponent(`Olá ${selectedContract.customers?.name || 'Cliente'}, segue atualizações sobre seu contrato de venda do lote. Por favor, qualquer dúvida entre em contato.`);
      window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  const handleCancelar = async () => {
      if (!selectedContract) return;
      if (!confirm("Deseja realmente cancelar este contrato? Essa ação também cancelará a Venda relacionada.")) return;
      
      const { error } = await supabase.from('contracts').update({ status: 'cancelado' }).eq('id', selectedContract.id);
      
      if (!error && selectedContract.sale_id) {
          await supabase.from('sales').update({ status: 'CANCELLED' }).eq('id', selectedContract.sale_id);
      }

      if (error) {
          alert("Erro ao cancelar contrato");
      } else {
          alert("Contrato cancelado com sucesso!");
          setSelectedContract({ ...selectedContract, status: 'cancelado' });
          setContracts(contracts.map(c => c.id === selectedContract.id ? { ...c, status: 'cancelado' } : c));
      }
  };

  const handleGerarCarne = async () => {
      if (!selectedContract?.sale_id) return;
      try {
          const { data: receipts, error } = await supabase.from('finance_receipts')
              .select('*')
              .eq('sale_id', selectedContract.sale_id)
              .order('due_date', { ascending: true });

          if (error) throw error;
          
          if (!receipts || receipts.length === 0) {
              alert("Nenhuma parcela encontrada para esta venda.");
              return;
          }

          let html = `
              <div style="font-family: sans-serif; padding: 20px;">
                  <div style="text-align: center; margin-bottom: 20px;">
                      <h2>CARNÊ DE PAGAMENTO</h2>
                      <p>CONTRATO: ${selectedContract.contract_number}</p>
                      <p>CLIENTE: ${selectedContract.customers?.name || 'Cliente'}</p>
                  </div>
                  <table style="width: 100%; border-collapse: collapse;">
                      <thead>
                          <tr>
                              <th style="border: 1px solid #ccc; padding: 8px;">Parcela</th>
                              <th style="border: 1px solid #ccc; padding: 8px;">Vencimento</th>
                              <th style="border: 1px solid #ccc; padding: 8px;">Valor</th>
                              <th style="border: 1px solid #ccc; padding: 8px;">Status</th>
                          </tr>
                      </thead>
                      <tbody>
          `;

          receipts.forEach((r, idx) => {
              const d = new Date(r.due_date);
              d.setUTCHours(12);
              const dataFmt = d.toLocaleDateString('pt-BR');
              const valFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(r.amount));
              html += `
                  <tr>
                      <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${idx + 1}/${receipts.length}</td>
                      <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${dataFmt}</td>
                      <td style="border: 1px solid #ccc; padding: 8px; text-align: right;">${valFmt}</td>
                      <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${r.status}</td>
                  </tr>
              `;
          });

          html += `
                      </tbody>
                  </table>
                  <div style="margin-top: 30px; font-size: 12px; text-align: center; color: #666;">
                      Este é um documento auxiliar de controle de parcelas.
                  </div>
              </div>
          `;

          const { default: html2pdf } = await import('html2pdf.js');
          const element = document.createElement('div');
          element.innerHTML = html;
          
          const opt = {
            margin: 10,
            filename: `carne_${selectedContract.contract_number || selectedContract.id}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
          };
          
          html2pdf().from(element).set(opt).save();

      } catch (e) {
          console.error(e);
          alert("Erro ao gerar carnê.");
      }
  };

  const handleRegenerarContrato = async () => {
      if (!selectedContract) return;
      if (!confirm("Isso irá recriar o visual do contrato com os dados atuais. Deseja continuar?")) return;
      
      let receipts_sum = 0;
      if (selectedContract.sale_id) {
          const { data: recs } = await supabase.from('finance_receipts').select('amount').eq('sale_id', selectedContract.sale_id).neq('status', 'cancelled');
          if (recs && recs.length) receipts_sum = recs.reduce((a, b) => a + Number(b.amount || 0), 0);
      }
      
      const newHtml = generateContractHTML({
          tenant: tenantData || {},
          customer: selectedContract.customers || (selectedContract.customer_id ? { id: selectedContract.customer_id } : {}),
          project: selectedContract.projects || selectedContract.sales?.projects || {},
          block: selectedContract.blocks || selectedContract.sales?.blocks || {},
          sale: { ...(selectedContract.sales || {}), receipts_sum },
          contractDate: selectedContract.created_at
      });

      const { data, error } = await supabase.from('contracts').update({ generated_html: newHtml }).eq('id', selectedContract.id).select().single();
      
      if (error) {
          console.error("Erro recriando", error);
          alert("Erro ao regenerar contrato");
      } else {
          setSelectedContract({ ...selectedContract, generated_html: newHtml });
          setContracts(contracts.map(c => c.id === selectedContract.id ? { ...c, generated_html: newHtml } : c));
          alert("Contrato regenerado com sucesso!");
      }
  };

  if (authLoading) return null;

  return (
    <div className="flex flex-col h-full bg-[#0b0e14] text-white font-sans overflow-hidden">
      
      {/* Top Banner Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-6 border-b border-[var(--color-border)] bg-[#11151c]">
           <div className="bg-[#1a1f2b] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between">
              <div>
                 <p className="text-gray-400 text-sm font-medium mb-1">Contratos Ativos</p>
                 <h3 className="text-2xl font-bold">{stats.ativos}</h3>
              </div>
              <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
                 <FileText className="w-5 h-5" />
              </div>
           </div>
           
           <div className="bg-[#1a1f2b] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between">
              <div>
                 <p className="text-gray-400 text-sm font-medium mb-1">Assinados</p>
                 <h3 className="text-2xl font-bold">{stats.assinados}</h3>
                 <p className="text-[10px] text-[var(--color-success)] mt-1 font-medium">{stats.ativos > 0 ? Math.round((stats.assinados/stats.ativos)*100) : 0}% do total</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center text-[var(--color-success)]">
                 <CheckCircle2 className="w-5 h-5" />
              </div>
           </div>

           <div className="bg-[#1a1f2b] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between">
              <div>
                 <p className="text-gray-400 text-sm font-medium mb-1">Pendentes</p>
                 <h3 className="text-2xl font-bold">{stats.pendentes}</h3>
              </div>
              <div className="w-10 h-10 rounded-full bg-[var(--color-warning)]/10 flex items-center justify-center text-[var(--color-warning)]">
                 <Clock className="w-5 h-5" />
              </div>
           </div>

           <div className="bg-[#1a1f2b] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between">
              <div>
                 <p className="text-gray-400 text-sm font-medium mb-1">Cancelados</p>
                 <h3 className="text-2xl font-bold">{stats.cancelados}</h3>
              </div>
              <div className="w-10 h-10 rounded-full bg-[var(--color-danger)]/10 flex items-center justify-center text-[var(--color-danger)]">
                 <XCircle className="w-5 h-5" />
              </div>
           </div>

           <div className="bg-[#1a1f2b] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between">
              <div>
                 <p className="text-gray-400 text-sm font-medium mb-1">Val Total Contratado</p>
                 <h3 className="text-xl lg:text-2xl font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.valorTotal)}</h3>
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
                 <Wallet className="w-5 h-5" />
              </div>
           </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
          {/* SIDEBAR LIST */}
          <div className="w-1/3 min-w-[350px] max-w-[450px] flex flex-col border-r border-[#1f232b] bg-[#0b0e14]">
             <div className="p-4 border-b border-[#1f232b]">
                <div className="relative mb-2">
                   <SearchIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                   <input
                      type="text"
                      className="w-full pl-9 pr-4 py-2 text-sm bg-[#11151c] border border-[#1f232b] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)] transition-all"
                      placeholder="Buscar por cliente, contrato, projeto..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                   />
                </div>
                <div className="flex justify-end">
                   <button onClick={handleLimparTestes} className="text-xs text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> Limpar Contratos de Teste
                   </button>
                </div>
             </div>

             <div className="flex-1 overflow-y-auto p-3 space-y-2">
                 {loading ? (
                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" /></div>
                 ) : filteredContracts.length === 0 ? (
                    <div className="text-center text-gray-500 p-8 text-sm">Nenhum contrato encontrado.</div>
                 ) : (
                    filteredContracts.map(c => {
                       const isSelected = selectedContract?.id === c.id;
                       const cnum = c.contract_number || (c.id ? `CTR-${c.id.slice(-6).toUpperCase()}` : 'CTR-NOID');
                       const projName = c.projects?.name || c.sales?.projects?.name || 'Projeto não informado';
                       const quad = c.blocks?.block_name || c.blocks?.name || c.sales?.blocks?.block_name || '?';
                       const lote = c.blocks?.number || c.sales?.blocks?.number || '?';
                       const loc = `QD ${quad} • LT ${lote}`;
                       const val = Number(c.sales?.total_value || c.sales?.final_value || c.sales?.agreed_price || 0);

                       return (
                           <button 
                              key={c.id}
                              onClick={() => setSelectedContract(c)}
                              className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                                 isSelected ? 'bg-[#1a2333] border-[var(--color-primary)]/40 shadow-[0_0_15px_rgba(41,128,185,0.1)]' 
                                 : 'bg-[#11151c] border-[#1f232b] hover:border-[#2d3340] hover:bg-[#151a23]'
                              }`}
                           >
                              <div className="flex justify-between items-start mb-1.5">
                                  <div className="flex items-center gap-2">
                                      <FileText className={`w-4 h-4 ${isSelected ? 'text-[var(--color-primary)]' : 'text-gray-400'}`} />
                                      <span className="font-mono text-sm font-bold text-white">{cnum}</span>
                                  </div>
                                  <div className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${getStatusColor(c.status)}`}>
                                      {getStatusLabel(c.status)}
                                  </div>
                              </div>
                              <div className="text-sm font-semibold text-gray-200 truncate pr-4">
                                  {c.customers?.name || 'Cliente não informado'}
                              </div>
                              {c.customers?.document && (
                                  <div className="text-[10px] text-gray-500 mt-0.5">
                                      CPF/CNPJ: {c.customers.document}
                                  </div>
                              )}
                              
                              <div className="flex justify-between items-end mt-3">
                                  <div>
                                      <div className="text-xs text-gray-400">{projName}</div>
                                      <div className="text-[10px] text-gray-500">{loc}</div>
                                  </div>
                                  <div className="text-right">
                                      <div className="text-xs font-bold text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)}</div>
                                      <div className="text-[10px] text-gray-500">{new Date(c.created_at).toLocaleDateString('pt-BR')}</div>
                                  </div>
                              </div>
                           </button>
                       )
                    })
                 )}
             </div>
          </div>

          {/* MAIN PREVIEW PANEL */}
          <div className="flex-1 bg-[#11151c] flex flex-col overflow-hidden relative">
             {selectedContract ? (
                <>
                  <div className="p-6 border-b border-[#1f232b]">
                      <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
                                  <FileText className="w-5 h-5 text-[var(--color-primary)]" />
                              </div>
                              <div>
                                  <h2 className="text-xl font-bold flex items-center gap-3">
                                      {selectedContract.contract_number || (selectedContract.id ? `CTR-${selectedContract.id.slice(-6).toUpperCase()}` : 'CTR-NOID')}
                                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${getStatusColor(selectedContract.status)}`}>
                                          {getStatusLabel(selectedContract.status)}
                                      </span>
                                  </h2>
                              </div>
                          </div>
                          <div className="flex items-center gap-2">
                              {/* Botão Dropdown "Modelos" */}
                              <div className="relative group">
                                  <button className="flex items-center gap-2 px-4 py-2 bg-transparent text-gray-300 border border-[#2d3340] rounded-lg hover:bg-[#1a1f2b] transition-colors text-sm font-medium">
                                     Modelos
                                     <ChevronDown className="w-4 h-4" />
                                  </button>
                                  <div className="absolute right-0 top-full mt-1 w-48 bg-[#1a1f2b] border border-[#2d3340] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                                      <a href="/contracts/templates" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[var(--color-primary)] hover:text-white border-b border-[#2d3340]/50">Novo Contrato</a>
                                      <a href="/contracts/templates" className="block px-4 py-2 text-sm text-gray-300 hover:bg-[var(--color-primary)] hover:text-white border-b border-[#2d3340]/50">Modelos</a>
                                      <button className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[var(--color-primary)] hover:text-white border-b border-[#2d3340]/50">Gerar PDF</button>
                                      <button className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[var(--color-primary)] hover:text-white border-b border-[#2d3340]/50">Exportar</button>
                                      <button className="block w-full text-left px-4 py-2 text-sm text-[var(--color-success)] hover:bg-[var(--color-success)]/10 hover:text-[var(--color-success)]">Assinar</button>
                                  </div>
                              </div>
                              <button className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:bg-[#1f6b9c] transition-colors text-sm font-medium shadow-sm">
                                 <Send className="w-4 h-4" />
                                 Assinar via WhatsApp
                              </button>
                          </div>
                      </div>

                      {/* Header Infos */}
                      <div className="grid grid-cols-4 gap-4 text-sm mt-4">
                          <div>
                              <p className="text-gray-500 text-xs mb-1">Cliente</p>
                              <p className="font-semibold text-gray-200">{selectedContract.customers?.name || 'Cliente não informado'}</p>
                              <p className="text-[10px] text-gray-500">CPF: {selectedContract.customers?.document || selectedContract.customers?.cpf || '-'}</p>
                          </div>
                          <div>
                              <p className="text-gray-500 text-xs mb-1">Projeto</p>
                              <p className="font-semibold text-gray-200">{selectedContract.projects?.name || selectedContract.sales?.projects?.name || 'Projeto não informado'}</p>
                          </div>
                          <div>
                              <p className="text-gray-500 text-xs mb-1">Localização</p>
                              <p className="font-semibold text-gray-200">QD {selectedContract.blocks?.block_name || selectedContract.blocks?.name || selectedContract.sales?.blocks?.block_name || '?'} • LT {selectedContract.blocks?.number || selectedContract.sales?.blocks?.number || '?'}</p>
                          </div>
                          <div>
                              <p className="text-gray-500 text-xs mb-1">Valor do Contrato</p>
                              <p className="font-semibold text-gray-200">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(selectedContract.sales?.total_value || selectedContract.sales?.final_value || selectedContract.sales?.agreed_price || 0))}</p>
                          </div>
                      </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex items-center gap-6 px-6 border-b border-[#1f232b]">
                      {['Visualização', 'Dados do Contrato', 'Parcelas', 'Arquivos', 'Histórico'].map(tab => (
                         <button 
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                         >
                            {tab}
                         </button>
                      ))}
                  </div>

                  {/* Body Content */}
                  <div className="flex-1 overflow-hidden flex bg-[#0b0e14]">
                      {activeTab === 'Visualização' && (
                         <>
                            <div className="flex-1 p-6 overflow-y-auto">
                                {(!selectedContract.generated_html || selectedContract.generated_html.length < 500) && (
                                    <div className="max-w-[800px] mx-auto mb-4 bg-blue-900/40 border border-blue-500/50 p-4 rounded-lg flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-blue-200 font-semibold flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Versão antiga ou sem conteúdo completo</p>
                                            <p className="text-xs text-blue-300 mt-1">Este contrato foi gerado antes do modelo completo atual. Deseja recriá-lo?</p>
                                        </div>
                                        <button onClick={handleRegenerarContrato} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors">
                                            Regenerar Contrato
                                        </button>
                                    </div>
                                )}
                                <div className="max-w-[800px] mx-auto bg-white rounded shadow-lg overflow-hidden border border-[#2d3340] origin-top p-8 text-black min-h-[800px]">
                                   {selectedContract.generated_html ? (
                                        <div dangerouslySetInnerHTML={{ __html: selectedContract.generated_html }} />
                                   ) : (
                                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 h-full py-32">
                                            <FileText className="w-16 h-16 mb-4 opacity-30" />
                                            <p>Contrato gerado sem conteúdo. Verifique o modelo.</p>
                                        </div>
                                   )}
                                </div>
                            </div>
                            
                            {/* Timeline Sidebar inside preview */}
                            <div className="w-[300px] border-l border-[#1f232b] bg-[#11151c] p-6 overflow-y-auto hidden xl:block">
                               <h3 className="text-sm font-bold text-white mb-6">Linha do Tempo</h3>
                               <div className="space-y-6">
                                   <TimelineItem icon={<FileText />} color="success" title="Contrato criado" date={new Date(selectedContract.created_at).toLocaleString('pt-BR')} author="Admin" active />
                                   <TimelineItem icon={<CheckCircle2 />} color="success" title="Cliente cadastrado" date={new Date(selectedContract.customers?.created_at || selectedContract.created_at).toLocaleString('pt-BR')} author="Admin" active />
                                   <TimelineItem icon={<Wallet />} color="info" title="Entrada registrada" subtitle="No momento da venda" active={Number(selectedContract.sales?.down_payment) > 0} />
                                   <TimelineItem icon={<FileText />} color="purple" title="PDF gerado" subtitle="Sistema" active={!!selectedContract.generated_html} />
                                   <TimelineItem icon={<Clock />} color="warning" title="Assinatura pendente" subtitle="Aguardando assinatura do cliente" active={getStatusLabel(selectedContract.status) === 'Pendente'} />
                               </div>
                            </div>
                         </>
                      )}

                      {activeTab !== 'Visualização' && (
                         <div className="flex-1 flex flex-col items-center justify-center text-gray-500 opacity-50 p-6 text-center">
                            <Clock className="w-12 h-12 mb-3" />
                            <p>Aba <strong>{activeTab}</strong> em desenvolvimento para a próxima atualização.</p>
                         </div>
                      )}
                  </div>

                  {/* BOTTOM ACTION BAR */}
                  <div className="p-4 border-t border-[#1f232b] bg-[#11151c] flex flex-wrap items-center justify-center gap-3">
                       <ActionBtn onClick={handleBaixarPDF} icon={<Download />} label="Baixar PDF" color="primary" />
                       <ActionBtn onClick={handleImprimir} icon={<Printer />} label="Imprimir" color="info" />
                       <ActionBtn onClick={handleReenviar} icon={<Send />} label="Reenviar" color="purple" />
                       <ActionBtn onClick={() => setActiveTab('Templates')} icon={<Edit />} label="Editar Modelo" color="warning" />
                       <ActionBtn onClick={handleCancelar} icon={<X />} label="Cancelar" color="danger" />
                       
                       <div className="h-8 w-[1px] bg-[#2d3340] mx-2 hidden sm:block"></div>
                       
                       <button onClick={handleGerarCarne} className="flex items-center gap-2 px-4 py-2 border border-[#2d3340] hover:bg-[#1a1f2b] text-gray-300 rounded-lg text-sm font-medium transition-colors">
                           <Receipt className="w-4 h-4" />
                           Gerar Carnê
                           <ChevronDown className="w-4 h-4 text-gray-500" />
                       </button>
                  </div>
                </>
             ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                    <div className="w-24 h-24 rounded-full bg-[#1a1f2b] flex items-center justify-center mb-6">
                       <FileText className="w-10 h-10 opacity-30" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-400 mb-2">Nenhum contrato selecionado</h3>
                    <p className="text-sm">Selecione um contrato na lista à esquerda para visualizar os detalhes.</p>
                </div>
             )}
          </div>
      </div>
    </div>
  );
}

function TimelineItem({ icon, title, subtitle, date, author, color, active }: any) {
    const colors: Record<string, string> = {
        success: 'text-[var(--color-success)] bg-[var(--color-success)]/20',
        warning: 'text-[var(--color-warning)] bg-[var(--color-warning)]/20',
        danger: 'text-[var(--color-danger)] bg-[var(--color-danger)]/20',
        info: 'text-[var(--color-info)] bg-[var(--color-info)]/20',
        purple: 'text-purple-400 bg-purple-500/20',
        inactive: 'text-gray-500 bg-[#1f232b]'
    };

    return (
        <div className="flex gap-4 relative">
             <div className="absolute left-[15px] top-8 bottom-[-24px] w-[2px] bg-[#1f232b] z-0"></div>
             <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 shrink-0 ${active ? colors[color] : colors['inactive']}`}>
                 <div className="w-4 h-4">{icon}</div>
             </div>
             <div>
                 <p className={`text-sm font-bold ${active ? 'text-gray-200' : 'text-gray-500'}`}>{title}</p>
                 {date && <p className="text-xs text-gray-500 mt-0.5">{date}</p>}
                 {subtitle && <p className={`text-xs mt-0.5 ${active && color === 'warning' ? 'text-[var(--color-warning)]' : 'text-gray-500'}`}>{subtitle}</p>}
                 {author && <p className="text-[10px] text-gray-600 mt-1">{author}</p>}
             </div>
        </div>
    );
}

function ActionBtn({ icon, label, color, onClick }: any) {
    const colorClasses: Record<string, string> = {
        primary: 'border-[var(--color-primary)]/30 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10',
        info: 'border-[var(--color-info)]/30 text-[var(--color-info)] hover:bg-[var(--color-info)]/10',
        purple: 'border-purple-500/30 text-purple-400 hover:bg-purple-500/10',
        warning: 'border-[var(--color-warning)]/30 text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10',
        danger: 'border-[var(--color-danger)]/30 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10',
    };

    return (
        <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${colorClasses[color]}`}>
            <div className="w-4 h-4">{icon}</div>
            <span className="hidden sm:inline">{label}</span>
        </button>
    );
}

