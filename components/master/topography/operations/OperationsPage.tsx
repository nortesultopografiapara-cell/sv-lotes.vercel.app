'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import type {
  MasterTopographyOperation,
  MasterTopographyOperationKpis,
} from '@/lib/master/topography/operationTypes';
import {
  OperationFilters,
  type OperationFiltersState,
  type ProjectOption,
} from './OperationFilters';
import {
  OperationFormModal,
  formToOperationPayload,
  type ProjectQuoteOption,
} from './OperationFormModal';
import { OperationKpiRow } from './OperationKpiRow';
import { OperationPriorityBadge } from './OperationPriorityBadge';
import { OperationStatusBadge } from './OperationStatusBadge';
import { OperationStatusModal } from './OperationStatusModal';
import styles from './operation.module.css';

const EMPTY_KPIS: MasterTopographyOperationKpis = {
  total: 0,
  draft: 0,
  planned: 0,
  scheduled: 0,
  inField: 0,
  processing: 0,
  waitingClient: 0,
  completed: 0,
  completedThisMonth: 0,
  canceled: 0,
  overdue: 0,
  estimatedCostSum: 0,
  actualCostSum: 0,
};

function formatCurrency(val: number | null | undefined) {
  if (val == null || !Number.isFinite(val)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('pt-BR');
}

function OperationsPageInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const openNew = searchParams.get('new') === '1';

  const [items, setItems] = useState<MasterTopographyOperation[]>([]);
  const [kpis, setKpis] = useState<MasterTopographyOperationKpis>(EMPTY_KPIS);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [filters, setFilters] = useState<OperationFiltersState>({
    q: '',
    status: '',
    priority: '',
    projectId: '',
    responsible: '',
    scheduledFrom: '',
    scheduledTo: '',
    includeArchived: false,
  });
  const [qDebounced, setQDebounced] = useState('');
  const [responsibleDebounced, setResponsibleDebounced] = useState('');

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [quotes, setQuotes] = useState<ProjectQuoteOption[]>([]);
  const [projectMap, setProjectMap] = useState<Record<string, string>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MasterTopographyOperation | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [statusTarget, setStatusTarget] = useState<MasterTopographyOperation | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(filters.q.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  useEffect(() => {
    const t = setTimeout(() => setResponsibleDebounced(filters.responsible.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.responsible]);

  useEffect(() => {
    if (openNew) {
      setEditTarget(null);
      setFormError(null);
      setModalOpen(true);
      router.replace('/master/topography/operations');
    }
  }, [openNew, router]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const qs = `userId=${encodeURIComponent(user.id)}&limit=100`;
        const [pRes, qRes] = await Promise.all([
          fetch(`/api/master/topography/projects?${qs}`),
          fetch(`/api/master/topography/quotes?${qs}`),
        ]);
        const pData = await pRes.json().catch(() => ({}));
        const qData = await qRes.json().catch(() => ({}));
        if (cancelled) return;

        const projectOpts: ProjectOption[] = (pData.projects || []).map(
          (p: { id: string; code?: string; title?: string }) => ({
            id: String(p.id),
            label: `${p.code || ''} — ${p.title || ''}`.trim(),
          }),
        );
        const map: Record<string, string> = {};
        for (const p of projectOpts) map[p.id] = p.label;
        setProjects(projectOpts);
        setProjectMap(map);

        setQuotes(
          (qData.quotes || []).map((q: { id: string; code?: string; title?: string }) => ({
            id: String(q.id),
            label: `${q.code || ''} — ${q.title || ''}`.trim(),
          })),
        );
      } catch {
        /* seletores opcionais */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        userId: user.id,
        page: String(page),
        limit: String(limit),
      });
      if (qDebounced) params.set('q', qDebounced);
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.projectId) params.set('projectId', filters.projectId);
      if (responsibleDebounced) params.set('responsible', responsibleDebounced);
      if (filters.scheduledFrom) {
        params.set('scheduledFrom', `${filters.scheduledFrom}T00:00:00.000Z`);
      }
      if (filters.scheduledTo) {
        params.set('scheduledTo', `${filters.scheduledTo}T23:59:59.999Z`);
      }
      if (filters.includeArchived) params.set('includeArchived', '1');

      const res = await fetch(`/api/master/topography/operations?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar operações.');
      setItems(data.operations || []);
      setTotal(data.total || 0);
      setKpis(data.kpis || EMPTY_KPIS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [
    user?.id,
    page,
    limit,
    qDebounced,
    filters.status,
    filters.priority,
    filters.projectId,
    filters.scheduledFrom,
    filters.scheduledTo,
    filters.includeArchived,
    responsibleDebounced,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const openCreate = () => {
    setEditTarget(null);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row: MasterTopographyOperation) => {
    setEditTarget(row);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (payload: ReturnType<typeof formToOperationPayload>) => {
    if (!user?.id) return;
    setSaving(true);
    setFormError(null);
    try {
      const isEdit = Boolean(editTarget?.id);
      const res = await fetch(
        isEdit
          ? `/api/master/topography/operations/${editTarget!.id}`
          : '/api/master/topography/operations',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, userId: user.id }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar operação.');
      setModalOpen(false);
      setToast(
        isEdit
          ? 'Ordem de Serviço atualizada.'
          : `Ordem de Serviço ${data.operation?.code || ''} criada.`,
      );
      await load();
      if (!isEdit && data.operation?.id) {
        router.push(`/master/topography/operations/${data.operation.id}`);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const setArchived = async (row: MasterTopographyOperation, archived: boolean) => {
    if (!user?.id) return;
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/master/topography/operations/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          patchOnly: true,
          is_archived: archived,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar arquivamento.');
      setToast(archived ? `OS ${row.code} arquivada.` : `OS ${row.code} restaurada.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao arquivar/restaurar.');
    } finally {
      setBusyId(null);
    }
  };

  const handleStatusChange = async (payload: {
    status: string;
    actual_end?: string | null;
  }) => {
    if (!user?.id || !statusTarget) return;
    setStatusSaving(true);
    setStatusError(null);
    try {
      const res = await fetch(`/api/master/topography/operations/${statusTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          patchOnly: true,
          status: payload.status,
          actual_end: payload.actual_end,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao alterar status.');
      setStatusTarget(null);
      setToast(`Status de ${statusTarget.code} atualizado.`);
      await load();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Falha ao alterar status.');
    } finally {
      setStatusSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Operação</h1>
          <p className={styles.subtitle}>
            Ordens de Serviço de campo da SV Topografia &amp; Projetos — exclusivo do Master.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btnSecondary} onClick={() => void load()}>
            <RefreshCw width={14} height={14} />
            Atualizar
          </button>
          <button type="button" className={styles.btnPrimary} onClick={openCreate}>
            <Plus width={14} height={14} />
            Nova Ordem de Serviço
          </button>
        </div>
      </div>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <OperationKpiRow kpis={kpis} />

      <OperationFilters
        value={filters}
        projects={projects}
        onChange={(next) => {
          setPage(1);
          setFilters(next);
        }}
      />

      <div className={styles.panel}>
        {loading ? (
          <div className={styles.loading}>Carregando operações…</div>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>Nenhuma Ordem de Serviço encontrada</h2>
            <p>
              Crie a primeira OS ou ajuste os filtros. O código sequencial OS-AAAA-NNNN é gerado
              automaticamente.
            </p>
            <button type="button" className={styles.btnPrimary} onClick={openCreate}>
              <Plus width={14} height={14} />
              Nova Ordem de Serviço
            </button>
          </div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Título</th>
                    <th>Cliente</th>
                    <th>Projeto</th>
                    <th>Status</th>
                    <th>Prioridade</th>
                    <th>Responsável</th>
                    <th>Início previsto</th>
                    <th>Término previsto</th>
                    <th>Local</th>
                    <th>Custo estimado</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td className={styles.codeCell}>
                        {row.code}
                        {row.is_archived ? (
                          <span className={styles.archivedTag}>Arquivada</span>
                        ) : null}
                      </td>
                      <td className={styles.nameCell}>{row.title}</td>
                      <td>{row.client_name || <span className={styles.muted}>—</span>}</td>
                      <td>
                        {row.project_id ? (
                          projectMap[row.project_id] || (
                            <span className={styles.muted}>{row.project_id.slice(0, 8)}…</span>
                          )
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                      <td>
                        <OperationStatusBadge status={row.status} />
                      </td>
                      <td>
                        <OperationPriorityBadge priority={row.priority} />
                      </td>
                      <td>{row.responsible_name || <span className={styles.muted}>—</span>}</td>
                      <td>{formatDateTime(row.scheduled_start)}</td>
                      <td>{formatDateTime(row.scheduled_end)}</td>
                      <td>{row.location_name || <span className={styles.muted}>—</span>}</td>
                      <td>{formatCurrency(row.estimated_cost)}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <Link
                            className={styles.btnGhost}
                            href={`/master/topography/operations/${row.id}`}
                          >
                            Detalhes
                          </Link>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => openEdit(row)}
                            disabled={busyId === row.id}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => {
                              setStatusError(null);
                              setStatusTarget(row);
                            }}
                            disabled={busyId === row.id}
                          >
                            Alterar status
                          </button>
                          {row.is_archived ? (
                            <button
                              type="button"
                              className={styles.btnSecondary}
                              onClick={() => void setArchived(row, false)}
                              disabled={busyId === row.id}
                            >
                              Restaurar
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.btnDanger}
                              onClick={() => void setArchived(row, true)}
                              disabled={busyId === row.id}
                            >
                              Arquivar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <span>
                {total} registro{total === 1 ? '' : 's'} · página {page} de {totalPages}
              </span>
              <div className={styles.headerActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <OperationFormModal
        open={modalOpen}
        mode={editTarget ? 'edit' : 'create'}
        initial={editTarget}
        saving={saving}
        error={formError}
        userId={user?.id || ''}
        projects={projects}
        quotes={quotes}
        onClose={() => {
          if (!saving) setModalOpen(false);
        }}
        onSubmit={handleSave}
      />

      <OperationStatusModal
        open={Boolean(statusTarget)}
        operation={statusTarget}
        saving={statusSaving}
        error={statusError}
        onClose={() => {
          if (!statusSaving) setStatusTarget(null);
        }}
        onSubmit={handleStatusChange}
      />

      {toast ? (
        <div className={styles.toast}>
          {toast}
          <button
            type="button"
            style={{
              marginLeft: 12,
              background: 'transparent',
              border: 'none',
              color: '#93c5fd',
              cursor: 'pointer',
            }}
            onClick={() => setToast(null)}
          >
            Fechar
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function OperationsPage() {
  return (
    <MasterSuperAdminGuard>
      <OperationsPageInner />
    </MasterSuperAdminGuard>
  );
}
