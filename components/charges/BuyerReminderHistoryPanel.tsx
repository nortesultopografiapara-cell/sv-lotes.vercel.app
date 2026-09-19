'use client';

import { useEffect, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import type { BuyerReminderLogRow } from '@/lib/charges/buyerReminderRunner';

const EVENT_LABELS: Record<string, string> = {
  due_soon: '3 dias antes',
  due_today: 'No vencimento',
  overdue_friendly: 'Pós-vencimento',
};

const STATUS_LABELS: Record<string, string> = {
  sent: 'Enviado',
  skipped: 'Ignorado',
  failed: 'Falhou',
  queued: 'Na fila',
};

export function BuyerReminderHistoryPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<BuyerReminderLogRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/finance/charges/buyer-reminders?logs=1');
        const json = (await res.json()) as { logs?: BuyerReminderLogRow[]; error?: string };
        if (!res.ok) throw new Error(json.error || 'Erro ao carregar histórico.');
        if (!cancelled) setLogs(json.logs || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar histórico.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-6 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <div className="flex items-center gap-2 border-b border-[var(--border-color)] px-4 py-3">
        <Bell className="h-4 w-4 text-[var(--brand-primary)]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Lembretes automáticos</h3>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando histórico…
        </div>
      ) : error ? (
        <p className="px-4 py-3 text-sm text-red-300">{error}</p>
      ) : logs.length === 0 ? (
        <p className="px-4 py-3 text-sm text-[var(--text-secondary)]">
          Nenhum lembrete automático registrado para esta empresa.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="text-[var(--text-secondary)]">
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Empreendimento</th>
                <th className="px-3 py-2">Parcela</th>
                <th className="px-3 py-2">Evento</th>
                <th className="px-3 py-2">Canal</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border-subtle)]">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.createdAt ? new Date(row.createdAt).toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="px-3 py-2">{row.customerName || '—'}</td>
                  <td className="px-3 py-2">{row.projectName || '—'}</td>
                  <td className="px-3 py-2">{row.parcelLabel || '—'}</td>
                  <td className="px-3 py-2">{EVENT_LABELS[row.eventType] || row.eventType}</td>
                  <td className="px-3 py-2">{row.channel === 'email' ? 'E-mail' : 'WhatsApp'}</td>
                  <td className="px-3 py-2">
                    {STATUS_LABELS[row.status] || row.status}
                    {row.skipReason ? ` (${row.skipReason})` : ''}
                    {row.errorMessage ? ` — ${row.errorMessage}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
