'use client';

import { useEffect, useState } from 'react';
import { SAAS_AUTOMATION_RULES } from '@/lib/masterSaasPanel';
import { SAAS_BILLING_REMINDER_DEFINITIONS } from '@/lib/saasBillingReminderTypes';
import { useAuth } from '@/hooks/useAuth';
import { formatDateBr } from '@/lib/saasSubscription';
import { SaasWhatsAppTestModal } from './SaasWhatsAppTestModal';

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

function formatLastSent(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatDateBr(iso.split('T')[0]);
}

export function SaasAutomationsPanel({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const { user } = useAuth();
  const [stats, setStats] = useState<ReminderStat[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [whatsappConfigured, setWhatsappConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testModalOpen, setTestModalOpen] = useState(false);

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
          setWhatsappConfigured(json.whatsappConfigured === true);
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

  const statsByKey = new Map(stats.map((item) => [`${item.automationId}:${item.channel}`, item]));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/5 bg-[#11161d] p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Automações SaaS</h2>
            <p className="text-sm text-gray-400 mt-1">
              Lembretes automáticos por e-mail e WhatsApp executados diariamente via cron (
              <code className="text-gray-500">/api/cron/saas-billing-reminders</code>
              ).
            </p>
          </div>
          {isSuperAdmin && user?.id ? (
            <button
              type="button"
              onClick={() => setTestModalOpen(true)}
              className="shrink-0 px-4 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[13px] font-semibold hover:bg-emerald-500/20"
            >
              Testar WhatsApp
            </button>
          ) : null}
        </div>
        {!emailConfigured ? (
          <p className="mt-3 text-sm text-amber-300">
            RESEND_API_KEY não configurada — os lembretes por e-mail não serão enviados até configurar
            o serviço de e-mail.
          </p>
        ) : null}
        {!whatsappConfigured ? (
          <p className="mt-3 text-sm text-gray-400">
            Z-API não configurada — configure ZAPI_INSTANCE_ID e ZAPI_INSTANCE_TOKEN (ou ZAPI_TOKEN)
            na Vercel para ativar WhatsApp automático.
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SAAS_AUTOMATION_RULES.map((rule) => {
          const isReminder = REMINDER_AUTOMATION_IDS.has(rule.id);
          const emailStat = statsByKey.get(`${rule.id}:email`);
          const whatsappStat = statsByKey.get(`${rule.id}:whatsapp`);

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
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        E-mail · Ativo
                      </span>
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${
                          whatsappConfigured
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-white/5 text-gray-500 border-white/10'
                        }`}
                      >
                        WhatsApp · {whatsappConfigured ? 'Ativo' : 'Em breve'}
                      </span>
                    </div>

                    <div className="text-[11px] text-gray-400 space-y-1">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">E-mail</p>
                      <p>
                        Envios realizados:{' '}
                        <span className="text-gray-200 font-semibold">
                          {loading ? '…' : emailStat?.totalSent ?? 0}
                        </span>
                      </p>
                      <p>
                        Último envio:{' '}
                        <span className="text-gray-200">
                          {loading ? '…' : formatLastSent(emailStat?.lastSentAt)}
                        </span>
                      </p>
                      {emailStat?.lastSentTo ? (
                        <p className="truncate">
                          Destino: <span className="text-gray-300">{emailStat.lastSentTo}</span>
                        </p>
                      ) : null}
                    </div>

                    <div className="text-[11px] text-gray-400 space-y-1">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">WhatsApp</p>
                      <p>
                        Envios realizados:{' '}
                        <span className="text-gray-200 font-semibold">
                          {loading ? '…' : whatsappStat?.totalSent ?? 0}
                        </span>
                      </p>
                      <p>
                        Último envio:{' '}
                        <span className="text-gray-200">
                          {loading ? '…' : formatLastSent(whatsappStat?.lastSentAt)}
                        </span>
                      </p>
                      {whatsappStat?.lastSentTo ? (
                        <p className="truncate">
                          Destino: <span className="text-gray-300">{whatsappStat.lastSentTo}</span>
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

      {isSuperAdmin && user?.id ? (
        <SaasWhatsAppTestModal
          open={testModalOpen}
          userId={user.id}
          whatsappConfigured={whatsappConfigured}
          onClose={() => setTestModalOpen(false)}
        />
      ) : null}
    </div>
  );
}
