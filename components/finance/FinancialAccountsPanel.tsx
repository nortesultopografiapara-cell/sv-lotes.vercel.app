'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, Plus, Save, ShieldCheck, Star } from 'lucide-react';
import {
  COMPANY_FINANCIAL_ACCOUNT_TYPE_LABELS,
  COMPANY_FINANCIAL_ACCOUNT_TYPES,
  type CompanyFinancialAccountResponse,
  type CompanyFinancialAccountType,
} from '@/lib/finance/companyFinancialAccountTypes';
import { buildDefaultAsaasWebhookUrl } from '@/lib/finance/asaasIntegrationConfig';

type Props = {
  tenantId: string;
  readOnlyDemo?: boolean;
};

type FormState = {
  name: string;
  accountType: CompanyFinancialAccountType;
  beneficiaryName: string;
  document: string;
  email: string;
  phone: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  isDefault: boolean;
  active: boolean;
  notes: string;
  webhookUrl: string;
  sandboxApiKey: string;
  productionApiKey: string;
  webhookToken: string;
};

function emptyForm(): FormState {
  return {
    name: '',
    accountType: 'PROPRIETARIO',
    beneficiaryName: '',
    document: '',
    email: '',
    phone: '',
    environment: 'SANDBOX',
    isDefault: false,
    active: true,
    notes: '',
    webhookUrl: '',
    sandboxApiKey: '',
    productionApiKey: '',
    webhookToken: '',
  };
}

function accountToForm(account: CompanyFinancialAccountResponse): FormState {
  return {
    name: account.name,
    accountType: account.accountType,
    beneficiaryName: account.beneficiaryName || '',
    document: account.document || '',
    email: account.email || '',
    phone: account.phone || '',
    environment: account.environment,
    isDefault: account.isDefault,
    active: account.active,
    notes: account.notes || '',
    webhookUrl: '',
    sandboxApiKey: '',
    productionApiKey: '',
    webhookToken: '',
  };
}

function maskConfigured(hasKey: boolean): string {
  return hasKey ? '••••••••••••' : 'Não configurado';
}

export function FinancialAccountsPanel({ tenantId, readOnlyDemo = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<CompanyFinancialAccountResponse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const suggestedWebhookUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return buildDefaultAsaasWebhookUrl(window.location.origin, tenantId);
  }, [tenantId]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedId) ?? null,
    [accounts, selectedId],
  );

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/finance/financial-accounts?includeInactive=1', {
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      const list = (json.accounts as CompanyFinancialAccountResponse[]) || [];
      setAccounts(list);
      if (!selectedId && list.length > 0) {
        const defaultAccount = list.find((item) => item.isDefault) || list[0];
        setSelectedId(defaultAccount.id);
        setForm(accountToForm(defaultAccount));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar contas financeiras.');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (!selectedAccount) return;
    setForm(accountToForm(selectedAccount));
    setCreating(false);
  }, [selectedAccount?.id]);

  function startCreate() {
    setCreating(true);
    setSelectedId(null);
    setForm({
      ...emptyForm(),
      webhookUrl: suggestedWebhookUrl,
    });
    setSuccess(null);
    setError(null);
  }

  async function handleSave() {
    if (readOnlyDemo) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        ...form,
        webhookUrl: form.webhookUrl || suggestedWebhookUrl,
      };
      const res = await fetch(
        creating ? '/api/finance/financial-accounts' : `/api/finance/financial-accounts/${selectedId}`,
        {
          method: creating ? 'POST' : 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      const account = json.account as CompanyFinancialAccountResponse;
      setSuccess(creating ? 'Conta financeira criada.' : 'Conta financeira atualizada.');
      setCreating(false);
      setSelectedId(account.id);
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar conta financeira.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[var(--brand-primary)]" />
            <h3 className="text-base font-bold text-[var(--text-primary)]">Contas Financeiras</h3>
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Cadastre contas recebedoras com token Asaas próprio. Cada venda e cobrança usa a conta vinculada.
          </p>
        </div>
        {!readOnlyDemo ? (
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
          >
            <Plus className="h-4 w-4" />
            Nova conta
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {success}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando contas...
            </div>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Nenhuma conta cadastrada. A integração legada será migrada automaticamente.
            </p>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setSelectedId(account.id);
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    selectedId === account.id && !creating
                      ? 'border-[color-mix(in_srgb,var(--brand-primary)_35%,transparent)] bg-[var(--bg-elevated)]'
                      : 'border-transparent hover:bg-[var(--bg-elevated)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {account.name}
                      {account.provider
                        ? ` — ${account.provider === 'INTER' ? 'Banco Inter' : account.provider === 'ASAAS_COMPANY' ? 'Asaas' : account.provider}`
                        : ' — Sem provider'}
                    </span>
                    {account.isDefault ? <Star className="h-3.5 w-3.5 text-amber-400" /> : null}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {COMPANY_FINANCIAL_ACCOUNT_TYPE_LABELS[account.accountType]}
                    {!account.active ? ' · Inativa' : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-4">
          {creating || selectedAccount ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Nome da conta *</label>
                  <input
                    value={form.name}
                    disabled={readOnlyDemo}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Tipo</label>
                  <select
                    value={form.accountType}
                    disabled={readOnlyDemo}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        accountType: e.target.value as CompanyFinancialAccountType,
                      }))
                    }
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                  >
                    {COMPANY_FINANCIAL_ACCOUNT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {COMPANY_FINANCIAL_ACCOUNT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Responsável / beneficiário</label>
                  <input
                    value={form.beneficiaryName}
                    disabled={readOnlyDemo}
                    onChange={(e) => setForm((prev) => ({ ...prev, beneficiaryName: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">CPF/CNPJ</label>
                  <input
                    value={form.document}
                    disabled={readOnlyDemo}
                    onChange={(e) => setForm((prev) => ({ ...prev, document: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">E-mail</label>
                  <input
                    value={form.email}
                    disabled={readOnlyDemo}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Telefone</label>
                  <input
                    value={form.phone}
                    disabled={readOnlyDemo}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Ambiente Asaas</label>
                  <select
                    value={form.environment}
                    disabled={readOnlyDemo}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        environment: e.target.value as 'SANDBOX' | 'PRODUCTION',
                      }))
                    }
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                  >
                    <option value="SANDBOX">Sandbox</option>
                    <option value="PRODUCTION">Produção</option>
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-4 pt-6">
                  <label className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={form.isDefault}
                      disabled={readOnlyDemo}
                      onChange={(e) => setForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
                    />
                    Conta padrão da empresa
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={form.active}
                      disabled={readOnlyDemo}
                      onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
                    />
                    Ativa
                  </label>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <ShieldCheck className="h-4 w-4 text-[var(--brand-primary)]" />
                  Credenciais Asaas (protegidas)
                </div>
                {!creating && selectedAccount ? (
                  <div className="grid gap-2 text-xs text-[var(--text-secondary)] md:grid-cols-3">
                    <div>Sandbox: {maskConfigured(selectedAccount.hasSandboxApiKey)}</div>
                    <div>Produção: {maskConfigured(selectedAccount.hasProductionApiKey)}</div>
                    <div>Webhook: {maskConfigured(selectedAccount.hasWebhookToken)}</div>
                  </div>
                ) : null}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                      API Key Sandbox {creating ? '' : '(deixe em branco para manter)'}
                    </label>
                    <input
                      type="password"
                      value={form.sandboxApiKey}
                      disabled={readOnlyDemo}
                      onChange={(e) => setForm((prev) => ({ ...prev, sandboxApiKey: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                      API Key Produção {creating ? '' : '(deixe em branco para manter)'}
                    </label>
                    <input
                      type="password"
                      value={form.productionApiKey}
                      disabled={readOnlyDemo}
                      onChange={(e) => setForm((prev) => ({ ...prev, productionApiKey: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Webhook URL</label>
                    <input
                      value={form.webhookUrl || suggestedWebhookUrl}
                      disabled={readOnlyDemo}
                      onChange={(e) => setForm((prev) => ({ ...prev, webhookUrl: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                      Token do Webhook {creating ? '' : '(deixe em branco para manter)'}
                    </label>
                    <input
                      type="password"
                      value={form.webhookToken}
                      disabled={readOnlyDemo}
                      onChange={(e) => setForm((prev) => ({ ...prev, webhookToken: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Observações</label>
                <textarea
                  value={form.notes}
                  disabled={readOnlyDemo}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                />
              </div>

              {!readOnlyDemo ? (
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !form.name.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {creating ? 'Criar conta' : 'Salvar alterações'}
                </button>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              Selecione uma conta ou crie uma nova para configurar tokens e dados do recebedor.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
