'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import { topographyCategoryLabel } from '@/lib/master/topography/categories';
import {
  topographyFinancialSituationLabel,
  topographyOriginLabel,
} from '@/lib/master/topography/origins';
import { topographyPriorityLabel } from '@/lib/master/topography/priorities';
import { topographyServiceTypeLabel } from '@/lib/master/topography/serviceTypes';
import {
  topographyStatusLabel,
  TOPOGRAPHY_STATUSES,
} from '@/lib/master/topography/statuses';
import type { MasterTopographyProject } from '@/lib/master/topography/types';
import {
  TopographyProjectFormModal,
  formToPayload,
} from './TopographyProjectFormModal';
import styles from './topographyProjects.module.css';

function formatCurrency(val: number | null | undefined) {
  if (val == null || !Number.isFinite(val)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function TopographyProjectDetailInner() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');

  const [project, setProject] = useState<MasterTopographyProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState('');
  const [progressDraft, setProgressDraft] = useState('0');

  const load = useCallback(async () => {
    if (!user?.id || !id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/master/topography/projects/${id}?userId=${encodeURIComponent(user.id)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar.');
      setProject(data.project);
      setStatusDraft(data.project.status);
      setProgressDraft(String(data.project.progress_percent ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar.');
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga do detalhe
    void load();
  }, [load]);

  const patch = async (body: Record<string, unknown>) => {
    if (!user?.id || !id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/topography/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar.');
      setProject(data.project);
      setStatusDraft(data.project.status);
      setProgressDraft(String(data.project.progress_percent ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar.');
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (payload: ReturnType<typeof formToPayload>) => {
    if (!user?.id || !id) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/master/topography/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar.');
      setProject(data.project);
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  const archiveOrRestore = async () => {
    if (!user?.id || !project) return;
    setBusy(true);
    setError(null);
    try {
      const path = project.is_archived ? 'restore' : 'archive';
      const res = await fetch(`/api/master/topography/projects/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, status: 'PLANEJAMENTO' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na operação.');
      setProject(data.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na operação.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className={styles.page}><div className={styles.empty}>Carregando…</div></div>;
  }

  if (!project) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBanner}>{error || 'Projeto não encontrado.'}</div>
        <Link href="/master/topography/projects" className={styles.btnSecondary}>
          Voltar
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => router.push('/master/topography/projects')}
          >
            <ArrowLeft width={14} height={14} /> Voltar
          </button>
          <h1 className={styles.title}>
            {project.code} · {project.title}
          </h1>
          <p className={styles.subtitle}>
            {topographyStatusLabel(project.status)}
            {project.is_archived ? ' · Arquivado' : ''}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btnSecondary} onClick={() => setModalOpen(true)}>
            Editar
          </button>
          <button
            type="button"
            className={project.is_archived ? styles.btnPrimary : styles.btnDanger}
            disabled={busy}
            onClick={() => void archiveOrRestore()}
          >
            {project.is_archived ? 'Restaurar' : 'Arquivar'}
          </button>
        </div>
      </div>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <div className={styles.detailGrid}>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Informações gerais</h2>
          <dl className={styles.dl}>
            <dt>Cliente</dt>
            <dd>{project.client_name}</dd>
            <dt>Contato</dt>
            <dd>{project.client_contact_name || '—'}</dd>
            <dt>Telefone</dt>
            <dd>{project.client_phone || '—'}</dd>
            <dt>E-mail</dt>
            <dd>{project.client_email || '—'}</dd>
            <dt>Categoria</dt>
            <dd>{topographyCategoryLabel(project.category)}</dd>
            <dt>Serviço</dt>
            <dd>{topographyServiceTypeLabel(project.service_type)}</dd>
            <dt>Origem</dt>
            <dd>{project.origin ? topographyOriginLabel(project.origin) : '—'}</dd>
            <dt>Prioridade</dt>
            <dd>{topographyPriorityLabel(project.priority)}</dd>
            <dt>Local</dt>
            <dd>
              {[project.city, project.state].filter(Boolean).join('/') || '—'}
              {project.address ? ` · ${project.address}` : ''}
            </dd>
            <dt>Valor</dt>
            <dd>{formatCurrency(project.contract_value)}</dd>
            <dt>Situação financeira</dt>
            <dd>{topographyFinancialSituationLabel(project.financial_situation)}</dd>
            <dt>Prazo</dt>
            <dd>{formatDate(project.planned_end_date)}</dd>
            <dt>Contratação</dt>
            <dd>{formatDate(project.contract_date)}</dd>
          </dl>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Execução</h2>
          <dl className={styles.dl}>
            <dt>Progresso</dt>
            <dd>{project.progress_percent}%</dd>
            <dt>Progresso físico</dt>
            <dd>{project.physical_progress_percent}%</dd>
            <dt>Etapa</dt>
            <dd>{project.current_stage || '—'}</dd>
            <dt>Resp. interno</dt>
            <dd>{project.internal_manager || '—'}</dd>
            <dt>Resp. técnico</dt>
            <dd>{project.technical_manager || '—'}</dd>
            <dt>Próxima ação</dt>
            <dd>{project.next_action || '—'}</dd>
            <dt>Data próxima</dt>
            <dd>{formatDate(project.next_action_date)}</dd>
          </dl>

          <div className={styles.section} style={{ marginTop: '1rem' }}>
            <h3 className={styles.sectionTitle}>Alterar status</h3>
            <div className={styles.toolbar}>
              <select
                className={styles.select}
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value)}
              >
                {TOPOGRAPHY_STATUSES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={busy || statusDraft === project.status}
                onClick={() => void patch({ patchOnly: true, status: statusDraft })}
              >
                Salvar status
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Atualizar progresso</h3>
            <div className={styles.toolbar}>
              <input
                className={styles.input}
                type="number"
                min={0}
                max={100}
                value={progressDraft}
                onChange={(e) => setProgressDraft(e.target.value)}
              />
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={busy}
                onClick={() =>
                  void patch({
                    patchOnly: true,
                    progress_percent: Number(progressDraft),
                  })
                }
              >
                Salvar progresso
              </button>
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Observações</h2>
          <p className={styles.meta} style={{ whiteSpace: 'pre-wrap' }}>
            {project.technical_notes || 'Sem observações técnicas.'}
          </p>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Pendências</h2>
          <p className={styles.meta} style={{ whiteSpace: 'pre-wrap' }}>
            {project.pending_items || 'Sem pendências registradas.'}
          </p>
        </div>
      </div>

      <TopographyProjectFormModal
        open={modalOpen}
        mode="edit"
        initial={project}
        saving={busy}
        error={formError}
        onClose={() => {
          if (!busy) {
            setModalOpen(false);
            setFormError(null);
          }
        }}
        onSubmit={(payload) => void handleSave(payload)}
      />
    </div>
  );
}

export default function TopographyProjectDetailPage() {
  return (
    <MasterSuperAdminGuard>
      <TopographyProjectDetailInner />
    </MasterSuperAdminGuard>
  );
}
