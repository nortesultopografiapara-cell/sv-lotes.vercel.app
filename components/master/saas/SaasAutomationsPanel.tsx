'use client';

import { useEffect, useState } from 'react';
import { SAAS_AUTOMATION_RULES } from '@/lib/masterSaasPanel';
import { SAAS_BILLING_REMINDER_DEFINITIONS } from '@/lib/saasBillingReminderTypes';
import { useAuth } from '@/hooks/useAuth';
import { formatDateBr } from '@/lib/saasSubscription';

type ReminderStat = {
  automationId: string;
  reminderType: string;
  channel: string;
  totalSent: number;
  lastSentAt: string | null;
  lastSentTo: string | null;
};

const REMINDER_AUTOMATION_IDS = new Set(
  SAAS_BILLING_REMINDER_DEFINITIONS.map((item) => item.automationId),
);

export function SaasAutomationsPanel() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ReminderStat[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/master/saas-billing-reminders?userId=${encodeURIComponent(user.id)}`,
        );
        const json = await res.json();
        if (!cancelled && res.ok) {
          setStats(Array.isArray(json.stats) ? json.stats : []);
          setEmailConfigured(json.emailConfigured !== false);
        }
      } catch {
        if (!cancelled) setStats([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStats();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const statsByAutomation = new Map(stats.map((item) => [item.automationId, item]));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/5 bg-[#11161d] p-5">
        <h2 className="text-lg font-bold text-white">Automações SaaS</h2>
        <p className="text-sm text-gray-400 mt-1">
          Lembretes automáticos por e-mail executados diariamente via cron (
          <code className="text-gray-500">/api/cron/saas-billing-reminders</code>
          ). WhatsApp preparado para próxima etapa.
        </p>
        {!emailConfigured ? (
          <p className="mt-3 text-sm text-amber-300">
            RESEND_API_KEY não configurada — os lembretes por e-mail não serão enviados até configurar
            o serviço de e-mail.
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SAAS_AUTOMATION_RULES.map((rule) => {
          const isReminder = REMINDER_AUTOMATION_IDS.has(rule.id);
          const stat = statsByAutomation.get(rule.id);

          return (
            <div
              key={rule.id}
              className="rounded-xl border border-white/5 bg-[#11161d] p-4 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{rule.label}</p>
                <p className="text-xs text-gray-500 mt-1">{rule.description}</p>
                <span className="inline-block mt-2 text-[10px] uppercase tracking-wide text-gray-600">
                  {rule.phase}
                </span>

                {isReminder ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        E-mail · Ativo
                      </span>
                      <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-white/5 text-gray-500 border border-white/10">
                        WhatsApp · Em breve
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 space-y-1">
                      <p>
                        Envios realizados:{' '}
                        <span className="text-gray-200 font-semibold">
                          {loading ? '…' : stat?.totalSent ?? 0}
                        </span>
                      </p>
                      <p>
                        Último envio:{' '}
                        <span className="text-gray-200">
                          {loading
                            ? '…'
                            : stat?.lastSentAt
                              ? formatDateBr(stat.lastSentAt.split('T')[0])
                              : '—'}
                        </span>
                      </p>
                      {stat?.lastSentTo ? (
                        <p className="truncate">
                          Destino: <span className="text-gray-300">{stat.lastSentTo}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
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
          );
        })}
      </div>
    </div>
  );
}
