'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import { topographyCategoryLabel } from '@/lib/master/topography/categories';
import {
  topographyQuoteStatusLabel,
  TOPOGRAPHY_QUOTE_STATUSES,
} from '@/lib/master/topography/quoteStatuses';
import { topographyServiceTypeLabel } from '@/lib/master/topography/serviceTypes';
import type { MasterTopographyQuote } from '@/lib/master/topography/quoteTypes';
import {
  TopographyQuoteFormModal,
  formToQuotePayload,
} from './TopographyQuoteFormModal';
import styles from '../projects/topographyProjects.module.css';

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

function DetailInner() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');

  const [quote, setQuote] = useState<MasterTopographyQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/master/topography/quotes/${id}?userId=${encodeURIComponent(user.id)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar.');
      setQuote(data.quote);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar.');
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleSave = async (payload: ReturnType<typeof formToQuotePayload>) => {
    if (!user?.id || !id) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/master/topography/quotes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar.');
      setQuote(data.quote);
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  const postAction = async (path: string, body: Record<string, unknown> = {}) => {
    if (!user?.id || !id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/topography/quotes/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na operação.');
      if (path === 'convert') {
        setQuote(data.quote);
        if (data.projectId) {
          router.push(`/master/topography/projects/${data.projectId}`);
        }
        return;
      }
      if (path === 'duplicate' && data.quote?.id) {
        router.push(`/master/topography/budgets/${data.quote.id}`);
        return;
      }
      setQuote(data.quote);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na operação.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>Carregando…</div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBanner}>{error || 'Orçamento não encontrado.'}</div>
        <Link href="/master/topography/budgets" className={styles.btnSecondary}>
          Voltar
        </Link>
      </div>
    );
  }

  const canConvert =
    !quote.is_archived &&
    !quote.converted_project_id &&
    quote.status !== 'CONVERTIDO' &&
    quote.status !== 'RECUSADO' &&
    quote.status !== 'CANCELADO' &&
    quote.status !== 'EXPIRADO';

  const canEdit = quote.status !== 'CONVERTIDO' && !quote.converted_project_id;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => router.push('/master/topography/budgets')}
          >
            <ArrowLeft width={14} height={14} /> Voltar
          </button>
          <h1 className={styles.title}>
            {quote.code} · {quote.client_name}
          </h1>
          <p className={styles.subtitle}>
            {topographyQuoteStatusLabel(quote.status)}
            {quote.is_archived ? ' · Arquivado' : ''}
          </p>
        </div>
        <div className={styles.headerActions}>
          {canEdit ? (
            <button type="button" className={styles.btnSecondary} onClick={() => setModalOpen(true)}>
              Editar
            </button>
          ) : null}
          <button
            type="button"
            className={styles.btnSecondary}
            disabled={busy}
            onClick={() => void postAction('duplicate')}
          >
            Duplicar
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => window.alert('Gerar PDF — Em desenvolvimento')}
          >
            Gerar PDF
          </button>
          {canConvert ? (
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={busy}
              onClick={() => {
                if (window.confirm('Converter este orçamento em projeto?')) {
                  void postAction('convert');
                }
              }}
            >
              Converter em Projeto
            </button>
          ) : null}
          <button
            type="button"
            className={quote.is_archived ? styles.btnPrimary : styles.btnDanger}
            disabled={busy}
            onClick={() => void postAction(quote.is_archived ? 'restore' : 'archive')}
          >
            {quote.is_archived ? 'Restaurar' : 'Arquivar'}
          </button>
        </div>
      </div>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      {quote.converted_project_id ? (
        <div className={styles.panel} style={{ marginBottom: '0.85rem' }}>
          Convertido em projeto.{' '}
          <Link href={`/master/topography/projects/${quote.converted_project_id}`} className={styles.btnGhost}>
            Abrir projeto →
          </Link>
        </div>
      ) : null}

      <div className={styles.detailGrid}>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Cliente e serviço</h2>
          <dl className={styles.dl}>
            <dt>Cliente</dt>
            <dd>{quote.client_name}</dd>
            <dt>Contato</dt>
            <dd>{quote.contact_name || '—'}</dd>
            <dt>Telefone</dt>
            <dd>{quote.phone || '—'}</dd>
            <dt>E-mail</dt>
            <dd>{quote.email || '—'}</dd>
            <dt>Categoria</dt>
            <dd>{topographyCategoryLabel(quote.category)}</dd>
            <dt>Serviço</dt>
            <dd>{topographyServiceTypeLabel(quote.service_type)}</dd>
            <dt>Local</dt>
            <dd>
              {[quote.city, quote.state].filter(Boolean).join('/') || '—'}
              {quote.address ? ` · ${quote.address}` : ''}
            </dd>
            <dt>Status</dt>
            <dd>{topographyQuoteStatusLabel(quote.status)}</dd>
            <dt>Responsável</dt>
            <dd>{quote.internal_manager || '—'}</dd>
          </dl>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Resumo financeiro</h2>
          <dl className={styles.dl}>
            <dt>Valor estimado</dt>
            <dd>{formatCurrency(quote.estimated_value)}</dd>
            <dt>Desconto</dt>
            <dd>{formatCurrency(quote.discount_value)}</dd>
            <dt>Valor final</dt>
            <dd>{formatCurrency(quote.final_value)}</dd>
            <dt>Forma de pagamento</dt>
            <dd>{quote.payment_method || '—'}</dd>
            <dt>Condições</dt>
            <dd>{quote.payment_terms || '—'}</dd>
            <dt>Proposta</dt>
            <dd>{formatDate(quote.proposal_date)}</dd>
            <dt>Validade</dt>
            <dd>{formatDate(quote.expiration_date)}</dd>
            <dt>Prazo estimado</dt>
            <dd>{quote.estimated_deadline || '—'}</dd>
          </dl>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Descrição</h2>
          <p className={styles.meta} style={{ whiteSpace: 'pre-wrap' }}>
            {quote.description || 'Sem descrição.'}
          </p>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Observações técnicas</h2>
          <p className={styles.meta} style={{ whiteSpace: 'pre-wrap' }}>
            {quote.technical_notes || '—'}
          </p>
          <h2 className={styles.panelTitle} style={{ marginTop: '1rem' }}>
            Notas internas
          </h2>
          <p className={styles.meta} style={{ whiteSpace: 'pre-wrap' }}>
            {quote.internal_notes || '—'}
          </p>
          <h2 className={styles.panelTitle} style={{ marginTop: '1rem' }}>
            Histórico
          </h2>
          <dl className={styles.dl}>
            <dt>Criado em</dt>
            <dd>{formatDate(quote.created_at)}</dd>
            <dt>Atualizado em</dt>
            <dd>{formatDate(quote.updated_at)}</dd>
            <dt>Aprovado em</dt>
            <dd>{formatDate(quote.approved_at)}</dd>
            <dt>Status possíveis</dt>
            <dd>{TOPOGRAPHY_QUOTE_STATUSES.map((s) => s.label).join(' · ')}</dd>
          </dl>
        </div>
      </div>

      {canEdit ? (
        <TopographyQuoteFormModal
          open={modalOpen}
          mode="edit"
          initial={quote}
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
      ) : null}
    </div>
  );
}

export default function TopographyQuoteDetailPage() {
  return (
    <MasterSuperAdminGuard>
      <DetailInner />
    </MasterSuperAdminGuard>
  );
}
