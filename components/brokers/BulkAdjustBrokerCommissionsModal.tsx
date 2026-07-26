'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Percent, X } from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import {
  BULK_ADJUST_CONFIRM_APPLY,
  BULK_ADJUST_CONFIRM_ZERO,
  requiredConfirmText,
  type BulkAdjustPreviewSummary,
} from '@/lib/brokerCommissionBulkAdjust';

type BrokerOption = {
  id: string;
  name: string;
};

type ProjectOption = {
  id: string;
  name: string;
};

type BulkAdjustBrokerCommissionsModalProps = {
  open: boolean;
  onClose: () => void;
  activeTenantId?: string | null;
  canManage: boolean;
  brokers: BrokerOption[];
  projects: ProjectOption[];
  /** Prefill for "Zerar comissões pendentes" shortcut */
  initialPreset?: 'zero_pending_all' | null;
  onSuccess: () => void;
};

export function BulkAdjustBrokerCommissionsModal({
  open,
  onClose,
  activeTenantId = null,
  canManage,
  brokers,
  projects,
  initialPreset = null,
  onSuccess,
}: BulkAdjustBrokerCommissionsModalProps) {
  const [selectedBrokerIds, setSelectedBrokerIds] = useState<string[]>([]);
  const [allBrokers, setAllBrokers] = useState(true);
  const [projectId, setProjectId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pendingOnly, setPendingOnly] = useState(true);
  const [newPercent, setNewPercent] = useState(0);
  const [preview, setPreview] = useState<BulkAdjustPreviewSummary | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setSuccessMsg('');
    setPreview(null);
    setConfirmChecked(false);
    setConfirmText('');
    if (initialPreset === 'zero_pending_all') {
      setAllBrokers(true);
      setSelectedBrokerIds([]);
      setProjectId('');
      setDateFrom('');
      setDateTo('');
      setPendingOnly(true);
      setNewPercent(0);
    } else {
      setAllBrokers(true);
      setSelectedBrokerIds([]);
      setProjectId('');
      setDateFrom('');
      setDateTo('');
      setPendingOnly(true);
      setNewPercent(0);
    }
  }, [open, initialPreset]);

  const expectedConfirm = useMemo(
    () => requiredConfirmText(newPercent),
    [newPercent],
  );

  const eligibleRows = useMemo(
    () => (preview?.rows || []).filter((r) => r.eligible),
    [preview],
  );

  const tenantQuery = activeTenantId
    ? `?activeTenantId=${encodeURIComponent(activeTenantId)}`
    : '';

  async function generatePreview() {
    if (!canManage) return;
    setLoadingPreview(true);
    setError('');
    setSuccessMsg('');
    setPreview(null);
    setConfirmChecked(false);
    setConfirmText('');
    try {
      const res = await fetch(
        `/api/brokers/commissions/bulk-adjust${tenantQuery}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'preview',
            activeTenantId,
            new_percent: Number(newPercent) || 0,
            filters: {
              brokerIds: allBrokers ? null : selectedBrokerIds,
              projectId: projectId || null,
              dateFrom: dateFrom || null,
              dateTo: dateTo || null,
              pendingOnly,
            },
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao gerar prévia');
      setPreview(data.preview as BulkAdjustPreviewSummary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar prévia');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function applyAdjust() {
    if (!canManage || !preview) return;
    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(
        `/api/brokers/commissions/bulk-adjust${tenantQuery}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'apply',
            activeTenantId,
            new_percent: Number(newPercent) || 0,
            confirmed: true,
            confirm_text: confirmText.trim(),
            filters: {
              brokerIds: allBrokers ? null : selectedBrokerIds,
              projectId: projectId || null,
              dateFrom: dateFrom || null,
              dateTo: dateTo || null,
              pendingOnly,
            },
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao aplicar ajuste');
      setSuccessMsg(
        `Ajuste aplicado em ${data.updated_count} comissão(ões). Lote/venda e corretor vinculados foram preservados.`,
      );
      setPreview(data.preview as BulkAdjustPreviewSummary);
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao aplicar');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const applyLabel =
    Number(newPercent) === 0
      ? `Zerar comissão de ${preview?.eligible_count || 0} venda(s)`
      : `Aplicar ${newPercent}% em ${preview?.eligible_count || 0} venda(s)`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Ajustar comissões de vendas existentes
              </h2>
              <p className="text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                Altera broker_commissions · não altera preço, parcelas ou contrato
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--bg-input)] text-[var(--text-secondary)]"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {!canManage ? (
            <p className="text-sm text-red-400">Sem permissão para esta ação.</p>
          ) : (
            <>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-[var(--text-secondary)] space-y-1">
                <p>
                  Só altera comissões <strong>pendentes</strong>. Pagas e pendentes
                  com saída de caixa ativa são preservadas.
                </p>
                <p>
                  Se o cadastro do corretor ainda tiver % &gt; 0, o backfill da
                  página de Corretores pode recriar comissão — mantenha o padrão
                  do corretor em 0% quando quiser zerar de forma permanente.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase">
                    Corretores
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={allBrokers}
                      onChange={(e) => {
                        setAllBrokers(e.target.checked);
                        if (e.target.checked) setSelectedBrokerIds([]);
                      }}
                    />
                    Todos os corretores
                  </label>
                  {!allBrokers && (
                    <select
                      multiple
                      value={selectedBrokerIds}
                      onChange={(e) =>
                        setSelectedBrokerIds(
                          Array.from(e.target.selectedOptions).map((o) => o.value),
                        )
                      }
                      className="w-full min-h-[120px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-primary)] p-2 text-sm"
                    >
                      {brokers.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase">
                      Empreendimento
                    </label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-primary)] px-3 py-2 text-sm"
                    >
                      <option value="">Todos</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase">
                        De
                      </label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-primary)] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase">
                        Até
                      </label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-primary)] px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase">
                      Novo percentual (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={newPercent}
                      onChange={(e) => setNewPercent(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-primary)] px-3 py-2 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={pendingOnly}
                      onChange={(e) => setPendingOnly(e.target.checked)}
                    />
                    Somente comissões pendentes
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={generatePreview}
                  disabled={loadingPreview || (!allBrokers && selectedBrokerIds.length === 0)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50"
                >
                  {loadingPreview ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  Gerar prévia
                </button>
              </div>

              {error ? (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              ) : null}
              {successMsg ? (
                <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                  {successMsg}
                </p>
              ) : null}

              {preview ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div className="rounded-lg border border-[var(--border-color)] p-3">
                      <div className="text-[10px] uppercase font-mono text-[var(--text-muted)]">
                        Elegíveis
                      </div>
                      <div className="text-xl font-bold">{preview.eligible_count}</div>
                    </div>
                    <div className="rounded-lg border border-[var(--border-color)] p-3">
                      <div className="text-[10px] uppercase font-mono text-[var(--text-muted)]">
                        Ignoradas
                      </div>
                      <div className="text-xl font-bold">{preview.ignored_count}</div>
                    </div>
                    <div className="rounded-lg border border-[var(--border-color)] p-3">
                      <div className="text-[10px] uppercase font-mono text-[var(--text-muted)]">
                        Total atual
                      </div>
                      <div className="text-lg font-bold">
                        {formatCurrencyBRL(preview.current_total)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[var(--border-color)] p-3">
                      <div className="text-[10px] uppercase font-mono text-[var(--text-muted)]">
                        Total após
                      </div>
                      <div className="text-lg font-bold">
                        {formatCurrencyBRL(preview.new_total)}
                      </div>
                    </div>
                  </div>

                  {preview.warnings.map((w) => (
                    <p
                      key={w}
                      className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2"
                    >
                      {w}
                    </p>
                  ))}

                  <div className="max-h-48 overflow-auto rounded-lg border border-[var(--border-color)]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[var(--bg-card)]">
                        <tr className="text-left text-[var(--text-muted)] font-mono uppercase">
                          <th className="p-2">Corretor</th>
                          <th className="p-2">Lote</th>
                          <th className="p-2 text-right">Atual</th>
                          <th className="p-2 text-right">Novo</th>
                          <th className="p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eligibleRows.slice(0, 50).map((r) => (
                          <tr key={r.id} className="border-t border-[var(--border-color)]">
                            <td className="p-2">{r.broker_name || '—'}</td>
                            <td className="p-2">
                              {r.lot_label || r.customer_name || r.sale_id?.slice(0, 8)}
                            </td>
                            <td className="p-2 text-right">
                              {r.current_percent}% · {formatCurrencyBRL(r.current_amount)}
                            </td>
                            <td className="p-2 text-right">
                              {r.new_percent}% · {formatCurrencyBRL(r.new_amount)}
                            </td>
                            <td className="p-2 text-emerald-400">elegível</td>
                          </tr>
                        ))}
                        {eligibleRows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-3 text-[var(--text-muted)]">
                              Nenhuma comissão elegível com os filtros atuais.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  {preview.eligible_count > 0 ? (
                    <div className="space-y-2 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
                      <label className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
                        <input
                          type="checkbox"
                          checked={confirmChecked}
                          onChange={(e) => setConfirmChecked(e.target.checked)}
                          className="mt-1"
                        />
                        Confirmo o ajuste nas {preview.eligible_count} comissões
                        elegíveis. Comissões pagas não serão alteradas.
                      </label>
                      <div>
                        <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase">
                          Digite {expectedConfirm}
                        </label>
                        <input
                          type="text"
                          value={confirmText}
                          onChange={(e) => setConfirmText(e.target.value)}
                          placeholder={
                            Number(newPercent) === 0
                              ? BULK_ADJUST_CONFIRM_ZERO
                              : BULK_ADJUST_CONFIRM_APPLY
                          }
                          className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-primary)] px-3 py-2 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={applyAdjust}
                        disabled={
                          submitting ||
                          !confirmChecked ||
                          confirmText.trim() !== expectedConfirm
                        }
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-orange-500 to-amber-500 text-white disabled:opacity-40"
                      >
                        {submitting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : null}
                        {applyLabel}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
