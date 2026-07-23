import type { SupabaseClient } from '@supabase/supabase-js';
import type { MasterTopographyPriceDatabase } from './priceBanks';
import { TOPOGRAPHY_PRICE_BANK_SEED } from './priceBanks';

export type MasterTopographyPriceItem = {
  id: string;
  database_id: string | null;
  bank_code: string;
  uf: string | null;
  competence: string | null;
  code: string;
  description: string;
  unit: string;
  reference_price: number;
  origin: string | null;
  item_type: string | null;
  version: string | null;
  import_id: string | null;
  is_active: boolean;
  source: 'catalog' | 'custom';
};

export type MasterTopographyCustomItem = {
  id: string;
  code: string;
  description: string;
  category: string | null;
  unit: string;
  price: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

export type PriceCatalogSearchResult = {
  items: MasterTopographyPriceItem[];
  total: number;
  page: number;
  limit: number;
  elapsedMs: number;
};

type CacheEntry = { at: number; payload: PriceCatalogSearchResult };
const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function parseCatalogRow(
  row: Record<string, unknown>,
  source: 'catalog' | 'custom',
): MasterTopographyPriceItem {
  if (source === 'custom') {
    return {
      id: String(row.id),
      database_id: null,
      bank_code: 'PROPRIO',
      uf: null,
      competence: null,
      code: String(row.code || ''),
      description: String(row.description || ''),
      unit: String(row.unit || 'UN'),
      reference_price: Number(row.price || 0),
      origin: 'CUSTOM',
      item_type: row.category ? String(row.category) : 'PROPRIO',
      version: null,
      import_id: null,
      is_active: Boolean(row.is_active ?? true),
      source: 'custom',
    };
  }
  return {
    id: String(row.id),
    database_id: row.database_id ? String(row.database_id) : null,
    bank_code: String(row.bank_code || ''),
    uf: row.uf ? String(row.uf) : null,
    competence: row.competence ? String(row.competence) : null,
    code: String(row.code || ''),
    description: String(row.description || ''),
    unit: String(row.unit || 'UN'),
    reference_price: Number(row.reference_price || 0),
    origin: row.origin ? String(row.origin) : null,
    item_type: row.item_type ? String(row.item_type) : null,
    version: row.version ? String(row.version) : null,
    import_id: row.import_id ? String(row.import_id) : null,
    is_active: Boolean(row.is_active ?? true),
    source: 'catalog',
  };
}

export async function listPriceDatabases(
  supabase: SupabaseClient,
): Promise<MasterTopographyPriceDatabase[]> {
  const { data, error } = await supabase
    .from('master_topography_price_databases')
    .select('id, code, label, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error || !data?.length) {
    return TOPOGRAPHY_PRICE_BANK_SEED.map((b, i) => ({
      id: `seed-${b.code}`,
      code: b.code,
      label: b.label,
      is_active: true,
      sort_order: (i + 1) * 10,
    }));
  }

  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    code: String(row.code),
    label: String(row.label),
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order || 0),
  }));
}

export async function searchPriceCatalog(
  supabase: SupabaseClient,
  opts: {
    q?: string;
    bankCode?: string | null;
    page?: number;
    limit?: number;
    includeCustom?: boolean;
  },
): Promise<PriceCatalogSearchResult> {
  const started = Date.now();
  const page = Math.max(1, Math.trunc(opts.page || 1));
  const limit = Math.min(50, Math.max(1, Math.trunc(opts.limit || 20)));
  const q = String(opts.q || '').trim();
  const bank = opts.bankCode && opts.bankCode !== 'ALL' ? opts.bankCode : null;
  const cacheKey = `${bank || 'ALL'}|${q.toLowerCase()}|${page}|${limit}|${opts.includeCustom !== false}`;

  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.payload, elapsedMs: Date.now() - started };
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const items: MasterTopographyPriceItem[] = [];
  let total = 0;

  const includeCustom = opts.includeCustom !== false && (!bank || bank === 'PROPRIO');

  if (!bank || bank !== 'PROPRIO') {
    let query = supabase
      .from('master_topography_price_items')
      .select(
        'id, database_id, bank_code, uf, competence, code, description, unit, reference_price, origin, item_type, version, import_id, is_active',
        { count: 'exact' },
      )
      .eq('is_active', true);

    if (bank) query = query.eq('bank_code', bank);
    if (q) {
      const escaped = q.replace(/[%_,]/g, ' ');
      query = query.or(
        `description.ilike.%${escaped}%,code.ilike.%${escaped}%`,
      );
    }

    const { data, error, count } = await query
      .order('description', { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message || 'Falha na pesquisa do catálogo.');
    total += count ?? 0;
    for (const row of data || []) {
      items.push(parseCatalogRow(row as Record<string, unknown>, 'catalog'));
    }
  }

  if (includeCustom && items.length < limit) {
    let customQuery = supabase
      .from('master_topography_custom_items')
      .select('id, code, description, category, unit, price, notes, is_active', {
        count: 'exact',
      })
      .eq('is_active', true);

    if (q) {
      const escaped = q.replace(/[%_,]/g, ' ');
      customQuery = customQuery.or(
        `description.ilike.%${escaped}%,code.ilike.%${escaped}%`,
      );
    }

    const need = limit - items.length;
    const { data: customData, count: customCount } = await customQuery
      .order('description', { ascending: true })
      .range(0, Math.max(0, need - 1));

    total += customCount ?? 0;
    for (const row of customData || []) {
      items.push(parseCatalogRow(row as Record<string, unknown>, 'custom'));
    }
  }

  const payload: PriceCatalogSearchResult = {
    items: items.slice(0, limit),
    total,
    page,
    limit,
    elapsedMs: Date.now() - started,
  };
  searchCache.set(cacheKey, { at: Date.now(), payload });
  return payload;
}

export async function createCustomPriceItem(
  supabase: SupabaseClient,
  input: {
    code: string;
    description: string;
    category?: string | null;
    unit: string;
    price: number;
    notes?: string | null;
  },
  createdBy: string | null,
): Promise<MasterTopographyCustomItem> {
  const code = String(input.code || '').trim();
  const description = String(input.description || '').trim();
  if (!code) throw new Error('Código interno é obrigatório.');
  if (!description) throw new Error('Descrição é obrigatória.');
  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0) throw new Error('Preço inválido.');

  const { data, error } = await supabase
    .from('master_topography_custom_items')
    .insert({
      code,
      description,
      category: input.category ?? null,
      unit: input.unit || 'UN',
      price,
      notes: input.notes ?? null,
      created_by: createdBy,
      updated_at: new Date().toISOString(),
    })
    .select('id, code, description, category, unit, price, notes, is_active, created_at')
    .single();

  if (error) throw new Error(error.message || 'Falha ao criar item próprio.');
  return {
    id: String(data.id),
    code: String(data.code),
    description: String(data.description),
    category: data.category ? String(data.category) : null,
    unit: String(data.unit || 'UN'),
    price: Number(data.price || 0),
    notes: data.notes ? String(data.notes) : null,
    is_active: Boolean(data.is_active),
    created_at: String(data.created_at || ''),
  };
}

/**
 * Registra importação (mecanismo preparado — sem conexão automática a órgãos).
 * Aceita linhas já parseadas no servidor.
 */
export async function registerPriceImport(
  supabase: SupabaseClient,
  params: {
    bankCode: string;
    uf?: string | null;
    competence?: string | null;
    version?: string | null;
    sourceFilename?: string | null;
    sourceOrigin?: string | null;
    rows: Array<{
      code: string;
      description: string;
      unit?: string;
      reference_price: number;
      item_type?: string;
    }>;
    userId?: string | null;
  },
): Promise<{ importId: string; rowsOk: number; rowsError: number }> {
  const bankCode = String(params.bankCode || '').trim().toUpperCase();
  if (!bankCode) throw new Error('Banco é obrigatório.');

  const { data: dbRow } = await supabase
    .from('master_topography_price_databases')
    .select('id')
    .eq('code', bankCode)
    .maybeSingle();

  const { data: imp, error: impErr } = await supabase
    .from('master_topography_price_imports')
    .insert({
      database_id: dbRow?.id ?? null,
      bank_code: bankCode,
      uf: params.uf ?? null,
      competence: params.competence ?? null,
      version: params.version ?? null,
      source_filename: params.sourceFilename ?? null,
      source_origin: params.sourceOrigin ?? 'MANUAL_UPLOAD',
      status: 'PROCESSING',
      rows_total: params.rows.length,
      imported_by: params.userId ?? null,
    })
    .select('id')
    .single();

  if (impErr || !imp) throw new Error(impErr?.message || 'Falha ao registrar importação.');

  let rowsOk = 0;
  let rowsError = 0;
  const now = new Date().toISOString();
  const chunkSize = 200;

  for (let i = 0; i < params.rows.length; i += chunkSize) {
    const chunk = params.rows.slice(i, i + chunkSize);
    const payload = chunk
      .map((row) => {
        const code = String(row.code || '').trim();
        const description = String(row.description || '').trim();
        const reference_price = Number(row.reference_price);
        if (!code || !description || !Number.isFinite(reference_price) || reference_price < 0) {
          rowsError += 1;
          return null;
        }
        rowsOk += 1;
        return {
          database_id: dbRow?.id ?? null,
          bank_code: bankCode,
          uf: params.uf ?? null,
          competence: params.competence ?? null,
          code,
          description,
          unit: row.unit || 'UN',
          reference_price,
          origin: params.sourceOrigin ?? 'MANUAL_UPLOAD',
          item_type: row.item_type || 'COMPOSICAO',
          version: params.version ?? null,
          import_id: String(imp.id),
          updated_at: now,
        };
      })
      .filter(Boolean);

    if (payload.length) {
      const { error } = await supabase.from('master_topography_price_items').insert(payload);
      if (error) {
        rowsError += payload.length;
        rowsOk = Math.max(0, rowsOk - payload.length);
      }
    }
  }

  await supabase
    .from('master_topography_price_imports')
    .update({
      status: rowsError && !rowsOk ? 'FAILED' : 'COMPLETED',
      rows_ok: rowsOk,
      rows_error: rowsError,
      completed_at: now,
      error_log: rowsError ? `${rowsError} linha(s) com erro` : null,
    })
    .eq('id', imp.id);

  searchCache.clear();

  return { importId: String(imp.id), rowsOk, rowsError };
}
