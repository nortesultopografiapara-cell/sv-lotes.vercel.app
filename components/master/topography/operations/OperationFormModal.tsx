'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { MasterTopographyClient } from '@/lib/master/topography/clientTypes';
import {
  OPERATION_PRIORITIES,
  OPERATION_STATUSES,
} from '@/lib/master/topography/operationStatuses';
import type { MasterTopographyOperation } from '@/lib/master/topography/operationTypes';
import { OperationClientCreateModal } from './OperationClientCreateModal';
import { OperationClientPicker } from './OperationClientPicker';
import styles from './operation.module.css';

export type OperationFormState = {
  title: string;
  description: string;
  project_id: string;
  quote_id: string;
  client_id: string;
  client_name: string;
  service_type: string;
  status: string;
  priority: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start: string;
  actual_end: string;
  location_name: string;
  address: string;
  latitude: string;
  longitude: string;
  responsible_name: string;
  responsible_phone: string;
  responsible_email: string;
  estimated_cost: string;
  actual_cost: string;
  notes: string;
};

export type ProjectQuoteOption = { id: string; label: string };

export function emptyOperationForm(): OperationFormState {
  return {
    title: '',
    description: '',
    project_id: '',
    quote_id: '',
    client_id: '',
    client_name: '',
    service_type: '',
    status: 'DRAFT',
    priority: 'NORMAL',
    scheduled_start: '',
    scheduled_end: '',
    actual_start: '',
    actual_end: '',
    location_name: '',
    address: '',
    latitude: '',
    longitude: '',
    responsible_name: '',
    responsible_phone: '',
    responsible_email: '',
    estimated_cost: '',
    actual_cost: '',
    notes: '',
  };
}

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  const s = value.trim();
  if (!s) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function operationToForm(row: MasterTopographyOperation): OperationFormState {
  return {
    title: row.title,
    description: row.description || '',
    project_id: row.project_id || '',
    quote_id: row.quote_id || '',
    client_id: row.client_id || '',
    client_name: row.client_name || '',
    service_type: row.service_type || '',
    status: row.status,
    priority: row.priority,
    scheduled_start: isoToLocalInput(row.scheduled_start),
    scheduled_end: isoToLocalInput(row.scheduled_end),
    actual_start: isoToLocalInput(row.actual_start),
    actual_end: isoToLocalInput(row.actual_end),
    location_name: row.location_name || '',
    address: row.address || '',
    latitude: row.latitude == null ? '' : String(row.latitude),
    longitude: row.longitude == null ? '' : String(row.longitude),
    responsible_name: row.responsible_name || '',
    responsible_phone: row.responsible_phone || '',
    responsible_email: row.responsible_email || '',
    estimated_cost: row.estimated_cost == null ? '' : String(row.estimated_cost),
    actual_cost: row.actual_cost == null ? '' : String(row.actual_cost),
    notes: row.notes || '',
  };
}

export function formToOperationPayload(form: OperationFormState) {
  return {
    title: form.title,
    description: form.description || null,
    project_id: form.project_id || null,
    quote_id: form.quote_id || null,
    client_id: form.client_id || null,
    client_name: form.client_name || null,
    service_type: form.service_type || null,
    status: form.status,
    priority: form.priority,
    scheduled_start: localInputToIso(form.scheduled_start),
    scheduled_end: localInputToIso(form.scheduled_end),
    actual_start: localInputToIso(form.actual_start),
    actual_end: localInputToIso(form.actual_end),
    location_name: form.location_name || null,
    address: form.address || null,
    latitude: form.latitude === '' ? null : Number(form.latitude),
    longitude: form.longitude === '' ? null : Number(form.longitude),
    responsible_name: form.responsible_name || null,
    responsible_phone: form.responsible_phone || null,
    responsible_email: form.responsible_email || null,
    estimated_cost: form.estimated_cost === '' ? null : Number(form.estimated_cost),
    actual_cost: form.actual_cost === '' ? null : Number(form.actual_cost),
    notes: form.notes || null,
  };
}

type TabId = 'geral' | 'planejamento' | 'custos' | 'observacoes';

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: MasterTopographyOperation | null;
  saving: boolean;
  error: string | null;
  userId: string;
  projects: ProjectQuoteOption[];
  quotes: ProjectQuoteOption[];
  onClose: () => void;
  onSubmit: (payload: ReturnType<typeof formToOperationPayload>) => Promise<void> | void;
};

export function OperationFormModal({
  open,
  mode,
  initial,
  saving,
  error,
  userId,
  projects,
  quotes,
  onClose,
  onSubmit,
}: Props) {
  const [tab, setTab] = useState<TabId>('geral');
  const [form, setForm] = useState<OperationFormState>(emptyOperationForm());
  const [selectedClient, setSelectedClient] = useState<MasterTopographyClient | null>(null);
  const [createClientOpen, setCreateClientOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab('geral');
    setForm(initial ? operationToForm(initial) : emptyOperationForm());
    setSelectedClient(null);
    setCreateClientOpen(false);
  }, [open, initial]);

  useEffect(() => {
    if (!open || !userId || !initial?.client_id) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/master/topography/clients/${initial.client_id}?userId=${encodeURIComponent(userId)}`,
        );
        const data = await res.json();
        if (!cancelled && res.ok && data.client) {
          setSelectedClient(data.client);
        }
      } catch {
        /* snapshot client_name ainda vale */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId, initial?.client_id]);

  if (!open) return null;

  const set =
    <K extends keyof OperationFormState>(key: K, value: OperationFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    };

  const applyClient = (client: MasterTopographyClient | null) => {
    setSelectedClient(client);
    setForm((prev) => ({
      ...prev,
      client_id: client?.id || '',
      client_name: client?.name || '',
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.client_id) {
      // Permite edição legada com apenas snapshot, mas criação deve ter cliente vinculado
      if (mode === 'create') {
        setTab('geral');
        return;
      }
    }
    await onSubmit(formToOperationPayload(form));
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <h2>{mode === 'create' ? 'Nova Ordem de Serviço' : 'Editar Ordem de Serviço'}</h2>
            <p>
              {mode === 'create'
                ? 'O código OS-AAAA-NNNN será gerado automaticamente pelo backend.'
                : `Código imutável: ${initial?.code || '—'}`}
            </p>
          </div>
          <button type="button" className={styles.btnGhost} onClick={onClose} disabled={saving}>
            Fechar
          </button>
        </div>

        <form className={styles.modalBody} onSubmit={(e) => void handleSubmit(e)}>
          {error ? <div className={styles.formError}>{error}</div> : null}
          {mode === 'create' && !form.client_id ? (
            <div className={styles.infoBanner}>
              Selecione ou cadastre um cliente antes de criar a Ordem de Serviço.
            </div>
          ) : null}

          <div className={styles.tabs}>
            {(
              [
                ['geral', 'Dados gerais'],
                ['planejamento', 'Planejamento'],
                ['custos', 'Custos'],
                ['observacoes', 'Observações'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`${styles.tabBtn} ${tab === id ? styles.tabBtnActive : ''}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'geral' ? (
            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="op-title">Título *</label>
                <input
                  id="op-title"
                  className={styles.input}
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  required
                  maxLength={240}
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="op-desc">Descrição</label>
                <textarea
                  id="op-desc"
                  className={styles.textarea}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </div>

              <OperationClientPicker
                userId={userId}
                selected={selectedClient}
                clientNameSnapshot={form.client_name}
                onSelect={applyClient}
                onRequestCreate={() => setCreateClientOpen(true)}
              />

              <div className={styles.field}>
                <label htmlFor="op-project">Projeto (opcional)</label>
                <select
                  id="op-project"
                  className={styles.select}
                  value={form.project_id}
                  onChange={(e) => set('project_id', e.target.value)}
                >
                  <option value="">Sem projeto</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="op-quote">Orçamento (opcional)</label>
                <select
                  id="op-quote"
                  className={styles.select}
                  value={form.quote_id}
                  onChange={(e) => set('quote_id', e.target.value)}
                >
                  <option value="">Sem orçamento</option>
                  {quotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="op-service">Tipo de serviço</label>
                <input
                  id="op-service"
                  className={styles.input}
                  value={form.service_type}
                  onChange={(e) => set('service_type', e.target.value)}
                  placeholder="Ex.: Topografia, Cadastro, Aerofotogrametria"
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="op-priority">Prioridade</label>
                <select
                  id="op-priority"
                  className={styles.select}
                  value={form.priority}
                  onChange={(e) => set('priority', e.target.value)}
                >
                  {OPERATION_PRIORITIES.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="op-status">Status</label>
                <select
                  id="op-status"
                  className={styles.select}
                  value={form.status}
                  onChange={(e) => set('status', e.target.value)}
                >
                  {OPERATION_STATUSES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <span className={styles.hint}>
                  Preferir “Alterar status” para fluxo controlado de transições.
                </span>
              </div>
            </div>
          ) : null}

          {tab === 'planejamento' ? (
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor="op-sch-start">Início previsto</label>
                <input
                  id="op-sch-start"
                  className={styles.input}
                  type="datetime-local"
                  value={form.scheduled_start}
                  onChange={(e) => set('scheduled_start', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="op-sch-end">Término previsto</label>
                <input
                  id="op-sch-end"
                  className={styles.input}
                  type="datetime-local"
                  value={form.scheduled_end}
                  onChange={(e) => set('scheduled_end', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="op-act-start">Início real</label>
                <input
                  id="op-act-start"
                  className={styles.input}
                  type="datetime-local"
                  value={form.actual_start}
                  onChange={(e) => set('actual_start', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="op-act-end">Término real</label>
                <input
                  id="op-act-end"
                  className={styles.input}
                  type="datetime-local"
                  value={form.actual_end}
                  onChange={(e) => set('actual_end', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="op-resp">Responsável / colaborador</label>
                <input
                  id="op-resp"
                  className={styles.input}
                  value={form.responsible_name}
                  onChange={(e) => set('responsible_name', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="op-resp-phone">Telefone do responsável</label>
                <input
                  id="op-resp-phone"
                  className={styles.input}
                  value={form.responsible_phone}
                  onChange={(e) => set('responsible_phone', e.target.value)}
                  placeholder="Para WhatsApp"
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="op-resp-email">E-mail do responsável</label>
                <input
                  id="op-resp-email"
                  className={styles.input}
                  type="email"
                  value={form.responsible_email}
                  onChange={(e) => set('responsible_email', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="op-loc">Local</label>
                <input
                  id="op-loc"
                  className={styles.input}
                  value={form.location_name}
                  onChange={(e) => set('location_name', e.target.value)}
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="op-addr">Endereço</label>
                <input
                  id="op-addr"
                  className={styles.input}
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="op-lat">Latitude</label>
                <input
                  id="op-lat"
                  className={styles.input}
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={(e) => set('latitude', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="op-lng">Longitude</label>
                <input
                  id="op-lng"
                  className={styles.input}
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={(e) => set('longitude', e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {tab === 'custos' ? (
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor="op-est">Custo estimado (R$)</label>
                <input
                  id="op-est"
                  className={styles.input}
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.estimated_cost}
                  onChange={(e) => set('estimated_cost', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="op-act-cost">Custo realizado (R$)</label>
                <input
                  id="op-act-cost"
                  className={styles.input}
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.actual_cost}
                  onChange={(e) => set('actual_cost', e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {tab === 'observacoes' ? (
            <div className={styles.field}>
              <label htmlFor="op-notes">Notas gerais</label>
              <textarea
                id="op-notes"
                className={styles.textarea}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                style={{ minHeight: '8rem' }}
              />
            </div>
          ) : null}

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={saving || (mode === 'create' && !form.client_id)}
            >
              {saving ? 'Salvando…' : mode === 'create' ? 'Criar OS' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>

      <OperationClientCreateModal
        open={createClientOpen}
        userId={userId}
        saving={false}
        onClose={() => setCreateClientOpen(false)}
        onCreated={(client) => applyClient(client)}
      />
    </div>
  );
}
