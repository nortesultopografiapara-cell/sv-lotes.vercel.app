'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Map as MapIcon, 
  FolderOpen, 
  Users, 
  Banknote, 
  Settings, 
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { useState, useEffect } from 'react';

const MENU_ITEMS = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Mapa GIS', href: '/map', icon: MapIcon },
  { name: 'Projetos', href: '/projects', icon: FolderOpen },
  { name: 'CRM', href: '/crm', icon: Users },
  { name: 'Financeiro', href: '/finance', icon: Banknote },
];

export function Sidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    // Basic mock authentication check
    const checkAuth = () => {
      // Because we mock it, if pathname is not login, we simulate authed.
      // In a real scenario with Supabase:
      // const { data: { session } } = await supabase.auth.getSession()
      // setIsAuthenticated(!!session)
      
      const isAuthPath = pathname === '/login';
      
      // For this demo, let's assume we store a simple flag in localStorage
      const loggedIn = localStorage.getItem('sv_lotes_auth') === 'true';
      
      if (!loggedIn && !isAuthPath) {
        router.push('/login');
      } else if (loggedIn && isAuthPath) {
        router.push('/');
      }
      
      setIsAuthenticated(loggedIn);
      setIsCheckingAuth(false);
    };
    
    checkAuth();

    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [pathname, router]);

  const toggleSidebar = () => setIsOpen(!isOpen);

  const handleLogout = () => {
    localStorage.removeItem('sv_lotes_auth');
    router.push('/login');
  };

  if (isCheckingAuth) {
    return <div className="h-screen w-full bg-[var(--color-background)] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-t-transparent border-[var(--color-primary)] rounded-full"></div></div>;
  }

  if (pathname === '/login') return <>{children}</>;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--color-background)]">
      {/* Mobile Header */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 h-16 bg-[var(--color-surface)] border-b border-[var(--color-border)] z-[300] flex items-center px-4 justify-between">
          <div className="flex items-center gap-2">
            <MapIcon className="w-6 h-6 text-[var(--color-primary)]" />
            <span className="font-sans font-bold text-lg tracking-wide text-white">SV_LOTES</span>
          </div>
          <button onClick={toggleSidebar} className="p-2 text-white">
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed md:relative top-0 left-0 h-full w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] z-[200] transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${isMobile ? 'pt-16' : ''}`}
      >
        {!isMobile && (
          <div className="h-16 flex items-center px-6 border-b border-[var(--color-border)] gap-2">
            <MapIcon className="w-6 h-6 text-[var(--color-primary)]" />
            <span className="font-sans font-bold text-xl tracking-wide text-white">SV_LOTES</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
          <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider mb-2 px-3">
            Principal
          </div>
          {MENU_ITEMS.map((item) => {
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
                <item.icon className={`w-5 h-5 ${isActive ? 'text-[var(--color-primary)]' : ''}`} />
                <span className="font-sans font-medium text-sm">{item.name}</span>
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-3 px-3 py-2 text-[var(--color-text-muted)]">
            <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white font-bold text-sm">
              S
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-white line-clamp-1">Severino</span>
              <span className="text-[10px] font-mono uppercase text-[var(--color-primary)]">Super Admin</span>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full mt-2 flex items-center gap-3 px-3 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors rounded-md hover:bg-[var(--color-danger)]/10">
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 flex flex-col relative overflow-hidden bg-[var(--color-background)] ${isMobile ? 'pt-16' : ''}`}>
        {children}
      </main>

      {/* Mobile overlay */}
      {isMobile && isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[150] backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
