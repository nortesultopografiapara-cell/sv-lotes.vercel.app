'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Banknote,
  Loader2,
  PlugZap,
  QrCode,
  ReceiptText,
  Save,
  Shield,
} from 'lucide-react';
import type { BankBoletoPayload, BankPixPayload } from '@/lib/banking/types';
import type { BankIntegrationConfigResponse } from '@/lib/banking/integrationConfig';
import {
  BANKING_CONFIG_ENVIRONMENT_OPTIONS,
  BANKING_CONFIG_PROVIDER_OPTIONS,
  EMPTY_BANK_INTEGRATION_CONFIG,
  environmentLabel,
  providerLabel,
} from '@/lib/banking/integrationConfig';

type ConnectionResult = {
  ok: boolean;
  message: string;
  latencyMs?: number;
};

type Props = {
  tenantId: string;
  readOnlyDemo?: boolean;
};

type ChargeResult =
  | { kind: 'boleto'; data: BankBoletoPayload }
  | { kind: 'pix'; data: BankPixPayload }
  | null;

type FormState = {
  bankProvider: string;
  environment: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  apiBaseUrl: string;
  webhookUrl: string;
  agency: string;
  account: string;
  accountDigit: string;
  walletCode: string;
  agreementCode: string;
  beneficiaryCode: string;
  pixKey: string;
  certificateName: string;
  certificatePassword: string;
  active: boolean;
};

function configToForm(config: BankIntegrationConfigResponse): FormState {
  return {
    bankProvider: config.bankProvider,
    environment: config.environment,
    clientId: config.clientId,
    clientSecret: '',
    webhookSecret: '',
    apiBaseUrl: config.apiBaseUrl,
    webhookUrl: config.webhookUrl,
    agency: config.agency,
    account: config.account,
    accountDigit: config.accountDigit,
    walletCode: config.walletCode,
    agreementCode: config.agreementCode,
    beneficiaryCode: config.beneficiaryCode,
    pixKey: config.pixKey,
    certificateName: config.certificateName,
    certificatePassword: '',
    active: config.active,
  };
}

export function BankingIntegrationPanel({ tenantId, readOnlyDemo = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<'test' | 'boleto' | 'pix' | null>(null);
  const [config, setConfig] = useState<BankIntegrationConfigResponse | null>(null);
  const [form, setForm] = useState<FormState>(configToForm({ ...EMPTY_BANK_INTEGRATION_CONFIG, companyId: tenantId }));
  const [connection, setConnection] = useState<ConnectionResult | null>(null);
  const [chargeResult, setChargeResult] = useState<ChargeResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/banking/integration', { credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      const integration = json.integration as BankIntegrationConfigResponse;
      setConfig(integration);
      setForm(configToForm(integration));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar configuração.');
    } finally {
      setLoading(false);
    }
  }, []);

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
      const res = await fetch('/api/banking/integration', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      const integration = json.integration as BankIntegrationConfigResponse;
      setConfig(integration);
      setForm(configToForm(integration));
      setSuccess('Configuração bancária salva com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar configuração.');
    } finally {
      setSaving(false);
    }
  }

  async function callTestConnection() {
    setAction('test');
    setError(null);
    setConnection(null);
    try {
      if (form.bankProvider === 'MOCK') {
        const res = await fetch('/api/banking/mock/test-connection', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'MOCK' }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
        setConnection(json.connection ?? null);
        setChargeResult(null);
        return;
      }

      if (form.bankProvider === 'SICOOB') {
        const res = await fetch('/api/banking/sicoob/test-connection', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: form.clientId,
            clientSecret: form.clientSecret || undefined,
            environment: form.environment,
            agency: form.agency,
            account: form.account,
            accountDigit: form.accountDigit,
            walletCode: form.walletCode,
            agreementCode: form.agreementCode,
            beneficiaryCode: form.beneficiaryCode,
            pixKey: form.pixKey,
            certificateName: form.certificateName,
            certificatePassword: form.certificatePassword || undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
        setConnection(json.connection ?? null);
        setChargeResult(null);
        return;
      }

      throw new Error('Teste de conexão disponível apenas para MOCK ou Sicoob nesta fase.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no teste de conexão.');
    } finally {
      setAction(null);
    }
  }

  async function callMockApi(path: string, label: 'boleto' | 'pix') {
    setAction(label);
    setError(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'MOCK' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      if (label === 'boleto') {
        setChargeResult({ kind: 'boleto', data: json.charge });
      } else {
        setChargeResult({ kind: 'pix', data: json.charge });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na operação MOCK.');
    } finally {
      setAction(null);
    }
  }

  const busy = saving || action !== null;
  const status = config?.status ?? 'DRAFT';
  const isMockProvider = form.bankProvider === 'MOCK';
  const isSicoobProvider = form.bankProvider === 'SICOOB';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sv-theme-card p-6 rounded-xl border border-[var(--border-color)] shadow-lg">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center text-[var(--color-primary)]">
            <Banknote className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Integração Bancária</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {isSicoobProvider
                ? 'Integração Sicoob em preparação. Nenhum boleto real será emitido nesta fase.'
                : 'Cadastro da integração — MOCK disponível para testes fictícios.'}
            </p>
          </div>
        </div>

        {isSicoobProvider ? (
          <div className="mb-6 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Integração Sicoob em preparação. Nenhum boleto real será emitido nesta fase.
          </div>
        ) : null}

        <section className="mb-8">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Status
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            <StatusCard label="Integração" value={config?.id ? 'Configurada' : 'Não configurada'} />
            <StatusCard label="Banco" value={providerLabel(form.bankProvider)} />
            <StatusCard label="Ambiente" value={environmentLabel(form.environment)} />
            <StatusCard
              label="Última configuração"
              value={config?.configuredAt ? formatDateTime(config.configuredAt) : '—'}
            />
            <StatusCard label="Provider" value={form.bankProvider} />
            <StatusCard label="Status" value={status} />
          </dl>
        </section>

        <form
          className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <FormSection title="1. Banco">
            <Field label="Banco">
              <select
                className="sv-theme-field w-full"
                value={form.bankProvider}
                disabled={readOnlyDemo}
                onChange={(e) => updateField('bankProvider', e.target.value)}
              >
                {BANKING_CONFIG_PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
          </FormSection>

          <FormSection title="2. Ambiente">
            <Field label="Ambiente">
              <select
                className="sv-theme-field w-full"
                value={form.environment}
                disabled={readOnlyDemo}
                onChange={(e) => updateField('environment', e.target.value)}
              >
                {BANKING_CONFIG_ENVIRONMENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
          </FormSection>

          <FormSection title="3. Credenciais">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Client ID">
                <input
                  className="sv-theme-field w-full"
                  value={form.clientId}
                  disabled={readOnlyDemo}
                  onChange={(e) => updateField('clientId', e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label="Client Secret">
                <SecretInput
                  value={form.clientSecret}
                  placeholder={config?.hasClientSecret ? '••••••••  (salvo — deixe vazio para manter)' : 'Informe o client secret'}
                  disabled={readOnlyDemo}
                  onChange={(v) => updateField('clientSecret', v)}
                />
              </Field>
              <Field label="Webhook Secret">
                <SecretInput
                  value={form.webhookSecret}
                  placeholder={config?.hasWebhookSecret ? '••••••••  (salvo — deixe vazio para manter)' : 'Informe o webhook secret'}
                  disabled={readOnlyDemo}
                  onChange={(v) => updateField('webhookSecret', v)}
                />
              </Field>
              <Field label="API Base URL">
                <input
                  className="sv-theme-field w-full"
                  value={form.apiBaseUrl}
                  disabled={readOnlyDemo}
                  onChange={(e) => updateField('apiBaseUrl', e.target.value)}
                  placeholder="https://api.sandbox.banco.exemplo/v1"
                />
              </Field>
              <Field label="Webhook URL" className="md:col-span-2">
                <input
                  className="sv-theme-field w-full"
                  value={form.webhookUrl}
                  disabled={readOnlyDemo}
                  onChange={(e) => updateField('webhookUrl', e.target.value)}
                  placeholder="https://seu-dominio/api/banking/webhook"
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="4. Dados bancários">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Agência">
                <input className="sv-theme-field w-full" value={form.agency} disabled={readOnlyDemo} onChange={(e) => updateField('agency', e.target.value)} />
              </Field>
              <Field label="Conta">
                <input className="sv-theme-field w-full" value={form.account} disabled={readOnlyDemo} onChange={(e) => updateField('account', e.target.value)} />
              </Field>
              <Field label="Dígito">
                <input className="sv-theme-field w-full" value={form.accountDigit} disabled={readOnlyDemo} onChange={(e) => updateField('accountDigit', e.target.value)} />
              </Field>
              <Field label="Carteira">
                <input className="sv-theme-field w-full" value={form.walletCode} disabled={readOnlyDemo} onChange={(e) => updateField('walletCode', e.target.value)} />
              </Field>
              <Field label="Convênio">
                <input className="sv-theme-field w-full" value={form.agreementCode} disabled={readOnlyDemo} onChange={(e) => updateField('agreementCode', e.target.value)} />
              </Field>
              <Field label="Código do Beneficiário">
                <input className="sv-theme-field w-full" value={form.beneficiaryCode} disabled={readOnlyDemo} onChange={(e) => updateField('beneficiaryCode', e.target.value)} />
              </Field>
              <Field label="Chave Pix" className="sm:col-span-2 lg:col-span-3">
                <input className="sv-theme-field w-full" value={form.pixKey} disabled={readOnlyDemo} onChange={(e) => updateField('pixKey', e.target.value)} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="5. Certificado">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nome do certificado">
                <input
                  className="sv-theme-field w-full"
                  value={form.certificateName}
                  disabled={readOnlyDemo}
                  onChange={(e) => updateField('certificateName', e.target.value)}
                  placeholder="certificado-a1.pfx"
                />
              </Field>
              <Field label="Senha do certificado">
                <SecretInput
                  value={form.certificatePassword}
                  placeholder={config?.hasCertificatePassword ? '••••••••  (salva — deixe vazio para manter)' : 'Senha do certificado'}
                  disabled={readOnlyDemo}
                  onChange={(v) => updateField('certificatePassword', v)}
                />
              </Field>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-2">
              Upload do arquivo A1 será implementado em fase posterior.
            </p>
          </FormSection>

          <Field label="Integração ativa">
            <label className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={form.active}
                disabled={readOnlyDemo}
                onChange={(e) => updateField('active', e.target.checked)}
              />
              Marcar integração como ativa (emissão real ainda indisponível)
            </label>
          </Field>

          <div className="flex flex-wrap gap-3 pt-2 border-t border-[var(--border-color)]">
            <button
              type="submit"
              disabled={readOnlyDemo || busy}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg sv-brand-btn-primary text-sm font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Configuração
            </button>
            <button
              type="button"
              disabled={readOnlyDemo || busy}
              onClick={() => void callTestConnection()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-sm font-medium hover:bg-[var(--bg-elevated)] disabled:opacity-50"
            >
              {action === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
              Testar Conexão
            </button>
            {isMockProvider ? (
              <>
                <button
                  type="button"
                  disabled={readOnlyDemo || busy}
                  onClick={() => callMockApi('/api/banking/mock/create-boleto', 'boleto')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-sm font-medium hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                >
                  {action === 'boleto' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ReceiptText className="w-4 h-4" />}
                  Gerar Boleto MOCK
                </button>
                <button
                  type="button"
                  disabled={readOnlyDemo || busy}
                  onClick={() => callMockApi('/api/banking/mock/create-pix', 'pix')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-sm font-medium hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                >
                  {action === 'pix' ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                  Gerar Pix MOCK
                </button>
              </>
            ) : null}
          </div>
        </form>
      </div>

      {success ? (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
          {success}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {connection ? (
        <div className="sv-theme-card p-4 rounded-xl border border-[var(--border-color)] text-sm">
          <p className="font-semibold text-[var(--text-primary)] mb-1">
            Resultado — teste de conexão ({isSicoobProvider ? 'Sicoob' : 'MOCK'})
          </p>
          <p className={connection.ok ? 'text-green-400' : 'text-red-400'}>{connection.message}</p>
          {connection.latencyMs != null ? (
            <p className="text-[var(--text-secondary)] mt-1">Latência simulada: {connection.latencyMs} ms</p>
          ) : null}
        </div>
      ) : null}

      {chargeResult?.kind === 'boleto' ? (
        <div className="sv-theme-card p-5 rounded-xl border border-[var(--border-color)] space-y-3 text-sm">
          <p className="font-semibold text-[var(--text-primary)]">Resultado — boleto MOCK</p>
          <ResultRow label="Status" value={chargeResult.data.status} />
          <ResultRow label="Linha digitável" value={chargeResult.data.digitableLine} mono />
          <ResultRow label="Código de barras" value={chargeResult.data.barcode} mono />
          <ResultRow label="Link de pagamento" value={chargeResult.data.paymentUrl} link />
        </div>
      ) : null}

      {chargeResult?.kind === 'pix' ? (
        <div className="sv-theme-card p-5 rounded-xl border border-[var(--border-color)] space-y-3 text-sm">
          <p className="font-semibold text-[var(--text-primary)]">Resultado — Pix MOCK</p>
          <ResultRow label="Status" value={chargeResult.data.status} />
          {chargeResult.data.pixQrCode ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">QR Code Pix fictício</p>
              <img
                src={chargeResult.data.pixQrCode}
                alt="QR Code Pix MOCK"
                className="w-40 h-40 rounded border border-[var(--border-color)] bg-white"
              />
            </div>
          ) : null}
          <ResultRow label="Pix copia e cola" value={chargeResult.data.pixCopyPaste} mono />
          <ResultRow label="Link de pagamento" value={chargeResult.data.paymentUrl} link />
        </div>
      ) : null}
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 pb-2 border-b border-[var(--border-color)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="sv-theme-label block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function SecretInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="password"
      className="sv-theme-field w-full"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="new-password"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--bg-elevated)] p-3 border border-[var(--border-color)]">
      <dt className="text-[var(--text-secondary)] text-xs uppercase tracking-wide">{label}</dt>
      <dd className="font-semibold text-[var(--text-primary)] mt-1 break-words">{value}</dd>
    </div>
  );
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

function ResultRow({
  label,
  value,
  mono,
  link,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">{label}</p>
      {link ? (
        value.startsWith('/') ? (
          <a href={value} className="text-[var(--color-primary)] break-all hover:underline">
            {value}
          </a>
        ) : (
          <a href={value} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] break-all hover:underline">
            {value}
          </a>
        )
      ) : (
        <p className={`text-[var(--text-primary)] break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
      )}
    </div>
  );
}
