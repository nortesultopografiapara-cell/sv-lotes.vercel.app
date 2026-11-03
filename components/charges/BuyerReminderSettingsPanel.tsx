'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import type { BuyerReminderRunItem } from '@/lib/charges/buyerReminderRunner';
import {
  formatBuyerReminderRunDateLabel,
} from '@/lib/charges/buyerReminderPresentation';
import {
  DEFAULT_BUYER_REMINDER_SETTINGS,
  type BuyerReminderSettings,
} from '@/lib/charges/buyerReminderTypes';

type Props = {
  readOnlyDemo?: boolean;
};

type SimulateResult = {
  action?: string;
  dryRun?: boolean;
  runDate?: string;
  sent?: number;
  skipped?: number;
  failed?: number;
  truncated?: boolean;
  items?: BuyerReminderRunItem[];
  error?: string;
};

export function BuyerReminderSettingsPanel({ readOnlyDemo = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [productionBlocked, setProductionBlocked] = useState(false);
  const [settings, setSettings] = useState<BuyerReminderSettings>({
    companyId: '',
    ...DEFAULT_BUYER_REMINDER_SETTINGS,
  });
  const [runDate, setRunDate] = useState('');
  const [simulateResult, setSimulateResult] = useState<SimulateResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/finance/charges/buyer-reminders');
        const json = (await res.json()) as {
          settings?: BuyerReminderSettings;
          productionBlocked?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error || 'Erro ao carregar lembretes.');
        if (cancelled) return;
        if (json.settings) setSettings(json.settings);
        setProductionBlocked(Boolean(json.productionBlocked));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (readOnlyDemo) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/finance/charges/buyer-reminders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const json = (await res.json()) as { settings?: BuyerReminderSettings; error?: string };
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar.');
      if (json.settings) setSettings(json.settings);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function simulate(action: 'simulate' | 'run') {
    if (readOnlyDemo) return;
    if (action === 'run') {
      const ok = window.confirm(
        'Enviar lembretes reais agora para esta empresa, usando a data simulada? Use apenas números/e-mails controlados em Preview.',
      );
      if (!ok) return;
    }
    setSimulating(true);
    setError(null);
    setSimulateResult(null);
    try {
      const res = await fetch('/api/finance/charges/buyer-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          runDate: runDate || undefined,
          forceEnabled: action === 'simulate',
        }),
      });
      const json = (await res.json()) as SimulateResult & { error?: string };
      if (!res.ok) throw new Error(json.error || 'Erro na simulação.');
      setSimulateResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na simulação.');
    } finally {
      setSimulating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando lembretes automáticos…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-[var(--brand-primary)]" />
          <h3 className="text-base font-bold text-[var(--text-primary)]">
            Lembretes automáticos aos compradores
          </h3>
        </div>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Avisos D-3, no vencimento e cobrança amigável após o vencimento, pela Central SV Lotes.
          Timezone: America/Sao_Paulo. Não gera boleto/PIX novo. Padrão desligado.
        </p>
      </div>

      {productionBlocked ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Bloqueado em Production nesta fase. Use somente Preview/DEVELOP.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={settings.enabled}
          disabled={readOnlyDemo}
          onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
        />
        Ativar lembretes automáticos
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={settings.whatsappEnabled}
            disabled={readOnlyDemo}
            onChange={(e) => setSettings((s) => ({ ...s, whatsappEnabled: e.target.checked }))}
          />
          Canal WhatsApp
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={settings.emailEnabled}
            disabled={readOnlyDemo}
            onChange={(e) => setSettings((s) => ({ ...s, emailEnabled: e.target.checked }))}
          />
          Canal e-mail
        </label>
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--border-color)] p-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Eventos</p>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.dueSoonEnabled}
            disabled={readOnlyDemo}
            onChange={(e) => setSettings((s) => ({ ...s, dueSoonEnabled: e.target.checked }))}
          />
          3 dias antes
          <input
            type="number"
            min={1}
            max={30}
            className="w-16 rounded border border-[var(--border-color)] bg-transparent px-2 py-1"
            value={settings.dueSoonDays}
            disabled={readOnlyDemo}
            onChange={(e) =>
              setSettings((s) => ({ ...s, dueSoonDays: Number(e.target.value) || 3 }))
            }
          />
          <span className="text-[var(--text-secondary)]">dias antes do vencimento</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.dueTodayEnabled}
            disabled={readOnlyDemo}
            onChange={(e) => setSettings((s) => ({ ...s, dueTodayEnabled: e.target.checked }))}
          />
          No vencimento
        </label>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.overdueEnabled}
            disabled={readOnlyDemo}
            onChange={(e) => setSettings((s) => ({ ...s, overdueEnabled: e.target.checked }))}
          />
          Cobrança amigável após vencimento
          <input
            type="number"
            min={1}
            max={30}
            className="w-16 rounded border border-[var(--border-color)] bg-transparent px-2 py-1"
            value={settings.overdueDays}
            disabled={readOnlyDemo}
            onChange={(e) =>
              setSettings((s) => ({ ...s, overdueDays: Number(e.target.value) || 3 }))
            }
          />
          <span className="text-[var(--text-secondary)]">dias após o vencimento</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={readOnlyDemo || saving}
          onClick={() => void save()}
          className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar configuração'}
        </button>
        {saved ? <span className="text-sm text-emerald-400">Salvo.</span> : null}
      </div>

      <div className="space-y-2 rounded-xl border border-dashed border-[var(--border-color)] p-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Homologação (Preview)</p>
        <p className="text-xs text-[var(--text-secondary)]">
          Simula o dia de execução sem alterar vencimentos reais. Não dispara carteira de Production.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={runDate}
            onChange={(e) => setRunDate(e.target.value)}
            className="rounded border border-[var(--border-color)] bg-transparent px-2 py-1 text-sm"
          />
          <button
            type="button"
            disabled={readOnlyDemo || simulating || productionBlocked}
            onClick={() => void simulate('simulate')}
            className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm"
          >
            Simular
          </button>
          <button
            type="button"
            disabled={readOnlyDemo || simulating || productionBlocked || !settings.enabled}
            onClick={() => void simulate('run')}
            className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-sm text-amber-200"
          >
            Executar agora
          </button>
        </div>
        {simulateResult ? (
          <HomologationResult result={simulateResult} fallbackDate={runDate} />
        ) : null}
      </div>
    </div>
  );
}

function HomologationResult({
  result,
  fallbackDate,
}: {
  result: SimulateResult;
  fallbackDate: string;
}) {
  const isSimulate = result.action === 'simulate' || result.dryRun === true;
  const dateLabel = formatBuyerReminderRunDateLabel(result.runDate || fallbackDate);
  const eligible = useMemo(
    () => (result.items || []).filter((item) => item.status === 'sent'),
    [result.items],
  );
  const skipped = useMemo(
    () => (result.items || []).filter((item) => item.status === 'skipped'),
    [result.items],
  );
  const failed = useMemo(
    () => (result.items || []).filter((item) => item.status === 'failed'),
    [result.items],
  );
  const sentOrEligible = result.sent ?? eligible.length;
  const [openPreview, setOpenPreview] = useState<string | null>(null);

  return (
    <div className="space-y-3 pt-2">
      <p className="text-sm font-medium text-[var(--text-primary)]">
        {isSimulate ? 'Simulação' : 'Execução'} {dateLabel} —{' '}
        {isSimulate ? `elegíveis ${sentOrEligible}` : `enviados ${sentOrEligible}`}, ignorados{' '}
        {result.skipped ?? skipped.length}, falhas {result.failed ?? failed.length}
        {result.truncated ? ' (teto de WhatsApp atingido)' : ''}
      </p>

      {eligible.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            {isSimulate ? 'Elegíveis' : 'Enviados'}
          </p>
          {eligible.map((item, index) => {
            const key = `${item.installmentId}-${item.channel}-${item.eventType}-${index}`;
            return (
              <div
                key={key}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
              >
                <p className="font-semibold">{item.customerName || '—'}</p>
                <p className="text-[var(--text-secondary)]">
                  {item.projectName || '—'} · {item.lotLabel || '—'} · {item.parcelLabel || '—'}
                </p>
                <p className="text-[var(--text-secondary)]">
                  Vencimento {item.dueDateLabel || item.dueDateIso || '—'} · evento {item.eventLabel} ·{' '}
                  {item.channel === 'email' ? 'E-mail' : 'WhatsApp'} · {item.recipientMasked || '—'}
                </p>
                <p className="text-[var(--text-secondary)]">
                  Meio de pagamento: {item.paymentMethodLabel || 'não encontrado'}
                </p>
                {item.channel === 'email' ? (
                  <p className="text-[var(--text-secondary)]">
                    From: {item.emailFrom || '—'}
                    <br />
                    Reply-To: {item.emailReplyTo || '—'}
                  </p>
                ) : null}
                {isSimulate && item.messagePreview ? (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="text-[var(--brand-primary)] underline"
                      onClick={() => setOpenPreview((current) => (current === key ? null : key))}
                    >
                      {openPreview === key ? 'Ocultar mensagem' : 'Ver mensagem'}
                    </button>
                    {openPreview === key ? (
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-[var(--border-color)] bg-[var(--bg-card)] p-2 text-[11px] leading-5">
                        {item.messagePreview}
                      </pre>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {skipped.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Ignorados
          </p>
          {skipped.map((item, index) => (
            <div
              key={`${item.installmentId}-${item.channel}-skip-${index}`}
              className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs text-[var(--text-secondary)]"
            >
              <p className="text-[var(--text-primary)]">
                {item.customerName || '—'} · {item.parcelLabel || '—'}
              </p>
              <p>
                {item.channel === 'email' ? 'E-mail' : 'WhatsApp'} —{' '}
                {item.skipReasonLabel || item.skipReason || 'ignorado'}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {failed.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Falhas
          </p>
          {failed.map((item, index) => (
            <div
              key={`${item.installmentId}-${item.channel}-fail-${index}`}
              className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300"
            >
              {item.customerName || '—'} · {item.channel === 'email' ? 'E-mail' : 'WhatsApp'} —{' '}
              {item.error || 'falhou'}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
