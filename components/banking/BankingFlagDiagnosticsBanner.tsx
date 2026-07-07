'use client';

import type { BankingUiDiagnostics } from '@/lib/banking/config';

type Props = {
  diagnostics: BankingUiDiagnostics;
};

/** Componente interno — diagnóstico de feature flag (não renderizar na UI de Configurações). */
export function BankingFlagDiagnosticsBanner({ diagnostics }: Props) {
  return (
    <div
      className="mb-6 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs font-mono text-amber-100/90 space-y-1"
      role="status"
      aria-label="Diagnóstico feature flag bancária"
    >
      <p className="font-semibold text-amber-200 uppercase tracking-wide text-[10px]">
        Diagnóstico bancário (Preview/develop)
      </p>
      <p>
        NEXT_PUBLIC_BANKING_MODULE_ENABLED ={' '}
        <span className="text-amber-50">{diagnostics.nextPublicRaw}</span>
      </p>
      <p>
        bankingUiEnabled ={' '}
        <span className={diagnostics.bankingUiEnabled ? 'text-green-300' : 'text-red-300'}>
          {String(diagnostics.bankingUiEnabled)}
        </span>
      </p>
      <p className="text-amber-200/70">
        server BANKING_MODULE_ENABLED = {String(diagnostics.serverModuleEnabled)} · VERCEL_ENV ={' '}
        {diagnostics.vercelEnv}
      </p>
    </div>
  );
}
