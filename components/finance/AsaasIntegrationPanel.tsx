'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Link2,
  Loader2,
  PlugZap,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  Webhook,
  XCircle,
} from 'lucide-react';
import type { AsaasIntegrationConfigResponse } from '@/lib/finance/asaasIntegrationConfig';
import {
  asaasConnectionStatusLabel,
  asaasEnvironmentLabel,
  buildDefaultAsaasWebhookUrl,
  EMPTY_ASAAS_INTEGRATION_CONFIG,
  resolveAsaasPanelUrl,
} from '@/lib/finance/asaasIntegrationConfig';

type Props = {
  tenantId: string;
  readOnlyDemo?: boolean;
};

type FormState = {
  environment: string;
  sandboxApiKey: string;
  productionApiKey: string;
  webhookToken: string;
  webhookUrl: string;
  pix: boolean;
  boleto: boolean;
  card: boolean;
  paymentLink: boolean;
  autoSync: boolean;
};

type ActionKind = 'test' | 'webhook' | 'sync' | 'reprocess' | 'refresh' | null;

function configToForm(config: AsaasIntegrationConfigResponse): FormState {
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

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        ok ? 'text-emerald-400' : 'text-[var(--text-muted)]'
      }`}
    >
      {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
      {label}
    </span>
  );
}

function connectionStatusClasses(status: string): string {
  switch (status) {
    case 'CONNECTED':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
    case 'ERROR':
      return 'border-red-500/40 bg-red-500/10 text-red-300';
    case 'WEBHOOK_INVALID':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
    default:
      return 'border-[var(--border-color)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]';
  }
}

export function AsaasIntegrationPanel({ tenantId, readOnlyDemo = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<ActionKind>(null);
  const [config, setConfig] = useState<AsaasIntegrationConfigResponse | null>(null);
  const [form, setForm] = useState<FormState>(
    configToForm({ ...EMPTY_ASAAS_INTEGRATION_CONFIG, companyId: tenantId, companyName: '' }),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar integração Asaas.');
    } finally {
      setLoading(false);
    }
  }, [suggestedWebhookUrl]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/finance/asaas/integration', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      const integration = json.integration as AsaasIntegrationConfigResponse;
      setConfig(integration);
      setForm(configToForm(integration));
      setSuccess('Configuração Asaas salva com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar configuração.');
    } finally {
      setSaving(false);
    }
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
      const payload = json[key] as { message?: string; ok?: boolean } | undefined;
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
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  const connectionStatus = config?.connectionStatus ?? 'DISCONNECTED';
  const panelUrl = resolveAsaasPanelUrl(config?.environment ?? 'SANDBOX');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-[var(--brand-primary)]" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">ASAAS — Integração oficial</h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Gateway principal de cobrança para <strong>{config?.companyName ?? 'sua empresa'}</strong>.
          </p>
        </div>
        <span
          className={`inline-flex self-start rounded-full border px-3 py-1 text-xs font-semibold ${connectionStatusClasses(connectionStatus)}`}
        >
          {asaasConnectionStatusLabel(connectionStatus as 'CONNECTED')}
        </span>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      ) : null}
      {actionMessage ? (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
          {actionMessage}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Status da conexão</h3>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">Empresa conectada</span>
              <StatusBadge ok={Boolean(config?.companyName)} label={config?.companyName ?? '—'} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">API Key configurada</span>
              <StatusBadge
                ok={Boolean(
                  config?.environment === 'PRODUCTION'
                    ? config?.hasProductionApiKey
                    : config?.hasSandboxApiKey,
                )}
                label={
                  config?.environment === 'PRODUCTION'
                    ? config?.hasProductionApiKey
                      ? 'Produção'
                      : 'Pendente'
                    : config?.hasSandboxApiKey
                      ? 'Sandbox'
                      : 'Pendente'
                }
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">Webhook configurado</span>
              <StatusBadge ok={Boolean(config?.webhookConfigured)} label={config?.webhookConfigured ? 'Sim' : 'Não'} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">Webhook ativo</span>
              <StatusBadge ok={Boolean(config?.webhookActive)} label={config?.webhookActive ? 'Ativo' : 'Inativo'} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">Conta validada</span>
              <StatusBadge ok={Boolean(config?.accountValidated)} label={config?.accountValidated ? 'Sim' : 'Não'} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Meios de pagamento</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <StatusBadge ok={Boolean(config?.features.pix)} label="PIX" />
            <StatusBadge ok={Boolean(config?.features.boleto)} label="Boleto" />
            <StatusBadge ok={Boolean(config?.features.card)} label="Cartão" />
            <StatusBadge ok={Boolean(config?.features.paymentLink)} label="Link de pagamento" />
          </div>
          <div className="pt-2 border-t border-[var(--border-color)] space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">Sincronização automática</span>
              <StatusBadge ok={Boolean(config?.features.autoSync)} label={config?.features.autoSync ? 'Ativa' : 'Inativa'} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">Última sincronização</span>
              <span className="text-[var(--text-primary)] text-xs">
                {config?.sync.lastAt
                  ? new Date(config.sync.lastAt).toLocaleString('pt-BR')
                  : 'Nunca'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">Cobranças sincronizadas</span>
              <span className="text-[var(--text-primary)] font-semibold">{config?.sync.chargesCount ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['test', '/api/finance/asaas/test-connection', 'connection', 'Testar conexão', PlugZap],
            ['webhook', '/api/finance/asaas/validate-webhook', 'validation', 'Validar webhook', Webhook],
            ['sync', '/api/finance/asaas/sync-charges', 'sync', 'Sincronizar cobranças', RefreshCw],
            ['reprocess', '/api/finance/asaas/reprocess-payments', 'reprocess', 'Reprocessar pagamentos', RotateCcw],
            ['refresh', '', '', 'Atualizar dados', RefreshCw],
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-card)] disabled:opacity-50"
          >
            {action === kind ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
            {label}
          </button>
        ))}
        <a
          href={panelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/10 px-3 py-2 text-xs font-semibold text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/20"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Abrir painel Asaas
        </a>
      </div>

      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[var(--brand-primary)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Configuração ASAAS</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Ambiente</span>
            <select
              value={form.environment}
              disabled={readOnlyDemo}
              onChange={(e) => updateField('environment', e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm"
            >
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Produção</option>
            </select>
            <span className="text-xs text-[var(--text-muted)]">
              Ativo: {asaasEnvironmentLabel(form.environment)}
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Webhook URL</span>
            <input
              type="url"
              value={form.webhookUrl || suggestedWebhookUrl}
              disabled={readOnlyDemo}
              onChange={(e) => updateField('webhookUrl', e.target.value)}
              placeholder={suggestedWebhookUrl}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              API Key Sandbox
            </span>
            <input
              type="password"
              value={form.sandboxApiKey}
              disabled={readOnlyDemo}
              onChange={(e) => updateField('sandboxApiKey', e.target.value)}
              placeholder={config?.hasSandboxApiKey ? '•••••••• (configurada)' : 'Cole a API Key sandbox'}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              API Key Produção
            </span>
            <input
              type="password"
              value={form.productionApiKey}
              disabled={readOnlyDemo}
              onChange={(e) => updateField('productionApiKey', e.target.value)}
              placeholder={config?.hasProductionApiKey ? '•••••••• (configurada)' : 'Cole a API Key produção'}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm"
            />
          </label>

          <label className="block space-y-1.5 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Webhook Token
            </span>
            <input
              type="password"
              value={form.webhookToken}
              disabled={readOnlyDemo}
              onChange={(e) => updateField('webhookToken', e.target.value)}
              placeholder={config?.hasWebhookToken ? '•••••••• (configurado)' : 'Token de validação do webhook'}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ['pix', 'PIX', QrCode],
              ['boleto', 'Boleto', Banknote],
              ['card', 'Cartão', CreditCard],
              ['paymentLink', 'Link de pagamento', Link2],
            ] as const
          ).map(([key, label, Icon]) => (
            <label
              key={key}
              className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={form[key]}
                disabled={readOnlyDemo}
                onChange={(e) => updateField(key, e.target.checked)}
              />
              <Icon className="w-4 h-4 text-[var(--text-muted)]" />
              {label}
            </label>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.autoSync}
            disabled={readOnlyDemo}
            onChange={(e) => updateField('autoSync', e.target.checked)}
          />
          Sincronização automática de cobranças
        </label>

        <button
          type="button"
          disabled={readOnlyDemo || saving}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 rounded-lg sv-brand-bg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar configuração Asaas
        </button>
      </div>
    </div>
  );
}
