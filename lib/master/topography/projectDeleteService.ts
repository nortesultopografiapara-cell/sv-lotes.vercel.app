/**
 * Exclusão segura de projetos de topografia (Master).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertSecureDeleteConfirmWord,
  formatProjectDeleteLinks,
  projectDeleteHasLinks,
  type ProjectDeleteLinkSummary,
} from '@/lib/master/corporateFinance/secureDeletePolicy';
import { deleteCorporatePayableSecure } from '@/lib/master/corporateFinance/secureDeleteService';
import { deleteCorporateReceivableSecure } from '@/lib/master/corporateFinance/secureDeleteService';
import {
  getTopographyProjectById,
  logTopographyProjectAudit,
} from '@/lib/master/topography/projectsService';
import { deleteTopographyQuotePermanently } from '@/lib/master/topography/quotesService';
import { canPermanentlyDeleteTopographyQuote } from '@/lib/master/topography/quoteDeletePolicy';

export async function countTopographyProjectLinks(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectDeleteLinkSummary> {
  const count = async (table: string, column = 'project_id') => {
    const { count: c, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, projectId);
    if (error) throw new Error(error.message);
    return c || 0;
  };

  const quotesConverted = await count('master_topography_quotes', 'converted_project_id');

  return {
    receivables: await count('master_corporate_receivables'),
    payables: await count('master_corporate_payables'),
    quotes: quotesConverted,
    cashMovements: await count('master_corporate_cash_movements'),
    costCenters: await count('master_corporate_cost_centers'),
    asaasCharges: await count('master_corporate_asaas_charges'),
  };
}

export type ProjectSecureDeleteResult = {
  id: string;
  code: string;
  alreadyDeleted: boolean;
  cascade: boolean;
  links: ProjectDeleteLinkSummary;
  deletedReceivables: number;
  deletedPayables: number;
  deletedQuotes: number;
  deletedCashMovements: number;
  message: string;
};

export async function deleteTopographyProjectSecure(
  supabase: SupabaseClient,
  params: {
    id: string;
    confirmWord: string;
    userId: string | null;
    reason?: string | null;
    /** Excluir também vínculos via rotinas seguras. */
    cascadeLinks?: boolean;
  },
): Promise<ProjectSecureDeleteResult> {
  assertSecureDeleteConfirmWord(params.confirmWord);

  const existing = await getTopographyProjectById(supabase, params.id);
  if (!existing) {
    return {
      id: params.id,
      code: '',
      alreadyDeleted: true,
      cascade: false,
      links: {
        receivables: 0,
        payables: 0,
        quotes: 0,
        cashMovements: 0,
        costCenters: 0,
        asaasCharges: 0,
      },
      deletedReceivables: 0,
      deletedPayables: 0,
      deletedQuotes: 0,
      deletedCashMovements: 0,
      message: 'Projeto já inexistente (idempotente).',
    };
  }

  const links = await countTopographyProjectLinks(supabase, existing.id);
  const hasLinks = projectDeleteHasLinks(links);

  if (hasLinks && !params.cascadeLinks) {
    const lines = formatProjectDeleteLinks(links).join(', ');
    throw new Error(
      `Projeto com vínculos: ${lines}. Use cascadeLinks=true (SUPER_ADMIN) ou remova os vínculos antes.`,
    );
  }

  let deletedReceivables = 0;
  let deletedPayables = 0;
  let deletedQuotes = 0;
  let deletedCashMovements = 0;

  if (params.cascadeLinks && hasLinks) {
    const { data: ars } = await supabase
      .from('master_corporate_receivables')
      .select('id')
      .eq('project_id', existing.id);
    for (const ar of ars || []) {
      await deleteCorporateReceivableSecure(supabase, {
        id: String(ar.id),
        confirmWord: params.confirmWord,
        userId: params.userId,
        reason: `Cascade projeto ${existing.code}`,
        localOnly: true,
      });
      deletedReceivables += 1;
    }

    const { data: aps } = await supabase
      .from('master_corporate_payables')
      .select('id')
      .eq('project_id', existing.id);
    for (const ap of aps || []) {
      await deleteCorporatePayableSecure(supabase, {
        id: String(ap.id),
        confirmWord: params.confirmWord,
        userId: params.userId,
        reason: `Cascade projeto ${existing.code}`,
      });
      deletedPayables += 1;
    }

    // Movimentos órfãos restantes (SET NULL após AR/AP) ainda com project_id
    const { data: cashRows } = await supabase
      .from('master_corporate_cash_movements')
      .select('id')
      .eq('project_id', existing.id);
    const cashIds = (cashRows || []).map((r) => String(r.id));
    if (cashIds.length) {
      await supabase
        .from('master_corporate_cash_movements')
        .update({ reversal_movement_id: null })
        .in('id', cashIds);
      await supabase
        .from('master_corporate_cash_movements')
        .update({ reversal_movement_id: null })
        .in('reversal_movement_id', cashIds);
      const { error: cashDelErr } = await supabase
        .from('master_corporate_cash_movements')
        .delete()
        .in('id', cashIds);
      if (cashDelErr) throw new Error(cashDelErr.message);
      deletedCashMovements = cashIds.length;
    }

    const { data: quotes } = await supabase
      .from('master_topography_quotes')
      .select('id, code, status, converted_project_id, approved_at')
      .eq('converted_project_id', existing.id);
    for (const q of quotes || []) {
      // Desvincula conversão para permitir exclusão se ainda rascunho-like; senão só null
      const gate = canPermanentlyDeleteTopographyQuote({
        status: 'RASCUNHO',
        converted_project_id: null,
        approved_at: null,
      });
      if (gate.ok) {
        await supabase
          .from('master_topography_quotes')
          .update({ converted_project_id: null, status: 'RASCUNHO' })
          .eq('id', String(q.id));
        try {
          await deleteTopographyQuotePermanently(supabase, String(q.id), String(q.code));
          deletedQuotes += 1;
        } catch {
          await supabase
            .from('master_topography_quotes')
            .update({ converted_project_id: null })
            .eq('id', String(q.id));
        }
      } else {
        await supabase
          .from('master_topography_quotes')
          .update({ converted_project_id: null })
          .eq('id', String(q.id));
      }
    }

    // Centros de custo: só desvincula (não apaga estrutura)
    await supabase
      .from('master_corporate_cost_centers')
      .update({ project_id: null })
      .eq('project_id', existing.id);
  }

  await logTopographyProjectAudit(supabase, {
    userId: params.userId,
    action: 'TOPOGRAPHY_PROJECT_SECURE_DELETE',
    entityId: existing.id,
    description: `Exclusão segura projeto ${existing.code}`,
    oldData: {
      code: existing.code,
      title: existing.title,
      links,
      cascade: Boolean(params.cascadeLinks),
      reason: String(params.reason || '').slice(0, 500),
    },
  });

  const { error } = await supabase.from('master_topography_projects').delete().eq('id', existing.id);
  if (error) throw new Error(error.message);

  return {
    id: existing.id,
    code: existing.code,
    alreadyDeleted: false,
    cascade: Boolean(params.cascadeLinks),
    links,
    deletedReceivables,
    deletedPayables,
    deletedQuotes,
    deletedCashMovements,
    message: `Projeto ${existing.code} excluído.${
      params.cascadeLinks
        ? ` Vínculos removidos: AR ${deletedReceivables}, AP ${deletedPayables}, caixa ${deletedCashMovements}, orçamentos ${deletedQuotes}.`
        : ''
    }`,
  };
}
