import {
  listMundoNovoSellerPartiesFromProject,
} from '@/lib/mundoNovoContractSellers';

export type ProjectModalMode = 'create' | 'edit';

export type ProjectFormInitialData = {
  name: string;
  city: string;
  state: string;
  neighborhood: string;
  address: string;
  contract_city: string;
  financial_account_id: string;
  /** Vazio = herdar modelo padrão da empresa. */
  contract_model: string;
  /** Contatos e-sign dos promitentes (Mundo Novo). */
  seller_party_contacts: Array<{
    order: number;
    name: string;
    email: string;
    phone: string;
  }>;
};

export const EMPTY_PROJECT_FORM: ProjectFormInitialData = {
  name: '',
  city: '',
  state: '',
  neighborhood: '',
  address: '',
  contract_city: '',
  financial_account_id: '',
  contract_model: '',
  seller_party_contacts: [],
};

/** Converte registro do Supabase para o formulário unificado (criar/editar). */
export function projectToFormInitialData(
  project: Record<string, unknown>,
): ProjectFormInitialData {
  let city = String(project.city || '').trim();
  let state = String(project.uf || project.state || '').trim().toUpperCase();
  const location = String(project.location || '').trim();

  if ((!city || !state) && location.includes('-')) {
    const parts = location.split('-').map((s) => s.trim());
    if (parts.length >= 2) {
      const maybeState = parts[parts.length - 1].slice(0, 2).toUpperCase();
      if (maybeState.length === 2) {
        state = state || maybeState;
        city = city || parts.slice(0, -1).join(' - ').trim();
      }
    }
  }

  const contractCity = String(
    project.forum_city || project.contract_city || city || '',
  ).trim();

  const seller_party_contacts = listMundoNovoSellerPartiesFromProject(project).map(
    (seller) => ({
      order: seller.order,
      name: seller.name,
      email: String(seller.email || '').trim(),
      phone: String(seller.phone || '').trim(),
    }),
  );

  return {
    name: String(project.name || '').trim(),
    city,
    state,
    neighborhood: String(project.neighborhood || '').trim(),
    address: String(
      project.address || project.address_reference || '',
    ).trim(),
    contract_city: contractCity,
    financial_account_id: String(project.financial_account_id || '').trim(),
    contract_model: String(project.contract_model || '').trim(),
    seller_party_contacts,
  };
}
