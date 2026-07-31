'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { EQUIPMENT_CATEGORIES } from '@/lib/master/topography/equipmentCategories';
import { EQUIPMENT_STATUSES } from '@/lib/master/topography/equipmentStatuses';
import type { MasterTopographyEquipment } from '@/lib/master/topography/equipmentTypes';
import styles from './equipment.module.css';

export type EquipmentFormState = {
  name: string;
  category: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  asset_number: string;
  status: string;
  purchase_date: string;
  purchase_value: string;
  supplier: string;
  invoice_number: string;
  cost_center_id: string;
  warranty_until: string;
  location: string;
  responsible_name: string;
  usage_hours: string;
  last_calibration_date: string;
  next_calibration_date: string;
  notes: string;
};

export function emptyEquipmentForm(): EquipmentFormState {
  return {
    name: '',
    category: 'DRONE',
    manufacturer: '',
    model: '',
    serial_number: '',
    asset_number: '',
    status: 'AVAILABLE',
    purchase_date: '',
    purchase_value: '',
    supplier: '',
    invoice_number: '',
    cost_center_id: '',
    warranty_until: '',
    location: '',
    responsible_name: '',
    usage_hours: '0',
    last_calibration_date: '',
    next_calibration_date: '',
    notes: '',
  };
}

export function equipmentToForm(row: MasterTopographyEquipment): EquipmentFormState {
  return {
    name: row.name,
    category: row.category,
    manufacturer: row.manufacturer || '',
    model: row.model || '',
    serial_number: row.serial_number || '',
    asset_number: row.asset_number || '',
    status: row.status,
    purchase_date: row.purchase_date || '',
    purchase_value: row.purchase_value == null ? '' : String(row.purchase_value),
    supplier: row.supplier || '',
    invoice_number: row.invoice_number || '',
    cost_center_id: row.cost_center_id || '',
    warranty_until: row.warranty_until || '',
    location: row.location || '',
    responsible_name: row.responsible_name || '',
    usage_hours: String(row.usage_hours ?? 0),
    last_calibration_date: row.last_calibration_date || '',
    next_calibration_date: row.next_calibration_date || '',
    notes: row.notes || '',
  };
}

export function formToEquipmentPayload(form: EquipmentFormState) {
  return {
    name: form.name,
    category: form.category,
    manufacturer: form.manufacturer || null,
    model: form.model || null,
    serial_number: form.serial_number || null,
    asset_number: form.asset_number || null,
    status: form.status,
    purchase_date: form.purchase_date || null,
    purchase_value: form.purchase_value === '' ? null : Number(form.purchase_value),
    supplier: form.supplier || null,
    invoice_number: form.invoice_number || null,
    cost_center_id: form.cost_center_id || null,
    warranty_until: form.warranty_until || null,
    location: form.location || null,
    responsible_name: form.responsible_name || null,
    usage_hours: form.usage_hours === '' ? 0 : Number(form.usage_hours),
    last_calibration_date: form.last_calibration_date || null,
    next_calibration_date: form.next_calibration_date || null,
    notes: form.notes || null,
  };
}

type CostCenterOption = { id: string; name: string; code?: string | null };

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: MasterTopographyEquipment | null;
  saving: boolean;
  error: string | null;
  userId: string;
  onClose: () => void;
  onSubmit: (payload: ReturnType<typeof formToEquipmentPayload>) => Promise<void> | void;
};

type TabId = 'geral' | 'aquisicao' | 'controle' | 'docs';

export function EquipmentFormModal({
  open,
  mode,
  initial,
  saving,
  error,
  userId,
  onClose,
  onSubmit,
}: Props) {
  const [tab, setTab] = useState<TabId>('geral');
  const [form, setForm] = useState<EquipmentFormState>(emptyEquipmentForm());
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [costCentersStatus, setCostCentersStatus] = useState<
    'idle' | 'loading' | 'ok' | 'empty' | 'error'
  >('idle');
  const [costCentersError, setCostCentersError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab('geral');
    setForm(initial ? equipmentToForm(initial) : emptyEquipmentForm());
  }, [open, initial]);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    void (async () => {
      setCostCentersStatus('loading');
      setCostCentersError(null);
      try {
        const res = await fetch(
          `/api/master/corporate-finance/cost-centers?userId=${encodeURIComponent(userId)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setCostCenters([]);
          setCostCentersStatus('error');
          setCostCentersError(
            String(data.error || `Falha ao carregar centros de custo (HTTP ${res.status}).`),
          );
          return;
        }
        const list = (data.costCenters || []) as CostCenterOption[];
        const filtered = list.filter((c) => c?.id && c?.name);
        setCostCenters(filtered);
        setCostCentersStatus(filtered.length ? 'ok' : 'empty');
        setCostCentersError(null);
      } catch (err) {
        if (cancelled) return;
        setCostCenters([]);
        setCostCentersStatus('error');
        setCostCentersError(
          err instanceof Error ? err.message : 'Falha de rede ao carregar centros de custo.',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  if (!open) return null;

  const setField = <K extends keyof EquipmentFormState>(key: K, value: EquipmentFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit(formToEquipmentPayload(form));
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <h2>{mode === 'create' ? 'Novo equipamento' : 'Editar equipamento'}</h2>
            <p>
              {mode === 'create'
                ? 'O código EQP-AAAA-NNNN será gerado automaticamente ao salvar.'
                : `Código ${initial?.code || '—'} (preservado).`}
            </p>
          </div>
          <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={saving}>
            Fechar
          </button>
        </div>

        <form className={styles.modalBody} onSubmit={(e) => void handleSubmit(e)}>
          {error ? <div className={styles.formError}>{error}</div> : null}

          <div className={styles.tabs}>
            {(
              [
                ['geral', 'Dados gerais'],
                ['aquisicao', 'Aquisição'],
                ['controle', 'Controle'],
                ['docs', 'Documentação'],
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
            <div className={styles.grid2}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="eq-name">Nome *</label>
                <input
                  id="eq-name"
                  className={styles.input}
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-category">Categoria *</label>
                <select
                  id="eq-category"
                  className={styles.select}
                  value={form.category}
                  onChange={(e) => setField('category', e.target.value)}
                >
                  {EQUIPMENT_CATEGORIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-status">Status *</label>
                <select
                  id="eq-status"
                  className={styles.select}
                  value={form.status}
                  onChange={(e) => setField('status', e.target.value)}
                >
                  {EQUIPMENT_STATUSES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-manufacturer">Fabricante</label>
                <input
                  id="eq-manufacturer"
                  className={styles.input}
                  value={form.manufacturer}
                  onChange={(e) => setField('manufacturer', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-model">Modelo</label>
                <input
                  id="eq-model"
                  className={styles.input}
                  value={form.model}
                  onChange={(e) => setField('model', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-serial">Número de série</label>
                <input
                  id="eq-serial"
                  className={styles.input}
                  value={form.serial_number}
                  onChange={(e) => setField('serial_number', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-asset">Patrimônio</label>
                <input
                  id="eq-asset"
                  className={styles.input}
                  value={form.asset_number}
                  onChange={(e) => setField('asset_number', e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {tab === 'aquisicao' ? (
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label htmlFor="eq-purchase-date">Data de compra</label>
                <input
                  id="eq-purchase-date"
                  type="date"
                  className={styles.input}
                  value={form.purchase_date}
                  onChange={(e) => setField('purchase_date', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-purchase-value">Valor de compra (R$)</label>
                <input
                  id="eq-purchase-value"
                  type="number"
                  min="0"
                  step="0.01"
                  className={styles.input}
                  value={form.purchase_value}
                  onChange={(e) => setField('purchase_value', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-supplier">Fornecedor</label>
                <input
                  id="eq-supplier"
                  className={styles.input}
                  value={form.supplier}
                  onChange={(e) => setField('supplier', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-invoice">Número da NF</label>
                <input
                  id="eq-invoice"
                  className={styles.input}
                  value={form.invoice_number}
                  onChange={(e) => setField('invoice_number', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-cc">Centro de custo</label>
                <select
                  id="eq-cc"
                  className={styles.select}
                  value={form.cost_center_id}
                  onChange={(e) => setField('cost_center_id', e.target.value)}
                  disabled={costCentersStatus === 'loading'}
                >
                  <option value="">
                    {costCentersStatus === 'loading' ? 'Carregando centros…' : '— (opcional)'}
                  </option>
                  {costCenters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code ? `${c.code} — ${c.name}` : c.name}
                    </option>
                  ))}
                </select>
                {costCentersStatus === 'error' ? (
                  <span className={styles.hint} style={{ color: '#be123c' }}>
                    Não foi possível carregar centros de custo: {costCentersError}. O cadastro pode
                    continuar sem centro de custo.
                  </span>
                ) : null}
                {costCentersStatus === 'empty' ? (
                  <span className={styles.hint}>
                    Nenhum centro de custo ativo encontrado. Cadastre em Financeiro Corporativo ou
                    deixe em branco (campo opcional).
                  </span>
                ) : null}
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-warranty">Garantia até</label>
                <input
                  id="eq-warranty"
                  type="date"
                  className={styles.input}
                  value={form.warranty_until}
                  onChange={(e) => setField('warranty_until', e.target.value)}
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Valor residual</label>
                <div className={styles.comingSoonBox}>
                  Campo não disponível no schema atual — previsto para fase futura (sem migration
                  nesta etapa).
                </div>
              </div>
            </div>
          ) : null}

          {tab === 'controle' ? (
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label htmlFor="eq-location">Localização</label>
                <input
                  id="eq-location"
                  className={styles.input}
                  value={form.location}
                  onChange={(e) => setField('location', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-responsible">Responsável</label>
                <input
                  id="eq-responsible"
                  className={styles.input}
                  value={form.responsible_name}
                  onChange={(e) => setField('responsible_name', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-hours">Horas de uso</label>
                <input
                  id="eq-hours"
                  type="number"
                  min="0"
                  step="0.01"
                  className={styles.input}
                  value={form.usage_hours}
                  onChange={(e) => setField('usage_hours', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-last-cal">Última calibração</label>
                <input
                  id="eq-last-cal"
                  type="date"
                  className={styles.input}
                  value={form.last_calibration_date}
                  onChange={(e) => setField('last_calibration_date', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="eq-next-cal">Próxima calibração</label>
                <input
                  id="eq-next-cal"
                  type="date"
                  className={styles.input}
                  value={form.next_calibration_date}
                  onChange={(e) => setField('next_calibration_date', e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {tab === 'docs' ? (
            <div className={styles.grid2}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Situação ANAC / ANATEL / Manual</label>
                <div className={styles.comingSoonBox}>
                  Documentação regulatória e link de manual entram em fase posterior (sem novos
                  campos de banco nesta etapa). Upload de arquivos e fotos também ficam fora do
                  escopo 1B.
                </div>
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="eq-notes">Observações gerais</label>
                <textarea
                  id="eq-notes"
                  className={styles.textarea}
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="Observações técnicas e gerais do equipamento"
                />
              </div>
            </div>
          ) : null}

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? 'Salvando…' : mode === 'create' ? 'Cadastrar' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
