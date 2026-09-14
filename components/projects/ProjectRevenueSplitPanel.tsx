'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { canManageRevenueSplit } from '@/lib/rolePermissions';
import { isPlatformAdmin } from '@/lib/rls';
import {
  REVENUE_SPLIT_CONFIGURE_ACCOUNT_LABEL,
  REVENUE_SPLIT_FINANCIAL_SETTINGS_HREF,
  REVENUE_SPLIT_GATEWAY_ESTIMATE_WARNING,
  REVENUE_SPLIT_MISSING_WALLET_MESSAGE,
  REVENUE_SPLIT_WALLET_LINKED_LABEL,
  REVENUE_SPLIT_PARTY_KIND_LABELS,
  REVENUE_SPLIT_PARTY_KINDS,
  REVENUE_SPLIT_STATUS_LABELS,
  estimateShareAmount,
  formatSharePercent,
  isExactHundredPercent,
  parseSharePercentInput,
  type FinancialAccountProviderDestination,
  type ProjectRevenueSplitParticipantInput,
  type RevenueSplitPartyKind,
  type RevenueSplitValidationIssue,
} from '@/lib/finance/revenueSplit';

type AccountOption = {
  id: string;
  name: string;
  accountType?: string;
  beneficiaryName?: string | null;
  provider?: string | null;
  isDefault?: boolean;
  asaasWalletLinked?: boolean;
  asaasWalletMasked?: string | null;
};

type OwnerOption = {
  id: string;
  full_name?: string | null;
  name?: string | null;
  email?: string;
};

type ParticipantDraft = ProjectRevenueSplitParticipantInput & {
  key: string;
  walletId: string;
  shareInput: string;
};

type Props = {
  projectId: string;
  projectName?: string;
  accounts: AccountOption[];
};

function newKey(): string {
  return crypto.randomUUID();
}

function emptyParticipant(isIssuer: boolean): ParticipantDraft {
  return {
    key: newKey(),
    displayName: isIssuer ? 'Administradora' : '',
    partyKind: isIssuer ? 'ISSUER' : 'OWNER',
    userId: null,
    financialAccountId: null,
    sharePercent: isIssuer ? 100 : 0,
    shareInput: isIssuer ? '100' : '',
    isIssuerRemainder: isIssuer,
    sortOrder: 0,
    active: true,
    walletId: '',
  };
}

function queryAuthParams(): string {
  if (typeof window === 'undefined') return '';
  const qs = new URLSearchParams();
  const impersonating = localStorage.getItem('impersonating_tenant_id');
  if (impersonating) qs.set('impersonatingTenantId', impersonating);
  const suffix = qs.toString();
  return suffix ? `?${suffix}` : '';
}

async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

function impersonatingTenantId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('impersonating_tenant_id');
}

function destinationForAccount(
  destinations: FinancialAccountProviderDestination[],
  accountId: string | null | undefined,
): FinancialAccountProviderDestination | undefined {
  const id = String(accountId || '').trim();
  if (!id) return undefined;
  return destinations.find(
    (row) =>
      row.financialAccountId === id &&
      row.provider === 'ASAAS_COMPANY' &&
      row.destinationType === 'WALLET_ID' &&
      row.status === 'ACTIVE' &&
      String(row.destinationIdentifier || '').trim().length > 0,
  );
}

export function ProjectRevenueSplitPanel({ projectId, projectName, accounts }: Props) {
  const { user } = useAuth();
  const canEdit = canManageRevenueSplit(user?.role);
  const showManualWalletFallback = isPlatformAdmin(user?.role);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState<'DRAFT' | 'ACTIVE' | 'INACTIVE'>('DRAFT');
  const [operational, setOperational] = useState(false);
  const [participants, setParticipants] = useState<ParticipantDraft[]>([emptyParticipant(true)]);
  const [destinations, setDestinations] = useState<FinancialAccountProviderDestination[]>([]);
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<RevenueSplitValidationIssue[]>([]);
  const [previewGross, setPreviewGross] = useState('1000');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      const authQuery = queryAuthParams();
      const [splitRes, ownersRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/revenue-split${authQuery}`, { headers, credentials: 'include' }),
        fetch(`/api/owners${authQuery}`, { headers, credentials: 'include' }),
      ]);
      const splitJson = await splitRes.json().catch(() => ({}));
      if (!splitRes.ok) throw new Error(splitJson.error || 'Erro ao carregar Split.');
      const ownersJson = ownersRes.ok ? await ownersRes.json().catch(() => ({})) : {};
      setOwners((ownersJson.owners || []) as OwnerOption[]);
      setConfigured(Boolean(splitJson.present));
      setOperational(Boolean(splitJson.operational));
      setStatus(splitJson.config?.status || 'DRAFT');
      setDestinations(splitJson.destinations || []);
      setIssues(splitJson.activation?.issues || []);
      if (splitJson.present && Array.isArray(splitJson.participants) && splitJson.participants.length) {
        setParticipants(
          splitJson.participants.map((row: Record<string, unknown>, index: number) => {
            const accountId = String(row.financialAccountId || '') || null;
            return {
              key: String(row.id || newKey()),
              displayName: String(row.displayName || ''),
              partyKind: (row.partyKind || 'OWNER') as RevenueSplitPartyKind,
              userId: String(row.userId || '') || null,
              financialAccountId: accountId,
              sharePercent: Number(row.sharePercent || 0),
              shareInput: formatSharePercent(Number(row.sharePercent || 0)).replace(/,0000$/, ''),
              isIssuerRemainder: Boolean(row.isIssuerRemainder),
              sortOrder: Number(row.sortOrder ?? index),
              active: row.active !== false,
              walletId: '',
            };
          }),
        );
      } else {
        setParticipants([emptyParticipant(true)]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar Split.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeParticipants = participants.filter((row) => row.active !== false);
  const totalUnitsExact = isExactHundredPercent(activeParticipants.map((row) => Number(row.sharePercent) || 0));
  const totalLabel = formatSharePercent(
    activeParticipants.reduce((sum, row) => sum + (Number(row.sharePercent) || 0), 0),
  );

  const updateRow = (key: string, patch: Partial<ParticipantDraft>) => {
    setParticipants((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const setIssuer = (key: string) => {
    setParticipants((prev) =>
      prev.map((row) => ({
        ...row,
        isIssuerRemainder: row.key === key,
        partyKind: row.key === key ? 'ISSUER' : row.partyKind === 'ISSUER' ? 'OWNER' : row.partyKind,
      })),
    );
  };

  const payloadParticipants = (): ProjectRevenueSplitParticipantInput[] =>
    participants.map((row, index) => ({
      displayName: row.displayName,
      partyKind: row.partyKind,
      userId: row.userId,
      financialAccountId: row.financialAccountId,
      sharePercent: Number(row.sharePercent) || 0,
      isIssuerRemainder: Boolean(row.isIssuerRemainder),
      sortOrder: index,
      active: true,
    }));

  const save = async (action: 'draft' | 'activate' | 'deactivate') => {
    setSaving(true);
    setError('');
    setMessage('');
    setIssues([]);
    if (!canEdit) {
      setError('Apenas administradores da empresa podem editar a Distribuição de Recebimentos.');
      setSaving(false);
      return;
    }
    try {
      const headers = await authHeaders();
      for (const row of participants) {
        if (!showManualWalletFallback) continue;
        if (row.isIssuerRemainder || !row.financialAccountId || !row.walletId.trim()) continue;
        const destRes = await fetch('/api/finance/revenue-split/destinations', {
          method: 'PUT',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            financialAccountId: row.financialAccountId,
            walletId: row.walletId.trim(),
            impersonatingTenantId: impersonatingTenantId(),
          }),
        });
        const destJson = await destRes.json().catch(() => ({}));
        if (!destRes.ok) throw new Error(destJson.error || 'Erro ao salvar Wallet ID.');
      }
      const res = await fetch(`/api/projects/${projectId}/revenue-split`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action,
          participants: payloadParticipants(),
          impersonatingTenantId: impersonatingTenantId(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIssues(json.issues || []);
        throw new Error(json.error || 'Não foi possível salvar.');
      }
      setConfigured(true);
      setOperational(Boolean(json.operational));
      setStatus(
        json.config?.status ||
          (action === 'activate' ? 'ACTIVE' : action === 'deactivate' ? 'INACTIVE' : 'DRAFT'),
      );
      setDestinations(json.destinations || []);
      setMessage(
        action === 'activate'
          ? 'Split ativado para este empreendimento.'
          : action === 'deactivate'
            ? 'Split desativado. A configuração foi preservada.'
            : 'Rascunho salvo.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const previewGrossNumber = Number(String(previewGross).replace(',', '.')) || 0;

  const fieldClass =
    'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--text-primary)]';

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] p-3 text-sm text-[var(--color-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando Distribuição de Recebimentos…
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            Distribuição de Recebimentos
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {projectName ? `${projectName} · ` : ''}
            Split automático: {operational ? 'Ativado' : 'Desativado'}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
            status === 'ACTIVE'
              ? 'bg-emerald-500/15 text-emerald-300'
              : status === 'INACTIVE'
                ? 'bg-slate-500/20 text-slate-300'
                : 'bg-amber-500/15 text-amber-200'
          }`}
        >
          {REVENUE_SPLIT_STATUS_LABELS[status]}
        </span>
      </div>

      {!configured ? (
        <p className="text-sm text-[var(--color-text-muted)]">Split de Recebimentos não configurado.</p>
      ) : null}

      {participants.map((row) => {
        const dest = destinationForAccount(destinations, row.financialAccountId);
        return (
          <div key={row.key} className="rounded-lg border border-[var(--color-border)]/80 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name={`issuer-${projectId}`}
                  checked={Boolean(row.isIssuerRemainder)}
                  disabled={!canEdit}
                  onChange={() => setIssuer(row.key)}
                />
                Conta emissora
              </label>
              {canEdit && participants.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setParticipants((prev) => {
                      const next = prev.filter((item) => item.key !== row.key);
                      if (!next.some((item) => item.isIssuerRemainder) && next[0]) {
                        next[0] = { ...next[0], isIssuerRemainder: true, partyKind: 'ISSUER' };
                      }
                      return next;
                    })
                  }
                  className="text-[var(--color-text-muted)] hover:text-red-300"
                  title="Remover participante"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <input
              className={fieldClass}
              value={row.displayName}
              placeholder="Nome do participante"
              disabled={!canEdit}
              onChange={(event) => updateRow(row.key, { displayName: event.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                className={fieldClass}
                value={row.partyKind}
                disabled={!canEdit}
                onChange={(event) =>
                  updateRow(row.key, { partyKind: event.target.value as RevenueSplitPartyKind })
                }
              >
                {REVENUE_SPLIT_PARTY_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {REVENUE_SPLIT_PARTY_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
              <input
                className={fieldClass}
                inputMode="decimal"
                value={row.shareInput}
                placeholder="Percentual"
                disabled={!canEdit}
                onChange={(event) => {
                  const parsed = parseSharePercentInput(event.target.value);
                  updateRow(row.key, {
                    shareInput: event.target.value,
                    sharePercent: parsed ?? 0,
                  });
                }}
              />
            </div>
            <select
              className={fieldClass}
              value={row.userId || ''}
              disabled={!canEdit}
              onChange={(event) => {
                const userId = event.target.value || null;
                const owner = owners.find((item) => item.id === userId);
                updateRow(row.key, {
                  userId,
                  displayName:
                    row.displayName.trim() ||
                    owner?.full_name ||
                    owner?.name ||
                    row.displayName,
                });
              }}
            >
              <option value="">Sócio / proprietário (opcional)</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.full_name || owner.name || owner.email}
                </option>
              ))}
            </select>
            <select
              className={fieldClass}
              value={row.financialAccountId || ''}
              disabled={!canEdit}
              onChange={(event) =>
                updateRow(row.key, {
                  financialAccountId: event.target.value || null,
                  walletId: '',
                })
              }
            >
              <option value="">Conta financeira</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.isDefault ? ' (Padrão)' : ''}
                </option>
              ))}
            </select>
            {row.isIssuerRemainder ? (
              <p className="text-xs text-emerald-300">Conta emissora ✓ — não precisa de Wallet ID no Split.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {(() => {
                  const account = accounts.find((item) => item.id === row.financialAccountId);
                  const walletConfigured = Boolean(dest || account?.asaasWalletLinked);
                  return (
                    <>
                      <p className={`text-xs ${walletConfigured ? 'text-emerald-300' : 'text-amber-200'}`}>
                        {walletConfigured
                          ? `${REVENUE_SPLIT_WALLET_LINKED_LABEL}${
                              account?.asaasWalletMasked ? ` · ${account.asaasWalletMasked}` : ''
                            }`
                          : row.financialAccountId
                            ? REVENUE_SPLIT_MISSING_WALLET_MESSAGE
                            : 'Selecione a conta financeira do participante.'}
                      </p>
                      {!walletConfigured ? (
                        <a
                          href={REVENUE_SPLIT_FINANCIAL_SETTINGS_HREF}
                          className="text-xs font-semibold text-[var(--color-primary)] underline underline-offset-2"
                        >
                          {REVENUE_SPLIT_CONFIGURE_ACCOUNT_LABEL}
                        </a>
                      ) : null}
                    </>
                  );
                })()}
                {showManualWalletFallback ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[var(--color-text-muted)]">
                      Modo avançado (SUPER_ADMIN): Wallet ID manual
                    </label>
                    <input
                      className={fieldClass}
                      value={row.walletId}
                      placeholder="Fallback técnico — somente SUPER_ADMIN"
                      disabled={!canEdit}
                      onChange={(event) => updateRow(row.key, { walletId: event.target.value })}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        );
      })}

      {canEdit ? (
        <button
          type="button"
          onClick={() => setParticipants((prev) => [...prev, emptyParticipant(false)])}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
        >
          <Plus className="h-4 w-4" />
          Adicionar participante
        </button>
      ) : (
        <p className="text-xs text-[var(--color-text-muted)]">
          Apenas administradores da empresa podem editar a Distribuição de Recebimentos.
        </p>
      )}

      <div className={`text-sm font-semibold ${totalUnitsExact ? 'text-emerald-300' : 'text-red-300'}`}>
        Total distribuído: {totalLabel}% {totalUnitsExact ? '✓' : ''}
      </div>

      <div className="rounded-lg bg-[var(--color-background)] p-3 text-xs text-[var(--color-text-muted)]">
        <p className="mb-2 font-semibold text-[var(--text-primary)]">Preview informativo</p>
        <label className="mb-2 flex items-center gap-2">
          Parcela:
          <input
            className={`${fieldClass} max-w-[140px]`}
            value={previewGross}
            onChange={(event) => setPreviewGross(event.target.value)}
          />
        </label>
        {activeParticipants.map((row) => (
          <p key={`preview-${row.key}`}>
            {row.displayName || 'Participante'} {formatSharePercent(Number(row.sharePercent) || 0)}%
            {' · '}~R$ {estimateShareAmount(previewGrossNumber, Number(row.sharePercent) || 0).toFixed(2)}
          </p>
        ))}
        <p className="mt-2">{REVENUE_SPLIT_GATEWAY_ESTIMATE_WARNING}</p>
      </div>

      {issues.length ? (
        <ul className="text-xs text-red-300 list-disc pl-4">
          {issues.map((issue) => (
            <li key={issue.code}>{issue.message}</li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

      {canEdit ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save('draft')}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
          >
            {saving ? 'Salvando…' : configured ? 'Salvar rascunho' : 'Configurar Split'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save('activate')}
            className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Ativar Split
          </button>
          {configured ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save('deactivate')}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
            >
              Desativar Split
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
