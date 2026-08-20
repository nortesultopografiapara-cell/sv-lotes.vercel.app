/**
 * Vendedores (promitentes) por empreendimento — usado pelo modelo ARAGUAIA.
 * Estrutura pronta para Mundo Novo no futuro (outro projeto, mesmos campos).
 *
 * Sem migration remota nesta fase: lê `projects.seller_parties_json` se existir;
 * senão, fallback apenas quando contract_model = ARAGUAIA.
 */

import { formatCpfCnpj } from '@/lib/inputMasks';

export type ProjectContractSellerParty = {
  role: 'PROMITENTE_VENDEDOR';
  order: number;
  name: string;
  nationality?: string | null;
  maritalStatus?: string | null;
  profession?: string | null;
  rg?: string | null;
  cpf?: string | null;
  address?: string | null;
};

/** Endereço comum dos promitentes / interveniente — modelo ARAGUAIA (fixo original). */
export const ARAGUAIA_SELLERS_ADDRESS =
  'Avenida dos Ipês, S/N – QD 31 LT 13 – Cidade Jardim – Parauapebas – PA';

/** Defaults do Chacreamento Araguaia — não usar em outros modelos. */
export const ARAGUAIA_DEFAULT_SELLERS: ProjectContractSellerParty[] = [
  {
    role: 'PROMITENTE_VENDEDOR',
    order: 1,
    name: 'Daniel Roberto Rivelino de Sousa',
    nationality: 'brasileiro',
    maritalStatus: 'casado',
    profession: 'produtor rural',
    rg: '4606073-PC/PA',
    cpf: '820.912.262-20',
    address: ARAGUAIA_SELLERS_ADDRESS,
  },
  {
    role: 'PROMITENTE_VENDEDOR',
    order: 2,
    name: 'Aldenise Alves Sousa',
    nationality: 'brasileira',
    maritalStatus: 'casada',
    profession: 'funcionária pública municipal',
    rg: '5279360-PC/PA',
    cpf: '856.560.112-91',
    address: ARAGUAIA_SELLERS_ADDRESS,
  },
];

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
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

/**
 * Resolve promitentes vendedores do empreendimento.
 * Isolado: fallback Araguaia só quando model === 'ARAGUAIA'.
 */
export function resolveProjectContractSellers(input: {
  project?: Record<string, unknown> | null;
  contractModel?: string | null;
}): ProjectContractSellerParty[] {
  const fromProject = parseSellerPartiesJson(
    input.project?.seller_parties_json ?? input.project?.seller_parties,
  );
  if (fromProject.length > 0) return fromProject;

  const model = String(input.contractModel || '')
    .trim()
    .toUpperCase();
  if (model === 'ARAGUAIA' || model.includes('ARAGUAIA')) {
    return ARAGUAIA_DEFAULT_SELLERS.map((s) => ({ ...s }));
  }
  return [];
}

export function formatSellerCpfDisplay(cpf?: string | null): string {
  const raw = clean(cpf);
  if (!raw) return '';
  return formatCpfCnpj(raw) || raw;
}
