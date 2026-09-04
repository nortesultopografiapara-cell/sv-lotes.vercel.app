'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileKey2, Loader2, ShieldCheck, Upload } from 'lucide-react';
import type { C6BankConfigPublic } from '@/lib/banking/c6/c6ConfigTypes';
import type { BankEnvironment } from '@/lib/banking/types';
import { NEW_C6_FINANCIAL_ACCOUNT_NAME } from '@/lib/finance/companyFinancialAccountTypes';

type Props = {
  readOnlyDemo?: boolean;
  onClose?: () => void;
  financialAccountId?: string | null;
  embedded?: boolean;
};

type LocalFile = {
  name: string;
  size: number;
  content: string;
};

type CompanyFinancialAccountPublic = {
  id: string;
  name: string;
  provider: string | null;
  isDefault: boolean;
  active: boolean;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i) : '—';
}

async function readTextFile(file: File): Promise<LocalFile> {
  const content = await file.text();
  return { name: file.name, size: file.size, content };
}

export function C6BankConfigPanel({
  readOnlyDemo = false,
  onClose,
  financialAccountId = null,
  embedded = false,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [config, setConfig] = useState<C6BankConfigPublic | null>(null);
  const [environment, setEnvironment] = useState<BankEnvironment>('SANDBOX');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [certFile, setCertFile] = useState<LocalFile | null>(null);
  const [keyFile, setKeyFile] = useState<LocalFile | null>(null);
  const [linkingAccount, setLinkingAccount] = useState(false);
  const [c6Accounts, setC6Accounts] = useState<CompanyFinancialAccountPublic[]>([]);
  const [linkableAccounts, setLinkableAccounts] = useState<CompanyFinancialAccountPublic[]>([]);
  const [selectedConfigAccountId, setSelectedConfigAccountId] = useState<string>(
    financialAccountId || '',
  );
  const [selectedLinkAccountId, setSelectedLinkAccountId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = selectedConfigAccountId
        ? `?financialAccountId=${encodeURIComponent(selectedConfigAccountId)}`
        : '';
      const res = await fetch(`/api/banking/c6/config${qs}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar C6 Bank');
      const cfg = data.config as C6BankConfigPublic;
      setConfig(cfg);
      setEnvironment(cfg.environment || 'SANDBOX');
      setClientId(cfg.clientId || '');
      setClientSecret('');
      setCertFile(null);
      setKeyFile(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [selectedConfigAccountId]);

  async function loadC6Accounts() {
    try {
      const res = await fetch('/api/banking/c6/link-financial-account', {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setC6Accounts((data.c6Accounts as CompanyFinancialAccountPublic[]) || []);
      setLinkableAccounts((data.linkable as CompanyFinancialAccountPublic[]) || []);
    } catch {
      /* silencioso */
    }
  }

  useEffect(() => {
    void load();
    void loadC6Accounts();
  }, [load]);

  useEffect(() => {
    if (financialAccountId) setSelectedConfigAccountId(financialAccountId);
  }, [financialAccountId]);

  async function onPickCert(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setError('');
    try {
      setCertFile(await readTextFile(file));
    } catch {
      setError('Não foi possível ler o arquivo de certificado.');
    }
  }

  async function onPickKey(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setError('');
    try {
      setKeyFile(await readTextFile(file));
    } catch {
      setError('Não foi possível ler o arquivo de chave privada.');
    }
  }

  async function save() {
    if (readOnlyDemo) return;
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const body: Record<string, string> = {
        environment,
        clientId,
      };
      if (selectedConfigAccountId) body.financialAccountId = selectedConfigAccountId;
      if (clientSecret.trim()) body.clientSecret = clientSecret.trim();
      if (certFile && keyFile) {
        body.certificatePem = certFile.content;
        body.certificateFileName = certFile.name;
        body.privateKeyPem = keyFile.content;
        body.privateKeyFileName = keyFile.name;
      } else if (certFile || keyFile) {
        throw new Error(
          'Para atualizar certificados, selecione certificado e chave privada juntos.',
        );
      }

      const res = await fetch('/api/banking/c6/config', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
      const saved = data.config as C6BankConfigPublic;
      setConfig(saved);
      setClientSecret('');
      setCertFile(null);
      setKeyFile(null);
      setInfo(
        saved.message ||
          'Configuração salva. Emissão C6 Bank ainda não homologada.',
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function createC6Account() {
    setLinkingAccount(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/banking/c6/link-financial-account', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          createAdditional: c6Accounts.length > 0,
          name: NEW_C6_FINANCIAL_ACCOUNT_NAME,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao criar conta C6');
      await loadC6Accounts();
      if (data.account?.id) setSelectedConfigAccountId(String(data.account.id));
      setInfo(
        `Conta financeira C6 Bank criada/garantida: ${String(data.account?.name || data.financialAccountId)}. Não altera contas Asaas nem Inter.`,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao criar conta C6');
    } finally {
      setLinkingAccount(false);
    }
  }

  async function linkSelectedAccount() {
    if (!selectedLinkAccountId) {
      setError('Selecione uma conta sem provider.');
      return;
    }
    setLinkingAccount(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/banking/c6/link-financial-account', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link',
          financialAccountId: selectedLinkAccountId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao vincular conta');
      await loadC6Accounts();
      setInfo(`Conta vinculada ao C6 Bank: ${String(data.account?.name || '')}`);
      setSelectedLinkAccountId('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao vincular conta');
    } finally {
      setLinkingAccount(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando configuração C6 Bank…
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--text-primary)]">Configurar C6 Bank</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Client ID, Client Secret, certificado e chave privada. Credenciais são criptografadas no
            servidor. Nenhum caminho local é armazenado. Emissão permanece bloqueada nesta fase.
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Fechar
          </button>
        ) : null}
      </div>

      {config ? (
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-secondary)] space-y-1">
          <p>
            <span className="font-semibold text-[var(--text-primary)]">Status:</span>{' '}
            {config.message}
          </p>
          <p>Client ID: {config.clientIdConfigured ? config.clientId : 'Não configurado'}</p>
          <p>
            Client Secret:{' '}
            {config.hasClientSecret ? 'Configurado ••••••••••' : 'Não configurado'}
          </p>
          <p>
            Certificado:{' '}
            {config.hasCertificate
              ? `${config.certificateFileName || 'certificado'} — configurado`
              : 'Não configurado'}
          </p>
          <p>
            Chave privada:{' '}
            {config.hasPrivateKey
              ? `${config.privateKeyFileName || 'chave'} — configurada`
              : 'Não configurada'}
          </p>
          <p>Ambiente: {config.environment === 'PRODUCTION' ? 'Produção' : 'Sandbox'}</p>
          <p className="text-amber-300">
            Integração C6 Bank ainda não homologada para emissão.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-[var(--text-primary)]">Ambiente C6</span>
          <select
            value={environment}
            disabled={readOnlyDemo || saving}
            onChange={(e) => setEnvironment(e.target.value as BankEnvironment)}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
          >
            <option value="SANDBOX">Sandbox</option>
            <option value="PRODUCTION">Produção</option>
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-[var(--text-primary)]">Client ID</span>
        <input
          type="text"
          value={clientId}
          disabled={readOnlyDemo || saving}
          onChange={(e) => setClientId(e.target.value)}
          autoComplete="off"
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
          placeholder="Cole o Client ID do C6 Bank"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-[var(--text-primary)]">Client Secret</span>
        <input
          type="password"
          value={clientSecret}
          disabled={readOnlyDemo || saving}
          onChange={(e) => setClientSecret(e.target.value)}
          autoComplete="new-password"
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
          placeholder={
            config?.hasClientSecret
              ? 'Deixe em branco para manter o secret atual'
              : 'Cole o Client Secret do C6 Bank'
          }
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-dashed border-[var(--border-color)] p-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Certificado</p>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-semibold hover:bg-[var(--bg-elevated)]">
            <Upload className="h-3.5 w-3.5" />
            Selecionar certificado
            <input
              type="file"
              className="hidden"
              accept=".crt,.pem,.cer,.txt"
              disabled={readOnlyDemo || saving}
              onChange={(e) => void onPickCert(e.target.files)}
            />
          </label>
          {certFile ? (
            <ul className="mt-2 space-y-0.5 text-xs text-[var(--text-secondary)]">
              <li>Nome: {certFile.name}</li>
              <li>Extensão: {extOf(certFile.name)}</li>
              <li>Tamanho: {formatBytes(certFile.size)}</li>
              <li>Status: pronto para envio (conteúdo, não caminho)</li>
            </ul>
          ) : config?.hasCertificate ? (
            <p className="mt-2 text-xs text-emerald-400">
              Já configurado — selecione um novo arquivo para substituir.
            </p>
          ) : (
            <p className="mt-2 text-xs text-[var(--text-muted)]">Nenhum arquivo selecionado.</p>
          )}
        </div>

        <div className="rounded-lg border border-dashed border-[var(--border-color)] p-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Chave privada</p>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-semibold hover:bg-[var(--bg-elevated)]">
            <FileKey2 className="h-3.5 w-3.5" />
            Selecionar chave privada
            <input
              type="file"
              className="hidden"
              accept=".key,.pem,.txt"
              disabled={readOnlyDemo || saving}
              onChange={(e) => void onPickKey(e.target.files)}
            />
          </label>
          {keyFile ? (
            <ul className="mt-2 space-y-0.5 text-xs text-[var(--text-secondary)]">
              <li>Nome: {keyFile.name}</li>
              <li>Extensão: {extOf(keyFile.name)}</li>
              <li>Tamanho: {formatBytes(keyFile.size)}</li>
              <li>Status: pronto para envio (conteúdo, não caminho)</li>
            </ul>
          ) : config?.hasPrivateKey ? (
            <p className="mt-2 text-xs text-emerald-400">
              Já configurada — selecione um novo arquivo para substituir.
            </p>
          ) : (
            <p className="mt-2 text-xs text-[var(--text-muted)]">Nenhum arquivo selecionado.</p>
          )}
        </div>
      </div>

      {!embedded ? (
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] p-3 space-y-3">
          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Conta financeira C6 Bank
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Crie uma conta C6 independente ou vincule uma conta sem provider. Nunca converte
              automaticamente uma conta Asaas ou Inter.
            </p>
          </div>
          {c6Accounts.length > 0 ? (
            <ul className="space-y-1 text-xs text-amber-200">
              {c6Accounts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={`text-left underline-offset-2 hover:underline ${
                      selectedConfigAccountId === a.id ? 'font-bold text-white' : ''
                    }`}
                    onClick={() => setSelectedConfigAccountId(a.id)}
                  >
                    {a.name} — C6 Bank
                    {a.isDefault ? ' (padrão empresa)' : ''}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-amber-200">Nenhuma conta financeira C6 ativa ainda.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={readOnlyDemo || linkingAccount}
              onClick={() => void createC6Account()}
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-200 disabled:opacity-40"
            >
              {linkingAccount ? 'Processando…' : 'Criar conta financeira C6 Bank'}
            </button>
          </div>
          {linkableAccounts.filter((a) => !a.provider).length > 0 ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block text-xs flex-1 min-w-[180px]">
                <span className="mb-1 block text-[var(--text-secondary)]">
                  Conta sem provider
                </span>
                <select
                  value={selectedLinkAccountId}
                  disabled={readOnlyDemo || linkingAccount}
                  onChange={(e) => setSelectedLinkAccountId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-xs"
                >
                  <option value="">Selecione…</option>
                  {linkableAccounts
                    .filter((a) => !a.provider)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                disabled={readOnlyDemo || linkingAccount || !selectedLinkAccountId}
                onClick={() => void linkSelectedAccount()}
                className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              >
                Vincular ao C6 Bank
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="whitespace-pre-line rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          {info}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={readOnlyDemo || saving}
          onClick={() => void save()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Salvar configuração
        </button>
      </div>
    </div>
  );
}
