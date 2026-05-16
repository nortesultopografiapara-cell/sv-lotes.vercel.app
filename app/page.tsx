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
  UserPlus,
  Loader2
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    available: 0,
    reserved: 0,
    sold: 0,
    vgv: 0
  });
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardStats() {
      if (!user) return;
      
      try {
        let query = supabase.from('blocks').select('status, price', { count: 'exact' });
        
        // Se não for super admin, limita por tenant
        if (user.role !== 'SUPER_ADMIN' && user.tenant_id) {
          query = query.eq('tenant_id', user.tenant_id);
        }

        const { data, error } = await query;
        
        if (error) throw error;

        let available = 0;
        let reserved = 0;
        let sold = 0;
        let vgv = 0;

        if (data) {
          data.forEach(lot => {
            if (lot.status === 'AVAILABLE') available++;
            if (lot.status === 'RESERVED') reserved++;
            if (lot.status === 'SOLD') {
              sold++;
              vgv += Number(lot.price || 0); // Accumulate actual sales value or lot price.
            }
          });
        }

        // Load Activities / Logs
        let logsQuery = supabase.from('logs').select('*, users(full_name)').order('created_at', { ascending: false }).limit(5);
        if (user.role !== 'SUPER_ADMIN' && user.tenant_id) {
          logsQuery = logsQuery.eq('tenant_id', user.tenant_id);
        }
        
        const { data: logsData } = await logsQuery;
        setActivities(logsData || []);
        
        setStats({ available, reserved, sold, vgv });
      } catch (err) {
        console.error("Dashboard stats error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardStats();
  }, [user]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };


  const formatTimeAgo = (dateStr: string) => {
    const diff = new Date().getTime() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `Há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Há ${hours} h`;
    return `Há ${Math.floor(hours / 24)} dias`;
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'RESERVED': return { icon: Calendar, color: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' };
      case 'SOLD': return { icon: Tag, color: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' };
      case 'NEW_CLIENT': return { icon: UserPlus, color: 'bg-[var(--color-purple)]/10 text-[var(--color-purple)]' };
      case 'PAYMENT': return { icon: Wallet, color: 'bg-[var(--color-success)]/10 text-[var(--color-success)]' };
      default: return { icon: FileText, color: 'bg-[var(--color-info)]/10 text-[var(--color-info)]' };
    }
  };

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
          value={loading ? '-' : stats.available} 
          icon={MapIcon} 
          trend=""
          iconColor="bg-[var(--color-success)] text-white"
          trendColor="text-[var(--color-success)]"
          hasChart={false}
        />
        <StatCard 
          title="Lotes Reservados" 
          value={loading ? '-' : stats.reserved} 
          icon={Calendar} 
          trend=""
          iconColor="bg-[var(--color-warning)] text-white"
          trendColor="text-[var(--color-warning)]"
          hasChart={false}
        />
        <StatCard 
          title="Lotes Vendidos" 
          value={loading ? '-' : stats.sold} 
          icon={Tag} 
          trend=""
          iconColor="bg-[var(--color-danger)] text-white"
          trendColor="text-[var(--color-danger)]"
          hasChart={false}
        />
        <StatCard 
          title="VGV Total" 
          value={loading ? '-' : formatCurrency(stats.vgv)} 
          icon={DollarSign} 
          trend=""
          iconColor="bg-[var(--color-info)] text-white"
          trendColor="text-[var(--color-info)]"
          hasChart={false}
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
                  <span className="font-mono text-white text-right">{loading ? '-' : stats.available}</span>
                </div>
                <div className="flex items-center justify-between gap-8 text-[13px]">
                  <div className="flex items-center gap-3 text-white"><div className="w-3.5 h-3.5 rounded-[4px] bg-[var(--color-warning)]" /> Reservado</div>
                  <span className="font-mono text-white text-right">{loading ? '-' : stats.reserved}</span>
                </div>
                <div className="flex items-center justify-between gap-8 text-[13px]">
                  <div className="flex items-center gap-3 text-white"><div className="w-3.5 h-3.5 rounded-[4px] bg-[var(--color-danger)]" /> Vendido</div>
                  <span className="font-mono text-white text-right">{loading ? '-' : stats.sold}</span>
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
            {loading ? (
              <div className="flex flex-col gap-4 text-[var(--color-text-muted)] text-sm items-center justify-center h-full">
                <Loader2 className="w-5 h-5 animate-spin" />
                Carregando...
              </div>
            ) : activities.length > 0 ? (
              activities.map((activity) => {
                const { icon, color } = getActionIcon(activity.action);
                const title = activity.details?.title || activity.action;
                const subtitle = activity.details?.subtitle || `Por ${activity.users?.full_name || 'Usuário'}`;
                
                return (
                  <FeedItem 
                    key={activity.id}
                    time={formatTimeAgo(activity.created_at)}
                    title={title}
                    subtitle={subtitle}
                    icon={icon}
                    iconColor={color}
                  />
                );
              })
            ) : (
              <div className="flex flex-col gap-2 text-[var(--color-text-muted)] text-sm items-center justify-center h-full">
                <FileText className="w-8 h-8 opacity-20" />
                Nenhuma atividade recente.
              </div>
            )}
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
                 <h4 className="text-xl font-medium text-white tracking-wide">{loading ? '-' : (stats.available + stats.reserved + stats.sold)}</h4>
               </div>
            </div>
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--color-warning)]/10 text-[var(--color-warning)]">
                  <Calendar className="w-6 h-6" />
               </div>
               <div>
                 <p className="text-[13px] text-[var(--color-text-muted)] mb-0.5">Reservas Ativas</p>
                 <h4 className="text-xl font-medium text-white tracking-wide">{loading ? '-' : stats.reserved}</h4>
               </div>
            </div>
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--color-danger)]/10 text-[var(--color-danger)]">
                  <Tag className="w-6 h-6" />
               </div>
               <div>
                 <p className="text-[13px] text-[var(--color-text-muted)] mb-0.5">Lotes Vendidos</p>
                 <h4 className="text-xl font-medium text-white tracking-wide">{loading ? '-' : stats.sold}</h4>
               </div>
            </div>
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--color-info)]/10 text-[var(--color-info)]">
                  <DollarSign className="w-6 h-6" />
               </div>
               <div>
                 <p className="text-[13px] text-[var(--color-text-muted)] mb-0.5">VGV Total</p>
                 <h4 className="text-xl font-medium text-white tracking-wide">{loading ? '-' : formatCurrency(stats.vgv)}</h4>
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
