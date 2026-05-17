import Link from "next/link";
import { LayoutDashboard, Map, DollarSign, FileText } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-[var(--color-background)] p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Painel Principal</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link href="/map" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 hover:border-[var(--color-primary)] transition-colors group">
             <div className="w-12 h-12 bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Map className="w-6 h-6" />
             </div>
             <h2 className="text-lg font-bold text-white">Mapa GIS</h2>
             <p className="text-sm text-[var(--color-text-muted)] mt-1">Gestão territorial móvel e desktop</p>
          </Link>

          <Link href="/finance" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 hover:border-[var(--color-primary)] transition-colors group">
             <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <DollarSign className="w-6 h-6" />
             </div>
             <h2 className="text-lg font-bold text-white">Financeiro</h2>
             <p className="text-sm text-[var(--color-text-muted)] mt-1">Contas a receber e fluxo de caixa</p>
          </Link>

          <Link href="/contracts" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 hover:border-[var(--color-primary)] transition-colors group">
             <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6" />
             </div>
             <h2 className="text-lg font-bold text-white">Contratos</h2>
             <p className="text-sm text-[var(--color-text-muted)] mt-1">Emissão e gestão de vendas</p>
          </Link>

          <Link href="/dashboard" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 hover:border-[var(--color-primary)] transition-colors group">
             <div className="w-12 h-12 bg-fuchsia-500/10 text-fuchsia-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <LayoutDashboard className="w-6 h-6" />
             </div>
             <h2 className="text-lg font-bold text-white">Relatórios</h2>
             <p className="text-sm text-[var(--color-text-muted)] mt-1">Dashboard analítico completo</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
