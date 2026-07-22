'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { TOPOGRAPHY_CATEGORIES } from '@/lib/master/topography/categories';
import { TOPOGRAPHY_QUOTE_STATUSES } from '@/lib/master/topography/quoteStatuses';
import { TOPOGRAPHY_SERVICE_TYPES } from '@/lib/master/topography/serviceTypes';
import type { MasterTopographyQuote } from '@/lib/master/topography/quoteTypes';
import styles from '../projects/topographyProjects.module.css';

export type QuoteFormState = {
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
  estimated_value: string;
  discount_value: string;
  final_value: string;
  payment_method: string;
  payment_terms: string;
  internal_manager: string;
  internal_notes: string;
  technical_notes: string;
};

export function emptyQuoteForm(): QuoteFormState {
  return {
    client_name: '',
    contact_name: '',
    phone: '',
    email: '',
    city: '',
    state: '',
    address: '',
    distance_km: '',
    category: 'TOPOGRAFIA',
    service_type: 'LEVANTAMENTO_TOPOGRAFICO',
    description: '',
    status: 'RASCUNHO',
    proposal_date: '',
    expiration_date: '',
    estimated_deadline: '',
    estimated_value: '',
    discount_value: '0',
    final_value: '',
    payment_method: '',
    payment_terms: '',
    internal_manager: '',
    internal_notes: '',
    technical_notes: '',
  };
}

export function quoteToForm(q: MasterTopographyQuote): QuoteFormState {
  return {
    client_name: q.client_name,
    contact_name: q.contact_name || '',
    phone: q.phone || '',
    email: q.email || '',
    city: q.city || '',
    state: q.state || '',
    address: q.address || '',
    distance_km: q.distance_km == null ? '' : String(q.distance_km),
    category: q.category,
    service_type: q.service_type,
    description: q.description || '',
    status: q.status === 'CONVERTIDO' ? 'APROVADO' : q.status,
    proposal_date: q.proposal_date || '',
    expiration_date: q.expiration_date || '',
    estimated_deadline: q.estimated_deadline || '',
    estimated_value: q.estimated_value == null ? '' : String(q.estimated_value),
    discount_value: String(q.discount_value ?? 0),
    final_value: q.final_value == null ? '' : String(q.final_value),
    payment_method: q.payment_method || '',
    payment_terms: q.payment_terms || '',
    internal_manager: q.internal_manager || '',
    internal_notes: q.internal_notes || '',
    technical_notes: q.technical_notes || '',
  };
}

export function formToQuotePayload(form: QuoteFormState) {
  const estimated =
    form.estimated_value === '' ? null : Number(form.estimated_value);
  const discount = form.discount_value === '' ? 0 : Number(form.discount_value);
  let finalValue = form.final_value === '' ? null : Number(form.final_value);
  if (finalValue == null && estimated != null) {
    finalValue = Math.round((estimated - discount) * 100) / 100;
  }
  return {
    client_name: form.client_name,
    contact_name: form.contact_name || null,
    phone: form.phone || null,
    email: form.email || null,
    city: form.city || null,
    state: form.state || null,
    address: form.address || null,
    distance_km: form.distance_km === '' ? null : Number(form.distance_km),
    category: form.category,
    service_type: form.service_type,
    description: form.description || null,
    status: form.status,
    proposal_date: form.proposal_date || null,
    expiration_date: form.expiration_date || null,
    estimated_deadline: form.estimated_deadline || null,
    estimated_value: estimated,
    discount_value: discount,
    final_value: finalValue,
    payment_method: form.payment_method || null,
    payment_terms: form.payment_terms || null,
    internal_manager: form.internal_manager || null,
    internal_notes: form.internal_notes || null,
    technical_notes: form.technical_notes || null,
  };
}

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: MasterTopographyQuote | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: ReturnType<typeof formToQuotePayload>) => void;
};

export function TopographyQuoteFormModal({
  open,
  mode,
  initial,
  saving,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<QuoteFormState>(emptyQuoteForm);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(initial ? quoteToForm(initial) : emptyQuoteForm());
    setFormKey((k) => k + 1);
  }, [open, initial]);

  const liveFinal = useMemo(() => {
    const estimated = form.estimated_value === '' ? null : Number(form.estimated_value);
    const discount = form.discount_value === '' ? 0 : Number(form.discount_value);
    if (form.final_value !== '') {
      const n = Number(form.final_value);
      return Number.isFinite(n) ? n : 0;
    }
    if (estimated == null || !Number.isFinite(estimated)) return 0;
    return Math.round((estimated - (Number.isFinite(discount) ? discount : 0)) * 100) / 100;
  }, [form.estimated_value, form.discount_value, form.final_value]);

  if (!open) return null;

  const set =
    (key: keyof QuoteFormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
    };

  const editableStatuses = TOPOGRAPHY_QUOTE_STATUSES.filter((s) => s.code !== 'CONVERTIDO');

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            {mode === 'create' ? 'Novo Orçamento' : `Editar ${initial?.code || 'orçamento'}`}
          </h2>
          <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={saving}>
            Fechar
          </button>
        </div>
        <form
          key={formKey}
          className={styles.modalBody}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(formToQuotePayload(form));
          }}
        >
          {error ? <div className={styles.errorBanner}>{error}</div> : null}

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Identificação / Serviço</h3>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>
                  Categoria <span className={styles.required}>*</span>
                </label>
                <select className={styles.select} value={form.category} onChange={set('category')}>
                  {TOPOGRAPHY_CATEGORIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>
                  Tipo de serviço <span className={styles.required}>*</span>
                </label>
                <select
                  className={styles.select}
                  value={form.service_type}
                  onChange={set('service_type')}
                >
                  {TOPOGRAPHY_SERVICE_TYPES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>
                  Status <span className={styles.required}>*</span>
                </label>
                <select className={styles.select} value={form.status} onChange={set('status')}>
                  {editableStatuses.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Responsável interno</label>
                <input
                  className={styles.input}
                  value={form.internal_manager}
                  onChange={set('internal_manager')}
                />
              </div>
              <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
                <label>Descrição</label>
                <textarea value={form.description} onChange={set('description')} />
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Cliente</h3>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>
                  Cliente <span className={styles.required}>*</span>
                </label>
                <input
                  className={styles.input}
                  value={form.client_name}
                  onChange={set('client_name')}
                  required
                />
              </div>
              <div className={styles.field}>
                <label>Contato</label>
                <input
                  className={styles.input}
                  value={form.contact_name}
                  onChange={set('contact_name')}
                />
              </div>
              <div className={styles.field}>
                <label>Telefone</label>
                <input className={styles.input} value={form.phone} onChange={set('phone')} />
              </div>
              <div className={styles.field}>
                <label>E-mail</label>
                <input
                  className={styles.input}
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                />
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Localização</h3>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>Município</label>
                <input className={styles.input} value={form.city} onChange={set('city')} />
              </div>
              <div className={styles.field}>
                <label>UF</label>
                <input
                  className={styles.input}
                  value={form.state}
                  onChange={set('state')}
                  maxLength={2}
                />
              </div>
              <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
                <label>Endereço</label>
                <input className={styles.input} value={form.address} onChange={set('address')} />
              </div>
              <div className={styles.field}>
                <label>Distância (km)</label>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.distance_km}
                  onChange={set('distance_km')}
                />
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Prazo e validade</h3>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>Data da proposta</label>
                <input
                  className={styles.input}
                  type="date"
                  value={form.proposal_date}
                  onChange={set('proposal_date')}
                />
              </div>
              <div className={styles.field}>
                <label>Validade da proposta</label>
                <input
                  className={styles.input}
                  type="date"
                  value={form.expiration_date}
                  onChange={set('expiration_date')}
                />
              </div>
              <div className={styles.field}>
                <label>Prazo estimado</label>
                <input
                  className={styles.input}
                  value={form.estimated_deadline}
                  onChange={set('estimated_deadline')}
                  placeholder="Ex.: 15 dias úteis"
                />
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Valor</h3>
            <div className={styles.financeBlock}>
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label>Valor estimado (R$)</label>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.estimated_value}
                    onChange={set('estimated_value')}
                  />
                </div>
                <div className={styles.field}>
                  <label>Desconto (R$)</label>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.discount_value}
                    onChange={set('discount_value')}
                  />
                </div>
                <div className={styles.field}>
                  <label>Valor final (R$)</label>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.final_value}
                    onChange={set('final_value')}
                    placeholder={String(liveFinal)}
                  />
                </div>
                <div className={styles.field}>
                  <label>Valor final calculado</label>
                  <input
                    className={styles.input}
                    readOnly
                    value={new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    }).format(liveFinal)}
                  />
                </div>
                <div className={styles.field}>
                  <label>Forma de pagamento</label>
                  <input
                    className={styles.input}
                    value={form.payment_method}
                    onChange={set('payment_method')}
                  />
                </div>
                <div className={styles.field}>
                  <label>Condições de pagamento</label>
                  <input
                    className={styles.input}
                    value={form.payment_terms}
                    onChange={set('payment_terms')}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Observações</h3>
            <div className={styles.grid2}>
              <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
                <label>Notas internas</label>
                <textarea value={form.internal_notes} onChange={set('internal_notes')} />
              </div>
              <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
                <label>Informações técnicas</label>
                <textarea value={form.technical_notes} onChange={set('technical_notes')} />
              </div>
            </div>
          </section>

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
