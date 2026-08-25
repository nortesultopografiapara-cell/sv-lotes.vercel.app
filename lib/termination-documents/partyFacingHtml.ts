/**
 * Redação jurídica amigável no PDF destinado às partes.
 * Não altera o snapshot/auditoria (policyVersion permanece interno).
 */

const TECHNICAL_POLICY_RE = /araguaia\.clause3\.item8\.v1/gi;

export function partyFacingClauseReference(
  clauseReference?: string | null,
): string {
  const clause = String(clauseReference || '').trim();
  return clause || 'Cláusula 3 — itens 6 a 9';
}

export function partyFacingPolicyWording(input: {
  contractNumber?: string | null;
  clauseReference?: string | null;
}): string {
  const contract = String(input.contractNumber || '').trim() || 'original da aquisição';
  const clause = partyFacingClauseReference(input.clauseReference);
  return `conforme o contrato original ${contract} e ${clause}`;
}

/** Overlay de apresentação: remove versionamento técnico sem recalcular o acerto. */
export function toPartyFacingTerminationHtml(
  html: string,
  input: {
    contractNumber?: string | null;
    clauseReference?: string | null;
  },
): string {
  const wording = partyFacingPolicyWording(input);
  let out = String(html || '');
  out = out.replace(TECHNICAL_POLICY_RE, clauseFriendlyFallback(input.clauseReference));
  out = out.replace(
    /conforme a política congelada na venda\s*\([^)]*\)/gi,
    wording,
  );
  out = out.replace(
    /política contratual congelada\s*\([^)]*\)/gi,
    `disposições contratuais do contrato original (${clauseFriendlyFallback(input.clauseReference)})`,
  );
  out = out.replace(
    /e a política congelada na venda/gi,
    `e ${clauseFriendlyFallback(input.clauseReference)} do contrato original`,
  );
  out = out.replace(
    /sem alterar a política contratual congelada/gi,
    `sem alterar as disposições do contrato original (${clauseFriendlyFallback(input.clauseReference)})`,
  );
  return out;
}

function clauseFriendlyFallback(clauseReference?: string | null): string {
  return partyFacingClauseReference(clauseReference);
}
