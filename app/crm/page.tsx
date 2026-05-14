'use client';

import { Users, Search, Plus, Filter, Phone, Mail, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';

export default function CRMPage() {
  const [search, setSearch] = useState('');

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col h-full">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">CRM Imobiliário</h1>
          <p className="text-sm font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
            Gestão de Leads e Clientes
          </p>
        </div>
        <button className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors">
          <Plus className="w-5 h-5" />
          Novo Lead
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
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] z-10">
              <tr>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Cliente / Lead</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold hidden md:table-cell">Contato</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Status (Funil)</th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold hidden lg:table-cell">Última Interação</th>
                <th className="p-4 w-16"></th>
              </tr>
            </thead>
            <tbody>
              <ClientRow 
                name="João Batista Souza"
                cpf="123.456.789-00"
                email="joao.batista@exemplo.com"
                phone="(91) 98888-1111"
                status="COMPROU"
                lastActive="Ontem"
              />
              <ClientRow 
                name="Maria Fernandes"
                cpf="098.765.432-11"
                email="maria.f@exemplo.com"
                phone="(91) 97777-2222"
                status="MUITO QUENTE"
                lastActive="Hoje, 10h"
              />
              <ClientRow 
                name="Carlos Eduardo Silva"
                cpf=""
                email="carlos.ed@exemplo.com"
                phone="(91) 96666-3333"
                status="NOVO LEAD"
                lastActive="Há 2h"
              />
              <ClientRow 
                name="Ana Clara"
                cpf="555.444.333-22"
                email="ana.clara@exemplo.com"
                phone="(91) 95555-4444"
                status="RESERVOU"
                lastActive="Há 3 dias"
              />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ClientRow({ name, cpf, email, phone, status, lastActive }: any) {
  const getStatusStyle = (s: string) => {
    switch(s) {
      case 'COMPROU': return 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/20';
      case 'RESERVOU': return 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/20';
      case 'MUITO QUENTE': return 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/20';
      case 'NOVO LEAD': return 'bg-[var(--color-surface-dim)] text-[var(--color-text-main)] border-[var(--color-border)]';
      default: return 'bg-[var(--color-surface-dim)] text-[var(--color-text-muted)] border-[var(--color-border)]';
    }
  };

  return (
    <tr className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-bright)] transition-colors group">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--color-background)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-primary)] font-bold">
            {name.charAt(0)}
          </div>
          <div>
            <div className="font-bold text-sm text-white">{name}</div>
            <div className="text-xs text-[var(--color-text-muted)] font-mono mt-0.5">{cpf || 'Sem CPF'}</div>
          </div>
        </div>
      </td>
      <td className="p-4 hidden md:table-cell">
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
        <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${getStatusStyle(status)}`}>
          {status}
        </span>
      </td>
      <td className="p-4 hidden lg:table-cell text-sm font-mono text-[var(--color-text-muted)]">
        {lastActive}
      </td>
      <td className="p-4 text-right">
        <button className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </td>
    </tr>
  );
}
