import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssistantEntityLoaders } from './hydrateUiContext';

function pickTenant(row: { tenant_id?: string | null; company_id?: string | null } | null): string {
  return String(row?.tenant_id || row?.company_id || '').trim();
}

export function createAssistantEntityLoaders(admin: SupabaseClient): AssistantEntityLoaders {
  return {
    async loadProject(id) {
      const { data } = await admin
        .from('projects')
        .select('id, name, contract_model, tenant_id, company_id')
        .eq('id', id)
        .maybeSingle();
      if (!data?.id) return null;
      return {
        id: String(data.id),
        tenantId: pickTenant(data),
        name: data.name ? String(data.name) : null,
        contractModel: data.contract_model ? String(data.contract_model) : null,
      };
    },
    async loadLot(id) {
      const { data } = await admin
        .from('blocks')
        .select('id, project_id, tenant_id, company_id, block_name, name, number, status')
        .eq('id', id)
        .maybeSingle();
      if (!data?.id) return null;
      let tenantId = pickTenant(data);
      const projectId = data.project_id ? String(data.project_id) : null;
      if (!tenantId && projectId) {
        const { data: project } = await admin
          .from('projects')
          .select('tenant_id, company_id')
          .eq('id', projectId)
          .maybeSingle();
        tenantId = pickTenant(project);
      }
      return {
        id: String(data.id),
        tenantId,
        projectId,
        blockNumber: data.block_name != null ? String(data.block_name) : data.name != null ? String(data.name) : null,
        lotNumber: data.number != null ? String(data.number) : null,
        status: data.status ? String(data.status) : null,
      };
    },
    async loadContract(id) {
      const { data } = await admin
        .from('contracts')
        .select(
          'id, tenant_id, company_id, contract_number, status, signature_status, needs_regenerar, contract_model, project_id, projects(name, contract_model)',
        )
        .eq('id', id)
        .maybeSingle();
      if (!data?.id) return null;
      let tenantId = pickTenant(data);
      if (!tenantId && data.project_id) {
        const { data: project } = await admin
          .from('projects')
          .select('tenant_id, company_id')
          .eq('id', data.project_id)
          .maybeSingle();
        tenantId = pickTenant(project);
      }
      let partyTotal: number | null = null;
      let partySigned: number | null = null;
      const { data: parties } = await admin
        .from('contract_signature_parties')
        .select('id, signature_status')
        .eq('contract_id', id);
      if (Array.isArray(parties)) {
        partyTotal = parties.length;
        partySigned = parties.filter((item) => String(item.signature_status || '').toUpperCase() === 'SIGNED').length;
      }
      const nested = data.projects as { name?: string; contract_model?: string } | { name?: string; contract_model?: string }[] | null;
      const project = Array.isArray(nested) ? nested[0] : nested;
      return {
        id: String(data.id),
        tenantId,
        contractNumber: data.contract_number ? String(data.contract_number) : null,
        status: data.status ? String(data.status) : null,
        signatureStatus: data.signature_status ? String(data.signature_status) : null,
        needsRegenerar: data.needs_regenerar === true,
        projectName: project?.name ? String(project.name) : null,
        contractModel: data.contract_model
          ? String(data.contract_model)
          : project?.contract_model
            ? String(project.contract_model)
            : null,
        partyTotal,
        partySigned,
      };
    },
  };
}
