'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  PlugZap,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Webhook,
} from 'lucide-react';
import type { AsaasIntegrationConfigResponse } from '@/lib/finance/asaasIntegrationConfig';
import {
  buildDefaultAsaasWebhookUrl,
  EMPTY_ASAAS_INTEGRATION_CONFIG,
  resolveAsaasPanelUrl,
} from '@/lib/finance/asaasIntegrationConfig';
import {
  AsaasConnectionWizard,
  type AsaasWizardFormState,
} from '@/components/finance/AsaasConnectionWizard';
import {
  asaasSetupCardClasses,
  asaasSetupCardTextClasses,
  buildAsaasSetupStatusCards,
  hasAsaasIntegrationStarted,
  isAsaasIntegrationVerified,
} from '@/lib/finance/asaasIntegrationUiHelpers';

type Props = {
  tenantId: string;
  readOnlyDemo?: boolean;
};

type ActionKind = 'test' | 'webhook' | 'sync' | 'reprocess' | 'refresh' | null;

function configToForm(config: AsaasIntegrationConfigResponse): AsaasWizardFormState {
  return {
    environment: config.environment,
    sandboxApiKey: '',
    productionApiKey: '',
    webhookToken: '',
    webhookUrl: config.webhookUrl,
    pix: config.features.pix,
    boleto: config.features.boleto,
    card: config.features.card,
    paymentLink: config.features.paymentLink,
    autoSync: config.features.autoSync,
  };
}

async function copyText(value: string, label: string) {
  if (!value) {
    alert(`${label} indisponível.`);
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    alert(`${label} copiado.`);
  } catch {
    alert(`Não foi possível copiar ${label.toLowerCase()}.`);
  }
}

export function AsaasIntegrationPanel({ tenantId, readOnlyDemo = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<ActionKind>(null);
  const [config, setConfig] = useState<AsaasIntegrationConfigResponse | null>(null);
  const [form, setForm] = useState<AsaasWizardFormState>(
    configToForm({ ...EMPTY_ASAAS_INTEGRATION_CONFIG, companyId: tenantId, companyName: '' }),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  const suggestedWebhookUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return buildDefaultAsaasWebhookUrl(window.location.origin, tenantId);
  }, [tenantId]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/finance/asaas/integration', { credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      const integration = json.integration as AsaasIntegrationConfigResponse;
      setConfig(integration);
      setForm((prev) => ({
        ...configToForm(integration),
        webhookUrl: integration.webhookUrl || prev.webhookUrl || suggestedWebhookUrl,
      }));
      const verified = isAsaasIntegrationVerified(integration);
      const started = hasAsaasIntegrationStarted(integration);
      setShowWizard(!started || !verified);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar integração Asaas.');
    } finally {
      setLoading(false);
    }
  }, [suggestedWebhookUrl]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  function updateField<K extends keyof AsaasWizardFormState>(key: K, value: AsaasWizardFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(partial?: Partial<AsaasWizardFormState>) {
    const payload = { ...form, ...partial };
    setForm(payload);
    const res = await fetch('/api/finance/asaas/integration', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
    const integration = json.integration as AsaasIntegrationConfigResponse;
    setConfig(integration);
    setForm(configToForm(integration));
  }

  async function runAction(kind: Exclude<ActionKind, null>, path: string, key: string) {
    setAction(kind);
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      const payload = json[key] as { message?: string } | undefined;
      setActionMessage(payload?.message ?? 'Operação concluída.');
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na operação.');
    } finally {
      setAction(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 pb-24">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  const integration = config ?? {
    ...EMPTY_ASAAS_INTEGRATION_CONFIG,
    companyId: tenantId,
    companyName: '',
  };
  const verified = isAsaasIntegrationVerified(integration);
  const started = hasAsaasIntegrationStarted(integration);
  const hasError = integration.connectionStatus === 'ERROR' || integration.connectionStatus === 'WEBHOOK_INVALID';
  const statusCards = buildAsaasSetupStatusCards(integration);
  const panelUrl = resolveAsaasPanelUrl(integration.environment);
  const webhookUrl = form.webhookUrl || suggestedWebhookUrl;

  return (
    <div className="space-y-6 pb-24 sm:pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-[var(--brand-primary)]" />
            <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">Conectar conta Asaas</h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
            Use sua conta Asaas para gerar PIX, boletos e links de pagamento das parcelas dos clientes.
          </p>
        </div>
        {verified ? (
          <span className="inline-flex self-start items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
            <ShieldCheck className="w-4 h-4" />
            Integração verificada
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{error}</p>
            {hasError ? (
              <button
                type="button"
                onClick={() => setShowWizard(true)}
                className="mt-2 text-xs font-semibold underline"
              >
                Corrigir configuração
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      ) : null}
      {actionMessage ? (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
          {actionMessage}
        </div>
      ) : null}

      {!started ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-elevated)]/50 p-6 sm:p-8 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-[var(--brand-primary)]/10 flex items-center justify-center">
            <Banknote className="w-6 h-6 text-[var(--brand-primary)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Nenhuma conta Asaas conectada</h3>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
            Conecte sua conta para começar a gerar cobranças das parcelas no Financeiro.
          </p>
          {!readOnlyDemo ? (
            <button
              type="button"
              onClick={() => setShowWizard(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl sv-brand-bg px-5 py-3 text-sm font-semibold text-white min-h-[48px]"
            >
              Iniciar configuração
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statusCards.map((card) => (
          <div
            key={card.id}
            className={`rounded-xl border p-3 sm:p-4 min-h-[88px] flex flex-col justify-between ${asaasSetupCardClasses(card.status)}`}
          >
            <p className="text-xs sm:text-sm font-medium text-[var(--text-secondary)]">{card.label}</p>
            <p className={`text-xs sm:text-sm font-semibold mt-2 ${asaasSetupCardTextClasses(card.status)}`}>
              {card.statusLabel}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={readOnlyDemo}
          onClick={() => void copyText(webhookUrl, 'Webhook URL')}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2.5 text-xs sm:text-sm font-semibold min-h-[44px] hover:bg-[var(--bg-card)]"
        >
          <Copy className="w-4 h-4" />
          Copiar Webhook URL
        </button>
        {(
          [
            ['test', '/api/finance/asaas/test-connection', 'connection', 'Testar conexão', PlugZap],
            ['webhook', '/api/finance/asaas/validate-webhook', 'validation', 'Validar webhook', Webhook],
            ['sync', '/api/finance/asaas/sync-charges', 'sync', 'Sincronizar cobranças', RefreshCw],
            ['reprocess', '/api/finance/asaas/reprocess-payments', 'reprocess', 'Reprocessar pagamentos', RotateCcw],
            ['refresh', '', '', 'Atualizar status', RefreshCw],
          ] as const
        ).map(([kind, path, key, label, Icon]) => (
          <button
            key={label}
            type="button"
            disabled={readOnlyDemo || action !== null}
            onClick={() => {
              if (kind === 'refresh') {
                void loadConfig();
                return;
              }
              void runAction(kind, path, key);
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2.5 text-xs sm:text-sm font-semibold min-h-[44px] hover:bg-[var(--bg-card)] disabled:opacity-50"
          >
            {action === kind ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
            {label}
          </button>
        ))}
        <a
          href={panelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/10 px-3 py-2.5 text-xs sm:text-sm font-semibold text-[var(--brand-primary)] min-h-[44px] hover:bg-[var(--brand-primary)]/20"
        >
          <ExternalLink className="w-4 h-4" />
          Abrir painel Asaas
        </a>
        {started && !showWizard ? (
          <button
            type="button"
            disabled={readOnlyDemo}
            onClick={() => setShowWizard(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border-color)] px-3 py-2.5 text-xs sm:text-sm font-semibold min-h-[44px]"
          >
            {hasError ? 'Corrigir configuração' : 'Reconfigurar'}
          </button>
        ) : null}
      </div>

      {integration.sync.lastAt || integration.sync.chargesCount > 0 ? (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-[var(--text-secondary)]">
            Última sincronização:{' '}
            <strong className="text-[var(--text-primary)]">
              {integration.sync.lastAt
                ? new Date(integration.sync.lastAt).toLocaleString('pt-BR')
                : 'Nunca'}
            </strong>
          </span>
          <span className="text-[var(--text-secondary)]">
            Cobranças sincronizadas:{' '}
            <strong className="text-[var(--text-primary)]">{integration.sync.chargesCount}</strong>
          </span>
        </div>
      ) : null}

      {showWizard ? (
        <AsaasConnectionWizard
          tenantId={tenantId}
          readOnlyDemo={readOnlyDemo}
          config={integration}
          form={form}
          onChange={updateField}
          onSave={handleSave}
          onReload={loadConfig}
          onFinish={() => {
            setShowWizard(false);
            setSuccess('Integração verificada e ativada com sucesso.');
            void loadConfig();
          }}
        />
      ) : verified ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/8 p-5 flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
          <div>
            <p className="font-semibold text-[var(--text-primary)]">Sua conta Asaas está pronta para uso</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Gere cobranças das parcelas em Financeiro → Parcelas. Pagamentos confirmados baixam automaticamente
              via webhook.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
