'use client';

import { 
  Building2, 
  Map as MapIcon, 
  TrendingUp, 
  TrendingDown,
  Users,
  Clock,
  Calendar,
  Tag,
  DollarSign,
  ExternalLink,
  Plus,
  Minus,
  Crosshair,
  FileText,
  Wallet,
  UserPlus
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const authStr = localStorage.getItem('sv_lotes_auth');
    if (authStr) {
      try {
        const parsed = JSON.parse(authStr);
        setTimeout(() => setUser(parsed), 0);
      } catch(e) {}
    }
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">

      {/* Mobile Specific Header Date (only shows on small screens visually structured as in mockup) */}
      <div className="md:hidden flex justify-between items-start mb-6 pt-2">
         <div>
            <h1 className="text-lg font-medium text-white flex items-center gap-1">
              <span className="text-[var(--color-text-muted)]">Olá,</span> <strong>{user?.name || 'Usuário'}</strong>
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{user?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin Empresa'}</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-surface)] py-1.5 px-3 rounded-lg border border-[var(--color-border)]">
             <Calendar className="w-3.5 h-3.5 text-white" />
             14/05/2026
          </div>
      </div>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard 
          title="Lotes Disponíveis" 
          value="2.145" 
          icon={MapIcon} 
          trend="55% do total"
          iconColor="bg-[var(--color-success)] text-white"
          trendColor="text-[var(--color-success)]"
          hasChart={true}
        />
        <StatCard 
          title="Lotes Reservados" 
          value="382" 
          icon={Calendar} 
          trend="10% do total"
          iconColor="bg-[var(--color-warning)] text-white"
          trendColor="text-[var(--color-warning)]"
          hasChart={true}
        />
        <StatCard 
          title="Lotes Vendidos" 
          value="1.315" 
          icon={Tag} 
          trend="34% do total"
          iconColor="bg-[var(--color-danger)] text-white"
          trendColor="text-[var(--color-danger)]"
          hasChart={true}
        />
        <StatCard 
          title="VGV Total" 
          value="R$ 42.5M" 
          icon={DollarSign} 
          trend="+12.4% este mês"
          iconColor="bg-[var(--color-info)] text-white"
          trendColor="text-[var(--color-info)]"
          hasChart={true}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        
        {/* Map Preview Area (Large) */}
        <div className="xl:col-span-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden flex flex-col shadow-lg h-[400px] md:h-[500px]">
          <div className="p-5 flex justify-between items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] z-10">
            <h2 className="text-[15px] font-semibold text-white">Mapa do Empreendimento</h2>
            <Link href="/map" className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-muted)] hover:text-white transition-colors bg-[var(--color-background)] px-3 py-1.5 rounded-lg border border-[var(--color-border)]">
              Ver no Mapa GIS <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
          <div className="flex-1 relative bg-[#0b1111]">
            {/* Using a styled div to simulate the map in the dashboard view exactly like the mockup, avoiding heavy iframe loading for preview */}
            <div 
              className="absolute inset-0 opacity-80" 
              style={{
                backgroundImage: 'url("https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=2000")',
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }} 
            />
            
            {/* Simulated overlay grid for lots */}
            <div className="absolute inset-0 flex items-center justify-center p-8">
               <div className="w-full max-w-2xl h-[80%] grid grid-cols-6 grid-rows-4 gap-1 md:gap-2 transform -rotate-12 skew-x-12 scale-110">
                  {Array.from({ length: 24 }).map((_, i) => {
                    let bg = i % 7 === 0 ? 'bg-[var(--color-danger)]' : i % 5 === 0 ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-success)]';
                    if (i === 2 || i === 8 || i === 14) bg = 'bg-transparent border-none'; // Fake roads
                    return <div key={i} className={`${bg} opacity-70 border border-white/20 rounded-sm hover:opacity-100 cursor-pointer shadow-lg`} />
                  })}
               </div>
            </div>

            {/* Map Legend */}
            <div className="absolute bottom-5 left-5 bg-[var(--color-surface)]/95 backdrop-blur-md border border-[var(--color-border)] rounded-xl p-3 md:p-4 shadow-xl z-20">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-8 text-[13px]">
                  <div className="flex items-center gap-3 text-white"><div className="w-3.5 h-3.5 rounded-[4px] bg-[var(--color-success)]" /> Disponível</div>
                  <span className="font-mono text-white text-right">2.145</span>
                </div>
                <div className="flex items-center justify-between gap-8 text-[13px]">
                  <div className="flex items-center gap-3 text-white"><div className="w-3.5 h-3.5 rounded-[4px] bg-[var(--color-warning)]" /> Reservado</div>
                  <span className="font-mono text-white text-right">382</span>
                </div>
                <div className="flex items-center justify-between gap-8 text-[13px]">
                  <div className="flex items-center gap-3 text-white"><div className="w-3.5 h-3.5 rounded-[4px] bg-[var(--color-danger)]" /> Vendido</div>
                  <span className="font-mono text-white text-right">1.315</span>
                </div>
              </div>
            </div>

            {/* Map Controls */}
            <div className="absolute bottom-5 right-5 bg-[var(--color-surface)]/90 backdrop-blur-md border border-[var(--color-border)] rounded-xl flex flex-col shadow-xl overflow-hidden z-20">
              <button className="p-3 text-white hover:bg-[var(--color-surface-bright)] border-b border-[var(--color-border)] transition-colors"><Plus className="w-5 h-5"/></button>
              <button className="p-3 text-white hover:bg-[var(--color-surface-bright)] border-b border-[var(--color-border)] transition-colors"><Minus className="w-5 h-5"/></button>
              <button className="p-3 text-white hover:bg-[var(--color-surface-bright)] transition-colors"><Crosshair className="w-5 h-5"/></button>
            </div>
          </div>
        </div>

        {/* Recent Activities Area */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-lg flex flex-col h-[400px] md:h-[500px]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[15px] font-semibold text-white">Atividades Recentes</h2>
            <Link href="/" className="text-sm font-medium text-[var(--color-info)] hover:underline">
              Ver todas
            </Link>
          </div>
          
          <div className="space-y-6 flex-1 overflow-y-auto pr-2 pb-2">
            <FeedItem 
              time="Há 10 min"
              title="Lote Q05 LT 12 reservado"
              subtitle="Por Maria Silva"
              icon={Calendar}
              iconColor="bg-[var(--color-success)]/10 text-[var(--color-success)]"
            />
            <FeedItem 
              time="Há 25 min"
              title="Lote Q02 LT 08 vendido"
              subtitle="Para João Santos"
              icon={Tag}
              iconColor="bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
            />
            <FeedItem 
              time="Há 1 hora"
              title="Contrato #1234 emitido"
              subtitle="Lote Q01 LT 03"
              icon={FileText}
              iconColor="bg-[var(--color-info)]/10 text-[var(--color-info)]"
            />
            <FeedItem 
              time="Há 2 horas"
              title="Pagamento recebido"
              subtitle="Parcela 3/120 - R$ 850,00"
              icon={Wallet}
              iconColor="bg-[var(--color-warning)]/10 text-[var(--color-warning)]"
            />
            <FeedItem 
              time="Há 3 horas"
              title="Novo cliente cadastrado"
              subtitle="Carlos Alberto"
              icon={UserPlus}
              iconColor="bg-[var(--color-purple)]/10 text-[var(--color-purple)]"
            />
          </div>
        </div>

      </div>

      {/* Bottom Summary Section */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-lg mb-8">
         <h2 className="text-[15px] font-semibold text-white mb-6">Resumo Geral</h2>
         <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--color-success)]/10 text-[var(--color-success)]">
                  <MapIcon className="w-6 h-6" />
               </div>
               <div>
                 <p className="text-[13px] text-[var(--color-text-muted)] mb-0.5">Total de Lotes</p>
                 <h4 className="text-xl font-medium text-white tracking-wide">3.842</h4>
               </div>
            </div>
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--color-warning)]/10 text-[var(--color-warning)]">
                  <Calendar className="w-6 h-6" />
               </div>
               <div>
                 <p className="text-[13px] text-[var(--color-text-muted)] mb-0.5">Reservas Ativas</p>
                 <h4 className="text-xl font-medium text-white tracking-wide">128</h4>
               </div>
            </div>
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--color-danger)]/10 text-[var(--color-danger)]">
                  <Tag className="w-6 h-6" />
               </div>
               <div>
                 <p className="text-[13px] text-[var(--color-text-muted)] mb-0.5">Vendas do Mês</p>
                 <h4 className="text-xl font-medium text-white tracking-wide">56</h4>
               </div>
            </div>
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--color-info)]/10 text-[var(--color-info)]">
                  <DollarSign className="w-6 h-6" />
               </div>
               <div>
                 <p className="text-[13px] text-[var(--color-text-muted)] mb-0.5">Recebimentos</p>
                 <h4 className="text-xl font-medium text-white tracking-wide">R$ 285.740,00</h4>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}

// Subcomponents

function StatCard({ title, value, icon: Icon, trend, iconColor, trendColor, hasChart }: any) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] p-5 md:p-6 rounded-2xl relative overflow-hidden group hover:border-[var(--color-border-hover)] transition-colors shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className={`p-2.5 rounded-xl block md:hidden self-start w-fit ${iconColor}`}>
             <Icon className="w-6 h-6" strokeWidth={1.5} />
          </div>
          <p className="text-[13px] text-[var(--color-text-muted)] font-medium leading-tight md:mt-2">{title}</p>
          <h3 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">{value}</h3>
          
          <div className="flex items-center gap-2 mt-1 md:mt-2">
            {hasChart && <TrendingUp className={`hidden md:block w-4 h-4 ${trendColor}`} />}
            <span className={`text-[13px] font-medium ${trendColor}`}>
              {trend}
            </span>
          </div>
        </div>
        <div className={`p-3.5 rounded-2xl hidden md:flex items-center justify-center ${iconColor} shadow-lg`}>
          <Icon className="w-7 h-7" strokeWidth={1.5} />
        </div>
        {hasChart && (
           <TrendingUp className={`block md:hidden absolute bottom-5 right-5 w-5 h-5 opacity-50 ${trendColor}`} />
        )}
      </div>
    </div>
  );
}

function FeedItem({ time, title, subtitle, iconColor, icon: Icon }: any) {
  return (
    <div className="flex gap-4 items-start group cursor-pointer">
      <div className={`p-2.5 rounded-xl ${iconColor} flex-shrink-0 mt-0.5`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center justify-between gap-1">
        <div>
           <p className="text-[14px] text-white font-medium group-hover:text-[var(--color-info)] transition-colors truncate">
             {title}
           </p>
           <p className="text-[13px] text-[var(--color-text-muted)] truncate">{subtitle}</p>
        </div>
        <p className="text-[12px] text-[var(--color-text-muted)] md:text-right flex-shrink-0">{time}</p>
      </div>
    </div>
  );
}
