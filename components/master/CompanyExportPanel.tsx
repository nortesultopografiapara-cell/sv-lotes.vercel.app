'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, FileArchive, Loader2, Trash2, XCircle } from 'lucide-react';
import {
  COMPANY_EXPORT_CONTENT_SUMMARY,
} from '@/lib/master/companyExport/registry';
import {
  type CompanyExportJobRow,
  type CompanyExportReason,
  type CompanyExportVersion,
} from '@/lib/master/companyExport/types';
import { reasonLabel } from '@/lib/master/companyExport/audit';
import type { CompanyExportEstimate } from '@/lib/master/companyExport/estimate';

type Props = {
  companyId: string;
  companyName: string;
  userId: string;
};

const REASON_OPTIONS: { value: CompanyExportReason; label: string }[] = [
  { value: 'CLIENT_REQUEST', label: reasonLabel('CLIENT_REQUEST') },
  { value: 'BACKUP', label: reasonLabel('BACKUP') },
  { value: 'MIGRATION', label: reasonLabel('MIGRATION') },
  { value: 'OFFBOARDING', label: reasonLabel('OFFBOARDING') },
  { value: 'OTHER', label: reasonLabel('OTHER') },
];

function statusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'Na fila';
    case 'PROCESSING':
      return 'Processando';
    case 'COMPLETED':
      return 'Concluída';
    case 'FAILED':
      return 'Falhou';
    case 'EXPIRED':
      return 'Expirada';
    case 'CANCELLED':
      return 'Cancelada';
    default:
      return status;
  }
}

function formatBytes(n: number): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function versionBadge(job: CompanyExportJobRow): string {
  const v = (job.export_version ||
    (job.manifest as { export_version?: string } | null)?.export_version ||
    'F1_TABULAR') as string;
  return v === 'F2_COMPLETE' ? 'F2' : 'F1';
}

export function CompanyExportPanel({ companyId, companyName, userId }: Props) {
  const [jobs, setJobs] = useState<CompanyExportJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState<CompanyExportReason>('CLIENT_REQUEST');
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [exportVersion, setExportVersion] = useState<CompanyExportVersion>('F2_COMPLETE');
  const [includePlans, setIncludePlans] = useState(true);
  const [heavyConfirm, setHeavyConfirm] = useState(false);
  const [estimate, setEstimate] = useState<CompanyExportEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/master/companies/${companyId}/exports?userId=${encodeURIComponent(userId)}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar exportações');
      setJobs(json.jobs || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [companyId, userId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadJobs();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadJobs]);

  const hasActive = jobs.some((j) => j.status === 'PENDING' || j.status === 'PROCESSING');

  useEffect(() => {
    if (!hasActive) return;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/master/companies/${companyId}/exports?userId=${encodeURIComponent(userId)}`,
        );
        const json = await res.json();
        const list = (json.jobs || []) as CompanyExportJobRow[];
        const active = list.filter((j) => j.status === 'PENDING' || j.status === 'PROCESSING');
        await Promise.all(
          active.map(async (j) => {
            try {
              await fetch(
                `/api/master/companies/${companyId}/exports/${j.id}?userId=${encodeURIComponent(userId)}`,
              );
            } catch {
              // ignore
            }
          }),
        );
      } catch {
        // ignore
      }
      await loadJobs();
    };
    const t = setInterval(() => {
      void tick();
    }, 4000);
    return () => clearInterval(t);
  }, [hasActive, companyId, userId, loadJobs]);

  useEffect(() => {
    if (!modalOpen || exportVersion !== 'F2_COMPLETE') {
      setEstimate(null);
      setHeavyConfirm(false);
      return;
    }
    let cancelled = false;
    setEstimateLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/master/companies/${companyId}/exports/estimate?userId=${encodeURIComponent(userId)}`,
        );
        const json = await res.json();
        if (!cancelled && res.ok) setEstimate(json.estimate || null);
      } catch {
        if (!cancelled) setEstimate(null);
      } finally {
        if (!cancelled) setEstimateLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, exportVersion, companyId, userId]);

  const needsHeavyConfirm =
    exportVersion === 'F2_COMPLETE' &&
    estimate &&
    (includePlans
      ? estimate.requiresExtraConfirmWithPlans
      : estimate.requiresExtraConfirmWithoutPlans);

  async function handleCreate() {
    if (!confirmed) {
      setError('Confirme explicitamente a geração do pacote.');
      return;
    }
    if (needsHeavyConfirm && !heavyConfirm) {
      setError('Esta exportação é pesada: confirme a estimativa de lotes/PDFs/tamanho.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/companies/${companyId}/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          reason,
          notes,
          exportVersion,
          includeGeneratedPlans: includePlans,
          heavyConfirm: Boolean(heavyConfirm || !needsHeavyConfirm),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.estimate) setEstimate(json.estimate);
        throw new Error(json.error || 'Falha ao criar exportação');
      }
      setModalOpen(false);
      setNotes('');
      setConfirmed(false);
      setHeavyConfirm(false);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownload(exportId: string) {
    setActionId(exportId);
    try {
      const res = await fetch(
        `/api/master/companies/${companyId}/exports/${exportId}/download?userId=${encodeURIComponent(userId)}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha no download');
      window.open(json.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no download');
    } finally {
      setActionId(null);
    }
  }

  async function handleCancel(exportId: string) {
    setActionId(exportId);
    try {
      const res = await fetch(`/api/master/companies/${companyId}/exports/${exportId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao cancelar');
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setActionId(null);
    }
  }

  async function handleDeleteFile(exportId: string) {
    if (!confirm('Remover o arquivo ZIP? O histórico do job será mantido.')) return;
    setActionId(exportId);
    try {
      const res = await fetch(
        `/api/master/companies/${companyId}/exports/${exportId}/file?userId=${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao excluir');
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Exportações de dados</h3>
          <p className="text-sm text-slate-400">
            Pacote completo (F2): tabular + Storage + memoriais/pranchas regenerados. F1 permanece
            disponível como tabular apenas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold"
        >
          <FileArchive className="w-4 h-4" />
          Exportar dados
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma exportação registrada.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-white font-medium">
                    <span className="mr-2 inline-block rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-cyan-200">
                      {versionBadge(job)}
                    </span>
                    {statusLabel(job.status)} · {reasonLabel(job.reason)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(job.created_at).toLocaleString('pt-BR')} · {job.id.slice(0, 8)}…
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {job.status === 'COMPLETED' && job.storage_path ? (
                    <button
                      type="button"
                      disabled={actionId === job.id}
                      onClick={() => void handleDownload(job.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-emerald-600/80 text-white"
                    >
                      <Download className="w-3.5 h-3.5" /> Baixar
                    </button>
                  ) : null}
                  {(job.status === 'PENDING' || job.status === 'PROCESSING') && (
                    <button
                      type="button"
                      disabled={actionId === job.id}
                      onClick={() => void handleCancel(job.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-white/15 text-slate-300"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Cancelar
                    </button>
                  )}
                  {job.status === 'COMPLETED' && job.storage_path ? (
                    <button
                      type="button"
                      disabled={actionId === job.id}
                      onClick={() => void handleDeleteFile(job.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-red-500/30 text-red-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Excluir arquivo
                    </button>
                  ) : null}
                </div>
              </div>

              {(job.status === 'PENDING' || job.status === 'PROCESSING') && (
                <div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 transition-all"
                      style={{ width: `${Math.max(2, job.progress || 0)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {job.progress || 0}% · {job.current_step || '—'}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>Registros: {job.records_exported ?? 0}</span>
                <span>Arquivos: {job.files_exported ?? 0}</span>
                <span>Tamanho: {formatBytes(Number(job.total_size || 0))}</span>
                {job.storage_files_copied != null ? (
                  <span>Storage: {job.storage_files_copied}/{job.storage_files_found ?? 0}</span>
                ) : null}
                {job.storage_files_missing ? (
                  <span>Ausentes: {job.storage_files_missing}</span>
                ) : null}
                {(job.generated_memorials || job.generated_lot_plans) ? (
                  <span>
                    Planos: M{job.generated_memorials || 0}/P{job.generated_lot_plans || 0}/G
                    {job.generated_general_plans || 0}
                  </span>
                ) : null}
                {(job.package_parts || 0) > 1 ? (
                  <span>Pacote dividido ({job.package_parts} partes)</span>
                ) : null}
                {job.expires_at ? (
                  <span>Expira: {new Date(job.expires_at).toLocaleString('pt-BR')}</span>
                ) : null}
              </div>
              {job.error_message ? (
                <p className="text-xs text-amber-300/90">{job.error_message}</p>
              ) : null}
              {Array.isArray((job.manifest as { warnings?: string[] } | null)?.warnings) &&
              ((job.manifest as { warnings: string[] }).warnings?.length || 0) > 0 ? (
                <p className="text-[11px] text-slate-500">
                  Avisos: {(job.manifest as { warnings: string[] }).warnings.slice(0, 3).join(' · ')}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0f141c] p-5 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white">Exportar dados da empresa</h3>
            <p className="text-sm text-slate-300">
              Empresa: <strong className="text-white">{companyName}</strong>
            </p>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              O pacote contém dados pessoais e financeiros (LGPD). Trate como confidencial. Esta
              ação não suspende nem exclui a empresa. Memoriais/pranchas (F2) são regenerados no
              staging e não gravam no cadastro operacional.
            </div>

            <label className="block text-sm text-slate-300">
              Tipo de pacote
              <select
                value={exportVersion}
                onChange={(e) => setExportVersion(e.target.value as CompanyExportVersion)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
              >
                <option value="F2_COMPLETE">F2 completo (recomendado)</option>
                <option value="F1_TABULAR">F1 tabular apenas</option>
              </select>
            </label>

            <label className="block text-sm text-slate-300">
              Motivo
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as CompanyExportReason)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
              >
                {REASON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-300">
              Observação
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
                placeholder="Opcional"
              />
            </label>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Conteúdo tabular
              </p>
              <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
                {COMPANY_EXPORT_CONTENT_SUMMARY.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            {exportVersion === 'F2_COMPLETE' ? (
              <>
                <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-300 space-y-1">
                  <p className="font-semibold text-slate-200">Estimativa F2</p>
                  {estimateLoading ? (
                    <p>Calculando lotes / PDFs / tamanho…</p>
                  ) : estimate ? (
                    <>
                      <p>
                        Lotes: {estimate.blocks} · Projetos: {estimate.projects} · Docs venda:{' '}
                        {estimate.saleDocuments} · Legacy: {estimate.legacyDocuments}
                      </p>
                      <p>
                        Se planos ligados ≈ {estimate.memorialsIfEnabled} memoriais +{' '}
                        {estimate.lotPlansIfEnabled} pranchas + {estimate.generalPlansIfEnabled}{' '}
                        gerais (~{estimate.estimatedBinaryMbWithPlans} MB;{' '}
                        {estimate.estimatedMinutesWithPlans})
                      </p>
                      <p>
                        Sem planos ≈ {estimate.estimatedBinaryMbWithoutPlans} MB
                        {estimate.packageSplitLikelyWithPlans
                          ? ' · pacote provavelmente dividido'
                          : ''}
                      </p>
                    </>
                  ) : (
                    <p>Estimativa indisponível — use com cautela em empresas grandes.</p>
                  )}
                </div>
                <label className="flex items-start gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={includePlans}
                    onChange={(e) => {
                      setIncludePlans(e.target.checked);
                      setHeavyConfirm(false);
                    }}
                    className="mt-1"
                  />
                  Incluir memoriais e pranchas regenerados (pode demorar em empresas grandes)
                </label>
                {needsHeavyConfirm ? (
                  <label className="flex items-start gap-2 text-sm text-amber-100">
                    <input
                      type="checkbox"
                      checked={heavyConfirm}
                      onChange={(e) => setHeavyConfirm(e.target.checked)}
                      className="mt-1"
                    />
                    Confirmo exportação pesada após revisar lotes, PDFs estimados e tamanho (ex.:
                    Meneses).
                  </label>
                ) : null}
              </>
            ) : null}

            <label className="flex items-start gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1"
              />
              Confirmo a geração do pacote de exportação para esta empresa.
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-3 py-2 rounded-lg text-sm text-slate-300 border border-white/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submitting || !confirmed || Boolean(needsHeavyConfirm && !heavyConfirm)}
                onClick={() => void handleCreate()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-cyan-600 text-white disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Gerar pacote
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
