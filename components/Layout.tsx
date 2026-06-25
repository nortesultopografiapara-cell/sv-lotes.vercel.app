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
  Plus,
  Lock,
  Shield,
  Eye,
  EyeOff,
  Loader2,
  X,
  RefreshCw,
  BookOpen,
  Handshake,
  CreditCard,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { SvLotesLogo } from '@/components/brand/SvLotesLogo';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { applyTenantFilter, resolveRlsContext } from '@/lib/rls';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { UserProfileModals } from './UserProfileModals';
import { SuperAdminSidebar } from './admin/SuperAdminSidebar';
import { SuperAdminQuickActions } from './admin/SuperAdminQuickActions';
import { GisSelectedProjectProvider } from '@/contexts/GisSelectedProjectContext';
import { GisProjectHeaderBadge } from '@/components/map/GisProjectHeaderBadge';
import { OfflineStatusBar } from '@/components/offline/OfflineStatusBar';
import { setAppErrorContext } from '@/lib/appErrorReporting';
import { resolveActiveTenantId } from '@/lib/activeTenant';
import { isBrokerRole, isOwnerRole, resolveRoleDisplayLabel, shouldShowFullTenantAdminMenu, shouldUseMasterConsoleLayout } from '@/lib/rolePermissions';
import {
  getOwnerMenuItemsFromPermissions,
  loadOwnerAccessContext,
  shouldRedirectOwnerFromRoute,
  type OwnerProjectAccessRow,
} from '@/lib/ownerProjectAccess';
import {
  clearImpersonationState,
  formatImpersonationDateTime,
  readImpersonationState,
} from '@/lib/impersonationStorage';
import { DemoEnvironmentBanner } from '@/components/demo/DemoEnvironmentBanner';
import { isDemoProfile } from '@/lib/demoRestrictions';

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
        const rlsCtx = await resolveRlsContext(user);
        let query = supabase.from('finance_receipts').select('amount, due_date, status, sale_id');
        query = applyTenantFilter(query, rlsCtx, 'finance_receipts');
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
    if (isSupabaseConfigured && (user?.tenant_id || shouldUseMasterConsoleLayout(user?.role))) {
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
        <div className="absolute right-0 mt-2 w-72 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden z-[9999]" style={{ top: '100%' }}>
           <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-elevated)]">
              <h3 className="font-semibold text-[var(--text-primary)]">Notificações</h3>
              <span className="text-xs bg-[var(--bg-main)] text-[var(--text-secondary)] px-2 py-0.5 rounded font-bold">
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
                     <p className="text-sm font-medium text-gray-200">
                       {stats.qtyNoPaymentContracts === 1
                         ? '1 contrato sem pagamento recebido'
                         : `${stats.qtyNoPaymentContracts} contratos sem pagamento recebido`}
                     </p>
                     <p className="text-xs text-gray-500">Nenhuma parcela paga registrada</p>
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
  if (shouldUseMasterConsoleLayout(role)) {
    return [];
  }

  if (shouldShowFullTenantAdminMenu(role)) {
    return [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, color: 'text-[var(--color-primary)]' },
      { name: 'Mapa GIS', href: '/map', icon: MapIcon, color: 'text-[var(--color-success)]' },
      { name: 'Clientes', href: '/customers', icon: Users, color: 'text-[var(--color-purple)]' },
      { name: 'Corretores', href: '/dashboard/brokers', icon: Users, color: 'text-[#06b6d4]' },
      { name: 'Financeiro', href: '/finance', icon: Wallet, color: 'text-[var(--color-warning)]' },
      { name: 'Minha Assinatura', href: '/billing', icon: CreditCard, color: 'text-[#14b8a6]' },
      { name: 'Contratos', href: '/contracts', icon: FileText, color: 'text-[var(--color-info)]' },
      { name: 'Sócios / Proprietários', href: '/owners', icon: Handshake, color: 'text-[#a855f7]' },
      { name: 'Sincronização Offline', href: '/offline-sync', icon: RefreshCw, color: 'text-[#f97316]' },
      { name: 'Configurações', href: '/settings', icon: Settings, color: 'text-[var(--color-text-muted)]' },
    ];
  }

  if (isBrokerRole(role)) {
    return [
      { name: 'Mapa GIS', href: '/map', icon: MapIcon, color: 'text-[var(--color-success)]' },
    ];
  }

  if (isOwnerRole(role)) {
    return [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, color: 'text-[var(--color-primary)]' },
      { name: 'Mapa GIS', href: '/map', icon: MapIcon, color: 'text-[var(--color-success)]' },
      { name: 'Financeiro', href: '/finance', icon: Wallet, color: 'text-[var(--color-warning)]' },
      { name: 'Contratos', href: '/contracts', icon: FileText, color: 'text-[var(--color-info)]' },
    ];
  }
  return [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, color: 'text-[var(--color-primary)]' },
    { name: 'Mapa GIS', href: '/map', icon: MapIcon, color: 'text-[var(--color-success)]' },
    { name: 'Clientes', href: '/customers', icon: Users, color: 'text-[var(--color-purple)]' },
    { name: 'Financeiro', href: '/finance', icon: Wallet, color: 'text-[var(--color-warning)]' },
    { name: 'Contratos', href: '/contracts', icon: FileText, color: 'text-[var(--color-info)]' },
  ];
};

const OWNER_MENU_ICONS: Record<
  string,
  { icon: typeof LayoutDashboard; color: string }
> = {
  '/dashboard': { icon: LayoutDashboard, color: 'text-[var(--color-primary)]' },
  '/map': { icon: MapIcon, color: 'text-[var(--color-success)]' },
  '/finance': { icon: Wallet, color: 'text-[var(--color-warning)]' },
  '/contracts': { icon: FileText, color: 'text-[var(--color-info)]' },
};

function buildOwnerMenuItems(
  rows: OwnerProjectAccessRow[],
  permissions: {
    can_view_dashboard: boolean;
    can_view_map: boolean;
    can_view_finance: boolean;
    can_view_contracts: boolean;
  },
) {
  return getOwnerMenuItemsFromPermissions(permissions, rows).map((item) => ({
    name: item.name,
    href: item.href,
    icon: OWNER_MENU_ICONS[item.href]?.icon ?? LayoutDashboard,
    color: OWNER_MENU_ICONS[item.href]?.color ?? 'text-[var(--color-primary)]',
  }));
}

export function Sidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [company, setCompany] = useState<any>(null);
  const [impersonatingTenantId, setImpersonatingTenantId] = useState<string | null>(null);
  const [impersonatingCompanyName, setImpersonatingCompanyName] = useState<string | null>(null);
  const [impersonatingMasterName, setImpersonatingMasterName] = useState<string | null>(null);
  const [impersonatingStartedAt, setImpersonatingStartedAt] = useState<string | null>(null);
  const [activeProfileModal, setActiveProfileModal] = useState<'profile' | 'password' | 'security' | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [ownerAccess, setOwnerAccess] = useState<{
    rows: OwnerProjectAccessRow[];
    permissions: {
      can_view_dashboard: boolean;
      can_view_map: boolean;
      can_view_finance: boolean;
      can_view_contracts: boolean;
    };
  } | null>(null);
  
  const { user, loading: isCheckingAuth } = useSessionGuard();
  const isMasterConsole = shouldUseMasterConsoleLayout(user?.role);
  const isDemoUser = isDemoProfile(user);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('saas_sidebar_collapsed');
      if (stored === 'true') setSidebarCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('saas_sidebar_collapsed', String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    async function fetchCompany() {
      if (user?.tenant_id) {
        const { data } = await supabase.from('companies').select('logo_url, name, fantasy_name, status_operacional').eq('id', user.tenant_id).single();
        if (data) setCompany(data);
      }
    }
    if (user) fetchCompany();

    try {
      const impersonation = readImpersonationState();
      setImpersonatingTenantId(impersonation?.tenantId ?? null);
      setImpersonatingCompanyName(impersonation?.companyName ?? null);
      setImpersonatingMasterName(impersonation?.masterName ?? null);
      setImpersonatingStartedAt(impersonation?.startedAt ?? null);
    } catch(e) {}


    const handleCompanyUpdate = () => { if (user) fetchCompany(); };
    window.addEventListener('company_updated', handleCompanyUpdate);
    return () => window.removeEventListener('company_updated', handleCompanyUpdate);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    async function syncErrorContext() {
      if (!user) {
        setAppErrorContext({ tenantId: null, userId: null });
        return;
      }
      const tenantId = await resolveActiveTenantId(user);
      if (!cancelled) {
        setAppErrorContext({
          tenantId,
          userId: user.id,
        });
      }
    }
    void syncErrorContext();
    return () => {
      cancelled = true;
    };
  }, [user, impersonatingTenantId]);

  useEffect(() => {
    if (!user || !isOwnerRole(user.role)) {
      setOwnerAccess(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const tenantId = await resolveActiveTenantId(user);
      const ownerCtx = await loadOwnerAccessContext(supabase, user, tenantId);
      if (!cancelled) {
        setOwnerAccess({
          rows: ownerCtx.rows,
          permissions: ownerCtx.permissions,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !isOwnerRole(user.role) || !ownerAccess) return;

    const redirectTo = shouldRedirectOwnerFromRoute(
      pathname,
      ownerAccess.rows,
      ownerAccess.permissions,
    );
    if (redirectTo && redirectTo !== pathname) {
      router.replace(redirectTo);
    }
  }, [user, ownerAccess, pathname, router]);
  
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

  const isPublicStandalone =
    pathname === '/' ||
    pathname === '/demo' ||
    pathname.startsWith('/sign/') ||
    ['/login', '/onboarding', '/verify-email', '/auth/callback'].some((route) =>
      pathname.startsWith(route)
    );
  if (isPublicStandalone) return <>{children}</>;

  if (isCheckingAuth) {
    return <div className="h-screen w-full bg-[var(--color-background)] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-t-transparent border-[var(--color-primary)] rounded-full"></div></div>;
  }

  // Block the UI if the company is suspended/blocked/defaulting (except for Super Admin)
  if (!isMasterConsole && company?.status_operacional && ['Suspensa', 'Bloqueada', 'Inativa', 'Inadimplente'].includes(company.status_operacional)) {
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

  const menuItems = isOwnerRole(user?.role || '')
    ? ownerAccess
      ? buildOwnerMenuItems(ownerAccess.rows, ownerAccess.permissions)
      : getMenuItems('OWNER')
    : getMenuItems(user?.role || '');

  return (
    <GisSelectedProjectProvider>
    <div className="flex h-dvh w-full overflow-hidden bg-[var(--color-background)]">
      {/* Mobile Header */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 h-14 bg-[var(--color-background)]/95 backdrop-blur-md border-b border-white/5 z-[300] flex items-center px-4 justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              {isMasterConsole ? (
                <SvLotesLogo size={32} showText subtitle="Master Console" />
              ) : company?.logo_url ? (
                <img src={company.logo_url} alt="Logo" className="max-h-8 object-contain" />
              ) : (
                <SvLotesLogo size={32} showText={false} />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <OfflineStatusBar />
            {isMasterConsole && <SuperAdminQuickActions />}
            <GisProjectHeaderBadge />
            <NotificationBell user={user} />
            <Link
              href="/manual"
              className="flex items-center justify-center w-9 h-9 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-alt)] transition-colors"
              title="Manual do Sistema"
              aria-label="Manual do Sistema"
            >
              <BookOpen className="w-5 h-5" />
            </Link>
            <button className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white text-sm font-bold">
              {user?.name?.charAt(0) || 'U'}
            </button>
          </div>
        </div>
      )}

      {/* Super Admin Sidebar */}
      {isMasterConsole && (
        <SuperAdminSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
          isMobile={isMobile}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onLogout={handleLogout}
        />
      )}

      {/* Desktop Sidebar (tenant roles) */}
      {!isMobile && !isMasterConsole && (
        <aside className="w-64 bg-[var(--color-background)] border-r border-[var(--color-border)] z-[200] flex flex-col flex-shrink-0">
          <div className="h-20 flex items-center px-6 gap-3">
             {company?.logo_url ? (
                  <img src={company.logo_url} alt="Logo" className="max-h-12 w-full object-contain object-left" />
              ) : (
                  <SvLotesLogo size={44} showText subtitle={company?.fantasy_name || company?.name || undefined} />
              )}
          </div>

          <div className="flex-1 overflow-y-auto py-2 px-3 flex flex-col gap-1 sv-scrollbar sv-scrollbar-dark">
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
                      ? 'bg-[var(--color-primary)]/10 text-[var(--text-primary)] border border-[var(--color-primary)]/20 shadow-sm' 
                      : 'text-[var(--color-text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--color-surface)]/50 border border-transparent'
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

      {/* Mobile Drawer (tenant roles) */}
      {isMobile && !isMasterConsole && (
        <aside 
          className={`fixed top-0 left-0 h-full w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] z-[400] transition-transform duration-300 ease-in-out flex flex-col ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="h-16 flex items-center px-6 border-b border-[var(--color-border)] gap-2">
              {company?.logo_url ? (
                  <img src={company.logo_url} alt="Logo" className="max-h-8 object-contain" />
              ) : (
                  <SvLotesLogo size={36} showText subtitle={company?.fantasy_name || company?.name || undefined} />
              )}
          </div>
          <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1 sv-scrollbar sv-scrollbar-dark">
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
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-bright)] hover:text-[var(--text-primary)] border border-transparent'
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
      <main
        className={`flex-1 flex flex-col relative min-h-0 overflow-hidden bg-[var(--color-background)] ${
          isMobile ? (isMasterConsole ? 'pt-14' : 'pt-16') : ''
        }`}
      >
        
        {impersonatingTenantId && (
          <div className="bg-red-600 text-white px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg z-50 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-3 min-w-0">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="min-w-0 text-sm leading-snug">
                <p className="font-bold uppercase tracking-wider">Modo empresa ativo</p>
                <p>
                  <span className="font-semibold">Empresa atual:</span>{' '}
                  {impersonatingCompanyName || '—'}
                </p>
                <p>
                  <span className="font-semibold">Usuário Master original:</span>{' '}
                  {impersonatingMasterName || user?.name || 'Super Admin'}
                </p>
                <p>
                  <span className="font-semibold">Impersonação desde:</span>{' '}
                  {formatImpersonationDateTime(impersonatingStartedAt)}
                </p>
              </div>
            </div>
            <button
               onClick={async () => {
                   try {
                       await supabase.from('users').update({ tenant_id: null }).eq('id', user?.id);
                       clearImpersonationState();
                       setImpersonatingTenantId(null);
                       setImpersonatingCompanyName(null);
                       setImpersonatingMasterName(null);
                       setImpersonatingStartedAt(null);
                       window.location.assign('/companies');
                   } catch(e) {
                       console.error(e);
                   }
               }}
               className="bg-white text-red-600 px-3 py-1.5 rounded text-xs font-bold hover:bg-red-50 transition-colors shrink-0 self-start md:self-center"
            >
               Sair do modo empresa
            </button>
          </div>
        )}

        {isDemoUser && !impersonatingTenantId ? <DemoEnvironmentBanner /> : null}

        {/* Desktop Top Header inside Main Content */}
        {!isMobile && (
          <header className="h-16 w-full flex items-center justify-between px-6 lg:px-8 border-b border-[var(--border-subtle)] flex-shrink-0 bg-[var(--bg-navbar)]">
            <div className="min-w-0">
              <h1 className="text-base font-medium text-[var(--text-primary)] flex items-center gap-1.5 truncate">
                <span className="text-[var(--text-secondary)] font-normal">Olá,</span>
                <strong className="truncate">{user?.name || 'Usuário'}</strong>
              </h1>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {resolveRoleDisplayLabel(user?.role)}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <OfflineStatusBar />
              {isMasterConsole && <SuperAdminQuickActions />}
              {isMasterConsole && (
                <span className="hidden md:inline-flex px-2.5 py-1 rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-bold uppercase tracking-wider border border-[var(--color-primary)]/20">
                  Master
                </span>
              )}
              <GisProjectHeaderBadge />
              <NotificationBell user={user} />
              <Link
                href="/manual"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors ${
                  pathname === '/manual'
                    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/25'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-alt)] border-transparent hover:border-[var(--border-color)]'
                }`}
                title="Manual do Sistema"
              >
                <BookOpen className="w-5 h-5 shrink-0" />
                <span className="hidden lg:inline text-xs font-semibold">Manual</span>
              </Link>

              {/* Profile Dropdown */}
              <div className="relative group cursor-pointer">
                <div className="flex items-center gap-3" title="Opções de Perfil">
                  <div className="w-10 h-10 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white font-bold text-lg shadow-lg uppercase">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                  <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-white transition-colors" />
                </div>
                
                <div className="absolute right-0 mt-2 w-56 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden text-sm">
                  <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-elevated)]">
                    <p className="font-semibold text-[var(--text-primary)] truncate">{user?.name}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">{user?.email}</p>
                  </div>
                  <div className="p-2">
                    {isMasterConsole ? (
                      <Link href="/super-admin/profile" className="flex items-center gap-3 px-3 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors">
                        <User className="w-4 h-4" /> Meu Perfil Master
                      </Link>
                    ) : (
                      <>
                        <button onClick={() => setActiveProfileModal('profile')} className="w-full flex items-center gap-3 px-3 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors text-left">
                          <User className="w-4 h-4" /> Meu Perfil
                        </button>
                        {!isDemoUser ? (
                          <button onClick={() => setActiveProfileModal('password')} className="w-full flex items-center gap-3 px-3 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors text-left mt-1">
                            <Lock className="w-4 h-4" /> Alterar Senha
                          </button>
                        ) : (
                          <p className="px-3 py-2 mt-1 text-xs text-amber-400/90 leading-snug">
                            Usuário demonstração não pode alterar senha.
                          </p>
                        )}
                        <button onClick={() => setActiveProfileModal('security')} className="w-full flex items-center gap-3 px-3 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors text-left mt-1">
                          <Shield className="w-4 h-4" /> Segurança
                        </button>
                      </>
                    )}
                    <Link
                      href="/manual"
                      className="flex items-center gap-3 px-3 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors mt-1"
                    >
                      <BookOpen className="w-4 h-4" /> Manual do Sistema
                    </Link>
                    <div className="h-px bg-[var(--border-color)] my-1" />
                    <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors text-left">
                       <LogOut className="w-4 h-4" /> Sair do Sistema
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Page Content */}
        <div
          id={isMobile && pathname === '/manual' ? 'sv-manual-scroll-root' : undefined}
          className={`flex-1 flex flex-col min-h-0 ${
            isMobile ? 'sv-mobile-scroll-area sv-scrollbar sv-scrollbar-dark' : 'overflow-hidden'
          }`}
        >
          {children}
        </div>

      </main>

      {/* Mobile Bottom Navigation (tenant roles only) */}
      {isMobile && !isMasterConsole && menuItems.length > 0 && (
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
        <div className="sa-mobile-overlay fixed inset-0 z-[350]" onClick={() => setIsOpen(false)} />
      )}

      {/* User Profile Modals */}
      <UserProfileModals 
        user={user} 
        company={company} 
        activeModal={activeProfileModal} 
        setActiveModal={setActiveProfileModal} 
      />
    </div>
    </GisSelectedProjectProvider>
  );
}
