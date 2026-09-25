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
      const { data, error } = await admin
        .from('contracts')
        .select(
          'id, tenant_id, company_id, contract_number, status, signature_status, needs_regenerar, contract_model, project_id',
        )
        .eq('id', id)
        .maybeSingle();
      if (error || !data?.id) return null;

      const companyId = data.company_id ? String(data.company_id) : null;
      let tenantId = pickTenant(data);
      let projectName: string | null = null;
      let contractModel = data.contract_model ? String(data.contract_model) : null;

      if (data.project_id) {
        const { data: project } = await admin
          .from('projects')
          .select('tenant_id, company_id, name, contract_model')
          .eq('id', data.project_id)
          .maybeSingle();
        if (project) {
          if (!tenantId) tenantId = pickTenant(project);
          projectName = project.name ? String(project.name) : null;
          if (!contractModel && project.contract_model) contractModel = String(project.contract_model);
        }
      }

      let partyTotal: number | null = null;
      let partySigned: number | null = null;
      let pendingExternal = 0;
      let pendingInternalVendor = false;
      const pendingPartyRoles: string[] = [];
      const { data: parties } = await admin
        .from('contract_signature_parties')
        .select('id, role, status, signature_url, signature_token_hash, signature_data')
        .eq('contract_id', id);
      if (Array.isArray(parties)) {
        partyTotal = parties.length;
        partySigned = parties.filter((item) => {
          const st = String(item.status || '').toUpperCase();
          return st === 'SIGNED';
        }).length;
        for (const item of parties) {
          const st = String(item.status || '').toUpperCase();
          if (st === 'SIGNED' || st === 'CANCELLED' || st === 'EXPIRED') continue;
          const role = String(item.role || '').toUpperCase();
          const signatureData =
            item.signature_data && typeof item.signature_data === 'object'
              ? (item.signature_data as Record<string, unknown>)
              : {};
          const flaggedInternal =
            signatureData.internalAdminSign === true || signatureData.estrelaCompanyVendor === true;
          const hasPublicLink = Boolean(item.signature_url || item.signature_token_hash);
          if (role === 'VENDOR' && (flaggedInternal || !hasPublicLink)) {
            pendingInternalVendor = true;
            pendingPartyRoles.push('VENDOR_INTERNAL');
          } else if (role === 'INTERVENIENT') {
            pendingPartyRoles.push('INTERVENIENT');
          } else if (role === 'VENDOR') {
            pendingExternal += 1;
            pendingPartyRoles.push('VENDOR_EXTERNAL');
          } else if (role === 'WITNESS_1' || role === 'WITNESS_2' || role === 'WITNESS') {
            pendingExternal += 1;
            pendingPartyRoles.push('WITNESS');
          } else {
            pendingExternal += 1;
            pendingPartyRoles.push(role || 'PARTY');
          }
        }
      }
      return {
        id: String(data.id),
        tenantId,
        companyId,
        contractNumber: data.contract_number ? String(data.contract_number) : null,
        status: data.status ? String(data.status) : null,
        signatureStatus: data.signature_status ? String(data.signature_status) : null,
        needsRegenerar: data.needs_regenerar === true,
        projectName,
        contractModel,
        partyTotal,
        partySigned,
        pendingExternal,
        pendingInternalVendor,
        pendingPartyRoles: Array.from(new Set(pendingPartyRoles)),
        eSignStarted: Boolean(data.signature_status) || (partyTotal ?? 0) > 0,
      };
    },
  };
}
