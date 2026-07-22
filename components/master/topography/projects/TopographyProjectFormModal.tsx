'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { computeProjectFinancials } from '@/lib/master/topography/projectFinancials';
import { TOPOGRAPHY_CATEGORIES } from '@/lib/master/topography/categories';
import {
  TOPOGRAPHY_FINANCIAL_SITUATIONS,
  TOPOGRAPHY_ORIGINS,
} from '@/lib/master/topography/origins';
import { TOPOGRAPHY_PRIORITIES } from '@/lib/master/topography/priorities';
import { TOPOGRAPHY_SERVICE_TYPES } from '@/lib/master/topography/serviceTypes';
import { TOPOGRAPHY_STATUSES } from '@/lib/master/topography/statuses';
import type { MasterTopographyProject } from '@/lib/master/topography/types';
import styles from './topographyProjects.module.css';

export type ProjectFormState = {
  title: string;
  client_name: string;
  client_contact_name: string;
  client_phone: string;
  client_email: string;
  category: string;
  service_type: string;
  origin: string;
  description: string;
  status: string;
  priority: string;
  financial_situation: string;
  city: string;
  state: string;
  address: string;
  distance_from_parauapebas_km: string;
  contract_date: string;
  planned_start_date: string;
  planned_end_date: string;
  actual_end_date: string;
  contract_value: string;
  valor_recebido: string;
  payment_terms: string;
  origin_budget_number: string;
  internal_manager: string;
  technical_manager: string;
  team_notes: string;
  progress_percent: string;
  physical_progress_percent: string;
  current_stage: string;
  technical_notes: string;
  pending_items: string;
  next_action: string;
  next_action_date: string;
};

export function emptyProjectForm(): ProjectFormState {
  return {
    title: '',
    client_name: '',
    client_contact_name: '',
    client_phone: '',
    client_email: '',
    category: 'TOPOGRAFIA',
    service_type: 'LEVANTAMENTO_TOPOGRAFICO',
    origin: '',
    description: '',
    status: 'RASCUNHO',
    priority: 'NORMAL',
    financial_situation: 'NAO_FATURADO',
    city: '',
    state: '',
    address: '',
    distance_from_parauapebas_km: '',
    contract_date: '',
    planned_start_date: '',
    planned_end_date: '',
    actual_end_date: '',
    contract_value: '',
    valor_recebido: '0',
    payment_terms: '',
    origin_budget_number: '',
    internal_manager: '',
    technical_manager: '',
    team_notes: '',
    progress_percent: '0',
    physical_progress_percent: '0',
    current_stage: '',
    technical_notes: '',
    pending_items: '',
    next_action: '',
    next_action_date: '',
  };
}

export function projectToForm(project: MasterTopographyProject): ProjectFormState {
  return {
    title: project.title,
    client_name: project.client_name,
    client_contact_name: project.client_contact_name || '',
    client_phone: project.client_phone || '',
    client_email: project.client_email || '',
    category: project.category,
    service_type: project.service_type,
    origin: project.origin || '',
    description: project.description || '',
    status: project.status,
    priority: project.priority,
    financial_situation: project.financial_situation,
    city: project.city || '',
    state: project.state || '',
    address: project.address || '',
    distance_from_parauapebas_km:
      project.distance_from_parauapebas_km == null
        ? ''
        : String(project.distance_from_parauapebas_km),
    contract_date: project.contract_date || '',
    planned_start_date: project.planned_start_date || '',
    planned_end_date: project.planned_end_date || '',
    actual_end_date: project.actual_end_date || '',
    contract_value: project.contract_value == null ? '' : String(project.contract_value),
    valor_recebido: String(project.valor_recebido ?? 0),
    payment_terms: project.payment_terms || '',
    origin_budget_number: project.origin_budget_number || '',
    internal_manager: project.internal_manager || '',
    technical_manager: project.technical_manager || '',
    team_notes: project.team_notes || '',
    progress_percent: String(project.progress_percent ?? 0),
    physical_progress_percent: String(project.physical_progress_percent ?? 0),
    current_stage: project.current_stage || '',
    technical_notes: project.technical_notes || '',
    pending_items: project.pending_items || '',
    next_action: project.next_action || '',
    next_action_date: project.next_action_date || '',
  };
}

export function formToPayload(form: ProjectFormState) {
  return {
    title: form.title,
    client_name: form.client_name,
    client_contact_name: form.client_contact_name || null,
    client_phone: form.client_phone || null,
    client_email: form.client_email || null,
    category: form.category,
    service_type: form.service_type,
    origin: form.origin || null,
    description: form.description || null,
    status: form.status,
    priority: form.priority,
    financial_situation: form.financial_situation,
    city: form.city || null,
    state: form.state || null,
    address: form.address || null,
    distance_from_parauapebas_km: form.distance_from_parauapebas_km
      ? Number(form.distance_from_parauapebas_km)
      : null,
    contract_date: form.contract_date || null,
    planned_start_date: form.planned_start_date || null,
    planned_end_date: form.planned_end_date || null,
    actual_end_date: form.actual_end_date || null,
    contract_value: form.contract_value === '' ? null : Number(form.contract_value),
    valor_recebido: form.valor_recebido === '' ? 0 : Number(form.valor_recebido),
    payment_terms: form.payment_terms || null,
    origin_budget_number: form.origin_budget_number || null,
    internal_manager: form.internal_manager || null,
    technical_manager: form.technical_manager || null,
    team_notes: form.team_notes || null,
    progress_percent: Number(form.progress_percent || 0),
    physical_progress_percent: Number(form.physical_progress_percent || 0),
    current_stage: form.current_stage || null,
    technical_notes: form.technical_notes || null,
    pending_items: form.pending_items || null,
    next_action: form.next_action || null,
    next_action_date: form.next_action_date || null,
  };
}

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: MasterTopographyProject | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: ReturnType<typeof formToPayload>) => void;
};

export function TopographyProjectFormModal({
  open,
  mode,
  initial,
  saving,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<ProjectFormState>(() =>
    initial ? projectToForm(initial) : emptyProjectForm(),
  );
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset ao abrir modal
    setForm(initial ? projectToForm(initial) : emptyProjectForm());
    setFormKey((k) => k + 1);
  }, [open, initial]);

  const liveFinance = useMemo(() => {
    const contract = form.contract_value === '' ? null : Number(form.contract_value);
    const received = form.valor_recebido === '' ? 0 : Number(form.valor_recebido);
    return computeProjectFinancials(
      Number.isFinite(contract as number) ? contract : null,
      Number.isFinite(received) ? received : 0,
    );
  }, [form.contract_value, form.valor_recebido]);

  if (!open) return null;

  const set =
    (key: keyof ProjectFormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
    };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            {mode === 'create' ? 'Novo Projeto / Serviço' : `Editar ${initial?.code || 'projeto'}`}
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
            onSubmit(formToPayload(form));
          }}
        >
          {error ? <div className={styles.errorBanner}>{error}</div> : null}

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Identificação</h3>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>
                  Projeto <span className={styles.required}>*</span>
                </label>
                <input className={styles.input} value={form.title} onChange={set('title')} required />
              </div>
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
                  {TOPOGRAPHY_STATUSES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Prioridade</label>
                <select className={styles.select} value={form.priority} onChange={set('priority')}>
                  {TOPOGRAPHY_PRIORITIES.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Origem</label>
                <select className={styles.select} value={form.origin} onChange={set('origin')}>
                  <option value="">—</option>
                  {TOPOGRAPHY_ORIGINS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
                  value={form.client_contact_name}
                  onChange={set('client_contact_name')}
                />
              </div>
              <div className={styles.field}>
                <label>Telefone</label>
                <input
                  className={styles.input}
                  value={form.client_phone}
                  onChange={set('client_phone')}
                />
              </div>
              <div className={styles.field}>
                <label>E-mail</label>
                <input
                  className={styles.input}
                  type="email"
                  value={form.client_email}
                  onChange={set('client_email')}
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
                  placeholder="PA"
                />
              </div>
              <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
                <label>Endereço / referência</label>
                <input className={styles.input} value={form.address} onChange={set('address')} />
              </div>
              <div className={styles.field}>
                <label>Distância de Parauapebas (km)</label>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.distance_from_parauapebas_km}
                  onChange={set('distance_from_parauapebas_km')}
                />
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Contrato</h3>
            <div className={styles.financeBlock}>
              <h4 className={styles.financeBlockTitle}>Financeiro do Projeto</h4>
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label>Valor contratado (R$)</label>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.contract_value}
                    onChange={set('contract_value')}
                  />
                </div>
                <div className={styles.field}>
                  <label>Entrada / Adiantamento recebido (R$)</label>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.valor_recebido}
                    onChange={set('valor_recebido')}
                  />
                </div>
                <div className={styles.field}>
                  <label>Saldo a receber</label>
                  <input
                    className={styles.input}
                    readOnly
                    value={new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    }).format(liveFinance.saldo_receber)}
                  />
                </div>
                <div className={styles.field}>
                  <label>Percentual recebido</label>
                  <input
                    className={styles.input}
                    readOnly
                    value={`${liveFinance.percentual_recebido.toLocaleString('pt-BR')}%`}
                  />
                </div>
                <div className={styles.field}>
                  <label>Forma de pagamento</label>
                  <input
                    className={styles.input}
                    value={form.payment_terms}
                    onChange={set('payment_terms')}
                  />
                </div>
                <div className={styles.field}>
                  <label>Situação financeira</label>
                  <select
                    className={styles.select}
                    value={form.financial_situation}
                    onChange={set('financial_situation')}
                  >
                    {TOPOGRAPHY_FINANCIAL_SITUATIONS.map((f) => (
                      <option key={f.code} value={f.code}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className={styles.grid2} style={{ marginTop: '0.75rem' }}>
              <div className={styles.field}>
                <label>Data de contratação</label>
                <input
                  className={styles.input}
                  type="date"
                  value={form.contract_date}
                  onChange={set('contract_date')}
                />
              </div>
              <div className={styles.field}>
                <label>Início previsto</label>
                <input
                  className={styles.input}
                  type="date"
                  value={form.planned_start_date}
                  onChange={set('planned_start_date')}
                />
              </div>
              <div className={styles.field}>
                <label>Prazo previsto</label>
                <input
                  className={styles.input}
                  type="date"
                  value={form.planned_end_date}
                  onChange={set('planned_end_date')}
                />
              </div>
              <div className={styles.field}>
                <label>Conclusão real</label>
                <input
                  className={styles.input}
                  type="date"
                  value={form.actual_end_date}
                  onChange={set('actual_end_date')}
                />
              </div>
              <div className={styles.field}>
                <label>Nº proposta / orçamento</label>
                <input
                  className={styles.input}
                  value={form.origin_budget_number}
                  onChange={set('origin_budget_number')}
                />
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Responsabilidade</h3>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>Responsável interno</label>
                <input
                  className={styles.input}
                  value={form.internal_manager}
                  onChange={set('internal_manager')}
                />
              </div>
              <div className={styles.field}>
                <label>Responsável técnico</label>
                <input
                  className={styles.input}
                  value={form.technical_manager}
                  onChange={set('technical_manager')}
                />
              </div>
              <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
                <label>Equipe / observações</label>
                <textarea value={form.team_notes} onChange={set('team_notes')} />
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Execução</h3>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label>Progresso operacional (%)</label>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  max={100}
                  value={form.progress_percent}
                  onChange={set('progress_percent')}
                />
              </div>
              <div className={styles.field}>
                <label>Progresso físico (%)</label>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  max={100}
                  value={form.physical_progress_percent}
                  onChange={set('physical_progress_percent')}
                />
              </div>
              <div className={styles.field}>
                <label>Etapa atual</label>
                <input
                  className={styles.input}
                  value={form.current_stage}
                  onChange={set('current_stage')}
                />
              </div>
              <div className={styles.field}>
                <label>Próxima ação</label>
                <input
                  className={styles.input}
                  value={form.next_action}
                  onChange={set('next_action')}
                />
              </div>
              <div className={styles.field}>
                <label>Data da próxima ação</label>
                <input
                  className={styles.input}
                  type="date"
                  value={form.next_action_date}
                  onChange={set('next_action_date')}
                />
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Observações</h3>
            <div className={styles.grid2}>
              <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
                <label>Observações técnicas</label>
                <textarea value={form.technical_notes} onChange={set('technical_notes')} />
              </div>
              <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
                <label>Pendências</label>
                <textarea value={form.pending_items} onChange={set('pending_items')} />
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
