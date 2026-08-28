/**
 * PROMITENTES VENDEDORES do MUNDO_NOVO — somente projects.seller_parties_json.
 * Fail closed: nunca cai no Representante Legal, second vendor ou defaults ARAGUAIA.
 */

import { formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';
import { MUNDO_NOVO_MISSING_SELLERS_MESSAGE } from '@/lib/mundoNovoContractConstants';
import type { ProjectContractSellerParty } from '@/lib/projectContractSellers';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function parseSellerPartiesJson(raw: unknown): ProjectContractSellerParty[] {
  if (raw == null || raw === '') return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const out: ProjectContractSellerParty[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name = clean(r.name || r.nome);
    if (!name) continue;
    out.push({
      role: 'PROMITENTE_VENDEDOR',
      order: Number(r.order) || out.length + 1,
      name,
      nationality: clean(r.nationality || r.nacionalidade) || null,
      maritalStatus: clean(r.maritalStatus || r.marital_status || r.estado_civil) || null,
      profession: clean(r.profession || r.profissao) || null,
      rg: clean(r.rg) || null,
      cpf: clean(r.cpf || r.document) || null,
      address: clean(r.address || r.endereco) || null,
      email: clean(r.email || r.e_mail || r.mail) || undefined,
      phone: clean(r.phone || r.telefone || r.whatsapp) || undefined,
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

function isCompleteSeller(seller: ProjectContractSellerParty): boolean {
  const cpfDigits = onlyDigits(seller.cpf || '');
  return Boolean(clean(seller.name) && cpfDigits.length >= 11);
}

export function resolveMundoNovoPromitenteVendors(input: {
  project?: Record<string, unknown> | null;
}): ProjectContractSellerParty[] {
  const sellers = parseSellerPartiesJson(
    input.project?.seller_parties_json ?? input.project?.seller_parties,
  ).filter(isCompleteSeller);
  if (sellers.length < 2) {
    throw new Error(MUNDO_NOVO_MISSING_SELLERS_MESSAGE);
  }
  return sellers;
}

export function formatMundoNovoSellerCpfDisplay(cpf?: string | null): string {
  const raw = clean(cpf);
  if (!raw) return '';
  return formatCpfCnpj(raw) || raw;
}

export type MundoNovoSellerPartyContactPatch = {
  order?: number;
  name?: string;
  email?: string | null;
  phone?: string | null;
};

/** Lista vendedores do JSON sem exigir e-mail/telefone (UI do empreendimento). */
export function listMundoNovoSellerPartiesFromProject(
  project?: Record<string, unknown> | null,
): ProjectContractSellerParty[] {
  return parseSellerPartiesJson(
    project?.seller_parties_json ?? project?.seller_parties,
  );
}

/**
 * Atualiza somente e-mail/telefone dos promitentes já cadastrados.
 * Não cria, remove nem altera nome/CPF (contratos históricos intactos).
 */
export function mergeMundoNovoSellerPartyContacts(
  existingJson: unknown,
  contacts: MundoNovoSellerPartyContactPatch[] | null | undefined,
): ProjectContractSellerParty[] {
  const existing = parseSellerPartiesJson(existingJson);
  if (existing.length === 0) return existing;
  const patches = Array.isArray(contacts) ? contacts : [];

  return existing.map((seller) => {
    const byOrder = patches.find(
      (c) => Number(c.order) > 0 && Number(c.order) === seller.order,
    );
    const byName = patches.find(
      (c) =>
        clean(c.name).toLowerCase() === clean(seller.name).toLowerCase(),
    );
    const patch = byOrder || byName;
    if (!patch) return seller;
    return {
      ...seller,
      email: clean(patch.email) || undefined,
      phone: clean(patch.phone) || undefined,
    };
  });
}
