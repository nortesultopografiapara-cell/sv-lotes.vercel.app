'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  buildC6ConfigPutBody,
  presentC6ConfigFields,
  type C6BankConfigPublic,
} from '@/lib/banking/c6/c6ConfigTypes';
import type { BankEnvironment } from '@/lib/banking/types';
import { inspectC6BolepixPixKey } from '@/lib/banking/c6/c6BolepixV2Validation';
import {
  describeC6BolepixPanel,
  c6BolepixV2HasNamedReceipt,
  listC6BolepixActivationPending,
} from '@/lib/banking/c6/c6BolepixV2OpenApi';

type LocalFile = { name: string; content: string };

type AccountOption = {
  id: string;
  name: string;
  provider: string | null;
  integrationId?: string | null;
};

async function readTextFile(file: File): Promise<LocalFile> {
  return { name: file.name, content: await file.text() };
}

export function C6BankConfigPanel({ readOnlyDemo = false }: { readOnlyDemo?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [persistBlocked, setPersistBlocked] = useState(false);
  const [config, setConfig] = useState<C6BankConfigPublic | null>(null);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [environment, setEnvironment] = useState<BankEnvironment>('SANDBOX');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [password, setPassword] = useState('');
  const [certFile, setCertFile] = useState<LocalFile | null>(null);
  const [keyFile, setKeyFile] = useState<LocalFile | null>(null);
  const [financialAccountId, setFinancialAccountId] = useState('');
  const [boletoIntent, setBoletoIntent] = useState(false);
  const [bolepixIntent, setBolepixIntent] = useState(false);
  const [pixKey, setPixKey] = useState('');
  const [pixConfigured, setPixConfigured] = useState(false);
  const [pixMask, setPixMask] = useState<string | null>(null);
  const [pixSaving, setPixSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [togglingEmission, setTogglingEmission] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [preparingWebhook, setPreparingWebhook] = useState(false);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/banking/c6/config', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar C6 Bank');
      const cfg = data.config as C6BankConfigPublic;
      const fields = presentC6ConfigFields(cfg);
      setConfig(cfg);
      setPersistBlocked(Boolean(data.persistBlocked));
      setEnvironment(cfg.environment || 'SANDBOX');
      setClientId(fields.clientId);
      setClientSecret(fields.clientSecret);
      setPassword('');
      setCertFile(null);
      setKeyFile(null);
      setBoletoIntent(cfg.boletoIntent === true);
      setBolepixIntent(cfg.bolepixIntent === true);
      const rows = (data.financialAccounts as AccountOption[]) || [];
      setAccounts(rows);
      const linkedToThisIntegration = rows.filter(
        (account) => account.integrationId && account.integrationId === cfg.id,
      );
      const selectedAccount =
        cfg.financialAccountId ||
        (linkedToThisIntegration.length === 1 ? linkedToThisIntegration[0].id : '');
      setFinancialAccountId(selectedAccount);
      await loadPixStatus(cfg.id, selectedAccount);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  async function loadPixStatus(integrationId: string | null, accountId: string) {
    if (!integrationId || !accountId) {
      setPixConfigured(false);
      setPixMask(null);
      return;
    }
    const res = await fetch(
      `/api/banking/c6/bolepix/pix-key?integrationId=${encodeURIComponent(integrationId)}&financialAccountId=${encodeURIComponent(accountId)}`,
      { credentials: 'include' },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setPixConfigured(Boolean(data.configured));
    setPixMask(typeof data.mask === 'string' ? data.mask : null);
  }

  async function savePixKey() {
    const message = inspectC6BolepixPixKey(pixKey);
    if (message) {
      setError(message);
      setInfo('');
      return;
    }
    if (!config?.id || !financialAccountId) {
      setError('A chave Pix precisa da conta beneficiária vinculada a esta integração C6.');
      setInfo('');
      return;
    }
    setPixSaving(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/banking/c6/bolepix/pix-key', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pixKey,
          integrationId: config.id,
          financialAccountId,
          replace: pixConfigured,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível gravar a chave Pix.');
      setPixConfigured(Boolean(data.configured));
      setPixMask(typeof data.mask === 'string' ? data.mask : null);
      setInfo(
        data.message ||
          'Chave Pix gravada de forma cifrada. A emissão Bolepix continua desligada.',
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível gravar a chave Pix.');
    } finally {
      setPixKey('');
      setPixSaving(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function testConnection() {
    setTesting(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/banking/c6/config/connection', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Teste de conexão indisponível');
      setInfo('Conexão verificada.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Teste de conexão indisponível');
    } finally {
      setTesting(false);
    }
  }

  async function prepareWebhook() {
    if (readOnlyDemo || preparingWebhook) return;
    setPreparingWebhook(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/banking/c6/webhook/prepare', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível preparar a URL');
      setConfig((current) => (current ? { ...current, webhook: data.webhook } : current));
      setInfo('URL preparada. Ela ainda não está cadastrada no Banco C6.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível preparar a URL');
    } finally {
      setPreparingWebhook(false);
    }
  }

  async function registerWebhook(action: 'register' | 'consult') {
    if (readOnlyDemo || registeringWebhook || !config?.webhook?.receiptPath) return;
    if (!password.trim()) {
      setError(
        'Informe a senha do administrador principal. Ela é conferida de novo nesta ação e não vem do Banco C6.',
      );
      return;
    }
    setRegisteringWebhook(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/banking/c6/webhook/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.webhook) {
        setConfig((current) => (current ? { ...current, webhook: data.webhook } : current));
      }
      if (!res.ok) throw new Error(data.error || 'Não foi possível cadastrar o webhook');
      setPassword('');
      setInfo(data.message || 'Webhook cadastrado no Banco C6.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível cadastrar o webhook');
    } finally {
      setRegisteringWebhook(false);
    }
  }

  async function toggleEmission(enabled: boolean) {
    if (readOnlyDemo || persistBlocked || togglingEmission) return;
    if (!password.trim()) {
      setError(
        'Informe a senha do administrador principal. Ela é conferida de novo nesta ação e não vem do Banco C6.',
      );
      return;
    }
    setTogglingEmission(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/banking/c6/emission', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível atualizar a emissão');
      setConfig(data.config as C6BankConfigPublic);
      setPassword('');
      setInfo(
        enabled
          ? 'Autorização registrada para a entrada de homologação desta empresa. As outras parcelas e a emissão em lote continuam bloqueadas.'
          : 'Autorização cancelada. A entrada de homologação volta a ficar bloqueada.',
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a emissão');
    } finally {
      setTogglingEmission(false);
    }
  }

  async function save() {
    if (readOnlyDemo || persistBlocked) return;
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const body = buildC6ConfigPutBody({
        environment,
        clientId,
        password,
        boletoIntent,
        bolepixIntent,
        financialAccountId,
        clientSecret,
        certificatePem: certFile?.content,
        certificateFileName: certFile?.name,
        privateKeyPem: keyFile?.content,
        privateKeyFileName: keyFile?.name,
      });
      const res = await fetch('/api/banking/c6/config', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
      setConfig(data.config as C6BankConfigPublic);
      setClientSecret('');
      setPassword('');
      setCertFile(null);
      setKeyFile(null);
      setInfo('Configuração salva. Emissão permanece desativada.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function createAccount() {
    if (readOnlyDemo || persistBlocked || creatingAccount) return;
    setCreatingAccount(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/banking/c6/financial-account', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível cadastrar a conta C6');
      const created = data.account as { id?: string; name?: string } | undefined;
      if (!created?.id) throw new Error('Não foi possível cadastrar a conta C6');
      setAccounts((current) =>
        current.some((account) => account.id === created.id)
          ? current
          : [...current, { id: created.id!, name: created.name || 'Conta C6', provider: null }],
      );
      setFinancialAccountId(created.id);
      setInfo(
        'Conta C6 cadastrada. Selecione-a e salve a configuração para vincular. A conexão verificada não faz esse vínculo. Client ID, segredo e certificado já gravados não precisam ser enviados de novo.',
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível cadastrar a conta C6');
    } finally {
      setCreatingAccount(false);
    }
  }

  const linkable = accounts.filter((account) => {
    const provider = String(account.provider || '').toUpperCase();
    return !provider || provider === 'C6';
  });
  const emissionPending = listC6BolepixActivationPending({
    loading,
    persistBlocked,
    integrationPresent: Boolean(config?.id),
    integrationDisabled: String(config?.status || '').toUpperCase() === 'DISABLED',
    clientIdConfigured: config?.clientIdConfigured === true,
    hasClientSecret: config?.hasClientSecret === true,
    hasCertificate: config?.hasCertificate === true,
    beneficiaryLinked: Boolean(config?.financialAccountId),
    pixConfigured,
    passwordProvided: Boolean(password.trim()),
  });
  const bolepixPanel = describeC6BolepixPanel({
    companyId: String(config?.companyId || ''),
    integrationId: String(config?.id || ''),
    integrationPresent: Boolean(config?.id) && String(config?.status || '').toUpperCase() !== 'DISABLED',
    credentialsPresent: Boolean(config?.clientIdConfigured && config?.hasClientSecret && config?.hasCertificate),
    beneficiaryLinked: Boolean(config?.financialAccountId),
    pixConfigured,
    activationRequested: config?.bolepixActivationRequested === true,
    testParcelNamed: c6BolepixV2HasNamedReceipt(
      String(config?.companyId || ''),
      String(config?.id || ''),
    ),
  });

  return (
    <section
      className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-4"
      data-c6-company={config?.companyId || ''}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">C6 Bank</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Cadastro da empresa desta sessão. Emissão, webhook e liquidação não são ativados aqui.
          </p>
        </div>
        <div className="flex gap-2 text-[10px] font-semibold uppercase tracking-wide">
          <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-slate-200">
            Status {config?.status || 'DRAFT'}
          </span>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-200">
            {config?.bolepixActivationRequested && bolepixPanel.postAllowed
              ? 'Emissão autorizada para homologação'
              : 'Emissão DESATIVADA'}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--border-color)] p-3 text-xs text-[var(--text-secondary)] space-y-1">
        <p className="font-semibold text-[var(--text-primary)]">Notificações BANK_SLIP</p>
        <p>URL: {config?.webhook?.receiptPath || 'URL ainda não preparada'}</p>
        <p>
          {config?.webhook?.registeredAtBank
            ? 'Webhook cadastrado no Banco C6'
            : 'Não cadastrado no Banco C6'}
        </p>
        <p>Última recebida: {config?.webhook?.lastReceivedAt || 'Nenhuma'}</p>
        <p>Última processada: {config?.webhook?.lastProcessedAt || 'Nenhuma'}</p>
        <p>Último erro: {config?.webhook?.lastError || 'Nenhum'}</p>
        <p>Conciliação automática desligada</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void prepareWebhook()}
            disabled={readOnlyDemo || preparingWebhook || loading || Boolean(config?.webhook?.receiptPath)}
            className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] disabled:opacity-50"
          >
            {preparingWebhook ? 'Preparando' : 'Preparar URL'}
          </button>
          {config?.webhook?.receiptPath ? (
            <>
              <button
                type="button"
                onClick={() => void registerWebhook('register')}
                disabled={readOnlyDemo || registeringWebhook || loading || !password.trim()}
                className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] disabled:opacity-50"
              >
                {registeringWebhook ? 'Consultando o C6' : 'Cadastrar webhook no C6'}
              </button>
              <button
                type="button"
                onClick={() => void registerWebhook('consult')}
                disabled={readOnlyDemo || registeringWebhook || loading || !password.trim()}
                className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] disabled:opacity-50"
              >
                Consultar cadastro
              </button>
            </>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Ambiente
            <select
              value={environment}
              disabled={readOnlyDemo || persistBlocked}
              onChange={(event) => setEnvironment(event.target.value as BankEnvironment)}
              className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
            >
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Production</option>
            </select>
            <span className="mt-1 block font-normal text-[var(--text-muted)]">
              A carteira oficial do boleto é 21 em Sandbox e 15 em Production. Ela não é um campo separado.
            </span>
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Conta financeira
            <select
              value={financialAccountId}
              disabled={readOnlyDemo || persistBlocked}
              onChange={(event) => {
                const next = event.target.value;
                setFinancialAccountId(next);
                void loadPixStatus(config?.id || null, next);
              }}
              className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
            >
              <option value="">Sem vínculo</option>
              {linkable.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block font-normal text-[var(--text-muted)]">
              Contas do Asaas e do Banco Inter não entram nesta lista.
            </span>
            <button
              type="button"
              onClick={() => void createAccount()}
              disabled={readOnlyDemo || persistBlocked || creatingAccount || loading}
              className="mt-2 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] disabled:opacity-50"
            >
              {creatingAccount ? 'Cadastrando' : 'Cadastrar conta C6'}
            </button>
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)] md:col-span-2">
            Client ID
            <input
              value={clientId}
              disabled={readOnlyDemo || persistBlocked}
              onChange={(event) => setClientId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
              autoComplete="off"
            />
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Client Secret
            <input
              type="password"
              value={clientSecret}
              disabled={readOnlyDemo || persistBlocked}
              onChange={(event) => setClientSecret(event.target.value)}
              placeholder={config ? presentC6ConfigFields(config).secretPlaceholder : ''}
              className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
              autoComplete="new-password"
            />
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Senha do Administrador Principal
            <input
              type="password"
              value={password}
              disabled={readOnlyDemo || persistBlocked}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
              autoComplete="current-password"
            />
            <span className="mt-1 block font-normal text-[var(--text-muted)]">
              O salvamento apaga este campo. Digite a senha outra vez para ativar a emissão.
            </span>
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Certificado PEM
            <input
              type="file"
              accept=".pem,.crt,.cer,.txt"
              disabled={readOnlyDemo || persistBlocked}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void readTextFile(file).then(setCertFile);
              }}
              className="mt-1 block w-full text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Chave privada PEM
            <input
              type="file"
              accept=".pem,.key,.txt"
              disabled={readOnlyDemo || persistBlocked}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void readTextFile(file).then(setKeyFile);
              }}
              className="mt-1 block w-full text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={boletoIntent}
              disabled={readOnlyDemo || persistBlocked}
              onChange={(event) => setBoletoIntent(event.target.checked)}
            />
            Intenção de uso: Boleto
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={bolepixIntent}
              disabled={readOnlyDemo || persistBlocked}
              onChange={(event) => setBolepixIntent(event.target.checked)}
            />
            Intenção de uso: BolePIX
          </label>
        </div>
      )}

      {config?.hasCertificate ? (
        <p className="text-xs text-[var(--text-muted)]">
          Certificado já armazenado
          {config.certificateFileName ? `: ${config.certificateFileName}` : ''}. O conteúdo não é
          recarregado.
        </p>
      ) : null}
      {persistBlocked ? (
        <p className="text-sm text-amber-200">Cadastro C6 permanece bloqueado em Production.</p>
      ) : null}
      <div className="rounded-lg border border-[var(--border-color)] p-3 text-xs text-[var(--text-secondary)] space-y-2">
        <p className="font-semibold text-[var(--text-primary)]">Bolepix v2 — Chave Pix</p>
        <p>
          Situação: {pixConfigured ? 'configurada' : 'não configurada'}
          {pixMask ? ` · ${pixMask}` : ''}.
        </p>
        <p>
          Cadastrar a chave não ativa a emissão e não altera Client ID, segredo ou certificado. A emissão real permanece desligada até o administrador confirmar a senha da parcela de teste.
        </p>
        <input
          type="password"
          autoComplete="off"
          value={pixKey}
          disabled={readOnlyDemo || pixSaving}
          onChange={(event) => setPixKey(event.target.value)}
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
          aria-label="Chave Pix aleatória"
        />
        <button
          type="button"
          disabled={readOnlyDemo || pixSaving || !pixKey.trim() || !config?.id || !financialAccountId}
          onClick={() => void savePixKey()}
          className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] disabled:opacity-50"
        >
          {pixSaving ? 'Salvando' : pixConfigured ? 'Substituir chave Pix' : 'Salvar chave Pix'}
        </button>
        {!financialAccountId ? (
          <p>Selecione a conta C6 desta integração. O cadastro da chave não depende da emissão.</p>
        ) : !pixKey.trim() ? (
          <p>Digite a chave Pix aleatória. Ela será cifrada e a emissão continua desligada.</p>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {info ? <p className="text-sm text-emerald-300">{info}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={readOnlyDemo || persistBlocked || saving || loading}
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {saving ? 'Salvando' : 'Salvar configuração'}
        </button>
        <button
          type="button"
          onClick={() => void testConnection()}
          disabled={readOnlyDemo || testing || loading}
          className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] disabled:opacity-50"
        >
          {testing ? 'Testando' : 'Testar conexão'}
        </button>
        <button
          type="button"
          onClick={() => void toggleEmission(!config?.bolepixActivationRequested)}
          disabled={
            readOnlyDemo ||
            persistBlocked ||
            togglingEmission ||
            loading ||
            !password.trim() ||
            !config?.financialAccountId ||
            !config?.clientIdConfigured ||
            !config.hasClientSecret ||
            !config.hasCertificate ||
            !pixConfigured ||
            emissionPending.length > 0
          }
          className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] disabled:opacity-50"
        >
          {togglingEmission
            ? 'Atualizando'
            : config?.bolepixActivationRequested
              ? 'Cancelar solicitação'
              : 'Ativar emissão desta empresa'}
        </button>
        <div className="w-full space-y-1 text-xs text-[var(--text-muted)]">
          <p>
            Situação: {bolepixPanel.label}. {bolepixPanel.detail}
          </p>
          {emissionPending.map((item) => (
            <p key={item}>{item}</p>
          ))}
          {!config?.financialAccountId ? (
            <p>A conexão OAuth não substitui esse vínculo.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
