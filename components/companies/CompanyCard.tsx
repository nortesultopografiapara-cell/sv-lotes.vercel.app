'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Building2,
  Edit,
  Eye,
  LogIn,
  Map as MapIcon,
  MoreVertical,
  Power,
  PowerOff,
  Trash2,
  Users,
} from 'lucide-react';
import '@/components/admin/admin-shell.css';
import { getCompanySaasPlan } from '@/lib/saasPlans';
import { formatSaasCurrency, resolveCompanyPricing } from '@/lib/companyPricing';
import { CustomPriceBadge } from '@/components/companies/CustomPriceBadge';

function planLabel(plan?: string) {
  return getCompanySaasPlan({ plan }).displayName;
}

function CompanyTypeBadge({ company }: { company: { is_test_company?: boolean; is_test?: boolean } }) {
  const isTest = company.is_test_company === true || company.is_test === true;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border shrink-0 ${
        isTest
          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
          : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25'
      }`}
    >
      {isTest ? 'TESTE' : 'REAL'}
    </span>
  );
}

function StatusBadge({ status, legacyActive }: { status?: string; legacyActive?: boolean }) {
  let resolved = status || (legacyActive ? 'Ativa' : 'Inativa');
  const styles: Record<string, string> = {
    Ativa: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    Teste: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
    Suspensa: 'bg-orange-500/10 text-orange-400 border-orange-500/25',
    Bloqueada: 'bg-red-500/10 text-red-400 border-red-500/25',
    Inadimplente: 'bg-slate-500/10 text-slate-400 border-slate-600/40',
    Inativa: 'bg-slate-500/10 text-slate-500 border-slate-600/30',
  };
  const cls = styles[resolved] || styles.Inativa;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide border ${cls}`}
    >
      {resolved}
    </span>
  );
}

export function CompanyCard({
  company,
  user,
  isMaster,
  onEdit,
  onView,
  onDelete,
  onUpdateStatus,
  onImpersonate,
}: {
  company: any;
  user: any;
  isMaster?: boolean;
  onEdit: () => void;
  onView: () => void;
  onDelete: () => void;
  onUpdateStatus: (c: any, status: string) => void;
  onImpersonate: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const normalizedStatus = (company.status_operacional || (company.active ? 'Ativa' : 'Inativa')).toLowerCase();
  const isActive = ['active', 'ativa'].includes(normalizedStatus);
  const userCount = company.users?.[0]?.count ?? 0;
  const projectCount = company.project_count ?? 0;
  const protectedCompany =
    isMaster || company.id === user?.tenant_id || company.is_master || company.slug?.toLowerCase() === 'master';
  const pricing = resolveCompanyPricing(company);

  return (
    <article className="sa-company-card rounded-2xl p-5 flex flex-col h-full">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-[var(--color-background)] border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
          {company.logo_url ? (
            <img src={company.logo_url} alt="" className="w-full h-full object-contain" />
          ) : (
            <span className="text-lg font-bold text-[var(--color-primary)]">
              {company.name?.charAt(0) || <Building2 className="w-5 h-5" />}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h3 className="font-semibold text-white text-sm leading-snug truncate">{company.name}</h3>
              <CompanyTypeBadge company={company} />
              <CustomPriceBadge company={company} />
            </div>
            <div className="relative shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5"
                aria-label="Mais ações"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-44 rounded-lg border border-white/10 bg-[#151a23] shadow-xl z-20 py-1 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onView();
                    }}
                    className="w-full px-3 py-2 text-left text-slate-300 hover:bg-white/5 flex items-center gap-2"
                  >
                    <Eye className="w-3.5 h-3.5" /> Detalhes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit();
                    }}
                    className="w-full px-3 py-2 text-left text-slate-300 hover:bg-white/5 flex items-center gap-2"
                  >
                    <Edit className="w-3.5 h-3.5" /> Editar
                  </button>
                  {isActive ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onUpdateStatus(company, 'Inativa');
                      }}
                      className="w-full px-3 py-2 text-left text-orange-400 hover:bg-white/5 flex items-center gap-2"
                    >
                      <PowerOff className="w-3.5 h-3.5" /> Desativar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onUpdateStatus(company, 'Ativa');
                      }}
                      className="w-full px-3 py-2 text-left text-emerald-400 hover:bg-white/5 flex items-center gap-2"
                    >
                      <Power className="w-3.5 h-3.5" /> Ativar
                    </button>
                  )}
                  {!protectedCompany && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete();
                      }}
                      className="w-full px-3 py-2 text-left text-red-400 hover:bg-white/5 flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Excluir
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">{company.slug}</p>
          {isMaster && (
            <span className="inline-block mt-1.5 text-[9px] font-bold uppercase bg-blue-600/80 text-white px-1.5 py-0.5 rounded">
              Master
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <StatusBadge status={company.status_operacional} legacyActive={company.active} />
        <span className="text-[10px] font-medium text-slate-500 px-2 py-0.5 rounded-md bg-white/5 border border-white/5">
          {planLabel(company.plan)}
        </span>
        <span className="text-[10px] font-semibold text-emerald-400/90 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
          {formatSaasCurrency(pricing.appliedPrice)}/mês
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-5 flex-1">
        <div className="rounded-lg bg-[var(--color-background)]/60 border border-white/5 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Projetos</p>
          <p className="text-sm font-semibold text-white flex items-center gap-1.5">
            <MapIcon className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            {projectCount}
            <span className="text-slate-500 font-normal text-xs">
              / {getCompanySaasPlan(company).maxProjects}
            </span>
          </p>
        </div>
        <div className="rounded-lg bg-[var(--color-background)]/60 border border-white/5 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Usuários</p>
          <p className="text-sm font-semibold text-white flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-purple-400" />
            {userCount}
          </p>
        </div>
      </div>

      {!isMaster && (
        <button
          type="button"
          onClick={onImpersonate}
          className="w-full h-10 rounded-lg bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-[0_4px_14px_rgba(249,115,22,0.25)]"
        >
          <LogIn className="w-4 h-4" />
          Entrar
        </button>
      )}
      {isMaster && (
        <p className="text-center text-[11px] text-slate-500 py-2">Tenant master protegido</p>
      )}
    </article>
  );
}
