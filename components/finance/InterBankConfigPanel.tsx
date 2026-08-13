'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileKey2, Loader2, ShieldCheck, Upload } from 'lucide-react';
import type { InterBankConfigPublic } from '@/lib/banking/inter/interConfigTypes';
import type { BankEnvironment } from '@/lib/banking/types';

type Props = {
  readOnlyDemo?: boolean;
  onClose?: () => void;
};

type LocalFile = {
  name: string;
  size: number;
  content: string;
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

export function InterBankConfigPanel({ readOnlyDemo = false, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [config, setConfig] = useState<InterBankConfigPublic | null>(null);

  const [environment, setEnvironment] = useState<BankEnvironment>('SANDBOX');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [certFile, setCertFile] = useState<LocalFile | null>(null);
  const [keyFile, setKeyFile] = useState<LocalFile | null>(null);
  const [webhook, setWebhook] = useState<{
    receiverPublicUrl: string | null;
    registeredUrl: string | null;
    status: string;
    lastNotificationAt: string | null;
    lastNotificationCodigo: string | null;
    lastNotificationSituacao: string | null;
    lastError: string | null;
  } | null>(null);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [linkingAccount, setLinkingAccount] = useState(false);

  const loadWebhook = useCallback(async () => {
    try {
      const res = await fetch('/api/banking/inter/webhook', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setWebhook(data.webhook || null);
    } catch {
      /* silencioso na carga inicial */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/banking/inter/config', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar Inter');
      const cfg = data.config as InterBankConfigPublic;
      setConfig(cfg);
      setEnvironment(cfg.environment || 'SANDBOX');
      setClientId(cfg.clientId || '');
      setClientSecret('');
      setCertFile(null);
      setKeyFile(null);
      await loadWebhook();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [loadWebhook]);

  useEffect(() => {
    void load();
  }, [load]);

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

      const res = await fetch('/api/banking/inter/config', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
      setConfig(data.config as InterBankConfigPublic);
      setClientSecret('');
      setCertFile(null);
      setKeyFile(null);
      setInfo('Configuração salva.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function webhookAction(method: 'GET' | 'PUT' | 'DELETE') {
    if (readOnlyDemo) return;
    setWebhookBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/banking/inter/webhook', {
        method,
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha na operação de webhook');
      if (method === 'GET') {
        setWebhook(data.webhook || null);
        setInfo('Webhook consultado no Inter.');
      } else if (method === 'PUT') {
        setWebhook((prev) => ({
          receiverPublicUrl: data.webhook?.receiverPublicUrl || prev?.receiverPublicUrl || null,
          registeredUrl: data.webhook?.registeredUrl || null,
          status: data.webhook?.status || 'REGISTERED',
          lastNotificationAt: prev?.lastNotificationAt || null,
          lastNotificationCodigo: prev?.lastNotificationCodigo || null,
          lastNotificationSituacao: prev?.lastNotificationSituacao || null,
          lastError: null,
        }));
        setInfo('Webhook cadastrado no Inter (URL do receptor mTLS).');
      } else {
        setWebhook((prev) =>
          prev
            ? {
                ...prev,
                registeredUrl: null,
                status: 'NOT_REGISTERED',
                lastError: null,
              }
            : prev,
        );
        setInfo('Webhook removido no Inter.');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro no webhook');
    } finally {
      setWebhookBusy(false);
    }
  }

  async function testLocal() {
    setTesting(true);
    setError('');
    setInfo('');
    try {
      setInfo('Testando conexão com Banco Inter...');
      const res = await fetch('/api/banking/inter/config?action=test-connection', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha no teste');
      if (data.config) setConfig(data.config as InterBankConfigPublic);

      if (data.ok) {
        const envLabel =
          data.environment === 'PRODUCTION' ? 'Produção' : 'Sandbox';
        const when = data.testedAt
          ? new Date(String(data.testedAt)).toLocaleString('pt-BR')
          : '';
        setInfo(
          [
            String(data.message || 'Conexão com Banco Inter realizada com sucesso.'),
            `Ambiente: ${envLabel}`,
            `Status da autenticação: ${data.authStatus || 'VERIFIED'}`,
            when ? `Data/hora do teste: ${when}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        );
      } else {
        setError(String(data.message || data.error || 'Falha na autenticação Inter.'));
        setInfo('');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro no teste');
      setInfo('');
    } finally {
      setTesting(false);
    }
  }

  async function linkDefaultFinancialAccount() {
    setLinkingAccount(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/banking/inter/link-financial-account', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao vincular conta');
      setInfo(
        `Conta financeira vinculada ao Banco Inter (${String(data.financialAccountId || '').slice(0, 8)}…). Cobranças da venda dessa conta usarão Inter.`,
      );
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
        Carregando configuração Inter…
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--text-primary)]">Configurar Banco Inter</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Client ID, Client Secret, certificado e chave privada. Credenciais são criptografadas no
            servidor. Nenhum caminho local é armazenado.
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
          <p>Client ID: {config.clientIdConfigured ? 'Configurado' : 'Não configurado'}</p>
          <p>Client Secret: {config.hasClientSecret ? 'Configurado ••••••••••' : 'Não configurado'}</p>
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
          <p>
            Ambiente:{' '}
            {config.environment === 'PRODUCTION' ? 'Produção' : 'Sandbox'}
          </p>
          <p className={config.connectionVerified ? 'text-emerald-300' : 'text-amber-300'}>
            {config.connectionVerified
              ? `Integração verificada${
                  config.lastConnectionTestAt
                    ? ` — ${new Date(config.lastConnectionTestAt).toLocaleString('pt-BR')}`
                    : ''
                }`
              : 'Integração verificada: ainda não (aguarde Testar conexão)'}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-[var(--text-primary)]">Ambiente</span>
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
          placeholder="Cole o Client ID do Inter"
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
              : 'Cole o Client Secret do Inter'
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

      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 space-y-3">
        <div>
          <h4 className="text-sm font-bold text-[var(--text-primary)]">Webhook</h4>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Callbacks do Inter passam por receptor mTLS dedicado (ca.crt). O certificado webhook
            não é enviado por este formulário — fica só no ambiente do receptor.
          </p>
        </div>
        <div className="text-xs text-[var(--text-secondary)] space-y-1">
          <p>
            URL pública do receptor:{' '}
            <span className="font-mono text-[var(--text-primary)]">
              {webhook?.receiverPublicUrl || 'INTER_WEBHOOK_RECEIVER_PUBLIC_URL não configurada'}
            </span>
          </p>
          <p>Status: {webhook?.status || '—'}</p>
          <p>URL registrada no Inter: {webhook?.registeredUrl || '—'}</p>
          <p>
            Última notificação:{' '}
            {webhook?.lastNotificationAt
              ? `${new Date(webhook.lastNotificationAt).toLocaleString('pt-BR')} (${webhook.lastNotificationSituacao || '—'} / ${webhook.lastNotificationCodigo || '—'})`
              : '—'}
          </p>
          <p>Último erro: {webhook?.lastError || '—'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={readOnlyDemo || webhookBusy}
            onClick={() => void webhookAction('PUT')}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          >
            Cadastrar webhook no Inter
          </button>
          <button
            type="button"
            disabled={readOnlyDemo || webhookBusy}
            onClick={() => void webhookAction('GET')}
            className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
          >
            Consultar webhook
          </button>
          <button
            type="button"
            disabled={readOnlyDemo || webhookBusy}
            onClick={() => void webhookAction('DELETE')}
            className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 disabled:opacity-40"
          >
            Remover webhook
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] p-3 space-y-2">
        <p className="text-xs font-semibold text-[var(--text-primary)]">
          Conta financeira (emissão de cobranças)
        </p>
        <p className="text-xs text-[var(--text-secondary)]">
          Vincule a conta financeira padrão ao Banco Inter para que a aba Cobranças da venda use o
          fluxo Inter (bank_charges). Contas sem vínculo continuam no Asaas.
        </p>
        <button
          type="button"
          disabled={readOnlyDemo || linkingAccount}
          onClick={() => void linkDefaultFinancialAccount()}
          className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-200 disabled:opacity-40"
        >
          {linkingAccount ? 'Vinculando…' : 'Vincular conta financeira padrão ao Inter'}
        </button>
      </div>

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
        <button
          type="button"
          disabled={readOnlyDemo || testing || saving}
          onClick={() => void testLocal()}
          className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-semibold disabled:opacity-40"
        >
          {testing ? 'Testando conexão com Banco Inter...' : 'Testar conexão'}
        </button>
      </div>
    </div>
  );
}
