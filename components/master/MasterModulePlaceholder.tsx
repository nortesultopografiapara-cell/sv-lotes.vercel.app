'use client';

import Link from 'next/link';
import { ArrowLeft, Construction } from 'lucide-react';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';

type MasterModulePlaceholderProps = {
  title: string;
  description?: string;
};

/**
 * Página placeholder exclusiva do Master — sem dados fictícios nem backend.
 */
export function MasterModulePlaceholder({
  title,
  description = 'Este módulo está em preparação e será liberado em uma etapa futura do Painel Master.',
}: MasterModulePlaceholderProps) {
  return (
    <MasterSuperAdminGuard>
      <div className="flex-1 min-h-full p-6 md:p-8 bg-[#f3f4f6]">
        <div className="max-w-2xl mx-auto rounded-xl border border-slate-200 bg-white shadow-sm p-8">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-5">
            <Construction className="w-6 h-6" aria-hidden />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Painel Master
          </p>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{title}</h1>
          <p className="text-slate-600 text-sm leading-relaxed mb-2">Módulo em preparação</p>
          <p className="text-slate-500 text-sm leading-relaxed mb-8">{description}</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            Voltar ao Dashboard Executivo
          </Link>
        </div>
      </div>
    </MasterSuperAdminGuard>
  );
}
