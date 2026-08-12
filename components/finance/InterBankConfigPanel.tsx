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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

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

  async function testLocal() {
    setTesting(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/banking/inter/config?action=test-connection', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha no teste');
      setInfo(String(data.message || 'Teste local concluído.'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro no teste');
    } finally {
      setTesting(false);
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
          <p className="text-amber-300">Integração verificada: ainda não (Fase B)</p>
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

      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
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
          {testing ? 'Testando…' : 'Testar conexão (local)'}
        </button>
      </div>
    </div>
  );
}
