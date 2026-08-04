/**
 * Geração controlada de memoriais/pranchas no staging F2 (não persiste no cadastro).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMemorialPayload } from '@/lib/memorial/memorialData';
import { generateMemorialPdf } from '@/lib/memorial/memorialPdf';
import { loadLotSheetPayload } from '@/lib/lotSheetData';
import { generateLotSheetPdf } from '@/lib/lotSheetPdf';
import { generateEnterpriseOverviewFromInput } from '@/lib/enterpriseOverviewPdf';
import { DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS } from '@/lib/enterpriseOverviewLayout';
import { folderProject, sanitizeFolderName } from '@/lib/master/companyExport/friendlyNames';
import { uploadBinaryToStaging } from '@/lib/master/companyExport/storageCopy';
import { buildBlockGeoFeature } from '@/lib/master/companyExport/blockGeoJson';

export type PlanGenerationError = {
  project_id: string | null;
  block_id: string | null;
  type: 'memorial' | 'lot_plan' | 'general_plan';
  reason: string;
};

export type BlockPlanTarget = {
  id: string;
  project_id: string;
  block_name?: string | null;
  lot_number?: string | null;
  number?: string | null;
};

export function blockHasValidGeometry(row: Record<string, unknown>): boolean {
  const { source } = buildBlockGeoFeature(row);
  return source === 'geometry' || source === 'segments_json';
}

function pdfDocToBuffer(doc: { output: (t: string) => ArrayBuffer | string }): Buffer {
  const out = doc.output('arraybuffer');
  return Buffer.from(out as ArrayBuffer);
}

export async function generateMemorialForBlock(
  admin: SupabaseClient,
  companyId: string,
  exportId: string,
  block: BlockPlanTarget,
  projectName: string,
): Promise<{ ok: true; rel: string; bytes: number; checksum: string } | { ok: false; error: PlanGenerationError }> {
  try {
    const payload = await loadMemorialPayload(admin, {
      projectId: block.project_id,
      blockId: block.id,
      tenantId: companyId,
    });
    const doc = await generateMemorialPdf(payload);
    const buf = pdfDocToBuffer(doc);
    const emp = folderProject(projectName, block.project_id);
    const lot = sanitizeFolderName(
      String(block.lot_number || block.number || block.block_name || block.id).slice(0, 20),
    );
    const rel = `04_empreendimentos/${emp}/memoriais/Memorial_${lot}_${block.id.slice(0, 8)}.pdf`;
    const up = await uploadBinaryToStaging(
      admin,
      companyId,
      exportId,
      rel,
      buf,
      'application/pdf',
    );
    if (!up.ok) {
      return {
        ok: false,
        error: {
          project_id: block.project_id,
          block_id: block.id,
          type: 'memorial',
          reason: up.error || 'upload falhou',
        },
      };
    }
    return { ok: true, rel, bytes: up.size, checksum: up.checksum };
  } catch (e) {
    return {
      ok: false,
      error: {
        project_id: block.project_id,
        block_id: block.id,
        type: 'memorial',
        reason: String(e instanceof Error ? e.message : e).slice(0, 200),
      },
    };
  }
}

export async function generateLotPlanForBlock(
  admin: SupabaseClient,
  companyId: string,
  exportId: string,
  block: BlockPlanTarget,
  projectName: string,
): Promise<{ ok: true; rel: string; bytes: number; checksum: string } | { ok: false; error: PlanGenerationError }> {
  try {
    const payload = await loadLotSheetPayload(admin, {
      projectId: block.project_id,
      blockId: block.id,
      tenantId: companyId,
    });
    const doc = await generateLotSheetPdf(payload);
    const buf = pdfDocToBuffer(doc);
    const emp = folderProject(projectName, block.project_id);
    const lot = sanitizeFolderName(
      String(block.lot_number || block.number || block.block_name || block.id).slice(0, 20),
    );
    const rel = `04_empreendimentos/${emp}/pranchas/Prancha_${lot}_${block.id.slice(0, 8)}.pdf`;
    const up = await uploadBinaryToStaging(
      admin,
      companyId,
      exportId,
      rel,
      buf,
      'application/pdf',
    );
    if (!up.ok) {
      return {
        ok: false,
        error: {
          project_id: block.project_id,
          block_id: block.id,
          type: 'lot_plan',
          reason: up.error || 'upload falhou',
        },
      };
    }
    return { ok: true, rel, bytes: up.size, checksum: up.checksum };
  } catch (e) {
    return {
      ok: false,
      error: {
        project_id: block.project_id,
        block_id: block.id,
        type: 'lot_plan',
        reason: String(e instanceof Error ? e.message : e).slice(0, 200),
      },
    };
  }
}

export async function generateGeneralPlanForProject(
  admin: SupabaseClient,
  companyId: string,
  exportId: string,
  projectId: string,
  projectName: string,
): Promise<{ ok: true; rel: string; bytes: number; checksum: string } | { ok: false; error: PlanGenerationError }> {
  try {
    const { data: project, error: projErr } = await admin
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();
    if (projErr || !project) {
      throw new Error(projErr?.message || 'Projeto não encontrado');
    }
    // Tenant check
    const pTenant = String(
      (project as Record<string, unknown>).tenant_id ||
        (project as Record<string, unknown>).company_id ||
        '',
    );
    if (pTenant && pTenant !== companyId) {
      throw new Error('Projeto fora do escopo da empresa');
    }

    const { data: blocks } = await admin
      .from('blocks')
      .select('*')
      .eq('project_id', projectId)
      .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
      .limit(2000);
    const rows = (blocks as Record<string, unknown>[] | null) ?? [];
    if (rows.length === 0) {
      throw new Error('Nenhum lote no empreendimento');
    }

    const { data: guides } = await admin
      .from('street_guides')
      .select('*')
      .eq('project_id', projectId);

    const { data: company } = await admin
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .maybeSingle();

    const doc = await generateEnterpriseOverviewFromInput({
      blocks: rows,
      streetGuides: (guides as Record<string, unknown>[] | null) ?? [],
      project: project as Record<string, unknown>,
      company: company as Record<string, unknown> | null,
      options: { ...DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS },
    });

    const buf = pdfDocToBuffer(doc);
    const emp = folderProject(projectName, projectId);
    const rel = `04_empreendimentos/${emp}/pranchas/Prancha_Geral_${emp}.pdf`;
    const up = await uploadBinaryToStaging(
      admin,
      companyId,
      exportId,
      rel,
      buf,
      'application/pdf',
    );
    if (!up.ok) {
      return {
        ok: false,
        error: {
          project_id: projectId,
          block_id: null,
          type: 'general_plan',
          reason: up.error || 'upload falhou',
        },
      };
    }
    return { ok: true, rel, bytes: up.size, checksum: up.checksum };
  } catch (e) {
    return {
      ok: false,
      error: {
        project_id: projectId,
        block_id: null,
        type: 'general_plan',
        reason: String(e instanceof Error ? e.message : e).slice(0, 200),
      },
    };
  }
}
