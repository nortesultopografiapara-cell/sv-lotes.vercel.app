import { supabase } from '@/lib/supabase';

interface AuditLogOptions {
  action: string;
  entityType: string;
  entityId?: string;
  oldData?: any;
  newData?: any;
}

export async function logAudit({
  action,
  entityType,
  entityId,
  oldData,
  newData
}: AuditLogOptions) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Use current tenant
    const { data: userData } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', session.user.id)
      .single();

    const tenantId = userData?.tenant_id;

    await supabase.from('audit_logs').insert({
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_data: oldData,
      new_data: newData,
      tenant_id: tenantId,
      user_id: session.user.id,
      user_agent: window.navigator.userAgent,
    });
  } catch (err) {
    console.error('Failed to log audit event', err);
  }
}
