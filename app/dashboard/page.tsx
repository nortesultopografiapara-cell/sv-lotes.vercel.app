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
import dynamic from 'next/dynamic';
import SuperAdminDashboard from './SuperAdminDashboard';

const GISMap = dynamic(() => import('@/components/map/GISMap'), { ssr: false });

export default function DashboardPage() {
  const { user } = useAuth();
  
  if (user?.role === 'SUPER_ADMIN') {
    return <SuperAdminDashboard user={user} />;
  }
  
  return <OperationalDashboard user={user} />;
}

function OperationalDashboard({ user }: { user: any }) {
  const [stats, setStats] = useState({
    available: 0,
    reserved: 0,
    sold: 0,
    vgv: 0
  });
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  useEffect(() => {
    async function loadDashboardStats() {
      if (!user) return;
      
      try {
        let query = supabase.from('blocks').select('project_id, status, price', { count: 'exact' });
        let projectsQuery = supabase.from('projects').select('id, name');
        
        if (user.role !== 'SUPER_ADMIN' && user.tenant_id) {
          query = query.or(`tenant_id.eq.${user.tenant_id},company_id.eq.${user.tenant_id}`);
          projectsQuery = projectsQuery.or(`tenant_id.eq.${user.tenant_id},company_id.eq.${user.tenant_id}`);
        } else if (user.role !== 'SUPER_ADMIN' && !user.tenant_id) {
          setLoading(false);
          return;
        }

        const { data, error } = await query;
        const { data: projectsData } = await projectsQuery;

        if (projectsData) {
          setProjects(projectsData);
          if (projectsData.length > 0 && !selectedProjectId) {
             setSelectedProjectId(projectsData[0].id);
          }
        }
        
        if (error) throw error;

        let available = 0;
        let reserved = 0;
        let sold = 0;
        let vgv = 0;

        if (data) {
          data.forEach(lot => {
            if (selectedProjectId && lot.project_id !== selectedProjectId) return;
            
            if (lot.status === 'Disponível') available++;
            if (lot.status === 'Reservado') reserved++;
            if (lot.status === 'Vendido') {
              sold++;
              vgv += Number(lot.price || 0);
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
  }, [user, selectedProjectId]);

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
      case 'Reservado': return { icon: Calendar, color: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]' };
      case 'Vendido': return { icon: Tag, color: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' };
      case 'NEW_CLIENT': return { icon: UserPlus, color: 'bg-[var(--color-purple)]/10 text-[var(--color-purple)]' };
      case 'PAYMENT': return { icon: Wallet, color: 'bg-[var(--color-success)]/10 text-[var(--color-success)]' };
      default: return { icon: FileText, color: 'bg-[var(--color-info)]/10 text-[var(--color-info)]' };
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">

      {/* Mobile Specific Header Date */}
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

      {/* Project Selector */}
      <div className="mb-6 flex items-center gap-4">
        <label htmlFor="project-select" className="text-[var(--color-text-muted)] text-sm font-medium">Projeto:</label>
        <select 
           id="project-select"
           value={selectedProjectId}
           onChange={(e) => setSelectedProjectId(e.target.value)}
           className="bg-[var(--color-surface)] border border-[var(--color-border)] text-white text-sm py-2 px-3 rounded-lg focus:outline-none focus:border-[var(--color-primary)] outline-none min-w-[200px]"
        >
           {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
           ))}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Lotes Disponíveis" value={loading ? '-' : stats.available} icon={MapIcon} trend="" iconColor="bg-[var(--color-success)] text-white" trendColor="text-[var(--color-success)]" hasChart={false} />
        <StatCard title="Lotes Reservados" value={loading ? '-' : stats.reserved} icon={Calendar} trend="" iconColor="bg-[var(--color-warning)] text-white" trendColor="text-[var(--color-warning)]" hasChart={false} />
        <StatCard title="Lotes Vendidos" value={loading ? '-' : stats.sold} icon={Tag} trend="" iconColor="bg-[var(--color-danger)] text-white" trendColor="text-[var(--color-danger)]" hasChart={false} />
        <StatCard title="VGV Total" value={loading ? '-' : formatCurrency(stats.vgv)} icon={DollarSign} trend="" iconColor="bg-[var(--color-info)] text-white" trendColor="text-[var(--color-info)]" hasChart={false} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        <div className="xl:col-span-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden flex flex-col shadow-lg h-[400px] md:h-[500px]">
          <div className="p-5 flex justify-between items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] z-10">
            <h2 className="text-[15px] font-semibold text-white">Mapa do Empreendimento</h2>
            <Link href="/map" className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-muted)] hover:text-white transition-colors bg-[var(--color-background)] px-3 py-1.5 rounded-lg border border-[var(--color-border)]">
              Ver no Mapa GIS <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
          <div className="flex-1 relative bg-[#0b1111]">
            {selectedProjectId ? (
               <div className="absolute inset-0">
                  <GISMap projectId={selectedProjectId} activeLayer="satellite" />
               </div>
            ) : (
               <div className="flex items-center justify-center h-full text-white">Carregando mapa...</div>
            )}
            <div className="absolute bottom-5 left-5 bg-[var(--color-surface)]/95 backdrop-blur-md border border-[var(--color-border)] rounded-xl p-3 md:p-4 shadow-xl z-[400]">
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
          </div>
        </div>

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
                return (
                  <FeedItem key={activity.id} time={formatTimeAgo(activity.created_at)} title={activity.details?.title || activity.action} subtitle={activity.details?.subtitle || `Por ${activity.users?.full_name || 'Usuário'}`} icon={icon} iconColor={color} />
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

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-lg mb-8">
         <h2 className="text-[15px] font-semibold text-white mb-6">Resumo Geral</h2>
         <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <SummaryItem title="Total de Lotes" value={loading ? '-' : (stats.available + stats.reserved + stats.sold)} icon={MapIcon} color="bg-[var(--color-success)]/10 text-[var(--color-success)]" />
            <SummaryItem title="Reservas Ativas" value={loading ? '-' : stats.reserved} icon={Calendar} color="bg-[var(--color-warning)]/10 text-[var(--color-warning)]" />
            <SummaryItem title="Lotes Vendidos" value={loading ? '-' : stats.sold} icon={Tag} color="bg-[var(--color-danger)]/10 text-[var(--color-danger)]" />
            <SummaryItem title="VGV Total" value={loading ? '-' : formatCurrency(stats.vgv)} icon={DollarSign} color="bg-[var(--color-info)]/10 text-[var(--color-info)]" />
         </div>
      </div>
    </div>
  );
}

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
            <span className={`text-[13px] font-medium ${trendColor}`}>{trend}</span>
          </div>
        </div>
        <div className={`p-3.5 rounded-2xl hidden md:flex items-center justify-center ${iconColor} shadow-lg`}>
          <Icon className="w-7 h-7" strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ title, value, icon: Icon, color }: any) {
  return (
    <div className="flex items-center gap-4">
       <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-6 h-6" />
       </div>
       <div>
         <p className="text-[13px] text-[var(--color-text-muted)] mb-0.5">{title}</p>
         <h4 className="text-xl font-medium text-white tracking-wide">{value}</h4>
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
           <p className="text-[14px] text-white font-medium group-hover:text-[var(--color-info)] transition-colors truncate">{title}</p>
           <p className="text-[13px] text-[var(--color-text-muted)] truncate">{subtitle}</p>
        </div>
        <p className="text-[12px] text-[var(--color-text-muted)] md:text-right flex-shrink-0">{time}</p>
      </div>
    </div>
  );
}
