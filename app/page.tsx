'use client';

import { 
  Building2, 
  Map as MapIcon, 
  TrendingUp, 
  Users,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      {/* Header section with stats overview */}
      <header className="mb-8 pl-1">
        <h1 className="text-2xl font-bold text-white mb-1">Dashboard Operacional</h1>
        <p className="text-sm font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
          Resumo geral de loteamentos e vendas
        </p>
      </header>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard 
          title="VGV Total" 
          value="R$ 14.5M" 
          icon={TrendingUp} 
          trend="+12% me"
          trendUp={true}
        />
        <StatCard 
          title="Lotes Disponíveis" 
          value="482" 
          icon={MapIcon} 
          color="success"
        />
        <StatCard 
          title="Reservas Ativas" 
          value="35" 
          icon={Clock} 
          color="warning"
        />
        <StatCard 
          title="Vendas Concluídas" 
          value="156" 
          icon={CheckCircle2} 
          color="primary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Projects List Activity */}
        <div className="lg:col-span-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-white">Projetos Ativos</h2>
            <Link href="/projects" className="text-sm font-medium text-[var(--color-primary)] hover:underline">
              Ver todos
            </Link>
          </div>
          
          <div className="space-y-4">
            <ProjectItem 
              name="Reserva do Bosque"
              location="Castanhal, PA"
              total={200}
              sold={140}
              reserved={10}
              available={50}
            />
            <ProjectItem 
              name="Jardim das Águas"
              location="Marituba, PA"
              total={350}
              sold={210}
              reserved={35}
              available={105}
            />
            <ProjectItem 
              name="Vila Nova"
              location="Belém, PA"
              total={123}
              sold={10}
              reserved={5}
              available={108}
            />
          </div>
        </div>

        {/* Feed & Alerts */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden p-6 shadow-sm">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-[var(--color-warning)]" />
            Feed Operacional
          </h2>
          
          <div className="space-y-4">
            <FeedItem 
              time="10 min atrás"
              user="Maria Oliveira"
              action="reservou o"
              target="Lote 12, Quadra B - Jardim das Águas"
            />
            <FeedItem 
              time="2 horas atrás"
              user="Carlos Silva"
              action="vendeu o"
              target="Lote 05, Quadra A - Reserva do Bosque"
            />
            <FeedItem 
              time="Hoje, 09:30"
              user="Severino (Admin)"
              action="importou"
              target="Geometrias para Vila Nova"
            />
          </div>
          
          <button className="w-full mt-6 py-2 rounded-lg border border-[var(--color-border)] text-sm font-medium hover:bg-[var(--color-surface-bright)] transition-colors">
            Ver Histórico Completo
          </button>
        </div>
      </div>
    </div>
  );
}

// Subcomponents

function StatCard({ title, value, icon: Icon, trend, trendUp, color = 'primary' }: any) {
  const colorMap: any = {
    primary: 'text-[var(--color-primary)]',
    success: 'text-[var(--color-success)]',
    warning: 'text-[var(--color-warning)]',
    danger: 'text-[var(--color-danger)]',
  };

  const bgMap: any = {
    primary: 'bg-[var(--color-primary)]/10',
    success: 'bg-[var(--color-success)]/10',
    warning: 'bg-[var(--color-warning)]/10',
    danger: 'bg-[var(--color-danger)]/10',
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] p-6 rounded-xl relative overflow-hidden group hover:border-[var(--color-border-hover)] transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">{title}</p>
          <h3 className="text-3xl font-light text-white">{value}</h3>
          
          {trend && (
            <p className={`text-sm mt-2 font-mono ${trendUp ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
              {trend}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${bgMap[color]} ${colorMap[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

function ProjectItem({ name, location, total, sold, reserved, available }: any) {
  const soldPct = (sold / total) * 100;
  const reservedPct = (reserved / total) * 100;

  return (
    <div className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)] hover:border-[var(--color-border-hover)] transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-bold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[var(--color-primary)]" />
            {name}
          </h4>
          <p className="text-xs text-[var(--color-text-muted)] font-mono mt-1">{location} • {total} lotes totais</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-light text-white">{soldPct.toFixed(0)}% Vendido</p>
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="w-full h-2 rounded-full overflow-hidden flex bg-[var(--color-surface-dim)]">
        <div style={{ width: `${soldPct}%` }} className="bg-[var(--color-danger)]" title={`Vendido: ${sold}`} />
        <div style={{ width: `${reservedPct}%` }} className="bg-[var(--color-warning)]" title={`Reservado: ${reserved}`} />
        <div style={{ flex: 1 }} className="bg-[var(--color-success)] opacity-40" title={`Disponível: ${available}`} />
      </div>

      <div className="flex justify-between items-center mt-3 text-[11px] font-mono uppercase font-bold tracking-wider">
        <div className="flex gap-4">
          <span className="text-[var(--color-success)]"><span className="inline-block w-2 h-2 rounded-full bg-[var(--color-success)] mr-1"></span>{available} Disp</span>
          <span className="text-[var(--color-warning)]"><span className="inline-block w-2 h-2 rounded-full bg-[var(--color-warning)] mr-1"></span>{reserved} Res</span>
          <span className="text-[var(--color-danger)]"><span className="inline-block w-2 h-2 rounded-full bg-[var(--color-danger)] mr-1"></span>{sold} Vend</span>
        </div>
      </div>
    </div>
  );
}

function FeedItem({ time, user, action, target }: any) {
  return (
    <div className="flex gap-3 text-sm">
      <div className="flex flex-col items-center">
        <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] mt-1.5" />
        <div className="w-px h-full bg-[var(--color-border)] mt-1" />
      </div>
      <div className="pb-4">
        <p className="text-white">
          <span className="font-bold">{user}</span> {action} <span className="text-[var(--color-primary)]">{target}</span>
        </p>
        <p className="text-[10px] font-mono uppercase text-[var(--color-text-muted)] mt-1 tracking-wider">{time}</p>
      </div>
    </div>
  );
}
