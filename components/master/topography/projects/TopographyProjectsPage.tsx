'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LayoutGrid, List, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import { topographyCategoryLabel } from '@/lib/master/topography/categories';
import { TOPOGRAPHY_CATEGORIES } from '@/lib/master/topography/categories';
import { topographyPriorityColor, topographyPriorityLabel, TOPOGRAPHY_PRIORITIES } from '@/lib/master/topography/priorities';
import { topographyServiceTypeLabel, TOPOGRAPHY_SERVICE_TYPES } from '@/lib/master/topography/serviceTypes';
import { topographyStatusLabel, topographyStatusMeta, TOPOGRAPHY_STATUSES } from '@/lib/master/topography/statuses';
import type {
  MasterTopographyProject,
  MasterTopographyProjectKpis,
} from '@/lib/master/topography/types';
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

function StatusBadge({ status }: { status: string }) {
  const meta = topographyStatusMeta(status);
  return (
    <span
      className={styles.badge}
      style={{
        background: `${meta?.color || '#64748b'}18`,
        color: meta?.color || '#64748b',
        borderColor: `${meta?.color || '#64748b'}44`,
      }}
    >
      {topographyStatusLabel(status)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const color = topographyPriorityColor(priority);
  return (
    <span
      className={styles.badge}
      style={{ background: `${color}14`, color, borderColor: `${color}33` }}
    >
      {topographyPriorityLabel(priority)}
    </span>
  );
}

const EMPTY_KPIS: MasterTopographyProjectKpis = {
  active: 0,
  inField: 0,
  inProcessing: 0,
  overdue: 0,
  completedThisMonth: 0,
  activeContractValue: 0,
};

function TopographyProjectsInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const openNew = searchParams.get('new') === '1';

  const [view, setView] = useState<'cards' | 'table'>(() => {
    if (typeof window === 'undefined') return 'cards';
    try {
      const saved = localStorage.getItem('master_topo_projects_view');
      if (saved === 'table' || saved === 'cards') return saved;
    } catch {
      /* ignore */
    }
    return 'cards';
  });
  const [projects, setProjects] = useState<MasterTopographyProject[]>([]);
  const [kpis, setKpis] = useState<MasterTopographyProjectKpis>(EMPTY_KPIS);
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
  const [priority, setPriority] = useState('');
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
      localStorage.setItem('master_topo_projects_view', view);
    } catch {
      /* ignore */
    }
  }, [view]);

  useEffect(() => {
    if (openNew) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deep-link ?new=1
      setModalOpen(true);
      router.replace('/master/topography/projects');
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
      if (priority) params.set('priority', priority);
      if (city.trim()) params.set('city', city.trim());
      if (manager.trim()) params.set('manager', manager.trim());
      if (includeArchived) params.set('includeArchived', '1');

      const res = await fetch(`/api/master/topography/projects?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar projetos.');
      setProjects(data.projects || []);
      setTotal(data.total || 0);
      setKpis(data.kpis || EMPTY_KPIS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar.');
      setProjects([]);
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
    priority,
    city,
    manager,
    includeArchived,
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial / filtros
    void load();
  }, [load]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const handleCreate = async (payload: ReturnType<typeof formToPayload>) => {
    if (!user?.id) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/master/topography/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao criar.');
      setModalOpen(false);
      await load();
      if (data.project?.id) {
        router.push(`/master/topography/projects/${data.project.id}`);
      }
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
          <h1 className={styles.title}>Projetos e Serviços</h1>
          <p className={styles.subtitle}>
            Cadastro operacional da SV Topografia &amp; Projetos — isolado do SaaS das
            loteadoras.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btnSecondary} onClick={() => void load()}>
            <RefreshCw width={14} height={14} />
            Atualizar
          </button>
          <button type="button" className={styles.btnPrimary} onClick={() => setModalOpen(true)}>
            <Plus width={14} height={14} />
            Novo Projeto / Serviço
          </button>
        </div>
      </div>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <section className={styles.kpiRow} aria-label="Indicadores">
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Projetos ativos</p>
          <p className={styles.kpiValue}>{kpis.active}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Em campo</p>
          <p className={styles.kpiValue}>{kpis.inField}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Em processamento</p>
          <p className={styles.kpiValue}>{kpis.inProcessing}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Projetos em atraso</p>
          <p className={styles.kpiValue}>{kpis.overdue}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Concluídos no mês</p>
          <p className={styles.kpiValue}>{kpis.completedThisMonth}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Valor contratado ativo</p>
          <p className={styles.kpiValue} style={{ fontSize: '0.95rem' }}>
            {formatCurrency(kpis.activeContractValue)}
          </p>
        </div>
      </section>

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder="Buscar código, projeto ou cliente…"
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
          {TOPOGRAPHY_STATUSES.map((s) => (
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
        <select
          className={styles.select}
          value={priority}
          onChange={(e) => {
            setPage(1);
            setPriority(e.target.value);
          }}
        >
          <option value="">Prioridade</option>
          {TOPOGRAPHY_PRIORITIES.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label}
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
          <button
            type="button"
            data-active={view === 'cards'}
            onClick={() => setView('cards')}
            aria-label="Cards"
          >
            <LayoutGrid width={14} height={14} />
          </button>
          <button
            type="button"
            data-active={view === 'table'}
            onClick={() => setView('table')}
            aria-label="Tabela"
          >
            <List width={14} height={14} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.empty}>Carregando projetos…</div>
      ) : projects.length === 0 ? (
        <div className={styles.empty}>
          Nenhum projeto encontrado. Clique em “Novo Projeto / Serviço” para cadastrar.
        </div>
      ) : view === 'cards' ? (
        <div className={styles.cardGrid}>
          {projects.map((p) => (
            <article key={p.id} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.code}>{p.code}</span>
                <PriorityBadge priority={p.priority} />
              </div>
              <h3 className={styles.cardTitle}>{p.title}</h3>
              <p className={styles.meta}>{p.client_name}</p>
              <p className={styles.meta}>
                {topographyCategoryLabel(p.category)} · {topographyServiceTypeLabel(p.service_type)}
              </p>
              <p className={styles.meta}>
                {[p.city, p.state].filter(Boolean).join('/') || 'Local não informado'}
              </p>
              <div className={styles.badgeRow}>
                <StatusBadge status={p.status} />
              </div>
              <div>
                <p className={styles.meta}>Progresso {p.progress_percent}%</p>
                <div className={styles.progressWrap}>
                  <div className={styles.progressBar} style={{ width: `${p.progress_percent}%` }} />
                </div>
              </div>
              <p className={styles.meta}>Valor: {formatCurrency(p.contract_value)}</p>
              <p className={styles.meta}>Prazo: {formatDate(p.planned_end_date)}</p>
              <p className={styles.meta}>Resp.: {p.internal_manager || '—'}</p>
              <Link href={`/master/topography/projects/${p.id}`} className={styles.btnGhost}>
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
                <th>Projeto</th>
                <th>Cliente</th>
                <th>Categoria</th>
                <th>Serviço</th>
                <th>Cidade</th>
                <th>Status</th>
                <th>Progresso</th>
                <th>Valor</th>
                <th>Prazo</th>
                <th>Responsável</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>{p.code}</td>
                  <td>{p.title}</td>
                  <td>{p.client_name}</td>
                  <td>{topographyCategoryLabel(p.category)}</td>
                  <td>{topographyServiceTypeLabel(p.service_type)}</td>
                  <td>{[p.city, p.state].filter(Boolean).join('/') || '—'}</td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td>{p.progress_percent}%</td>
                  <td>{formatCurrency(p.contract_value)}</td>
                  <td>{formatDate(p.planned_end_date)}</td>
                  <td>{p.internal_manager || '—'}</td>
                  <td>
                    <Link href={`/master/topography/projects/${p.id}`} className={styles.btnGhost}>
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

      <TopographyProjectFormModal
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

export default function TopographyProjectsPage() {
  return (
    <MasterSuperAdminGuard>
      <TopographyProjectsInner />
    </MasterSuperAdminGuard>
  );
}
