import type { SupabaseClient } from '@supabase/supabase-js';
import { listEquipmentAssignments } from './equipmentAssignmentsService';
import { listEquipmentDocuments } from './equipmentDocumentsService';
import { listEquipmentMaintenance } from './equipmentMaintenanceService';
import { getTopographyEquipmentById } from './equipmentService';

export type EquipmentTimelineEventType =
  | 'CREATED'
  | 'UPDATED'
  | 'STATUS_CHANGED'
  | 'ASSIGNED'
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_DELETED'
  | 'MAINTENANCE'
  | 'CALIBRATION'
  | 'ARCHIVED'
  | 'RESTORED'
  | 'OTHER';

export type EquipmentTimelineEvent = {
  id: string;
  at: string;
  type: EquipmentTimelineEventType;
  title: string;
  details: string;
  source: 'audit' | 'document' | 'maintenance' | 'assignment' | 'equipment';
  meta?: Record<string, unknown>;
};

function mapAuditAction(action: string): EquipmentTimelineEventType {
  if (action.includes('CREATED')) return 'CREATED';
  if (action.includes('ARCHIVED')) return 'ARCHIVED';
  if (action.includes('RESTORED')) return 'RESTORED';
  if (action.includes('STATUS')) return 'STATUS_CHANGED';
  if (action.includes('ASSIGNED') || action.includes('RESPONSIBLE') || action.includes('LOCATION')) {
    return 'ASSIGNED';
  }
  if (action.includes('DOCUMENT_UPLOADED')) return 'DOCUMENT_UPLOADED';
  if (action.includes('DOCUMENT_DELETED')) return 'DOCUMENT_DELETED';
  if (action.includes('MAINTENANCE')) return 'MAINTENANCE';
  if (action.includes('UPDATED')) return 'UPDATED';
  return 'OTHER';
}

export async function getEquipmentTimeline(
  supabase: SupabaseClient,
  equipmentId: string,
): Promise<EquipmentTimelineEvent[]> {
  const equipment = await getTopographyEquipmentById(supabase, equipmentId);
  if (!equipment) throw new Error('Equipamento não encontrado.');

  const events: EquipmentTimelineEvent[] = [];

  events.push({
    id: `equip-created-${equipment.id}`,
    at: equipment.created_at,
    type: 'CREATED',
    title: 'Equipamento criado',
    details: `${equipment.code} — ${equipment.name}`,
    source: 'equipment',
  });

  if (equipment.is_archived) {
    events.push({
      id: `equip-archived-${equipment.id}-${equipment.updated_at}`,
      at: equipment.updated_at,
      type: 'ARCHIVED',
      title: 'Equipamento arquivado',
      details: equipment.code,
      source: 'equipment',
    });
  }

  const [docs, maints, assigns] = await Promise.all([
    listEquipmentDocuments(supabase, equipmentId, { includeDeleted: true }),
    listEquipmentMaintenance(supabase, equipmentId, { includeArchived: true }),
    listEquipmentAssignments(supabase, equipmentId),
  ]);

  for (const doc of docs) {
    events.push({
      id: `doc-up-${doc.id}`,
      at: doc.created_at,
      type: 'DOCUMENT_UPLOADED',
      title: 'Documento anexado',
      details: `${doc.titulo} (${doc.tipo})`,
      source: 'document',
      meta: { document_id: doc.id, tipo: doc.tipo },
    });
    if (doc.deleted_at) {
      events.push({
        id: `doc-del-${doc.id}`,
        at: doc.deleted_at,
        type: 'DOCUMENT_DELETED',
        title: 'Documento removido',
        details: `${doc.titulo} (${doc.tipo})`,
        source: 'document',
        meta: { document_id: doc.id },
      });
    }
  }

  for (const m of maints) {
    const isCal = m.tipo === 'CALIBRATION';
    events.push({
      id: `maint-${m.id}`,
      at: m.performed_at
        ? `${m.performed_at}T12:00:00.000Z`
        : m.created_at,
      type: isCal ? 'CALIBRATION' : 'MAINTENANCE',
      title: isCal ? 'Calibração' : 'Manutenção',
      details: `${m.tipo} — ${m.status}: ${m.description.slice(0, 120)}`,
      source: 'maintenance',
      meta: { maintenance_id: m.id, status: m.status, cost: m.cost },
    });
  }

  for (const a of assigns) {
    events.push({
      id: `assign-${a.id}`,
      at: a.moved_at || a.created_at,
      type: 'ASSIGNED',
      title: 'Movimentação',
      details: [
        a.from_responsible_name || '—',
        '→',
        a.to_responsible_name || '—',
        a.from_location || a.to_location
          ? `(${a.from_location || '—'} → ${a.to_location || '—'})`
          : '',
        a.reason ? `· ${a.reason}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      source: 'assignment',
      meta: { assignment_id: a.id, reason: a.reason },
    });
  }

  try {
    const { data: audits } = await supabase
      .from('audit_logs')
      .select('id, action, description, created_at, old_data, new_data')
      .eq('module', 'TOPOGRAPHY')
      .ilike('description', `%[${equipmentId}]%`)
      .order('created_at', { ascending: false })
      .limit(100);

    for (const row of audits || []) {
      const action = String(row.action || '');
      // Evitar duplicar documentos/manutenções/assignments já listados das tabelas
      if (
        action.includes('DOCUMENT_') ||
        action.includes('MAINTENANCE_') ||
        action.includes('ASSIGNED')
      ) {
        continue;
      }
      events.push({
        id: `audit-${row.id}`,
        at: String(row.created_at || ''),
        type: mapAuditAction(action),
        title: action.replace(/^TOPOGRAPHY_EQUIPMENT_/, '').replace(/_/g, ' '),
        details: String(row.description || '').replace(` [${equipmentId}]`, ''),
        source: 'audit',
        meta: { action },
      });
    }
  } catch {
    /* audit opcional */
  }

  events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return events;
}
