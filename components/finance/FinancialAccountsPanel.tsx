'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Landmark, Loader2, Plus, Save, ShieldCheck, Star, Wallet } from 'lucide-react';
import {
  COMPANY_FINANCIAL_ACCOUNT_TYPE_LABELS,
  COMPANY_FINANCIAL_ACCOUNT_TYPES,
  NEW_ASAAS_FINANCIAL_ACCOUNT_NAME,
  NEW_INTER_FINANCIAL_ACCOUNT_NAME,
  isAsaasFinancialProvider,
  isInterFinancialProvider,
  type CompanyFinancialAccountResponse,
  type CompanyFinancialAccountType,
} from '@/lib/finance/companyFinancialAccountTypes';
import {
  COMPANY_BANK_ACCOUNT_KIND_LABELS,
  COMPANY_BANK_ACCOUNT_KINDS,
  type CompanyBankAccountKind,
} from '@/lib/finance/companyFinancialAccountBankIdentity';
import { buildDefaultAsaasWebhookUrl } from '@/lib/finance/asaasIntegrationConfig';
import { InterBankConfigPanel } from '@/components/finance/InterBankConfigPanel';

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
  bankName: string;
  bankCode: string;
  agency: string;
  accountNumber: string;
  accountDigit: string;
  bankAccountKind: CompanyBankAccountKind | '';
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
    bankName: '',
    bankCode: '',
    agency: '',
    accountNumber: '',
    accountDigit: '',
    bankAccountKind: '',
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
    bankName: account.bankName || '',
    bankCode: account.bankCode || '',
    agency: account.agency || '',
    accountNumber: account.accountNumber || '',
    accountDigit: account.accountDigit || '',
    bankAccountKind: account.bankAccountKind || '',
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
  const [resolvingWallet, setResolvingWallet] = useState(false);
  const [accounts, setAccounts] = useState<CompanyFinancialAccountResponse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creatingProvider, setCreatingProvider] = useState<'ASAAS' | 'INTER' | null>(null);
  const creating = creatingProvider !== null;

  const suggestedWebhookUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return buildDefaultAsaasWebhookUrl(window.location.origin, tenantId);
  }, [tenantId]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedId) ?? null,
    [accounts, selectedId],
  );
  const selectedIsInter = isInterFinancialProvider(selectedAccount?.provider);
  const showAsaasEnvironment = creatingProvider === 'ASAAS' || (!creating && selectedAccount && !selectedIsInter);
  const showAsaasCredentials = creatingProvider === 'ASAAS' || (!creating && selectedAccount && !selectedIsInter);
  const showInterCredentials = !creating && selectedIsInter && Boolean(selectedAccount?.id);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar contas financeiras.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (creatingProvider) return;
    if (selectedId) return;
    if (accounts.length === 0) return;
    const defaultAccount = accounts.find((item) => item.isDefault) || accounts[0];
    setSelectedId(defaultAccount.id);
  }, [accounts, selectedId, creatingProvider]);

  useEffect(() => {
    if (creatingProvider) return;
    if (!selectedAccount) return;
    setForm(accountToForm(selectedAccount));
  }, [selectedAccount?.id, creatingProvider]);

  function startCreateAsaas() {
    setCreatingProvider('ASAAS');
    setSelectedId(null);
    setForm({
      ...emptyForm(),
      name: NEW_ASAAS_FINANCIAL_ACCOUNT_NAME,
      isDefault: false,
      webhookUrl: '',
    });
    setSuccess(null);
    setError(null);
  }

  function startCreateInter() {
    if (readOnlyDemo) return;
    setCreatingProvider('INTER');
    setSelectedId(null);
    setForm({
      ...emptyForm(),
      name: NEW_INTER_FINANCIAL_ACCOUNT_NAME,
      isDefault: false,
    });
    setSuccess(null);
    setError(null);
  }

  function selectExistingAccount(accountId: string) {
    setCreatingProvider(null);
    setSelectedId(accountId);
    setSuccess(null);
    setError(null);
  }

  async function handleSave() {
    if (readOnlyDemo) return;
    const name = form.name.trim();
    if (!name) {
      setError('Informe o nome da conta.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (creatingProvider === 'INTER') {
        const hasInter = accounts.some((a) => a.provider === 'INTER');
        const res = await fetch('/api/banking/inter/link-financial-account', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            createAdditional: hasInter,
            name,
            beneficiaryName: form.beneficiaryName.trim() || undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
        const account = json.account as CompanyFinancialAccountResponse;
        setCreatingProvider(null);
        setSelectedId(account.id);
        setSuccess(`Conta Inter criada: ${account.name}. Configure Client ID, Secret e certificado.`);
        await loadAccounts();
        return;
      }

      const isNewAsaas = creatingProvider === 'ASAAS';
      const payload = selectedIsInter && !isNewAsaas
        ? {
            name,
            accountType: form.accountType,
            beneficiaryName: form.beneficiaryName,
            document: form.document,
            email: form.email,
            phone: form.phone,
            isDefault: form.isDefault,
            active: form.active,
            notes: form.notes,
            bankName: form.bankName,
            bankCode: form.bankCode,
            agency: form.agency,
            accountNumber: form.accountNumber,
            accountDigit: form.accountDigit,
            bankAccountKind: form.bankAccountKind,
          }
        : {
            ...form,
            name,
            isDefault: isNewAsaas ? false : form.isDefault,
            webhookUrl: form.webhookUrl.trim(),
            webhookToken: form.webhookToken.trim(),
          };

      const res = await fetch(
        isNewAsaas ? '/api/finance/financial-accounts' : `/api/finance/financial-accounts/${selectedId}`,
        {
          method: isNewAsaas ? 'POST' : 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      const account = json.account as CompanyFinancialAccountResponse;
      setSuccess(isNewAsaas ? 'Conta financeira criada.' : 'Conta financeira atualizada.');
      setCreatingProvider(null);
      setSelectedId(account.id);
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar conta financeira.');
    } finally {
      setSaving(false);
    }
  }

  async function handleResolveWallet() {
    if (readOnlyDemo || !selectedId || creating) return;
    const hasKeyForEnv =
      form.environment === 'PRODUCTION'
        ? Boolean(selectedAccount?.hasProductionApiKey || form.productionApiKey.trim())
        : Boolean(selectedAccount?.hasSandboxApiKey || form.sandboxApiKey.trim());
    if (!selectedAccount?.hasSandboxApiKey && !selectedAccount?.hasProductionApiKey && !hasKeyForEnv) {
      setError('Salve a API Key desta conta antes de buscar a Wallet ID.');
      return;
    }
    if (form.sandboxApiKey.trim() || form.productionApiKey.trim()) {
      setError('Salve a API Key antes de validar. A busca usa somente a credencial já gravada no servidor.');
      return;
    }
    setResolvingWallet(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/finance/asaas/accounts/${selectedId}/resolve-wallet`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      setSuccess(
        `Carteira Asaas vinculada ✓ · ${json.environment === 'PRODUCTION' ? 'Production' : 'Sandbox'} · ${json.walletMasked || ''}`.trim(),
      );
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao buscar Wallet ID.');
    } finally {
      setResolvingWallet(false);
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
            Cadastre várias contas recebedoras Asaas e Banco Inter. Cada empreendimento/venda
            escolhe a conta. Credenciais nunca se misturam.
          </p>
        </div>
        {!readOnlyDemo ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startCreateAsaas}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <Plus className="h-4 w-4" />
              Nova conta Asaas
            </button>
            <button
              type="button"
              onClick={startCreateInter}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm font-semibold text-orange-200 hover:bg-orange-500/20 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Nova conta Inter
            </button>
          </div>
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
          ) : accounts.length === 0 && !creating ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Nenhuma conta cadastrada. A integração legada será migrada automaticamente.
            </p>
          ) : (
            <div className="space-y-3">
              {(['INTER', 'ASAAS_COMPANY', 'NONE'] as const).map((group) => {
                const items = accounts.filter((account) => {
                  if (group === 'INTER') return account.provider === 'INTER';
                  if (group === 'ASAAS_COMPANY')
                    return account.provider === 'ASAAS_COMPANY' || account.provider === 'ASAAS';
                  return !account.provider;
                });
                const showDraft =
                  (group === 'INTER' && creatingProvider === 'INTER') ||
                  (group === 'ASAAS_COMPANY' && creatingProvider === 'ASAAS');
                if (items.length === 0 && !showDraft) return null;
                const title =
                  group === 'INTER'
                    ? 'Banco Inter'
                    : group === 'ASAAS_COMPANY'
                      ? 'Asaas'
                      : 'Sem provider';
                const draftName =
                  creatingProvider === 'INTER'
                    ? form.name.trim() || NEW_INTER_FINANCIAL_ACCOUNT_NAME
                    : form.name.trim() || NEW_ASAAS_FINANCIAL_ACCOUNT_NAME;
                return (
                  <div key={group} className="space-y-1">
                    <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                      {title}
                    </p>
                    {showDraft ? (
                      <div className="w-full rounded-lg border border-dashed border-[color-mix(in_srgb,var(--brand-primary)_35%,transparent)] bg-[var(--bg-elevated)] px-3 py-2 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--text-primary)]">{draftName}</span>
                          <span className="text-[10px] uppercase text-[var(--text-muted)]">rascunho</span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)]">Ainda não salva</p>
                      </div>
                    ) : null}
                    {items.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => selectExistingAccount(account.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    selectedId === account.id && !creating
                      ? 'border-[color-mix(in_srgb,var(--brand-primary)_35%,transparent)] bg-[var(--bg-elevated)]'
                      : 'border-transparent hover:bg-[var(--bg-elevated)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {account.name}
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
                );
              })}
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
                    placeholder={
                      creatingProvider === 'INTER'
                        ? NEW_INTER_FINANCIAL_ACCOUNT_NAME
                        : NEW_ASAAS_FINANCIAL_ACCOUNT_NAME
                    }
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
                {showAsaasEnvironment ? (
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
                ) : null}
                <div className="flex flex-wrap items-center gap-4 pt-6">
                  <label className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={form.isDefault}
                      disabled={readOnlyDemo || creating}
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

              {showAsaasCredentials ? (
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
                    <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                      Webhook URL (opcional — só conta emissora)
                    </label>
                    <input
                      value={form.webhookUrl}
                      disabled={readOnlyDemo}
                      placeholder={suggestedWebhookUrl}
                      onChange={(e) => setForm((prev) => ({ ...prev, webhookUrl: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                      Token do Webhook {creating ? '(opcional)' : '(deixe em branco para manter)'}
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
                <p className="text-xs text-[var(--text-muted)]">
                  Webhook é necessário apenas na conta emissora. Contas destinatárias do Split
                  não precisam de URL nem token de webhook.
                </p>
              </div>
              ) : showInterCredentials && selectedAccount?.id ? (
                <InterBankConfigPanel
                  financialAccountId={selectedAccount.id}
                  readOnlyDemo={readOnlyDemo}
                  embedded
                />
              ) : creatingProvider === 'INTER' ? (
                <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-100">
                  Salve a conta para configurar Client ID, Secret e certificado. Uma conta nova
                  começa incompleta (NOT_REGISTERED). Não cadastre webhook sem credenciais reais.
                </div>
              ) : null}

              {showAsaasCredentials && selectedAccount && !creating ? (
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                    <Wallet className="h-4 w-4 text-[var(--brand-primary)]" />
                    Carteira para Split
                  </div>
                  {selectedAccount.asaasWalletLinked ? (
                    <p className="text-sm text-emerald-300">
                      Carteira Asaas vinculada ✓
                      {selectedAccount.asaasWalletMasked ? ` · ${selectedAccount.asaasWalletMasked}` : ''}
                    </p>
                  ) : (
                    <p className="text-sm text-amber-200">Não vinculada</p>
                  )}
                  {!readOnlyDemo ? (
                    <button
                      type="button"
                      onClick={() => void handleResolveWallet()}
                      disabled={resolvingWallet || saving}
                      className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
                    >
                      {resolvingWallet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                      {selectedAccount.asaasWalletLinked
                        ? 'Atualizar Wallet ID'
                        : 'Validar conexão e buscar Wallet ID'}
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Landmark className="h-4 w-4 text-[var(--brand-primary)]" />
                  Identificação bancária / conciliação
                </div>
                {showAsaasCredentials || isAsaasFinancialProvider(selectedAccount?.provider) ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Dados bancários para identificação e conciliação. O destino técnico do split
                    permanece a Wallet Asaas.
                  </p>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Dados cadastrais da conta para conciliação. Não são credenciais de acesso.
                  </p>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                      Titular
                    </label>
                    <input
                      value={form.beneficiaryName}
                      disabled={readOnlyDemo}
                      onChange={(e) => setForm((prev) => ({ ...prev, beneficiaryName: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      Mesmo campo do responsável/beneficiário da conta.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Banco</label>
                    <input
                      value={form.bankName}
                      disabled={readOnlyDemo}
                      onChange={(e) => setForm((prev) => ({ ...prev, bankName: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                      Código do banco
                    </label>
                    <input
                      value={form.bankCode}
                      disabled={readOnlyDemo}
                      inputMode="numeric"
                      onChange={(e) => setForm((prev) => ({ ...prev, bankCode: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Agência</label>
                    <input
                      value={form.agency}
                      disabled={readOnlyDemo}
                      onChange={(e) => setForm((prev) => ({ ...prev, agency: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Conta</label>
                    <input
                      value={form.accountNumber}
                      disabled={readOnlyDemo}
                      onChange={(e) => setForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Dígito</label>
                    <input
                      value={form.accountDigit}
                      disabled={readOnlyDemo}
                      onChange={(e) => setForm((prev) => ({ ...prev, accountDigit: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                      Tipo da conta
                    </label>
                    <select
                      value={form.bankAccountKind}
                      disabled={readOnlyDemo}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          bankAccountKind: e.target.value as CompanyBankAccountKind | '',
                        }))
                      }
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                    >
                      <option value="">Não informado</option>
                      {COMPANY_BANK_ACCOUNT_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {COMPANY_BANK_ACCOUNT_KIND_LABELS[kind]}
                        </option>
                      ))}
                    </select>
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
