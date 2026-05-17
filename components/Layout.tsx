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
  FileText,
  Settings
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessionGuard } from '@/hooks/useSessionGuard';

const getMenuItems = (role: string) => {
  if (role === 'SUPER_ADMIN') {
    return [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, color: 'text-[var(--color-primary)]' },
      { name: 'Empresas', href: '/companies', icon: Building2, color: 'text-[#06b6d4]' },
      { name: 'Mapa GIS', href: '/map', icon: MapIcon, color: 'text-[var(--color-success)]' },
      { name: 'Clientes', href: '/customers', icon: Users, color: 'text-[var(--color-purple)]' },
      { name: 'Financeiro', href: '/finance', icon: Wallet, color: 'text-[var(--color-warning)]' },
      { name: 'Contratos', href: '/contracts', icon: FileText, color: 'text-[#f59e0b]' },
    ];
  }
  
  if (role === 'ADMIN' || role === 'ADMIN_TENANT') {
    return [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, color: 'text-[var(--color-primary)]' },
      { name: 'Mapa GIS', href: '/map', icon: MapIcon, color: 'text-[var(--color-success)]' },
      { name: 'Clientes', href: '/customers', icon: Users, color: 'text-[var(--color-purple)]' },
      { name: 'Financeiro', href: '/finance', icon: Wallet, color: 'text-[var(--color-warning)]' },
      { name: 'Contratos', href: '/contracts', icon: FileText, color: 'text-[#f59e0b]' },
      { name: 'Meus Corretores', href: '/corretores', icon: Users, color: 'text-[#06b6d4]' },
      { name: 'Configurações', href: '/settings', icon: Settings, color: 'text-gray-400' },
    ];
  }

  // DEFAULT (CORRETOR)
  return [
    { name: 'Mapa GIS', href: '/map', icon: MapIcon, color: 'text-[var(--color-success)]' },
  ];
};

export function Sidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  const { user, loading: isCheckingAuth } = useSessionGuard();
  
  // Guard checks are moved to useSessionGuard and Middleware
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  const [notifications, setNotifications] = useState<any[]>([]);
  const toggleSidebar = () => setIsOpen(!isOpen);

  useEffect(() => {
    async function loadNotifications() {
      if (!user) return;
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('is_read', false)
        .order('created_at', { ascending: false });
      
      if (data) setNotifications(data);
    }
    
    if (user && !isCheckingAuth) {
      loadNotifications();
      
      // Subscribe to real-time notifications
      const channel = supabase.channel('schema-db-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `tenant_id=eq.${user.tenant_id}`
          },
          (payload) => {
            setNotifications(prev => [payload.new, ...prev]);
          }
        )
        .subscribe();
        
      return () => {
        supabase.removeChannel(channel);
      }
    }
  }, [user, isCheckingAuth]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('contingency_auth');
    document.cookie = "contingency_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = '/login';
  };

  if (isCheckingAuth) {
    return <div className="h-screen w-full bg-[var(--color-background)] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-t-transparent border-[var(--color-primary)] rounded-full"></div></div>;
  }

  const isPublicStandalone = ['/login', '/onboarding', '/verify-email', '/auth/callback'].some(route => pathname.startsWith(route));
  if (isPublicStandalone) return <>{children}</>;

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
              <MapIcon className="w-6 h-6 text-[var(--color-primary)]" />
              <span className="font-sans font-bold text-lg tracking-wide text-white">SV_LOTES</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative text-[var(--color-text-muted)] hover:text-white transition-colors">
              <Bell className="w-6 h-6" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--color-danger)] border-2 border-[var(--color-surface)] text-[8px] font-bold text-white flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>
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
            <MapIcon className="w-7 h-7 text-[var(--color-primary)]" />
            <span className="font-sans font-bold text-xl tracking-wider text-white">SV_LOTES</span>
          </div>

          <div className="flex-1 overflow-y-auto py-2 px-3 flex flex-col gap-2">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
                    isActive 
                      ? 'bg-[var(--color-surface)] text-white border border-[var(--color-border)]' 
                      : 'text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-surface)]/50 border border-transparent'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                  <span className="text-[15px]">{item.name}</span>
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
            <MapIcon className="w-6 h-6 text-[var(--color-primary)]" />
            <span className="font-sans font-bold text-xl tracking-wide text-white">SV_LOTES</span>
          </div>
          <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  onClick={() => isMobile && setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                    isActive 
                      ? 'bg-[var(--color-surface-bright)] text-[var(--color-primary)] border border-[var(--color-primary)]/20' 
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-bright)] hover:text-white border border-transparent'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${item.color}`} />
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
        
        {/* Desktop Top Header inside Main Content */}
        {!isMobile && (
          <header className="h-20 w-full flex items-center justify-between px-8 border-b border-[var(--color-border)] flex-shrink-0 bg-[var(--color-background)]">
            <div>
              <h1 className="text-xl font-medium text-white flex items-center gap-1">
                <span className="text-[var(--color-text-muted)]">Olá,</span> <strong>{user?.name || 'Usuário'}</strong>
              </h1>
              <p className="text-sm text-[var(--color-text-muted)]">
                 {user?.role === 'SUPER_ADMIN' ? 'Super Admin' : user?.role === 'ADMIN' ? 'Admin Empresa' : 'Corretor'}
              </p>
            </div>

            <div className="flex items-center gap-6">
              {user?.role === 'SUPER_ADMIN' && (
                <div className="px-3 py-1.5 rounded-full bg-[#06b6d4]/10 text-[#06b6d4] text-xs font-bold border border-[#06b6d4]/20 tracking-wider">
                  MODO DEUS
                </div>
              )}
              <button className="relative text-[var(--color-text-muted)] hover:text-white transition-colors">
                <Bell className="w-6 h-6" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-[var(--color-danger)] border-2 border-[var(--color-background)] text-[10px] font-bold text-white flex items-center justify-center">
                     {notifications.length}
                  </span>
                )}
              </button>
              
              <div className="flex items-center gap-3 cursor-pointer group" onClick={handleLogout} title="Clique para sair">
                <div className="w-10 h-10 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white font-bold text-lg shadow-lg uppercase">
                  {user?.name?.charAt(0) || 'U'}
                </div>
                <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-white transition-colors" />
              </div>
            </div>
          </header>
        )}

        {/* Page Content */}
        {children}

      </main>

      {/* Mobile Bottom Navigation Menu */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 h-[72px] bg-[var(--color-surface)] border-t border-[var(--color-border)] z-[300] flex items-center justify-around px-2 pb-safe">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className="flex flex-col items-center justify-center gap-1 w-full h-full"
              >
                <item.icon className={`w-6 h-6 ${isActive ? item.color : 'text-[var(--color-text-muted)]'}`} />
                <span className={`text-[10px] font-medium leading-none ${isActive ? item.color : 'text-[var(--color-text-muted)]'}`}>
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
