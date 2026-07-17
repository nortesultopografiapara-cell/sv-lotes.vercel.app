'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  FileSignature,
  FileText,
  Handshake,
  Loader2,
  Search,
  ShoppingBag,
  X,
} from 'lucide-react';
import { FinanceStatCard } from '@/components/finance/FinancePremiumUI';
import {
  MOBILE_CONTENT_PAD_BOTTOM_CLASS,
  SV_MODAL_BODY_CLASS,
  SV_MODAL_HEADER_CLASS,
  SV_MODAL_OVERLAY_CLASS,
  SV_MODAL_SHELL_CLASS,
  SV_PAGE_MOBILE_CLASS,
} from '@/lib/mobileLayout';
import type {
  MySalesDetail,
  MySalesListItem,
  MySalesListResponse,
  MySalesListTab,
} from '@/lib/broker/mySalesTypes';

const FILTER_INPUT =
  'mt-1 w-full min-h-11 rounded-lg border border-[var(--border-color)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--text-primary)]';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('pt-BR');
}

function statusBadgeInput(item: MySalesListItem): string {
  const key = item.statusKey.toLowerCase();
  if (key === 'cancelado' || key === 'cancelada') return 'cancelado';
  if (key === 'assinado') return 'assinado';
  if (key === 'convertida') return 'convertida';
  if (key === 'sem_contrato') return 'sem_contrato';
  if (key === 'indisponivel') return 'indisponivel';
  if (key === 'ativa' || key === 'contrato_pendente') return 'pendente';
  if (key === 'expirada') return 'atrasado';
  return 'pendente';
}

function MySalesStatusBadge({ item }: { item: MySalesListItem }) {
  const s = statusBadgeInput(item);
  let cls =
    'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border';
  let label = 'DESCONHECIDO';

  if (s === 'assinado') {
    cls += ' border-emerald-500/35 bg-emerald-500/12 text-emerald-400';
    label = 'ASSINADO';
  } else if (s === 'convertida' || s === 'pago') {
    cls += ' border-emerald-500/35 bg-emerald-500/12 text-emerald-400';
    label = 'CONVERTIDA';
  } else if (s === 'pendente') {
    cls += ' border-amber-400/35 bg-amber-400/10 text-amber-300';
    label = 'PENDENTE';
  } else if (s === 'sem_contrato') {
    cls += ' border-[var(--border-color)] bg-[var(--bg-card-alt)] text-[var(--text-secondary)]';
    label = 'SEM CONTRATO';
  } else if (s === 'atrasado') {
    cls += ' border-rose-500/35 bg-rose-500/10 text-rose-400';
    label = 'EXPIRADA';
  } else if (s === 'cancelado') {
    cls += ' border-[var(--border-color)] bg-[var(--bg-card-alt)] text-[var(--text-secondary)]';
    label = 'CANCELADO';
  } else if (s === 'indisponivel') {
    cls += ' border-[var(--border-color)] bg-transparent text-[var(--text-secondary)]';
    label = '—';
  } else {
    cls += ' border-[var(--border-color)] bg-transparent text-[var(--text-secondary)]';
  }

  return (
    <span className="inline-flex flex-col gap-0.5 items-start">
      <span className={cls}>{label}</span>
      <span className="text-[10px] text-[var(--text-secondary)]">{item.statusLabel}</span>
    </span>
  );
}

export function MySalesPageClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brokerUnlinked, setBrokerUnlinked] = useState(false);
  const [unlinkedMessage, setUnlinkedMessage] = useState<string | null>(null);
  const [data, setData] = useState<MySalesListResponse | null>(null);
  const [tab, setTab] = useState<MySalesListTab>('all');
  const [page, setPage] = useState(1);
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [blockLabel, setBlockLabel] = useState('');
  const [lotLabel, setLotLabel] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [detail, setDetail] = useState<MySalesDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const queryFailed = Boolean(error) && !brokerUnlinked;
  const summary = !queryFailed && data?.summary ? data.summary : null;
  const items = !queryFailed ? data?.items || [] : [];
  const projects = data?.projects || [];
  const total = !queryFailed ? data?.total || 0 : 0;
  const pageSize = data?.pageSize || 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showPagination = total > pageSize;
  const contractsUnavailable = Boolean(data?.contractsUnavailable);
  const contractsWarning = data?.contractsWarning || null;
  const kpiLoading = loading && !data;
  const listBusy = loading;
  const kpiValue = (n: number | null | undefined) => {
    if (queryFailed) return '—';
    if (n === null || n === undefined) return '—';
    return String(n);
  };
  const contractKpiUnavailable = queryFailed || contractsUnavailable;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('tab', tab);
      params.set('page', String(page));
      params.set('pageSize', '20');
      if (projectId) params.set('projectId', projectId);
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (blockLabel) params.set('block', blockLabel);
      if (lotLabel) params.set('lot', lotLabel);
      if (typeFilter === 'sale') params.set('tab', 'sales');
      if (typeFilter === 'reservation') params.set('tab', 'reservations');

      const res = await fetch(`/api/my-sales?${params.toString()}`, {
        credentials: 'include',
      });
      const json = (await res.json()) as MySalesListResponse & { error?: string };
      if (!res.ok) {
        setBrokerUnlinked(false);
        const technical = [
          json.code ? `[${json.code}]` : null,
          json.error || `HTTP ${res.status}`,
        ]
          .filter(Boolean)
          .join(' ');
        setError(
          `Não foi possível carregar Minhas Vendas. ${technical}`,
        );
        return;
      }
      setBrokerUnlinked(Boolean(json.brokerUnlinked));
      setUnlinkedMessage(json.message || null);
      setData(json);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Não foi possível carregar Minhas Vendas. ${err.message}`
          : 'Não foi possível carregar Minhas Vendas.',
      );
    } finally {
      setLoading(false);
    }
  }, [
    tab,
    page,
    projectId,
    status,
    search,
    startDate,
    endDate,
    blockLabel,
    lotLabel,
    typeFilter,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  // Trava rolagem do body só enquanto o modal estiver aberto.
  useEffect(() => {
    if (!detailOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [detailOpen]);

  const closeDetail = () => {
    setDetailOpen(false);
    setDetail(null);
    setDetailLoading(false);
  };

  const openDetail = async (item: MySalesListItem) => {
    if (listBusy) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const rawId = item.type === 'sale' ? item.saleId : item.reservationId;
      if (!rawId) return;
      const params = new URLSearchParams({
        id: rawId,
        type: item.type,
      });
      const res = await fetch(`/api/my-sales?${params.toString()}`, {
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Detalhe indisponível.');
      }
      setDetail(json.detail as MySalesDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao abrir detalhe.');
      closeDetail();
    } finally {
      setDetailLoading(false);
    }
  };

  const tabs = useMemo(
    () =>
      [
        { id: 'all' as const, label: 'Todas' },
        { id: 'sales' as const, label: 'Vendas' },
        { id: 'reservations' as const, label: 'Reservas' },
      ] as const,
    [],
  );

  const applySearch = () => {
    if (listBusy) return;
    setPage(1);
    setSearch(searchDraft.trim());
  };

  return (
    <div
      className={`${SV_PAGE_MOBILE_CLASS} h-full min-h-0 flex-1 w-full space-y-5 p-4 md:p-6 ${MOBILE_CONTENT_PAD_BOTTOM_CLASS} md:pb-6`}
    >
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 text-[var(--color-primary)]" />
          <span className="truncate">Minhas Vendas</span>
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Consulte suas vendas e reservas. Sem valores financeiros.
        </p>
      </div>

      {brokerUnlinked ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {unlinkedMessage ||
            'Seu usuário ainda não está vinculado a um cadastro de corretor.'}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {!queryFailed && contractsUnavailable && contractsWarning ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {contractsWarning} As vendas e reservas continuam disponíveis; os KPIs de
          contratos ficaram indisponíveis.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <FinanceStatCard
          title="Total vendas"
          value={kpiValue(summary?.totalSales)}
          subtitle={queryFailed ? 'Indisponível' : 'Não canceladas'}
          icon={<ShoppingBag className="h-4 w-4" />}
          iconWrapClass="bg-blue-500/10 text-blue-400"
          loading={kpiLoading}
        />
        <FinanceStatCard
          title="Vendas no mês"
          value={kpiValue(summary?.salesThisMonth)}
          subtitle={queryFailed ? 'Indisponível' : 'Mês corrente'}
          icon={<Calendar className="h-4 w-4" />}
          iconWrapClass="bg-emerald-500/10 text-emerald-400"
          loading={kpiLoading}
        />
        <FinanceStatCard
          title="Reservas ativas"
          value={kpiValue(summary?.activeReservations)}
          subtitle={queryFailed ? 'Indisponível' : 'Não convertidas'}
          icon={<Handshake className="h-4 w-4" />}
          iconWrapClass="bg-amber-500/10 text-amber-300"
          loading={kpiLoading}
        />
        <FinanceStatCard
          title="Contratos pendentes"
          value={kpiValue(summary?.pendingContracts)}
          subtitle={contractKpiUnavailable ? 'Indisponível' : 'Aguardando assinatura'}
          icon={<FileText className="h-4 w-4" />}
          iconWrapClass="bg-violet-500/10 text-violet-300"
          loading={kpiLoading}
        />
        <FinanceStatCard
          title="Contratos assinados"
          value={kpiValue(summary?.signedContracts)}
          subtitle={contractKpiUnavailable ? 'Indisponível' : 'Finalizados'}
          icon={<FileSignature className="h-4 w-4" />}
          iconWrapClass="bg-teal-500/10 text-teal-300"
          loading={kpiLoading}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={listBusy}
            onClick={() => {
              setTypeFilter('');
              setTab(t.id);
              setPage(1);
            }}
            className={`min-h-10 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
              tab === t.id && !typeFilter
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--bg-card-alt)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <fieldset
        disabled={listBusy}
        className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 disabled:opacity-70 md:grid-cols-2 xl:grid-cols-4"
      >
        <label className="text-xs text-[var(--text-muted)]">
          Empreendimento
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setPage(1);
            }}
            className={FILTER_INPUT}
          >
            <option value="">Todos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          Tipo
          <select
            value={typeFilter || (tab === 'all' ? '' : tab === 'sales' ? 'sale' : 'reservation')}
            onChange={(e) => {
              const v = e.target.value;
              setTypeFilter(v);
              if (v === 'sale') setTab('sales');
              else if (v === 'reservation') setTab('reservations');
              else setTab('all');
              setPage(1);
            }}
            className={FILTER_INPUT}
          >
            <option value="">Todos</option>
            <option value="sale">Venda</option>
            <option value="reservation">Reserva</option>
          </select>
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          Situação
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className={FILTER_INPUT}
          >
            <option value="">Todas</option>
            <option value="contrato_pendente">Contrato pendente</option>
            <option value="assinado">Assinado</option>
            <option value="sem_contrato">Sem contrato</option>
            <option value="cancelado">Cancelado</option>
            <option value="ativa">Reserva ativa</option>
            <option value="convertida">Convertida em venda</option>
            <option value="expirada">Expirada</option>
            <option value="cancelada">Reserva cancelada</option>
          </select>
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          Busca
          <div className="mt-1 flex gap-2">
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applySearch();
              }}
              placeholder="Cliente, lote, quadra…"
              className={`${FILTER_INPUT} mt-0`}
            />
            <button
              type="button"
              onClick={applySearch}
              className="min-h-11 min-w-11 rounded-lg bg-[var(--bg-card-alt)] px-3 text-[var(--text-primary)]"
              title="Buscar"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          Data inicial
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className={FILTER_INPUT}
          />
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          Data final
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className={FILTER_INPUT}
          />
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          Quadra
          <input
            value={blockLabel}
            onChange={(e) => {
              setBlockLabel(e.target.value);
              setPage(1);
            }}
            className={FILTER_INPUT}
          />
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          Lote
          <input
            value={lotLabel}
            onChange={(e) => {
              setLotLabel(e.target.value);
              setPage(1);
            }}
            className={FILTER_INPUT}
          />
        </label>
      </fieldset>

      <div className="relative rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        {listBusy ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-[var(--bg-card)]/50 pt-16">
            <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
          </div>
        ) : null}

        {/* Desktop table */}
        <div className="my-sales-desktop-table hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border-color)] bg-[var(--bg-card-alt)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Empreendimento</th>
                <th className="px-4 py-3">Quadra / Lote</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {queryFailed && !items.length ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-rose-200">
                    Consulta indisponível — veja a mensagem de erro acima.
                  </td>
                </tr>
              ) : !loading && items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[var(--text-muted)]">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-[var(--border-color)]/60 hover:bg-[var(--bg-card-alt)]/50"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {item.typeLabel}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {formatDate(item.date)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {item.projectName}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {item.blockLabel} / {item.lotLabel}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">
                      {item.customerName}
                    </td>
                    <td className="px-4 py-3">
                      <MySalesStatusBadge item={item} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={listBusy}
                        onClick={() => void openDetail(item)}
                        className="min-h-9 rounded-lg px-3 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--bg-card-alt)] disabled:opacity-50"
                      >
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="my-sales-mobile-cards space-y-3 p-3 md:hidden">
          {queryFailed && !items.length ? (
            <p className="py-8 text-center text-sm text-rose-200">
              Consulta indisponível — veja a mensagem de erro acima.
            </p>
          ) : !loading && items.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">
              Nenhum registro encontrado.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card-alt)] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {item.typeLabel}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-[var(--text-primary)] truncate">
                      {item.customerName}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)] break-words">
                      {item.projectName}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      Quadra {item.blockLabel} · Lote {item.lotLabel}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {formatDate(item.date)}
                    </p>
                  </div>
                  <MySalesStatusBadge item={item} />
                </div>
                <button
                  type="button"
                  disabled={listBusy}
                  onClick={() => void openDetail(item)}
                  className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-sm font-medium text-[var(--color-primary)] disabled:opacity-50"
                >
                  Detalhes
                </button>
              </div>
            ))
          )}
        </div>

        {showPagination || total > 0 ? (
          <div className="my-sales-pagination flex flex-col gap-3 border-t border-[var(--border-color)] px-4 py-3 text-sm text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between">
            <span>
              Página {page} de {totalPages} · {total} registro(s)
            </span>
            {showPagination ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={listBusy || page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-11 flex-1 rounded-lg border border-[var(--border-color)] px-4 py-2 disabled:opacity-40 sm:flex-none"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={listBusy || page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="min-h-11 flex-1 rounded-lg border border-[var(--border-color)] px-4 py-2 disabled:opacity-40 sm:flex-none"
                >
                  Próxima
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {detailOpen ? (
        <div
          className={SV_MODAL_OVERLAY_CLASS}
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDetail();
          }}
        >
          <div className={`${SV_MODAL_SHELL_CLASS} bg-[var(--bg-card)] border border-[var(--border-color)]`}>
            <div
              className={`${SV_MODAL_HEADER_CLASS} flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3`}
            >
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Detalhes
              </h2>
              <button
                type="button"
                onClick={closeDetail}
                className="min-h-11 min-w-11 rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-card-alt)]"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className={`${SV_MODAL_BODY_CLASS} p-4`}>
              {detailLoading || !detail ? (
                <div className="py-16 text-center">
                  <Loader2 className="mx-auto h-7 w-7 animate-spin text-blue-400" />
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <Row label="Tipo" value={detail.typeLabel} />
                  <Row label="Data" value={formatDate(detail.date)} />
                  <Row label="Empreendimento" value={detail.projectName} />
                  <Row label="Quadra" value={detail.blockLabel} />
                  <Row label="Lote" value={detail.lotLabel} />
                  <Row label="Cliente" value={detail.customerName} />
                  {detail.customerPhone ? (
                    <Row label="Telefone" value={detail.customerPhone} />
                  ) : null}
                  <Row label="Situação" value={detail.statusLabel} />
                  {detail.contractStatusLabel ? (
                    <Row label="Contrato" value={detail.contractStatusLabel} />
                  ) : null}
                  {detail.contractSignedAt ? (
                    <Row
                      label="Assinado em"
                      value={formatDate(detail.contractSignedAt)}
                    />
                  ) : null}
                  {detail.reservationExpiresAt ? (
                    <Row
                      label="Expira em"
                      value={formatDate(detail.reservationExpiresAt)}
                    />
                  ) : null}
                  {detail.brokerName ? (
                    <Row label="Corretor" value={detail.brokerName} />
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--border-color)]/50 py-2">
      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="text-right font-medium text-[var(--text-primary)] break-words">
        {value}
      </span>
    </div>
  );
}
