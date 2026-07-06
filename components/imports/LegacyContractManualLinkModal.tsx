'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Link2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { applyTenantFilter, resolveRlsContext } from '@/lib/rls';
import type { ValidatedLegacyContractRow } from '@/lib/imports/modules/legacy-contracts/types';

export type LegacyContractManualLinkFormValues = {
  project_id: string;
  quadra: string;
  lote: string;
  customer_name: string;
  observacoes: string;
};

type ProjectOption = {
  id: string;
  name: string;
};

type LegacyContractManualLinkModalProps = {
  open: boolean;
  row: ValidatedLegacyContractRow | null;
  activeTenantId: string | null;
  userId: string | null;
  onClose: () => void;
  onConfirm: (values: LegacyContractManualLinkFormValues) => Promise<void>;
};

const EMPTY_FORM: LegacyContractManualLinkFormValues = {
  project_id: '',
  quadra: '',
  lote: '',
  customer_name: '',
  observacoes: '',
};

export function LegacyContractManualLinkModal({
  open,
  row,
  activeTenantId,
  userId,
  onClose,
  onConfirm,
}: LegacyContractManualLinkModalProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<LegacyContractManualLinkFormValues>(EMPTY_FORM);

  const canSubmit = useMemo(() => {
    return (
      Boolean(form.project_id.trim()) &&
      Boolean(form.quadra.trim()) &&
      Boolean(form.lote.trim()) &&
      Boolean(form.customer_name.trim())
    );
  }, [form]);

  useEffect(() => {
    if (!open || !row) return;

    setForm({
      project_id: row.project_id || '',
      quadra: row.quadra || '',
      lote: row.lote || '',
      customer_name: row.customer_name || '',
      observacoes: row.manual_link_notes || row.observacoes || '',
    });
    setError('');
  }, [open, row]);

  useEffect(() => {
    if (!open || !activeTenantId || !userId) return;

    let cancelled = false;

    async function loadProjects() {
      setLoadingProjects(true);
      setError('');
      try {
        const rlsCtx = await resolveRlsContext({
          id: userId,
          tenant_id: activeTenantId,
          role: 'ADMIN',
        });

        let projectsQuery = supabase.from('projects').select('id, name').order('name');
        projectsQuery = applyTenantFilter(projectsQuery, rlsCtx, 'projects');
        const { data, error: queryError } = await projectsQuery;

        if (queryError) {
          throw new Error(queryError.message);
        }

        if (!cancelled) {
          setProjects((data || []) as ProjectOption[]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Não foi possível carregar os empreendimentos.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingProjects(false);
        }
      }
    }

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [open, activeTenantId, userId]);

  if (!open || !row) return null;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(form);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível vincular o contrato.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
      data-testid="legacy-contract-manual-link-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legacy-contract-manual-link-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <div>
            <h2
              id="legacy-contract-manual-link-title"
              className="text-lg font-semibold text-[var(--text-primary)]"
            >
              Vincular Contrato Antigo
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1 break-all">
              PDF: {row.nome_arquivo_pdf}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-main)]"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error ? (
            <div
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              Empreendimento *
            </span>
            <select
              value={form.project_id}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, project_id: event.target.value }))
              }
              disabled={loadingProjects || submitting}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 text-sm"
              data-testid="legacy-manual-link-project"
            >
              <option value="">
                {loadingProjects ? 'Carregando empreendimentos…' : 'Selecione o empreendimento'}
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                Quadra *
              </span>
              <input
                type="text"
                value={form.quadra}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, quadra: event.target.value }))
                }
                disabled={submitting}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 text-sm"
                data-testid="legacy-manual-link-quadra"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                Lote *
              </span>
              <input
                type="text"
                value={form.lote}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, lote: event.target.value }))
                }
                disabled={submitting}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 text-sm"
                data-testid="legacy-manual-link-lote"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              Nome do Cliente *
            </span>
            <input
              type="text"
              value={form.customer_name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, customer_name: event.target.value }))
              }
              disabled={submitting}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 text-sm"
              data-testid="legacy-manual-link-customer"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              Observações
            </span>
            <textarea
              value={form.observacoes}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, observacoes: event.target.value }))
              }
              disabled={submitting}
              rows={3}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-3 py-2 text-sm resize-y"
              data-testid="legacy-manual-link-notes"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            data-testid="legacy-manual-link-confirm"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Confirmar vínculo
          </button>
        </div>
      </div>
    </div>
  );
}
