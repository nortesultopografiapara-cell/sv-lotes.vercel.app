import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MasterTopographyClient,
  MasterTopographyClientInput,
  MasterTopographyClientListFilters,
} from './clientTypes';
import {
  formatDocumentDisplay,
  normalizeDocumentDigits,
  normalizeEmail,
  normalizePhoneDigits,
} from './clientValidation';

const SELECT_COLUMNS = `
  id, name, document, document_normalized, phone, phone_normalized, email, email_normalized,
  contact_name, address, city, state, notes, is_archived, created_by, created_at, updated_at
`
  .replace(/\s+/g, ' ')
  .trim();

function parseRow(row: Record<string, unknown>): MasterTopographyClient {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    document: row.document ? String(row.document) : null,
    document_normalized: row.document_normalized ? String(row.document_normalized) : null,
    phone: row.phone ? String(row.phone) : null,
    phone_normalized: row.phone_normalized ? String(row.phone_normalized) : null,
    email: row.email ? String(row.email) : null,
    email_normalized: row.email_normalized ? String(row.email_normalized) : null,
    contact_name: row.contact_name ? String(row.contact_name) : null,
    address: row.address ? String(row.address) : null,
    city: row.city ? String(row.city) : null,
    state: row.state ? String(row.state) : null,
    notes: row.notes ? String(row.notes) : null,
    is_archived: Boolean(row.is_archived),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

export async function getTopographyClientById(
  supabase: SupabaseClient,
  id: string,
): Promise<MasterTopographyClient | null> {
  const { data, error } = await supabase
    .from('master_topography_clients')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Falha ao carregar cliente.');
  if (!data) return null;
  return parseRow(data as Record<string, unknown>);
}

export async function findTopographyClientByDocument(
  supabase: SupabaseClient,
  documentNormalized: string,
): Promise<MasterTopographyClient | null> {
  const { data, error } = await supabase
    .from('master_topography_clients')
    .select(SELECT_COLUMNS)
    .eq('document_normalized', documentNormalized)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Falha ao buscar CPF/CNPJ.');
  if (!data) return null;
  return parseRow(data as Record<string, unknown>);
}

export async function findTopographyClientDuplicates(
  supabase: SupabaseClient,
  opts: {
    documentNormalized?: string | null;
    phoneNormalized?: string | null;
    emailNormalized?: string | null;
  },
): Promise<MasterTopographyClient | null> {
  if (opts.documentNormalized) {
    const byDoc = await findTopographyClientByDocument(supabase, opts.documentNormalized);
    if (byDoc) return byDoc;
  }
  if (opts.emailNormalized) {
    const { data, error } = await supabase
      .from('master_topography_clients')
      .select(SELECT_COLUMNS)
      .eq('email_normalized', opts.emailNormalized)
      .eq('is_archived', false)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message || 'Falha ao buscar e-mail.');
    if (data) return parseRow(data as Record<string, unknown>);
  }
  if (opts.phoneNormalized && opts.phoneNormalized.length >= 10) {
    const { data, error } = await supabase
      .from('master_topography_clients')
      .select(SELECT_COLUMNS)
      .eq('phone_normalized', opts.phoneNormalized)
      .eq('is_archived', false)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message || 'Falha ao buscar telefone.');
    if (data) return parseRow(data as Record<string, unknown>);
  }
  return null;
}

export async function listTopographyClients(
  supabase: SupabaseClient,
  filters: MasterTopographyClientListFilters = {},
): Promise<{ clients: MasterTopographyClient[]; total: number }> {
  const limit = Math.min(50, Math.max(1, Math.trunc(filters.limit || 20)));
  let query = supabase
    .from('master_topography_clients')
    .select(SELECT_COLUMNS, { count: 'exact' })
    .order('name', { ascending: true })
    .limit(limit);

  if (!filters.includeArchived) {
    query = query.eq('is_archived', false);
  }

  const q = String(filters.q || '').trim();
  if (q) {
    const digits = q.replace(/\D/g, '');
    const escaped = q.replace(/[%_,]/g, '');
    const parts = [
      `name.ilike.%${escaped}%`,
      `document.ilike.%${escaped}%`,
      `phone.ilike.%${escaped}%`,
      `email.ilike.%${escaped}%`,
      `contact_name.ilike.%${escaped}%`,
    ];
    if (digits.length >= 3) {
      parts.push(`document_normalized.ilike.%${digits}%`);
      parts.push(`phone_normalized.ilike.%${digits}%`);
    }
    query = query.or(parts.join(','));
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message || 'Falha ao listar clientes.');
  return {
    clients: (data || []).map((row) => parseRow(row as Record<string, unknown>)),
    total: count ?? 0,
  };
}

export class TopographyClientDuplicateError extends Error {
  existing: MasterTopographyClient;
  constructor(message: string, existing: MasterTopographyClient) {
    super(message);
    this.name = 'TopographyClientDuplicateError';
    this.existing = existing;
  }
}

export async function createTopographyClient(
  supabase: SupabaseClient,
  input: MasterTopographyClientInput & {
    document_normalized?: string | null;
    phone_normalized?: string | null;
    email_normalized?: string | null;
  },
  createdBy: string | null,
): Promise<MasterTopographyClient> {
  const document_normalized =
    input.document_normalized ?? normalizeDocumentDigits(input.document);
  const phone_normalized = input.phone_normalized ?? normalizePhoneDigits(input.phone);
  const email_normalized = input.email_normalized ?? normalizeEmail(input.email);

  const dup = await findTopographyClientDuplicates(supabase, {
    documentNormalized: document_normalized,
    phoneNormalized: phone_normalized,
    emailNormalized: email_normalized,
  });
  if (dup) {
    const reason = document_normalized && dup.document_normalized === document_normalized
      ? 'CPF/CNPJ já cadastrado'
      : email_normalized && dup.email_normalized === email_normalized
        ? 'E-mail já cadastrado'
        : 'Telefone já cadastrado';
    throw new TopographyClientDuplicateError(
      `${reason}. Selecione o cliente existente.`,
      dup,
    );
  }

  const payload = {
    name: input.name,
    document: formatDocumentDisplay(document_normalized, input.document),
    document_normalized,
    phone: input.phone ?? null,
    phone_normalized,
    email: input.email ?? null,
    email_normalized,
    contact_name: input.contact_name ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    notes: input.notes ?? null,
    created_by: createdBy,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('master_topography_clients')
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') {
      const again = document_normalized
        ? await findTopographyClientByDocument(supabase, document_normalized)
        : null;
      if (again) {
        throw new TopographyClientDuplicateError(
          'CPF/CNPJ já cadastrado. Selecione o cliente existente.',
          again,
        );
      }
    }
    throw new Error(error.message || 'Falha ao cadastrar cliente.');
  }
  return parseRow(data as Record<string, unknown>);
}
