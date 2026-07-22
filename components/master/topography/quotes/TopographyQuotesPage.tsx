'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LayoutGrid, List, MoreHorizontal, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import { topographyCategoryLabel, TOPOGRAPHY_CATEGORIES } from '@/lib/master/topography/categories';
import {
  topographyQuoteStatusLabel,
  topographyQuoteStatusMeta,
  TOPOGRAPHY_QUOTE_STATUSES,
} from '@/lib/master/topography/quoteStatuses';
import {
  topographyServiceTypeLabel,
  TOPOGRAPHY_SERVICE_TYPES,
} from '@/lib/master/topography/serviceTypes';
import type {
  MasterTopographyQuote,
  MasterTopographyQuoteKpis,
} from '@/lib/master/topography/quoteTypes';
import { canPermanentlyDeleteTopographyQuote } from '@/lib/master/topography/quoteDeletePolicy';
import { QuoteDeleteConfirmModal } from './QuoteDeleteConfirmModal';
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

function StatusBadge({ status }: { status: string }) {
  const meta = topographyQuoteStatusMeta(status);
  return (
    <span
      className={styles.badge}
      style={{
        background: `${meta?.color || '#64748b'}18`,
        color: meta?.color || '#64748b',
        borderColor: `${meta?.color || '#64748b'}44`,
      }}
    >
      {topographyQuoteStatusLabel(status)}
    </span>
  );
}

function QuoteActionsMenu({
  quote,
  busy,
  onArchive,
  onRestore,
  onDuplicate,
  onDelete,
}: {
  quote: MasterTopographyQuote;
  busy: boolean;
  onArchive: () => void;
  onRestore: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canDelete = canPermanentlyDeleteTopographyQuote(quote).ok;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className={styles.actionsMenuWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.btnGhost}
        aria-label="Ações"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal width={16} height={16} />
      </button>
      {open ? (
        <div className={styles.actionsMenu} role="menu">
          <Link
            href={`/master/topography/budgets/${quote.id}/edit`}
            className={styles.actionsMenuItem}
            onClick={() => setOpen(false)}
          >
            Abrir / Editar
          </Link>
          <button
            type="button"
            className={styles.actionsMenuItem}
            onClick={() => {
              setOpen(false);
              onDuplicate();
            }}
          >
            Duplicar
          </button>
          {quote.is_archived ? (
            <button
              type="button"
              className={styles.actionsMenuItem}
              onClick={() => {
                setOpen(false);
                onRestore();
              }}
            >
              Restaurar
            </button>
          ) : (
            <button
              type="button"
              className={styles.actionsMenuItem}
              onClick={() => {
                setOpen(false);
                onArchive();
              }}
            >
              Arquivar
            </button>
          )}
          {canDelete ? (
            <button
              type="button"
              className={`${styles.actionsMenuItem} ${styles.actionsMenuItemDanger}`}
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              Excluir definitivamente
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const EMPTY_KPIS: MasterTopographyQuoteKpis = {
  active: 0,
  inNegotiation: 0,
  approved: 0,
  refused: 0,
  totalQuotedValue: 0,
  totalApprovedValue: 0,
  approvalRate: 0,
};

function QuotesInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const openNew = searchParams.get('new') === '1';

  const [view, setView] = useState<'cards' | 'table'>(() => {
    if (typeof window === 'undefined') return 'cards';
    try {
      const saved = localStorage.getItem('master_topo_quotes_view');
      if (saved === 'table' || saved === 'cards') return saved;
    } catch {
      /* ignore */
    }
    return 'cards';
  });
  const [quotes, setQuotes] = useState<MasterTopographyQuote[]>([]);
  const [kpis, setKpis] = useState<MasterTopographyQuoteKpis>(EMPTY_KPIS);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(12);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [city, setCity] = useState('');
  const [manager, setManager] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [rowBusy, setRowBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MasterTopographyQuote | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    try {
      localStorage.setItem('master_topo_quotes_view', view);
    } catch {
      /* ignore */
    }
  }, [view]);

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
      if (status) params.set('status', status);
      if (category) params.set('category', category);
      if (serviceType) params.set('serviceType', serviceType);
      if (city.trim()) params.set('city', city.trim());
      if (manager.trim()) params.set('manager', manager.trim());
      if (includeArchived) params.set('includeArchived', '1');

      const res = await fetch(`/api/master/topography/quotes?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar orçamentos.');
      setQuotes(data.quotes || []);
      setTotal(data.total || 0);
      setKpis(data.kpis || EMPTY_KPIS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar.');
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }, [
    user,
    page,
    limit,
    qDebounced,
    status,
    category,
    serviceType,
    city,
    manager,
    includeArchived,
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleCreate = useCallback(async () => {
    if (!user?.id || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/master/topography/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          client_name: 'Cliente a definir',
          title: 'Novo orçamento',
          category: 'TOPOGRAFIA',
          service_type: 'LEVANTAMENTO_TOPOGRAFICO',
          status: 'RASCUNHO',
          bdi_percent: 0,
          discount_percent: 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao criar.');
      if (data.quote?.id) {
        router.push(`/master/topography/budgets/${data.quote.id}/edit`);
        return;
      }
      throw new Error('Resposta inválida ao criar orçamento.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar.');
      setCreating(false);
    }
  }, [user, creating, router]);

  const creatingFromQuery = useRef(false);

  const runRowAction = async (quoteId: string, path: string) => {
    if (!user?.id) return;
    setRowBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/topography/quotes/${quoteId}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na operação.');
      if (path === 'duplicate' && data.quote?.id) {
        router.push(`/master/topography/budgets/${data.quote.id}/edit`);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na operação.');
    } finally {
      setRowBusy(false);
    }
  };

  const handleHardDelete = async (typedCode: string) => {
    if (!user?.id || !deleteTarget) return;
    setRowBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/master/topography/quotes/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, confirmationCode: typedCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao excluir.');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Falha ao excluir.');
    } finally {
      setRowBusy(false);
    }
  };

  useEffect(() => {
    if (!openNew || !user?.id || creatingFromQuery.current) return;
    creatingFromQuery.current = true;
    router.replace('/master/topography/budgets');
    void handleCreate();
  }, [openNew, user, router, handleCreate]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Orçamentos</h1>
          <p className={styles.subtitle}>
            Ambiente profissional de orçamentação da SV Topografia &amp; Projetos — etapas, itens e
            BDI.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btnSecondary} onClick={() => void load()}>
            <RefreshCw width={14} height={14} />
            Atualizar
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={creating}
            onClick={() => void handleCreate()}
          >
            <Plus width={14} height={14} />
            {creating ? 'Criando…' : 'Novo Orçamento'}
          </button>
        </div>
      </div>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <section className={styles.kpiRow} aria-label="Indicadores">
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Orçamentos ativos</p>
          <p className={styles.kpiValue}>{kpis.active}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Em negociação</p>
          <p className={styles.kpiValue}>{kpis.inNegotiation}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Aprovados</p>
          <p className={styles.kpiValue}>{kpis.approved}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Recusados</p>
          <p className={styles.kpiValue}>{kpis.refused}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Valor total orçado</p>
          <p className={styles.kpiValue} style={{ fontSize: '0.95rem' }}>
            {formatCurrency(kpis.totalQuotedValue)}
          </p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Valor aprovado</p>
          <p className={styles.kpiValue} style={{ fontSize: '0.95rem' }}>
            {formatCurrency(kpis.totalApprovedValue)}
          </p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Taxa de aprovação</p>
          <p className={styles.kpiValue}>{kpis.approvalRate.toLocaleString('pt-BR')}%</p>
        </div>
      </section>

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder="Buscar código, cliente ou contato…"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          className={styles.select}
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">Status</option>
          {TOPOGRAPHY_QUOTE_STATUSES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={category}
          onChange={(e) => {
            setPage(1);
            setCategory(e.target.value);
          }}
        >
          <option value="">Categoria</option>
          {TOPOGRAPHY_CATEGORIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={serviceType}
          onChange={(e) => {
            setPage(1);
            setServiceType(e.target.value);
          }}
        >
          <option value="">Serviço</option>
          {TOPOGRAPHY_SERVICE_TYPES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          className={styles.input}
          placeholder="Município"
          value={city}
          onChange={(e) => {
            setPage(1);
            setCity(e.target.value);
          }}
        />
        <input
          className={styles.input}
          placeholder="Responsável"
          value={manager}
          onChange={(e) => {
            setPage(1);
            setManager(e.target.value);
          }}
        />
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => {
              setPage(1);
              setIncludeArchived(e.target.checked);
            }}
          />
          Incluir arquivados
        </label>
        <div className={styles.viewToggle}>
          <button type="button" data-active={view === 'cards'} onClick={() => setView('cards')}>
            <LayoutGrid width={14} height={14} />
          </button>
          <button type="button" data-active={view === 'table'} onClick={() => setView('table')}>
            <List width={14} height={14} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.empty}>Carregando orçamentos…</div>
      ) : quotes.length === 0 ? (
        <div className={styles.empty}>Nenhum orçamento encontrado.</div>
      ) : view === 'cards' ? (
        <div className={styles.cardGrid}>
          {quotes.map((item) => (
            <article key={item.id} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.code}>{item.code}</span>
                <StatusBadge status={item.status} />
              </div>
              <h3 className={styles.cardTitle}>{item.title || item.client_name}</h3>
              <p className={styles.meta}>{item.client_name}</p>
              <p className={styles.meta}>
                {topographyCategoryLabel(item.category)} ·{' '}
                {topographyServiceTypeLabel(item.service_type)}
              </p>
              <p className={styles.meta}>
                {[item.city, item.state].filter(Boolean).join('/') || 'Local não informado'}
              </p>
              <p className={styles.meta}>
                Valor: {formatCurrency(item.final_value ?? item.estimated_value)}
              </p>
              <p className={styles.meta}>BDI: {(item.bdi_percent ?? 0).toLocaleString('pt-BR')}%</p>
              <p className={styles.meta}>Validade: {formatDate(item.expiration_date)}</p>
              <div className={styles.headerActions}>
                <Link
                  href={`/master/topography/budgets/${item.id}/edit`}
                  className={styles.btnGhost}
                >
                  Abrir editor →
                </Link>
                <QuoteActionsMenu
                  quote={item}
                  busy={rowBusy}
                  onArchive={() => void runRowAction(item.id, 'archive')}
                  onRestore={() => void runRowAction(item.id, 'restore')}
                  onDuplicate={() => void runRowAction(item.id, 'duplicate')}
                  onDelete={() => {
                    setDeleteError(null);
                    setDeleteTarget(item);
                  }}
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Título</th>
                <th>Cliente</th>
                <th>Categoria</th>
                <th>Status</th>
                <th>BDI</th>
                <th>Valor</th>
                <th>Validade</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((item) => (
                <tr key={item.id}>
                  <td>{item.code}</td>
                  <td>{item.title || '—'}</td>
                  <td>{item.client_name}</td>
                  <td>{topographyCategoryLabel(item.category)}</td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>{(item.bdi_percent ?? 0).toLocaleString('pt-BR')}%</td>
                  <td>{formatCurrency(item.final_value ?? item.estimated_value)}</td>
                  <td>{formatDate(item.expiration_date)}</td>
                  <td>
                    <QuoteActionsMenu
                      quote={item}
                      busy={rowBusy}
                      onArchive={() => void runRowAction(item.id, 'archive')}
                      onRestore={() => void runRowAction(item.id, 'restore')}
                      onDuplicate={() => void runRowAction(item.id, 'duplicate')}
                      onDelete={() => {
                        setDeleteError(null);
                        setDeleteTarget(item);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.pagination}>
        <span>
          {total} registro(s) · página {page} de {totalPages}
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

      <QuoteDeleteConfirmModal
        key={deleteTarget?.id || 'closed'}
        open={Boolean(deleteTarget)}
        code={deleteTarget?.code || ''}
        busy={rowBusy}
        error={deleteError}
        onClose={() => {
          if (!rowBusy) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={(typed) => void handleHardDelete(typed)}
      />
    </div>
  );
}

export default function TopographyQuotesPage() {
  return (
    <MasterSuperAdminGuard>
      <Suspense fallback={<div className={styles.empty}>Carregando…</div>}>
        <QuotesInner />
      </Suspense>
    </MasterSuperAdminGuard>
  );
}
