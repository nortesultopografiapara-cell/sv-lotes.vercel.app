'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Archive,
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronUp,
  Copy,
  FileSpreadsheet,
  FolderInput,
  GripVertical,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import { TOPOGRAPHY_CATEGORIES } from '@/lib/master/topography/categories';
import {
  topographyQuoteStatusLabel,
  topographyQuoteStatusMeta,
  TOPOGRAPHY_QUOTE_STATUSES,
} from '@/lib/master/topography/quoteStatuses';
import { TOPOGRAPHY_SERVICE_TYPES } from '@/lib/master/topography/serviceTypes';
import { TOPOGRAPHY_PRICE_BANKS } from '@/lib/master/topography/priceBanks';
import {
  computeQuoteFinancials,
  itemTotalWithBdi,
  itemUnitWithBdi,
  stageSubtotal,
} from '@/lib/master/topography/quoteFinancials';
import type {
  MasterTopographyQuote,
  MasterTopographyQuoteItem,
  MasterTopographyQuoteStageWithItems,
} from '@/lib/master/topography/quoteTypes';
import styles from './topographyQuotesEditor.module.css';

type DraftItem = MasterTopographyQuoteItem & { localKey: string };
type DraftStage = Omit<MasterTopographyQuoteStageWithItems, 'items' | 'itemCount' | 'subtotal'> & {
  localKey: string;
  items: DraftItem[];
};

type DraftQuote = {
  title: string;
  client_name: string;
  contact_name: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  address: string;
  distance_km: string;
  category: string;
  service_type: string;
  description: string;
  status: string;
  proposal_date: string;
  expiration_date: string;
  estimated_deadline: string;
  payment_method: string;
  payment_terms: string;
  internal_manager: string;
  internal_notes: string;
  technical_notes: string;
  bdi_percent: string;
  discount_percent: string;
};

const ROW_HEIGHT = 44;
const VIRTUAL_OVERSCAN = 8;

function formatCurrency(val: number | null | undefined) {
  if (val == null || !Number.isFinite(val)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function newLocalKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function quoteToDraft(quote: MasterTopographyQuote): DraftQuote {
  return {
    title: quote.title || '',
    client_name: quote.client_name || '',
    contact_name: quote.contact_name || '',
    phone: quote.phone || '',
    email: quote.email || '',
    city: quote.city || '',
    state: quote.state || '',
    address: quote.address || '',
    distance_km: quote.distance_km == null ? '' : String(quote.distance_km),
    category: quote.category,
    service_type: quote.service_type,
    description: quote.description || '',
    status: quote.status,
    proposal_date: quote.proposal_date || '',
    expiration_date: quote.expiration_date || '',
    estimated_deadline: quote.estimated_deadline || '',
    payment_method: quote.payment_method || '',
    payment_terms: quote.payment_terms || '',
    internal_manager: quote.internal_manager || '',
    internal_notes: quote.internal_notes || '',
    technical_notes: quote.technical_notes || '',
    bdi_percent: String(quote.bdi_percent ?? 0),
    discount_percent: String(quote.discount_percent ?? 0),
  };
}

function stagesToDraft(stages: MasterTopographyQuoteStageWithItems[]): DraftStage[] {
  return stages.map((stage) => ({
    ...stage,
    localKey: stage.id,
    items: stage.items.map((item) => ({ ...item, localKey: item.id })),
  }));
}

function DateField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.field}>
      <label>{label}</label>
      <div className={styles.dateField}>
        <input
          type="date"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <Calendar className={styles.dateIcon} width={14} height={14} aria-hidden />
      </div>
    </div>
  );
}

function VirtualItemsBody({
  items,
  bdiPercent,
  readOnly,
  onChangeItem,
  onDeleteItem,
  onDragStartItem,
  onDropItem,
}: {
  items: DraftItem[];
  bdiPercent: number;
  readOnly: boolean;
  onChangeItem: (localKey: string, patch: Partial<DraftItem>) => void;
  onDeleteItem: (localKey: string) => void;
  onDragStartItem: (localKey: string) => void;
  onDropItem: (localKey: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(360);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const sync = () => setViewport(el.clientHeight || 360);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totalHeight = items.length * ROW_HEIGHT;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VIRTUAL_OVERSCAN);
  const visibleCount = Math.ceil(viewport / ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2;
  const end = Math.min(items.length, start + visibleCount);
  const slice = items.slice(start, end);

  return (
    <div
      ref={scrollerRef}
      className={styles.tableWrap}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <table className={styles.itemsTable}>
        <thead>
          <tr>
            <th style={{ width: 36 }} />
            <th style={{ width: 90 }}>Código</th>
            <th style={{ width: 110 }}>Banco</th>
            <th>Descrição</th>
            <th style={{ width: 70 }}>Unid.</th>
            <th style={{ width: 90 }}>Qtd</th>
            <th style={{ width: 110 }}>Vlr unit.</th>
            <th style={{ width: 110 }}>Vlr c/ BDI</th>
            <th style={{ width: 110 }}>Total</th>
            <th style={{ width: 70 }}>Ações</th>
          </tr>
        </thead>
      </table>
      <div className={styles.virtualBody} style={{ height: totalHeight }}>
        {slice.map((item, i) => {
          const index = start + i;
          const top = index * ROW_HEIGHT;
          const unitBdi = itemUnitWithBdi(item.unit_value, bdiPercent);
          const total = itemTotalWithBdi(item.quantity, item.unit_value, bdiPercent);
          const rowStyle: CSSProperties = {
            top,
            height: ROW_HEIGHT,
          };
          return (
            <div
              key={item.localKey}
              className={styles.virtualRow}
              style={rowStyle}
              draggable={!readOnly}
              onDragStart={() => onDragStartItem(item.localKey)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropItem(item.localKey)}
            >
              <table className={styles.itemsTable}>
                <tbody>
                  <tr>
                    <td style={{ width: 36 }}>
                      <button
                        type="button"
                        className={styles.dragHandle}
                        disabled={readOnly}
                        aria-label="Reordenar item"
                      >
                        <GripVertical width={14} height={14} />
                      </button>
                    </td>
                    <td style={{ width: 90 }}>
                      <input
                        value={item.code || ''}
                        disabled={readOnly}
                        onChange={(e) => onChangeItem(item.localKey, { code: e.target.value })}
                      />
                    </td>
                    <td style={{ width: 110 }}>
                      <select
                        value={item.price_bank || 'PROPRIO'}
                        disabled={readOnly}
                        onChange={(e) =>
                          onChangeItem(item.localKey, {
                            price_bank: e.target.value as DraftItem['price_bank'],
                          })
                        }
                      >
                        {TOPOGRAPHY_PRICE_BANKS.map((b) => (
                          <option key={b.code} value={b.code}>
                            {b.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        value={item.description}
                        disabled={readOnly}
                        onChange={(e) =>
                          onChangeItem(item.localKey, { description: e.target.value })
                        }
                      />
                    </td>
                    <td style={{ width: 70 }}>
                      <input
                        value={item.unit}
                        disabled={readOnly}
                        onChange={(e) => onChangeItem(item.localKey, { unit: e.target.value })}
                      />
                    </td>
                    <td style={{ width: 90 }}>
                      <input
                        type="number"
                        min={0}
                        step="0.0001"
                        value={item.quantity}
                        disabled={readOnly}
                        onChange={(e) =>
                          onChangeItem(item.localKey, { quantity: Number(e.target.value) || 0 })
                        }
                      />
                    </td>
                    <td style={{ width: 110 }}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unit_value}
                        disabled={readOnly}
                        onChange={(e) =>
                          onChangeItem(item.localKey, { unit_value: Number(e.target.value) || 0 })
                        }
                      />
                    </td>
                    <td className={styles.numCell} style={{ width: 110 }}>
                      {formatCurrency(unitBdi)}
                    </td>
                    <td className={styles.numCell} style={{ width: 110 }}>
                      {formatCurrency(total)}
                    </td>
                    <td style={{ width: 70 }}>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                          disabled={readOnly}
                          onClick={() => onDeleteItem(item.localKey)}
                          aria-label="Excluir item"
                        >
                          <Trash2 width={13} height={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditInner() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');

  const [quoteMeta, setQuoteMeta] = useState<MasterTopographyQuote | null>(null);
  const [draft, setDraft] = useState<DraftQuote | null>(null);
  const [stages, setStages] = useState<DraftStage[]>([]);
  const [knownStageIds, setKnownStageIds] = useState<Set<string>>(new Set());
  const [knownItemIds, setKnownItemIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [generalOpen, setGeneralOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [dragStageKey, setDragStageKey] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<{ stageKey: string; itemKey: string } | null>(null);

  const readOnly = Boolean(
    quoteMeta?.status === 'CONVERTIDO' || quoteMeta?.converted_project_id || quoteMeta?.is_archived,
  );

  const bdiPercent = Number(draft?.bdi_percent || 0) || 0;
  const discountPercent = Number(draft?.discount_percent || 0) || 0;

  const financials = useMemo(() => {
    const items = stages.flatMap((s) => s.items);
    return computeQuoteFinancials(items, bdiPercent, discountPercent);
  }, [stages, bdiPercent, discountPercent]);

  const load = useCallback(async () => {
    if (!user?.id || !id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/master/topography/quotes/${id}?userId=${encodeURIComponent(user.id)}&include=structure`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar.');
      const quote = data.quote as MasterTopographyQuote;
      const loadedStages = (data.stages || []) as MasterTopographyQuoteStageWithItems[];
      setQuoteMeta(quote);
      setDraft(quoteToDraft(quote));
      setStages(stagesToDraft(loadedStages));
      setKnownStageIds(new Set(loadedStages.map((s) => s.id)));
      setKnownItemIds(new Set(loadedStages.flatMap((s) => s.items.map((i) => i.id))));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const patchDraft = (patch: Partial<DraftQuote>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setSavedMsg(null);
  };

  const reorder = <T,>(list: T[], fromKey: string, toKey: string, keyOf: (x: T) => string) => {
    const from = list.findIndex((x) => keyOf(x) === fromKey);
    const to = list.findIndex((x) => keyOf(x) === toKey);
    if (from < 0 || to < 0 || from === to) return list;
    const next = list.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  const handleSave = async () => {
    if (!user?.id || !draft || !id || readOnly) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const payload = {
        userId: user.id,
        quote: {
          ...draft,
          distance_km: draft.distance_km === '' ? null : Number(draft.distance_km),
          bdi_percent: Number(draft.bdi_percent) || 0,
          discount_percent: Number(draft.discount_percent) || 0,
          estimated_value: financials.totalWithBdi,
          discount_value: financials.discountValue,
          final_value: financials.totalGeral,
        },
        stages: stages.map((stage, stageIndex) => ({
          id: knownStageIds.has(stage.id) ? stage.id : undefined,
          name: stage.name,
          sort_order: stageIndex,
          is_system: stage.is_system,
          items: stage.items.map((item, itemIndex) => ({
            id: knownItemIds.has(item.id) ? item.id : undefined,
            code: item.code,
            price_bank: item.price_bank || 'PROPRIO',
            description: item.description,
            unit: item.unit || 'UN',
            quantity: item.quantity,
            unit_value: item.unit_value,
            sort_order: itemIndex,
          })),
        })),
      };

      const res = await fetch(`/api/master/topography/quotes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar.');
      const quote = data.quote as MasterTopographyQuote;
      const loadedStages = (data.stages || []) as MasterTopographyQuoteStageWithItems[];
      setQuoteMeta(quote);
      setDraft(quoteToDraft(quote));
      setStages(stagesToDraft(loadedStages));
      setKnownStageIds(new Set(loadedStages.map((s) => s.id)));
      setKnownItemIds(new Set(loadedStages.flatMap((s) => s.items.map((i) => i.id))));
      setSavedMsg('Orçamento salvo com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const postAction = async (path: string) => {
    if (!user?.id || !id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/topography/quotes/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na operação.');
      if (path === 'convert' && data.projectId) {
        router.push(`/master/topography/projects/${data.projectId}`);
        return;
      }
      if (path === 'duplicate' && data.quote?.id) {
        router.push(`/master/topography/budgets/${data.quote.id}/edit`);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na operação.');
    } finally {
      setBusy(false);
    }
  };

  const addStage = () => {
    const localKey = newLocalKey();
    setStages((prev) => [
      ...prev,
      {
        id: localKey,
        localKey,
        quote_id: id,
        name: 'Nova etapa',
        sort_order: prev.length,
        is_system: false,
        created_at: '',
        updated_at: '',
        items: [],
      },
    ]);
  };

  const addItem = (stageKey: string) => {
    const localKey = newLocalKey();
    setStages((prev) =>
      prev.map((stage) => {
        if (stage.localKey !== stageKey) return stage;
        const item: DraftItem = {
          id: localKey,
          localKey,
          quote_id: id,
          stage_id: stage.id,
          code: '',
          price_bank: 'PROPRIO',
          description: '',
          unit: 'UN',
          quantity: 1,
          unit_value: 0,
          sort_order: stage.items.length,
          created_at: '',
          updated_at: '',
        };
        return { ...stage, items: [...stage.items, item] };
      }),
    );
  };

  const statusMeta = topographyQuoteStatusMeta(draft?.status || quoteMeta?.status || 'RASCUNHO');

  if (loading || !draft || !quoteMeta) {
    return (
      <div className={styles.editorPage}>
        <p className={styles.muted}>{loading ? 'Carregando orçamento…' : 'Orçamento não encontrado.'}</p>
        {error ? <div className={styles.errorBanner}>{error}</div> : null}
        <Link href="/master/topography/budgets" className={styles.btnGhost}>
          <ArrowLeft width={14} height={14} /> Voltar
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.editorPage}>
      <header className={styles.execHeader}>
        <div className={styles.execTop}>
          <div>
            <Link href="/master/topography/budgets" className={styles.btnGhost}>
              <ArrowLeft width={14} height={14} /> Orçamentos
            </Link>
            <div className={styles.execMeta} style={{ marginTop: '0.55rem' }}>
              <span className={styles.execCode}>{quoteMeta.code}</span>
              <span
                className={styles.badge}
                style={{
                  background: `${statusMeta?.color || '#64748b'}18`,
                  color: statusMeta?.color || '#64748b',
                  borderColor: `${statusMeta?.color || '#64748b'}44`,
                }}
              >
                {topographyQuoteStatusLabel(draft.status)}
              </span>
            </div>
            <input
              className={styles.execTitleInput}
              style={{ marginTop: '0.55rem', width: '100%' }}
              value={draft.title}
              disabled={readOnly}
              placeholder="Título do orçamento"
              onChange={(e) => patchDraft({ title: e.target.value })}
            />
          </div>
          <div className={styles.execActions}>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={saving || readOnly}
              onClick={() => void handleSave()}
            >
              <Save width={14} height={14} />
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              disabled={busy}
              onClick={() => void postAction('duplicate')}
            >
              <Copy width={14} height={14} /> Duplicar
            </button>
            <div className={styles.exportWrap}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setExportOpen((v) => !v)}
              >
                <FileSpreadsheet width={14} height={14} /> Exportar
                <ChevronDown width={14} height={14} />
              </button>
              {exportOpen ? (
                <div className={styles.exportMenu} role="menu">
                  {[
                    'PDF Sintético',
                    'PDF Analítico',
                    'Excel',
                    'CSV',
                    'Memorial de Cálculo',
                  ].map((label) => (
                    <button
                      key={label}
                      type="button"
                      className={styles.exportItem}
                      onClick={() => {
                        setExportOpen(false);
                        window.alert('Em desenvolvimento');
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.btnSecondary}
              disabled={busy || readOnly || quoteMeta.status === 'CONVERTIDO'}
              onClick={() => void postAction('convert')}
            >
              <FolderInput width={14} height={14} /> Converter em Projeto
            </button>
            <button
              type="button"
              className={styles.btnDanger}
              disabled={busy || quoteMeta.is_archived}
              onClick={() => void postAction('archive')}
            >
              <Archive width={14} height={14} /> Arquivar
            </button>
          </div>
        </div>

        <div className={styles.execStats}>
          <div className={styles.execStat}>
            <span className={styles.execStatLabel}>Cliente</span>
            <div className={styles.execStatValue}>{draft.client_name || '—'}</div>
          </div>
          <div className={styles.execStat}>
            <span className={styles.execStatLabel}>Valor total</span>
            <div className={styles.execStatValue}>{formatCurrency(financials.totalGeral)}</div>
          </div>
          <div className={styles.execStat}>
            <span className={styles.execStatLabel}>BDI</span>
            <div className={styles.execStatValue}>{bdiPercent.toLocaleString('pt-BR')}%</div>
          </div>
          <div className={styles.execStat}>
            <span className={styles.execStatLabel}>Data da proposta</span>
            <div className={styles.execStatValue}>
              {draft.proposal_date
                ? draft.proposal_date.split('-').reverse().join('/')
                : '—'}
            </div>
          </div>
          <div className={styles.execStat}>
            <span className={styles.execStatLabel}>Status</span>
            <div className={styles.execStatValue}>
              <select
                value={draft.status}
                disabled={readOnly}
                onChange={(e) => patchDraft({ status: e.target.value })}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.4rem',
                  padding: '0.2rem 0.35rem',
                  fontWeight: 700,
                }}
              >
                {TOPOGRAPHY_QUOTE_STATUSES.filter((s) => s.code !== 'CONVERTIDO').map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      {savedMsg ? <div className={styles.successBanner}>{savedMsg}</div> : null}

      <section className={styles.collapse}>
        <button
          type="button"
          className={styles.collapseHead}
          onClick={() => setGeneralOpen((v) => !v)}
        >
          <h2 className={styles.collapseTitle}>Dados Gerais</h2>
          {generalOpen ? <ChevronUp width={16} height={16} /> : <ChevronDown width={16} height={16} />}
        </button>
        {generalOpen ? (
          <div className={styles.collapseBody}>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Cliente</label>
                <input
                  value={draft.client_name}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ client_name: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Contato</label>
                <input
                  value={draft.contact_name}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ contact_name: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Telefone</label>
                <input
                  value={draft.phone}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ phone: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>E-mail</label>
                <input
                  value={draft.email}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ email: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Município</label>
                <input
                  value={draft.city}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ city: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>UF</label>
                <input
                  value={draft.state}
                  maxLength={2}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ state: e.target.value.toUpperCase() })}
                />
              </div>
              <div className={styles.field}>
                <label>Endereço</label>
                <input
                  value={draft.address}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ address: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Distância (km)</label>
                <input
                  type="number"
                  value={draft.distance_km}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ distance_km: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Categoria</label>
                <select
                  value={draft.category}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ category: e.target.value })}
                >
                  {TOPOGRAPHY_CATEGORIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Tipo de serviço</label>
                <select
                  value={draft.service_type}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ service_type: e.target.value })}
                >
                  {TOPOGRAPHY_SERVICE_TYPES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <DateField
                label="Data da proposta"
                value={draft.proposal_date}
                disabled={readOnly}
                onChange={(v) => patchDraft({ proposal_date: v })}
              />
              <DateField
                label="Validade da proposta"
                value={draft.expiration_date}
                disabled={readOnly}
                onChange={(v) => patchDraft({ expiration_date: v })}
              />
              <div className={styles.field}>
                <label>Prazo estimado</label>
                <input
                  value={draft.estimated_deadline}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ estimated_deadline: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Responsável</label>
                <input
                  value={draft.internal_manager}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ internal_manager: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Forma de pagamento</label>
                <input
                  value={draft.payment_method}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ payment_method: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Condições de pagamento</label>
                <input
                  value={draft.payment_terms}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ payment_terms: e.target.value })}
                />
              </div>
            </div>
            <div className={styles.formGrid} style={{ marginTop: '0.75rem' }}>
              <div className={styles.field}>
                <label>Descrição</label>
                <textarea
                  value={draft.description}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ description: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Observações internas</label>
                <textarea
                  value={draft.internal_notes}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ internal_notes: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Informações técnicas</label>
                <textarea
                  value={draft.technical_notes}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ technical_notes: e.target.value })}
                />
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <div className={styles.stagesHead}>
        <h2>Etapas</h2>
        <button type="button" className={styles.btnSecondary} disabled={readOnly} onClick={addStage}>
          <Plus width={14} height={14} /> Nova etapa
        </button>
      </div>

      {stages.map((stage) => {
        const subtotal = stageSubtotal(stage.items, bdiPercent);
        return (
          <section
            key={stage.localKey}
            className={`${styles.stageCard} ${
              dragStageKey === stage.localKey ? styles.stageCardDragging : ''
            }`}
            onDragOver={(e: DragEvent) => e.preventDefault()}
            onDrop={() => {
              if (!dragStageKey) return;
              setStages((prev) =>
                reorder(prev, dragStageKey, stage.localKey, (s) => s.localKey).map((s, i) => ({
                  ...s,
                  sort_order: i,
                })),
              );
              setDragStageKey(null);
            }}
          >
            <div className={styles.stageHead}>
              <button
                type="button"
                className={styles.dragHandle}
                draggable={!readOnly}
                disabled={readOnly}
                onDragStart={() => setDragStageKey(stage.localKey)}
                aria-label="Reordenar etapa"
              >
                <GripVertical width={15} height={15} />
              </button>
              <input
                className={styles.stageNameInput}
                value={stage.name}
                disabled={readOnly}
                onChange={(e) =>
                  setStages((prev) =>
                    prev.map((s) =>
                      s.localKey === stage.localKey ? { ...s, name: e.target.value } : s,
                    ),
                  )
                }
              />
              <div className={styles.stageMeta}>
                <span>
                  Itens: <strong>{stage.items.length}</strong>
                </span>
                <span>
                  Subtotal: <strong>{formatCurrency(subtotal)}</strong>
                </span>
              </div>
              <div className={styles.stageActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  disabled={readOnly}
                  onClick={() => addItem(stage.localKey)}
                >
                  <Plus width={13} height={13} /> Adicionar Item
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  disabled={readOnly}
                  onClick={() =>
                    setStages((prev) => prev.filter((s) => s.localKey !== stage.localKey))
                  }
                >
                  <Trash2 width={13} height={13} /> Excluir
                </button>
              </div>
            </div>

            {stage.items.length === 0 ? (
              <div className={styles.emptyStage}>Nenhum item nesta etapa.</div>
            ) : (
              <VirtualItemsBody
                items={stage.items}
                bdiPercent={bdiPercent}
                readOnly={readOnly}
                onChangeItem={(itemKey, patch) =>
                  setStages((prev) =>
                    prev.map((s) =>
                      s.localKey !== stage.localKey
                        ? s
                        : {
                            ...s,
                            items: s.items.map((it) =>
                              it.localKey === itemKey ? { ...it, ...patch } : it,
                            ),
                          },
                    ),
                  )
                }
                onDeleteItem={(itemKey) =>
                  setStages((prev) =>
                    prev.map((s) =>
                      s.localKey !== stage.localKey
                        ? s
                        : { ...s, items: s.items.filter((it) => it.localKey !== itemKey) },
                    ),
                  )
                }
                onDragStartItem={(itemKey) =>
                  setDragItem({ stageKey: stage.localKey, itemKey })
                }
                onDropItem={(itemKey) => {
                  if (!dragItem || dragItem.stageKey !== stage.localKey) return;
                  setStages((prev) =>
                    prev.map((s) => {
                      if (s.localKey !== stage.localKey) return s;
                      return {
                        ...s,
                        items: reorder(
                          s.items,
                          dragItem.itemKey,
                          itemKey,
                          (it) => it.localKey,
                        ).map((it, idx) => ({ ...it, sort_order: idx })),
                      };
                    }),
                  );
                  setDragItem(null);
                }}
              />
            )}
          </section>
        );
      })}

      <aside className={styles.financeBar} aria-label="Resumo financeiro">
        <div className={styles.financeGrid}>
          <div className={styles.financeItem}>
            <label>Total sem BDI</label>
            <strong>{formatCurrency(financials.totalWithoutBdi)}</strong>
          </div>
          <div className={styles.financeItem}>
            <label>BDI (%)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={draft.bdi_percent}
              disabled={readOnly}
              onChange={(e) => patchDraft({ bdi_percent: e.target.value })}
            />
            <span className={styles.muted}>{formatCurrency(financials.bdiAmount)}</span>
          </div>
          <div className={styles.financeItem}>
            <label>Total Geral</label>
            <strong>{formatCurrency(financials.totalWithBdi)}</strong>
          </div>
          <div className={styles.financeItem}>
            <label>Desconto (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={draft.discount_percent}
              disabled={readOnly}
              onChange={(e) => patchDraft({ discount_percent: e.target.value })}
            />
            <span className={styles.muted}>{formatCurrency(financials.discountValue)}</span>
          </div>
          <div className={styles.financeItem}>
            <label>Margem</label>
            <strong className={styles.muted}>Em breve</strong>
            <div style={{ marginTop: '0.35rem' }}>
              <strong>{formatCurrency(financials.totalGeral)}</strong>
              <span className={styles.muted}> líquido</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function TopographyQuoteEditPage() {
  return (
    <MasterSuperAdminGuard>
      <EditInner />
    </MasterSuperAdminGuard>
  );
}
