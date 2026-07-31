'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import type { MasterTopographyOperation } from '@/lib/master/topography/operationTypes';
import {
  OperationFormModal,
  formToOperationPayload,
  type ProjectQuoteOption,
} from './OperationFormModal';
import { OperationPriorityBadge } from './OperationPriorityBadge';
import { OperationStatusBadge } from './OperationStatusBadge';
import { OperationStatusModal } from './OperationStatusModal';
import styles from './operation.module.css';

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

function OperationDetailInner() {
  const { user } = useAuth();
  const params = useParams();
  const id = String(params?.id || '');

  const [operation, setOperation] = useState<MasterTopographyOperation | null>(null);
  const [projects, setProjects] = useState<ProjectQuoteOption[]>([]);
  const [quotes, setQuotes] = useState<ProjectQuoteOption[]>([]);
  const [projectLabel, setProjectLabel] = useState<string | null>(null);
  const [quoteLabel, setQuoteLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !id) return;
    setLoading(true);
    setError(null);
    try {
      const qs = `userId=${encodeURIComponent(user.id)}`;
      const res = await fetch(`/api/master/topography/operations/${id}?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar operação.');
      setOperation(data.operation || null);
    } catch (err) {
      setOperation(null);
      setError(err instanceof Error ? err.message : 'Falha ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, id]);

  useEffect(() => {
    void load();
  }, [load]);

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
        const pOpts: ProjectQuoteOption[] = (pData.projects || []).map(
          (p: { id: string; code?: string; title?: string }) => ({
            id: String(p.id),
            label: `${p.code || ''} — ${p.title || ''}`.trim(),
          }),
        );
        const qOpts: ProjectQuoteOption[] = (qData.quotes || []).map(
          (q: { id: string; code?: string; title?: string }) => ({
            id: String(q.id),
            label: `${q.code || ''} — ${q.title || ''}`.trim(),
          }),
        );
        setProjects(pOpts);
        setQuotes(qOpts);
      } catch {
        /* opcional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!operation) {
      setProjectLabel(null);
      setQuoteLabel(null);
      return;
    }
    setProjectLabel(
      operation.project_id
        ? projects.find((p) => p.id === operation.project_id)?.label || operation.project_id
        : null,
    );
    setQuoteLabel(
      operation.quote_id
        ? quotes.find((q) => q.id === operation.quote_id)?.label || operation.quote_id
        : null,
    );
  }, [operation, projects, quotes]);

  const handleSave = async (payload: ReturnType<typeof formToOperationPayload>) => {
    if (!user?.id || !operation) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/master/topography/operations/${operation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar.');
      setOperation(data.operation);
      setModalOpen(false);
      setToast('Ordem de Serviço atualizada.');
      void load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  const setArchived = async (archived: boolean) => {
    if (!user?.id || !operation) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/topography/operations/${operation.id}`, {
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
      setOperation(data.operation);
      setToast(archived ? 'OS arquivada.' : 'OS restaurada.');
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao arquivar/restaurar.');
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (payload: {
    status: string;
    actual_end?: string | null;
  }) => {
    if (!user?.id || !operation) return;
    setStatusSaving(true);
    setStatusError(null);
    try {
      const res = await fetch(`/api/master/topography/operations/${operation.id}`, {
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
      setOperation(data.operation);
      setStatusOpen(false);
      setToast('Status atualizado.');
      void load();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Falha ao alterar status.');
    } finally {
      setStatusSaving(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Carregando detalhe…</div>;
  }

  if (!operation) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBanner}>{error || 'Operação não encontrada.'}</div>
        <Link className={styles.btnSecondary} href="/master/topography/operations">
          <ArrowLeft width={14} height={14} />
          Voltar à lista
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <Link className={styles.btnGhost} href="/master/topography/operations">
            <ArrowLeft width={14} height={14} />
            Voltar à lista
          </Link>
          <h1 className={styles.title} style={{ marginTop: '0.65rem' }}>
            {operation.title}
            {operation.is_archived ? (
              <span className={styles.archivedTag}>Arquivada</span>
            ) : null}
          </h1>
          <p className={styles.subtitle}>
            <span className={styles.codeCell}>{operation.code}</span>
            {' · '}
            <OperationStatusBadge status={operation.status} />
            {' · '}
            <OperationPriorityBadge priority={operation.priority} />
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => {
              setFormError(null);
              setModalOpen(true);
            }}
            disabled={busy}
          >
            Editar
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => {
              setStatusError(null);
              setStatusOpen(true);
            }}
            disabled={busy}
          >
            Alterar status
          </button>
          {operation.is_archived ? (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => void setArchived(false)}
              disabled={busy}
            >
              Restaurar
            </button>
          ) : (
            <button
              type="button"
              className={styles.btnDanger}
              onClick={() => void setArchived(true)}
              disabled={busy}
            >
              Arquivar
            </button>
          )}
        </div>
      </div>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <div className={styles.detailGrid}>
        <div className={styles.card}>
          <h3>Dados gerais</h3>
          <dl className={styles.dl}>
            <dt>Código</dt>
            <dd className={styles.codeCell}>{operation.code}</dd>
            <dt>Título</dt>
            <dd>{operation.title}</dd>
            <dt>Status</dt>
            <dd>
              <OperationStatusBadge status={operation.status} />
            </dd>
            <dt>Prioridade</dt>
            <dd>
              <OperationPriorityBadge priority={operation.priority} />
            </dd>
            <dt>Cliente</dt>
            <dd>{operation.client_name || '—'}</dd>
            <dt>Tipo de serviço</dt>
            <dd>{operation.service_type || '—'}</dd>
            <dt>Projeto</dt>
            <dd>{projectLabel || '—'}</dd>
            <dt>Orçamento</dt>
            <dd>{quoteLabel || '—'}</dd>
            <dt>Descrição</dt>
            <dd>{operation.description || '—'}</dd>
            <dt>Responsável</dt>
            <dd>{operation.responsible_name || '—'}</dd>
          </dl>
        </div>

        <div className={styles.card}>
          <h3>Planejamento e custos</h3>
          <dl className={styles.dl}>
            <dt>Início previsto</dt>
            <dd>{formatDateTime(operation.scheduled_start)}</dd>
            <dt>Término previsto</dt>
            <dd>{formatDateTime(operation.scheduled_end)}</dd>
            <dt>Início real</dt>
            <dd>{formatDateTime(operation.actual_start)}</dd>
            <dt>Término real</dt>
            <dd>{formatDateTime(operation.actual_end)}</dd>
            <dt>Local</dt>
            <dd>{operation.location_name || '—'}</dd>
            <dt>Endereço</dt>
            <dd>{operation.address || '—'}</dd>
            <dt>Coordenadas</dt>
            <dd>
              {operation.latitude != null && operation.longitude != null
                ? `${operation.latitude}, ${operation.longitude}`
                : '—'}
            </dd>
            <dt>Custo estimado</dt>
            <dd>{formatCurrency(operation.estimated_cost)}</dd>
            <dt>Custo realizado</dt>
            <dd>{formatCurrency(operation.actual_cost)}</dd>
            <dt>Criado em</dt>
            <dd>{formatDateTime(operation.created_at)}</dd>
            <dt>Atualizado em</dt>
            <dd>{formatDateTime(operation.updated_at)}</dd>
          </dl>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: '0.85rem' }}>
        <h3>Observações</h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', whiteSpace: 'pre-wrap' }}>
          {operation.notes || '—'}
        </p>
      </div>

      <div className={styles.card} style={{ marginTop: '0.85rem' }}>
        <h3>Módulos futuros</h3>
        <div className={styles.soonGrid}>
          {[
            'Equipe',
            'Equipamentos',
            'Checklist',
            'Ocorrências',
            'Despesas',
            'Documentos',
            'Timeline',
          ].map((label) => (
            <div key={label} className={styles.comingSoonBox}>
              {label} — Em breve
            </div>
          ))}
        </div>
      </div>

      <OperationFormModal
        open={modalOpen}
        mode="edit"
        initial={operation}
        saving={busy}
        error={formError}
        projects={projects}
        quotes={quotes}
        onClose={() => {
          if (!busy) setModalOpen(false);
        }}
        onSubmit={handleSave}
      />

      <OperationStatusModal
        open={statusOpen}
        operation={operation}
        saving={statusSaving}
        error={statusError}
        onClose={() => {
          if (!statusSaving) setStatusOpen(false);
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

export default function OperationDetailPage() {
  return (
    <MasterSuperAdminGuard>
      <OperationDetailInner />
    </MasterSuperAdminGuard>
  );
}
