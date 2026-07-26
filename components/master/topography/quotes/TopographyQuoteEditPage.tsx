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
  type KeyboardEvent,
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
import {
  topographyPriceBankLabel,
  type MasterTopographyPriceDatabase,
} from '@/lib/master/topography/priceBanks';
import type { MasterTopographyPriceItem } from '@/lib/master/topography/priceCatalogService';
import { canPermanentlyDeleteTopographyQuote } from '@/lib/master/topography/quoteDeletePolicy';
import {
  deliverablesCatalog,
  technicalResourcesCatalog,
  QUOTE_SCOPE_MAX_DELIVERABLES,
  QUOTE_SCOPE_MAX_TECHNICAL_RESOURCES,
  type QuoteScopeSelectedItem,
} from '@/lib/master/topography/quoteScopeCatalog';
import { SUGGESTED_METHODOLOGY_TEMPLATE } from '@/lib/master/topography/quotePdfPresentation';
import QuoteScopeMultiSelect from './QuoteScopeMultiSelect';
import QuoteSendEmailModal from './QuoteSendEmailModal';
import {
  computeQuoteFinancials,
  itemTotalWithBdi,
  itemUnitWithBdi,
  priceDifferencePercent,
  priceDifferenceValue,
  stagePercentOfBudget,
  stageSubtotal,
} from '@/lib/master/topography/quoteFinancials';
import {
  exportQuoteCsv,
  exportQuoteExcel,
  exportQuoteMemorial,
  exportQuotePdfAnalyticalPrepared,
  exportQuotePdfSynthetic,
  type QuoteExportPayload,
} from '@/lib/master/topography/quoteExports';
import type {
  MasterTopographyQuote,
  MasterTopographyQuoteItem,
  MasterTopographyQuoteStageWithItems,
} from '@/lib/master/topography/quoteTypes';
import { QuoteCatalogPicker } from './QuoteCatalogPicker';
import { QuoteCustomItemModal } from './QuoteCustomItemModal';
import { QuoteDeleteConfirmModal } from './QuoteDeleteConfirmModal';
import styles from './topographyQuotesEditor.module.css';

type DraftItem = MasterTopographyQuoteItem & { localKey: string };
type DraftStage = Omit<MasterTopographyQuoteStageWithItems, 'items' | 'itemCount' | 'subtotal' | 'percentOfBudget'> & {
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
  mobilization_deadline_text: string;
  field_duration_text: string;
  processing_deadline_text: string;
  delivery_deadline_text: string;
  total_deadline_text: string;
  methodology_notes: string;
  professional_name: string;
  professional_title: string;
  professional_council: string;
  professional_registration: string;
  professional_registration_uf: string;
  payment_method: string;
  payment_terms: string;
  internal_manager: string;
  internal_notes: string;
  technical_notes: string;
  technical_resources: QuoteScopeSelectedItem[];
  deliverables: QuoteScopeSelectedItem[];
  bdi_percent: string;
  discount_percent: string;
  margin_percent: string;
};

const ROW_HEIGHT = 48;
const VIRTUAL_OVERSCAN = 8;

function formatCurrency(val: number | null | undefined) {
  if (val == null || !Number.isFinite(val)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function newLocalKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDatePicker(el: HTMLInputElement) {
  try {
    el.showPicker?.();
  } catch {
    /* alguns browsers bloqueiam showPicker fora de gesto explícito */
  }
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
    mobilization_deadline_text: quote.mobilization_deadline_text || '',
    field_duration_text: quote.field_duration_text || '',
    processing_deadline_text: quote.processing_deadline_text || '',
    delivery_deadline_text: quote.delivery_deadline_text || '',
    total_deadline_text: quote.total_deadline_text || '',
    methodology_notes: quote.methodology_notes || '',
    professional_name: quote.professional_name || '',
    professional_title: quote.professional_title || '',
    professional_council: quote.professional_council || '',
    professional_registration: quote.professional_registration || '',
    professional_registration_uf: quote.professional_registration_uf || '',
    payment_method: quote.payment_method || '',
    payment_terms: quote.payment_terms || '',
    internal_manager: quote.internal_manager || '',
    internal_notes: quote.internal_notes || '',
    technical_notes: quote.technical_notes || '',
    technical_resources: Array.isArray(quote.technical_resources)
      ? quote.technical_resources
      : [],
    deliverables: Array.isArray(quote.deliverables) ? quote.deliverables : [],
    bdi_percent: String(quote.bdi_percent ?? 0),
    discount_percent: String(quote.discount_percent ?? 0),
    margin_percent: String(quote.margin_percent ?? 0),
  };
}

function normalizeDraftItem(item: MasterTopographyQuoteItem, localKey?: string): DraftItem {
  const adopted = Number(
    item.adopted_price != null ? item.adopted_price : item.unit_value != null ? item.unit_value : 0,
  );
  const reference = Number(item.reference_price != null ? item.reference_price : adopted);
  return {
    ...item,
    localKey: localKey || item.id,
    unit_value: adopted,
    adopted_price: adopted,
    reference_price: reference,
    competence: item.competence ?? null,
    uf: item.uf ?? null,
    notes: item.notes ?? null,
    calculation_notes: item.calculation_notes ?? null,
    catalog_item_id: item.catalog_item_id ?? null,
    custom_item_id: item.custom_item_id ?? null,
  };
}

function stagesToDraft(stages: MasterTopographyQuoteStageWithItems[]): DraftStage[] {
  return stages.map((stage) => ({
    id: stage.id,
    quote_id: stage.quote_id,
    name: stage.name,
    sort_order: stage.sort_order,
    is_system: stage.is_system,
    created_at: stage.created_at,
    updated_at: stage.updated_at,
    localKey: stage.id,
    items: stage.items.map((item) => normalizeDraftItem(item)),
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
          readOnly={false}
          style={{ cursor: disabled ? undefined : 'pointer' }}
          onClick={(e) => {
            if (!disabled) openDatePicker(e.currentTarget);
          }}
          onFocus={(e) => {
            if (!disabled) openDatePicker(e.currentTarget);
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
              e.preventDefault();
            }
          }}
          onChange={(e) => onChange(e.target.value)}
        />
        <Calendar className={styles.dateIcon} width={14} height={14} aria-hidden />
      </div>
    </div>
  );
}

function VirtualItemsBody({
  items,
  stages,
  currentStageKey,
  bdiPercent,
  readOnly,
  onChangeItem,
  onDeleteItem,
  onDuplicateItem,
  onMoveItem,
  onDragStartItem,
  onDropItem,
}: {
  items: DraftItem[];
  stages: DraftStage[];
  currentStageKey: string;
  bdiPercent: number;
  readOnly: boolean;
  onChangeItem: (localKey: string, patch: Partial<DraftItem>) => void;
  onDeleteItem: (localKey: string) => void;
  onDuplicateItem: (localKey: string) => void;
  onMoveItem: (localKey: string, toStageKey: string) => void;
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
            <th style={{ width: 84 }}>Código</th>
            <th style={{ width: 88 }}>Banco</th>
            <th>Descrição</th>
            <th style={{ width: 58 }}>Unid.</th>
            <th style={{ width: 72 }}>Qtd</th>
            <th style={{ width: 96 }}>Ref.</th>
            <th style={{ width: 110 }}>Adotado</th>
            <th style={{ width: 96 }}>Unit. c/ BDI</th>
            <th style={{ width: 96 }}>Total</th>
            <th style={{ width: 90 }}>Obs.</th>
            <th style={{ width: 150 }}>Ações</th>
          </tr>
        </thead>
      </table>
      <div className={styles.virtualBody} style={{ height: totalHeight }}>
        {slice.map((item, i) => {
          const index = start + i;
          const top = index * ROW_HEIGHT;
          const adopted = item.adopted_price;
          const reference = item.reference_price;
          const unitBdi = itemUnitWithBdi(adopted, bdiPercent);
          const total = itemTotalWithBdi(item.quantity, adopted, bdiPercent);
          const diffPct = priceDifferencePercent(reference, adopted);
          const diffVal = priceDifferenceValue(reference, adopted);
          const showDiff = Math.abs(adopted - reference) > 0.0001;
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
                    <td style={{ width: 84 }}>
                      <input
                        value={item.code || ''}
                        disabled={readOnly}
                        onChange={(e) => onChangeItem(item.localKey, { code: e.target.value })}
                      />
                    </td>
                    <td style={{ width: 88 }}>
                      <span className={styles.muted} title={item.price_bank || ''}>
                        {topographyPriceBankLabel(item.price_bank)}
                      </span>
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
                    <td style={{ width: 58 }}>
                      <input
                        value={item.unit}
                        disabled={readOnly}
                        onChange={(e) => onChangeItem(item.localKey, { unit: e.target.value })}
                      />
                    </td>
                    <td style={{ width: 72 }}>
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
                    <td style={{ width: 96 }}>
                      <input
                        className={styles.refLocked}
                        type="number"
                        value={reference}
                        readOnly
                        tabIndex={-1}
                        aria-readonly
                        title="Preço de referência (somente leitura)"
                      />
                    </td>
                    <td style={{ width: 110 }}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={adopted}
                        disabled={readOnly}
                        onChange={(e) => {
                          const next = Number(e.target.value) || 0;
                          onChangeItem(item.localKey, {
                            adopted_price: next,
                            unit_value: next,
                          });
                        }}
                      />
                      {showDiff ? (
                        <span
                          className={diffPct >= 0 ? styles.diffUp : styles.diffDown}
                          title={`Diferença: ${formatCurrency(diffVal)}`}
                        >
                          {diffPct >= 0 ? '+' : ''}
                          {diffPct.toFixed(2)}%
                        </span>
                      ) : null}
                    </td>
                    <td className={styles.numCell} style={{ width: 96 }}>
                      {formatCurrency(unitBdi)}
                    </td>
                    <td className={styles.numCell} style={{ width: 96 }}>
                      {formatCurrency(total)}
                    </td>
                    <td style={{ width: 110 }}>
                      <input
                        value={item.calculation_notes || ''}
                        disabled={readOnly}
                        placeholder="Justificativa"
                        title="Justificativa de cálculo (memória)"
                        onChange={(e) =>
                          onChangeItem(item.localKey, {
                            calculation_notes: e.target.value || null,
                          })
                        }
                        style={{ fontSize: '0.72rem' }}
                      />
                    </td>
                    <td style={{ width: 150 }}>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          disabled={readOnly}
                          onClick={() => onDuplicateItem(item.localKey)}
                          aria-label="Duplicar item"
                          title="Duplicar"
                        >
                          <Copy width={13} height={13} />
                        </button>
                        <select
                          disabled={readOnly || stages.length < 2}
                          value={currentStageKey}
                          aria-label="Mover para etapa"
                          title="Mover para outra etapa"
                          style={{
                            maxWidth: 72,
                            fontSize: '0.68rem',
                            border: '1px solid #e2e8f0',
                            borderRadius: '0.35rem',
                            padding: '0.15rem',
                          }}
                          onChange={(e) => {
                            const to = e.target.value;
                            if (to && to !== currentStageKey) onMoveItem(item.localKey, to);
                          }}
                        >
                          {stages.map((s) => (
                            <option key={s.localKey} value={s.localKey}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                          disabled={readOnly}
                          onClick={() => onDeleteItem(item.localKey)}
                          aria-label="Excluir item"
                          title="Excluir"
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
  const [databases, setDatabases] = useState<MasterTopographyPriceDatabase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [generalOpen, setGeneralOpen] = useState(true);
  const [financeOpen, setFinanceOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [dragStageKey, setDragStageKey] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<{ stageKey: string; itemKey: string } | null>(null);
  const [customModalStageKey, setCustomModalStageKey] = useState<string | null>(null);

  const readOnly = Boolean(
    quoteMeta?.status === 'CONVERTIDO' || quoteMeta?.converted_project_id || quoteMeta?.is_archived,
  );

  const canHardDelete = quoteMeta
    ? canPermanentlyDeleteTopographyQuote(quoteMeta).ok
    : false;

  const bdiPercent = Number(draft?.bdi_percent || 0) || 0;
  const discountPercent = Number(draft?.discount_percent || 0) || 0;
  const marginPercent = Number(draft?.margin_percent || 0) || 0;

  const financials = useMemo(() => {
    const items = stages.flatMap((s) =>
      s.items.map((it) => ({
        quantity: it.quantity,
        unit_value: it.adopted_price,
        reference_price: it.reference_price,
      })),
    );
    return computeQuoteFinancials(items, bdiPercent, discountPercent, marginPercent);
  }, [stages, bdiPercent, discountPercent, marginPercent]);

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

  const loadDatabases = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(
        `/api/master/topography/price-catalog?mode=databases&userId=${encodeURIComponent(user.id)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar bancos.');
      setDatabases((data.databases || []) as MasterTopographyPriceDatabase[]);
    } catch {
      setDatabases([]);
    }
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDatabases();
  }, [loadDatabases]);

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

  const buildExportPayload = useCallback((): QuoteExportPayload | null => {
    if (!quoteMeta || !draft) return null;
    const quote: MasterTopographyQuote = {
      ...quoteMeta,
      title: draft.title || null,
      client_name: draft.client_name,
      contact_name: draft.contact_name || null,
      phone: draft.phone || null,
      email: draft.email || null,
      city: draft.city || null,
      state: draft.state || null,
      address: draft.address || null,
      distance_km: draft.distance_km === '' ? null : Number(draft.distance_km),
      category: draft.category as MasterTopographyQuote['category'],
      service_type: draft.service_type as MasterTopographyQuote['service_type'],
      description: draft.description || null,
      status: draft.status as MasterTopographyQuote['status'],
      proposal_date: draft.proposal_date || null,
      expiration_date: draft.expiration_date || null,
      estimated_deadline: draft.estimated_deadline || null,
      mobilization_deadline_text: draft.mobilization_deadline_text || null,
      field_duration_text: draft.field_duration_text || null,
      processing_deadline_text: draft.processing_deadline_text || null,
      delivery_deadline_text: draft.delivery_deadline_text || null,
      total_deadline_text: draft.total_deadline_text || null,
      methodology_notes: draft.methodology_notes || null,
      professional_name: draft.professional_name || null,
      professional_title: draft.professional_title || null,
      professional_council: draft.professional_council || null,
      professional_registration: draft.professional_registration || null,
      professional_registration_uf: draft.professional_registration_uf || null,
      payment_method: draft.payment_method || null,
      payment_terms: draft.payment_terms || null,
      internal_manager: draft.internal_manager || null,
      internal_notes: draft.internal_notes || null,
      technical_notes: draft.technical_notes || null,
      technical_resources: draft.technical_resources,
      deliverables: draft.deliverables,
      bdi_percent: bdiPercent,
      discount_percent: discountPercent,
      margin_percent: marginPercent,
      estimated_value: financials.totalWithBdi,
      discount_value: financials.discountValue,
      final_value: financials.totalGeral,
    };

    const exportStages: MasterTopographyQuoteStageWithItems[] = stages.map((stage, idx) => {
      const calcItems = stage.items.map((it) => ({
        quantity: it.quantity,
        unit_value: it.adopted_price,
        reference_price: it.reference_price,
      }));
      const subtotal = stageSubtotal(calcItems, bdiPercent);
      return {
        id: stage.id,
        quote_id: stage.quote_id,
        name: stage.name,
        sort_order: idx,
        is_system: stage.is_system,
        created_at: stage.created_at,
        updated_at: stage.updated_at,
        items: stage.items.map((it, itemIndex) => ({
          ...it,
          sort_order: itemIndex,
          unit_value: it.adopted_price,
        })),
        itemCount: stage.items.length,
        subtotal,
        percentOfBudget: stagePercentOfBudget(subtotal, financials.totalWithBdi),
      };
    });

    return { quote, stages: exportStages, financials };
  }, [
    quoteMeta,
    draft,
    stages,
    bdiPercent,
    discountPercent,
    marginPercent,
    financials,
  ]);

  const runExport = async (kind: 'pdf-synth' | 'pdf-anal' | 'excel' | 'csv' | 'memorial') => {
    setExportOpen(false);
    const payload = buildExportPayload();
    if (!payload) return;
    setExporting(true);
    setError(null);
    try {
      if (kind === 'pdf-synth') await exportQuotePdfSynthetic(payload);
      else if (kind === 'excel') await exportQuoteExcel(payload);
      else if (kind === 'csv') exportQuoteCsv(payload);
      else if (kind === 'memorial') exportQuoteMemorial(payload);
      else exportQuotePdfAnalyticalPrepared(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao exportar.');
    } finally {
      setExporting(false);
    }
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
          margin_percent: Number(draft.margin_percent) || 0,
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
            unit_value: item.adopted_price,
            reference_price: item.reference_price,
            adopted_price: item.adopted_price,
            competence: item.competence,
            uf: item.uf,
            notes: item.notes,
            calculation_notes: item.calculation_notes,
            catalog_item_id: item.catalog_item_id,
            custom_item_id: item.custom_item_id,
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

  const handleHardDelete = async (typedCode: string) => {
    if (!user?.id || !id) return;
    setBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/master/topography/quotes/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, confirmationCode: typedCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao excluir.');
      setDeleteOpen(false);
      router.push('/master/topography/budgets');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Falha ao excluir.');
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

  const appendItemToStage = (stageKey: string, partial: Partial<DraftItem> & Pick<DraftItem, 'description'>) => {
    const localKey = newLocalKey();
    const adopted = Number(partial.adopted_price ?? partial.unit_value ?? 0);
    const reference = Number(partial.reference_price ?? adopted);
    setStages((prev) =>
      prev.map((stage) => {
        if (stage.localKey !== stageKey) return stage;
        const item: DraftItem = {
          id: localKey,
          localKey,
          quote_id: id,
          stage_id: stage.id,
          code: partial.code ?? '',
          price_bank: partial.price_bank || 'PROPRIO',
          description: partial.description,
          unit: partial.unit || 'UN',
          quantity: partial.quantity ?? 1,
          unit_value: adopted,
          reference_price: reference,
          adopted_price: adopted,
          competence: partial.competence ?? null,
          uf: partial.uf ?? null,
          notes: partial.notes ?? null,
          calculation_notes: partial.calculation_notes ?? null,
          catalog_item_id: partial.catalog_item_id ?? null,
          custom_item_id: partial.custom_item_id ?? null,
          sort_order: stage.items.length,
          created_at: '',
          updated_at: '',
        };
        return { ...stage, items: [...stage.items, item] };
      }),
    );
    setSavedMsg(null);
  };

  const addFromCatalog = (stageKey: string, catalogItem: MasterTopographyPriceItem) => {
    const price = Number(catalogItem.reference_price) || 0;
    appendItemToStage(stageKey, {
      code: catalogItem.code,
      price_bank: catalogItem.bank_code,
      description: catalogItem.description,
      unit: catalogItem.unit || 'UN',
      quantity: 1,
      reference_price: price,
      adopted_price: price,
      unit_value: price,
      competence: catalogItem.competence,
      uf: catalogItem.uf,
      catalog_item_id: catalogItem.source === 'catalog' ? catalogItem.id : null,
      custom_item_id: catalogItem.source === 'custom' ? catalogItem.id : null,
      notes: null,
      calculation_notes: null,
    });
  };

  const addFromCustom = (
    stageKey: string,
    custom: { id: string; code: string; description: string; unit: string; price: number },
  ) => {
    const price = Number(custom.price) || 0;
    appendItemToStage(stageKey, {
      code: custom.code,
      price_bank: 'PROPRIO',
      description: custom.description,
      unit: custom.unit || 'UN',
      quantity: 1,
      reference_price: price,
      adopted_price: price,
      unit_value: price,
      competence: null,
      uf: null,
      catalog_item_id: null,
      custom_item_id: custom.id,
      notes: null,
      calculation_notes: null,
    });
  };

  const duplicateItem = (stageKey: string, itemKey: string) => {
    setStages((prev) =>
      prev.map((stage) => {
        if (stage.localKey !== stageKey) return stage;
        const idx = stage.items.findIndex((it) => it.localKey === itemKey);
        if (idx < 0) return stage;
        const src = stage.items[idx];
        const localKey = newLocalKey();
        const clone: DraftItem = {
          ...src,
          id: localKey,
          localKey,
          sort_order: idx + 1,
        };
        const items = [...stage.items];
        items.splice(idx + 1, 0, clone);
        return { ...stage, items: items.map((it, i) => ({ ...it, sort_order: i })) };
      }),
    );
    setSavedMsg(null);
  };

  const moveItemToStage = (fromStageKey: string, itemKey: string, toStageKey: string) => {
    if (fromStageKey === toStageKey) return;
    setStages((prev) => {
      let moved: DraftItem | null = null;
      const stripped = prev.map((stage) => {
        if (stage.localKey !== fromStageKey) return stage;
        const found = stage.items.find((it) => it.localKey === itemKey);
        if (!found) return stage;
        moved = found;
        return {
          ...stage,
          items: stage.items
            .filter((it) => it.localKey !== itemKey)
            .map((it, i) => ({ ...it, sort_order: i })),
        };
      });
      if (!moved) return prev;
      return stripped.map((stage) => {
        if (stage.localKey !== toStageKey) return stage;
        const nextItem: DraftItem = {
          ...moved!,
          stage_id: stage.id,
          sort_order: stage.items.length,
        };
        return { ...stage, items: [...stage.items, nextItem] };
      });
    });
    setSavedMsg(null);
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
                disabled={exporting}
                onClick={() => setExportOpen((v) => !v)}
              >
                <FileSpreadsheet width={14} height={14} />
                {exporting ? 'Exportando…' : 'Exportar'}
                <ChevronDown width={14} height={14} />
              </button>
              {exportOpen ? (
                <div className={styles.exportMenu} role="menu">
                  <button
                    type="button"
                    className={styles.exportItem}
                    onClick={() => void runExport('pdf-synth')}
                  >
                    PDF Sintético
                  </button>
                  <button
                    type="button"
                    className={styles.exportItem}
                    onClick={() => void runExport('excel')}
                  >
                    Excel
                  </button>
                  <button
                    type="button"
                    className={styles.exportItem}
                    onClick={() => void runExport('csv')}
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    className={styles.exportItem}
                    onClick={() => void runExport('memorial')}
                  >
                    Memória de cálculo (PDF)
                  </button>
                  <button
                    type="button"
                    className={styles.exportItem}
                    onClick={() => void runExport('pdf-anal')}
                  >
                    PDF Analítico
                  </button>
                  <button
                    type="button"
                    className={styles.exportItem}
                    onClick={() => {
                      setExportOpen(false);
                      setEmailOpen(true);
                    }}
                  >
                    Enviar orçamento por e-mail
                  </button>
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
            {canHardDelete ? (
              <button
                type="button"
                className={styles.btnDanger}
                disabled={busy}
                onClick={() => {
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
              >
                <Trash2 width={14} height={14} /> Excluir definitivamente
              </button>
            ) : null}
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
                <label>Informações técnicas complementares</label>
                <textarea
                  value={draft.technical_notes}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ technical_notes: e.target.value })}
                  placeholder="Precisão, GSD, datum, limitações… (sem repetir a lista de equipamentos)"
                />
              </div>
              <div className={styles.field}>
                <label>Metodologia</label>
                <textarea
                  value={draft.methodology_notes}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ methodology_notes: e.target.value })}
                  placeholder="Descreva a metodologia (opcional). Não é inventada no PDF."
                />
                {!readOnly ? (
                  <button
                    type="button"
                    className={styles.btnGhost}
                    style={{ marginTop: 6, fontSize: '0.78rem' }}
                    onClick={() => {
                      if (
                        draft.methodology_notes.trim() &&
                        !window.confirm('Substituir o texto atual de metodologia pelo modelo sugerido?')
                      ) {
                        return;
                      }
                      patchDraft({ methodology_notes: SUGGESTED_METHODOLOGY_TEMPLATE });
                    }}
                  >
                    Aplicar modelo sugerido
                  </button>
                ) : null}
              </div>
            </div>

            <h3 style={{ marginTop: '1rem', fontSize: '0.95rem', color: '#1e3a8a' }}>
              Cronograma previsto
            </h3>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Mobilização</label>
                <input
                  value={draft.mobilization_deadline_text}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ mobilization_deadline_text: e.target.value })}
                  placeholder="Ex.: 1 dia"
                />
              </div>
              <div className={styles.field}>
                <label>Campo / aquisição</label>
                <input
                  value={draft.field_duration_text}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ field_duration_text: e.target.value })}
                  placeholder="Ex.: 2 dias"
                />
              </div>
              <div className={styles.field}>
                <label>Processamento</label>
                <input
                  value={draft.processing_deadline_text}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ processing_deadline_text: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Entrega</label>
                <input
                  value={draft.delivery_deadline_text}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ delivery_deadline_text: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Prazo global (estruturado)</label>
                <input
                  value={draft.total_deadline_text}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ total_deadline_text: e.target.value })}
                  placeholder="Se vazio, usa o prazo estimado"
                />
              </div>
            </div>

            <h3 style={{ marginTop: '1rem', fontSize: '0.95rem', color: '#1e3a8a' }}>
              Identificação profissional (PDF)
            </h3>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Nome</label>
                <input
                  value={draft.professional_name}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ professional_name: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>Título / função</label>
                <input
                  value={draft.professional_title}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ professional_title: e.target.value })}
                  placeholder="Ex.: Engenheiro Agrimensor"
                />
              </div>
              <div className={styles.field}>
                <label>Conselho</label>
                <select
                  value={draft.professional_council}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ professional_council: e.target.value })}
                >
                  <option value="">—</option>
                  <option value="CREA">CREA</option>
                  <option value="CFT/CRT">CFT/CRT</option>
                  <option value="CAU">CAU</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Registro</label>
                <input
                  value={draft.professional_registration}
                  disabled={readOnly}
                  onChange={(e) => patchDraft({ professional_registration: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label>UF do registro</label>
                <input
                  value={draft.professional_registration_uf}
                  disabled={readOnly}
                  maxLength={2}
                  onChange={(e) =>
                    patchDraft({ professional_registration_uf: e.target.value.toUpperCase() })
                  }
                />
              </div>
            </div>

            <div className={styles.scopeSection}>
              <h3 className={styles.scopeSectionTitle}>ESCOPO TÉCNICO E ENTREGÁVEIS</h3>
              <QuoteScopeMultiSelect
                title="Equipamentos e recursos técnicos"
                searchPlaceholder="Pesquisar equipamento ou software…"
                catalog={technicalResourcesCatalog}
                selected={draft.technical_resources}
                maxItems={QUOTE_SCOPE_MAX_TECHNICAL_RESOURCES}
                disabled={readOnly}
                onChange={(technical_resources) => patchDraft({ technical_resources })}
              />
              <QuoteScopeMultiSelect
                title="Produtos e dados entregues"
                searchPlaceholder="Pesquisar produto entregue…"
                catalog={deliverablesCatalog}
                selected={draft.deliverables}
                maxItems={QUOTE_SCOPE_MAX_DELIVERABLES}
                disabled={readOnly}
                onChange={(deliverables) => patchDraft({ deliverables })}
              />
            </div>
          </div>
        ) : null}
      </section>

      <div className={styles.stagesHead}>
        <h2>Etapas</h2>
        <button type="button" className={styles.btnPrimary} disabled={readOnly} onClick={addStage}>
          <Plus width={14} height={14} /> Nova etapa
        </button>
      </div>

      {stages.length === 0 ? (
        <div className={styles.emptyStagesBox}>
          <p>
            Nenhuma etapa adicionada. Clique em “Nova etapa” para estruturar este orçamento.
          </p>
          <button type="button" className={styles.btnPrimary} disabled={readOnly} onClick={addStage}>
            <Plus width={14} height={14} /> Nova etapa
          </button>
        </div>
      ) : null}

      {stages.map((stage) => {
        const calcItems = stage.items.map((it) => ({
          quantity: it.quantity,
          unit_value: it.adopted_price,
          reference_price: it.reference_price,
        }));
        const subtotal = stageSubtotal(calcItems, bdiPercent);
        const pctBudget = stagePercentOfBudget(subtotal, financials.totalWithBdi);
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
                <span>
                  % orçamento: <strong>{pctBudget.toFixed(2)}%</strong>
                </span>
              </div>
              <div className={styles.stageActions}>
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

            {user?.id ? (
              <QuoteCatalogPicker
                userId={user.id}
                databases={databases}
                disabled={readOnly}
                onPick={(item) => addFromCatalog(stage.localKey, item)}
                onCreateCustom={() => setCustomModalStageKey(stage.localKey)}
              />
            ) : null}

            {stage.items.length === 0 ? (
              <div className={styles.emptyStage}>Nenhum item nesta etapa. Pesquise no catálogo acima.</div>
            ) : (
              <VirtualItemsBody
                items={stage.items}
                stages={stages}
                currentStageKey={stage.localKey}
                bdiPercent={bdiPercent}
                readOnly={readOnly}
                onChangeItem={(itemKey, patch) =>
                  setStages((prev) =>
                    prev.map((s) =>
                      s.localKey !== stage.localKey
                        ? s
                        : {
                            ...s,
                            items: s.items.map((it) => {
                              if (it.localKey !== itemKey) return it;
                              const next = { ...it, ...patch };
                              if (patch.adopted_price != null) {
                                next.unit_value = patch.adopted_price;
                                next.adopted_price = patch.adopted_price;
                              }
                              return next;
                            }),
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
                onDuplicateItem={(itemKey) => duplicateItem(stage.localKey, itemKey)}
                onMoveItem={(itemKey, toStageKey) =>
                  moveItemToStage(stage.localKey, itemKey, toStageKey)
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

      <aside
        className={`${styles.financeBar}${financeOpen ? '' : ` ${styles.financeBarCollapsed}`}`}
        aria-label="Resumo financeiro"
      >
        <button
          type="button"
          className={styles.financeBarToggle}
          aria-expanded={financeOpen}
          onClick={() => setFinanceOpen((v) => !v)}
        >
          <span>Resumo financeiro · {formatCurrency(financials.totalGeral)}</span>
          {financeOpen ? <ChevronUp width={16} height={16} /> : <ChevronDown width={16} height={16} />}
        </button>
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
            <label>Total Geral (c/ BDI)</label>
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
            <label>Margem (%)</label>
            <input
              type="number"
              step="0.01"
              value={draft.margin_percent}
              disabled={readOnly}
              onChange={(e) => patchDraft({ margin_percent: e.target.value })}
            />
            <span className={styles.muted}>{formatCurrency(financials.marginValue)}</span>
            <div style={{ marginTop: '0.35rem' }}>
              <strong>{formatCurrency(financials.totalGeral)}</strong>
              <span className={styles.muted}> líquido</span>
            </div>
          </div>
        </div>
      </aside>

      {user?.id ? (
        <QuoteCustomItemModal
          open={Boolean(customModalStageKey)}
          userId={user.id}
          onClose={() => setCustomModalStageKey(null)}
          onCreated={(item) => {
            if (customModalStageKey) addFromCustom(customModalStageKey, item);
          }}
        />
      ) : null}

      <QuoteDeleteConfirmModal
        key={quoteMeta.id}
        open={deleteOpen}
        code={quoteMeta.code}
        busy={busy}
        error={deleteError}
        onClose={() => {
          if (!busy) {
            setDeleteOpen(false);
            setDeleteError(null);
          }
        }}
        onConfirm={(typed) => void handleHardDelete(typed)}
      />

      {user?.id && id ? (
        <QuoteSendEmailModal
          open={emailOpen}
          quoteCode={quoteMeta.code}
          defaultTo={draft?.email || ''}
          userId={user.id}
          quoteId={String(id)}
          onClose={() => setEmailOpen(false)}
        />
      ) : null}
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
