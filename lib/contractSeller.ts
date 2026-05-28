/**
 * Normalização dos dados da empresa vendedora para contratos (HTML/PDF).
 * Sem fallbacks de outra empresa ou assets estáticos da plataforma.
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

const COMPANY_FIELD_MAP: Array<{
  label: string;
  keys: string[];
}> = [
  { label: 'Nome Fantasia', keys: ['fantasy_name', 'name'] },
  { label: 'Razão Social', keys: ['razao_social', 'name', 'fantasy_name'] },
  { label: 'CNPJ', keys: ['cnpj', 'document'] },
  { label: 'Endereço Completo', keys: ['address', 'endereco'] },
  { label: 'Cidade', keys: ['city', 'cidade'] },
  { label: 'UF', keys: ['state', 'uf'] },
  { label: 'CEP', keys: ['zip_code', 'cep'] },
  { label: 'Nome do Responsável Legal', keys: ['legal_representative', 'responsible_name'] },
  { label: 'CPF do Responsável', keys: ['representative_cpf', 'responsible_cpf'] },
  { label: 'Logo', keys: ['logo_url'] },
  { label: 'Assinatura', keys: ['signature_url'] },
];

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

/** Lista campos ausentes no cadastro da empresa (somente log, não bloqueia regeneração). */
export function auditMissingCompanyFields(
  company: Record<string, unknown> | null | undefined,
): string[] {
  const c = company && typeof company === 'object' ? company : {};
  const missing: string[] = [];

  for (const field of COMPANY_FIELD_MAP) {
    const value = pickString(...field.keys.map((k) => c[k]));
    if (!value) {
      missing.push(field.label);
      console.warn('REGENERATE_COMPANY_FIELD_MISSING', field.label);
    }
  }

  return missing;
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
  const logoUrl = pickString(c.logo_url);
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
 * Texto padrão do contrato:
 * "Empresa Constituída e Instalada na {endereço}, {cidade} - {UF}."
 */
function displaySellerField(value: string): string {
  const v = value.trim();
  if (!v || v === 'Não informado') return '';
  return v;
}

export function formatClassicSellerInstallationText(
  seller: NormalizedSeller,
): string {
  const address = displaySellerField(seller.address);
  const city = displaySellerField(seller.city);
  const state = displaySellerField(seller.state);

  const locationParts: string[] = [];
  if (address) locationParts.push(address);
  if (city && state) locationParts.push(`${city} - ${state}`);
  else if (city) locationParts.push(city);
  else if (state) locationParts.push(state);

  if (locationParts.length === 0) {
    return 'Empresa Constituída e Instalada (endereço não cadastrado na empresa).';
  }

  return `Empresa Constituída e Instalada na ${locationParts.join(', ')}.`;
}

export function formatSellerInstallationClause(seller: NormalizedSeller): string {
  return formatClassicSellerInstallationText(seller);
}
