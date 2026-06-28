'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  HelpCircle,
  Loader2,
  PlugZap,
  Sparkles,
} from 'lucide-react';
import type { AsaasIntegrationConfigResponse } from '@/lib/finance/asaasIntegrationConfig';
import {
  asaasEnvironmentLabel,
  buildDefaultAsaasWebhookUrl,
  resolveAsaasPanelUrl,
} from '@/lib/finance/asaasIntegrationConfig';

export type AsaasWizardFormState = {
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

type ConnectionResult = {
  ok: boolean;
  message: string;
  accountName?: string;
  accountEmail?: string;
  environment?: string;
};

type Props = {
  tenantId: string;
  readOnlyDemo?: boolean;
  config: AsaasIntegrationConfigResponse;
  form: AsaasWizardFormState;
  onChange: <K extends keyof AsaasWizardFormState>(key: K, value: AsaasWizardFormState[K]) => void;
  onSave: (partial?: Partial<AsaasWizardFormState>) => Promise<void>;
  onReload: () => Promise<void>;
  onFinish?: () => void;
  startStep?: number;
};

const STEPS = [
  { id: 1, title: 'Ambiente' },
  { id: 2, title: 'API Key' },
  { id: 3, title: 'Conexão' },
  { id: 4, title: 'Webhook' },
  { id: 5, title: 'Pagamentos' },
  { id: 6, title: 'Concluir' },
] as const;

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

export function AsaasConnectionWizard({
  tenantId,
  readOnlyDemo = false,
  config,
  form,
  onChange,
  onSave,
  onReload,
  onFinish,
  startStep = 1,
}: Props) {
  const [step, setStep] = useState(startStep);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionResult | null>(null);
  const [webhookMessage, setWebhookMessage] = useState<string | null>(null);
  const [showApiHelp, setShowApiHelp] = useState(false);

  const webhookUrl = useMemo(() => {
    if (typeof window === 'undefined') return form.webhookUrl;
    return form.webhookUrl || buildDefaultAsaasWebhookUrl(window.location.origin, tenantId);
  }, [form.webhookUrl, tenantId]);

  const isProduction = form.environment === 'PRODUCTION';
  const hasSavedApiKey = isProduction ? config.hasProductionApiKey : config.hasSandboxApiKey;
  const panelUrl = resolveAsaasPanelUrl(form.environment);

  async function runTestConnection() {
    setBusy('test');
    setError(null);
    setConnection(null);
    try {
      await onSave();
      const res = await fetch('/api/finance/asaas/test-connection', {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      const result = (json.connection || {}) as ConnectionResult;
      setConnection(result);
      if (!result.ok) setError(result.message);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao testar conexão.');
    } finally {
      setBusy(null);
    }
  }

  async function runValidateWebhook() {
    setBusy('webhook');
    setError(null);
    setWebhookMessage(null);
    try {
      onChange('webhookUrl', webhookUrl);
      await onSave({ webhookUrl, webhookToken: form.webhookToken });
      const res = await fetch('/api/finance/asaas/validate-webhook', {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      const validation = json.validation as { message?: string; ok?: boolean };
      setWebhookMessage(validation?.message ?? 'Webhook validado.');
      if (!validation?.ok) setError(validation?.message ?? 'Webhook inválido.');
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao validar webhook.');
    } finally {
      setBusy(null);
    }
  }

  async function handleActivate() {
    setBusy('activate');
    setError(null);
    try {
      onChange('webhookUrl', webhookUrl);
      await onSave({ webhookUrl, autoSync: form.autoSync });
      await runTestConnection();
      await runValidateWebhook();
      await onReload();
      onFinish?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ativar integração.');
    } finally {
      setBusy(null);
    }
  }

  async function goNext() {
    setError(null);
    if (step === 2) {
      setBusy('save');
      try {
        await onSave();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao salvar API Key.');
        setBusy(null);
        return;
      }
      setBusy(null);
    }
    if (step === 4) {
      onChange('webhookUrl', webhookUrl);
      setBusy('save');
      try {
        await onSave({ webhookUrl });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao salvar webhook.');
        setBusy(null);
        return;
      }
      setBusy(null);
    }
    if (step === 5) {
      setBusy('save');
      try {
        await onSave();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao salvar meios de pagamento.');
        setBusy(null);
        return;
      }
      setBusy(null);
    }
    setStep((s) => Math.min(6, s + 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  return (
    <div className="asaas-wizard rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-6 pb-24 sm:pb-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-primary)]">
            Assistente de configuração
          </p>
          <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] mt-0.5">
            Etapa {step} de {STEPS.length} — {STEPS[step - 1]?.title}
          </h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STEPS.map((s) => (
            <span
              key={s.id}
              className={`h-2 w-6 sm:w-8 rounded-full transition-colors ${
                s.id <= step ? 'bg-[var(--brand-primary)]' : 'bg-[var(--border-color)]'
              }`}
              title={s.title}
            />
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Escolha onde suas cobranças serão emitidas. Você pode alterar depois, se necessário.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['SANDBOX', 'PRODUCTION'] as const).map((env) => {
              const selected = form.environment === env;
              return (
                <button
                  key={env}
                  type="button"
                  disabled={readOnlyDemo}
                  onClick={() => onChange('environment', env)}
                  className={`rounded-xl border p-4 text-left transition-colors min-h-[88px] ${
                    selected
                      ? 'border-[var(--brand-primary)] sv-brand-muted-bg ring-1 ring-[color-mix(in_srgb,var(--brand-primary)_30%,transparent)]'
                      : 'border-[var(--border-color)] hover:bg-[var(--bg-elevated)]'
                  }`}
                >
                  <p className="font-semibold text-[var(--text-primary)]">{asaasEnvironmentLabel(env)}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {env === 'SANDBOX'
                      ? 'Ideal para testes sem movimentar dinheiro real.'
                      : 'Use quando for receber pagamentos reais dos clientes.'}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Use <strong>Sandbox</strong> para testes. Use <strong>Produção</strong> apenas quando for receber
            valores reais.
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Cole a API Key da conta Asaas da sua empresa. Ela fica criptografada e nunca é exibida por completo.
          </p>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              API Key — {asaasEnvironmentLabel(form.environment)}
            </span>
            <input
              type="password"
              autoComplete="off"
              disabled={readOnlyDemo}
              value={isProduction ? form.productionApiKey : form.sandboxApiKey}
              onChange={(e) =>
                onChange(isProduction ? 'productionApiKey' : 'sandboxApiKey', e.target.value)
              }
              placeholder={
                hasSavedApiKey
                  ? 'API Key salva — deixe vazio para manter'
                  : 'Cole sua API Key aqui'
              }
              className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3 text-sm min-h-[48px]"
            />
          </label>
          <button
            type="button"
            onClick={() => setShowApiHelp((v) => !v)}
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--brand-primary)] hover:underline"
          >
            <HelpCircle className="w-4 h-4" />
            Onde encontro minha API Key?
          </button>
          {showApiHelp ? (
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-secondary)] space-y-2">
              <p>No painel Asaas, acesse:</p>
              <p className="font-medium text-[var(--text-primary)]">
                Configurações → Integrações → Chaves de API
              </p>
              <a
                href={panelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[var(--brand-primary)] font-medium"
              >
                Abrir painel Asaas
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Vamos confirmar se a API Key está correta e se conseguimos falar com sua conta Asaas.
          </p>
          <button
            type="button"
            disabled={readOnlyDemo || busy !== null}
            onClick={() => void runTestConnection()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl sv-brand-bg px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-50 min-h-[48px]"
          >
            {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
            Testar conexão
          </button>
          {connection?.ok ? (
            <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                <CheckCircle2 className="w-5 h-5" />
                Conta Asaas conectada com sucesso.
              </div>
              <dl className="grid gap-1 text-sm text-[var(--text-secondary)]">
                {connection.accountName ? (
                  <div className="flex gap-2">
                    <dt className="text-[var(--text-muted)]">Conta:</dt>
                    <dd className="text-[var(--text-primary)]">{connection.accountName}</dd>
                  </div>
                ) : null}
                {connection.accountEmail ? (
                  <div className="flex gap-2">
                    <dt className="text-[var(--text-muted)]">E-mail:</dt>
                    <dd className="text-[var(--text-primary)]">{connection.accountEmail}</dd>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <dt className="text-[var(--text-muted)]">Ambiente:</dt>
                  <dd className="text-[var(--text-primary)]">
                    {asaasEnvironmentLabel(connection.environment || form.environment)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Cadastre esta URL no painel Asaas para receber confirmação automática de pagamentos das parcelas.
          </p>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Webhook URL</span>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                readOnly
                value={webhookUrl}
                className="flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3 text-xs sm:text-sm min-h-[48px]"
              />
              <button
                type="button"
                onClick={() => void copyText(webhookUrl, 'Webhook URL')}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] px-4 py-3 text-sm font-semibold min-h-[48px] hover:bg-[var(--bg-elevated)]"
              >
                <Copy className="w-4 h-4" />
                Copiar URL
              </button>
            </div>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Webhook Token</span>
            <input
              type="password"
              autoComplete="off"
              disabled={readOnlyDemo}
              value={form.webhookToken}
              onChange={(e) => onChange('webhookToken', e.target.value)}
              placeholder={
                config.hasWebhookToken
                  ? 'Webhook Token salvo — deixe vazio para manter'
                  : 'Cole o token definido no Asaas'
              }
              className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3 text-sm min-h-[48px]"
            />
          </label>
          <button
            type="button"
            disabled={readOnlyDemo || busy !== null}
            onClick={() => void runValidateWebhook()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/10 px-5 py-3.5 text-sm font-semibold text-[var(--brand-primary)] disabled:opacity-50 min-h-[48px]"
          >
            {busy === 'webhook' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Validar webhook
          </button>
          {webhookMessage ? (
            <p className="text-sm text-emerald-300">{webhookMessage}</p>
          ) : null}
        </div>
      ) : null}

      {step === 5 ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Escolha quais formas de pagamento deseja oferecer nas cobranças das parcelas.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['pix', 'PIX', 'Receba via QR Code e Pix copia e cola'],
                ['boleto', 'Boleto', 'Emita boletos bancários para seus clientes'],
                ['paymentLink', 'Link de pagamento', 'Envie um link único de cobrança'],
                ['card', 'Cartão', 'Permita pagamento com cartão (quando habilitado no Asaas)'],
              ] as const
            ).map(([key, label, hint]) => (
              <label
                key={key}
                className="flex items-start gap-3 rounded-xl border border-[var(--border-color)] p-4 cursor-pointer min-h-[72px]"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form[key]}
                  disabled={readOnlyDemo}
                  onChange={(e) => onChange(key, e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">{label}</span>
                  <span className="block text-xs text-[var(--text-muted)] mt-0.5">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-[var(--border-color)] p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoSync}
              disabled={readOnlyDemo}
              onChange={(e) => onChange('autoSync', e.target.checked)}
            />
            <span>
              <span className="block text-sm font-semibold text-[var(--text-primary)]">
                Sincronização automática
              </span>
              <span className="block text-xs text-[var(--text-muted)] mt-0.5">
                Mantém cobranças alinhadas com o Asaas periodicamente.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {step === 6 ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2 text-emerald-300 font-semibold mb-3">
              <Sparkles className="w-5 h-5" />
              Resumo da integração
            </div>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
              <li>
                <strong className="text-[var(--text-primary)]">Ambiente:</strong>{' '}
                {asaasEnvironmentLabel(form.environment)}
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">API Key:</strong>{' '}
                {hasSavedApiKey || (isProduction ? form.productionApiKey : form.sandboxApiKey)
                  ? 'Configurada'
                  : 'Pendente'}
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Webhook:</strong>{' '}
                {config.webhookActive ? 'Verificado' : config.webhookConfigured ? 'Configurado' : 'Pendente'}
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Meios:</strong>{' '}
                {[
                  form.pix && 'PIX',
                  form.boleto && 'Boleto',
                  form.paymentLink && 'Link',
                  form.card && 'Cartão',
                ]
                  .filter(Boolean)
                  .join(', ') || 'Nenhum selecionado'}
              </li>
            </ul>
          </div>
          <button
            type="button"
            disabled={readOnlyDemo || busy !== null}
            onClick={() => void handleActivate()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl sv-brand-bg px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-50 min-h-[52px]"
          >
            {busy === 'activate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Ativar integração
          </button>
          <p className="text-xs text-center text-[var(--text-muted)]">
            Ao ativar, testamos a conexão e validamos o webhook automaticamente.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between pt-2 border-t border-[var(--border-color)]">
        <button
          type="button"
          disabled={step === 1 || busy !== null}
          onClick={goBack}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] px-4 py-3 text-sm font-semibold min-h-[48px] disabled:opacity-40"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        {step < 6 ? (
          <button
            type="button"
            disabled={readOnlyDemo || busy !== null}
            onClick={() => void goNext()}
            className="inline-flex items-center justify-center gap-2 rounded-xl sv-brand-bg px-5 py-3 text-sm font-semibold text-white min-h-[48px] disabled:opacity-50"
          >
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Continuar
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
