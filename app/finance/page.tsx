'use client';

import { Banknote, Search, Download, Filter, TrendingDown, TrendingUp, AlertCircle } from 'lucide-react';
import { useState } from 'react';

export default function FinancePage() {
  const [search, setSearch] = useState('');

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col h-full">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Módulo Financeiro</h1>
          <p className="text-sm font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
            Contratos, Titulos e Inadimplência
          </p>
        </div>
        <button className="bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-surface-bright)] text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors">
          <Download className="w-5 h-5" />
          Exportar Relatório
        </button>
      </header>

      {/* Finance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Recebimentos Mês</p>
              <h3 className="text-2xl font-light text-white">R$ 145.200,00</h3>
            </div>
            <div className="p-2 rounded-lg bg-[var(--color-success)]/10 text-[var(--color-success)]">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>
        
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider mb-1">A Receber Mês</p>
              <h3 className="text-2xl font-light text-white">R$ 45.000,00</h3>
            </div>
            <div className="p-2 rounded-lg bg-[var(--color-warning)]/10 text-[var(--color-warning)]">
              <Banknote className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-danger)] rounded-xl p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-2 h-full bg-[var(--color-danger)]" />
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Inadimplência</p>
              <h3 className="text-2xl font-light text-[var(--color-danger)]">R$ 28.500,00</h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">12 contratos pendentes</p>
            </div>
            <div className="p-2 rounded-lg bg-[var(--color-danger)]/10 text-[var(--color-danger)]">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl flex-1 flex flex-col overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[var(--color-border)] flex gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-[var(--color-text-muted)]" />
            <input 
              type="text" 
              placeholder="Buscar contrato ou cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <select className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] hidden md:block">
            <option>Todas as Situações</option>
            <option>Recebidos</option>
            <option>A Vencer</option>
            <option>Em Atraso</option>
          </select>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] z-10">
              <tr>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Contrato / Lote</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Cliente</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Vencimento</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-right">Valor Parcela</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-center">Situação</th>
              </tr>
            </thead>
            <tbody>
              <FinanceRow 
                contract="CTR-001/24"
                lote="Qd A, Lt 01 - R. do Bosque"
                client="João Batista Souza"
                dueDate="15/05/2026"
                value="R$ 1.500,00"
                status="PAGO"
              />
              <FinanceRow 
                contract="CTR-002/24"
                lote="Qd C, Lt 15 - R. do Bosque"
                client="Maria Fernandes"
                dueDate="20/05/2026"
                value="R$ 1.250,00"
                status="A VENCER"
              />
              <FinanceRow 
                contract="CTR-045/23"
                lote="Qd D, Lt 05 - J. Águas"
                client="Carlos Silva"
                dueDate="05/05/2026"
                value="R$ 950,00"
                status="ATRASADO"
              />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FinanceRow({ contract, lote, client, dueDate, value, status }: any) {
  const getStatusStyle = (s: string) => {
    switch(s) {
      case 'PAGO': return 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/20';
      case 'A VENCER': return 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/20';
      case 'ATRASADO': return 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/20';
      default: return 'bg-[var(--color-surface-dim)] text-[var(--color-text-muted)] border-[var(--color-border)]';
    }
  };

  return (
    <tr className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-bright)] transition-colors group cursor-pointer">
      <td className="p-4">
        <div className="font-mono text-xs font-bold text-white mb-1">{contract}</div>
        <div className="text-xs text-[var(--color-text-muted)]">{lote}</div>
      </td>
      <td className="p-4 font-medium text-sm text-white">
        {client}
      </td>
      <td className="p-4 font-mono text-sm text-[var(--color-text-muted)]">
        {dueDate}
      </td>
      <td className="p-4 font-mono text-sm font-medium text-white text-right">
        {value}
      </td>
      <td className="p-4 text-center">
        <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${getStatusStyle(status)}`}>
          {status}
        </span>
      </td>
    </tr>
  );
}
