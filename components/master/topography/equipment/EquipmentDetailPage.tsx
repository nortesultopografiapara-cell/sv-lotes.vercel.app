'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import { equipmentCategoryLabel } from '@/lib/master/topography/equipmentCategories';
import type { MasterTopographyEquipmentAssignment } from '@/lib/master/topography/equipmentAssignmentTypes';
import type { EquipmentAlert } from '@/lib/master/topography/equipmentAlertsService';
import type { MasterTopographyEquipmentDocument } from '@/lib/master/topography/equipmentDocumentTypes';
import type { MasterTopographyEquipmentMaintenance } from '@/lib/master/topography/equipmentMaintenanceTypes';
import type { MasterTopographyEquipment } from '@/lib/master/topography/equipmentTypes';
import type { EquipmentTimelineEvent } from '@/lib/master/topography/equipmentTimelineService';
import {
  EquipmentFormModal,
  formToEquipmentPayload,
} from './EquipmentFormModal';
import { EquipmentAlertsBanner } from './EquipmentAlertsBanner';
import { EquipmentAssignmentsPanel } from './EquipmentAssignmentsPanel';
import { EquipmentDocumentsPanel } from './EquipmentDocumentsPanel';
import { EquipmentMaintenancePanel } from './EquipmentMaintenancePanel';
import { EquipmentStatusBadge } from './EquipmentStatusBadge';
import { EquipmentTimelinePanel } from './EquipmentTimelinePanel';
import styles from './equipment.module.css';

function formatCurrency(val: number | null | undefined) {
  if (val == null || !Number.isFinite(val)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('pt-BR');
}

function EquipmentDetailInner() {
  const { user } = useAuth();
  const params = useParams();
  const id = String(params?.id || '');

  const [equipment, setEquipment] = useState<MasterTopographyEquipment | null>(null);
  const [documents, setDocuments] = useState<MasterTopographyEquipmentDocument[]>([]);
  const [maintenance, setMaintenance] = useState<MasterTopographyEquipmentMaintenance[]>([]);
  const [assignments, setAssignments] = useState<MasterTopographyEquipmentAssignment[]>([]);
  const [timeline, setTimeline] = useState<EquipmentTimelineEvent[]>([]);
  const [alerts, setAlerts] = useState<EquipmentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !id) return;
    setLoading(true);
    setError(null);
    try {
      const qs = `userId=${encodeURIComponent(user.id)}`;
      const [eqRes, docsRes, maintRes, assignRes, timeRes, alertRes] = await Promise.all([
        fetch(`/api/master/topography/equipment/${id}?${qs}`),
        fetch(`/api/master/topography/equipment/${id}/documents?${qs}`),
        fetch(`/api/master/topography/equipment/${id}/maintenance?${qs}`),
        fetch(`/api/master/topography/equipment/${id}/assignments?${qs}`),
        fetch(`/api/master/topography/equipment/${id}/timeline?${qs}`),
        fetch(`/api/master/topography/equipment/${id}/alerts?${qs}`),
      ]);

      const eqData = await eqRes.json();
      if (!eqRes.ok) throw new Error(eqData.error || 'Falha ao carregar equipamento.');
      setEquipment(eqData.equipment || null);

      const docsData = await docsRes.json();
      setDocuments(docsRes.ok ? docsData.documents || [] : []);

      const maintData = await maintRes.json();
      setMaintenance(maintRes.ok ? maintData.maintenance || [] : []);

      const assignData = await assignRes.json();
      setAssignments(assignRes.ok ? assignData.assignments || [] : []);

      const timeData = await timeRes.json();
      setTimeline(timeRes.ok ? timeData.events || [] : []);

      const alertData = await alertRes.json();
      setAlerts(alertRes.ok ? alertData.alerts || [] : []);
    } catch (err) {
      setEquipment(null);
      setError(err instanceof Error ? err.message : 'Falha ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (payload: ReturnType<typeof formToEquipmentPayload>) => {
    if (!user?.id || !equipment) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/master/topography/equipment/${equipment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar.');
      setEquipment(data.equipment);
      setModalOpen(false);
      setToast('Equipamento atualizado.');
      void load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  const setArchived = async (archived: boolean) => {
    if (!user?.id || !equipment) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/topography/equipment/${equipment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          patchOnly: true,
          is_archived: archived,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar arquivamento.');
      setEquipment(data.equipment);
      setToast(archived ? 'Equipamento arquivado.' : 'Equipamento restaurado.');
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao arquivar/restaurar.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Carregando detalhe…</div>;
  }

  if (!equipment) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBanner}>{error || 'Equipamento não encontrado.'}</div>
        <Link className={styles.btnSecondary} href="/master/topography/equipment">
          <ArrowLeft width={14} height={14} />
          Voltar à lista
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <Link className={styles.btnGhost} href="/master/topography/equipment">
            <ArrowLeft width={14} height={14} />
            Voltar à lista
          </Link>
          <h1 className={styles.title} style={{ marginTop: '0.65rem' }}>
            {equipment.name}
            {equipment.is_archived ? (
              <span className={styles.archivedTag}>Arquivado</span>
            ) : null}
          </h1>
          <p className={styles.subtitle}>
            <span className={styles.codeCell}>{equipment.code}</span>
            {' · '}
            <EquipmentStatusBadge status={equipment.status} />
            {' · '}
            {equipmentCategoryLabel(equipment.category)}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => {
              setFormError(null);
              setModalOpen(true);
            }}
            disabled={busy}
          >
            Editar
          </button>
          {equipment.is_archived ? (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => void setArchived(false)}
              disabled={busy}
            >
              Restaurar
            </button>
          ) : (
            <button
              type="button"
              className={styles.btnDanger}
              onClick={() => void setArchived(true)}
              disabled={busy}
            >
              Arquivar
            </button>
          )}
        </div>
      </div>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <EquipmentAlertsBanner alerts={alerts} />

      <div className={styles.detailGrid}>
        <div className={styles.card}>
          <h3>Dados técnicos</h3>
          <dl className={styles.dl}>
            <dt>Fabricante</dt>
            <dd>{equipment.manufacturer || '—'}</dd>
            <dt>Modelo</dt>
            <dd>{equipment.model || '—'}</dd>
            <dt>Nº de série</dt>
            <dd>{equipment.serial_number || '—'}</dd>
            <dt>Patrimônio</dt>
            <dd>{equipment.asset_number || '—'}</dd>
            <dt>Horas de uso</dt>
            <dd>{Number(equipment.usage_hours || 0).toLocaleString('pt-BR')}</dd>
          </dl>
        </div>

        <div className={styles.card}>
          <h3>Aquisição e patrimônio</h3>
          <dl className={styles.dl}>
            <dt>Data de compra</dt>
            <dd>{formatDate(equipment.purchase_date)}</dd>
            <dt>Valor</dt>
            <dd>{formatCurrency(equipment.purchase_value)}</dd>
            <dt>Fornecedor</dt>
            <dd>{equipment.supplier || '—'}</dd>
            <dt>Nota fiscal</dt>
            <dd>{equipment.invoice_number || '—'}</dd>
            <dt>Centro de custo</dt>
            <dd>{equipment.cost_center_id || '—'}</dd>
            <dt>Garantia até</dt>
            <dd>{formatDate(equipment.warranty_until)}</dd>
          </dl>
        </div>

        <div className={styles.card}>
          <h3>Controle operacional</h3>
          <dl className={styles.dl}>
            <dt>Responsável</dt>
            <dd>{equipment.responsible_name || '—'}</dd>
            <dt>Localização</dt>
            <dd>{equipment.location || '—'}</dd>
            <dt>Última calibração</dt>
            <dd>{formatDate(equipment.last_calibration_date)}</dd>
            <dt>Próxima calibração</dt>
            <dd>{formatDate(equipment.next_calibration_date)}</dd>
          </dl>
        </div>

        <div className={styles.card}>
          <h3>Observações e auditoria</h3>
          <dl className={styles.dl}>
            <dt>Observações</dt>
            <dd>{equipment.notes || '—'}</dd>
            <dt>Criado em</dt>
            <dd>{formatDateTime(equipment.created_at)}</dd>
            <dt>Atualizado em</dt>
            <dd>{formatDateTime(equipment.updated_at)}</dd>
          </dl>
        </div>
      </div>

      <div className={styles.fase2Stack}>
        <EquipmentDocumentsPanel
          equipmentId={equipment.id}
          userId={user?.id || ''}
          documents={documents}
          busy={busy}
          onChanged={() => void load()}
          onError={setError}
          onToast={setToast}
        />
        <EquipmentMaintenancePanel
          equipmentId={equipment.id}
          userId={user?.id || ''}
          rows={maintenance}
          busy={busy}
          onChanged={() => void load()}
          onError={setError}
          onToast={setToast}
        />
        <EquipmentAssignmentsPanel
          equipmentId={equipment.id}
          userId={user?.id || ''}
          rows={assignments}
          currentResponsible={equipment.responsible_name}
          currentLocation={equipment.location}
          busy={busy}
          onChanged={() => void load()}
          onError={setError}
          onToast={setToast}
        />
        <EquipmentTimelinePanel events={timeline} />
        <div className={styles.card}>
          <h3>Módulos futuros</h3>
          <div className={styles.soonGrid}>
            <div className={styles.comingSoonBox}>QR Code — Em breve</div>
          </div>
        </div>
      </div>

      <EquipmentFormModal
        open={modalOpen}
        mode="edit"
        initial={equipment}
        saving={busy}
        error={formError}
        userId={user?.id || ''}
        onClose={() => {
          if (!busy) setModalOpen(false);
        }}
        onSubmit={handleSave}
      />

      {toast ? (
        <div className={styles.toast}>
          {toast}
          <button
            type="button"
            style={{
              marginLeft: 12,
              background: 'transparent',
              border: 'none',
              color: '#93c5fd',
              cursor: 'pointer',
            }}
            onClick={() => setToast(null)}
          >
            Fechar
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function EquipmentDetailPage() {
  return (
    <MasterSuperAdminGuard>
      <EquipmentDetailInner />
    </MasterSuperAdminGuard>
  );
}
