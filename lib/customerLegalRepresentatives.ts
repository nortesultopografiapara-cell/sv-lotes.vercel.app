import type { SupabaseClient } from '@supabase/supabase-js';
import { onlyDigits } from '@/lib/inputMasks';
import type { BuyerRepresentativeInput } from '@/lib/buyerLegalEntity';

function isMissingRelation(message: string): boolean {
  return /relation|schema cache|does not exist|Could not find the table/i.test(message);
}

/** Cadastro reutilizável. Falha silenciosa se a tabela ainda não existir no banco. */
export async function syncCustomerLegalRepresentatives(
  supabase: SupabaseClient,
  input: {
    companyId?: string | null;
    customerId?: string | null;
    representatives?: BuyerRepresentativeInput[] | null;
  },
): Promise<void> {
  const companyId = String(input.companyId || '').trim();
  const customerId = String(input.customerId || '').trim();
  if (!companyId || !customerId) return;

  const deleted = await supabase
    .from('customer_legal_representatives')
    .delete()
    .eq('customer_id', customerId)
    .eq('company_id', companyId);
  if (deleted.error) {
    if (!isMissingRelation(deleted.error.message || '')) {
      console.warn('CUSTOMER_LEGAL_REPRESENTATIVES_SYNC', deleted.error.message);
    }
    return;
  }

  const rows = (input.representatives || [])
    .filter((rep) => String(rep.full_name || '').trim() && onlyDigits(rep.cpf).length === 11)
    .map((rep) => ({
      company_id: companyId,
      tenant_id: companyId,
      customer_id: customerId,
      full_name: String(rep.full_name).trim(),
      cpf: String(rep.cpf || '').trim(),
      cpf_digits: onlyDigits(rep.cpf),
      rg: rep.rg || null,
      rg_issuer: rep.rg_issuer || null,
      rg_issuer_state: rep.rg_issuer_state || null,
      nationality: rep.nationality || null,
      marital_status: rep.marital_status || null,
      profession: rep.profession || null,
      role_title: rep.role_title || null,
      phone: rep.phone || null,
      email: rep.email || null,
      representation_document: rep.representation_document || null,
      signs: rep.signs !== false,
    }));

  if (rows.length === 0) return;
  const inserted = await supabase.from('customer_legal_representatives').insert(rows);
  if (inserted.error && !isMissingRelation(inserted.error.message || '')) {
    console.warn('CUSTOMER_LEGAL_REPRESENTATIVES_SYNC', inserted.error.message);
  }
}
