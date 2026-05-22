'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Map as MapIcon, 
  FolderOpen, 
  Users, 
  Wallet,
  Menu,
  Bell,
  User,
  ChevronDown,
  Building2,
  LogOut,
  Settings,
  FileText,
  TrendingDown,
  AlertCircle,
  Banknote,
  Plus
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessionGuard } from '@/hooks/useSessionGuard';

function NotificationBell({ user }: { user: any }) {
  const [show, setShow] = useState(false);
  const [hidden, setHidden] = useState(false);
  const router = useRouter();
  const [stats, setStats] = useState({
     qtyLate: 0,
     qtyDueToday: 0,
     qtyNext7Days: 0,
     qtyNoPaymentContracts: 0
  });

  useEffect(() => {
    async function loadAlerts() {
      if (!user) return;
      try {
        let query = supabase.from('finance_receipts').select('amount, due_date, status, sale_id');
        if (user.role !== 'SUPER_ADMIN' && user.tenant_id) {
           query = query.eq('tenant_id', user.tenant_id);
        }
        const { data, error } = await query;
        if (error || !data) return;

        let qtyLate = 0;
        let qtyDueToday = 0;
        let qtyNext7Days = 0;
        const paidContracts = new Set<string>();
        const allContracts = new Set<string>();

        const today = new Date();
        today.setUTCHours(0,0,0,0);
        const todayStr = today.toISOString().split('T')[0];
        const todayTime = today.getTime();

        data.forEach(p => {
             const dueDate = new Date(p.due_date);
             const dueStr = p.due_date.split('T')[0];
             
             let computedStatus = p.status?.toLowerCase() || 'pendente';
             if ((computedStatus === 'pendente' || computedStatus === 'pending') && dueStr < todayStr) {
                 computedStatus = 'atrasado';
             }

             if (p.sale_id) {
                allContracts.add(p.sale_id);
                if (computedStatus === 'pago' || computedStatus === 'paid') {
                   paidContracts.add(p.sale_id);
                }
             }

             if (computedStatus === 'atrasado') {
                 qtyLate++;
             } else if (computedStatus === 'pendente' || computedStatus === 'pending') {
                 if (dueStr === todayStr) {
                     qtyDueToday++;
                 } else if (dueDate.getTime() > todayTime && dueDate.getTime() <= todayTime + 7*24*60*60*1000) {
                     qtyNext7Days++;
                 }
             }
        });

        let qtyNoPaymentContracts = 0;
        allContracts.forEach(c => {
           if (!paidContracts.has(c)) qtyNoPaymentContracts++;
        });

        setStats({ qtyLate, qtyDueToday, qtyNext7Days, qtyNoPaymentContracts });

      } catch(err) {
        // ignore
      }
    }
    loadAlerts();

    // Listen to custom local event for immediate feedback without refreshing page
    const handleLocalUpdate = () => loadAlerts();
    window.addEventListener('finance_updated', handleLocalUpdate);

    // Supabase Realtime subscription
    let channel: any = null;
    if (user?.tenant_id || user?.role === 'SUPER_ADMIN') {
        channel = supabase.channel('finance_receipts_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_receipts' }, () => {
                loadAlerts();
            })
            .subscribe();
    }

    return () => {
        window.removeEventListener('finance_updated', handleLocalUpdate);
        if (channel) supabase.removeChannel(channel);
    };
  }, [user]);

  const totalAlerts = stats.qtyLate + stats.qtyDueToday + stats.qtyNext7Days + stats.qtyNoPaymentContracts;

  return (
    <div className="relative">
      <button 
        onClick={() => { setShow(!show); setHidden(false); }}
        className="relative text-[var(--color-text-muted)] hover:text-white transition-colors"
      >
        <Bell className="w-6 h-6" />
        {!hidden && totalAlerts > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-danger)] border-2 border-[var(--color-surface)] text-[8px] font-bold text-white shadow-sm">
            {totalAlerts}
          </span>
        )}
      </button>

      {show && (
        <div className="absolute right-0 mt-2 w-72 bg-[#13161c] border border-[#1f232b] rounded-xl shadow-2xl overflow-hidden z-[9999]" style={{ top: '100%' }}>
           <div className="p-4 border-b border-[#1f232b] flex justify-between items-center bg-[#181c25]">
              <h3 className="font-semibold text-white">Notificações</h3>
              <span className="text-xs bg-[#1f232b] text-gray-300 px-2 py-0.5 rounded font-bold">
                 {totalAlerts} Alertas
              </span>
           </div>
           <div className="p-2 max-h-64 overflow-y-auto">
              {stats.qtyLate > 0 && (
                <div className="px-3 py-2 border-b border-[#1f232b]/50 hover:bg-[#1f232b]/30 rounded-lg transition-colors flex gap-3 items-center group">
                   <div className="w-8 h-8 rounded-full bg-[var(--color-danger)]/10 text-[var(--color-danger)] flex items-center justify-center shrink-0">
                     <TrendingDown className="w-4 h-4" />
                   </div>
                   <div>
                     <p className="text-sm font-medium text-gray-200">{stats.qtyLate} parcelas vencidas</p>
                     <p className="text-xs text-gray-500">Exigem cobrança urgente</p>
                   </div>
                </div>
              )}
              {stats.qtyDueToday > 0 && (
                <div className="px-3 py-2 border-b border-[#1f232b]/50 hover:bg-[#1f232b]/30 rounded-lg transition-colors flex gap-3 items-center group">
                   <div className="w-8 h-8 rounded-full bg-[var(--color-warning)]/10 text-[var(--color-warning)] flex items-center justify-center shrink-0">
                     <AlertCircle className="w-4 h-4" />
                   </div>
                   <div>
                     <p className="text-sm font-medium text-gray-200">{stats.qtyDueToday} parcelas vencem hoje</p>
                     <p className="text-xs text-gray-500">Acompanhamento diário</p>
                   </div>
                </div>
              )}
              {stats.qtyNext7Days > 0 && (
                <div className="px-3 py-2 border-b border-[#1f232b]/50 hover:bg-[#1f232b]/30 rounded-lg transition-colors flex gap-3 items-center group">
                   <div className="w-8 h-8 rounded-full bg-[var(--color-info)]/10 text-[var(--color-info)] flex items-center justify-center shrink-0">
                     <Banknote className="w-4 h-4" />
                   </div>
                   <div>
                     <p className="text-sm font-medium text-gray-200">{stats.qtyNext7Days} nos próximos 7 dias</p>
                     <p className="text-xs text-gray-500">Programe-se</p>
                   </div>
                </div>
              )}
              {stats.qtyNoPaymentContracts > 0 && (
                <div className="px-3 py-2 hover:bg-[#1f232b]/30 rounded-lg transition-colors flex gap-3 items-center group">
                   <div className="w-8 h-8 rounded-full bg-gray-500/10 text-gray-400 flex items-center justify-center shrink-0">
                     <FileText className="w-4 h-4" />
                   </div>
                   <div>
                     <p className="text-sm font-medium text-gray-200">{stats.qtyNoPaymentContracts} contratos sem base</p>
                     <p className="text-xs text-gray-500">Sem pagamentos recebidos</p>
                   </div>
                </div>
              )}
              {totalAlerts === 0 && (
                <div className="px-3 py-6 text-center">
                   <p className="text-sm font-medium text-[var(--color-text-muted)]">Sem notificações</p>
                </div>
              )}
           </div>
           <div className="p-4 border-t border-[#1f232b] flex flex-col gap-2 bg-[#181c25]">
              <button onClick={() => { setShow(false); router.push('/finance'); }} className="w-full py-2 bg-[var(--color-primary)] hover:opacity-90 text-white rounded font-medium transition-colors text-sm">
                 Ver financeiro
              </button>
              <button onClick={() => { setHidden(true); setShow(false); }} className="w-full py-2 bg-transparent border border-[var(--color-border)] hover:bg-[#1a1f29] text-gray-300 rounded font-medium transition-colors text-sm">
                 Limpar notificações visuais
              </button>
           </div>
        </div>
      )}
    </div>
  );
}

const getMenuItems = (role: string) => {
  if (role === 'SUPER_ADMIN') {
    return [
      { name: 'GESTÃO DA PLATAFORMA', isSection: true },
      { name: 'Dashboard SaaS', href: '/dashboard', icon: LayoutDashboard, color: 'text-[var(--color-primary)]' },
      { name: 'Empresas', href: '/companies', icon: Building2, color: 'text-gray-300' },
      { name: 'Planos & Assinaturas', href: '/plans', icon: Banknote, color: 'text-gray-300' },
      { name: 'Usuários', href: '/users', icon: Users, color: 'text-gray-300' },
      { name: 'Financeiro SaaS', href: '/saas-finance', icon: Wallet, color: 'text-gray-300' },
      { name: 'Relatórios Globais', href: '/reports', icon: TrendingDown, color: 'text-gray-300' },
      { name: 'SEGURANÇA E SUPORTE', isSection: true },
      { name: 'Logs de Auditoria', href: '/logs', icon: AlertCircle, color: 'text-gray-300' },
      { name: 'Monitoramento', href: '/monitoring', icon: TrendingDown, color: 'text-gray-300' },
      { name: 'Suporte', href: '/support', icon: User, color: 'text-gray-300' },
      { name: 'Configurações Globais', href: '/settings/global', icon: Settings, color: 'text-gray-300' },
      { name: 'Integrações', href: '/integrations', icon: Settings, color: 'text-gray-300' },
      { name: 'ACESSO RÁPIDO', isSection: true },
      { name: 'Acessar como Empresa', href: '/companies/login-as', icon: Building2, color: 'text-gray-300' },
      { name: 'Nova Empresa', href: '/companies/new', icon: Plus, color: 'text-gray-300' },
      { name: 'Nova Assinatura', href: '/plans/new', icon: Banknote, color: 'text-gray-300' },
      { name: 'Ver Tickets de Suporte', href: '/support/tickets', icon: User, color: 'text-gray-300' },
    ];
  }

  if (['ADMIN', 'COMPANY_ADMIN', 'ADMIN_EMPRESA', 'MASTER-ADMIN'].includes(role)) {
    return [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, color: 'text-[var(--color-primary)]' },
      { name: 'Mapa GIS', href: '/map', icon: MapIcon, color: 'text-[var(--color-success)]' },
      { name: 'Clientes', href: '/customers', icon: Users, color: 'text-[var(--color-purple)]' },
      { name: 'Corretores', href: '/dashboard/brokers', icon: Users, color: 'text-[#06b6d4]' },
      { name: 'Financeiro', href: '/finance', icon: Wallet, color: 'text-[var(--color-warning)]' },
      { name: 'Contratos', href: '/contracts', icon: FileText, color: 'text-[var(--color-info)]' },
      { name: 'Configurações', href: '/settings', icon: Settings, color: 'text-[var(--color-text-muted)]' },
    ];
  }

  // DEFAULT (CORRETOR)
  return [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, color: 'text-[var(--color-primary)]' },
    { name: 'Mapa GIS', href: '/map', icon: MapIcon, color: 'text-[var(--color-success)]' },
    { name: 'Clientes', href: '/customers', icon: Users, color: 'text-[var(--color-purple)]' },
    { name: 'Financeiro', href: '/finance', icon: Wallet, color: 'text-[var(--color-warning)]' },
    { name: 'Contratos', href: '/contracts', icon: FileText, color: 'text-[var(--color-info)]' },
  ];
};

export function Sidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [company, setCompany] = useState<any>(null);
  const [impersonatingTenantId, setImpersonatingTenantId] = useState<string | null>(null);
  const [impersonatingCompanyName, setImpersonatingCompanyName] = useState<string | null>(null);
  
  const { user, loading: isCheckingAuth } = useSessionGuard();

  useEffect(() => {
    async function fetchCompany() {
      if (user?.tenant_id) {
        const { data } = await supabase.from('companies').select('logo_url, name, fantasy_name, status_operacional').eq('id', user.tenant_id).single();
        if (data) setCompany(data);
      }
    }
    if (user) fetchCompany();

    try {
      setImpersonatingTenantId(typeof window !== 'undefined' ? localStorage.getItem('impersonating_tenant_id') : null);
      setImpersonatingCompanyName(typeof window !== 'undefined' ? localStorage.getItem('impersonating_company_name') : null);
    } catch(e) {}

    const handleCompanyUpdate = () => { if (user) fetchCompany(); };
    window.addEventListener('company_updated', handleCompanyUpdate);
    return () => window.removeEventListener('company_updated', handleCompanyUpdate);
  }, [user]);
  
  // Guard checks are moved to useSessionGuard and Middleware
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  const toggleSidebar = () => setIsOpen(!isOpen);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      try {
        localStorage.removeItem('contingency_auth');
      } catch(e) {}
      document.cookie = "contingency_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    } catch(e) {}
    window.location.assign('/login');
  };

  if (isCheckingAuth) {
    return <div className="h-screen w-full bg-[var(--color-background)] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-t-transparent border-[var(--color-primary)] rounded-full"></div></div>;
  }

  const isPublicStandalone = ['/login', '/onboarding', '/verify-email', '/auth/callback'].some(route => pathname.startsWith(route));
  if (isPublicStandalone) return <>{children}</>;

  // Block the UI if the company is suspended/blocked/defaulting (except for Super Admin)
  if (user?.role !== 'SUPER_ADMIN' && company?.status_operacional && ['Suspensa', 'Bloqueada', 'Inativa', 'Inadimplente'].includes(company.status_operacional)) {
    return (
      <div className="h-screen w-full bg-[#0b1111] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.15)]">
           <AlertCircle className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Empresa Temporariamente Indisponível</h1>
        <p className="text-gray-400 max-w-md mb-8">
           O acesso ao sistema para a empresa <strong>{company.name}</strong> encontra-se restrito no momento (Status: {company.status_operacional}). Por favor, entre em contato com o administrador da plataforma ou verifique sua situação financeira.
        </p>
        <button 
           onClick={handleLogout}
           className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors font-medium border border-[#2d3340]"
        >
           Sair e voltar ao Login
        </button>
      </div>
    );
  }

  const menuItems = getMenuItems(user?.role || '');

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--color-background)]">
      {/* Mobile Header */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 h-16 bg-[var(--color-surface)] border-b border-[var(--color-border)] z-[300] flex items-center px-4 justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={toggleSidebar} className="text-white p-1">
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-2">
              {company?.logo_url ? (
                  <img src={company.logo_url} alt="Logo" className="max-h-8 object-contain" />
              ) : (
                  <>
                    <MapIcon className="w-6 h-6 text-[var(--color-primary)]" />
                    <span className="font-sans font-bold text-lg tracking-wide text-white">{company?.fantasy_name || company?.name || 'SV_LOTES'}</span>
                  </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell user={user} />
            <button className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white border-2 border-[var(--color-surface)]">
              <User className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside className="w-64 bg-[var(--color-background)] border-r border-[var(--color-border)] z-[200] flex flex-col flex-shrink-0">
          <div className="h-20 flex items-center px-6 gap-3">
             {company?.logo_url ? (
                  <img src={company.logo_url} alt="Logo" className="max-h-12 w-full object-contain object-left" />
              ) : (
                  <>
                    <MapIcon className="w-7 h-7 text-[var(--color-primary)]" />
                    <span className="font-sans font-bold text-xl tracking-wider text-white">{company?.fantasy_name || company?.name || 'SV_LOTES'}</span>
                  </>
              )}
          </div>

          <div className="flex-1 overflow-y-auto py-2 px-3 flex flex-col gap-1">
            {menuItems.map((item, idx) => {
              if (item.isSection) {
                return (
                  <div key={`section-${idx}`} className="px-4 pt-4 pb-2 text-[11px] font-bold text-gray-500 tracking-wider">
                    {item.name}
                  </div>
                );
              }
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href!}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all font-medium ${
                    isActive 
                      ? 'bg-[var(--color-primary)]/10 text-white border border-[var(--color-primary)]/20 shadow-sm' 
                      : 'text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-surface)]/50 border border-transparent'
                  }`}
                >
                  {item.icon && <item.icon className={`w-5 h-5 ${item.color}`} />}
                  <span className="text-[14px]">{item.name}</span>
                </Link>
              );
            })}
          </div>
        </aside>
      )}

      {/* Mobile Drawer (optional sidebar on mobile) */}
      {isMobile && (
        <aside 
          className={`fixed top-0 left-0 h-full w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] z-[400] transition-transform duration-300 ease-in-out flex flex-col ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="h-16 flex items-center px-6 border-b border-[var(--color-border)] gap-2">
              {company?.logo_url ? (
                  <img src={company.logo_url} alt="Logo" className="max-h-8 object-contain" />
              ) : (
                  <>
                    <MapIcon className="w-6 h-6 text-[var(--color-primary)]" />
                    <span className="font-sans font-bold text-xl tracking-wide text-white">{company?.fantasy_name || company?.name || 'SV_LOTES'}</span>
                  </>
              )}
          </div>
          <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
            {menuItems.map((item, idx) => {
              if (item.isSection) {
                return (
                  <div key={`section-${idx}`} className="px-3 pt-4 pb-2 text-[10px] font-bold text-gray-500 tracking-wider">
                    {item.name}
                  </div>
                );
              }
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href!}
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                    isActive 
                      ? 'bg-[var(--color-surface-bright)] text-[var(--color-primary)] border border-[var(--color-primary)]/20' 
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-bright)] hover:text-white border border-transparent'
                  }`}
                >
                  {item.icon && <item.icon className={`w-5 h-5 ${item.color}`} />}
                  <span className="font-sans font-medium text-sm">{item.name}</span>
                </Link>
              );
            })}
          </div>

          <div className="p-4 flex-1">
             <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] border border-transparent">
               <span className="text-[15px]">Sair do Sistema</span>
             </button>
          </div>
        </aside>
      )}

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col relative overflow-hidden bg-[var(--color-background)] ${isMobile ? 'pt-16 pb-20' : ''}`}>
        
        {impersonatingTenantId && (
          <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between shadow-lg z-50 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <span className="font-bold uppercase tracking-wider text-sm">
                Você está acessando como: {impersonatingCompanyName} — MODO DEUS ATIVO
              </span>
            </div>
            <button
               onClick={async () => {
                   try {
                       await supabase.from('users').update({ tenant_id: null }).eq('id', user?.id).eq('role', 'SUPER_ADMIN');
                       try {
                         localStorage.removeItem('impersonating_tenant_id');
                         localStorage.removeItem('impersonating_company_name');
                       } catch(e) {}
                       window.location.assign('/companies');
                   } catch(e) {
                       console.error(e);
                   }
               }}
               className="bg-white text-red-600 px-3 py-1 rounded text-xs font-bold hover:bg-red-50 transition-colors"
            >
               Sair do modo empresa
            </button>
          </div>
        )}

        {/* Desktop Top Header inside Main Content */}
        {!isMobile && (
          <header className="h-20 w-full flex items-center justify-between px-8 border-b border-[var(--color-border)] flex-shrink-0 bg-[var(--color-background)]">
            <div>
              <h1 className="text-xl font-medium text-white flex items-center gap-1">
                <span className="text-[var(--color-text-muted)]">Olá,</span> <strong>{user?.name || 'Usuário'} {user?.role === 'SUPER_ADMIN' && '(Super Admin)'}</strong>
              </h1>
              <p className="text-sm text-[var(--color-text-muted)]">{user?.role === 'SUPER_ADMIN' ? 'Painel de Controle da Plataforma' : 'Admin Empresa'}</p>
            </div>

            <div className="flex items-center gap-6">
              {user?.role === 'SUPER_ADMIN' && (
                <div className="px-3 py-1.5 rounded-full bg-[#06b6d4]/10 text-[#06b6d4] text-xs font-bold border border-[#06b6d4]/20 tracking-wider">
                  MODO DEUS
                </div>
              )}
              <NotificationBell user={user} />
              
              {/* Profile Dropdown */}
              <div className="relative group cursor-pointer">
                <div className="flex items-center gap-3" title="Opções de Perfil">
                  <div className="w-10 h-10 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white font-bold text-lg shadow-lg uppercase">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                  <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-white transition-colors" />
                </div>
                
                <div className="absolute right-0 mt-2 w-56 bg-[#1a1f29] border border-[#2d3340] rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden text-sm">
                  <div className="p-4 border-b border-[#2d3340] bg-[#151a23]">
                    <p className="font-semibold text-white truncate">{user?.name}</p>
                    <p className="text-xs text-gray-400 mt-1 truncate">{user?.email}</p>
                  </div>
                  <div className="p-2">
                    {user?.role === 'SUPER_ADMIN' && (
                      <Link href="/super-admin/profile" className="flex items-center gap-3 px-3 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                        <User className="w-4 h-4" /> Meu Perfil Master
                      </Link>
                    )}
                    <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors text-left mt-1">
                       <LogOut className="w-4 h-4" /> Sair do Sistema
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Page Content */}
        {children}

      </main>

      {/* Mobile Bottom Navigation Menu */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 h-[72px] bg-[var(--color-surface)] border-t border-[var(--color-border)] z-[300] flex items-center justify-around px-2 pb-safe overflow-x-auto">
          {menuItems.filter(item => !item.isSection).slice(0, 5).map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.href || item.name} 
                href={item.href || '#'}
                className="flex flex-col items-center justify-center gap-1 w-full h-full min-w-[64px]"
              >
                {item.icon && <item.icon className={`w-6 h-6 ${isActive ? item.color : 'text-[var(--color-text-muted)]'}`} />}
                <span className={`text-[10px] font-medium leading-none truncate w-full text-center px-1 ${isActive ? item.color : 'text-[var(--color-text-muted)]'}`}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* Mobile overlay */}
      {isMobile && isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[250] backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
