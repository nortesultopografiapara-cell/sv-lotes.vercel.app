'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import { MasterSecureDeleteModal } from '@/components/master/MasterSecureDeleteModal';
import {
  CorporateFinanceSemanticBadge,
  CorporateFinanceSemanticKpi,
} from '@/components/master/corporateFinance/CorporateFinanceSemantic';
import type { ProjectCorporateFinancialSummary } from '@/lib/master/corporateFinance/projectReceivedBridge';
import {
  formatProjectDeleteLinks,
  projectDeleteHasLinks,
  type ProjectDeleteLinkSummary,
} from '@/lib/master/corporateFinance/secureDeletePolicy';
import {
  receivedSourceLabel,
  semanticToneForResult,
  semanticToneForSignedAmount,
} from '@/lib/master/corporateFinance/semantic';
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
  const [finance, setFinance] = useState<ProjectCorporateFinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState('');
  const [progressDraft, setProgressDraft] = useState('0');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteCascade, setDeleteCascade] = useState(false);
  const [deleteLinks, setDeleteLinks] = useState<ProjectDeleteLinkSummary | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
      setFinance(data.financialSummary || null);
      setStatusDraft(data.project.status);
      setProgressDraft(String(data.project.progress_percent ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar.');
      setProject(null);
      setFinance(null);
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

  const openSecureDelete = async () => {
    if (!user?.id || !project) return;
    setDeleteError(null);
    setDeleteCascade(false);
    setDeleteLinks(null);
    setDeleteBusy(true);
    try {
      const res = await fetch(
        `/api/master/topography/projects/${id}/delete?userId=${encodeURIComponent(user.id)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao inspecionar vínculos.');
      setDeleteLinks(data.links || null);
      setDeleteOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao preparar exclusão.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const confirmSecureDelete = async (confirmWord: string) => {
    if (!user?.id || !project) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/master/topography/projects/${id}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          confirmWord,
          cascadeLinks: deleteCascade,
          reason: 'Exclusão segura via Painel Executivo',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao excluir projeto.');
      setToast(data.message || `Projeto ${project.code} excluído.`);
      setDeleteOpen(false);
      setTimeout(() => router.push('/master/topography/projects'), 900);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Erro ao excluir.');
    } finally {
      setDeleteBusy(false);
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
          <button
            type="button"
            className={styles.btnDanger}
            disabled={busy || deleteBusy}
            onClick={() => void openSecureDelete()}
          >
            Excluir Projeto
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <h2 className={styles.panelTitle} style={{ margin: 0, flex: 1 }}>
              Resumo Financeiro
            </h2>
            {finance ? (
              <CorporateFinanceSemanticBadge
                tone={finance.received_source === 'CORPORATE_FINANCE' ? 'received' : 'neutral'}
              >
                {receivedSourceLabel(finance.received_source)}
              </CorporateFinanceSemanticBadge>
            ) : null}
          </div>

          {finance ? (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: '0.75rem',
                  marginTop: '1rem',
                }}
              >
                <CorporateFinanceSemanticKpi
                  label="Contratado"
                  value={formatCurrency(finance.contract_value)}
                  tone="neutral"
                />
                <CorporateFinanceSemanticKpi
                  label="Recebido"
                  value={formatCurrency(finance.received)}
                  tone="received"
                  hint={
                    finance.received_source === 'CORPORATE_FINANCE'
                      ? 'Σ entradas corporativas'
                      : 'valor_recebido legado'
                  }
                />
                <CorporateFinanceSemanticKpi
                  label="A receber"
                  value={formatCurrency(finance.open_receivable)}
                  tone="open"
                />
                <CorporateFinanceSemanticKpi
                  label="Provisionado"
                  value={formatCurrency(finance.provisioned)}
                  tone="partial"
                />
                <CorporateFinanceSemanticKpi
                  label="Não provisionado"
                  value={formatCurrency(finance.unprovisioned)}
                  tone="alert"
                />
                <CorporateFinanceSemanticKpi
                  label="Despesas"
                  value={formatCurrency(finance.expenses)}
                  tone="expense"
                />
                <CorporateFinanceSemanticKpi
                  label="Resultado"
                  value={formatCurrency(finance.result)}
                  tone={semanticToneForResult(finance.result)}
                />
                <CorporateFinanceSemanticKpi
                  label="Margem"
                  value={`${finance.margin_percent.toLocaleString('pt-BR')}%`}
                  tone={semanticToneForResult(finance.result)}
                />
                <CorporateFinanceSemanticKpi
                  label="% financeiro"
                  value={`${finance.financial_percent.toLocaleString('pt-BR')}%`}
                  tone="balance"
                />
                <CorporateFinanceSemanticKpi
                  label="Saldo realizado"
                  value={formatCurrency(finance.realized_balance)}
                  tone={semanticToneForSignedAmount(finance.realized_balance)}
                />
                <CorporateFinanceSemanticKpi
                  label="Saldo previsto"
                  value={formatCurrency(finance.predicted_balance)}
                  tone="open"
                />
                <CorporateFinanceSemanticKpi
                  label="A pagar"
                  value={formatCurrency(finance.open_payable)}
                  tone="expense"
                />
              </div>
              <dl className={styles.dl} style={{ marginTop: '1rem' }}>
                <dt>Último recebimento</dt>
                <dd>{formatDate(finance.last_receipt_at)}</dd>
                <dt>Último pagamento</dt>
                <dd>{formatDate(finance.last_payment_at)}</dd>
                {finance.received_source === 'CORPORATE_FINANCE' ? (
                  <>
                    <dt>Legado (coluna)</dt>
                    <dd>{formatCurrency(finance.legacy_valor_recebido)}</dd>
                  </>
                ) : null}
              </dl>
              <div className={styles.financeBarWrap} aria-label="Percentual financeiro">
                <div
                  className={styles.financeBarFill}
                  style={{
                    width: `${Math.min(100, Math.max(0, finance.financial_percent))}%`,
                  }}
                />
              </div>
              <p className={styles.financeBarLabel}>
                {finance.financial_percent.toLocaleString('pt-BR')}%
              </p>
            </>
          ) : (
            <dl className={styles.dl}>
              <dt>Valor contratado</dt>
              <dd>{formatCurrency(project.contract_value)}</dd>
              <dt>Recebido</dt>
              <dd>{formatCurrency(project.received_effective ?? project.valor_recebido)}</dd>
              <dt>Saldo</dt>
              <dd>{formatCurrency(project.saldo_receber)}</dd>
            </dl>
          )}

          <div style={{ marginTop: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <Link
              href={`/master/corporate-finance/receivables?projectId=${project.id}&new=1`}
              className={styles.btnPrimary}
            >
              Nova conta a receber
            </Link>
            <Link
              href={`/master/corporate-finance/payables?projectId=${project.id}&new=1`}
              className={styles.btnSecondary}
            >
              Nova conta a pagar
            </Link>
            <Link href="/master/corporate-finance/cash-flow" className={styles.btnSecondary}>
              Abrir fluxo de caixa
            </Link>
            <Link
              href={`/master/corporate-finance/receivables?projectId=${project.id}`}
              className={styles.btnSecondary}
            >
              Histórico a receber
            </Link>
            <Link
              href={`/master/corporate-finance/payables?projectId=${project.id}`}
              className={styles.btnSecondary}
            >
              Histórico a pagar
            </Link>
          </div>
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

      <MasterSecureDeleteModal
        open={deleteOpen}
        title="Excluir Projeto"
        recordLabel={`${project.code} — ${project.title}`}
        amountLabel={formatCurrency(project.contract_value)}
        linksWarning={
          deleteLinks && projectDeleteHasLinks(deleteLinks)
            ? `Vínculos detectados: ${formatProjectDeleteLinks(deleteLinks).join(', ')}. Marque a opção de cascata para remover também esses vínculos corporativos.`
            : 'Nenhum vínculo financeiro/orçamento detectado. A exclusão remove apenas o projeto.'
        }
        cascadeOption={
          deleteLinks && projectDeleteHasLinks(deleteLinks)
            ? {
                label: 'Excluir também vínculos corporativos (contas, orçamentos, caixa, Asaas)',
                checked: deleteCascade,
                onChange: setDeleteCascade,
              }
            : null
        }
        busy={deleteBusy}
        error={deleteError}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteOpen(false);
          setDeleteError(null);
        }}
        onConfirm={(word) => void confirmSecureDelete(word)}
      />

      {toast ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            zIndex: 80,
            maxWidth: 420,
            padding: '0.85rem 1rem',
            borderRadius: 10,
            background: '#0f172a',
            color: '#f8fafc',
            fontSize: 13,
            boxShadow: '0 10px 30px rgba(15,23,42,0.35)',
          }}
        >
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

export default function TopographyProjectDetailPage() {
  return (
    <MasterSuperAdminGuard>
      <TopographyProjectDetailInner />
    </MasterSuperAdminGuard>
  );
}
