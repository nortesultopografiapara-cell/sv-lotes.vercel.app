import type { SupabaseClient } from '@supabase/supabase-js';

export type OperationTimelineEvent = {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail?: string | null;
  actor?: string | null;
};

export async function listOperationTimeline(
  supabase: SupabaseClient,
  operationId: string,
): Promise<OperationTimelineEvent[]> {
  const events: OperationTimelineEvent[] = [];

  const { data: audits } = await supabase
    .from('audit_logs')
    .select('id, action, description, created_at, user_id, new_data')
    .eq('module', 'TOPOGRAPHY')
    .ilike('description', `%[${operationId}]%`)
    .order('created_at', { ascending: false })
    .limit(200);

  for (const a of audits || []) {
    events.push({
      id: `audit-${a.id}`,
      at: String(a.created_at || ''),
      kind: String(a.action || 'AUDIT'),
      title: String(a.description || a.action || 'Evento').replace(
        ` [${operationId}]`,
        '',
      ),
      actor: a.user_id ? String(a.user_id) : null,
    });
  }

  const tables: Array<{
    table: string;
    kind: string;
    titleFn: (r: Record<string, unknown>) => string;
    atField: string;
  }> = [
    {
      table: 'master_topography_operation_team',
      kind: 'TEAM',
      titleFn: (r) => `Equipe: ${r.name}`,
      atField: 'created_at',
    },
    {
      table: 'master_topography_operation_equipment',
      kind: 'EQUIPMENT',
      titleFn: (r) =>
        r.returned_at
          ? 'Equipamento devolvido'
          : r.checked_out_at
            ? 'Equipamento retirado'
            : 'Equipamento reservado',
      atField: 'created_at',
    },
    {
      table: 'master_topography_operation_tasks',
      kind: 'TASK',
      titleFn: (r) => `Checklist: ${r.title} (${r.status})`,
      atField: 'updated_at',
    },
    {
      table: 'master_topography_operation_occurrences',
      kind: 'OCCURRENCE',
      titleFn: (r) => `Ocorrência: ${r.title}`,
      atField: 'occurred_at',
    },
    {
      table: 'master_topography_operation_expenses',
      kind: 'EXPENSE',
      titleFn: (r) => `Despesa: ${r.description}`,
      atField: 'created_at',
    },
    {
      table: 'master_topography_operation_documents',
      kind: 'DOCUMENT',
      titleFn: (r) => `Documento: ${r.title}`,
      atField: 'created_at',
    },
  ];

  for (const t of tables) {
    const { data } = await supabase
      .from(t.table)
      .select('*')
      .eq('operation_id', operationId)
      .order(t.atField, { ascending: false })
      .limit(50);
    for (const row of data || []) {
      const r = row as Record<string, unknown>;
      if (t.table.includes('documents') && r.deleted_at) {
        events.push({
          id: `doc-del-${r.id}`,
          at: String(r.deleted_at),
          kind: 'DOCUMENT_DELETED',
          title: `Documento excluído: ${r.title}`,
        });
      }
      events.push({
        id: `${t.kind}-${r.id}-${t.atField}`,
        at: String(r[t.atField] || r.created_at || ''),
        kind: t.kind,
        title: t.titleFn(r),
      });
    }
  }

  events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  // Dedup roughly by id
  const seen = new Set<string>();
  return events.filter((e) => {
    if (!e.at || seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}
