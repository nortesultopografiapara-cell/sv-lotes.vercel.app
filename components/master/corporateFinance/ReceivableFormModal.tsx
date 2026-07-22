'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import {
  CORPORATE_PAYMENT_METHODS,
  corporatePaymentMethodLabel,
  type MasterCorporateReceivable,
} from '@/lib/master/corporateFinance/arApTypes';
import type { ReceivableProjectContext } from '@/lib/master/corporateFinance/projectContextService';
import type {
  MasterCorporateCostCenter,
  MasterCorporateFinancialAccount,
  MasterCorporateFinancialCategory,
} from '@/lib/master/corporateFinance/types';
import { computeLiveNet, formatCurrency, todayISO } from './format';
import styles from './corporateFinance.module.css';

type LookupProject = {
  id: string;
  code: string;
  title: string;
  client_name?: string;
  contract_value?: number;
  valor_recebido?: number;
  saldo_receber?: number;
};

type ClientSuggestion = {
  key: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
};

type FormState = {
  description: string;
  customer_name: string;
  customer_document: string;
  customer_phone: string;
  customer_email: string;
  category_id: string;
  project_id: string;
  quote_id: string;
  cost_center_id: string;
  financial_account_id: string;
  issue_date: string;
  competence_date: string;
  due_date: string;
  original_amount: string;
  discount_amount: string;
  interest_amount: string;
  fine_amount: string;
  payment_method: string;
  notes: string;
  status: 'DRAFT' | 'OPEN';
};

type DirtyKey = keyof FormState;

type OriginMode = 'project' | 'avulso';

type Props = {
  open: boolean;
  editing: MasterCorporateReceivable | null;
  categories: MasterCorporateFinancialCategory[];
  accounts: MasterCorporateFinancialAccount[];
  costCenters: MasterCorporateCostCenter[];
  projects: LookupProject[];
  initialProjectId?: string | null;
  qs: () => string;
  bodyAuth: () => Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void;
};

const AUTOFILL_KEYS: DirtyKey[] = [
  'description',
  'customer_name',
  'customer_phone',
  'customer_email',
  'project_id',
  'quote_id',
  'category_id',
  'cost_center_id',
  'financial_account_id',
  'payment_method',
  'original_amount',
];

const EMPTY_FORM = (): FormState => {
  const t = todayISO();
  return {
    description: '',
    customer_name: '',
    customer_document: '',
    customer_phone: '',
    customer_email: '',
    category_id: '',
    project_id: '',
    quote_id: '',
    cost_center_id: '',
    financial_account_id: '',
    issue_date: t,
    competence_date: t,
    due_date: t,
    original_amount: '0',
    discount_amount: '0',
    interest_amount: '0',
    fine_amount: '0',
    payment_method: '',
    notes: '',
    status: 'OPEN',
  };
};

function fromReceivable(r: MasterCorporateReceivable): FormState {
  return {
    description: r.description || '',
    customer_name: r.customer_name || '',
    customer_document: r.customer_document || '',
    customer_phone: r.customer_phone || '',
    customer_email: r.customer_email || '',
    category_id: r.category_id || '',
    project_id: r.project_id || '',
    quote_id: r.quote_id || '',
    cost_center_id: r.cost_center_id || '',
    financial_account_id: r.financial_account_id || '',
    issue_date: r.issue_date?.slice(0, 10) || todayISO(),
    competence_date: r.competence_date?.slice(0, 10) || todayISO(),
    due_date: r.due_date?.slice(0, 10) || todayISO(),
    original_amount: String(r.original_amount ?? 0),
    discount_amount: String(r.discount_amount ?? 0),
    interest_amount: String(r.interest_amount ?? 0),
    fine_amount: String(r.fine_amount ?? 0),
    payment_method: r.payment_method || '',
    notes: r.notes || '',
    status: r.status === 'DRAFT' ? 'DRAFT' : 'OPEN',
  };
}

function projectOptionLabel(p: LookupProject): string {
  const saldo = p.saldo_receber != null ? formatCurrency(p.saldo_receber) : 'R$ 0,00';
  return `${p.code} · ${p.title} · ${p.client_name || '—'} · Saldo ${saldo}`;
}

export default function ReceivableFormModal({
  open,
  editing,
  categories,
  accounts,
  costCenters,
  projects,
  initialProjectId,
  qs,
  bodyAuth,
  onClose,
  onSaved,
}: Props) {
  const [origin, setOrigin] = useState<OriginMode>('avulso');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [dirty, setDirty] = useState<Set<DirtyKey>>(() => new Set());
  const [projectFilter, setProjectFilter] = useState('');
  const [context, setContext] = useState<ReceivableProjectContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [quoteCode, setQuoteCode] = useState<string | null>(null);
  const [allowOverProvision, setAllowOverProvision] = useState(false);
  const [overProvisionReason, setOverProvisionReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientMode, setClientMode] = useState<'search' | 'manual'>('search');
  const [clientQuery, setClientQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ClientSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const dirtyRef = useRef(dirty);
  const initKeyRef = useRef<string | null>(null);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const liveNet = useMemo(
    () =>
      computeLiveNet({
        original: form.original_amount,
        discount: form.discount_amount,
        interest: form.interest_amount,
        fine: form.fine_amount,
      }),
    [form.original_amount, form.discount_amount, form.interest_amount, form.fine_amount],
  );

  const unprovisioned = context?.unprovisioned_balance ?? 0;
  const showOverProvision =
    origin === 'project' && Number(form.original_amount || 0) > unprovisioned + 0.001;

  const filteredProjects = useMemo(() => {
    const q = projectFilter.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const hay = `${p.code} ${p.title} ${p.client_name || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [projects, projectFilter]);

  const markDirty = useCallback((key: DirtyKey) => {
    setDirty((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const setField = useCallback(
    (key: DirtyKey, value: string) => {
      markDirty(key);
      setForm((f) => ({ ...f, [key]: value }));
    },
    [markDirty],
  );

  const applyContextAutofill = useCallback(
    (ctx: ReceivableProjectContext, force = false) => {
      const d = dirtyRef.current;
      const can = (key: DirtyKey) => force || !d.has(key);

      setForm((f) => {
        const next = { ...f };
        if (can('description')) next.description = ctx.suggested_description || next.description;
        if (can('customer_name')) next.customer_name = ctx.project.client_name || next.customer_name;
        if (can('customer_phone')) {
          next.customer_phone = ctx.project.client_phone || next.customer_phone;
        }
        if (can('customer_email')) {
          next.customer_email = ctx.project.client_email || next.customer_email;
        }
        if (can('project_id')) next.project_id = ctx.project.id;
        if (can('quote_id')) next.quote_id = ctx.quote?.id || '';
        if (can('category_id') && ctx.suggested_category_id) {
          next.category_id = ctx.suggested_category_id;
        }
        if (can('cost_center_id') && ctx.suggested_cost_center_id) {
          next.cost_center_id = ctx.suggested_cost_center_id;
        }
        if (can('financial_account_id') && ctx.suggested_financial_account_id) {
          next.financial_account_id = ctx.suggested_financial_account_id;
        }
        if (can('payment_method') && ctx.suggested_payment_method) {
          next.payment_method = ctx.suggested_payment_method;
        }
        if (can('original_amount')) {
          next.original_amount = String(ctx.unprovisioned_balance ?? 0);
        }
        return next;
      });

      setQuoteCode(ctx.quote?.code || null);

      if (force) {
        setDirty((prev) => {
          const next = new Set(prev);
          for (const k of AUTOFILL_KEYS) next.delete(k);
          return next;
        });
      }
    },
    [],
  );

  const loadProjectContext = useCallback(
    async (projectId: string, opts?: { force?: boolean; autofill?: boolean }) => {
      if (!projectId) {
        setContext(null);
        setQuoteCode(null);
        return;
      }
      setContextLoading(true);
      setContextError(null);
      try {
        const res = await fetch(
          `/api/master/corporate-finance/receivables/project-context?${qs()}&projectId=${encodeURIComponent(projectId)}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha ao carregar contexto do projeto.');
        const ctx = data.context as ReceivableProjectContext;
        setContext(ctx);
        if (ctx.quote?.code) setQuoteCode(ctx.quote.code);
        else if (opts?.autofill !== false) setQuoteCode(null);
        if (opts?.autofill !== false) {
          applyContextAutofill(ctx, opts?.force === true);
        }
      } catch (err) {
        setContext(null);
        setContextError(err instanceof Error ? err.message : 'Erro ao carregar contexto.');
      } finally {
        setContextLoading(false);
      }
    },
    [qs, applyContextAutofill],
  );

  useEffect(() => {
    if (!open) {
      initKeyRef.current = null;
      return;
    }
    const key = editing ? `edit:${editing.id}` : `create:${initialProjectId || ''}`;
    if (initKeyRef.current === key) return;
    initKeyRef.current = key;

    /* eslint-disable react-hooks/set-state-in-effect -- reset/load form when modal opens */
    setError(null);
    setContextError(null);
    setAllowOverProvision(false);
    setOverProvisionReason('');
    setProjectFilter('');
    setClientQuery('');
    setSuggestions([]);
    setDirty(new Set());
    setContext(null);
    setQuoteCode(null);

    if (editing) {
      const next = fromReceivable(editing);
      setForm(next);
      const hasProject = Boolean(editing.project_id);
      setOrigin(hasProject ? 'project' : 'avulso');
      setClientMode('manual');
      if (editing.project_id) {
        void loadProjectContext(editing.project_id, { autofill: false });
      }
    } else {
      setForm(EMPTY_FORM());
      const seed = initialProjectId?.trim() || '';
      if (seed) {
        setOrigin('project');
        setClientMode('manual');
        setForm((f) => ({ ...f, project_id: seed }));
        void loadProjectContext(seed, { force: true });
      } else {
        setOrigin('avulso');
        setClientMode('search');
      }
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, editing, initialProjectId, loadProjectContext]);

  useEffect(() => {
    if (!open || origin !== 'avulso' || clientMode !== 'search') return;
    const q = clientQuery.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear suggestions
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setSuggestLoading(true);
        try {
          const res = await fetch(
            `/api/master/corporate-finance/receivables/client-suggestions?${qs()}&q=${encodeURIComponent(q)}`,
          );
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Falha na busca de clientes.');
          if (!cancelled) setSuggestions((data.clients || []) as ClientSuggestion[]);
        } catch {
          if (!cancelled) setSuggestions([]);
        } finally {
          if (!cancelled) setSuggestLoading(false);
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, origin, clientMode, clientQuery, qs]);

  function hasDirtyAutofill(): boolean {
    for (const k of AUTOFILL_KEYS) {
      if (dirty.has(k)) return true;
    }
    return false;
  }

  async function selectProject(nextId: string) {
    if (!nextId) {
      setForm((f) => ({ ...f, project_id: '', quote_id: '' }));
      setContext(null);
      setQuoteCode(null);
      markDirty('project_id');
      return;
    }
    if (form.project_id && form.project_id !== nextId && hasDirtyAutofill()) {
      const ok = window.confirm(
        'Trocar o projeto substituirá os dados preenchidos automaticamente. Deseja continuar?',
      );
      if (!ok) return;
      markDirty('project_id');
      setForm((f) => ({ ...f, project_id: nextId }));
      await loadProjectContext(nextId, { force: true });
      return;
    }
    markDirty('project_id');
    setForm((f) => ({ ...f, project_id: nextId }));
    await loadProjectContext(nextId, { force: false });
  }

  function switchOrigin(next: OriginMode) {
    if (next === origin) return;
    setOrigin(next);
    if (next === 'avulso') {
      setForm((f) => ({ ...f, project_id: '', quote_id: '' }));
      setContext(null);
      setQuoteCode(null);
      setContextError(null);
      setClientMode('search');
      setClientQuery('');
      setSuggestions([]);
      setAllowOverProvision(false);
      setOverProvisionReason('');
    } else {
      setClientMode('manual');
    }
  }

  function pickSuggestion(s: ClientSuggestion) {
    setForm((f) => ({
      ...f,
      customer_name: s.customer_name,
      customer_phone: s.customer_phone || '',
      customer_email: s.customer_email || '',
    }));
    setDirty((prev) => {
      const next = new Set(prev);
      next.add('customer_name');
      next.add('customer_phone');
      next.add('customer_email');
      return next;
    });
    setSuggestions([]);
    setClientQuery(s.customer_name);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...bodyAuth(),
        description: form.description,
        customer_name: form.customer_name,
        customer_document: form.customer_document || null,
        customer_phone: form.customer_phone || null,
        customer_email: form.customer_email || null,
        category_id: form.category_id,
        project_id: origin === 'project' ? form.project_id || null : null,
        quote_id: origin === 'project' ? form.quote_id || null : null,
        cost_center_id: form.cost_center_id || null,
        financial_account_id: form.financial_account_id || null,
        issue_date: form.issue_date,
        competence_date: form.competence_date,
        due_date: form.due_date,
        original_amount: Number(form.original_amount || 0),
        discount_amount: Number(form.discount_amount || 0),
        interest_amount: Number(form.interest_amount || 0),
        fine_amount: Number(form.fine_amount || 0),
        payment_method: form.payment_method || null,
        notes: form.notes || null,
        status: editing ? undefined : form.status,
        allow_over_provision: showOverProvision ? allowOverProvision : false,
        over_provision_reason:
          showOverProvision && allowOverProvision ? overProvisionReason.trim() || null : null,
      };
      const url = editing
        ? `/api/master/corporate-finance/receivables/${editing.id}`
        : '/api/master/corporate-finance/receivables';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
      <div className={`${styles.modal} ${styles.modalLg}`}>
        <div className={styles.modalHead}>
          <h3 className={styles.modalTitle}>
            {editing ? `Editar ${editing.code}` : 'Nova conta a receber'}
          </h3>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={styles.modalBody}>
          {error ? <p className={styles.error}>{error}</p> : null}
          {contextError ? <p className={styles.error}>{contextError}</p> : null}

          {/* Origem */}
          <div>
            <label className={styles.label}>Origem</label>
            <div className={styles.originRow}>
              <label className={styles.checkRow}>
                <input
                  type="radio"
                  name="receivable-origin"
                  checked={origin === 'project'}
                  onChange={() => switchOrigin('project')}
                />
                Projeto
              </label>
              <label className={styles.checkRow}>
                <input
                  type="radio"
                  name="receivable-origin"
                  checked={origin === 'avulso'}
                  onChange={() => switchOrigin('avulso')}
                />
                Avulso
              </label>
            </div>
          </div>

          {/* Projeto / Cliente */}
          {origin === 'project' ? (
            <div>
              <label className={styles.label}>Projeto *</label>
              <input
                className={styles.input}
                placeholder="Filtrar por código, título ou cliente…"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                style={{ marginBottom: '0.45rem' }}
              />
              <select
                className={styles.select}
                value={form.project_id}
                onChange={(e) => void selectProject(e.target.value)}
              >
                <option value="">Selecione…</option>
                {filteredProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {projectOptionLabel(p)}
                  </option>
                ))}
              </select>
              {contextLoading ? <p className={styles.dirtyHint}>Carregando dados do projeto…</p> : null}

              {form.quote_id || quoteCode ? (
                <div style={{ marginTop: '0.65rem' }}>
                  <label className={styles.label}>Orçamento</label>
                  <p className={styles.dirtyHint} style={{ marginBottom: '0.25rem' }}>
                    {quoteCode || form.quote_id}
                    {form.quote_id ? (
                      <>
                        {' · '}
                        <Link href={`/master/topography/budgets/${form.quote_id}`} target="_blank">
                          Abrir orçamento
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
              ) : form.project_id && !contextLoading ? (
                <p className={styles.dirtyHint} style={{ marginTop: '0.5rem' }}>
                  Nenhum orçamento vinculado — campo opcional.
                </p>
              ) : null}
            </div>
          ) : (
            <div>
              <label className={styles.label}>Cliente</label>
              {clientMode === 'search' ? (
                <>
                  <input
                    className={styles.input}
                    placeholder="Buscar cliente (mín. 2 caracteres)…"
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                  />
                  {suggestLoading ? <p className={styles.dirtyHint}>Buscando…</p> : null}
                  {suggestions.length > 0 ? (
                    <ul className={styles.suggestList}>
                      {suggestions.map((s) => (
                        <li key={s.key}>
                          <button type="button" onClick={() => pickSuggestion(s)}>
                            <strong>{s.customer_name}</strong>
                            {(s.customer_phone || s.customer_email) && (
                              <span>
                                {[s.customer_phone, s.customer_email].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => {
                      setClientMode('manual');
                      setSuggestions([]);
                    }}
                  >
                    Cadastrar dados manualmente
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  onClick={() => {
                    setClientMode('search');
                    setClientQuery(form.customer_name || '');
                  }}
                >
                  Buscar cliente existente
                </button>
              )}
            </div>
          )}

          {/* Resumo financeiro (projeto) */}
          {origin === 'project' && context ? (
            <div className={styles.summaryBox}>
              <p>
                <strong>Valor contratado:</strong> {formatCurrency(context.contract_value)}
              </p>
              <p>
                <strong>Recebido:</strong> {formatCurrency(context.valor_recebido)}
              </p>
              <p>
                <strong>Saldo a receber:</strong> {formatCurrency(context.saldo_receber)}
              </p>
              <p>
                <strong>Títulos provisionados:</strong> {context.receivables_count}
              </p>
              <p>
                <strong>Total provisionado:</strong> {formatCurrency(context.provisioned_total)}
              </p>
              <p>
                <strong>Saldo não provisionado:</strong>{' '}
                {formatCurrency(context.unprovisioned_balance)}
              </p>
            </div>
          ) : null}

          {/* Dados cliente */}
          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>Cliente *</label>
              <input
                className={styles.input}
                value={form.customer_name}
                onChange={(e) => setField('customer_name', e.target.value)}
              />
            </div>
            <div>
              <label className={styles.label}>Documento</label>
              <input
                className={styles.input}
                value={form.customer_document}
                onChange={(e) => setField('customer_document', e.target.value)}
              />
            </div>
          </div>
          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>Telefone</label>
              <input
                className={styles.input}
                value={form.customer_phone}
                onChange={(e) => setField('customer_phone', e.target.value)}
              />
            </div>
            <div>
              <label className={styles.label}>E-mail</label>
              <input
                className={styles.input}
                type="email"
                value={form.customer_email}
                onChange={(e) => setField('customer_email', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={styles.label}>Descrição *</label>
            <input
              className={styles.input}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
          </div>

          {/* Categoria / centro / conta */}
          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>Categoria *</label>
              <select
                className={styles.select}
                value={form.category_id}
                onChange={(e) => setField('category_id', e.target.value)}
              >
                <option value="">Selecione…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={styles.label}>Centro de resultado</label>
              <select
                className={styles.select}
                value={form.cost_center_id}
                onChange={(e) => setField('cost_center_id', e.target.value)}
              >
                <option value="">—</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={styles.label}>Conta financeira</label>
            <select
              className={styles.select}
              value={form.financial_account_id}
              onChange={(e) => setField('financial_account_id', e.target.value)}
            >
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Datas */}
          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>Emissão</label>
              <input
                className={styles.input}
                type="date"
                value={form.issue_date}
                onChange={(e) => setField('issue_date', e.target.value)}
              />
            </div>
            <div>
              <label className={styles.label}>Competência</label>
              <input
                className={styles.input}
                type="date"
                value={form.competence_date}
                onChange={(e) => setField('competence_date', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className={styles.label}>Vencimento *</label>
            <input
              className={styles.input}
              type="date"
              value={form.due_date}
              onChange={(e) => setField('due_date', e.target.value)}
            />
          </div>

          {/* Valores */}
          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>Valor original *</label>
              <input
                className={styles.input}
                type="number"
                step="0.01"
                min="0"
                value={form.original_amount}
                onChange={(e) => setField('original_amount', e.target.value)}
              />
            </div>
            <div>
              <label className={styles.label}>Desconto</label>
              <input
                className={styles.input}
                type="number"
                step="0.01"
                min="0"
                value={form.discount_amount}
                onChange={(e) => setField('discount_amount', e.target.value)}
              />
            </div>
          </div>
          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>Juros</label>
              <input
                className={styles.input}
                type="number"
                step="0.01"
                min="0"
                value={form.interest_amount}
                onChange={(e) => setField('interest_amount', e.target.value)}
              />
            </div>
            <div>
              <label className={styles.label}>Multa</label>
              <input
                className={styles.input}
                type="number"
                step="0.01"
                min="0"
                value={form.fine_amount}
                onChange={(e) => setField('fine_amount', e.target.value)}
              />
            </div>
          </div>
          <p className={styles.netHint}>Valor líquido: {formatCurrency(liveNet)}</p>

          {showOverProvision ? (
            <div>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={allowOverProvision}
                  onChange={(e) => setAllowOverProvision(e.target.checked)}
                />
                Permitir provisionar acima do saldo do projeto (exceção)
              </label>
              {allowOverProvision ? (
                <div style={{ marginTop: '0.5rem' }}>
                  <label className={styles.label}>Justificativa *</label>
                  <textarea
                    className={styles.textarea}
                    value={overProvisionReason}
                    onChange={(e) => setOverProvisionReason(e.target.value)}
                    placeholder="Mínimo 5 caracteres"
                  />
                </div>
              ) : (
                <p className={styles.dirtyHint}>
                  Valor acima do saldo não provisionado ({formatCurrency(unprovisioned)}). Marque a
                  exceção ou ajuste o valor.
                </p>
              )}
            </div>
          ) : null}

          {/* Forma pagamento */}
          <div>
            <label className={styles.label}>Forma de pagamento</label>
            <select
              className={styles.select}
              value={form.payment_method}
              onChange={(e) => setField('payment_method', e.target.value)}
            >
              <option value="">—</option>
              {CORPORATE_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {corporatePaymentMethodLabel(m)}
                </option>
              ))}
            </select>
          </div>

          {!editing ? (
            <div>
              <label className={styles.label}>Status inicial</label>
              <select
                className={styles.select}
                value={form.status}
                onChange={(e) =>
                  setField('status', e.target.value === 'DRAFT' ? 'DRAFT' : 'OPEN')
                }
              >
                <option value="OPEN">Em aberto</option>
                <option value="DRAFT">Rascunho</option>
              </select>
            </div>
          ) : null}

          {/* Observações */}
          <div>
            <label className={styles.label}>Observações</label>
            <textarea
              className={styles.textarea}
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
            />
          </div>
        </div>

        <div className={styles.modalFoot}>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onClose}>
            Fechar
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
