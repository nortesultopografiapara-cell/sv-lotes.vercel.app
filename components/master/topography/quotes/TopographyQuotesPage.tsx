'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LayoutGrid, List, Plus, RefreshCw } from 'lucide-react';
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
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [city, setCity] = useState('');
  const [manager, setManager] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  useEffect(() => {
    if (openNew) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModalOpen(true);
      router.replace('/master/topography/budgets');
    }
  }, [openNew, router]);

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

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const handleCreate = async (payload: ReturnType<typeof formToQuotePayload>) => {
    if (!user?.id) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/master/topography/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao criar.');
      setModalOpen(false);
      await load();
      if (data.quote?.id) router.push(`/master/topography/budgets/${data.quote.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Orçamentos</h1>
          <p className={styles.subtitle}>
            Propostas comerciais da SV Topografia &amp; Projetos — conversão em projeto após
            aprovação.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btnSecondary} onClick={() => void load()}>
            <RefreshCw width={14} height={14} />
            Atualizar
          </button>
          <button type="button" className={styles.btnPrimary} onClick={() => setModalOpen(true)}>
            <Plus width={14} height={14} />
            Novo Orçamento
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
          {quotes.map((q) => (
            <article key={q.id} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.code}>{q.code}</span>
                <StatusBadge status={q.status} />
              </div>
              <h3 className={styles.cardTitle}>{q.client_name}</h3>
              <p className={styles.meta}>
                {topographyCategoryLabel(q.category)} · {topographyServiceTypeLabel(q.service_type)}
              </p>
              <p className={styles.meta}>
                {[q.city, q.state].filter(Boolean).join('/') || 'Local não informado'}
              </p>
              <p className={styles.meta}>Valor: {formatCurrency(q.final_value ?? q.estimated_value)}</p>
              <p className={styles.meta}>Validade: {formatDate(q.expiration_date)}</p>
              <p className={styles.meta}>Resp.: {q.internal_manager || '—'}</p>
              <Link href={`/master/topography/budgets/${q.id}`} className={styles.btnGhost}>
                Abrir detalhes →
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente</th>
                <th>Categoria</th>
                <th>Serviço</th>
                <th>Cidade</th>
                <th>Status</th>
                <th>Valor</th>
                <th>Validade</th>
                <th>Responsável</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td>{q.code}</td>
                  <td>{q.client_name}</td>
                  <td>{topographyCategoryLabel(q.category)}</td>
                  <td>{topographyServiceTypeLabel(q.service_type)}</td>
                  <td>{[q.city, q.state].filter(Boolean).join('/') || '—'}</td>
                  <td>
                    <StatusBadge status={q.status} />
                  </td>
                  <td>{formatCurrency(q.final_value ?? q.estimated_value)}</td>
                  <td>{formatDate(q.expiration_date)}</td>
                  <td>{q.internal_manager || '—'}</td>
                  <td>
                    <Link href={`/master/topography/budgets/${q.id}`} className={styles.btnGhost}>
                      Abrir
                    </Link>
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

      <TopographyQuoteFormModal
        open={modalOpen}
        mode="create"
        saving={saving}
        error={formError}
        onClose={() => {
          if (!saving) {
            setModalOpen(false);
            setFormError(null);
          }
        }}
        onSubmit={(payload) => void handleCreate(payload)}
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
