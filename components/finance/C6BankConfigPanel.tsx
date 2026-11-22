'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  buildC6ConfigPutBody,
  presentC6ConfigFields,
  type C6BankConfigPublic,
} from '@/lib/banking/c6/c6ConfigTypes';
import type { BankEnvironment } from '@/lib/banking/types';

type LocalFile = { name: string; content: string };

type AccountOption = { id: string; name: string; provider: string | null };

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
  const [testing, setTesting] = useState(false);
  const [togglingEmission, setTogglingEmission] = useState(false);

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
      setFinancialAccountId(cfg.financialAccountId || '');
      setAccounts((data.financialAccounts as AccountOption[]) || []);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

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

  async function toggleEmission(enabled: boolean) {
    if (readOnlyDemo || persistBlocked || togglingEmission) return;
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
      setInfo(enabled ? 'Emissão ativada somente para esta empresa.' : 'Emissão desativada para esta empresa.');
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

  const linkable = accounts.filter((account) => {
    const provider = String(account.provider || '').toUpperCase();
    return !provider || provider === 'C6';
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
            {config?.emissionEnabled ? 'Emissão ATIVADA' : 'Emissão DESATIVADA'}
          </span>
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
              onChange={(event) => setFinancialAccountId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm"
            >
              <option value="">Sem vínculo</option>
              {linkable.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
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
        {config?.emissionEnabled ? (
          <button
            type="button"
            onClick={() => void toggleEmission(false)}
            disabled={readOnlyDemo || persistBlocked || togglingEmission || loading}
            className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-100 disabled:opacity-50"
          >
            {togglingEmission ? 'Atualizando' : 'Desativar emissão'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void toggleEmission(true)}
            disabled={
              readOnlyDemo ||
              persistBlocked ||
              togglingEmission ||
              loading ||
              !config?.clientIdConfigured ||
              !config.hasClientSecret ||
              !config.hasCertificate ||
              !config.financialAccountId
            }
            className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] disabled:opacity-50"
          >
            {togglingEmission ? 'Atualizando' : 'Ativar emissão desta empresa'}
          </button>
        )}
      </div>
    </section>
  );
}
