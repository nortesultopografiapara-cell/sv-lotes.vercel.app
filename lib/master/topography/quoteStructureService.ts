import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_QUOTE_STAGE_NAMES } from './defaultQuoteStages';
import {
  computeQuoteFinancials,
  priceDifferencePercent,
  priceDifferenceValue,
  stagePercentOfBudget,
  stageSubtotal,
  type QuoteFinancialSummary,
} from './quoteFinancials';
import type {
  MasterTopographyQuote,
  MasterTopographyQuoteItem,
  MasterTopographyQuoteItemInput,
  MasterTopographyQuoteStage,
  MasterTopographyQuoteStageInput,
  MasterTopographyQuoteStageWithItems,
  MasterTopographyQuoteStructure,
} from './quoteTypes';
import { getTopographyQuoteById, updateTopographyQuote } from './quotesService';

const STAGE_SELECT =
  'id, quote_id, name, sort_order, is_system, created_at, updated_at';
const ITEM_SELECT = `
  id, quote_id, stage_id, code, price_bank, description, unit, quantity, unit_value,
  reference_price, adopted_price, competence, uf, notes, catalog_item_id, custom_item_id,
  sort_order, created_at, updated_at
`.replace(/\s+/g, ' ').trim();

function parseStage(row: Record<string, unknown>): MasterTopographyQuoteStage {
  return {
    id: String(row.id),
    quote_id: String(row.quote_id),
    name: String(row.name || ''),
    sort_order: Number(row.sort_order || 0),
    is_system: Boolean(row.is_system),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

function parseItem(row: Record<string, unknown>): MasterTopographyQuoteItem {
  const adopted = Number(
    row.adopted_price != null ? row.adopted_price : row.unit_value != null ? row.unit_value : 0,
  );
  const reference = Number(
    row.reference_price != null ? row.reference_price : adopted,
  );
  return {
    id: String(row.id),
    quote_id: String(row.quote_id),
    stage_id: String(row.stage_id),
    code: row.code ? String(row.code) : null,
    price_bank: row.price_bank ? String(row.price_bank) : null,
    description: String(row.description || ''),
    unit: String(row.unit || 'UN'),
    quantity: Number(row.quantity || 0),
    unit_value: adopted,
    reference_price: reference,
    adopted_price: adopted,
    competence: row.competence ? String(row.competence) : null,
    uf: row.uf ? String(row.uf) : null,
    notes: row.notes ? String(row.notes) : null,
    catalog_item_id: row.catalog_item_id ? String(row.catalog_item_id) : null,
    custom_item_id: row.custom_item_id ? String(row.custom_item_id) : null,
    sort_order: Number(row.sort_order || 0),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

export function buildStructureFromRows(
  quote: MasterTopographyQuote,
  stages: MasterTopographyQuoteStage[],
  items: MasterTopographyQuoteItem[],
): MasterTopographyQuoteStructure {
  const byStage = new Map<string, MasterTopographyQuoteItem[]>();
  for (const item of items) {
    const list = byStage.get(item.stage_id) || [];
    list.push(item);
    byStage.set(item.stage_id, list);
  }

  const calcItems = items.map((i) => ({
    quantity: i.quantity,
    unit_value: i.adopted_price,
    reference_price: i.reference_price,
  }));
  const financials = computeQuoteFinancials(
    calcItems,
    quote.bdi_percent,
    quote.discount_percent,
    quote.margin_percent,
  );

  const stagesWithItems: MasterTopographyQuoteStageWithItems[] = stages
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((stage) => {
      const stageItems = (byStage.get(stage.id) || []).sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      const subtotal = stageSubtotal(
        stageItems.map((i) => ({ quantity: i.quantity, unit_value: i.adopted_price })),
        quote.bdi_percent,
      );
      return {
        ...stage,
        items: stageItems,
        itemCount: stageItems.length,
        subtotal,
        percentOfBudget: stagePercentOfBudget(subtotal, financials.totalWithBdi),
      };
    });

  return { quote, stages: stagesWithItems, financials };
}

export async function seedDefaultQuoteStages(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const rows = DEFAULT_QUOTE_STAGE_NAMES.map((name, index) => ({
    quote_id: quoteId,
    name,
    sort_order: index,
    is_system: true,
    updated_at: now,
  }));
  const { error } = await supabase.from('master_topography_quote_stages').insert(rows);
  if (error) throw new Error(error.message || 'Falha ao criar etapas padrão.');
}

export async function listQuoteStages(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<MasterTopographyQuoteStage[]> {
  const { data, error } = await supabase
    .from('master_topography_quote_stages')
    .select(STAGE_SELECT)
    .eq('quote_id', quoteId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message || 'Falha ao listar etapas.');
  return (data || []).map((row) => parseStage(row as Record<string, unknown>));
}

export async function listQuoteItems(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<MasterTopographyQuoteItem[]> {
  const { data, error } = await supabase
    .from('master_topography_quote_items')
    .select(ITEM_SELECT)
    .eq('quote_id', quoteId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message || 'Falha ao listar itens.');
  return (data || []).map((row) => parseItem(row as Record<string, unknown>));
}

export async function getTopographyQuoteStructure(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<MasterTopographyQuoteStructure | null> {
  const quote = await getTopographyQuoteById(supabase, quoteId);
  if (!quote) return null;
  const [stages, items] = await Promise.all([
    listQuoteStages(supabase, quoteId),
    listQuoteItems(supabase, quoteId),
  ]);
  return buildStructureFromRows(quote, stages, items);
}

async function syncQuoteTotals(
  supabase: SupabaseClient,
  quoteId: string,
  financials: QuoteFinancialSummary,
): Promise<MasterTopographyQuote> {
  const { error } = await supabase
    .from('master_topography_quotes')
    .update({
      estimated_value: financials.totalWithBdi,
      discount_value: financials.discountValue,
      final_value: financials.totalGeral,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quoteId);
  if (error) throw new Error(error.message || 'Falha ao sincronizar totais.');
  const quote = await getTopographyQuoteById(supabase, quoteId);
  if (!quote) throw new Error('Orçamento não encontrado após sync.');
  return quote;
}

function itemRow(
  quoteId: string,
  stageId: string,
  item: MasterTopographyQuoteItemInput,
  now: string,
) {
  const adopted = Number(item.adopted_price ?? item.unit_value ?? 0);
  const reference = Number(item.reference_price ?? adopted);
  return {
    quote_id: quoteId,
    stage_id: stageId,
    code: item.code ?? null,
    price_bank: item.price_bank ?? null,
    description: item.description || '',
    unit: item.unit || 'UN',
    quantity: item.quantity,
    unit_value: adopted,
    reference_price: reference,
    adopted_price: adopted,
    competence: item.competence ?? null,
    uf: item.uf ?? null,
    notes: item.notes ?? null,
    catalog_item_id: item.catalog_item_id ?? null,
    custom_item_id: item.custom_item_id ?? null,
    sort_order: item.sort_order,
    updated_at: now,
  };
}

async function syncBudgetItemPrices(
  supabase: SupabaseClient,
  quoteId: string,
  items: MasterTopographyQuoteItem[],
): Promise<void> {
  if (!items.length) {
    await supabase.from('master_topography_budget_item_prices').delete().eq('quote_id', quoteId);
    return;
  }
  const now = new Date().toISOString();
  const rows = items.map((item) => ({
    quote_id: quoteId,
    quote_item_id: item.id,
    reference_price: item.reference_price,
    adopted_price: item.adopted_price,
    difference_percent: priceDifferencePercent(item.reference_price, item.adopted_price),
    difference_value: priceDifferenceValue(item.reference_price, item.adopted_price),
    competence: item.competence,
    uf: item.uf,
    updated_at: now,
  }));

  const { error: delErr } = await supabase
    .from('master_topography_budget_item_prices')
    .delete()
    .eq('quote_id', quoteId);
  if (delErr) throw new Error(delErr.message || 'Falha ao limpar preços de itens.');

  const { error } = await supabase.from('master_topography_budget_item_prices').insert(rows);
  if (error) throw new Error(error.message || 'Falha ao gravar preços de itens.');
}

/**
 * Persiste cabeçalho + árvore de etapas/itens e recalcula totais.
 */
export async function saveTopographyQuoteStructure(
  supabase: SupabaseClient,
  quoteId: string,
  quoteInput: Parameters<typeof updateTopographyQuote>[2],
  stagesInput: MasterTopographyQuoteStageInput[],
  userId: string | null,
): Promise<MasterTopographyQuoteStructure> {
  const existing = await getTopographyQuoteById(supabase, quoteId);
  if (!existing) throw new Error('Orçamento não encontrado.');
  if (existing.status === 'CONVERTIDO' || existing.converted_project_id) {
    throw new Error('Orçamento já convertido não pode ser editado.');
  }

  await updateTopographyQuote(supabase, quoteId, quoteInput, userId);

  const now = new Date().toISOString();
  const currentStages = await listQuoteStages(supabase, quoteId);
  const keepStageIds = new Set(
    stagesInput.map((s) => s.id).filter((id): id is string => Boolean(id)),
  );
  const stagesToDelete = currentStages.filter((s) => !keepStageIds.has(s.id));
  if (stagesToDelete.length) {
    const { error } = await supabase
      .from('master_topography_quote_stages')
      .delete()
      .in(
        'id',
        stagesToDelete.map((s) => s.id),
      );
    if (error) throw new Error(error.message || 'Falha ao remover etapas.');
  }

  const resolvedStages: Array<{ id: string; input: MasterTopographyQuoteStageInput }> = [];

  for (const stage of stagesInput) {
    if (stage.id) {
      const { error } = await supabase
        .from('master_topography_quote_stages')
        .update({
          name: stage.name,
          sort_order: stage.sort_order,
          is_system: Boolean(stage.is_system),
          updated_at: now,
        })
        .eq('id', stage.id)
        .eq('quote_id', quoteId);
      if (error) throw new Error(error.message || 'Falha ao atualizar etapa.');
      resolvedStages.push({ id: stage.id, input: stage });
    } else {
      const { data, error } = await supabase
        .from('master_topography_quote_stages')
        .insert({
          quote_id: quoteId,
          name: stage.name,
          sort_order: stage.sort_order,
          is_system: Boolean(stage.is_system),
          updated_at: now,
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(error?.message || 'Falha ao criar etapa.');
      resolvedStages.push({ id: String(data.id), input: stage });
    }
  }

  for (const { id: stageId, input: stage } of resolvedStages) {
    const currentItems = (await listQuoteItems(supabase, quoteId)).filter(
      (i) => i.stage_id === stageId,
    );
    const keepItemIds = new Set(
      stage.items.map((i) => i.id).filter((id): id is string => Boolean(id)),
    );
    const itemsToDelete = currentItems.filter((i) => !keepItemIds.has(i.id));
    if (itemsToDelete.length) {
      const { error } = await supabase
        .from('master_topography_quote_items')
        .delete()
        .in(
          'id',
          itemsToDelete.map((i) => i.id),
        );
      if (error) throw new Error(error.message || 'Falha ao remover itens.');
    }

    for (const item of stage.items) {
      const row = itemRow(quoteId, stageId, item, now);
      if (item.id) {
        const { error } = await supabase
          .from('master_topography_quote_items')
          .update(row)
          .eq('id', item.id)
          .eq('quote_id', quoteId);
        if (error) throw new Error(error.message || 'Falha ao atualizar item.');
      } else {
        const { error } = await supabase.from('master_topography_quote_items').insert(row);
        if (error) throw new Error(error.message || 'Falha ao criar item.');
      }
    }
  }

  const [stages, items] = await Promise.all([
    listQuoteStages(supabase, quoteId),
    listQuoteItems(supabase, quoteId),
  ]);
  const financials = computeQuoteFinancials(
    items.map((i) => ({
      quantity: i.quantity,
      unit_value: i.adopted_price,
      reference_price: i.reference_price,
    })),
    quoteInput.bdi_percent ?? existing.bdi_percent,
    quoteInput.discount_percent ?? existing.discount_percent,
    quoteInput.margin_percent ?? existing.margin_percent,
  );
  await syncBudgetItemPrices(supabase, quoteId, items);
  const quote = await syncQuoteTotals(supabase, quoteId, financials);
  return buildStructureFromRows(quote, stages, items);
}

export async function duplicateQuoteStructure(
  supabase: SupabaseClient,
  sourceQuoteId: string,
  targetQuoteId: string,
): Promise<void> {
  const [stages, items] = await Promise.all([
    listQuoteStages(supabase, sourceQuoteId),
    listQuoteItems(supabase, sourceQuoteId),
  ]);
  if (!stages.length) {
    await seedDefaultQuoteStages(supabase, targetQuoteId);
    return;
  }

  const now = new Date().toISOString();
  const stageIdMap = new Map<string, string>();

  for (const stage of stages) {
    const { data, error } = await supabase
      .from('master_topography_quote_stages')
      .insert({
        quote_id: targetQuoteId,
        name: stage.name,
        sort_order: stage.sort_order,
        is_system: stage.is_system,
        updated_at: now,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message || 'Falha ao duplicar etapa.');
    stageIdMap.set(stage.id, String(data.id));
  }

  if (items.length) {
    const rows = items.map((item) => ({
      quote_id: targetQuoteId,
      stage_id: stageIdMap.get(item.stage_id)!,
      code: item.code,
      price_bank: item.price_bank,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unit_value: item.adopted_price,
      reference_price: item.reference_price,
      adopted_price: item.adopted_price,
      competence: item.competence,
      uf: item.uf,
      notes: item.notes,
      catalog_item_id: item.catalog_item_id,
      custom_item_id: item.custom_item_id,
      sort_order: item.sort_order,
      updated_at: now,
    }));
    const { error } = await supabase.from('master_topography_quote_items').insert(rows);
    if (error) throw new Error(error.message || 'Falha ao duplicar itens.');
  }
}
