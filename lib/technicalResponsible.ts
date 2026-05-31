/**
 * Responsável técnico da empresa — fonte única para prancha, memorial, relatórios e documentos.
 */

export type TechnicalResponsibleProfile = {
  id?: string | null;
  name: string;
  title: string;
  crea: string;
  cau: string;
  cft: string;
  cpf: string;
  phone: string;
  email: string;
  signature_url: string;
  stamp_url: string;
  /** Legado: registry_type + registry_number */
  registry_type?: string | null;
  registry_number?: string | null;
};

export const EMPTY_TECHNICAL_PROFILE: TechnicalResponsibleProfile = {
  name: "",
  title: "",
  crea: "",
  cau: "",
  cft: "",
  cpf: "",
  phone: "",
  email: "",
  signature_url: "",
  stamp_url: "",
};

/** Perfil do RT a partir dos campos em `companies` (fonte oficial da prancha). */
export function normalizeTechnicalResponsibleFromCompany(
  company: Record<string, unknown> | null | undefined,
): TechnicalResponsibleProfile {
  if (!company || typeof company !== "object") {
    return { ...EMPTY_TECHNICAL_PROFILE };
  }
  return normalizeTechnicalResponsible({
    name: company.technical_responsible_name,
    title: company.technical_responsible_role,
    crea: company.technical_responsible_crea,
    cau: company.technical_responsible_cau,
    cft: company.technical_responsible_cft,
    cpf: company.technical_responsible_cpf,
    phone: company.technical_responsible_phone,
    email: company.technical_responsible_email,
    signature_url: company.technical_signature_url,
    stamp_url: company.technical_stamp_url,
  });
}

export function normalizeTechnicalResponsible(
  row: Record<string, unknown> | null | undefined,
): TechnicalResponsibleProfile {
  if (!row || typeof row !== "object") {
    return { ...EMPTY_TECHNICAL_PROFILE };
  }

  const registryType = String(row.registry_type || "").trim().toUpperCase();
  const registryNumber = String(row.registry_number || "").trim();

  let crea = String(row.crea || "").trim();
  let cau = String(row.cau || "").trim();
  let cft = String(row.cft || "").trim();

  if (!crea && registryType === "CREA" && registryNumber) crea = registryNumber;
  if (!cau && registryType === "CAU" && registryNumber) cau = registryNumber;
  if (!cft && registryType === "CFT" && registryNumber) cft = registryNumber;

  return {
    id: (row.id as string) || null,
    name: String(row.name || "").trim(),
    title: String(row.title || "").trim(),
    crea,
    cau,
    cft,
    cpf: String(row.cpf || "").trim(),
    phone: String(row.phone || "").trim(),
    email: String(row.email || "").trim(),
    signature_url: String(row.signature_url || "").trim(),
    stamp_url: String(row.stamp_url || "").trim(),
    registry_type: row.registry_type as string | null,
    registry_number: row.registry_number as string | null,
  };
}

/** Linha "CREA/CFT/CAU" para prancha e documentos. */
export function formatTechnicalRegistryLine(
  tech: TechnicalResponsibleProfile,
): string {
  const parts: string[] = [];
  if (tech.crea) parts.push(`CREA: ${tech.crea}`);
  if (tech.cft) parts.push(`CFT: ${tech.cft}`);
  if (tech.cau) parts.push(`CAU: ${tech.cau}`);
  return parts.join(" · ") || "—";
}

export function hasTechnicalResponsible(
  tech: TechnicalResponsibleProfile | null | undefined,
): boolean {
  if (!tech) return false;
  return Boolean(
    tech.name.trim() ||
      tech.crea ||
      tech.cft ||
      tech.cau ||
      tech.title.trim(),
  );
}

/** Bloco HTML para memorial (implantação futura). */
export function formatMemorialTechnicalBlock(
  tech: TechnicalResponsibleProfile | null | undefined,
): string {
  if (!hasTechnicalResponsible(tech)) {
    return "<p><strong>Responsável Técnico:</strong> Não informado</p>";
  }
  const t = tech!;
  const reg = formatTechnicalRegistryLine(t);
  return [
    "<p><strong>Responsável Técnico</strong></p>",
    `<p>Nome: ${t.name || "—"}</p>`,
    `<p>Cargo/Função: ${t.title || "—"}</p>`,
    `<p>${reg}</p>`,
    t.cpf ? `<p>CPF: ${t.cpf}</p>` : "",
    t.phone ? `<p>Telefone: ${t.phone}</p>` : "",
    t.email ? `<p>E-mail: ${t.email}</p>` : "",
  ]
    .filter(Boolean)
    .join("");
}
