'use client';

import { SAAS_AUTOMATION_RULES } from '@/lib/masterSaasPanel';

export function SaasAutomationsPanel() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/5 bg-[#11161d] p-5">
        <h2 className="text-lg font-bold text-white">Automações SaaS</h2>
        <p className="text-sm text-gray-400 mt-1">
          Estrutura preparada para lembretes, reenvios e suspensão/reativação automática. Ative
          quando o cron/API estiver configurado.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SAAS_AUTOMATION_RULES.map((rule) => (
          <div
            key={rule.id}
            className="rounded-xl border border-white/5 bg-[#11161d] p-4 flex items-start justify-between gap-4"
          >
            <div>
              <p className="text-sm font-semibold text-white">{rule.label}</p>
              <p className="text-xs text-gray-500 mt-1">{rule.description}</p>
              <span className="inline-block mt-2 text-[10px] uppercase tracking-wide text-gray-600">
                {rule.phase}
              </span>
            </div>
            <span
              className={`shrink-0 px-2 py-1 rounded text-[10px] font-bold uppercase ${
                rule.enabled
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-white/5 text-gray-500 border border-white/10'
              }`}
            >
              {rule.enabled ? 'Ativo' : 'Preparado'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
