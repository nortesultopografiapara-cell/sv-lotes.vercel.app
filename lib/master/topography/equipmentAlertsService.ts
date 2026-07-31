import type { SupabaseClient } from '@supabase/supabase-js';
import { listEquipmentDocuments } from './equipmentDocumentsService';
import { listEquipmentMaintenance } from './equipmentMaintenanceService';
import { getTopographyEquipmentById } from './equipmentService';
import type { MasterTopographyEquipment } from './equipmentTypes';

export type EquipmentAlertSeverity = 'info' | 'warning' | 'danger';

export type EquipmentAlertCode =
  | 'WARRANTY_EXPIRING'
  | 'WARRANTY_EXPIRED'
  | 'DOCUMENT_EXPIRING'
  | 'DOCUMENT_EXPIRED'
  | 'CALIBRATION_OVERDUE'
  | 'CALIBRATION_DUE_SOON'
  | 'MAINTENANCE_DUE'
  | 'MAINTENANCE_STUCK';

export type EquipmentAlert = {
  code: EquipmentAlertCode;
  severity: EquipmentAlertSeverity;
  title: string;
  details: string;
  date?: string | null;
  refId?: string | null;
};

const ALERT_HORIZON_DAYS = 30;
const STUCK_DAYS = 15;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

export function computeEquipmentAlertsFromData(params: {
  equipment: MasterTopographyEquipment;
  documents: Array<{
    id: string;
    titulo: string;
    valid_until: string | null;
    deleted_at: string | null;
  }>;
  maintenance: Array<{
    id: string;
    tipo: string;
    status: string;
    scheduled_at: string | null;
    next_review_at: string | null;
    created_at: string;
    updated_at: string;
    is_archived: boolean;
  }>;
  now?: string;
  horizon?: string;
}): EquipmentAlert[] {
  const today = params.now || todayIso();
  const horizon = params.horizon || plusDaysIso(ALERT_HORIZON_DAYS);
  const alerts: EquipmentAlert[] = [];
  const eq = params.equipment;

  if (eq.warranty_until && eq.status !== 'DECOMMISSIONED') {
    if (eq.warranty_until < today) {
      alerts.push({
        code: 'WARRANTY_EXPIRED',
        severity: 'danger',
        title: 'Garantia vencida',
        details: `Garantia expirou em ${eq.warranty_until}.`,
        date: eq.warranty_until,
      });
    } else if (eq.warranty_until <= horizon) {
      alerts.push({
        code: 'WARRANTY_EXPIRING',
        severity: 'warning',
        title: 'Garantia vencendo',
        details: `Garantia até ${eq.warranty_until}.`,
        date: eq.warranty_until,
      });
    }
  }

  if (eq.next_calibration_date && eq.status !== 'DECOMMISSIONED') {
    if (eq.next_calibration_date < today) {
      alerts.push({
        code: 'CALIBRATION_OVERDUE',
        severity: 'danger',
        title: 'Calibração vencida',
        details: `Próxima calibração era ${eq.next_calibration_date}.`,
        date: eq.next_calibration_date,
      });
    } else if (eq.next_calibration_date <= horizon) {
      alerts.push({
        code: 'CALIBRATION_DUE_SOON',
        severity: 'warning',
        title: 'Calibração próxima',
        details: `Próxima calibração em ${eq.next_calibration_date}.`,
        date: eq.next_calibration_date,
      });
    }
  }

  for (const doc of params.documents) {
    if (doc.deleted_at || !doc.valid_until) continue;
    if (doc.valid_until < today) {
      alerts.push({
        code: 'DOCUMENT_EXPIRED',
        severity: 'danger',
        title: 'Documento vencido',
        details: `${doc.titulo} venceu em ${doc.valid_until}.`,
        date: doc.valid_until,
        refId: doc.id,
      });
    } else if (doc.valid_until <= horizon) {
      alerts.push({
        code: 'DOCUMENT_EXPIRING',
        severity: 'warning',
        title: 'Documento vencendo',
        details: `${doc.titulo} válido até ${doc.valid_until}.`,
        date: doc.valid_until,
        refId: doc.id,
      });
    }
  }

  for (const m of params.maintenance) {
    if (m.is_archived || m.status === 'CANCELED' || m.status === 'DONE') continue;
    const due = m.next_review_at || (m.status === 'PLANNED' ? m.scheduled_at : null);
    if (due) {
      if (due < today || due <= horizon) {
        alerts.push({
          code: 'MAINTENANCE_DUE',
          severity: due < today ? 'danger' : 'warning',
          title: due < today ? 'Manutenção atrasada' : 'Próxima manutenção',
          details: `${m.tipo}: ${due}`,
          date: due,
          refId: m.id,
        });
      }
    }
  }

  if (eq.status === 'MAINTENANCE' || eq.status === 'CALIBRATION') {
    const stuckRef = eq.updated_at.slice(0, 10);
    const age = daysBetween(stuckRef, today);
    if (age >= STUCK_DAYS) {
      alerts.push({
        code: 'MAINTENANCE_STUCK',
        severity: 'warning',
        title: 'Em manutenção há muito tempo',
        details: `Status ${eq.status} desde cerca de ${age} dias.`,
        date: stuckRef,
      });
    }
  }

  const severityRank: Record<EquipmentAlertSeverity, number> = {
    danger: 0,
    warning: 1,
    info: 2,
  };
  alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  return alerts;
}

export async function getEquipmentAlerts(
  supabase: SupabaseClient,
  equipmentId: string,
): Promise<EquipmentAlert[]> {
  const equipment = await getTopographyEquipmentById(supabase, equipmentId);
  if (!equipment) throw new Error('Equipamento não encontrado.');

  const [documents, maintenance] = await Promise.all([
    listEquipmentDocuments(supabase, equipmentId),
    listEquipmentMaintenance(supabase, equipmentId),
  ]);

  return computeEquipmentAlertsFromData({ equipment, documents, maintenance });
}
