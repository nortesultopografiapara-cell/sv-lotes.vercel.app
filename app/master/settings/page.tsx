'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  CreditCard,
  Globe,
  Loader2,
  Mail,
  MessageCircle,
  Plug,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Webhook,
} from 'lucide-react';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { fetchJsonWithTimeout } from '@/lib/fetchJsonWithTimeout';

type PlatformStats = {
  totalCompanies: number;
  activeCompanies: number;
  activeSubscriptions: number;
};

type IntegrationStatus = {
  gatewayConfigured: boolean;
  emailConfigured: boolean;
  whatsappConfigured: boolean;
  webhookConfigured: boolean;
};

const FUTURE_CARDS = [
  { title: 'Gateway de pagamento', description: 'Stripe, Mercado Pago, Asaas' },
  { title: 'E-mail SMTP', description: 'Envio transacional da plataforma' },
  { title: 'Integrações', description: 'Webhooks e APIs externas' },
  { title: 'Segurança', description: 'Políticas globais e sessões' },
  { title: 'Parâmetros globais', description: 'Limites e flags da plataforma' },
];

export default function MasterSettingsPage() {
  return (
    <MasterSuperAdminGuard>
      <MasterSettingsContent />
    </MasterSuperAdminGuard>
  );
}

function MasterSettingsContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [integrations, setIntegrations] = useState<IntegrationStatus>({
    gatewayConfigured: false,
    emailConfigured: false,
    whatsappConfigured: false,
    webhookConfigured: false,
  });
  const [stats, setStats] = useState<PlatformStats>({
    totalCompanies: 0,
    activeCompanies: 0,
    activeSubscriptions: 0,
  });

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [{ data: companies }, { data: subscriptions }, integrationsRes] = await Promise.all([
        supabase.from('companies').select('id, active, status_operacional'),
        supabase.from('company_subscriptions').select('id, contract_status'),
        user?.id
          ? fetchJsonWithTimeout<{
              gateway?: { configured?: boolean };
              emailConfigured?: boolean;
              whatsappConfigured?: boolean;
              webhookConfigured?: boolean;
            }>(
              `/api/master/saas-integrations-status?userId=${encodeURIComponent(user.id)}`,
              { credentials: 'include' },
              10_000,
            )
          : Promise.resolve({ ok: false, data: null, error: null, status: 0 }),
      ]);

      const rows = companies || [];
      const activeCompanies = rows.filter(
        (c) => c.active !== false && (c.status_operacional || '').toLowerCase() !== 'inativo',
      ).length;
      const activeSubscriptions = (subscriptions || []).filter(
        (s) => String(s.contract_status || '').toLowerCase() !== 'canceled',
      ).length;

      setStats({
        totalCompanies: rows.length,
        activeCompanies,
        activeSubscriptions,
      });

      if (integrationsRes.ok && integrationsRes.data) {
        setIntegrations({
          gatewayConfigured: integrationsRes.data.gateway?.configured === true,
          emailConfigured: integrationsRes.data.emailConfigured === true,
          whatsappConfigured: integrationsRes.data.whatsappConfigured === true,
          webhookConfigured: integrationsRes.data.webhookConfigured === true,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="sv-page sv-page--scroll-y p-4 md:p-8">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Settings className="w-7 h-7 text-[var(--color-primary)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Configurações da Plataforma</h1>
            <p className="text-sm text-slate-500">Visão geral do ambiente SaaS SV LOTES</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-sm text-slate-200 hover:bg-white/5"
        >
          <RefreshCw className="w-4 h-4" /> Atualizar
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        <InfoCard
          icon={Server}
          title="Dados da plataforma"
          items={[
            ['Nome', 'SV LOTES'],
            ['Modo', 'Produção'],
            ['URL', 'https://www.svlotes.com.br'],
          ]}
        />
        <InfoCard
          icon={Building2}
          title="Empresas"
          items={[
            ['Total de empresas', String(stats.totalCompanies)],
            ['Empresas ativas', String(stats.activeCompanies)],
          ]}
        />
        <InfoCard
          icon={CreditCard}
          title="Assinaturas"
          items={[
            ['Planos ativos', String(stats.activeSubscriptions)],
            ['Status do ambiente', 'Operacional'],
          ]}
        />
        <InfoCard
          icon={Globe}
          title="Ambiente"
          items={[
            ['Região', 'Produção Vercel'],
            ['Banco', 'Supabase'],
          ]}
        />
        <InfoCard
          icon={Shield}
          title="Acesso master"
          items={[
            ['Painel', 'SUPER_ADMIN'],
            ['Auditoria', '/master/audit'],
          ]}
        />
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Integrações
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <IntegrationStatusCard
            icon={CreditCard}
            name="Asaas"
            status={integrations.gatewayConfigured ? 'Conectado' : 'Desconectado'}
            statusTone={integrations.gatewayConfigured ? 'connected' : 'disconnected'}
          />
          <IntegrationStatusCard
            icon={Mail}
            name="SMTP / E-mail"
            status={integrations.emailConfigured ? 'Conectado' : 'Desconectado'}
            statusTone={integrations.emailConfigured ? 'connected' : 'disconnected'}
          />
          <IntegrationStatusCard
            icon={MessageCircle}
            name="WhatsApp"
            status={integrations.whatsappConfigured ? 'Conectado' : 'Desconectado'}
            statusTone={integrations.whatsappConfigured ? 'connected' : 'disconnected'}
          />
          <IntegrationStatusCard
            icon={Webhook}
            name="Webhooks"
            status={integrations.webhookConfigured ? 'Ativo' : 'Inativo'}
            statusTone={integrations.webhookConfigured ? 'connected' : 'inactive'}
          />
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Status lido das variáveis de ambiente configuradas na Vercel (sem consulta pesada ao banco).
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Em breve
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FUTURE_CARDS.map((card) => (
            <div
              key={card.title}
              className="rounded-xl border border-white/10 bg-[var(--color-surface)]/40 p-4 opacity-60"
            >
              <p className="text-sm font-semibold text-slate-300">{card.title}</p>
              <p className="text-xs text-slate-500 mt-1">{card.description}</p>
              <span className="inline-block mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 border border-white/10 rounded px-2 py-0.5">
                Em breve
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function IntegrationStatusCard({
  icon: Icon,
  name,
  status,
  statusTone,
}: {
  icon: typeof Plug;
  name: string;
  status: string;
  statusTone: 'connected' | 'disconnected' | 'inactive';
}) {
  const toneClass =
    statusTone === 'connected'
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
      : statusTone === 'inactive'
        ? 'text-amber-400 bg-amber-500/10 border-amber-500/25'
        : 'text-slate-400 bg-slate-500/10 border-slate-500/25';

  return (
    <div className="rounded-xl border border-white/10 bg-[var(--color-surface)]/60 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold text-white">{name}</h3>
        </div>
      </div>
      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase border ${toneClass}`}>
        {status}
      </span>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof Server;
  title: string;
  items: [string, string][];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[var(--color-surface)]/60 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-[var(--color-primary)]" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <dl className="space-y-2">
        {items.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 text-sm">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-slate-200 text-right break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
