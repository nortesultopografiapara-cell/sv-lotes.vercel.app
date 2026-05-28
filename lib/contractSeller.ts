/**
 * Normalização dos dados da empresa vendedora para contratos (HTML/PDF).
 */

export type NormalizedSeller = {
  name: string;
  razaoSocial: string;
  cnpj: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  representative: string;
  representativeCpf: string;
  logoUrl: string;
  signatureUrl: string;
};

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && !Number.isNaN(v)) return String(v);
  }
  return '';
}

function orNotInformed(value: string): string {
  return value.trim() || 'Não informado';
}

export function normalizeSellerFromCompany(
  company: Record<string, unknown> | null | undefined,
): NormalizedSeller {
  const c = company && typeof company === 'object' ? company : {};

  const name = pickString(c.fantasy_name, c.name);
  const razaoSocial = pickString(c.razao_social, c.fantasy_name, c.name);
  const cnpj = pickString(c.cnpj, c.document);
  const address = pickString(c.address, c.endereco);
  const city = pickString(c.city, c.cidade);
  const state = pickString(c.state, c.uf);
  const zip = pickString(c.zip_code, c.cep);
  const phone = pickString(c.phone);
  const email = pickString(c.email);
  const representative = pickString(
    c.legal_representative,
    c.responsible_name,
  );
  const representativeCpf = pickString(
    c.representative_cpf,
    c.responsible_cpf,
  );
  const logoUrl = pickString(c.logo_url) || '/logo-sv-lotes.png';
  const signatureUrl = pickString(c.signature_url);

  return {
    name: orNotInformed(name),
    razaoSocial: orNotInformed(razaoSocial),
    cnpj: orNotInformed(cnpj),
    address: orNotInformed(address),
    city: orNotInformed(city),
    state: orNotInformed(state),
    zip: orNotInformed(zip),
    phone: orNotInformed(phone),
    email: orNotInformed(email),
    representative: orNotInformed(representative),
    representativeCpf: orNotInformed(representativeCpf),
    logoUrl,
    signatureUrl,
  };
}

/**
 * Texto padrão do contrato (ex.: 000000014/2026):
 * "Empresa Constituída e Instalada na Rua..., Cidade - UF."
 */
export function formatClassicSellerInstallationText(
  seller: NormalizedSeller,
): string {
  return `Empresa Constituída e Instalada na ${seller.address}, ${seller.city} - ${seller.state}.`;
}

/** @deprecated Use formatClassicSellerInstallationText */
export function formatSellerInstallationClause(seller: NormalizedSeller): string {
  return formatClassicSellerInstallationText(seller);
}
