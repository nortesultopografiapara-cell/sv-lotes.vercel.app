'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Loader2, Settings, X } from 'lucide-react';
import type { BuyerReminderLogRow } from '@/lib/charges/buyerReminderRunner';
import {
  BUYER_REMINDER_SKIP_REASON_LABELS,
  formatBuyerReminderEventLabel,
} from '@/lib/charges/buyerReminderPresentation';
import {
  BUYER_REMINDER_SETTINGS_HREF,
  DEFAULT_BUYER_REMINDER_SETTINGS,
  type BuyerReminderChannel,
  type BuyerReminderEventType,
  type BuyerReminderSettings,
  type BuyerReminderSkipReason,
} from '@/lib/charges/buyerReminderTypes';

type Props = {
  open: boolean;
  onClose: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  sent: 'Enviado',
  skipped: 'Ignorado',
  failed: 'Falhou',
  queued: 'Na fila',
};

function eventLabel(event: string, settings: BuyerReminderSettings): string {
  if (event === 'due_soon' || event === 'due_today' || event === 'overdue_friendly') {
    return formatBuyerReminderEventLabel(event as BuyerReminderEventType, settings);
  }
  return event;
}

function skipLabel(reason: string | null): string | null {
  if (!reason) return null;
  return BUYER_REMINDER_SKIP_REASON_LABELS[reason as BuyerReminderSkipReason] || reason;
}

export function BuyerReminderOpsModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<BuyerReminderSettings>({
    companyId: '',
    ...DEFAULT_BUYER_REMINDER_SETTINGS,
  });
  const [logs, setLogs] = useState<BuyerReminderLogRow[]>([]);
  const [eventFilter, setEventFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [errorDetailId, setErrorDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ logs: '1' });
      if (eventFilter) params.set('event', eventFilter);
      if (channelFilter) params.set('channel', channelFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/finance/charges/buyer-reminders?${params.toString()}`);
      const json = (await res.json()) as {
        settings?: BuyerReminderSettings;
        logs?: BuyerReminderLogRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar lembretes.');
      if (json.settings) setSettings(json.settings);
      setLogs(json.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar lembretes.');
    } finally {
      setLoading(false);
    }
  }, [channelFilter, eventFilter, from, statusFilter, to]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const channels = useMemo(() => {
    const list: Array<{ id: BuyerReminderChannel; on: boolean; label: string }> = [
      { id: 'whatsapp', on: settings.whatsappEnabled, label: 'WhatsApp' },
      { id: 'email', on: settings.emailEnabled, label: 'E-mail' },
    ];
    return list;
  }, [settings.emailEnabled, settings.whatsappEnabled]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="buyer-reminder-ops-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-none">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
          <div>
            <h2 id="buyer-reminder-ops-title" className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
              <Bell className="h-4 w-4 text-amber-300" />
              Central de Lembretes
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Consulta operacional dos lembretes automáticos. A configuração estrutural permanece em Integração Financeira.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">Status</p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                Lembretes automáticos:{' '}
                <span className={settings.enabled ? 'text-emerald-300' : 'text-amber-200'}>
                  {settings.enabled ? 'Ativado' : 'Desativado'}
                </span>
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">Canais</p>
              <p className="mt-1 text-sm text-[var(--text-primary)]">
                {channels.map((channel) => (
                  <span key={channel.id} className="mr-3">
                    {channel.label}:{' '}
                    <span className={channel.on && settings.enabled ? 'text-emerald-300' : 'text-[var(--text-muted)]'}>
                      {channel.on && settings.enabled ? 'Ativo' : 'Desativado'}
                    </span>
                  </span>
                ))}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">Régua configurada</p>
              <p className="mt-1 text-sm text-[var(--text-primary)]">
                D-{settings.dueSoonDays}: {settings.dueSoonDays} dia(s) antes
                {' · '}
                D0: no vencimento
                {' · '}
                D+{settings.overdueDays}: cobrança amigável após {settings.overdueDays} dia(s)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--text-secondary)]">
              Histórico da empresa. Execução manual permanece protegida em Configurações.
            </p>
            <a
              href={BUYER_REMINDER_SETTINGS_HREF}
              className="charges-ops-btn border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <Settings className="h-4 w-4" />
              Configurar
            </a>
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--border-color)] px-3 py-3">
            <label className="text-xs text-[var(--text-secondary)]">
              De
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block rounded-md border border-[var(--border-color)] bg-transparent px-2 py-1 text-[var(--text-primary)]"
              />
            </label>
            <label className="text-xs text-[var(--text-secondary)]">
              Até
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 block rounded-md border border-[var(--border-color)] bg-transparent px-2 py-1 text-[var(--text-primary)]"
              />
            </label>
            <label className="text-xs text-[var(--text-secondary)]">
              Evento
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="mt-1 block rounded-md border border-[var(--border-color)] bg-transparent px-2 py-1 text-[var(--text-primary)]"
              >
                <option value="">Todos</option>
                <option value="due_soon">D-{settings.dueSoonDays}</option>
                <option value="due_today">D0</option>
                <option value="overdue_friendly">D+{settings.overdueDays}</option>
              </select>
            </label>
            <label className="text-xs text-[var(--text-secondary)]">
              Canal
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="mt-1 block rounded-md border border-[var(--border-color)] bg-transparent px-2 py-1 text-[var(--text-primary)]"
              >
                <option value="">Todos</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
              </select>
            </label>
            <label className="text-xs text-[var(--text-secondary)]">
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mt-1 block rounded-md border border-[var(--border-color)] bg-transparent px-2 py-1 text-[var(--text-primary)]"
              >
                <option value="">Todos</option>
                <option value="sent">Enviado</option>
                <option value="skipped">Ignorado</option>
                <option value="failed">Falhou</option>
              </select>
            </label>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando histórico…
            </div>
          ) : error ? (
            <p className="text-sm text-red-300">{error}</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Nenhum lembrete automático registrado para esta empresa com os filtros atuais.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
              <table className="w-full min-w-[960px] text-left text-xs">
                <thead>
                  <tr className="text-[var(--text-secondary)]">
                    <th className="px-3 py-2">Data/hora</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Empreendimento</th>
                    <th className="px-3 py-2">Quadra/lote</th>
                    <th className="px-3 py-2">Parcela</th>
                    <th className="px-3 py-2">Evento</th>
                    <th className="px-3 py-2">Canal</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => {
                    const reason = skipLabel(row.skipReason);
                    const failed = row.status === 'failed';
                    const showError = errorDetailId === row.id;
                    return (
                      <tr key={row.id} className="border-t border-[var(--border-subtle)] align-top">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {row.createdAt ? new Date(row.createdAt).toLocaleString('pt-BR') : '—'}
                        </td>
                        <td className="px-3 py-2">{row.customerName || '—'}</td>
                        <td className="px-3 py-2">{row.projectName || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.lotLabel || '—'}</td>
                        <td className="px-3 py-2">{row.parcelLabel || '—'}</td>
                        <td className="px-3 py-2">{eventLabel(row.eventType, settings)}</td>
                        <td className="px-3 py-2">{row.channel === 'email' ? 'E-mail' : 'WhatsApp'}</td>
                        <td className="px-3 py-2">
                          <div>{STATUS_LABELS[row.status] || row.status}</div>
                          {row.status === 'skipped' && reason ? (
                            <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{reason}</div>
                          ) : null}
                          {failed ? (
                            <button
                              type="button"
                              className="mt-0.5 text-[11px] text-red-300 underline-offset-2 hover:underline"
                              onClick={() => setErrorDetailId(showError ? null : row.id)}
                            >
                              {showError ? 'Ocultar erro' : 'Ver erro'}
                            </button>
                          ) : null}
                          {failed && showError ? (
                            <p className="mt-1 max-w-xs text-[11px] text-red-200">
                              {row.errorMessage || 'Falha sem detalhe do provedor.'}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compatível com o painel anterior de /charges — agora abre como central operacional. */
export function BuyerReminderHistoryPanel(props: Props) {
  return <BuyerReminderOpsModal {...props} />;
}
